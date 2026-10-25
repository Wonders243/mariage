import {
  callWeddingFunction,
  isSameOriginNodeRequest,
  issueAccessCookie,
  nodeRequestIsSecure,
  noStore,
  normalizeInvitationCode,
  supabasePublicConfig,
} from '../lib/site-access.js';

function readBody(request) {
  if (request.body && typeof request.body === 'object' && !Buffer.isBuffer(request.body)) return request.body;
  try {
    return JSON.parse(Buffer.isBuffer(request.body) ? request.body.toString('utf8') : String(request.body || ''));
  } catch {
    return null;
  }
}

function fail(response, status, message) {
  return response.status(status).json({ ok: false, message });
}

export default async function handler(request, response) {
  noStore(response);
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (request.method !== 'POST') return fail(response, 405, 'Cette demande n’est pas acceptée.');
  if (!isSameOriginNodeRequest(request)) return fail(response, 403, 'La demande n’a pas pu être vérifiée.');

  const body = readBody(request);
  if (!body || typeof body !== 'object') return fail(response, 400, 'Vérifie les informations saisies.');

  try {
    if (body.mode === 'guest') {
      const code = normalizeInvitationCode(body.code);
      if (!/^[0-9A-HJKMNP-TV-Z]{12}$/.test(code)) {
        return fail(response, 401, 'Ce code ne correspond pas à une invitation. Vérifie le code imprimé sur le faire-part.');
      }

      await callWeddingFunction({ action: 'lookup', code }, request);
      response.setHeader('Set-Cookie', issueAccessCookie({ role: 'guest', invitationCode: code }, {
        secure: nodeRequestIsSecure(request),
      }));
      return response.status(200).json({ ok: true, role: 'guest', redirect: '/' });
    }

    if (body.mode === 'admin') {
      const accessToken = typeof body.accessToken === 'string' ? body.accessToken : '';
      const { url, key } = supabasePublicConfig();
      const adminEmail = (process.env.WEDDING_ADMIN_EMAIL || '').trim().toLowerCase();
      if (!url || !key || !adminEmail || accessToken.length < 20 || accessToken.length > 8192) {
        return fail(response, 503, 'La connexion d’administration n’est pas encore configurée.');
      }

      const userResponse = await fetch(`${url}/auth/v1/user`, {
        headers: { apikey: key, authorization: `Bearer ${accessToken}` },
        cache: 'no-store',
      });
      if (!userResponse.ok) return fail(response, 401, 'La connexion a expiré. Connecte-toi à nouveau.');
      const user = await userResponse.json().catch(() => null);
      if (!user?.email || String(user.email).trim().toLowerCase() !== adminEmail) {
        return fail(response, 403, 'Ce compte ne peut pas ouvrir l’administration de ce site.');
      }

      response.setHeader('Set-Cookie', issueAccessCookie({ role: 'admin' }, {
        secure: nodeRequestIsSecure(request),
      }));
      return response.status(200).json({ ok: true, role: 'admin', redirect: '/admin.html' });
    }

    return fail(response, 400, 'Choisis une méthode d’accès.');
  } catch (error) {
    if (error?.message === 'SITE_ACCESS_SECRET must contain at least 32 characters.'
      || error?.message === 'Supabase public configuration is missing.') {
      return fail(response, 503, 'La connexion au site n’est pas encore configurée.');
    }
    if (error?.message === 'invalid_code') {
      return fail(response, 401, 'Ce code ne correspond pas à une invitation. Vérifie le code imprimé sur le faire-part.');
    }
    if (error?.message === 'rate_limited' || error?.status === 429) {
      return fail(response, 429, 'Trop de tentatives. Réessaie dans quelques minutes.');
    }
    console.error('Site access check failed.');
    return fail(response, 503, 'Le service de connexion ne répond pas pour le moment. Réessaie un peu plus tard.');
  }
}

import {
  callWeddingFunction,
  clearAccessCookie,
  nodeRequestIsSecure,
  noStore,
  readAccessSession,
} from '../lib/site-access.js';

export default async function handler(request, response) {
  noStore(response);
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (request.method !== 'GET') return response.status(405).json({ ok: false });

  const session = readAccessSession(request);
  if (!session) return response.status(401).json({ ok: false, message: 'La session a expiré.' });
  if (session.role === 'admin') return response.status(200).json({ ok: true, role: 'admin' });

  try {
    const data = await callWeddingFunction({ action: 'site_data', code: session.invitationCode }, request);
    return response.status(200).json({ ...data, role: 'guest', code: session.invitationCode });
  } catch (error) {
    if (error?.message === 'invalid_code') {
      response.setHeader('Set-Cookie', clearAccessCookie({ secure: nodeRequestIsSecure(request) }));
      return response.status(401).json({ ok: false, message: 'Cette invitation n’est plus accessible. Saisis à nouveau ton code.' });
    }
    if (error?.message === 'rate_limited' || error?.status === 429) {
      return response.status(429).json({ ok: false, message: 'Trop de demandes. Réessaie dans quelques minutes.' });
    }
    console.error('Wedding site data could not be loaded.');
    return response.status(503).json({ ok: false, message: 'Le site rencontre un problème temporaire. Réessaie dans un instant.' });
  }
}

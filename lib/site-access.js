import { createHmac, timingSafeEqual } from 'node:crypto';

export const ACCESS_COOKIE = 'wedding_access';

const GUEST_CODE_PATTERN = /^(?:[0-9A-HJKMNP-TV-Z]{9}|[0-9A-HJKMNP-TV-Z]{12})$/;
const GUEST_SESSION_SECONDS = 60 * 60 * 24 * 30;
const ADMIN_SESSION_SECONDS = 60 * 60 * 8;

export function normalizeInvitationCode(value) {
  return String(value ?? '').toUpperCase().replace(/[\s-]/g, '');
}

function accessSecret() {
  const secret = process.env.SITE_ACCESS_SECRET || '';
  if (secret.length < 32) throw new Error('SITE_ACCESS_SECRET must contain at least 32 characters.');
  return secret;
}

function sign(payload) {
  return createHmac('sha256', accessSecret()).update(payload).digest('base64url');
}

export function issueAccessCookie(claims, { secure = true } = {}) {
  const maxAge = claims.role === 'admin' ? ADMIN_SESSION_SECONDS : GUEST_SESSION_SECONDS;
  const payload = Buffer.from(JSON.stringify({
    ...claims,
    exp: Math.floor(Date.now() / 1000) + maxAge,
  })).toString('base64url');
  const value = `${payload}.${sign(payload)}`;
  const cookie = `${ACCESS_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
  return secure ? `${cookie}; Secure` : cookie;
}

export function clearAccessCookie({ secure = true } = {}) {
  const cookie = `${ACCESS_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
  return secure ? `${cookie}; Secure` : cookie;
}

export function readAccessSession(request) {
  const cookieHeader = typeof request.headers.get === 'function'
    ? request.headers.get('cookie') || ''
    : request.headers.cookie || '';
  const token = cookieHeader.split(';').map((part) => part.trim())
    .find((part) => part.startsWith(`${ACCESS_COOKIE}=`))?.slice(ACCESS_COOKIE.length + 1);
  if (!token) return null;

  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra) return null;

  let expected;
  try {
    expected = sign(payload);
  } catch {
    return null;
  }
  const providedBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expected);
  if (providedBytes.length !== expectedBytes.length || !timingSafeEqual(providedBytes, expectedBytes)) return null;

  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!claims || claims.exp <= Math.floor(Date.now() / 1000)) return null;
    if (claims.role === 'admin') return { role: 'admin', exp: claims.exp };
    if (claims.role === 'guest' && GUEST_CODE_PATTERN.test(claims.invitationCode || '')) {
      return { role: 'guest', invitationCode: claims.invitationCode, exp: claims.exp };
    }
  } catch {
    return null;
  }

  return null;
}

export function supabasePublicConfig() {
  return {
    url: (process.env.SUPABASE_URL || '').replace(/\/$/, ''),
    key: process.env.SUPABASE_PUBLISHABLE_KEY
      || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
      || process.env.SUPABASE_ANON_KEY
      || '',
  };
}

export async function callWeddingFunction(body, request) {
  const { url, key } = supabasePublicConfig();
  if (!url || !key) throw new Error('Supabase public configuration is missing.');

  const headers = {
    apikey: key,
    authorization: `Bearer ${key}`,
    'content-type': 'application/json',
  };
  const clientIp = request?.headers && typeof request.headers.get === 'function'
    ? request.headers.get('x-real-ip')
    : request?.headers?.['x-real-ip'];
  if (clientIp) headers['x-forwarded-for'] = clientIp;

  const response = await fetch(`${url}/functions/v1/wedding-rsvp`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.ok) {
    const error = new Error(data?.error || 'wedding_function_unavailable');
    error.status = response.status;
    throw error;
  }
  return data;
}

export function noStore(response) {
  response.setHeader('Cache-Control', 'no-store, max-age=0');
  response.setHeader('Pragma', 'no-cache');
  response.setHeader('X-Content-Type-Options', 'nosniff');
}

export function isSameOriginNodeRequest(request) {
  const origin = request.headers.origin;
  const host = request.headers.host;
  if (!origin || !host) return false;
  try {
    const originUrl = new URL(origin);
    return originUrl.host.toLowerCase() === host.toLowerCase()
      && (originUrl.protocol === 'https:' || originUrl.protocol === 'http:');
  } catch {
    return false;
  }
}

export function nodeRequestIsSecure(request) {
  const proto = request.headers['x-forwarded-proto'];
  return (Array.isArray(proto) ? proto[0] : proto)?.split(',')[0]?.trim() === 'https';
}

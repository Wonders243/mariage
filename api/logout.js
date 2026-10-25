import { clearAccessCookie, isSameOriginNodeRequest, nodeRequestIsSecure, noStore } from '../lib/site-access.js';

export default function handler(request, response) {
  noStore(response);
  if (request.method !== 'POST') return response.status(405).json({ ok: false });
  if (!isSameOriginNodeRequest(request)) return response.status(403).json({ ok: false });
  response.setHeader('Set-Cookie', clearAccessCookie({ secure: nodeRequestIsSecure(request) }));
  return response.status(200).json({ ok: true });
}

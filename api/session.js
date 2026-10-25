import { readAccessSession, noStore } from '../lib/site-access.js';

export default function handler(request, response) {
  noStore(response);
  if (request.method !== 'GET') return response.status(405).json({ ok: false });
  const session = readAccessSession(request);
  return response.status(200).json({ ok: true, role: session?.role || null });
}

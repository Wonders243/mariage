import { next } from '@vercel/functions';
import { readAccessSession } from './lib/site-access.js';

export const config = { runtime: 'nodejs' };

const publicAccessFiles = new Set([
  '/access.html',
  '/css/access.css',
  '/js/access.js',
  '/js/supabase-config.js',
  '/js/shared/supabase-client.js',
  '/js/shared/invitation-code.js',
  '/assets/site-mark.svg',
  '/robots.txt',
  '/favicon.ico',
]);

const adminOnlyFiles = new Set([
  '/admin.html',
  '/css/admin.css',
]);

function redirect(location) {
  return new Response(null, {
    status: 303,
    headers: {
      Location: location,
      'Cache-Control': 'no-store, max-age=0',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

export default function proxy(request) {
  const { pathname } = new URL(request.url);

  if (publicAccessFiles.has(pathname)
    || pathname === '/api/access'
    || pathname === '/api/session'
    || pathname === '/api/site-data'
    || pathname === '/api/logout') {
    return next();
  }

  const session = readAccessSession(request);
  if (!session) {
    const adminPath = pathname === '/admin.html' || pathname.startsWith('/js/admin/') || pathname === '/css/admin.css';
    return redirect(adminPath ? '/access.html?mode=admin' : '/access.html');
  }

  const adminOnly = adminOnlyFiles.has(pathname) || pathname.startsWith('/js/admin/');
  if (adminOnly && session.role !== 'admin') return redirect('/access.html?mode=admin');

  if (pathname === '/access.html') {
    return redirect(session.role === 'admin' ? '/admin.html' : '/');
  }

  return next();
}

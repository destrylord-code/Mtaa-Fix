import { NextResponse } from 'next/server';

const TOKEN_KEY = 'crs_admin_access_token';
const PUBLIC_PATHS = ['/login'];

export function proxy(request) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some((path) => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  const token = request.cookies.get(TOKEN_KEY)?.value;

  if (!token) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirectTo', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Guard every app route except static assets and the same-origin API proxy
    // paths (/api/*, /uploads/*, /health). Those are forwarded to the backend by
    // next.config.mjs rewrites and authenticated there, so the page guard must
    // not intercept them (it would redirect /api/auth/login to /login).
    '/((?!_next/static|_next/image|api/|uploads/|health|favicon.ico|icon.png|apple-icon.png|manifest.webmanifest|brand/).*)',
  ],
};

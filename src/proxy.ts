import { NextResponse, type NextRequest } from 'next/server';

// Next.js middleware runs on the Edge runtime — no Node.js crypto.
// We decode the JWT payload (base64) to read the role, but actual
// cryptographic verification happens in the Express backend.

const ADMIN_ROLES = ['admin', 'principal', 'vice_principal', 'controller'];
const STAFF_ROLES = ['staff', 'usthad', 'mentor'];

function decodeTokenRole(tokenValue: string): string | null {
  try {
    const payloadBase64 = tokenValue.split('.')[1];
    if (!payloadBase64) return null;
    const decoded = JSON.parse(atob(payloadBase64));
    return decoded.role || null;
  } catch {
    return null;
  }
}

function getPortalForRole(role: string): string {
  if (ADMIN_ROLES.includes(role)) return '/admin';
  if (STAFF_ROLES.includes(role)) return '/staff';
  if (role === 'parent') return '/parent';
  return '/staff'; // safe default
}

export function proxy(request: NextRequest) {
  const currentPath = request.nextUrl.pathname;
  const token = request.cookies.get('auth_token');
  const role = token?.value ? decodeTokenRole(token.value) : null;

  // ── Logged-in user visits /login or / → send them to their portal ──
  if (currentPath === '/login' || currentPath === '/') {
    if (role) {
      return NextResponse.redirect(new URL(getPortalForRole(role), request.url));
    }
    return NextResponse.next();
  }

  // ── Protected routes: /admin, /staff, /parent ──
  const isProtected =
    currentPath.startsWith('/admin') ||
    currentPath.startsWith('/staff') ||
    currentPath.startsWith('/parent');

  if (!isProtected) return NextResponse.next();

  // No token at all → login
  if (!token?.value || !role) {
    const response = NextResponse.redirect(new URL('/login', request.url));
    if (token?.value) response.cookies.delete('auth_token'); // malformed token
    return response;
  }

  // ── Role-based access ──
  if (currentPath.startsWith('/admin') && !ADMIN_ROLES.includes(role)) {
    // Wrong portal — redirect to their correct portal, NOT to login
    return NextResponse.redirect(new URL(getPortalForRole(role), request.url));
  }
  if (currentPath.startsWith('/staff') && !STAFF_ROLES.includes(role) && !ADMIN_ROLES.includes(role)) {
    return NextResponse.redirect(new URL(getPortalForRole(role), request.url));
  }
  if (currentPath.startsWith('/parent') && role !== 'parent') {
    return NextResponse.redirect(new URL(getPortalForRole(role), request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};

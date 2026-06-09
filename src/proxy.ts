import { NextResponse, type NextRequest } from 'next/server';

// Next.js proxy runs on the Edge runtime, so this is only a UX/router guard.
// API authorization is still enforced cryptographically by the Express backend.

const ADMIN_ROLES = ['admin', 'controller'];
const PRINCIPAL_ROLES = ['principal', 'vice_principal'];
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
  if (PRINCIPAL_ROLES.includes(role)) return '/principal';
  if (STAFF_ROLES.includes(role)) return '/staff';
  if (role === 'parent') return '/parent';
  return '/staff';
}

export function proxy(request: NextRequest) {
  const currentPath = request.nextUrl.pathname;
  const token = request.cookies.get('auth_token');
  const role = token?.value ? decodeTokenRole(token.value) : null;

  if (currentPath === '/login' || currentPath === '/') {
    if (role) {
      return NextResponse.redirect(new URL(getPortalForRole(role), request.url));
    }
    return NextResponse.next();
  }

  const isProtected =
    currentPath.startsWith('/admin') ||
    currentPath.startsWith('/principal') ||
    currentPath.startsWith('/staff') ||
    currentPath.startsWith('/parent');

  if (!isProtected) return NextResponse.next();

  if (!token?.value || !role) {
    const response = NextResponse.redirect(new URL('/login', request.url));
    if (token?.value) response.cookies.delete('auth_token');
    return response;
  }

  if (currentPath.startsWith('/admin') && !ADMIN_ROLES.includes(role)) {
    return NextResponse.redirect(new URL(getPortalForRole(role), request.url));
  }
  if (currentPath.startsWith('/principal') && !PRINCIPAL_ROLES.includes(role)) {
    return NextResponse.redirect(new URL(getPortalForRole(role), request.url));
  }
  if (
    currentPath.startsWith('/staff') &&
    !STAFF_ROLES.includes(role) &&
    !ADMIN_ROLES.includes(role) &&
    !PRINCIPAL_ROLES.includes(role)
  ) {
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

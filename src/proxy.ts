import { NextResponse, type NextRequest } from 'next/server';

// Next.js proxy runs on the Edge runtime, so this is only a UX/router guard.
// API authorization is still enforced cryptographically by the Express backend.

const ADMIN_ROLES = ['admin', 'controller'];
const PRINCIPAL_ROLES = ['principal', 'vice_principal'];
const STAFF_ROLES = ['staff', 'usthad', 'mentor'];
const configuredParentHost = (
  process.env.PARENT_PORTAL_HOST ||
  (process.env.NODE_ENV === 'production' ? 'parents.domain.in' : 'parents.localhost')
).toLowerCase();

function getRequestHost(request: NextRequest): string {
  const rawHost =
    request.headers.get('x-forwarded-host') || request.headers.get('host') || '';
  return rawHost.split(',')[0].trim().split(':')[0].toLowerCase();
}

function isParentPortalHost(host: string): boolean {
  return host === configuredParentHost || host === 'www.' + configuredParentHost;
}

function getParentPortalUrl(request: NextRequest, pathname: string): URL {
  const url = request.nextUrl.clone();
  url.hostname = configuredParentHost;
  url.pathname = pathname;
  url.search = '';
  return url;
}

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

export async function proxy(request: NextRequest) {
  const currentPath = request.nextUrl.pathname;

  // Maintenance mode is controlled from Vercel Edge Config.
  try {
    const { get } = await import('@vercel/edge-config');
    const isInMaintenanceMode = await get<boolean>('isInMaintenanceMode');

    if (isInMaintenanceMode) {
      const allowedPaths = ['/maintenance.html', '/logo.png', '/favicon.ico'];
      if (
        !allowedPaths.includes(currentPath) &&
        !currentPath.startsWith('/_next/') &&
        !currentPath.startsWith('/api/')
      ) {
        const maintenanceUrl = request.nextUrl.clone();
        maintenanceUrl.pathname = '/maintenance.html';
        const response = NextResponse.rewrite(maintenanceUrl);
        response.headers.set('Retry-After', '3600');
        return response;
      }
      return NextResponse.next();
    }
  } catch {
    // Edge Config is optional in local development.
  }

  const token = request.cookies.get('auth_token');
  const role = token?.value ? decodeTokenRole(token.value) : null;
  const parentHost = isParentPortalHost(getRequestHost(request));
  const isInternalParentPath =
    currentPath === '/parent' || currentPath.startsWith('/parent/');

  if (parentHost) {
    if (isInternalParentPath) {
      const canonicalUrl = request.nextUrl.clone();
      const internalPath = currentPath.replace(/^\/parent/, '');
      canonicalUrl.pathname = internalPath || '/home';
      canonicalUrl.search = '';
      return NextResponse.redirect(canonicalUrl);
    }


    if (
      currentPath.startsWith('/admin') ||
      currentPath.startsWith('/staff') ||
      currentPath.startsWith('/principal')
    ) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = '/login';
      loginUrl.search = '';
      return NextResponse.redirect(loginUrl);
    }

    if (currentPath === '/' || currentPath === '/login') {
      if (role === 'parent') {
        const homeUrl = request.nextUrl.clone();
        homeUrl.pathname = '/home';
        homeUrl.search = '';
        return NextResponse.redirect(homeUrl);
      }

      const response = NextResponse.rewrite(
        new URL('/parent/login', request.url)
      );
      if (token?.value) response.cookies.delete('auth_token');
      return response;
    }

    if (currentPath === '/home') {
      if (!token?.value || role !== 'parent') {
        const loginUrl = request.nextUrl.clone();
        loginUrl.pathname = '/login';
        loginUrl.search = '';
        const response = NextResponse.redirect(loginUrl);
        if (token?.value) response.cookies.delete('auth_token');
        return response;
      }

      return NextResponse.rewrite(new URL('/parent', request.url));
    }

    if (!token?.value || role !== 'parent') {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = '/login';
      loginUrl.search = '';
      return NextResponse.redirect(loginUrl);
    }

    return NextResponse.next();
  }

  if (isInternalParentPath) {
    if (role === 'parent') {
      return NextResponse.redirect(getParentPortalUrl(request, '/home'));
    }

    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.search = '';
    return NextResponse.redirect(loginUrl);
  }

  if (currentPath === '/login' || currentPath === '/') {
    if (role) {
      if (role === 'parent') {
        return NextResponse.redirect(getParentPortalUrl(request, '/home'));
      }
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
    '/((?!_next/static|_next/image|favicon.ico|api|.*\\.(?:svg|png|jpg|jpeg|gif|webp|webmanifest)$).*)',
  ],
};

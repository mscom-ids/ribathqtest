import { NextRequest, NextResponse } from 'next/server';

/**
 * Maintenance Mode Middleware (Vercel Edge Config)
 *
 * Toggle maintenance mode INSTANTLY from the Vercel dashboard:
 *   Dashboard → Storage → Edge Config → set "isInMaintenanceMode" to true/false
 *
 * No redeployment needed!
 */
export async function middleware(request: NextRequest) {
  try {
    // Dynamically import to avoid build errors if not configured
    const { get } = await import('@vercel/edge-config');
    const isInMaintenanceMode = await get<boolean>('isInMaintenanceMode');

    if (!isInMaintenanceMode) {
      return NextResponse.next();
    }

    // Allow the maintenance page itself and static assets to load
    const { pathname } = request.nextUrl;
    const allowedPaths = [
      '/maintenance.html',
      '/logo.png',
      '/favicon.ico',
    ];

    if (
      allowedPaths.includes(pathname) ||
      pathname.startsWith('/_next/') ||
      pathname.startsWith('/api/')
    ) {
      return NextResponse.next();
    }

    // Rewrite every other request to the maintenance page
    const maintenanceUrl = request.nextUrl.clone();
    maintenanceUrl.pathname = '/maintenance.html';

    const response = NextResponse.rewrite(maintenanceUrl);
    response.headers.set('Retry-After', '3600');
    return response;
  } catch {
    // If Edge Config is not set up or errors, let traffic through normally
    return NextResponse.next();
  }
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};

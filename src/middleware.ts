import { NextResponse, type NextRequest } from 'next/server';
// We don't use jsonwebtoken library here because Next.js middleware runs on the Edge runtime 
// which doesn't support the raw crypto modules that jsonwebtoken uses out of the box.
// For the middleware, checking for the existence of the token is usually enough to redirect,
// but the actual API will cryptographically verify the token.

export async function middleware(request: NextRequest) {
  const currentPath = request.nextUrl.pathname;
  
  // Protect /admin, /staff, /parent routes
  const isProtectedRoute = 
    currentPath.startsWith('/admin') || 
    currentPath.startsWith('/staff') || 
    currentPath.startsWith('/parent');

  if (isProtectedRoute) {
    // Check if our custom auth_token cookie exists
    const token = request.cookies.get('auth_token');

    if (!token?.value) {
      // No token found, redirect to login
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      return NextResponse.redirect(url);
    }
    
    try {
        const payloadBase64 = token.value.split('.')[1];
        if (payloadBase64) {
             const decodedPayload = JSON.parse(atob(payloadBase64));
             const userRole = decodedPayload.role;
             
             // Enforce Role-Based Access Control
             if (currentPath.startsWith('/admin') && userRole !== 'admin') {
                 return NextResponse.redirect(new URL('/login', request.url));
             }
             if (currentPath.startsWith('/staff') && userRole !== 'staff' && userRole !== 'admin') {
                 return NextResponse.redirect(new URL('/login', request.url));
             }
             if (currentPath.startsWith('/parent') && userRole !== 'parent') {
                 return NextResponse.redirect(new URL('/login', request.url));
             }
        } else {
             throw new Error("Invalid token format");
        }
    } catch (e) {
        // If the token is malformed, force a re-login
        const url = request.nextUrl.clone();
        url.pathname = '/login';
        // Clear the bad cookie
        const response = NextResponse.redirect(url);
        response.cookies.delete('auth_token');
        return response;
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - api (Next.js API routes if any)
     * Feel free to modify this pattern to include more paths.
     */
    '/((?!_next/static|_next/image|favicon.ico|api|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};

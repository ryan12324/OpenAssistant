import { NextRequest, NextResponse } from "next/server";

// Public routes that don't require authentication
const publicRoutes = ["/sign-in", "/sign-up", "/api/auth"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public routes
  if (publicRoutes.some((route) => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  // Allow health check
  if (pathname === "/api/health") {
    return NextResponse.next();
  }

  // Check for session cookie (Better Auth uses __session or better-auth.session_token)
  const sessionCookie =
    request.cookies.get("better-auth.session_token") ||
    request.cookies.get("__session");

  if (!sessionCookie && !pathname.startsWith("/api/auth")) {
    // Redirect to sign-in for page requests
    if (!pathname.startsWith("/api/")) {
      return NextResponse.redirect(new URL("/sign-in", request.url));
    }
    // Return 401 for API requests
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};

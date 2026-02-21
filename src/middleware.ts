import { NextRequest, NextResponse } from "next/server";

// Note: middleware runs in the Edge runtime so we use a lightweight inline
// logger instead of the full getLogger (which imports Node-only modules).
function logMiddleware(level: string, msg: string, ctx: Record<string, unknown> = {}) {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, module: "middleware", msg, ...ctx });
  if (level === "error") console.error(line);
  else console.log(line);
}

// Public routes that don't require authentication
const PUBLIC_ROUTES = (process.env.PUBLIC_ROUTES ?? "/sign-in,/sign-up,/api/auth").split(",");

// Session cookie names (configurable via env)
const SESSION_COOKIE = process.env.SESSION_COOKIE_NAME ?? "better-auth.session_token";
const SESSION_COOKIE_ALT = process.env.SESSION_COOKIE_NAME_ALT ?? "__session";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const method = request.method;

  // Allow public routes
  if (PUBLIC_ROUTES.some((route) => pathname.startsWith(route))) {
    logMiddleware("debug", "Public route — allowed", { method, pathname });
    return NextResponse.next();
  }

  // Allow health check
  if (pathname === "/api/health") {
    logMiddleware("debug", "Health check — allowed", { method, pathname });
    return NextResponse.next();
  }

  // Check for session cookie (Better Auth uses __session or better-auth.session_token)
  const sessionCookie =
    request.cookies.get(SESSION_COOKIE) ||
    request.cookies.get(SESSION_COOKIE_ALT);

  if (!sessionCookie && !pathname.startsWith("/api/auth")) {
    // Redirect to sign-in for page requests
    if (!pathname.startsWith("/api/")) {
      logMiddleware("warn", "Unauthenticated page request — redirecting to sign-in", { method, pathname });
      return NextResponse.redirect(new URL("/sign-in", request.url));
    }
    // Return 401 for API requests
    logMiddleware("warn", "Unauthenticated API request — 401", { method, pathname });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  logMiddleware("debug", "Request authenticated — passing through", { method, pathname, hasSession: !!sessionCookie });
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

import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/config";

// Edge middleware: cookie-presence gate only. Real session validation runs
// server-side (DB lookup) in route handlers and server components — this is
// just UX routing so unauth users land on /login.
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Always-public paths.
  if (
    pathname.startsWith("/api/auth") ||
    pathname === "/login" ||
    pathname.startsWith("/_next") ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/sw.js" ||
    pathname === "/favicon.ico" ||
    /\.(png|jpe?g|svg|webp|ico|gif|woff2?)$/.test(pathname)
  ) {
    return NextResponse.next();
  }

  const hasSession = !!req.cookies.get(SESSION_COOKIE)?.value;
  if (!hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionCookieName, isAccessProtectionEnabled, isValidSessionToken } from "@/src/server/auth/session";

function isPublicPath(pathname: string) {
  return pathname === "/login" || pathname === "/api/health" || pathname === "/api/auth/login";
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (!isAccessProtectionEnabled() || isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const sessionToken = request.cookies.get(getSessionCookieName())?.value;
  const isAuthorized = await isValidSessionToken(sessionToken);

  if (isAuthorized) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "UNAUTHORIZED", message: "Zaloguj sie, aby korzystac z API." }, { status: 401 });
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", `${pathname}${search}`);

  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)"],
};

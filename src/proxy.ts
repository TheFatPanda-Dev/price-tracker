import { NextResponse, type NextRequest } from "next/server";

const COOKIE = "pt_session";
const PUBLIC = ["/login", "/setup", "/invite"];

// Optimistic check only: the real session validation happens in the app
// (getCurrentUser). Here we bounce cookie-less visitors to /login and keep the
// cookie's browser lifetime sliding.
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(COOKIE)?.value;
  const isPublic = PUBLIC.some((p) => pathname === p || pathname.startsWith(p + "/"));

  if (!token && !isPublic) {
    const url = new URL("/login", request.url);
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  const res = NextResponse.next();
  if (token) {
    res.cookies.set(COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: (process.env.APP_URL || "").startsWith("https://"),
      path: "/",
      maxAge: 30 * 24 * 60 * 60,
    });
  }
  return res;
}

export const config = {
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico|icon|apple-icon|.*\\.(?:png|svg|jpg|ico|webp)$).*)"],
};

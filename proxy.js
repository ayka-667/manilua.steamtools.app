import { auth } from "./auth";

export default auth((req) => {
  const isLoggedIn = Boolean(req.auth);
  const isLoginPage = req.nextUrl.pathname === "/login";

  if (!isLoggedIn && !isLoginPage) {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    return Response.redirect(loginUrl);
  }

  return null;
});

export const config = {
  matcher: ["/((?!api|reports|_next/static|_next/image|favicon.ico).*)"]
};

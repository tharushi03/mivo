import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/auth.config";

// Next.js 16 renamed middleware.ts -> proxy.ts.
const { auth } = NextAuth(authConfig);

// null = any logged-in user.
const rules: [prefix: string, role: "SELLER" | "ADMIN" | null][] = [
  ["/seller", "SELLER"],
  ["/admin", "ADMIN"],
  ["/checkout", null],
  ["/orders", null],
  ["/order", null],
];

export default auth((req) => {
  const path = req.nextUrl.pathname;
  const user = req.auth?.user;
  // /dashboard: send each role to its home with a real 307 (no page render needed).
  if (path === "/dashboard") {
    const home = !user ? "/login" : user.role === "ADMIN" ? "/admin" : user.role === "SELLER" ? "/seller/dashboard" : "/orders";
    return NextResponse.redirect(new URL(home, req.url));
  }

  const rule = rules.find(([prefix]) => path === prefix || path.startsWith(prefix + "/"));

  if (!rule) return NextResponse.next();

  // Not logged in -> login, then come back here.
  if (!user) {
    const url = new URL("/login", req.url);
    url.searchParams.set("callbackUrl", path);
    return NextResponse.redirect(url);
  }

  // Logged in with the wrong role -> send to their own area.
  const [, role] = rule;
  if (role && user.role !== role) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/dashboard", "/seller/:path*", "/admin/:path*", "/checkout", "/orders", "/order/:path*"],
};

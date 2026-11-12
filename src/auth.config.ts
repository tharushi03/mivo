import type { NextAuthConfig } from "next-auth";

// Shared config with no database imports, so the proxy stays lightweight.
// Providers that need the DB are added in src/auth.ts.
export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id!;
        token.role = user.role;
        token.pwdAt = user.pwdAt ?? 0;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.id;
      session.user.role = token.role;
      session.user.pwdAt = token.pwdAt ?? 0;
      return session;
    },
  },
} satisfies NextAuthConfig;

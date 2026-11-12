import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "@/db";
import { users, accounts, sessions, verificationTokens } from "@/db/schema";
import { authConfig } from "@/auth.config";
import { clientIp, loginBlockedFor, recordLoginFailure, recordLoginSuccess } from "@/lib/rate-limit";

/** Thrown when too many wrong passwords were tried; the login form shows a "try later" message. */
export class TooManyAttempts extends CredentialsSignin {
  code = "rate_limited";
}

/** Correct password, but MIVO suspended the account. */
export class AccountSuspended extends CredentialsSignin {
  code = "suspended";
}

// Compared against when the email doesn't exist, so a wrong email takes as long as
// a wrong password (response time doesn't reveal which emails have accounts).
// A fixed bcrypt hash (cost 10) of a random throwaway string; hard-coded because
// hashing at import time would use randomness during prerendering.
const DUMMY_HASH = "$2b$10$sPC4xvlQlclKTAnRaDD0NOe1U8ngNnveQYAETAHky.kx8R7Sl2Wua";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      // Every login path (the /login form, sign-up's auto-login and the raw
      // /api/auth/callback/credentials endpoint) comes through here, so the rate
      // limit lives here and can't be bypassed by skipping the form.
      async authorize(credentials, request) {
        const email = String(credentials?.email ?? "").trim().toLowerCase().slice(0, 255);
        const password = String(credentials?.password ?? "").slice(0, 200);
        if (!email || !password) return null;

        const ip = clientIp(request.headers);
        if (loginBlockedFor(email, ip) > 0) throw new TooManyAttempts(); // don't even check the password

        const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
        const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
        if (!user?.passwordHash || !ok) {
          if (recordLoginFailure(email, ip) > 0) throw new TooManyAttempts(); // this was the 5th
          return null;
        }

        recordLoginSuccess(email, ip);
        // Checked only after the password, so it doesn't reveal which emails are suspended.
        if (user.suspendedAt) throw new AccountSuspended();
        // pwdAt: sessions issued before a later password reset are rejected (see requireUser).
        return { id: user.id, name: user.name, email: user.email, role: user.role, pwdAt: user.passwordChangedAt?.getTime() ?? 0 };
      },
    }),
  ],
});

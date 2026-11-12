// "Forgot password" links: work once, for RESET_MINUTES (see src/lib/tokens.ts).
import bcrypt from "bcryptjs";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { appUrl } from "@/lib/email/templates";
import { sendPasswordReset } from "@/lib/email/notify";
import { consumeToken, issueToken } from "@/lib/tokens";

export const RESET_MINUTES = 30;

/** Emails a reset link if `email` has a password account. Says nothing either way (callers show the same message). */
export async function sendResetLink(email: string) {
  const [user] = await db.select({ id: users.id, name: users.name, hasPassword: users.passwordHash }).from(users).where(eq(users.email, email)).limit(1);
  if (!user?.hasPassword) return;
  const token = await issueToken("reset", user.id, RESET_MINUTES);
  await sendPasswordReset({ to: email, name: user.name, link: appUrl(`/reset-password?token=${token}`), minutes: RESET_MINUTES });
}

/**
 * Uses a reset link: sets the new password and records when, which signs out every
 * existing session of that account (see requireUser). Returns an error message or null.
 */
export async function resetPassword(token: string, newPassword: string): Promise<string | null> {
  const passwordHash = await bcrypt.hash(newPassword, 10);
  return db.transaction(async (tx) => {
    const used = await consumeToken("reset", token, tx);
    if ("error" in used) {
      return used.error === "expired"
        ? "This reset link has expired. Request a new one."
        : "This reset link is invalid or was already used. Request a new one.";
    }
    // Resetting the password also proves the email address belongs to this person.
    const updated = await tx
      .update(users)
      .set({ passwordHash, passwordChangedAt: new Date(), emailVerified: sql`coalesce(${users.emailVerified}, now())` })
      .where(eq(users.id, used.userId))
      .returning({ id: users.id });
    return updated.length ? null : "This reset link is invalid. Request a new one.";
  });
}

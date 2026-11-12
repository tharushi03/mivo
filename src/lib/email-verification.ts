// Email confirmation. New accounts get a link; buyers must confirm before their first
// order, and a boutique must confirm before MIVO can approve it. This stops order
// emails (with delivery addresses) going to an address the person doesn't own.
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { appUrl, confirmEmailEmail } from "@/lib/email/templates";
import { sendEmail } from "@/lib/email/send";
import { consumeToken, issueToken } from "@/lib/tokens";

export const CONFIRM_HOURS = 24;

/** Sends a confirmation link if the account exists and isn't confirmed yet. */
export async function sendConfirmationEmail(email: string) {
  const [u] = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(and(eq(users.email, email), isNull(users.emailVerified)))
    .limit(1);
  if (!u) return;
  const token = await issueToken("verify", u.id, CONFIRM_HOURS * 60);
  await sendEmail(confirmEmailEmail({ to: email, name: u.name, link: appUrl(`/verify-email?token=${token}`), hours: CONFIRM_HOURS }));
}

/** Uses a confirmation link. */
export async function confirmEmail(token: string): Promise<"ok" | "invalid" | "expired"> {
  return db.transaction(async (tx) => {
    const used = await consumeToken("verify", token, tx);
    if ("error" in used) return used.error;
    await tx.update(users).set({ emailVerified: new Date() }).where(and(eq(users.id, used.userId), isNull(users.emailVerified)));
    return "ok";
  });
}

export async function isEmailConfirmed(userId: string) {
  const [u] = await db.select({ at: users.emailVerified }).from(users).where(eq(users.id, userId));
  return Boolean(u?.at);
}

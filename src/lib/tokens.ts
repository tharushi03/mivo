// Single-use email tokens (password reset, email confirmation), stored in Auth.js's
// verification_tokens table. The link carries a random 256-bit token; only its
// SHA-256 hash is stored, so a database leak can't be turned into working links.
import { createHash, randomBytes } from "node:crypto";
import { and, eq, like } from "drizzle-orm";
import { db } from "@/db";
import { verificationTokens } from "@/db/schema";

export type TokenPurpose = "reset" | "verify";

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

/** Creates a new token for (purpose, userId); any older one for the same pair stops working. */
export async function issueToken(purpose: TokenPurpose, userId: string, minutes: number) {
  const token = randomBytes(32).toString("base64url");
  const identifier = `${purpose}:${userId}`;
  await db.transaction(async (tx) => {
    await tx.delete(verificationTokens).where(eq(verificationTokens.identifier, identifier));
    await tx.insert(verificationTokens).values({ identifier, token: hash(token), expires: new Date(Date.now() + minutes * 60_000) });
  });
  return token;
}

/**
 * Uses a token: deletes it (so it works once, even if submitted twice at once) and
 * returns the user id, or an error. Pass `tx` to make the use part of a larger change.
 */
export async function consumeToken(
  purpose: TokenPurpose,
  token: string,
  tx: Pick<typeof db, "delete"> = db,
): Promise<{ userId: string } | { error: "invalid" | "expired" }> {
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return { error: "invalid" };
  const [row] = await tx
    .delete(verificationTokens)
    .where(and(eq(verificationTokens.token, hash(token)), like(verificationTokens.identifier, `${purpose}:%`)))
    .returning({ identifier: verificationTokens.identifier, expires: verificationTokens.expires });
  if (!row) return { error: "invalid" };
  if (row.expires.getTime() < Date.now()) return { error: "expired" };
  return { userId: row.identifier.slice(purpose.length + 1) };
}

// Data Access Layer: every page and Server Action re-checks the session here,
// rather than trusting the proxy alone.
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { sellerProfiles, users } from "@/db/schema";

type Role = "ADMIN" | "SELLER" | "BUYER";

export async function requireUser(role?: Role) {
  // Request-time only: auth() during prerendering would create a random CSRF
  // token, which Cache Components rejects. (Same reason as on the login page.)
  await connection();
  const session = await auth();
  if (!session?.user) redirect("/login");
  // Sessions are signed cookies, valid until they expire. Reject one if its account
  // was deleted or suspended, or its password was reset after this session was issued.
  const [account] = await db
    .select({ changedAt: users.passwordChangedAt, suspendedAt: users.suspendedAt })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);
  if (!account || (account.changedAt && account.changedAt.getTime() > (session.user.pwdAt ?? 0) + 1000)) {
    redirect("/session-expired");
  }
  // Suspended: logged out at their next request, wherever they are.
  if (account.suspendedAt) redirect("/session-expired?why=suspended");
  if (role && session.user.role !== role) redirect("/dashboard");
  return session.user;
}

export async function requireAdmin() {
  return requireUser("ADMIN");
}

export async function requireSeller() {
  const user = await requireUser("SELLER");
  const profile = await db.query.sellerProfiles.findFirst({
    where: eq(sellerProfiles.userId, user.id),
  });
  return { user, profile };
}

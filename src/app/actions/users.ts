"use server";

// Admin: suspend / restore accounts. A suspended account can't log in, its open
// sessions stop working at the next request (requireUser), and a suspended
// boutique's products leave the shop. Admin accounts can't be suspended here, so
// admins can't lock each other (or themselves) out.

import { revalidatePath, updateTag } from "next/cache";
import { and, eq, isNotNull, isNull, ne } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireAdmin } from "@/lib/dal";
import { audit } from "@/lib/audit";
import { PRODUCTS_TAG } from "@/lib/catalog";
import type { ActionResult } from "./admin-orders";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function refresh() {
  revalidatePath("/admin/users");
  revalidatePath("/admin");
  updateTag(PRODUCTS_TAG); // a boutique's products appear / disappear
}

export async function suspendUser(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim().replace(/\s+/g, " ").slice(0, 200);
  if (!UUID.test(userId)) return { error: "Account not found." };
  if (reason.length < 3) return { error: "Give a reason (kept in the activity log)." };

  const [u] = await db
    .update(users)
    .set({ suspendedAt: new Date(), suspendReason: reason })
    .where(and(eq(users.id, userId), ne(users.role, "ADMIN"), isNull(users.suspendedAt)))
    .returning({ email: users.email, role: users.role });
  if (!u) return { error: "This account can't be suspended (already suspended, or an admin)." };

  refresh();
  await audit(admin.id, "suspend_user", { type: "user", id: userId }, `Suspended ${u.role.toLowerCase()} ${u.email}: ${reason}`);
  return { ok: true };
}

export async function unsuspendUser(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  if (!UUID.test(userId)) return { error: "Account not found." };

  const [u] = await db
    .update(users)
    .set({ suspendedAt: null, suspendReason: null })
    .where(and(eq(users.id, userId), isNotNull(users.suspendedAt)))
    .returning({ email: users.email });
  if (!u) return { error: "This account isn't suspended." };

  refresh();
  await audit(admin.id, "unsuspend_user", { type: "user", id: userId }, `Restored ${u.email}`);
  return { ok: true };
}

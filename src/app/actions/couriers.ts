"use server";

// Admin management of the courier list boutiques choose from when dispatching.
// Couriers are never deleted: past shipments reference them, so an old service
// is deactivated instead (hidden from the dispatch dropdown, kept in history).

import { revalidatePath } from "next/cache";
import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { couriers } from "@/db/schema";
import { requireAdmin } from "@/lib/dal";
import { audit } from "@/lib/audit";
import { countPendingCodPackages, looksLikeSecret } from "@/lib/couriers";
import type { ActionResult } from "./admin-orders";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readFields(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim().replace(/\s+/g, " ");
  const sortRaw = String(formData.get("sortOrder") ?? "").trim();
  const sortOrder = sortRaw === "" ? 0 : Number(sortRaw);
  if (name.length < 2 || name.length > 100) return { error: "Courier name must be 2 to 100 characters." } as const;
  if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 999) return { error: "Position must be a whole number from 0 to 999." } as const;
  return { name, sortOrder } as const;
}

/** Same name ignoring case ("pronto" vs "Pronto") counts as a duplicate. */
async function nameTaken(name: string, exceptId?: string) {
  const [row] = await db
    .select({ id: couriers.id })
    .from(couriers)
    .where(and(sql`lower(${couriers.name}) = lower(${name})`, exceptId ? ne(couriers.id, exceptId) : undefined))
    .limit(1);
  return Boolean(row);
}

function refresh() {
  revalidatePath("/admin/couriers");
  revalidatePath("/seller/orders"); // the dispatch dropdown
  revalidatePath("/checkout"); // Cash on Delivery is offered only while a COD courier exists
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Called inside a transaction that has locked every courier row, with the list as it
 * will be after the change. Refuses to leave no COD courier while COD packages are
 * waiting to be sent (boutiques couldn't dispatch them).
 */
async function codGuard(tx: Tx, after: { isActive: boolean; supportsCod: boolean }[]) {
  if (after.some((c) => c.isActive && c.supportsCod)) return null;
  const n = await countPendingCodPackages(tx);
  return n > 0
    ? `${n} cash-on-delivery ${n === 1 ? "package is" : "packages are"} waiting to be sent. Keep at least one active courier with a MIVO COD account until ${n === 1 ? "it's" : "they're"} dispatched or cancelled.`
    : null;
}

export async function createCourier(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const f = readFields(formData);
  if ("error" in f) return { error: f.error };
  if (await nameTaken(f.name)) return { error: `"${f.name}" is already in the list.` };

  // onConflictDoNothing covers two admins adding the same exact name at once.
  const inserted = await db.insert(couriers).values({ name: f.name, sortOrder: f.sortOrder }).onConflictDoNothing().returning({ id: couriers.id });
  if (inserted.length === 0) return { error: `"${f.name}" is already in the list.` };
  refresh();
  await audit(admin.id, "add_courier", { type: "courier", id: inserted[0].id }, `Added courier ${f.name}`);
  return { ok: true };
}

export async function updateCourier(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const id = String(formData.get("courierId") ?? "");
  if (!UUID.test(id)) return { error: "Courier not found." };
  const f = readFields(formData);
  if ("error" in f) return { error: f.error };
  if (await nameTaken(f.name, id)) return { error: `"${f.name}" is already in the list.` };

  try {
    const updated = await db.update(couriers).set({ name: f.name, sortOrder: f.sortOrder }).where(eq(couriers.id, id)).returning({ id: couriers.id });
    if (updated.length === 0) return { error: "Courier not found." };
  } catch {
    return { error: `"${f.name}" is already in the list.` }; // unique index, concurrent rename
  }
  refresh();
  await audit(admin.id, "edit_courier", { type: "courier", id }, `Courier renamed/reordered: ${f.name} (position ${f.sortOrder})`);
  return { ok: true };
}

/** Show or hide a courier in the dispatch dropdown. At least one must stay active. */
export async function setCourierActive(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const id = String(formData.get("courierId") ?? "");
  const active = formData.get("active") === "true";
  if (!UUID.test(id)) return { error: "Courier not found." };

  const error = await db.transaction(async (tx) => {
    // Lock the whole list so two admins can't each deactivate "the other last one".
    const rows = await tx.select({ id: couriers.id, isActive: couriers.isActive, supportsCod: couriers.supportsCod }).from(couriers).for("update");
    const me = rows.find((r) => r.id === id);
    if (!me) return "Courier not found.";
    if (!active && me.isActive && rows.filter((r) => r.isActive).length === 1) {
      return "Keep at least one courier active, or boutiques can't dispatch.";
    }
    if (!active) {
      const blocked = await codGuard(tx, rows.map((r) => (r.id === id ? { ...r, isActive: false } : r)));
      if (blocked) return blocked;
    }
    await tx.update(couriers).set({ isActive: active }).where(eq(couriers.id, id));
    return null;
  });
  if (error) return { error };
  refresh();
  const [c] = await db.select({ name: couriers.name }).from(couriers).where(eq(couriers.id, id));
  await audit(admin.id, "courier_active", { type: "courier", id }, `${active ? "Activated" : "Deactivated"} courier ${c?.name ?? ""}`);
  return { ok: true };
}

/**
 * MIVO's merchant account with a courier: the account number and booking steps shown
 * to boutiques, and whether cash-on-delivery packages may use this courier.
 */
export async function updateCourierAccount(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const id = String(formData.get("courierId") ?? "");
  if (!UUID.test(id)) return { error: "Courier not found." };
  const accountNumber = String(formData.get("accountNumber") ?? "").trim().replace(/\s+/g, " ") || null;
  const bookingInstructions = String(formData.get("bookingInstructions") ?? "").trim().replace(/\r\n/g, "\n") || null;
  const supportsCod = formData.get("supportsCod") === "on";

  if (accountNumber && accountNumber.length > 60) return { error: "Account number must be at most 60 characters." };
  if (bookingInstructions && bookingInstructions.length > 600) return { error: "Booking instructions must be at most 600 characters." };
  if ((accountNumber && looksLikeSecret(accountNumber)) || (bookingInstructions && looksLikeSecret(bookingInstructions))) {
    return { error: "Don't put passwords or PINs here: every boutique can read this. Use the account number, a pickup phone number, or a separate login per boutique." };
  }
  if (supportsCod && !accountNumber) return { error: "Add MIVO's account number with this courier before allowing cash on delivery." };

  const result = await db.transaction(async (tx) => {
    const rows = await tx.select({ id: couriers.id, name: couriers.name, isActive: couriers.isActive, supportsCod: couriers.supportsCod }).from(couriers).for("update");
    const me = rows.find((r) => r.id === id);
    if (!me) return { error: "Courier not found." };
    if (supportsCod && !me.isActive) return { error: "Activate this courier first." };
    if (!supportsCod && me.supportsCod) {
      const blocked = await codGuard(tx, rows.map((r) => (r.id === id ? { ...r, supportsCod: false } : r)));
      if (blocked) return { error: blocked };
    }
    await tx.update(couriers).set({ accountNumber, bookingInstructions, supportsCod }).where(eq(couriers.id, id));
    return { name: me.name, wasCod: me.supportsCod };
  });
  if ("error" in result) return { error: result.error };

  refresh();
  const codText = supportsCod === result.wasCod ? (supportsCod ? "COD allowed" : "no COD") : supportsCod ? "COD switched on" : "COD switched off";
  await audit(admin.id, "edit_courier_account", { type: "courier", id }, `${result.name} account: ${accountNumber ?? "no account number"}, ${codText}`);
  return { ok: true };
}

// Admin activity log: one row per successful admin action (shown on /admin/activity).
// Logging never breaks the action itself: the change is already committed.
import { db } from "@/db";
import { adminActions } from "@/db/schema";

export type AuditTarget = "order" | "shipment" | "refund" | "payout" | "seller" | "user" | "courier";

export async function audit(adminId: string, action: string, target: { type: AuditTarget; id?: string | null }, summary: string) {
  try {
    await db.insert(adminActions).values({ adminId, action, targetType: target.type, targetId: target.id ?? null, summary: summary.slice(0, 1000) });
  } catch (err) {
    console.error("[audit] failed to record", action, target, err);
  }
}

/** Human labels for the activity page. */
export const ACTION_LABEL: Record<string, string> = {
  verify_payment: "Verified payment",
  mark_delivered: "Marked delivered",
  cancel_order: "Cancelled order",
  cancel_package: "Cancelled package",
  return_package: "Recorded return",
  restock_package: "Restocked package",
  edit_tracking: "Edited tracking",
  settle_refund: "Settled refund",
  pay_boutique: "Paid boutique",
  approve_boutique: "Approved boutique",
  revoke_boutique: "Revoked boutique",
  suspend_user: "Suspended account",
  unsuspend_user: "Restored account",
  add_courier: "Added courier",
  edit_courier: "Edited courier",
  courier_active: "Changed courier status",
  edit_courier_account: "Edited courier account",
};

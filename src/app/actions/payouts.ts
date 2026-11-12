"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { orderItems, orders, products, sellerAdjustments, sellerPayouts, sellerProfiles, shipments } from "@/db/schema";
import { requireAdmin } from "@/lib/dal";
import { audit } from "@/lib/audit";
import { fromCents } from "@/lib/pricing";
import { computePayout, payableItem, reimbursableShipment, shipmentOfItem } from "@/lib/payouts";
import type { ActionResult } from "./admin-orders";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class PayoutError extends Error {}

/**
 * Records that MIVO transferred a boutique's pending balance.
 * - Locks the boutique row, so two clicks can't create two payouts.
 * - Recomputes the amount on the server (sales - commission + repaid delivery fees),
 *   and refuses if it differs from what the admin saw.
 * - Links every paid item and every repaid package to the payout; each can only be
 *   linked once.
 */
export async function markPayoutPaid(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();

  const sellerId = String(formData.get("sellerId") ?? "");
  const expectedNetCents = Number(formData.get("expectedNetCents"));
  const reference = String(formData.get("reference") ?? "").trim().slice(0, 100) || null;
  const expectedAccount = String(formData.get("expectedAccount") ?? "");
  if (!UUID.test(sellerId) || !Number.isInteger(expectedNetCents)) return { error: "Invalid request." };

  let summary = "";
  try {
    await db.transaction(async (tx) => {
      const [seller] = await tx
        .select({
          shopName: sellerProfiles.shopName,
          bankName: sellerProfiles.bankName,
          bankAccountName: sellerProfiles.bankAccountName,
          bankAccountNumber: sellerProfiles.bankAccountNumber,
        })
        .from(sellerProfiles)
        .where(eq(sellerProfiles.id, sellerId))
        .for("update");
      if (!seller) throw new PayoutError("Boutique not found.");
      if (!seller.bankAccountNumber) throw new PayoutError("This boutique hasn't added bank details yet.");
      // The admin transferred to the account shown on the page. If the seller changed it
      // since then, stop: the money may have gone to the old account (or a hijacked one).
      if (seller.bankAccountNumber !== expectedAccount) {
        throw new PayoutError("This boutique's bank details changed since you opened this page. Refresh and check them.");
      }

      const items = await tx
        .select({
          id: orderItems.id,
          price: orderItems.priceAtPurchase,
          quantity: orderItems.quantity,
          commissionRate: orderItems.commissionRate,
        })
        .from(orderItems)
        .innerJoin(orders, eq(orderItems.orderId, orders.id))
        .innerJoin(products, eq(orderItems.productId, products.id))
        .innerJoin(shipments, shipmentOfItem)
        .where(and(payableItem, eq(products.sellerId, sellerId)))
        .for("update", { of: orderItems });
      const pkgs = await tx
        .select({ id: shipments.id, fee: shipments.deliveryFee })
        .from(shipments)
        .innerJoin(orders, eq(shipments.orderId, orders.id))
        .where(and(reimbursableShipment, eq(shipments.sellerId, sellerId)))
        .for("update", { of: shipments });
      const adjustments = await tx
        .select({ id: sellerAdjustments.id, amount: sellerAdjustments.amount })
        .from(sellerAdjustments)
        .where(and(eq(sellerAdjustments.sellerId, sellerId), isNull(sellerAdjustments.payoutId)))
        .for("update");
      if (items.length === 0 && pkgs.length === 0) throw new PayoutError("Nothing is owed to this boutique right now.");

      const p = computePayout(items, pkgs.map((s) => s.fee), adjustments.map((a) => a.amount));
      if (p.netCents <= 0) {
        throw new PayoutError("Nothing to pay: this boutique's deductions (returns after payout) are larger than what it has earned. They carry forward to its next sales.");
      }
      if (p.netCents !== expectedNetCents) {
        throw new PayoutError("The amount owed has changed since you opened this page. Refresh and check the new total.");
      }

      const [payout] = await tx
        .insert(sellerPayouts)
        .values({
          sellerId,
          grossAmount: fromCents(p.grossCents),
          commissionRate: p.rate.toFixed(2),
          commissionAmount: fromCents(p.commissionCents),
          deliveryAmount: fromCents(p.deliveryCents),
          adjustmentAmount: fromCents(p.adjustmentCents),
          amount: fromCents(p.netCents),
          itemCount: items.reduce((s, i) => s + i.quantity, 0),
          status: "PAID",
          reference,
          // Snapshot of where the money went (bank details can change later).
          bankName: seller.bankName,
          bankAccountName: seller.bankAccountName,
          bankAccountNumber: seller.bankAccountNumber,
          paidAt: new Date(),
        })
        .returning({ id: sellerPayouts.id });

      if (items.length > 0) {
        const linked = await tx
          .update(orderItems)
          .set({ payoutId: payout.id })
          .where(and(inArray(orderItems.id, items.map((i) => i.id)), isNull(orderItems.payoutId)))
          .returning({ id: orderItems.id });
        if (linked.length !== items.length) throw new PayoutError("Some items were already paid. Refresh and try again.");
      }
      if (pkgs.length > 0) {
        const linked = await tx
          .update(shipments)
          .set({ payoutId: payout.id })
          .where(and(inArray(shipments.id, pkgs.map((s) => s.id)), isNull(shipments.payoutId)))
          .returning({ id: shipments.id });
        if (linked.length !== pkgs.length) throw new PayoutError("Some delivery fees were already repaid. Refresh and try again.");
      }
      if (adjustments.length > 0) {
        await tx.update(sellerAdjustments).set({ payoutId: payout.id }).where(inArray(sellerAdjustments.id, adjustments.map((a) => a.id)));
      }
      summary = `Paid ${seller.shopName} LKR ${fromCents(p.netCents)} to ${seller.bankName ?? "bank"} ${seller.bankAccountNumber}${reference ? ` (ref ${reference})` : ""}${p.adjustmentCents ? `, after deductions of LKR ${fromCents(-p.adjustmentCents)}` : ""}`;
    });
  } catch (err) {
    if (err instanceof PayoutError) return { error: err.message };
    console.error("markPayoutPaid failed", err);
    return { error: "Could not record the payout. Please try again." };
  }

  await audit(admin.id, "pay_boutique", { type: "seller", id: sellerId }, summary);
  revalidatePath("/admin/payouts");
  revalidatePath("/seller/payouts");
  return { ok: true };
}

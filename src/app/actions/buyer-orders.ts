"use server";

import { updateTag } from "next/cache";
import { db } from "@/db";
import { requireUser } from "@/lib/dal";
import { isValidGuestKey } from "@/lib/guest-orders";
import { PRODUCTS_TAG } from "@/lib/catalog";
import { cancelOrderTx } from "@/lib/fulfilment";
import { refreshOrderPages } from "@/lib/revalidate-orders";
import { notifyLater, notifyOrderCancelled } from "@/lib/email/notify";
import type { ActionResult } from "./admin-orders";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The buyer cancels their own order. Only allowed while every package is still
 * PENDING (no boutique has handed anything to a courier); the check runs again
 * here under the order lock, so a boutique dispatching at the same moment wins or
 * loses cleanly and the buyer sees the right message.
 */
export async function cancelMyOrder(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const orderId = String(formData.get("orderId") ?? "");
  if (!UUID.test(orderId)) return { error: "Order not found." };
  // Guests prove the order is theirs with the key from its secret link (buyerId null).
  const key = formData.get("key");
  let buyerId: string | null;
  if (typeof key === "string" && key) {
    if (!isValidGuestKey(orderId, key)) return { error: "Order not found." };
    buyerId = null;
  } else {
    buyerId = (await requireUser()).id;
  }

  const result = await db.transaction((tx) => cancelOrderTx(tx, orderId, { role: "BUYER", buyerId }));
  if (result.error !== undefined) return { error: result.error };

  updateTag(PRODUCTS_TAG); // the items are back in stock
  refreshOrderPages(orderId);
  notifyLater("order cancelled by buyer", () => notifyOrderCancelled(orderId, { by: "BUYER", ...result }));
  return { ok: true };
}

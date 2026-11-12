"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { orders } from "@/db/schema";
import { requireUser } from "@/lib/dal";
import { MAX_IMAGE_BYTES, deletePrivateImage, detectImageType, savePrivateImage } from "@/lib/storage";

export type SlipState = { ok?: boolean; error?: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Buyer uploads (or replaces) the bank transfer slip for their own unpaid order. */
export async function uploadPaymentSlip(_prev: SlipState, formData: FormData): Promise<SlipState> {
  const user = await requireUser();
  const orderId = String(formData.get("orderId") ?? "");
  if (!UUID.test(orderId)) return { error: "Invalid order." };

  const file = formData.get("slip");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a photo or screenshot of your slip." };
  if (file.size > MAX_IMAGE_BYTES) return { error: "The image must be 5 MB or smaller." };

  const buf = Buffer.from(await file.arrayBuffer());
  const ext = detectImageType(buf);
  if (!ext) return { error: "Only JPG, PNG or WebP images are allowed." };

  // Only the buyer's own, unpaid, still-open bank transfer order.
  const canUpload = and(
    eq(orders.id, orderId),
    eq(orders.buyerId, user.id),
    eq(orders.paymentMethod, "BANK_TRANSFER"),
    eq(orders.paymentStatus, "PENDING"),
    eq(orders.orderStatus, "PENDING"), // unpaid bank transfers are never shipped yet
  );

  const [order] = await db.select({ oldSlip: orders.paymentSlipUrl }).from(orders).where(canUpload).limit(1);
  if (!order) return { error: "A slip can't be uploaded for this order." };

  const key = await savePrivateImage("slips", buf, ext);
  const updated = await db.update(orders).set({ paymentSlipUrl: key }).where(canUpload).returning({ id: orders.id });

  if (updated.length === 0) {
    await deletePrivateImage(key); // order changed meanwhile (e.g. just verified)
    return { error: "This order was updated meanwhile. Please refresh the page." };
  }
  if (order.oldSlip) await deletePrivateImage(order.oldSlip); // replaced

  revalidatePath(`/order/${orderId}`);
  revalidatePath("/admin/orders");
  return { ok: true };
}

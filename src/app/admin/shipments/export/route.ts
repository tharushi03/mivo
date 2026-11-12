// CSV of every package currently with a courier, for matching against courier
// payment statements in Excel / Google Sheets. Admin only.
//   GET /admin/shipments/export
import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { couriers, orders, sellerProfiles, shipments } from "@/db/schema";
import { requireAdmin } from "@/lib/dal";
import { orderRef } from "@/lib/payments";
import { fromCents, toCents } from "@/lib/pricing";

// Items in this boutique's package (for the COD amount the courier must collect).
const itemsTotal = sql<string>`(select coalesce(sum(oi.price_at_purchase * oi.quantity), 0) from order_items oi join products p on p.id = oi.product_id where oi.order_id = ${shipments.orderId} and p.seller_id = ${shipments.sellerId})`;

/** One CSV cell. A leading = + - @ is neutralised so Excel never runs it as a formula. */
function cell(v: string | number | null | undefined) {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Sri Lanka time, as Excel reads it: 2026-11-12 14:05 */
function slTime(d: Date | null) {
  if (!d) return "";
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Colombo", dateStyle: "short", timeStyle: "short" }).format(d);
}

export async function GET() {
  await requireAdmin();

  const rows = await db
    .select({
      orderId: shipments.orderId,
      shopName: sellerProfiles.shopName,
      courier: couriers.name,
      tracking: shipments.trackingNumber,
      dispatchedAt: shipments.dispatchedAt,
      paymentMethod: orders.paymentMethod,
      paymentStatus: orders.paymentStatus,
      deliveryFee: shipments.deliveryFee,
      itemsTotal,
      recipientName: orders.recipientName,
    })
    .from(shipments)
    .innerJoin(orders, eq(shipments.orderId, orders.id))
    .innerJoin(sellerProfiles, eq(shipments.sellerId, sellerProfiles.id))
    .leftJoin(couriers, eq(shipments.courierId, couriers.id))
    .where(eq(shipments.status, "DISPATCHED"))
    .orderBy(asc(couriers.name), asc(shipments.dispatchedAt));

  const header = ["Order ref", "Boutique", "Courier", "Tracking number", "Dispatched (Sri Lanka time)", "Payment", "COD to collect (LKR)", "Recipient"];
  const lines = rows.map((r) => {
    const cod = r.paymentMethod === "COD" && r.paymentStatus !== "PAID";
    return [
      orderRef(r.orderId),
      r.shopName,
      r.courier,
      r.tracking,
      slTime(r.dispatchedAt),
      cod ? "Cash on delivery" : "Prepaid",
      cod ? fromCents(toCents(r.itemsTotal) + toCents(r.deliveryFee)) : "0.00",
      r.recipientName,
    ]
      .map(cell)
      .join(",");
  });

  // BOM so Excel opens it as UTF-8 (Sinhala/Tamil names), CRLF line endings.
  const csv = "﻿" + [header.map(cell).join(","), ...lines].join("\r\n") + "\r\n";
  const today = slTime(new Date()).slice(0, 10);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="mivo-on-the-way-${today}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

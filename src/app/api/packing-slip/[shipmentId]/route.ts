import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { orderItems, orders, products, sellerProfiles, shipments } from "@/db/schema";
import { requireUser } from "@/lib/dal";
import { orderRef } from "@/lib/payments";
import { renderPackingSlipPdf } from "@/lib/packing-slip-pdf";

// Packing slip for ONE boutique's package, to put inside the parcel while packing.
// The boutique that owns the package can print it, and admins can print any.
// @react-pdf/renderer needs Node.js APIs; route handlers run on Node.js by default.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req: Request, ctx: RouteContext<"/api/packing-slip/[shipmentId]">) {
  const { shipmentId } = await ctx.params;
  const user = await requireUser();
  if (user.role !== "SELLER" && user.role !== "ADMIN") return new Response("Not found", { status: 404 });
  if (!UUID.test(shipmentId)) return new Response("Not found", { status: 404 });

  const [pkg] = await db
    .select({
      orderId: orders.id,
      sellerId: shipments.sellerId,
      sellerUserId: sellerProfiles.userId,
      shopName: sellerProfiles.shopName,
      status: shipments.status,
      deliveryFee: shipments.deliveryFee,
      orderedAt: orders.createdAt,
      recipientName: orders.recipientName,
      paymentMethod: orders.paymentMethod,
      paymentStatus: orders.paymentStatus,
    })
    .from(shipments)
    .innerJoin(orders, eq(shipments.orderId, orders.id))
    .innerJoin(sellerProfiles, eq(shipments.sellerId, sellerProfiles.id))
    .where(eq(shipments.id, shipmentId))
    .limit(1);

  // Another boutique's package looks exactly like a missing one.
  if (!pkg || (user.role === "SELLER" && pkg.sellerUserId !== user.id)) return new Response("Not found", { status: 404 });
  if (pkg.status === "CANCELLED") return new Response("This package was cancelled. Don't send it.", { status: 409 });
  if (pkg.paymentMethod === "BANK_TRANSFER" && pkg.paymentStatus !== "PAID") {
    return new Response("MIVO hasn't confirmed this bank transfer yet. Don't pack it yet.", { status: 409 });
  }

  // Only this boutique's items: an order from several boutiques arrives as several parcels.
  const items = await db
    .select({
      title: orderItems.productTitle,
      size: orderItems.selectedSize,
      quantity: orderItems.quantity,
      price: orderItems.priceAtPurchase,
    })
    .from(orderItems)
    .innerJoin(products, eq(orderItems.productId, products.id))
    .where(and(eq(orderItems.orderId, pkg.orderId), eq(products.sellerId, pkg.sellerId)))
    .orderBy(orderItems.productTitle, orderItems.selectedSize);

  const ref = orderRef(pkg.orderId);
  const pdf = await renderPackingSlipPdf({
    orderRef: ref,
    orderedAt: pkg.orderedAt,
    shopName: pkg.shopName,
    recipientName: pkg.recipientName,
    paymentMethod: pkg.paymentMethod,
    paid: pkg.paymentStatus === "PAID",
    deliveryFee: pkg.deliveryFee,
    items,
  });

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      // inline: opens in the browser's PDF viewer, ready to print.
      "Content-Disposition": `inline; filename="${ref}-packing-slip.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}

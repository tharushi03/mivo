import { auth } from "@/auth";
import { getGuestOrder, getOrderWithItems } from "@/lib/orders";
import { orderRef } from "@/lib/payments";
import { renderInvoicePdf } from "@/lib/invoice-pdf";

// @react-pdf/renderer needs Node.js APIs. Route handlers run on the Node.js runtime
// by default, and Next 16 with cacheComponents doesn't allow `export const runtime`,
// so there is nothing to configure here.

export async function GET(req: Request, ctx: RouteContext<"/api/invoice/[orderId]">) {
  const { orderId } = await ctx.params;

  // Guests: ?k=<key from their secret order link>. Wrong key = not found.
  const key = new URL(req.url).searchParams.get("k");
  let order: Awaited<ReturnType<typeof getOrderWithItems>>;
  if (key) {
    order = await getGuestOrder(orderId, key);
  } else {
    const session = await auth();
    if (!session?.user) return new Response("Unauthorized", { status: 401 });
    // Admin may download any invoice; anyone else only their own (others get 404, not 403,
    // so order IDs can't be probed).
    order = await getOrderWithItems(orderId, session.user.role === "ADMIN" ? undefined : { buyerId: session.user.id });
  }
  if (!order) return new Response("Not found", { status: 404 });

  const invoiceNumber = orderRef(order.id);
  const pdf = await renderInvoicePdf(order, invoiceNumber);

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${invoiceNumber}-invoice.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}

import { auth } from "@/auth";
import { getOrderWithItems } from "@/lib/orders";
import { orderRef } from "@/lib/payments";
import { renderInvoicePdf } from "@/lib/invoice-pdf";

// @react-pdf/renderer needs Node.js APIs. Route handlers run on the Node.js runtime
// by default, and Next 16 with cacheComponents doesn't allow `export const runtime`,
// so there is nothing to configure here.

export async function GET(_req: Request, ctx: RouteContext<"/api/invoice/[orderId]">) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const { orderId } = await ctx.params;
  const isAdmin = session.user.role === "ADMIN";

  // Admin may download any invoice; anyone else only their own (others get 404, not 403,
  // so order IDs can't be probed).
  const order = await getOrderWithItems(orderId, isAdmin ? undefined : session.user.id);
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

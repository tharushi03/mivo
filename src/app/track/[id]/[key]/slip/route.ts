import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { orders } from "@/db/schema";
import { isValidGuestKey } from "@/lib/guest-orders";
import { readPrivateImage } from "@/lib/storage";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A guest's own bank slip, through their secret order link. Anything else: 404.
export async function GET(_req: Request, ctx: RouteContext<"/track/[id]/[key]/slip">) {
  const { id, key } = await ctx.params;
  if (!UUID.test(id) || !isValidGuestKey(id, key)) return new Response("Not found", { status: 404 });

  const [order] = await db
    .select({ slip: orders.paymentSlipUrl })
    .from(orders)
    .where(and(eq(orders.id, id), isNull(orders.buyerId)))
    .limit(1);
  if (!order?.slip) return new Response("Not found", { status: 404 });

  const file = await readPrivateImage(order.slip);
  if (!file) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(file.data), {
    headers: {
      "Content-Type": file.mime,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}

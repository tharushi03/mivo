import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { orders } from "@/db/schema";
import { readPrivateImage } from "@/lib/storage";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Serves an order's bank slip ONLY to the admin or the buyer who placed the order.
export async function GET(_req: Request, ctx: RouteContext<"/order/[id]/slip">) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const { id } = await ctx.params;
  if (!UUID.test(id)) return new Response("Not found", { status: 404 });

  const [order] = await db
    .select({ buyerId: orders.buyerId, slip: orders.paymentSlipUrl })
    .from(orders)
    .where(eq(orders.id, id))
    .limit(1);

  const allowed = order && (session.user.role === "ADMIN" || order.buyerId === session.user.id);
  if (!allowed || !order.slip) return new Response("Not found", { status: 404 });

  const file = await readPrivateImage(order.slip);
  if (!file) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(file.data), {
    headers: {
      "Content-Type": file.mime,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

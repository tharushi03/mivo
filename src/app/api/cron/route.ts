// Scheduled housekeeping. Call it every hour from Dokploy (Schedules), e.g.
//   curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron
//
// 1. Unpaid bank-transfer orders (no slip) get one reminder email after 24 hours.
// 2. After 72 hours they are cancelled and their stock goes back on sale.
//    Orders with an uploaded slip are never expired: the admin must check the slip.
// 3. Expired password-reset links are deleted.
//
// Safe to run any number of times, or twice at once: every step is a conditional
// update or runs under the order lock.
import { timingSafeEqual } from "node:crypto";
import { revalidateTag } from "next/cache";
import { and, eq, gt, isNull, lt } from "drizzle-orm";
import { db } from "@/db";
import { orders, verificationTokens } from "@/db/schema";
import { PRODUCTS_TAG } from "@/lib/catalog";
import { cancelOrderTx } from "@/lib/fulfilment";
import { PAYMENT_DEADLINE_HOURS, PAYMENT_REMINDER_HOURS, paymentDeadline } from "@/lib/payments";
import { refreshOrderPages } from "@/lib/revalidate-orders";
import { notifyOrderCancelled, notifyPaymentReminder } from "@/lib/email/notify";

const HOUR = 3_600_000;

function authorised(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function POST(request: Request) {
  if (!process.env.CRON_SECRET) return Response.json({ error: "CRON_SECRET is not set" }, { status: 503 });
  if (!authorised(request)) return Response.json({ error: "Unauthorised" }, { status: 401 });

  const now = Date.now();
  const unpaid = and(
    eq(orders.paymentMethod, "BANK_TRANSFER"),
    eq(orders.paymentStatus, "PENDING"),
    eq(orders.orderStatus, "PENDING"),
    isNull(orders.paymentSlipUrl),
  );

  // 1. Reminders. Claiming the row with a conditional update means each buyer gets exactly one.
  const reminded = await db
    .update(orders)
    .set({ paymentReminderSentAt: new Date(now) })
    .where(
      and(
        unpaid,
        isNull(orders.paymentReminderSentAt),
        lt(orders.createdAt, new Date(now - PAYMENT_REMINDER_HOURS * HOUR)),
        gt(orders.createdAt, new Date(now - PAYMENT_DEADLINE_HOURS * HOUR)),
      ),
    )
    .returning({ id: orders.id, createdAt: orders.createdAt });
  for (const o of reminded) {
    await notifyPaymentReminder(o.id, paymentDeadline(o.createdAt)).catch((err) => console.error("[cron] reminder failed", o.id, err));
  }

  // 2. Expiry.
  const overdue = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(unpaid, lt(orders.createdAt, new Date(now - PAYMENT_DEADLINE_HOURS * HOUR))))
    .limit(200);
  const expired: string[] = [];
  for (const { id } of overdue) {
    const r = await db.transaction((tx) =>
      cancelOrderTx(tx, id, { role: "ADMIN", reason: `Not paid within ${PAYMENT_DEADLINE_HOURS / 24} days`, onlyIfUnpaid: true }),
    );
    if (r.error !== undefined) continue; // paid or slip uploaded meanwhile
    expired.push(id);
    refreshOrderPages(id);
    await notifyOrderCancelled(id, { by: "ADMIN", ...r }).catch((err) => console.error("[cron] cancel email failed", id, err));
  }
  if (expired.length > 0) revalidateTag(PRODUCTS_TAG, { expire: 0 }); // stock is back on sale

  // 3. Old password-reset links.
  const cleaned = await db.delete(verificationTokens).where(lt(verificationTokens.expires, new Date(now))).returning({ id: verificationTokens.token });

  const summary = { reminded: reminded.length, expired: expired.length, tokensDeleted: cleaned.length };
  if (summary.reminded || summary.expired) console.log("[cron]", JSON.stringify(summary));
  return Response.json(summary);
}

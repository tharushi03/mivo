// Couriers boutiques can pick when they dispatch a package (the `couriers` table).
//
// Cash on delivery: the courier pays the collected cash to whoever owns the account
// the parcel was booked on. So a COD package may only go with a courier where MIVO
// has a merchant account (supportsCod), booked on that account. Prepaid packages can
// use any active courier.
import { and, asc, count, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { couriers, orders, shipments } from "@/db/schema";

export type CourierOption = {
  id: string;
  name: string;
  supportsCod: boolean;
  accountNumber: string | null;
  bookingInstructions: string | null;
};

export async function getActiveCouriers(): Promise<CourierOption[]> {
  return db
    .select({
      id: couriers.id,
      name: couriers.name,
      supportsCod: couriers.supportsCod,
      accountNumber: couriers.accountNumber,
      bookingInstructions: couriers.bookingInstructions,
    })
    .from(couriers)
    .where(eq(couriers.isActive, true))
    .orderBy(asc(couriers.sortOrder), asc(couriers.name));
}

/** Couriers a cash-on-delivery package may be booked with. */
export const codCouriers = (list: CourierOption[]) => list.filter((c) => c.supportsCod);

/** Active couriers with a MIVO COD account. None means checkout can't offer COD. */
export async function getCodCouriers() {
  return codCouriers(await getActiveCouriers());
}

/** Is cash on delivery offered at checkout right now? */
export async function codAvailable() {
  const [row] = await db
    .select({ id: couriers.id })
    .from(couriers)
    .where(and(eq(couriers.isActive, true), eq(couriers.supportsCod, true)))
    .limit(1);
  return Boolean(row);
}

/** COD packages waiting to be dispatched: they need a COD courier to exist. */
export async function countPendingCodPackages(q: Pick<typeof db, "select"> = db) {
  const [row] = await q
    .select({ n: count() })
    .from(shipments)
    .innerJoin(orders, eq(shipments.orderId, orders.id))
    .where(and(eq(shipments.status, "PENDING"), eq(orders.paymentMethod, "COD"), ne(orders.orderStatus, "CANCELLED")));
  return row?.n ?? 0;
}

/** Text boutiques see: refuse anything that looks like a login secret. */
export function looksLikeSecret(text: string) {
  return /\b(pass\s*word|passwd|pwd|pin\s*(code|no)?|otp)\b\s*[:=-]?/i.test(text);
}

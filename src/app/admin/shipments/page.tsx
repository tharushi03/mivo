import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { couriers, orders, sellerProfiles, shipments } from "@/db/schema";
import { requireAdmin } from "@/lib/dal";
import { orderRef } from "@/lib/payments";
import { formatDateTime, formatLKR } from "@/lib/format";
import { DISPATCH_TARGET_DAYS } from "@/lib/shipments";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { EmptyState } from "@/components/empty-state";
import { ShipmentStatusBadge } from "@/components/shipment-status-badge";
import { PAGE_SIZE, Pagination, parsePage } from "@/components/pagination";
import { markShipmentDelivered } from "@/app/actions/admin-orders";
import { EditTracking } from "@/components/edit-tracking";
import { codCouriers, getActiveCouriers } from "@/lib/couriers";

export const metadata: Metadata = { title: "Admin · Shipments" };

// When a package became ready to ship: COD right away, bank transfer once MIVO confirmed payment.
const readyAt = sql`(case when ${orders.paymentMethod} = 'COD' then ${orders.createdAt} else ${orders.paidAt} end)`;
const isReady = sql`(${orders.paymentMethod} = 'COD' or ${orders.paymentStatus} = 'PAID')`;
const isLate = sql`(${shipments.status} = 'PENDING' and ${isReady} and ${readyAt} < now() - make_interval(days => ${DISPATCH_TARGET_DAYS}))`;
// Items in this boutique's package (for the COD amount the courier must collect).
const itemsTotal = sql<string>`(select coalesce(sum(oi.price_at_purchase * oi.quantity), 0) from order_items oi join products p on p.id = oi.product_id where oi.order_id = ${shipments.orderId} and p.seller_id = ${shipments.sellerId})`;

const TABS = {
  late: { label: "Late", where: isLate },
  ready: { label: "To dispatch", where: sql`(${shipments.status} = 'PENDING' and ${isReady})` },
  unpaid: { label: "Awaiting payment", where: sql`(${shipments.status} = 'PENDING' and not ${isReady})` },
  sent: { label: "On the way", where: eq(shipments.status, "DISPATCHED") },
  done: { label: "Delivered", where: eq(shipments.status, "DELIVERED") },
  all: { label: "All", where: undefined },
} satisfies Record<string, { label: string; where: SQL | undefined }>;
type Tab = keyof typeof TABS;

export default function AdminShipmentsPage({ searchParams }: PageProps<"/admin/shipments">) {
  return (
    <main className="mx-auto max-w-[1400px] p-4 sm:p-8">
      <h1 className="text-3xl font-bold">Shipments</h1>
      <p className="mb-6 mt-1 text-text-secondary">
        Every boutique package. Boutiques should dispatch within {DISPATCH_TARGET_DAYS} days of an order being ready.
        Mark a package delivered once it has arrived (for COD, once the courier has paid MIVO the cash).
      </p>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl border border-border bg-surface" />}>
        <Shipments searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Shipments({ searchParams }: Pick<PageProps<"/admin/shipments">, "searchParams">) {
  await requireAdmin();
  const sp = await searchParams;
  const tab: Tab = typeof sp.tab === "string" && sp.tab in TABS ? (sp.tab as Tab) : "late";
  const page = parsePage(sp.page);
  const where = TABS[tab].where;

  const [tabCounts, list, scoreboard, courierList] = await Promise.all([
    db
      .select(
        Object.fromEntries(
          (Object.keys(TABS) as Tab[]).map((t) => [
            t,
            TABS[t].where ? sql<number>`count(*) filter (where ${TABS[t].where})::int` : sql<number>`count(*)::int`,
          ]),
        ) as Record<Tab, SQL<number>>,
      )
      .from(shipments)
      .innerJoin(orders, eq(shipments.orderId, orders.id)),
    db
      .select({
        id: shipments.id,
        orderId: shipments.orderId,
        status: shipments.status,
        shopName: sellerProfiles.shopName,
        courierId: shipments.courierId,
        courierName: couriers.name,
        trackingNumber: shipments.trackingNumber,
        deliveryFee: shipments.deliveryFee,
        itemsTotal,
        dispatchedAt: shipments.dispatchedAt,
        deliveredAt: shipments.deliveredAt,
        readyAt: sql<Date | null>`${readyAt}`.mapWith(orders.createdAt), // parse as a timestamp
        // Whole days the package has been waiting to be sent (ready -> now), or took (ready -> dispatched).
        waitDays: sql<number | null>`floor(extract(epoch from (coalesce(${shipments.dispatchedAt}, now()) - ${readyAt})) / 86400)::int`,
        late: sql<boolean>`${isLate}`,
        paymentMethod: orders.paymentMethod,
        paymentStatus: orders.paymentStatus,
        recipientName: orders.recipientName,
      })
      .from(shipments)
      .innerJoin(orders, eq(shipments.orderId, orders.id))
      .innerJoin(sellerProfiles, eq(shipments.sellerId, sellerProfiles.id))
      .leftJoin(couriers, eq(shipments.courierId, couriers.id))
      .where(where)
      .orderBy(tab === "late" || tab === "ready" ? sql`${readyAt} asc` : desc(shipments.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    // Dispatch performance per boutique, last 90 days.
    db
      .select({
        shopName: sellerProfiles.shopName,
        toShip: sql<number>`count(*) filter (where ${shipments.status} = 'PENDING' and ${isReady})::int`,
        late: sql<number>`count(*) filter (where ${isLate})::int`,
        sent: sql<number>`count(*) filter (where ${shipments.dispatchedAt} is not null)::int`,
        onTime: sql<number>`count(*) filter (where ${shipments.dispatchedAt} is not null and ${shipments.dispatchedAt} - ${readyAt} <= make_interval(days => ${DISPATCH_TARGET_DAYS}))::int`,
        avgHours: sql<string | null>`round((avg(extract(epoch from (${shipments.dispatchedAt} - ${readyAt}))) filter (where ${shipments.dispatchedAt} is not null) / 3600)::numeric, 1)`,
      })
      .from(shipments)
      .innerJoin(orders, eq(shipments.orderId, orders.id))
      .innerJoin(sellerProfiles, eq(shipments.sellerId, sellerProfiles.id))
      .where(and(sql`${shipments.createdAt} > now() - interval '90 days'`, sql`${shipments.status} <> 'CANCELLED'`))
      .groupBy(sellerProfiles.id)
      .orderBy(sql`count(*) filter (where ${isLate}) desc`, sellerProfiles.shopName),
    getActiveCouriers(),
  ]);
  const counts = tabCounts[0];

  const href = (t: Tab, p = 1) => {
    const qs = new URLSearchParams();
    if (t !== "late") qs.set("tab", t);
    if (p > 1) qs.set("page", String(p));
    const s = qs.toString();
    return s ? `/admin/shipments?${s}` : "/admin/shipments";
  };

  return (
    <>
      {scoreboard.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-lg font-bold">Boutique dispatch performance (90 days)</h2>
          <div className="overflow-x-auto rounded-xl border border-border bg-surface">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wide text-text-secondary">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Boutique</th>
                  <th className="px-4 py-2.5 text-right font-medium">To dispatch</th>
                  <th className="px-4 py-2.5 text-right font-medium">Late now</th>
                  <th className="px-4 py-2.5 text-right font-medium">On time</th>
                  <th className="px-4 py-2.5 text-right font-medium">Avg. time to dispatch</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {scoreboard.map((b) => (
                  <tr key={b.shopName}>
                    <td className="px-4 py-2.5 font-medium">{b.shopName}</td>
                    <td className="px-4 py-2.5 text-right">{b.toShip}</td>
                    <td className={`px-4 py-2.5 text-right ${b.late > 0 ? "font-bold text-error" : ""}`}>{b.late}</td>
                    <td className="px-4 py-2.5 text-right">
                      {b.sent > 0 ? `${Math.round((b.onTime / b.sent) * 100)}% of ${b.sent}` : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right">{b.avgHours !== null ? hours(Number(b.avgHours)) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <div className="mb-3 flex justify-end">
        {/* A plain link: a route handler sends the file, not a page to prefetch. */}
        <a
          href="/admin/shipments/export"
          download
          className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium hover:bg-muted"
        >
          Download on-the-way packages (CSV)
        </a>
      </div>
      <nav aria-label="Filter shipments" className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {(Object.keys(TABS) as Tab[]).map((t) => (
          <Link
            key={t}
            href={href(t)}
            aria-current={tab === t ? "page" : undefined}
            className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              tab === t ? "border-primary bg-primary text-white" : t === "late" && counts.late > 0 ? "border-error/40 bg-error/10 text-error" : "border-border bg-surface hover:bg-muted"
            }`}
          >
            {TABS[t].label} <span className={tab === t ? "text-white/70" : "opacity-70"}>{counts[t]}</span>
          </Link>
        ))}
      </nav>

      {list.length === 0 ? (
        <EmptyState icon="box" title={tab === "late" ? "No late packages" : "No packages here"}>
          {tab === "late" ? "Every boutique is dispatching on time." : "Packages appear here as orders come in."}
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full min-w-[1000px] text-left text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-text-secondary">
              <tr>
                <th className="px-4 py-3 font-medium">Order</th>
                <th className="px-4 py-3 font-medium">Boutique</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Timing</th>
                <th className="px-4 py-3 font-medium">Courier &amp; tracking</th>
                <th className="px-4 py-3 text-right font-medium">COD to collect</th>
                <th className="px-4 py-3 font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {list.map((s) => {
                const cod = s.paymentMethod === "COD" && s.paymentStatus !== "PAID";
                return (
                  <tr key={s.id} className={`align-top ${s.late ? "bg-error/5" : ""}`}>
                    <td className="px-4 py-3">
                      <div className="font-mono font-semibold">{orderRef(s.orderId)}</div>
                      <div className="text-xs text-text-secondary">to {s.recipientName}</div>
                    </td>
                    <td className="px-4 py-3 font-medium">{s.shopName}</td>
                    <td className="px-4 py-3">
                      <ShipmentStatusBadge status={s.status} />
                      {s.late && <div className="mt-1 text-xs font-bold text-error">Late</div>}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {s.status === "PENDING" && !s.readyAt && <span className="text-text-secondary">Waiting for bank transfer</span>}
                      {s.status === "PENDING" && s.readyAt && (
                        <span className={s.late ? "font-medium text-error" : ""}>
                          Waiting {s.waitDays ?? 0} {s.waitDays === 1 ? "day" : "days"}
                          <span className="block text-text-secondary">ready {formatDateTime(s.readyAt)}</span>
                        </span>
                      )}
                      {s.dispatchedAt && (
                        <span>
                          Sent {formatDateTime(s.dispatchedAt)}
                          {s.waitDays !== null && (
                            <span className="block text-text-secondary">
                              {s.waitDays} {s.waitDays === 1 ? "day" : "days"} after ready
                            </span>
                          )}
                        </span>
                      )}
                      {s.deliveredAt && <span className="block text-success">Delivered {formatDateTime(s.deliveredAt)}</span>}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {s.trackingNumber ? (
                        <>
                          {s.courierName}
                          <div className="font-mono text-sm">{s.trackingNumber}</div>
                          {s.status === "DISPATCHED" && (
                            <EditTracking
                              compact
                              shipmentId={s.id}
                              couriers={s.paymentMethod === "COD" ? codCouriers(courierList) : courierList}
                              current={{ courierId: s.courierId, courierName: s.courierName, tracking: s.trackingNumber }}
                            />
                          )}
                        </>
                      ) : (
                        <span className="text-text-secondary">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {cod && s.status !== "CANCELLED" ? formatLKR(Number(s.itemsTotal) + Number(s.deliveryFee)) : <span className="text-text-secondary">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {s.status === "DISPATCHED" && (
                        <ActionForm
                          action={markShipmentDelivered}
                          fields={{ shipmentId: s.id }}
                          confirmMessage={
                            cod
                              ? `Mark delivered? Only do this once the courier has paid MIVO ${formatLKR(Number(s.itemsTotal) + Number(s.deliveryFee))}.`
                              : `Mark the ${s.shopName} package for ${orderRef(s.orderId)} as delivered?`
                          }
                        >
                          <SubmitButton tone="neutral">Mark Delivered</SubmitButton>
                        </ActionForm>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={page} total={counts[tab]} href={(p) => href(tab, p)} />
    </>
  );
}

function hours(h: number) {
  return h < 24 ? `${h.toFixed(1)} h` : `${(h / 24).toFixed(1)} days`;
}

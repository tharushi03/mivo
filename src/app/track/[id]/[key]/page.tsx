import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getGuestOrder } from "@/lib/orders";
import { OrderView } from "@/app/order/[id]/order-view";

// A guest's order, opened through the secret link from checkout and their emails.
// Wrong key = 404, exactly like a missing order, so links can't be probed.
export const metadata: Metadata = {
  title: "Your order",
  robots: { index: false, follow: false },
  // The link itself is the password: don't leak it to other sites through Referer.
  referrer: "no-referrer",
};

export default function GuestOrderPage({ params }: PageProps<"/track/[id]/[key]">) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-8">
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl border border-border bg-surface" />}>
        <GuestOrder params={params} />
      </Suspense>
    </main>
  );
}

async function GuestOrder({ params }: Pick<PageProps<"/track/[id]/[key]">, "params">) {
  await connection(); // always fresh: payment and delivery status change
  const { id, key } = await params;
  const order = await getGuestOrder(id, key);
  if (!order) notFound();
  return <OrderView order={order} access={{ kind: "guest", key }} />;
}

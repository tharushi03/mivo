import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/dal";
import { getBuyerOrder } from "@/lib/orders";
import { OrderView } from "./order-view";

export const metadata: Metadata = { title: "Your order", robots: { index: false } };

export default function OrderPage({ params }: PageProps<"/order/[id]">) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-8">
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl border border-border bg-surface" />}>
        <OrderDetails params={params} />
      </Suspense>
    </main>
  );
}

async function OrderDetails({ params }: Pick<PageProps<"/order/[id]">, "params">) {
  const user = await requireUser();
  const { id } = await params;
  const order = await getBuyerOrder(id, user.id); // null if it isn't this user's order
  if (!order) notFound();
  return <OrderView order={order} access={{ kind: "account" }} />;
}

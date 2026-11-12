import type { Metadata } from "next";
import { CartView } from "./cart-view";

export const metadata: Metadata = { title: "Your cart" };

export default function CartPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-8">
      <h1 className="mb-8 text-3xl font-bold">Your cart</h1>
      <CartView />
    </main>
  );
}

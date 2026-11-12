import { useSyncExternalStore } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

// A snapshot of the product at the time it was added. Prices are shown from
// here, but checkout (Phase 5) must re-read prices and stock from the database.
export type CartItem = {
  productId: string;
  title: string;
  price: number;
  imageUrl: string;
  shopName: string;
  /** Boutique id; each boutique ships its own package (and delivery fee). Missing in carts saved before Phase 13. */
  sellerId?: string;
  size: string;
  quantity: number;
  maxQuantity: number; // stock of THIS size at the time of adding
};

type NewCartItem = Omit<CartItem, "quantity">;

type CartState = {
  items: CartItem[];
  /** Adds (or merges) an item. Returns how many were actually added after the stock cap. */
  addItem: (item: NewCartItem, quantity: number) => number;
  removeItem: (productId: string, size: string) => void;
  updateQuantity: (productId: string, size: string, quantity: number) => void;
  clearCart: () => void;
  /**
   * Applies fresh server data. Price applies to every size of the product;
   * available stock applies only to the given size (0 removes that line).
   */
  syncProduct: (productId: string, size: string, update: { price?: number; available?: number }) => void;
};

const sameLine = (a: Pick<CartItem, "productId" | "size">, productId: string, size: string) =>
  a.productId === productId && a.size === size;

const clamp = (n: number, max: number) => Math.max(1, Math.min(Math.floor(n) || 1, Math.max(1, max)));

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],

      addItem: (item, quantity) => {
        const existing = get().items.find((i) => sameLine(i, item.productId, item.size));
        const current = existing?.quantity ?? 0;
        const next = Math.min(current + Math.max(1, Math.floor(quantity)), item.maxQuantity);
        const added = Math.max(0, next - current);
        if (added === 0) return 0;

        set((s) => ({
          items: existing
            ? s.items.map((i) =>
                sameLine(i, item.productId, item.size) ? { ...i, ...item, quantity: next } : i,
              )
            : [...s.items, { ...item, quantity: next }],
        }));
        return added;
      },

      removeItem: (productId, size) =>
        set((s) => ({ items: s.items.filter((i) => !sameLine(i, productId, size)) })),

      updateQuantity: (productId, size, quantity) =>
        set((s) => ({
          items: s.items.map((i) =>
            sameLine(i, productId, size) ? { ...i, quantity: clamp(quantity, i.maxQuantity) } : i,
          ),
        })),

      clearCart: () => set({ items: [] }),

      syncProduct: (productId, size, { price, available }) =>
        set((s) => ({
          items: s.items
            .map((i) => {
              if (i.productId !== productId) return i;
              const next = { ...i };
              if (price !== undefined) next.price = price;
              if (available !== undefined && i.size === size) {
                next.maxQuantity = available;
                next.quantity = Math.min(i.quantity, available);
              }
              return next;
            })
            .filter((i) => i.quantity > 0),
        })),
    }),
    {
      name: "mivo-cart",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ items: s.items }),
      // Rehydrate manually after mount (see CartHydration) to avoid SSR mismatches.
      skipHydration: true,
    },
  ),
);

// ---- Derived values (computed dynamically from items) ----
export const selectCount = (s: CartState) => s.items.reduce((n, i) => n + i.quantity, 0);
export const selectTotal = (s: CartState) => s.items.reduce((sum, i) => sum + i.price * i.quantity, 0);

/** True once the cart has been loaded from localStorage on the client. */
export function useCartHydrated() {
  return useSyncExternalStore(
    (onChange) => useCart.persist.onFinishHydration(onChange),
    () => useCart.persist.hasHydrated(),
    () => false, // server render: never hydrated
  );
}

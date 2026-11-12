// Shared by the cart/checkout UI and the order Server Action. The server is the
// source of truth: it recomputes everything from database prices.

/** LKR per package. Each boutique ships its own package, so a 2-boutique order pays twice. */
export const DELIVERY_FEE_PER_SHIPMENT = 400;

/** Total delivery fee for an order with `boutiques` different sellers. */
export const deliveryFeeFor = (boutiques: number) => DELIVERY_FEE_PER_SHIPMENT * Math.max(0, boutiques);

/** Number of packages (= distinct boutiques) in a cart. Old carts may lack sellerId, so fall back to the shop name. */
export const countBoutiques = (items: { sellerId?: string; shopName: string }[]) =>
  new Set(items.map((i) => i.sellerId ?? `name:${i.shopName}`)).size;

/** Converts a money value ("6450.00" or 6450) to integer cents to avoid float drift. */
export const toCents = (v: string | number) => Math.round(Number(v) * 100);
export const fromCents = (c: number) => (c / 100).toFixed(2);

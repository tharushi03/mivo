// Boutique shop links (mivo.lk/s/<slug>) and short product links (mivo.lk/p/<code>).
// Safe to import from client components: no database or secrets here.

/** Cookie set by a short product link: which boutique's link the buyer came from. */
export const REF_COOKIE = "mivo_ref";
export const REF_COOKIE_DAYS = 7;

export const SLUG = /^[a-z0-9](?:[a-z0-9-]{1,48}[a-z0-9])$/;

/** "Nethmi's Collection!" -> "nethmi-s-collection". */
export function slugify(name: string) {
  const s = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50)
    .replace(/-+$/, "");
  return s.length >= 3 ? s : `shop-${s || "mivo"}`.slice(0, 50);
}

/** Short code for a product link: the first 8 characters of its id. */
export const productCode = (productId: string) => productId.slice(0, 8);

export const PRODUCT_CODE = /^[0-9a-f]{8}$/;

export const shopPath = (slug: string) => `/s/${slug}`;
export const productLinkPath = (productId: string) => `/p/${productCode(productId)}`;

/** Sri Lankan numbers: 0771234567, 077 123 4567, +94771234567, 94771234567 -> "0771234567". */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/[\s()-]/g, "");
  const m = digits.match(/^(?:\+?94|0)(\d{9})$/);
  return m ? `0${m[1]}` : null;
}

/** wa.me link for a stored 0771234567 number, with an optional first message. */
export function whatsappLink(phone: string, text?: string) {
  const intl = `94${phone.replace(/^0/, "")}`;
  return `https://wa.me/${intl}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

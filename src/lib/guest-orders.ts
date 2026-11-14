// Guest checkout: orders placed without an account.
//
// A guest opens their order through a secret link: /track/<orderId>/<key>. The key is
// an HMAC of the order id made with AUTH_SECRET, so:
//   - it can't be guessed or worked out from the order id (256-bit MAC, cut to 192 bits),
//   - nothing secret is stored in the database (a database leak gives no working links),
//   - every email can carry the same link without saving it anywhere.
// Rotating AUTH_SECRET makes old guest links stop working (and logs everyone out).
import { createHmac, timingSafeEqual } from "node:crypto";

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set");
  return s;
}

const mac = (purpose: string, value: string) => createHmac("sha256", secret()).update(`${purpose}:${value}`).digest();

/** The secret part of a guest order's link. */
export function guestKey(orderId: string) {
  return mac("guest-order", orderId).subarray(0, 24).toString("base64url"); // 32 characters
}

/** Constant-time check of a guest link's key. */
export function isValidGuestKey(orderId: string, key: string | null | undefined) {
  if (typeof key !== "string" || !/^[A-Za-z0-9_-]{32}$/.test(key)) return false;
  const expected = Buffer.from(guestKey(orderId));
  const given = Buffer.from(key);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Where a buyer opens their order: the account page, or the guest's secret link. */
export function buyerOrderPath(orderId: string, isGuest: boolean) {
  return isGuest ? `/track/${orderId}/${guestKey(orderId)}` : `/order/${orderId}`;
}

// ---------------------------------------------------------------- Bot check

// The guest checkout form carries a signed "form opened at" time. Bots that post the
// form straight away (or replay an old one) are refused; people take longer than this.
const MIN_FILL_MS = 3_000;
const MAX_AGE_MS = 6 * 60 * 60_000;

/** A signed timestamp to put in the checkout form. */
export function formStamp(now = Date.now()) {
  const t = String(now);
  return `${t}.${mac("form-stamp", t).subarray(0, 16).toString("base64url")}`;
}

/** True if `stamp` was made by formStamp() between 3 seconds and 6 hours ago. */
export function checkFormStamp(stamp: unknown, now = Date.now()) {
  if (typeof stamp !== "string") return false;
  const [t, sig] = stamp.split(".");
  if (!t || !sig || !/^\d{10,16}$/.test(t)) return false;
  const expected = Buffer.from(mac("form-stamp", t).subarray(0, 16).toString("base64url"));
  const given = Buffer.from(sig);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return false;
  const age = now - Number(t);
  return age >= MIN_FILL_MS && age <= MAX_AGE_MS;
}

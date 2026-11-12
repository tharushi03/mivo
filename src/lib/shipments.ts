// Labels and small helpers for packages (one shipment per boutique per order).

export const SHIPMENT_STATUS_LABEL = {
  PENDING: "Preparing",
  DISPATCHED: "On the way",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
  RETURNED: "Returned",
} as const;

export type ShipmentStatus = keyof typeof SHIPMENT_STATUS_LABEL;

/** A boutique should dispatch within this many days of the order being ready to ship. */
export const DISPATCH_TARGET_DAYS = 2;

/** Tracking numbers: letters, digits, spaces and dashes, 4-60 characters. Normalised to upper case. */
export function normaliseTracking(raw: string) {
  const t = raw.trim().replace(/\s+/g, " ").toUpperCase();
  return /^[A-Z0-9][A-Z0-9 -]{2,58}[A-Z0-9]$/.test(t) ? t : null;
}

/** True if a package that became ready to ship at `readySince` is past the dispatch target. */
export function isOverdue(readySince: Date | null) {
  return readySince !== null && Date.now() - readySince.getTime() > DISPATCH_TARGET_DAYS * 24 * 60 * 60 * 1000;
}

// Platform bank account shown to buyers who choose Bank Transfer.
// Set these in .env.local (and in Dokploy's environment variables).
export function getPlatformBankDetails() {
  return {
    bankName: process.env.PLATFORM_BANK_NAME ?? "",
    branch: process.env.PLATFORM_BANK_BRANCH ?? "",
    accountName: process.env.PLATFORM_BANK_ACCOUNT_NAME ?? "",
    accountNumber: process.env.PLATFORM_BANK_ACCOUNT_NUMBER ?? "",
  };
}

/** Short, human-friendly order reference used for bank transfer remarks. */
export const orderRef = (orderId: string) => `MIVO-${orderId.slice(0, 8).toUpperCase()}`;

/** Unpaid bank-transfer orders (no slip uploaded) are cancelled this long after checkout, freeing the stock. */
export const PAYMENT_DEADLINE_HOURS = 72;
/** ...and the buyer gets one reminder email this long after checkout. */
export const PAYMENT_REMINDER_HOURS = 24;

/** Grace after the admin rejects a slip: the order isn't auto-cancelled before this, so the buyer can send a new one. */
export const SLIP_REJECTED_GRACE_HOURS = 48;

/** When an unpaid order is cancelled: 72 hours after checkout, or 48 hours after a slip was rejected if that's later. */
export function paymentDeadline(createdAt: Date, slipRejectedAt?: Date | null) {
  const normal = createdAt.getTime() + PAYMENT_DEADLINE_HOURS * 3_600_000;
  const afterReject = slipRejectedAt ? slipRejectedAt.getTime() + SLIP_REJECTED_GRACE_HOURS * 3_600_000 : 0;
  return new Date(Math.max(normal, afterReject));
}

/**
 * The bank transaction number the buyer types (e.g. "ft 2431 0098 77"), stored as "FT2431009877"
 * so the same receipt typed two ways is still spotted as a duplicate. Null if it isn't plausible.
 */
export function normaliseSlipReference(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") return null;
  const ref = value.toUpperCase().replace(/\s+/g, "");
  return /^[A-Z0-9][A-Z0-9\-/.#:]{3,39}$/.test(ref) ? ref : null;
}

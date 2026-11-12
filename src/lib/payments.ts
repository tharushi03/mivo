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

export const paymentDeadline = (createdAt: Date) => new Date(createdAt.getTime() + PAYMENT_DEADLINE_HOURS * 3_600_000);

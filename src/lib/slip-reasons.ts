// Why an admin rejects a bank slip. The text is shown to the buyer (order page + email).
// Client-safe: also used by the admin's reject form.
export const SLIP_REJECT_REASONS = {
  NO_PAYMENT: "We couldn't find this payment in MIVO's bank account.",
  NO_ORDER_REF: "The slip doesn't show your order number.",
  WRONG_AMOUNT: "The amount on the slip doesn't match your order total.",
  UNREADABLE: "The slip photo is unclear or cut off.",
  ALREADY_USED: "This slip was already used for another order.",
  OTHER: "",
} as const;

export type SlipRejectReason = keyof typeof SLIP_REJECT_REASONS;

/** Labels for the admin's dropdown. */
export const SLIP_REJECT_LABEL: Record<SlipRejectReason, string> = {
  NO_PAYMENT: "Payment not in the bank",
  NO_ORDER_REF: "No order number on the slip",
  WRONG_AMOUNT: "Wrong amount",
  UNREADABLE: "Unclear / cut-off photo",
  ALREADY_USED: "Slip already used for another order",
  OTHER: "Other (write below)",
};

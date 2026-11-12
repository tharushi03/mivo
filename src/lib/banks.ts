// Licensed commercial banks in Sri Lanka, for the seller bank-details form.
// Shown as suggestions only; sellers can type any other bank.
export const SRI_LANKAN_BANKS = [
  "Bank of Ceylon",
  "People's Bank",
  "Commercial Bank of Ceylon",
  "Hatton National Bank",
  "Sampath Bank",
  "Seylan Bank",
  "Nations Trust Bank",
  "National Development Bank (NDB)",
  "DFCC Bank",
  "Pan Asia Bank",
  "Union Bank of Colombo",
  "Cargills Bank",
  "Amana Bank",
  "National Savings Bank (NSB)",
  "HSBC",
  "Standard Chartered",
] as const;

/** "1234567890" -> "•••• 7890", for places where the full number isn't needed. */
export function maskAccount(accountNumber: string | null | undefined) {
  if (!accountNumber) return null;
  return `•••• ${accountNumber.slice(-4)}`;
}

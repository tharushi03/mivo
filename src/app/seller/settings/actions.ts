"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { sellerProfiles } from "@/db/schema";
import { requireSeller } from "@/lib/dal";

type Field = "bankName" | "bankBranch" | "bankAccountName" | "bankAccountNumber" | "confirmAccountNumber";

export type BankFormState = {
  ok?: boolean;
  error?: string;
  fieldErrors?: Partial<Record<Field, string>>;
  values?: Partial<Record<Field, string>>;
};

/** Saves where MIVO should send this boutique's payouts. */
export async function saveBankDetails(_prev: BankFormState, formData: FormData): Promise<BankFormState> {
  const { profile } = await requireSeller();
  if (!profile) return { error: "Your account has no boutique profile. Please contact MIVO support." };

  const text = (k: Field, max: number) => String(formData.get(k) ?? "").trim().replace(/\s+/g, " ").slice(0, max);
  const values = {
    bankName: text("bankName", 100),
    bankBranch: text("bankBranch", 100),
    bankAccountName: text("bankAccountName", 255),
    bankAccountNumber: text("bankAccountNumber", 40),
    confirmAccountNumber: text("confirmAccountNumber", 40),
  };
  // Banks print numbers with spaces or dashes; store digits only.
  const accountNumber = values.bankAccountNumber.replace(/[\s-]/g, "");
  const confirm = values.confirmAccountNumber.replace(/[\s-]/g, "");

  const fieldErrors: BankFormState["fieldErrors"] = {};
  if (values.bankName.length < 2) fieldErrors.bankName = "Enter your bank's name.";
  if (values.bankBranch.length < 2) fieldErrors.bankBranch = "Enter the branch, e.g. Kandy or Colombo 03.";
  if (values.bankAccountName.length < 2) fieldErrors.bankAccountName = "Enter the name on the account exactly as the bank has it.";
  if (!/^\d{6,20}$/.test(accountNumber)) fieldErrors.bankAccountNumber = "Account numbers are 6 to 20 digits.";
  else if (confirm !== accountNumber) fieldErrors.confirmAccountNumber = "The two account numbers don't match.";
  if (Object.keys(fieldErrors).length > 0) return { fieldErrors, values };

  const changed =
    profile.bankName !== values.bankName ||
    profile.bankBranch !== values.bankBranch ||
    profile.bankAccountName !== values.bankAccountName ||
    profile.bankAccountNumber !== accountNumber;

  if (changed) {
    await db
      .update(sellerProfiles)
      .set({
        bankName: values.bankName,
        bankBranch: values.bankBranch,
        bankAccountName: values.bankAccountName,
        bankAccountNumber: accountNumber,
        // Lets the admin see "changed recently" before sending money.
        bankDetailsUpdatedAt: new Date(),
      })
      .where(eq(sellerProfiles.id, profile.id));
    revalidatePath("/seller/settings");
    revalidatePath("/admin/payouts");
  }

  return { ok: true, values: { ...values, bankAccountNumber: accountNumber, confirmAccountNumber: accountNumber } };
}

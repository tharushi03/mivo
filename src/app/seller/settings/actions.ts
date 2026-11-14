"use server";

import { revalidatePath, updateTag } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { sellerProfiles } from "@/db/schema";
import { requireSeller } from "@/lib/dal";
import { PRODUCTS_TAG } from "@/lib/catalog";
import { SLUG, normalizePhone } from "@/lib/shop-links";

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

// ---------------------------------------------------------------- Shop link + WhatsApp

export type ShopLinkState = {
  ok?: boolean;
  error?: string;
  fieldErrors?: Partial<Record<"slug" | "whatsapp", string>>;
  values?: { slug: string; whatsapp: string };
};

/** Saves the boutique's shop link (mivo.lk/s/<slug>) and its WhatsApp number for buyers. */
export async function saveShopLink(_prev: ShopLinkState, formData: FormData): Promise<ShopLinkState> {
  const { profile } = await requireSeller();
  if (!profile) return { error: "Your account has no boutique profile. Please contact MIVO support." };

  const values = {
    slug: String(formData.get("slug") ?? "").trim().toLowerCase().slice(0, 60),
    whatsapp: String(formData.get("whatsapp") ?? "").trim().slice(0, 30),
  };
  const whatsapp = values.whatsapp ? normalizePhone(values.whatsapp) : null;
  const fieldErrors: ShopLinkState["fieldErrors"] = {};
  if (!SLUG.test(values.slug)) fieldErrors.slug = "Use 3 to 50 lowercase letters, numbers and dashes, e.g. nethmi-collection.";
  if (values.whatsapp && !whatsapp) fieldErrors.whatsapp = "Enter a Sri Lankan mobile number, e.g. 077 123 4567.";
  if (Object.keys(fieldErrors).length > 0) return { fieldErrors, values };

  try {
    await db.update(sellerProfiles).set({ slug: values.slug, whatsappNumber: whatsapp }).where(eq(sellerProfiles.id, profile.id));
  } catch (err) {
    // seller_profiles_slug_unique: another boutique has this link.
    if ((err as { cause?: { code?: string } }).cause?.code === "23505" || (err as { code?: string }).code === "23505") {
      return { fieldErrors: { slug: "Another boutique already uses this link. Try a different one." }, values };
    }
    throw err;
  }
  // The old link stops working straight away; shop pages and product pages show the new one.
  updateTag(PRODUCTS_TAG);
  revalidatePath("/seller/settings");
  revalidatePath("/seller/dashboard");
  return { ok: true, values: { slug: values.slug, whatsapp: whatsapp ?? "" } };
}

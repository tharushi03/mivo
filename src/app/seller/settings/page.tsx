import { Suspense } from "react";
import type { Metadata } from "next";
import { requireSeller } from "@/lib/dal";
import { formatDateTime } from "@/lib/format";
import { BankDetailsForm } from "./bank-details-form";

export const metadata: Metadata = { title: "Store settings", robots: { index: false } };

export default function SellerSettingsPage() {
  return (
    <main className="mx-auto max-w-2xl p-4 sm:p-8">
      <h1 className="text-3xl font-bold">Store settings</h1>
      <p className="mb-8 mt-1 text-text-secondary">Where MIVO sends the money from your sales.</p>
      <Suspense fallback={<div className="h-[28rem] animate-pulse rounded-xl border border-border bg-surface" />}>
        <Settings />
      </Suspense>
    </main>
  );
}

async function Settings() {
  const { profile } = await requireSeller();
  if (!profile) {
    return (
      <p className="rounded-xl border border-error/30 bg-error/10 p-4 text-sm text-error">
        Your account has no boutique profile yet. Please contact MIVO support.
      </p>
    );
  }

  return (
    <section className="rounded-xl border border-border bg-surface p-6 sm:p-8">
      <h2 className="text-lg font-bold">Bank details for payouts</h2>
      <p className="mb-6 mt-1 text-sm text-text-secondary">
        MIVO transfers your earnings (sales minus the {Number(profile.commissionRate)}% commission) to this account after
        orders are delivered.
        {profile.bankDetailsUpdatedAt && <> Last updated {formatDateTime(profile.bankDetailsUpdatedAt)}.</>}
      </p>
      <BankDetailsForm
        initial={{
          bankName: profile.bankName ?? "",
          bankBranch: profile.bankBranch ?? "",
          bankAccountName: profile.bankAccountName ?? "",
          bankAccountNumber: profile.bankAccountNumber ?? "",
        }}
      />
    </section>
  );
}

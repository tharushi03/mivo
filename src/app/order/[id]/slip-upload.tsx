"use client";

import { useActionState } from "react";
import { uploadPaymentSlip, type SlipState } from "@/app/actions/payment-slip";

export function SlipUpload({ orderId, hasSlip }: { orderId: string; hasSlip: boolean }) {
  const [state, formAction, pending] = useActionState<SlipState, FormData>(uploadPaymentSlip, {});

  return (
    <form action={formAction} className="mt-4 rounded-xl border border-dashed border-accent/50 bg-surface p-4">
      <input type="hidden" name="orderId" value={orderId} />
      <label htmlFor="slip" className="block text-sm font-semibold">
        {hasSlip ? "Uploaded the wrong slip? Replace it" : "Already paid? Upload your bank slip"}
      </label>
      <p className="mb-3 mt-0.5 text-xs text-text-secondary">
        A photo or screenshot (JPG, PNG or WebP, up to 5 MB) helps us confirm your payment faster.
      </p>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          id="slip"
          name="slip"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          required
          className="min-w-0 flex-1 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-2 file:text-sm file:font-medium hover:file:bg-border"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
        >
          {pending ? "Uploading…" : hasSlip ? "Replace slip" : "Upload slip"}
        </button>
      </div>
      {state.error && (
        <p role="alert" className="mt-2 text-sm text-error">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p role="status" className="mt-2 text-sm text-success">
          Slip received. We&apos;ll verify your payment shortly.
        </p>
      )}
    </form>
  );
}

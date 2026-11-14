"use client";

import { useActionState } from "react";
import { uploadPaymentSlip, type SlipState } from "@/app/actions/payment-slip";

export function SlipUpload({
  orderId,
  orderRef,
  hasSlip,
  guestKey,
}: {
  orderId: string;
  /** MIVO-1A2B3C4D: what the buyer must have written on the slip / in the transfer remarks. */
  orderRef: string;
  hasSlip: boolean;
  guestKey?: string | null;
}) {
  const [state, formAction, pending] = useActionState<SlipState, FormData>(uploadPaymentSlip, {});

  return (
    <form action={formAction} className="mt-4 rounded-xl border border-dashed border-accent/50 bg-surface p-4">
      <input type="hidden" name="orderId" value={orderId} />
      {guestKey && <input type="hidden" name="key" value={guestKey} />}
      <p className="text-sm font-semibold">{hasSlip ? "Uploaded the wrong slip? Replace it" : "Already paid? Upload your bank slip"}</p>
      <p className="mb-3 mt-0.5 text-xs text-text-secondary">All three are needed so we can match your payment quickly.</p>

      <div className="space-y-3">
        <div>
          <label htmlFor="slip" className="block text-sm font-medium">
            1. Photo or screenshot of the slip
          </label>
          <input
            id="slip"
            name="slip"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            required
            aria-describedby="slip-help"
            className="mt-1 block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-2 file:text-sm file:font-medium hover:file:bg-border"
          />
          <p id="slip-help" className="mt-0.5 text-xs text-text-secondary">
            JPG, PNG or WebP, up to 5 MB. Make sure the amount, date and order number are readable.
          </p>
        </div>

        <div>
          <label htmlFor="slip-reference" className="block text-sm font-medium">
            2. Bank transaction reference number
          </label>
          <input
            id="slip-reference"
            name="reference"
            required
            minLength={4}
            maxLength={40}
            autoComplete="off"
            placeholder="e.g. FT24310098775"
            aria-describedby="slip-reference-help"
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm uppercase placeholder:normal-case sm:max-w-xs"
          />
          <p id="slip-reference-help" className="mt-0.5 text-xs text-text-secondary">
            The number printed on your bank receipt or shown in your banking app after the transfer (not your account number).
          </p>
        </div>

        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="confirmOrderRef" value="yes" required className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-accent)]" />
          <span>
            3. I wrote <strong className="font-mono">{orderRef}</strong> on the slip or in the transfer remarks.
          </span>
        </label>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="mt-4 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
      >
        {pending ? "Uploading…" : hasSlip ? "Replace slip" : "Upload slip"}
      </button>
      {state.error && (
        <p role="alert" className="mt-2 text-sm text-error">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p role="status" className="mt-2 text-sm text-success">
          Slip received (reference {state.reference}). We&apos;ll verify your payment shortly.
        </p>
      )}
    </form>
  );
}

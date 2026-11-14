"use client";

import { useActionState, useState } from "react";
import { rejectSlip, verifyPayment, type ActionResult } from "@/app/actions/admin-orders";
import { SLIP_REJECT_LABEL, SLIP_REJECT_REASONS, type SlipRejectReason } from "@/lib/slip-reasons";

/** Verify / Reject, right under the slip. */
export function ReviewActions({
  orderId,
  orderRef,
  amount,
  hasSlip,
  suggestReason,
}: {
  orderId: string;
  orderRef: string;
  amount: string;
  hasSlip: boolean;
  /** Pre-selected reason, e.g. ALREADY_USED when the same slip is on another order. */
  suggestReason?: SlipRejectReason;
}) {
  const [verifyState, verify, verifying] = useActionState<ActionResult, FormData>(verifyPayment, {});
  const [rejectState, reject, rejecting] = useActionState<ActionResult, FormData>(rejectSlip, {});
  const [reason, setReason] = useState<SlipRejectReason | "">(suggestReason ?? "");

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <form
        action={verify}
        onSubmit={(e) => {
          if (!window.confirm(`Confirm you can see ${amount} for ${orderRef} in MIVO's bank account?`)) e.preventDefault();
        }}
        className="rounded-xl border border-success/40 bg-success/5 p-4"
      >
        <input type="hidden" name="orderId" value={orderId} />
        <p className="text-sm font-semibold">The money is in the bank</p>
        <p className="mt-0.5 text-xs text-text-secondary">Boutiques are told to pack, and the buyer is emailed.</p>
        <button
          type="submit"
          disabled={verifying || rejecting}
          className="mt-3 w-full rounded-lg bg-success px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
        >
          {verifying ? "Verifying…" : "Verify Payment"}
        </button>
        {verifyState.error && (
          <p role="alert" className="mt-2 text-xs text-error">
            {verifyState.error}
          </p>
        )}
      </form>

      {hasSlip && (
        <form
          action={reject}
          onSubmit={(e) => {
            if (!window.confirm(`Reject this slip for ${orderRef}? The buyer is emailed the reason and asked for a new slip.`)) e.preventDefault();
          }}
          className="rounded-xl border border-error/40 bg-error/5 p-4"
        >
          <input type="hidden" name="orderId" value={orderId} />
          <label htmlFor="reject-reason" className="text-sm font-semibold">
            Reject this slip
          </label>
          <select
            id="reject-reason"
            name="reason"
            required
            value={reason}
            onChange={(e) => setReason(e.target.value as SlipRejectReason)}
            className="mt-2 w-full rounded-md border border-border bg-background p-2 text-sm"
          >
            <option value="" disabled>
              Choose a reason…
            </option>
            {(Object.keys(SLIP_REJECT_REASONS) as SlipRejectReason[]).map((r) => (
              <option key={r} value={r}>
                {SLIP_REJECT_LABEL[r]}
              </option>
            ))}
          </select>
          {reason && reason !== "OTHER" && <p className="mt-1 text-xs text-text-secondary">Buyer sees: “{SLIP_REJECT_REASONS[reason]}”</p>}
          <input
            name="note"
            maxLength={120}
            required={reason === "OTHER"}
            placeholder={reason === "OTHER" ? "Reason for the buyer" : "Extra note for the buyer (optional)"}
            aria-label="Note for the buyer"
            className="mt-2 w-full rounded-md border border-border bg-background p-2 text-sm"
          />
          <button
            type="submit"
            disabled={verifying || rejecting}
            className="mt-3 w-full rounded-lg border border-error bg-surface px-4 py-2.5 text-sm font-semibold text-error hover:bg-error/10 disabled:opacity-60"
          >
            {rejecting ? "Rejecting…" : "Reject Slip"}
          </button>
          {rejectState.error && (
            <p role="alert" className="mt-2 text-xs text-error">
              {rejectState.error}
            </p>
          )}
        </form>
      )}
    </div>
  );
}

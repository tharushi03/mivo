"use client";

import { useActionState } from "react";
import { resendConfirmation } from "@/app/actions/email-confirmation";

/** Shown to accounts that haven't confirmed their email yet. */
export function ConfirmEmailBanner({ email, reason }: { email: string; reason: string }) {
  const [state, action, pending] = useActionState(resendConfirmation, {});
  return (
    <div role="status" className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/40 bg-accent/5 p-4 text-sm">
      <p>
        <strong>Confirm your email.</strong> We sent a link to <strong>{email}</strong>. {reason}
      </p>
      <form action={action} className="flex items-center gap-2">
        {state.ok && <span className="text-success">Sent. Check your inbox.</span>}
        {state.error && <span className="text-error">{state.error}</span>}
        <button
          type="submit"
          disabled={pending}
          className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-60"
        >
          {pending ? "Sending…" : "Resend email"}
        </button>
      </form>
    </div>
  );
}

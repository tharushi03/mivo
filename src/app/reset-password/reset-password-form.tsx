"use client";

import { useActionState } from "react";
import Link from "next/link";
import { submitNewPassword, type ResetState } from "./actions";

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState<ResetState, FormData>(submitNewPassword, {});
  const input = "w-full rounded-md border border-border bg-background p-2 outline-none focus:border-accent";

  if (!token) {
    return (
      <div className="w-full max-w-md rounded-xl border border-border bg-surface p-8 text-center shadow-sm">
        <h1 className="mb-2 text-2xl font-bold">Link not valid</h1>
        <p className="text-sm text-text-secondary">Open the link from your email again, or request a new one.</p>
        <Link href="/forgot-password" className="mt-6 inline-block font-medium text-accent hover:underline">
          Request a new link
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="w-full max-w-md rounded-xl border border-border bg-surface p-8 shadow-sm">
      <h1 className="mb-1 text-center text-2xl font-bold">Choose a new password</h1>
      <p className="mb-6 text-center text-sm text-text-secondary">You&apos;ll be signed out on every device and can log in with the new one.</p>

      {state.error && (
        <p role="alert" className="mb-4 rounded-md bg-error/10 p-2 text-center text-sm text-error">
          {state.error}{" "}
          <Link href="/forgot-password" className="font-medium underline">
            Request a new link
          </Link>
        </p>
      )}
      <input type="hidden" name="token" value={token} />

      <label className="mb-4 block">
        <span className="mb-1 block text-sm font-medium">New password</span>
        <input name="password" type="password" autoComplete="new-password" required minLength={8} maxLength={72} className={input} />
        {state.fieldErrors?.password && <span className="mt-1 block text-xs text-error">{state.fieldErrors.password}</span>}
      </label>
      <label className="mb-6 block">
        <span className="mb-1 block text-sm font-medium">Type it again</span>
        <input name="confirm" type="password" autoComplete="new-password" required minLength={8} maxLength={72} className={input} />
        {state.fieldErrors?.confirm && <span className="mt-1 block text-xs text-error">{state.fieldErrors.confirm}</span>}
      </label>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-accent p-2 font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save new password"}
      </button>
    </form>
  );
}

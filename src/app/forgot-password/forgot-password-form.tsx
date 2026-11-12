"use client";

import { useActionState } from "react";
import Link from "next/link";
import { requestPasswordReset, type ForgotState } from "./actions";

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState<ForgotState, FormData>(requestPasswordReset, {});

  return (
    <div className="w-full max-w-md rounded-xl border border-border bg-surface p-8 shadow-sm">
      <h1 className="mb-1 text-center text-2xl font-bold">Forgot your password?</h1>
      {state.sent ? (
        <div role="status" className="mt-4 text-center text-sm">
          <p>
            If an account exists for <strong>{state.email}</strong>, we&apos;ve emailed a link to reset the password. It works
            for 30 minutes.
          </p>
          <p className="mt-3 text-text-secondary">No email after a few minutes? Check your spam folder, or try again.</p>
        </div>
      ) : (
        <form action={formAction}>
          <p className="mb-6 text-center text-sm text-text-secondary">Enter your email and we&apos;ll send you a reset link.</p>
          {state.error && (
            <p role="alert" className="mb-4 rounded-md bg-error/10 p-2 text-center text-sm text-error">
              {state.error}
            </p>
          )}
          <label className="mb-6 block">
            <span className="mb-1 block text-sm font-medium">Email</span>
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              defaultValue={state.email}
              className="w-full rounded-md border border-border bg-background p-2 outline-none focus:border-accent"
            />
          </label>
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-md bg-accent p-2 font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
          >
            {pending ? "Sending…" : "Send reset link"}
          </button>
        </form>
      )}
      <p className="mt-6 text-center text-sm text-text-secondary">
        <Link href="/login" className="font-medium text-accent hover:underline">
          Back to login
        </Link>
      </p>
    </div>
  );
}

"use client";

import { useActionState } from "react";
import Link from "next/link";
import { register, type RegisterState } from "./actions";

const input = "w-full rounded-md border border-border bg-background p-2 outline-none focus:border-accent";

export function RegisterForm({ callbackUrl }: { callbackUrl?: string }) {
  const [state, formAction, pending] = useActionState<RegisterState, FormData>(register, {});
  const e = state.fieldErrors ?? {};
  const loginHref = callbackUrl ? `/login?callbackUrl=${encodeURIComponent(callbackUrl)}` : "/login";

  return (
    <form action={formAction} className="w-full max-w-md rounded-xl border border-border bg-surface p-8 shadow-sm">
      <h1 className="mb-1 text-center text-2xl font-bold">Create your account</h1>
      <p className="mb-6 text-center text-sm text-text-secondary">Shop curated pieces from local boutiques</p>

      {state.error && (
        <p role="alert" className="mb-4 rounded-md bg-error/10 p-2 text-center text-sm text-error">
          {state.error}
        </p>
      )}

      <input type="hidden" name="callbackUrl" value={callbackUrl ?? ""} />

      <label className="mb-4 block">
        <span className="mb-1 block text-sm font-medium">Name</span>
        <input name="name" defaultValue={state.values?.name} autoComplete="name" required className={input} />
        {e.name && <span className="mt-1 block text-xs text-error">{e.name}</span>}
      </label>

      <label className="mb-4 block">
        <span className="mb-1 block text-sm font-medium">Email</span>
        <input name="email" type="email" defaultValue={state.values?.email} autoComplete="email" required className={input} />
        {e.email && <span className="mt-1 block text-xs text-error">{e.email}</span>}
      </label>

      <label className="mb-6 block">
        <span className="mb-1 block text-sm font-medium">Password</span>
        <input name="password" type="password" autoComplete="new-password" minLength={8} required className={input} />
        <span className={`mt-1 block text-xs ${e.password ? "text-error" : "text-text-secondary"}`}>
          {e.password ?? "At least 8 characters."}
        </span>
      </label>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-accent p-2 font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
      >
        {pending ? "Creating account…" : "Create account"}
      </button>

      <p className="mt-3 text-center text-xs text-text-secondary">
        By creating an account you agree to our{" "}
        <Link href="/terms" className="underline hover:text-accent">Terms of Service</Link> and{" "}
        <Link href="/privacy" className="underline hover:text-accent">Privacy Policy</Link>.
      </p>

      <p className="mt-6 text-center text-sm text-text-secondary">
        Already have an account?{" "}
        <Link href={loginHref} className="font-medium text-accent hover:underline">
          Log in
        </Link>
      </p>
    </form>
  );
}

"use client";

import { useActionState } from "react";
import Link from "next/link";
import { login, type LoginState } from "./actions";

export function LoginForm({ callbackUrl, notice }: { callbackUrl?: string; notice?: string }) {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(login, {});

  return (
    <form
      action={formAction}
      className="w-full max-w-md rounded-xl border border-border bg-surface p-8 shadow-sm"
    >
      <h1 className="mb-1 text-center text-2xl font-bold">Login to MIVO</h1>
      <p className="mb-6 text-center text-sm text-text-secondary">Welcome back</p>

      {notice && !state.error && (
        <p role="status" className="mb-4 rounded-md bg-success/10 p-2 text-center text-sm text-success">
          {notice}
        </p>
      )}
      {state.error && (
        <p role="alert" className="mb-4 rounded-md bg-error/10 p-2 text-center text-sm text-error">
          {state.error}
        </p>
      )}

      <input type="hidden" name="callbackUrl" value={callbackUrl ?? ""} />

      <label className="mb-4 block">
        <span className="mb-1 block text-sm font-medium">Email</span>
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          className="w-full rounded-md border border-border bg-background p-2 outline-none focus:border-accent"
        />
      </label>

      <label className="mb-6 block">
        <span className="mb-1 flex items-baseline justify-between text-sm font-medium">
          Password
          <Link href="/forgot-password" className="text-xs font-normal text-accent hover:underline">
            Forgot password?
          </Link>
        </span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="w-full rounded-md border border-border bg-background p-2 outline-none focus:border-accent"
        />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-accent p-2 font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
      >
        {pending ? "Signing in…" : "Sign In"}
      </button>

      <p className="mt-6 text-center text-sm text-text-secondary">
        New to MIVO?{" "}
        <Link
          href={callbackUrl ? `/register?callbackUrl=${encodeURIComponent(callbackUrl)}` : "/register"}
          className="font-medium text-accent hover:underline"
        >
          Create an account
        </Link>
      </p>
      <p className="mt-2 text-center text-sm text-text-secondary">
        Own a boutique?{" "}
        <Link href="/become-a-seller" className="font-medium text-accent hover:underline">
          Sell on MIVO
        </Link>
      </p>
    </form>
  );
}

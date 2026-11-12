"use client";

import { useActionState } from "react";
import Link from "next/link";
import { registerSeller, type SellerSignupState } from "./actions";

const input = "w-full rounded-md border border-border bg-background p-2.5 outline-none transition-colors focus:border-accent";

function FieldError({ msg }: { msg?: string }) {
  return msg ? <p className="mt-1 text-xs text-error">{msg}</p> : null;
}

export function SellerSignupForm() {
  const [state, formAction, pending] = useActionState<SellerSignupState, FormData>(registerSeller, {});
  const v = state.values ?? {};
  const e = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-4 rounded-xl border border-border bg-surface p-6 shadow-sm sm:p-8">
      <h2 className="text-xl font-bold">Apply to sell</h2>

      {state.error && (
        <p role="alert" className="rounded-md bg-error/10 p-3 text-sm text-error">
          {state.error}
        </p>
      )}

      <div>
        <label htmlFor="shopName" className="mb-1 block text-sm font-medium">
          Boutique name
        </label>
        <input id="shopName" name="shopName" defaultValue={v.shopName} required maxLength={120} className={input} placeholder="Colombo Batik House" />
        <FieldError msg={e.shopName} />
      </div>

      <div>
        <label htmlFor="instagram" className="mb-1 block text-sm font-medium">
          Instagram <span className="font-normal text-text-secondary">(recommended)</span>
        </label>
        <input id="instagram" name="instagram" defaultValue={v.instagram} maxLength={200} className={input} placeholder="@yourboutique or instagram.com/yourboutique" />
        <p className="mt-1 text-xs text-text-secondary">Helps us review your boutique faster.</p>
        <FieldError msg={e.instagram} />
      </div>

      <div>
        <label htmlFor="ownerName" className="mb-1 block text-sm font-medium">
          Your name
        </label>
        <input id="ownerName" name="ownerName" defaultValue={v.ownerName} required maxLength={255} autoComplete="name" className={input} />
        <FieldError msg={e.ownerName} />
      </div>

      <div>
        <label htmlFor="email" className="mb-1 block text-sm font-medium">
          Email
        </label>
        <input id="email" name="email" type="email" defaultValue={v.email} required autoComplete="email" className={input} />
        <FieldError msg={e.email} />
      </div>

      <div>
        <label htmlFor="password" className="mb-1 block text-sm font-medium">
          Password
        </label>
        <input id="password" name="password" type="password" required minLength={8} maxLength={72} autoComplete="new-password" className={input} />
        <p className="mt-1 text-xs text-text-secondary">At least 8 characters.</p>
        <FieldError msg={e.password} />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-accent py-3 font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
      >
        {pending ? "Creating your boutique…" : "Create boutique account"}
      </button>

      <p className="text-center text-xs text-text-secondary">
        By applying you agree to our{" "}
        <Link href="/terms" className="underline hover:text-accent">Terms of Service</Link> and{" "}
        <Link href="/privacy" className="underline hover:text-accent">Privacy Policy</Link>.
      </p>
      <p className="text-center text-sm text-text-secondary">
        Already selling on MIVO?{" "}
        <Link href="/login" className="font-medium text-accent hover:underline">
          Log in
        </Link>
      </p>
    </form>
  );
}

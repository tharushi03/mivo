"use client";

import { useActionState } from "react";
import { saveShopLink, type ShopLinkState } from "./actions";

const input = "w-full rounded-md border border-border bg-background p-2.5 outline-none transition-colors focus:border-accent";

export function ShopLinkForm({ initial, origin }: { initial: { slug: string; whatsapp: string }; origin: string }) {
  const [state, formAction, pending] = useActionState<ShopLinkState, FormData>(saveShopLink, {});
  const v = { ...initial, ...state.values };
  const e = state.fieldErrors ?? {};

  return (
    <form key={JSON.stringify(state)} action={formAction} className="space-y-5">
      {state.error && (
        <p role="alert" className="rounded-md bg-error/10 p-3 text-sm text-error">
          {state.error}
        </p>
      )}
      <div>
        <label htmlFor="slug" className="mb-1 block text-sm font-medium">
          Your shop link
        </label>
        <div className="flex items-center overflow-hidden rounded-md border border-border bg-background focus-within:border-accent">
          <span className="shrink-0 border-r border-border bg-muted px-2.5 py-2.5 text-sm text-text-secondary">{origin.replace(/^https?:\/\//, "")}/s/</span>
          <input id="slug" name="slug" defaultValue={v.slug} required maxLength={50} className="min-w-0 flex-1 bg-transparent p-2.5 outline-none" placeholder="nethmi-collection" autoComplete="off" />
        </div>
        <p className="mt-1 text-xs text-text-secondary">If you change it, links you already shared to your shop page stop working. Product links keep working.</p>
        {e.slug && <p className="mt-1 text-xs text-error">{e.slug}</p>}
      </div>
      <div>
        <label htmlFor="whatsapp" className="mb-1 block text-sm font-medium">
          WhatsApp number <span className="font-normal text-text-secondary">(optional)</span>
        </label>
        <input id="whatsapp" name="whatsapp" type="tel" inputMode="tel" defaultValue={v.whatsapp} className={input} placeholder="077 123 4567" />
        <p className="mt-1 text-xs text-text-secondary">Customers see an &quot;Ask on WhatsApp&quot; button on your shop and product pages.</p>
        {e.whatsapp && <p className="mt-1 text-xs text-error">{e.whatsapp}</p>}
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-60">
          {pending ? "Saving…" : "Save"}
        </button>
        {state.ok && <span role="status" className="text-sm text-success">✓ Saved</span>}
      </div>
    </form>
  );
}

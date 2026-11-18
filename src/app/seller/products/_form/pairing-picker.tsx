"use client";

import { useState } from "react";
import { MAX_PAIRINGS } from "./pairings";

export type PairingOption = { id: string; title: string; imageUrl: string; isActive: boolean };

/**
 * "Style it with": the boutique ticks up to 4 of its own products to show under this one.
 * Sends one `pairWith` value per ticked product, in the order they were ticked.
 */
export function PairingPicker({ options, initial, error }: { options: PairingOption[]; initial: string[]; error?: string }) {
  const [picked, setPicked] = useState<string[]>(initial.filter((id) => options.some((o) => o.id === id)));
  const full = picked.length >= MAX_PAIRINGS;

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : full ? p : [...p, id]));

  return (
    <fieldset>
      <legend className="mb-1 block text-sm font-medium">
        Style it with <span className="font-normal text-text-secondary">(optional, up to {MAX_PAIRINGS})</span>
      </legend>
      <p className="mb-3 text-xs text-text-secondary">
        Pick pieces from your shop that go with this one. Buyers see them on the product page with an Add button. If you
        pick none, MIVO suggests matching pieces from your shop.
      </p>
      {picked.map((id) => (
        <input key={id} type="hidden" name="pairWith" value={id} />
      ))}
      {options.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-4 text-sm text-text-secondary">
          Add more products to your shop, then come back to pair them.
        </p>
      ) : (
        <ul className="grid max-h-80 grid-cols-2 gap-2 overflow-y-auto rounded-lg border border-border bg-background p-2 sm:grid-cols-3">
          {options.map((o) => {
            const on = picked.includes(o.id);
            return (
              <li key={o.id}>
                <label
                  className={`flex cursor-pointer items-center gap-2 rounded-md border p-2 text-xs transition-colors ${
                    on ? "border-accent bg-accent/10" : "border-transparent hover:bg-muted"
                  } ${!on && full ? "cursor-not-allowed opacity-50" : ""}`}
                >
                  <input type="checkbox" checked={on} disabled={!on && full} onChange={() => toggle(o.id)} className="h-4 w-4 shrink-0 accent-accent" />
                  {/* eslint-disable-next-line @next/next/no-img-element -- small thumbnail of the seller's own photo */}
                  <img src={o.imageUrl} alt="" className="h-10 w-8 shrink-0 rounded object-cover" />
                  <span className="line-clamp-2">
                    {o.title}
                    {!o.isActive && <span className="text-text-secondary"> (archived)</span>}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-1 text-xs text-text-secondary">
        {picked.length} of {MAX_PAIRINGS} picked
      </p>
      {error && <p className="mt-1 text-xs text-error">{error}</p>}
    </fieldset>
  );
}

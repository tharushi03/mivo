"use client";

import { useState } from "react";
import type { VariantRow } from "./variants";

type Row = VariantRow & { key: number };

const PRESETS = [
  { label: "XS – XL", sizes: ["XS", "S", "M", "L", "XL"] },
  { label: "S – XXL", sizes: ["S", "M", "L", "XL", "XXL"] },
  { label: "Free size", sizes: ["FREE SIZE"] },
];

const cell = "w-full rounded-md border border-border bg-background p-2.5 outline-none transition-colors focus:border-accent";

// React keys for rows (module-level so it isn't render state).
let nextKey = 1;
const withKey = (r: VariantRow): Row => ({ ...r, key: nextKey++ });
const blankRow = () => withKey({ size: "", stock: "", original: null });

/**
 * One row per size with its own stock count. Inputs are controlled, so the rows
 * survive a failed submit. Existing sizes (original !== null) can be restocked
 * but not renamed or removed; setting them to 0 hides them from buyers.
 * Sent as parallel `variantSize` / `variantStock` / `variantOriginal` fields.
 */
export function VariantEditor({ initial, error }: { initial: VariantRow[]; error?: string }) {
  const [rows, setRows] = useState<Row[]>(() => (initial.length > 0 ? initial.map(withKey) : [blankRow()]));
  const hasExisting = rows.some((r) => r.original !== null);

  const update = (key: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch, note: undefined } : r)));

  function applyPreset(sizes: string[]) {
    setRows((rs) => {
      // Keep stock already typed for sizes that stay in the list.
      const typed = new Map(rs.map((r) => [r.size.trim().toUpperCase(), r.stock]));
      return sizes.map((s) => withKey({ size: s, stock: typed.get(s) ?? "", original: null }));
    });
  }

  const total = rows.reduce((n, r) => n + (Number.isInteger(Number(r.stock)) ? Number(r.stock) : 0), 0);

  return (
    <fieldset>
      <legend className="mb-1 block text-sm font-medium">Sizes &amp; stock</legend>
      <p className="mb-3 text-xs text-text-secondary">
        Enter how many you have of <strong>each</strong> size. Sizes with 0 stay hidden from buyers until you restock.
      </p>

      {/* Presets replace the list, so they're only offered for a brand-new product. */}
      {!hasExisting && (
        <div className="mb-3 flex flex-wrap gap-2">
          <span className="self-center text-xs text-text-secondary">Quick fill:</span>
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => applyPreset(p.sizes)}
              className="rounded-full border border-border px-3 py-1 text-xs font-medium transition-colors hover:border-accent hover:text-accent-hover"
            >
              {p.label}
            </button>
          ))}
        </div>
      )}

      <div className="space-y-2">
        <div className="grid grid-cols-[1fr_7rem_2.5rem] gap-2 text-xs font-medium text-text-secondary">
          <span>Size</span>
          <span>In stock</span>
          <span className="sr-only">Remove</span>
        </div>
        {rows.map((r, i) => {
          const existing = r.original !== null;
          return (
            <div key={r.key}>
              <div className="grid grid-cols-[1fr_7rem_2.5rem] items-center gap-2">
                <input type="hidden" name="variantOriginal" value={existing ? String(r.original) : ""} />
                <input
                  name="variantSize"
                  value={r.size}
                  onChange={(e) => update(r.key, { size: e.target.value })}
                  readOnly={existing}
                  maxLength={20}
                  placeholder={i === 0 ? "e.g. M" : "Size"}
                  aria-label={`Size ${i + 1}`}
                  title={existing ? "Existing sizes can't be renamed. Set stock to 0 to hide it." : undefined}
                  className={`${cell} uppercase ${existing ? "cursor-default bg-muted/40 font-medium" : ""}`}
                />
                <input
                  name="variantStock"
                  type="number"
                  min="0"
                  step="1"
                  inputMode="numeric"
                  value={r.stock}
                  onChange={(e) => update(r.key, { stock: e.target.value })}
                  placeholder="0"
                  aria-label={`Stock for size ${r.size || i + 1}`}
                  className={`${cell} ${r.note ? "border-error" : ""}`}
                />
                {existing ? (
                  <span className="text-center text-[11px] text-text-secondary" title={`In stock when you opened this page: ${r.original}`}>
                    {Number(r.stock) === 0 ? "hidden" : ""}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setRows((rs) => (rs.length === 1 ? [blankRow()] : rs.filter((x) => x.key !== r.key)))}
                    aria-label={`Remove size ${r.size || i + 1}`}
                    className="h-10 rounded-md text-lg text-text-secondary transition-colors hover:bg-muted hover:text-error"
                  >
                    ×
                  </button>
                )}
              </div>
              {r.note && <p className="mt-1 text-xs text-error">{r.note}</p>}
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex items-center justify-between text-sm">
        <button
          type="button"
          onClick={() => setRows((rs) => [...rs, blankRow()])}
          disabled={rows.length >= 20}
          className="font-medium text-accent hover:text-accent-hover disabled:opacity-50"
        >
          + Add {hasExisting ? "a new size" : "size"}
        </button>
        <span className="text-text-secondary">
          Total: <strong className="text-text">{total}</strong> pieces
        </span>
      </div>
      {error && <p className="mt-2 text-xs text-error">{error}</p>}
    </fieldset>
  );
}

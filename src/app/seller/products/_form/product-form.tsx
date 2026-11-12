"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { createProduct, updateProduct, type ProductFormState } from "./actions";
import { CATEGORIES } from "./categories";
import { VariantEditor } from "./variant-editor";
import type { VariantRow } from "./variants";

/** Present when editing an existing product. */
export type EditableProduct = {
  id: string;
  title: string;
  description: string;
  price: string;
  category: string;
  isActive: boolean;
  imageUrl: string;
  variants: VariantRow[];
};

const input =
  "w-full rounded-md border border-border bg-background p-2.5 outline-none transition-colors focus:border-accent";

function FieldError({ msg }: { msg?: string }) {
  return msg ? <p className="mt-1 text-xs text-error">{msg}</p> : null;
}

export function ProductForm({ product }: { product?: EditableProduct }) {
  const editing = Boolean(product);
  const [state, formAction, pending] = useActionState<ProductFormState, FormData>(editing ? updateProduct : createProduct, {});
  const [preview, setPreview] = useState<string | null>(null);
  // Before the first submit, show the product as saved; afterwards, what was sent.
  const v = state.values ?? (product ? { ...product, isActive: product.isActive ? "on" : "" } : {});
  const e = state.fieldErrors ?? {};
  const variantRows = state.variants ?? product?.variants ?? [];

  // Free the object URL when the preview changes or the form unmounts.
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  return (
    <form action={formAction} className="space-y-6 rounded-xl border border-border bg-surface p-6 sm:p-8">
      {product && <input type="hidden" name="productId" value={product.id} />}
      {state.error && (
        <p role="alert" className="rounded-md bg-error/10 p-3 text-sm text-error">
          {state.error}
        </p>
      )}

      <div>
        <label htmlFor="image" className="mb-1 block text-sm font-medium">
          Product photo
        </label>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex aspect-[3/4] w-32 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed border-border bg-background text-xs text-text-secondary">
            {preview || product ? (
              // eslint-disable-next-line @next/next/no-img-element -- local blob preview or current photo
              <img src={preview ?? product!.imageUrl} alt="Preview" className="h-full w-full object-cover" />
            ) : (
              "No image"
            )}
          </div>
          <div className="text-sm">
            <input
              id="image"
              name="image"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              required={!editing}
              onChange={(ev) => {
                const file = ev.target.files?.[0];
                setPreview(file ? URL.createObjectURL(file) : null);
              }}
              className="block text-sm file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-2 file:text-sm file:font-medium hover:file:bg-border"
            />
            <p className="mt-2 text-xs text-text-secondary">
              {editing ? "Leave empty to keep the current photo. " : ""}JPG, PNG or WebP, up to 5 MB. Portrait (3:4) looks best.
            </p>
            {(state.fieldErrors || state.error) && preview && <p className="mt-1 text-xs text-text-secondary">Please re-select the photo.</p>}
            <FieldError msg={e.image} />
          </div>
        </div>
      </div>

      <div>
        <label htmlFor="title" className="mb-1 block text-sm font-medium">
          Title
        </label>
        <input id="title" name="title" defaultValue={v.title} maxLength={255} required className={input} placeholder="Linen wrap dress" />
        <FieldError msg={e.title} />
      </div>

      <div>
        <label htmlFor="description" className="mb-1 block text-sm font-medium">
          Description <span className="font-normal text-text-secondary">(optional)</span>
        </label>
        <textarea
          id="description"
          name="description"
          defaultValue={v.description}
          rows={4}
          maxLength={5000}
          className={input}
          placeholder="Fabric, fit, measurements, care instructions…"
        />
        <FieldError msg={e.description} />
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div>
          <label htmlFor="price" className="mb-1 block text-sm font-medium">
            Price (LKR)
          </label>
          <input id="price" name="price" type="number" min="1" step="0.01" defaultValue={v.price} required className={input} placeholder="4500" />
          <FieldError msg={e.price} />
        </div>

        <div>
          <label htmlFor="category" className="mb-1 block text-sm font-medium">
            Category
          </label>
          <select id="category" name="category" defaultValue={v.category ?? ""} required className={input}>
            <option value="" disabled>
              Choose…
            </option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <FieldError msg={e.category} />
        </div>
      </div>

      {/* Remount when the server sends rows back (e.g. fresh stock after a conflict). */}
      <VariantEditor key={JSON.stringify(variantRows)} initial={variantRows} error={e.variants} />

      {editing && (
        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-background p-4">
          <input
            type="checkbox"
            name="isActive"
            defaultChecked={v.isActive === "on"}
            className="mt-0.5 h-4 w-4 accent-accent"
          />
          <span className="text-sm">
            <span className="font-medium">Show on the storefront</span>
            <span className="block text-text-secondary">
              Untick to archive this product. It disappears from the shop, but past orders, invoices and payouts keep
              working.
            </span>
          </span>
        </label>
      )}

      <div className="flex flex-col-reverse gap-3 border-t border-border pt-6 sm:flex-row sm:justify-end">
        <Link
          href="/seller/dashboard"
          className="rounded-lg border border-border px-5 py-2.5 text-center font-medium transition-colors hover:bg-muted"
        >
          Cancel
        </Link>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-accent px-6 py-2.5 font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
        >
          {pending ? "Saving…" : editing ? "Save changes" : "Save Product"}
        </button>
      </div>
    </form>
  );
}

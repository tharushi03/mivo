"use server";

import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, max } from "drizzle-orm";
import { db } from "@/db";
import { orderItems, productVariants, products } from "@/db/schema";
import { requireSeller } from "@/lib/dal";
import { PRODUCTS_TAG } from "@/lib/catalog";
import { MAX_IMAGE_BYTES, deleteImage, detectImageType, saveImage } from "@/lib/storage";
import { CATEGORIES } from "./categories";
import { parseVariants, type VariantRow } from "./variants";

type Field = "title" | "description" | "price" | "category" | "variants" | "image";
type TextField = "title" | "description" | "price" | "category" | "isActive";

export type ProductFormState = {
  error?: string;
  fieldErrors?: Partial<Record<Field, string>>;
  values?: Partial<Record<TextField, string>>;
  /** The size rows to show again (what was sent, or fresh stock after a conflict). */
  variants?: VariantRow[];
};

class ProductConflict extends Error {
  constructor(message: string, public rows?: VariantRow[]) {
    super(message);
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Validates everything except the image. Shared by create and update. */
function readDetails(formData: FormData) {
  const text = (k: TextField) => String(formData.get(k) ?? "").trim();
  const values = {
    title: text("title"),
    description: text("description"),
    price: text("price"),
    category: text("category"),
    isActive: formData.get("isActive") === "on" ? "on" : "",
  };

  const fieldErrors: NonNullable<ProductFormState["fieldErrors"]> = {};
  if (!values.title) fieldErrors.title = "Title is required.";
  else if (values.title.length > 255) fieldErrors.title = "Keep the title under 255 characters.";

  if (values.description.length > 5000) fieldErrors.description = "Keep the description under 5000 characters.";

  const price = Number(values.price);
  if (!values.price || !Number.isFinite(price) || price <= 0) fieldErrors.price = "Enter a price above 0.";
  else if (price > 99_999_999) fieldErrors.price = "That price is too high.";

  if (!(CATEGORIES as readonly string[]).includes(values.category)) fieldErrors.category = "Choose a category.";

  const { variants, rows, error: variantError } = parseVariants(formData);
  if (variantError) fieldErrors.variants = variantError;

  return { values, price, variants, rows, fieldErrors };
}

/** Reads and checks the uploaded photo. `required` is false when editing (keep the old one). */
async function readImage(formData: FormData, required: boolean) {
  const image = formData.get("image");
  if (!(image instanceof File) || image.size === 0) {
    return required ? { error: "Please choose a product photo." } : {};
  }
  if (image.size > MAX_IMAGE_BYTES) return { error: "Image must be 5 MB or smaller." };
  const buf = Buffer.from(await image.arrayBuffer());
  const ext = detectImageType(buf);
  if (!ext) return { error: "Only JPG, PNG or WebP images are allowed." };
  return { buf, ext };
}

function refreshProductPages(productId?: string) {
  updateTag(PRODUCTS_TAG); // storefront, product pages, "Sold out" badges
  revalidatePath("/seller/dashboard");
  if (productId) revalidatePath(`/seller/products/${productId}/edit`);
}

// ------------------------------------------------------------------ Create

export async function createProduct(_prev: ProductFormState, formData: FormData): Promise<ProductFormState> {
  const { profile } = await requireSeller();
  if (!profile) return { error: "Your account has no boutique profile. Please contact MIVO support." };

  const { values, price, variants, rows, fieldErrors } = readDetails(formData);
  const image = await readImage(formData, true);
  if (image.error) fieldErrors.image = image.error;
  if (Object.keys(fieldErrors).length > 0 || !image.buf || !image.ext) return { fieldErrors, values, variants: rows };

  const imageUrl = await saveImage(image.buf, image.ext);
  try {
    // Product and its sizes are saved together, or not at all.
    await db.transaction(async (tx) => {
      const [product] = await tx
        .insert(products)
        .values({
          sellerId: profile.id,
          title: values.title,
          description: values.description || null,
          price: price.toFixed(2),
          category: values.category,
          imageUrl,
          isActive: true,
        })
        .returning({ id: products.id });
      await tx
        .insert(productVariants)
        .values(variants.map((v, position) => ({ productId: product.id, size: v.size, stock: v.stock, position })));
    });
  } catch (err) {
    await deleteImage(imageUrl); // don't leave orphaned files
    console.error("createProduct failed", err);
    return { error: "Could not save the product. Please try again.", values, variants: rows };
  }

  refreshProductPages();
  redirect("/seller/dashboard");
}

// ------------------------------------------------------------------ Update

/**
 * Saves edits to a product the seller owns: details, price, archive flag,
 * optional new photo, stock per size, and new sizes.
 *
 * Stock is updated safely while buyers may be checking out:
 * - A size whose number the seller did NOT touch is left alone, so a sale that
 *   happened during editing isn't overwritten with the old number.
 * - A size the seller DID change is only saved if its stock is still what the
 *   page showed. Otherwise nothing is saved, and the form comes back with the
 *   current stock so the seller can decide (e.g. "had 3, one just sold, now 2").
 * - Sizes can't be deleted here (that would orphan order history); setting
 *   stock to 0 hides a size from buyers.
 */
export async function updateProduct(_prev: ProductFormState, formData: FormData): Promise<ProductFormState> {
  const { profile } = await requireSeller();
  if (!profile) return { error: "Your account has no boutique profile. Please contact MIVO support." };

  const productId = String(formData.get("productId") ?? "");
  if (!UUID.test(productId)) return { error: "Invalid product." };

  const { values, price, variants, rows, fieldErrors } = readDetails(formData);
  const image = await readImage(formData, false);
  if (image.error) fieldErrors.image = image.error;
  if (Object.keys(fieldErrors).length > 0) return { fieldErrors, values, variants: rows };

  // Save the new photo first; it's deleted again if the update fails.
  const newImageUrl = image.buf && image.ext ? await saveImage(image.buf, image.ext) : null;
  let oldImageUrl: string | null = null;

  try {
    await db.transaction(async (tx) => {
      // Lock order matches checkout (product, then its sizes), so the two can't deadlock.
      const [product] = await tx
        .select({ id: products.id, imageUrl: products.imageUrl })
        .from(products)
        .where(and(eq(products.id, productId), eq(products.sellerId, profile.id))) // only your own products
        .for("update");
      if (!product) throw new ProductConflict("Product not found.");

      const current = await tx
        .select({ id: productVariants.id, size: productVariants.size, stock: productVariants.stock })
        .from(productVariants)
        .where(eq(productVariants.productId, productId))
        .orderBy(productVariants.size)
        .for("update");
      const bySize = new Map(current.map((v) => [v.size, v]));

      // 1. Check every changed size before writing anything.
      const changed: string[] = [];
      for (const v of variants) {
        const live = bySize.get(v.size);
        if (v.original === null) {
          if (live) throw new ProductConflict(`Size ${v.size} already exists. Change its stock in its own row instead.`);
          continue;
        }
        if (!live) throw new ProductConflict(`Size ${v.size} no longer exists. Reload the page.`);
        if (v.stock !== v.original && live.stock !== v.original) changed.push(v.size);
      }
      if (changed.length > 0) {
        // Show the live numbers as the new starting point, keeping what the seller typed.
        const fresh = rows.map((r) => {
          const live = bySize.get(r.size);
          if (!live || r.original === null) return r;
          return changed.includes(r.size)
            ? { ...r, original: live.stock, note: `Changed while you were editing: was ${r.original}, now ${live.stock} (sold or restocked).` }
            : { ...r, original: live.stock, stock: r.stock === String(r.original) ? String(live.stock) : r.stock };
        });
        throw new ProductConflict(
          `Stock for ${changed.join(", ")} changed while you were editing. Check the numbers below and save again.`,
          fresh,
        );
      }

      // 2. Write.
      for (const v of variants) {
        const live = bySize.get(v.size);
        if (live && v.stock !== v.original) {
          await tx.update(productVariants).set({ stock: v.stock }).where(eq(productVariants.id, live.id));
        }
      }
      const added = variants.filter((v) => v.original === null);
      if (added.length > 0) {
        const [{ top }] = await tx
          .select({ top: max(productVariants.position) })
          .from(productVariants)
          .where(eq(productVariants.productId, productId));
        await tx
          .insert(productVariants)
          .values(added.map((v, i) => ({ productId, size: v.size, stock: v.stock, position: (top ?? -1) + 1 + i })));
      }

      await tx
        .update(products)
        .set({
          title: values.title,
          description: values.description || null,
          price: price.toFixed(2),
          category: values.category,
          isActive: values.isActive === "on",
          ...(newImageUrl ? { imageUrl: newImageUrl } : {}),
        })
        .where(eq(products.id, productId));

      if (newImageUrl) oldImageUrl = product.imageUrl;
    });
  } catch (err) {
    if (newImageUrl) await deleteImage(newImageUrl);
    if (err instanceof ProductConflict) return { error: err.message, values, variants: err.rows ?? rows };
    console.error("updateProduct failed", err);
    return { error: "Could not save your changes. Please try again.", values, variants: rows };
  }

  // Only after the new one is committed, and only if no order shows the old photo
  // (order history keeps the photo the buyer actually bought).
  if (oldImageUrl) {
    const [used] = await db.select({ id: orderItems.id }).from(orderItems).where(eq(orderItems.productImageUrl, oldImageUrl)).limit(1);
    if (!used) await deleteImage(oldImageUrl);
  }
  refreshProductPages(productId);
  redirect("/seller/dashboard?saved=1");
}

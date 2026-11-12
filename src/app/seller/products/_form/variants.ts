// Size rows shared by the Add and Edit product forms and their Server Actions.
//
// Each row is sent as three parallel form fields:
//   variantSize      "M"
//   variantStock     "4"      what the seller wants the stock to be
//   variantOriginal  "2"      the stock when the page was loaded ("" = a new size)
//
// `original` lets the server tell "the seller changed this number" apart from
// "a buyer bought one while the seller was editing" (see updateProduct).

export type VariantRow = {
  size: string;
  stock: string;
  /** Stock when the form was loaded. null = a size the seller is adding now. */
  original: number | null;
  /** Shown under the row, e.g. when stock changed during editing. */
  note?: string;
};

export type ParsedVariant = { size: string; stock: number; original: number | null };

export const MAX_SIZES = 20;
export const MAX_STOCK = 10_000;

/** Reads the size rows. Blank new rows are ignored; "m" and "M " count as the same size. */
export function parseVariants(formData: FormData): { variants: ParsedVariant[]; rows: VariantRow[]; error?: string } {
  const sizes = formData.getAll("variantSize").map((v) => String(v).trim().toUpperCase().slice(0, 40));
  const stocks = formData.getAll("variantStock").map((v) => String(v).trim().slice(0, 12));
  const originals = formData.getAll("variantOriginal").map((v) => String(v).trim());

  // Echo of what was submitted, so the form can show it again after an error.
  const rows: VariantRow[] = sizes.slice(0, MAX_SIZES + 5).map((size, i) => {
    const o = Number(originals[i]);
    return { size, stock: stocks[i] ?? "", original: originals[i] && Number.isInteger(o) && o >= 0 ? o : null };
  });

  const variants: ParsedVariant[] = [];
  const seen = new Set<string>();
  const fail = (error: string) => ({ variants, rows, error });

  for (const row of rows) {
    const { size, original } = row;
    const rawStock = row.stock;
    if (!size && !rawStock && original === null) continue; // empty new row
    if (!size) return fail("Every row with a stock number needs a size name.");
    if (size.length > 20) return fail(`Size "${size.slice(0, 20)}…" is too long (20 characters max).`);
    if (seen.has(size)) return fail(`Size ${size} is listed twice.`);
    const stock = Number(rawStock);
    if (rawStock === "" || !Number.isInteger(stock) || stock < 0 || stock > MAX_STOCK) {
      return fail(`Enter a whole-number stock (0 to ${MAX_STOCK.toLocaleString("en-US")}) for size ${size}.`);
    }
    seen.add(size);
    variants.push({ size, stock, original });
  }

  if (variants.length === 0) return fail('Add at least one size, e.g. "M" or "Free Size".');
  if (variants.length > MAX_SIZES) return fail(`You can list up to ${MAX_SIZES} sizes.`);
  return { variants, rows };
}

// MIVO's category tree: department (Women / Men / Kids) › category › sub-category.
// The menu, the /c/... pages, product pages and the boutique product form all read
// this list, so adding a sub-category is a one-line change here (no migration needed:
// products store the slugs, e.g. department "women", category "dresses", subcategory "frocks").
//
// Slugs are permanent once products use them: rename a label freely, never a slug.

export type Sub = { slug: string; label: string };
export type Category = { slug: string; label: string; subs: Sub[] };
export type Department = { slug: string; label: string; categories: Category[] };

const s = (label: string, slug?: string): Sub => ({
  label,
  slug: slug ?? label.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
});
const c = (label: string, subs: Sub[] = [], slug?: string): Category => ({ ...s(label, slug), subs });

export const DEPARTMENTS: Department[] = [
  {
    slug: "women",
    label: "Women",
    categories: [
      c("Dresses", [s("Casual Dresses"), s("Frocks"), s("Party Dresses"), s("Maxi Dresses"), s("Jumpsuits")]),
      c("Tops", [s("Tops & T-Shirts"), s("Blouses"), s("Shirts"), s("Crop Tops")]),
      c("Bottoms", [s("Pants & Trousers"), s("Jeans"), s("Skirts"), s("Shorts")]),
      c("Ethnic", [s("Sarees"), s("Kurti & Kurtha", "kurti"), s("Batik"), s("Lehenga & Desi"), s("Osariya")]),
      c("Activewear", [s("Sports Tops"), s("Leggings"), s("Sets")]),
      c("Nightwear & Lingerie", [s("Nightwear"), s("Bra & Underwear")], "nightwear"),
      c("Maternity"),
      c("Accessories", [s("Jewellery"), s("Bags"), s("Hair Accessories"), s("Scarves & Shawls"), s("Sunglasses")]),
    ],
  },
  {
    slug: "men",
    label: "Men",
    categories: [
      c("Shirts", [s("Casual Shirts"), s("Formal Shirts"), s("Batik Shirts")]),
      c("T-Shirts & Polos", [s("T-Shirts"), s("Polo Shirts")], "t-shirts"),
      c("Bottoms", [s("Trousers"), s("Jeans"), s("Shorts")]),
      c("Ethnic", [s("Sarongs"), s("Batik"), s("Kurtha"), s("National Dress")]),
      c("Activewear", [s("Sports Tops"), s("Track Pants"), s("Sets")]),
      c("Innerwear & Nightwear", [s("Innerwear"), s("Nightwear")], "innerwear"),
      c("Accessories", [s("Belts"), s("Wallets"), s("Ties & Cufflinks"), s("Watches"), s("Caps & Sunglasses"), s("Bags")]),
    ],
  },
  {
    slug: "kids",
    label: "Kids",
    categories: [
      c("Girls", [s("Frocks"), s("Tops"), s("Bottoms"), s("Sets"), s("Party Wear")]),
      c("Boys", [s("Shirts"), s("T-Shirts"), s("Bottoms"), s("Sets")]),
      c("Baby", [s("Rompers & Sets"), s("Baby Frocks"), s("Baby Essentials")]),
      c("Teen", [s("Dresses"), s("Tops"), s("Bottoms")]),
      c("School Wear"),
      c("Nightwear"),
      c("Accessories", [s("Bags"), s("Hair Accessories"), s("Watches")]),
    ],
  },
];

export function findDepartment(slug: string | null | undefined) {
  return DEPARTMENTS.find((d) => d.slug === slug);
}

export function findCategory(dept: string | null | undefined, cat: string | null | undefined) {
  return findDepartment(dept)?.categories.find((x) => x.slug === cat);
}

export function findSub(dept: string | null | undefined, cat: string | null | undefined, sub: string | null | undefined) {
  return findCategory(dept, cat)?.subs.find((x) => x.slug === sub);
}

/**
 * True if the three values form a real place in the tree. A category with
 * sub-categories needs one; a category without any (e.g. Maternity) must have none.
 */
export function isValidPlacement(dept: string, cat: string, sub: string) {
  const category = findCategory(dept, cat);
  if (!category) return false;
  return category.subs.length === 0 ? sub === "" : category.subs.some((x) => x.slug === sub);
}

/** Breadcrumb for a product or page: [{label, href}], e.g. Women › Dresses › Frocks. */
export function categoryTrail(dept: string | null | undefined, cat?: string | null, sub?: string | null) {
  const d = findDepartment(dept);
  if (!d) return [];
  const trail = [{ label: d.label, href: `/c/${d.slug}` }];
  const category = d.categories.find((x) => x.slug === cat);
  if (category) {
    trail.push({ label: category.label, href: `/c/${d.slug}/${category.slug}` });
    const sb = category.subs.find((x) => x.slug === sub);
    if (sb) trail.push({ label: sb.label, href: `/c/${d.slug}/${category.slug}/${sb.slug}` });
  }
  return trail;
}

/** "Women › Dresses › Frocks", or "No category" for old products without one. */
export function categoryLabel(dept: string | null | undefined, cat?: string | null, sub?: string | null) {
  const trail = categoryTrail(dept, cat, sub);
  return trail.length > 1 ? trail.map((t) => t.label).join(" › ") : "No category";
}

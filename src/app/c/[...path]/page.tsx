import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SORTS, getCategoryProducts, type Sort } from "@/lib/catalog";
import { categoryTrail, findDepartment } from "@/lib/categories";
import { ProductCard } from "@/components/product-card";
import { EmptyState } from "@/components/empty-state";

// Menu pages: /c/women, /c/women/dresses, /c/women/dresses/frocks.
// Only paths in src/lib/categories.ts exist; anything else is a 404.

function resolve(path: string[]) {
  if (path.length < 1 || path.length > 3) return null;
  const [d, c, s] = path;
  const dept = findDepartment(d);
  if (!dept) return null;
  const category = c ? dept.categories.find((x) => x.slug === c) : undefined;
  if (c && !category) return null;
  const sub = s ? category?.subs.find((x) => x.slug === s) : undefined;
  if (s && !sub) return null;
  return { dept, category, sub };
}

export async function generateMetadata({ params }: PageProps<"/c/[...path]">): Promise<Metadata> {
  const place = resolve((await params).path);
  if (!place) return { title: "Not found" };
  const { dept, category, sub } = place;
  const title = sub ? `${sub.label} · ${dept.label}` : category ? `${dept.label}'s ${category.label}` : `${dept.label}'s clothing`;
  return { title, description: `Shop ${title.toLowerCase()} from Sri Lankan boutiques. Island-wide delivery, cash on delivery.` };
}

export default function CategoryPage({ params, searchParams }: PageProps<"/c/[...path]">) {
  return (
    <main className="mx-auto max-w-6xl px-4 pb-16 sm:px-8">
      <Suspense fallback={<div className="mt-10 h-96 animate-pulse rounded-xl border border-border bg-surface" />}>
        <Listing params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

const pill = "shrink-0 whitespace-nowrap rounded-full border px-4 py-2 text-sm font-medium transition-colors";
const pillOn = `${pill} border-primary bg-primary text-white`;
const pillOff = `${pill} border-border bg-surface hover:border-primary`;

async function Listing({ params, searchParams }: Pick<PageProps<"/c/[...path]">, "params" | "searchParams">) {
  const place = resolve((await params).path);
  if (!place) notFound();
  const { dept, category, sub } = place;

  const rawSort = (await searchParams).sort;
  const sort: Sort = typeof rawSort === "string" && rawSort in SORTS ? (rawSort as Sort) : "new";
  const items = await getCategoryProducts(dept.slug, category?.slug ?? null, sub?.slug ?? null, sort);

  const trail = categoryTrail(dept.slug, category?.slug, sub?.slug);
  const here = trail[trail.length - 1].href;
  const title = sub?.label ?? category?.label ?? `${dept.label}'s clothing`;
  const withSort = (href: string) => (sort === "new" ? href : `${href}?sort=${sort}`);

  // The swipeable row: a category's sub-categories, or the department's categories.
  const row =
    category && category.subs.length > 0
      ? {
          all: { label: `All ${category.label}`, href: `/c/${dept.slug}/${category.slug}`, on: !sub },
          items: category.subs.map((x) => ({ label: x.label, href: `/c/${dept.slug}/${category.slug}/${x.slug}`, on: x.slug === sub?.slug })),
        }
      : {
          all: { label: `All ${dept.label}`, href: `/c/${dept.slug}`, on: !category },
          items: dept.categories.map((x) => ({ label: x.label, href: `/c/${dept.slug}/${x.slug}`, on: x.slug === category?.slug })),
        };

  return (
    <>
      <nav aria-label="Breadcrumb" className="pt-6 text-xs text-text-secondary">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li>
            <Link href="/" className="hover:text-accent-hover">Home</Link>
          </li>
          {trail.map((t, i) => (
            <li key={t.href} className="flex items-center gap-1.5">
              <span aria-hidden="true">›</span>
              {i === trail.length - 1 ? (
                <span aria-current="page" className="text-text">{t.label}</span>
              ) : (
                <Link href={t.href} className="hover:text-accent-hover">{t.label}</Link>
              )}
            </li>
          ))}
        </ol>
      </nav>

      <header className="py-6 sm:py-8">
        <h1 className="text-3xl font-bold uppercase tracking-wide sm:text-4xl">{title}</h1>
        <p className="mt-1 text-sm text-text-secondary">
          {items.length} {items.length === 1 ? "piece" : "pieces"}
        </p>
      </header>

      {/* Swipe sideways on phones; wraps onto more lines on wide screens. */}
      <nav aria-label={`${category?.label ?? dept.label} sections`} className="-mx-4 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:px-0">
        <ul className="flex gap-2 sm:flex-wrap">
          {[row.all, ...row.items].map((x) => (
            <li key={x.href}>
              <Link href={withSort(x.href)} aria-current={x.on ? "page" : undefined} className={x.on ? pillOn : pillOff}>
                {x.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mt-6 mb-6 flex items-center justify-between border-y border-border py-3 text-sm">
        <span className="text-text-secondary">
          {items.length} {items.length === 1 ? "result" : "results"}
        </span>
        {/* Works without JavaScript: a disclosure with plain links. */}
        <details className="group relative">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 font-medium [&::-webkit-details-marker]:hidden">
            Sort: {SORTS[sort]}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className="transition-transform group-open:rotate-180">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </summary>
          <ul className="absolute right-0 z-20 mt-2 w-52 overflow-hidden rounded-lg border border-border bg-surface py-1 shadow-lg">
            {(Object.keys(SORTS) as Sort[]).map((k) => (
              <li key={k}>
                <Link
                  href={k === "new" ? here : `${here}?sort=${k}`}
                  aria-current={k === sort ? "true" : undefined}
                  className={`block px-4 py-2 hover:bg-muted ${k === sort ? "font-semibold text-accent-hover" : ""}`}
                >
                  {SORTS[k]}
                </Link>
              </li>
            ))}
          </ul>
        </details>
      </div>

      {items.length === 0 ? (
        <EmptyState icon="hanger" title="Coming soon">
          Our boutiques haven&apos;t added {title.toLowerCase()} yet.{" "}
          <Link href={`/c/${dept.slug}`} className="font-medium text-accent-hover underline">
            See all {dept.label.toLowerCase()}&apos;s clothing
          </Link>
        </EmptyState>
      ) : (
        <ul className="grid grid-cols-2 gap-x-3 gap-y-8 sm:gap-x-6 sm:gap-y-10 md:grid-cols-3 lg:grid-cols-4">
          {items.map((p, i) => (
            <li key={p.id}>
              <ProductCard product={p} priority={i < 4} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

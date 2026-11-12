import Link from "next/link";

export const PAGE_SIZE = 20;

/** Reads ?page= safely: always an integer >= 1. */
export function parsePage(value: string | string[] | undefined) {
  const n = Number(Array.isArray(value) ? value[0] : value);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

type Props = {
  page: number;
  total: number;
  /** Builds the href for a given page number (keeps other query params). */
  href: (page: number) => string;
  pageSize?: number;
};

export function Pagination({ page, total, href, pageSize = PAGE_SIZE }: Props) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;

  // Past the last page (e.g. a stale link): offer a way back instead of "19961–28 of 28".
  if (page > pages) {
    return (
      <nav aria-label="Pagination" className="mt-4 text-center text-sm">
        <Link href={href(1)} className="font-medium text-accent hover:underline">
          ← Back to page 1
        </Link>
      </nav>
    );
  }

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const btn = "rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted";
  const off = "rounded-md border border-border px-3 py-1.5 text-sm text-text-secondary opacity-50";

  return (
    <nav aria-label="Pagination" className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
      <span className="text-text-secondary">
        {from}–{to} of {total}
      </span>
      <div className="flex items-center gap-2">
        {page > 1 ? (
          <Link href={href(page - 1)} className={btn} rel="prev">
            ← Previous
          </Link>
        ) : (
          <span className={off}>← Previous</span>
        )}
        <span className="px-1 text-text-secondary">
          Page {page} of {pages}
        </span>
        {page < pages ? (
          <Link href={href(page + 1)} className={btn} rel="next">
            Next →
          </Link>
        ) : (
          <span className={off}>Next →</span>
        )}
      </div>
    </nav>
  );
}

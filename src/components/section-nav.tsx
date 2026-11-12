"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type Props = { label: string; links: { href: string; label: string }[] };

/**
 * Tab bar for the seller/admin sections. The active tab depends on the URL, which
 * isn't known when dynamic routes (e.g. /seller/products/[id]/edit) are prerendered,
 * so the bar first renders without a highlight and the highlight streams in.
 */
export function SectionNav(props: Props) {
  return (
    <Suspense fallback={<Nav {...props} pathname={null} />}>
      <ActiveNav {...props} />
    </Suspense>
  );
}

function ActiveNav(props: Props) {
  const pathname = usePathname();
  return <Nav {...props} pathname={pathname} />;
}

function Nav({ label, links, pathname }: Props & { pathname: string | null }) {
  return (
    <div className="border-b border-border bg-surface">
      <nav aria-label={label} className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 sm:px-8">
        <span className="mr-3 hidden items-center text-xs font-semibold uppercase tracking-wider text-text-secondary sm:flex">
          {label}
        </span>
        {links.map((l) => {
          const active = pathname === l.href;
          return (
            <Link
              key={l.href}
              href={l.href}
              aria-current={active ? "page" : undefined}
              className={`whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium transition-colors ${
                active ? "border-accent text-text" : "border-transparent text-text-secondary hover:text-text"
              }`}
            >
              {l.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

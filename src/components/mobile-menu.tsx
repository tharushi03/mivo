"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { DEPARTMENTS, findCategory, findDepartment } from "@/lib/categories";

const row = "flex w-full items-center justify-between border-b border-border px-5 py-4 text-left text-[15px] font-medium transition-colors hover:bg-muted";
const small = "block px-5 py-3 text-sm transition-colors hover:bg-muted";

function Chevron() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className="text-text-secondary">
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

/**
 * Phones and small tablets: ☰ opens a panel from the left. Women / Men / Kids each open
 * their categories, and a category opens its sub-categories ("‹ Back" goes up a level).
 * `account` is the server-rendered Log in / Account link.
 */
export function MobileMenu({ account }: { account: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [path, setPath] = useState<string[]>([]); // [] | [dept] | [dept, category]
  const openButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);

  const close = () => {
    setOpen(false);
    openButton.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    closeButton.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      openButton.current?.focus();
    };
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden"; // the page behind doesn't scroll
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = before;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const dept = findDepartment(path[0]);
  const category = findCategory(path[0], path[1]);
  const heading = category?.label ?? dept?.label ?? "Menu";

  return (
    <>
      <button
        ref={openButton}
        type="button"
        onClick={() => {
          setPath([]);
          setOpen(true);
        }}
        aria-label="Open menu"
        aria-expanded={open}
        aria-controls="mobile-menu"
        className="-ml-2 rounded-full p-2 transition-colors hover:bg-muted md:hidden"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>

      <div className={`fixed inset-0 z-50 md:hidden ${open ? "" : "pointer-events-none"}`} inert={!open}>
        <button
          type="button"
          tabIndex={-1}
          aria-label="Close menu"
          onClick={close}
          className={`absolute inset-0 bg-black/40 transition-opacity duration-300 ${open ? "opacity-100" : "opacity-0"}`}
        />
        <aside
          id="mobile-menu"
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          // Any link tapped inside closes the menu.
          onClick={(e) => (e.target as HTMLElement).closest("a") && setOpen(false)}
          className={`absolute inset-y-0 left-0 flex w-[86%] max-w-sm flex-col bg-background shadow-2xl transition-transform duration-300 ease-out ${open ? "translate-x-0" : "-translate-x-full"}`}
        >
          <div className="flex h-16 shrink-0 items-center justify-between border-b border-border px-3">
            {path.length > 0 ? (
              <button type="button" onClick={() => setPath(path.slice(0, -1))} className="flex items-center gap-1 rounded-md px-2 py-2 text-sm font-medium hover:bg-muted">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="m15 6-6 6 6 6" />
                </svg>
                Back
              </button>
            ) : (
              <span className="px-2 text-lg font-bold tracking-[0.2em]">MIVO</span>
            )}
            <span className="truncate px-2 text-sm font-semibold uppercase tracking-wide">{path.length > 0 ? heading : ""}</span>
            <button ref={closeButton} type="button" onClick={close} aria-label="Close menu" className="rounded-full p-2 hover:bg-muted">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </div>

          <nav aria-label="Categories" className="flex-1 overflow-y-auto">
            {!dept && (
              <>
                <ul>
                  <li>
                    <Link href="/#new-in" className={row}>
                      New In
                    </Link>
                  </li>
                  {DEPARTMENTS.map((d) => (
                    <li key={d.slug}>
                      <button type="button" onClick={() => setPath([d.slug])} className={row}>
                        {d.label}
                        <Chevron />
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="mt-4 [&_a]:block [&_a]:rounded-none [&_a]:px-5 [&_a]:py-3 [&_a]:text-sm">{account}</div>
                <Link href="/orders" className={small}>
                  My orders
                </Link>
                <Link href="/become-a-seller" className={small}>
                  Sell on MIVO
                </Link>
              </>
            )}

            {dept && !category && (
              <ul>
                <li>
                  <Link href={`/c/${dept.slug}`} className={`${row} text-accent-hover`}>
                    Shop all {dept.label}
                  </Link>
                </li>
                {dept.categories.map((c) => (
                  <li key={c.slug}>
                    {c.subs.length > 0 ? (
                      <button type="button" onClick={() => setPath([dept.slug, c.slug])} className={row}>
                        {c.label}
                        <Chevron />
                      </button>
                    ) : (
                      <Link href={`/c/${dept.slug}/${c.slug}`} className={row}>
                        {c.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {dept && category && (
              <ul>
                <li>
                  <Link href={`/c/${dept.slug}/${category.slug}`} className={`${row} text-accent-hover`}>
                    Shop all {category.label}
                  </Link>
                </li>
                {category.subs.map((x) => (
                  <li key={x.slug}>
                    <Link href={`/c/${dept.slug}/${category.slug}/${x.slug}`} className={row}>
                      {x.label}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </nav>
        </aside>
      </div>
    </>
  );
}

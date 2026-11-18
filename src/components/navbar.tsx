import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { auth } from "@/auth";
import { DEPARTMENTS } from "@/lib/categories";
import { CartLink } from "./cart-link";
import { MobileMenu } from "./mobile-menu";

const accountCls = "rounded-md px-3 py-2 text-sm font-medium transition-colors hover:text-accent";

export function Navbar() {
  return (
    // Solid background, no backdrop-blur: a blur filter would trap the mobile menu's
    // full-screen panel inside the 64px header (fixed elements size to a filtered parent).
    <header className="sticky top-0 z-40 border-b border-border bg-background">
      <nav aria-label="Main" className="relative mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-8">
        {/* Phones: ☰ on the left, logo in the middle. Wider screens: logo on the left. */}
        <div className="flex items-center">
          <MobileMenu
            account={
              <Suspense fallback={null}>
                <AccountLink />
              </Suspense>
            }
          />
        </div>
        <Link href="/" className="absolute left-1/2 -translate-x-1/2 text-xl font-bold tracking-[0.2em] md:static md:translate-x-0">
          MIVO
        </Link>
        <div className="flex items-center gap-1 sm:gap-3 md:ml-auto">
          {/* Reads the session at request time, so it streams in separately. */}
          <span className="hidden md:inline">
            <Suspense fallback={<span className="inline-block w-[72px]" />}>
              <AccountLink />
            </Suspense>
          </span>
          <CartLink />
        </div>
      </nav>
      <CategoryBar />
    </header>
  );
}

/**
 * Tablets and computers: NEW IN · WOMEN · MEN · KIDS under the logo. Hovering (or tabbing to)
 * a section opens a panel with its categories and sub-categories. Pure CSS, no JavaScript.
 */
function CategoryBar() {
  const top = "block px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] transition-colors hover:text-accent-hover";
  return (
    <nav aria-label="Categories" className="relative hidden border-t border-border md:block">
      <ul className="mx-auto flex max-w-6xl items-center justify-center px-8">
        <li>
          <Link href="/#new-in" className={top}>
            New In
          </Link>
        </li>
        {DEPARTMENTS.map((d) => (
          <li key={d.slug} className="group">
            <Link href={`/c/${d.slug}`} className={`${top} group-hover:text-accent-hover`}>
              {d.label}
            </Link>
            <div className="invisible absolute inset-x-0 top-full border-y border-border bg-surface opacity-0 shadow-lg transition-opacity duration-150 group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
              <div className="mx-auto grid max-w-6xl grid-cols-4 gap-x-8 gap-y-6 px-8 py-8 lg:grid-cols-5">
                {d.categories.map((c) => (
                  <div key={c.slug}>
                    <Link href={`/c/${d.slug}/${c.slug}`} className="text-sm font-semibold uppercase tracking-wide hover:text-accent-hover">
                      {c.label}
                    </Link>
                    {c.subs.length > 0 && (
                      <ul className="mt-2 space-y-1.5">
                        {c.subs.map((x) => (
                          <li key={x.slug}>
                            <Link href={`/c/${d.slug}/${c.slug}/${x.slug}`} className="text-sm text-text-secondary hover:text-accent-hover">
                              {x.label}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
                <div className="flex items-start">
                  <Link href={`/c/${d.slug}`} className="rounded-full border border-primary px-4 py-2 text-sm font-medium hover:bg-primary hover:text-white">
                    Shop all {d.label} →
                  </Link>
                </div>
              </div>
            </div>
          </li>
        ))}
        <li>
          <Link href="/become-a-seller" className={`${top} text-text-secondary`}>
            Sell on MIVO
          </Link>
        </li>
      </ul>
    </nav>
  );
}

async function AccountLink() {
  // Mark this as request-time first: auth() run during prerender would create a
  // random CSRF token, which Cache Components rejects.
  await connection();
  const session = await auth();
  const user = session?.user;

  if (!user) {
    return (
      <Link href="/login" className={accountCls}>
        Log in
      </Link>
    );
  }
  return (
    <Link href="/dashboard" className={accountCls}>
      {user.role === "BUYER" ? "Account" : "Dashboard"}
    </Link>
  );
}

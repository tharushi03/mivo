import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { auth } from "@/auth";
import { CartLink } from "./cart-link";

export function Navbar() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-8">
        <Link href="/" className="text-xl font-bold tracking-[0.2em]">
          MIVO
        </Link>
        <div className="flex items-center gap-1 sm:gap-3">
          {/* On phones the MIVO logo is the home link, saving room for account + cart. */}
          <Link href="/" className="hidden rounded-md px-3 py-2 text-sm font-medium transition-colors hover:text-accent sm:inline-block">
            Home
          </Link>
          {/* Reads the session at request time, so it streams in separately. */}
          <Suspense fallback={<span className="w-[72px]" />}>
            <AccountLink />
          </Suspense>
          <CartLink />
        </div>
      </nav>
    </header>
  );
}

async function AccountLink() {
  // Mark this as request-time first: auth() run during prerender would create a
  // random CSRF token, which Cache Components rejects.
  await connection();
  const session = await auth();
  const user = session?.user;
  const cls = "rounded-md px-3 py-2 text-sm font-medium transition-colors hover:text-accent";

  if (!user) {
    return (
      <Link href="/login" className={cls}>
        Log in
      </Link>
    );
  }
  return (
    <Link href="/dashboard" className={cls}>
      {user.role === "BUYER" ? "Account" : "Dashboard"}
    </Link>
  );
}

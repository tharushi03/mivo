import Link from "next/link";
import { SITE } from "@/lib/site";

const link = "transition-colors hover:text-accent";

/** Site-wide footer (rendered by the root layout). Fully static. */
export function Footer() {
  return (
    <footer className="mt-16 border-t border-border bg-surface">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 text-sm text-text-secondary sm:flex-row sm:items-start sm:justify-between sm:px-8">
        <div>
          <p className="text-lg font-bold tracking-[0.3em] text-text">MIVO</p>
          <p className="mt-1 max-w-xs">Curated clothing from Sri Lankan boutiques, shipped straight to your door.</p>
        </div>
        <nav aria-label="Footer" className="grid grid-cols-2 gap-x-10 gap-y-2 sm:flex sm:gap-8">
          <Link href="/" className={link}>Shop</Link>
          <Link href="/orders" className={link}>My orders</Link>
          <Link href="/become-a-seller" className={link}>Sell on MIVO</Link>
          <Link href="/terms" className={link}>Terms of Service</Link>
          <Link href="/privacy" className={link}>Privacy Policy</Link>
          <a href={`mailto:${SITE.supportEmail}`} className={link}>Contact</a>
        </nav>
      </div>
      <p className="border-t border-border py-4 text-center text-xs text-text-secondary">
        © 2026 {SITE.name} · Cash on delivery &amp; bank transfer · Island-wide delivery
      </p>
    </footer>
  );
}

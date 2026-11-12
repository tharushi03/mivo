import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
      <p className="text-sm font-medium uppercase tracking-[0.25em] text-accent-hover">404</p>
      <h1 className="mt-3 text-3xl font-bold">We couldn&apos;t find that</h1>
      <p className="mt-3 text-text-secondary">
        This piece may have sold out or been removed by the boutique.
      </p>
      <Link
        href="/"
        className="mt-8 rounded-lg bg-accent px-6 py-3 font-medium text-white transition-colors hover:bg-accent-hover"
      >
        Back to shop
      </Link>
    </main>
  );
}

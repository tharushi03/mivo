import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Email confirmation", robots: { index: false } };

export default function EmailConfirmedPage({ searchParams }: PageProps<"/email-confirmed">) {
  return (
    <main className="flex min-h-[60vh] items-center justify-center px-4">
      <Suspense fallback={<div className="h-48 w-full max-w-md animate-pulse rounded-xl border border-border bg-surface" />}>
        <Result searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Result({ searchParams }: Pick<PageProps<"/email-confirmed">, "searchParams">) {
  const { status } = await searchParams;
  const ok = status === "ok";
  return (
    <div className="w-full max-w-md rounded-xl border border-border bg-surface p-8 text-center shadow-sm">
      <h1 className="mb-2 text-2xl font-bold">{ok ? "Email confirmed" : status === "expired" ? "Link expired" : "Link not valid"}</h1>
      <p className="text-sm text-text-secondary">
        {ok
          ? "Thank you! Your email address is confirmed."
          : "This confirmation link has expired or was already used. Log in and request a new one from the checkout page or your dashboard."}
      </p>
      <Link href={ok ? "/dashboard" : "/login"} className="mt-6 inline-block rounded-md bg-accent px-5 py-2 font-medium text-white hover:bg-accent-hover">
        {ok ? "Continue" : "Log in"}
      </Link>
    </div>
  );
}

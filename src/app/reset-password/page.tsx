import { Suspense } from "react";
import type { Metadata } from "next";
import { ResetPasswordForm } from "./reset-password-form";

// no-referrer: the reset token in the URL must never leak to another site.
export const metadata: Metadata = { title: "Choose a new password", robots: { index: false }, referrer: "no-referrer" };

export default function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <Suspense fallback={<div className="h-80 w-full max-w-md animate-pulse rounded-xl border border-border bg-surface" />}>
        <WithToken searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function WithToken({ searchParams }: Pick<PageProps<"/reset-password">, "searchParams">) {
  const { token } = await searchParams;
  return <ResetPasswordForm token={typeof token === "string" ? token : ""} />;
}

import type { ReactNode } from "react";
import { SITE } from "@/lib/site";

/** Shared layout for /terms and /privacy: readable width, numbered sections. */
export function LegalPage({ title, intro, children }: { title: string; intro: ReactNode; children: ReactNode }) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-8 sm:py-14">
      <h1 className="text-3xl font-bold sm:text-4xl">{title}</h1>
      <p className="mt-2 text-sm text-text-secondary">Last updated: {SITE.legalUpdated}</p>
      <div className="mt-6 text-text-secondary leading-relaxed">{intro}</div>
      <div className="mt-10 space-y-10 [counter-reset:section]">{children}</div>
      <p className="mt-12 rounded-xl border border-border bg-surface p-4 text-sm">
        Questions? Contact us at{" "}
        <a href={`mailto:${SITE.supportEmail}`} className="font-medium text-accent hover:underline">
          {SITE.supportEmail}
        </a>{" "}
        or {SITE.supportPhone}.
      </p>
    </main>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="[counter-increment:section]">
      <h2 className="mb-3 text-xl font-bold before:mr-2 before:text-accent before:content-[counter(section)'.']">{title}</h2>
      <div className="space-y-3 leading-relaxed text-text-secondary [&_li]:ml-5 [&_li]:list-disc [&_strong]:text-text [&_ul]:space-y-1.5">
        {children}
      </div>
    </section>
  );
}

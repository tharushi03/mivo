import type { ReactNode } from "react";
import Link from "next/link";

const ICONS = {
  bag: (
    <>
      <path d="M6 7h12l-1 13H7L6 7Z" />
      <path d="M9 7a3 3 0 0 1 6 0" />
    </>
  ),
  box: (
    <>
      <path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5v-9Z" />
      <path d="m3 7.5 9 4.5 9-4.5M12 12v9" />
    </>
  ),
  store: (
    <>
      <path d="M4 9h16l-1.5-5h-13L4 9Z" />
      <path d="M5 9v11h14V9M10 20v-6h4v6" />
    </>
  ),
  hanger: (
    <>
      <path d="M12 7a2 2 0 1 1 2-2" />
      <path d="M12 7v2L3 15.5a1 1 0 0 0 .6 1.8h16.8a1 1 0 0 0 .6-1.8L12 9" />
    </>
  ),
};

type Props = {
  icon: keyof typeof ICONS;
  title: string;
  children?: ReactNode;
  action?: { href: string; label: string };
};

export function EmptyState({ icon, title, children, action }: Props) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-border bg-surface px-6 py-14 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted text-text-secondary">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {ICONS[icon]}
        </svg>
      </div>
      <h2 className="text-lg font-semibold">{title}</h2>
      {children && <div className="mt-1 max-w-sm text-sm text-text-secondary">{children}</div>}
      {action && (
        <Link
          href={action.href}
          className="mt-6 rounded-lg bg-accent px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}

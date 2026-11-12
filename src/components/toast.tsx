"use client";

import type { ReactNode } from "react";

export function Toast({ children, tone = "success" }: { children: ReactNode; tone?: "success" | "error" }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed inset-x-4 bottom-6 z-50 mx-auto flex max-w-md items-center justify-between gap-4 rounded-xl px-4 py-3 text-sm text-white shadow-lg sm:inset-x-auto sm:left-1/2 sm:w-full sm:-translate-x-1/2 ${
        tone === "success" ? "bg-primary" : "bg-error"
      }`}
    >
      {children}
    </div>
  );
}

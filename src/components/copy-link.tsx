"use client";

import { useState } from "react";

/** "Copy link" button, plus an optional "Share on WhatsApp" link, for a boutique's shop or product link. */
export function CopyLink({
  url,
  label = "Copy link",
  shareText,
  className = "",
}: {
  url: string;
  label?: string;
  /** If set, also shows a WhatsApp share button with this text before the link. */
  shareText?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Older browsers / non-HTTPS: fall back to a prompt the seller can copy from.
      window.prompt("Copy this link:", url);
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const btn =
    "inline-flex items-center justify-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium transition-colors hover:border-accent hover:text-accent-hover";
  return (
    <span className={`inline-flex flex-wrap gap-2 ${className}`}>
      <button type="button" onClick={copy} className={btn} aria-live="polite">
        {copied ? "✓ Copied" : label}
      </button>
      {shareText !== undefined && (
        <a
          href={`https://wa.me/?text=${encodeURIComponent(`${shareText ? `${shareText} ` : ""}${url}`)}`}
          target="_blank"
          rel="noopener noreferrer"
          className={btn}
        >
          Share on WhatsApp
        </a>
      )}
    </span>
  );
}

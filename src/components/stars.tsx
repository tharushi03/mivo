/** Read-only star rating, e.g. 4.5 shows four and a half stars. */
export function Stars({ rating, className = "text-base" }: { rating: number; className?: string }) {
  const pct = Math.max(0, Math.min(100, (rating / 5) * 100));
  return (
    <span
      role="img"
      aria-label={`${rating} out of 5 stars`}
      className={`relative inline-block whitespace-nowrap leading-none tracking-tight ${className}`}
    >
      <span className="text-muted" aria-hidden="true">★★★★★</span>
      <span className="absolute inset-0 overflow-hidden text-accent" style={{ width: `${pct}%` }} aria-hidden="true">
        ★★★★★
      </span>
    </span>
  );
}

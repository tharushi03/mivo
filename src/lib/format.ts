const lkr = new Intl.NumberFormat("en-LK", { style: "currency", currency: "LKR", maximumFractionDigits: 2 });

export function formatLKR(value: number | string) {
  return lkr.format(Number(value));
}

// Always show Sri Lanka time, even when the server (e.g. a Docker container) runs in UTC.
const TZ = "Asia/Colombo";

export function formatDate(d: Date) {
  return d.toLocaleDateString("en-LK", { dateStyle: "medium", timeZone: TZ });
}

export function formatDateTime(d: Date) {
  return d.toLocaleString("en-LK", { dateStyle: "medium", timeStyle: "short", timeZone: TZ });
}

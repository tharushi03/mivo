// Production configuration check, run once when the server starts (src/instrumentation.ts).
// A missing setting stops the server with a clear message, instead of failing quietly
// later (emails written to a folder nobody reads, links pointing at localhost, uploads
// lost on the next deploy, ...).

type Rule = { name: string; why: string; valid?: (v: string) => boolean };

const RULES: Rule[] = [
  { name: "DATABASE_URL", why: "Postgres connection string" },
  { name: "AUTH_SECRET", why: "signs login sessions (generate with: npx auth secret)", valid: (v) => v.length >= 32 },
  { name: "APP_URL", why: "public https address used in email links, e.g. https://mivo.lk", valid: (v) => /^https:\/\/[^/]+/.test(v) && !/localhost|127\.0\.0\.1/.test(v) },
  { name: "SMTP_HOST", why: "mail server; without it no email is sent" },
  { name: "EMAIL_FROM", why: 'sender, e.g. "MIVO <orders@mivo.lk>"' },
  { name: "CRON_SECRET", why: "protects /api/cron (at least 16 random characters)", valid: (v) => v.length >= 16 },
  { name: "UPLOAD_DIR", why: "folder on a persistent volume for product photos and bank slips, e.g. /data/uploads" },
  { name: "PLATFORM_BANK_NAME", why: "bank details shown to buyers paying by transfer" },
  { name: "PLATFORM_BANK_ACCOUNT_NAME", why: "bank details shown to buyers paying by transfer" },
  { name: "PLATFORM_BANK_ACCOUNT_NUMBER", why: "bank details shown to buyers paying by transfer" },
];

export function checkProductionEnv() {
  const problems = RULES.flatMap((r) => {
    const v = process.env[r.name]?.trim() ?? "";
    if (!v) return [`  - ${r.name} is missing: ${r.why}`];
    if (r.valid && !r.valid(v)) return [`  - ${r.name} looks wrong: ${r.why}`];
    return [];
  });
  if (problems.length > 0) {
    console.error(`\nMIVO cannot start in production. Fix these environment variables:\n${problems.join("\n")}\n`);
    // Exit instead of throwing: Next.js would keep running and answer every request
    // with a 500. A crashed container is obvious in Dokploy and keeps the old version up.
    process.exit(1);
  }
}

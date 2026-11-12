// Small in-memory rate limiter for login, sign-up, orders and password resets.
//
// Memory is per server process: limits reset on restart and aren't shared between
// several app instances. That's fine for one Dokploy container; if MIVO ever runs
// more than one instance, move this store to Redis or Postgres.

type Entry = { count: number; windowEnds: number; blockedUntil: number };

type Policy = {
  /** Failures (or attempts) allowed inside one window before blocking. */
  max: number;
  windowMs: number;
  blockMs: number;
};

const MIN = 60_000;

/** All limits in one place. */
export const POLICIES = {
  // 5 wrong passwords in a row for one account from one network -> 15 min block.
  loginAccount: { max: 5, windowMs: 15 * MIN, blockMs: 15 * MIN },
  // One network trying many different accounts (password spraying).
  loginIp: { max: 20, windowMs: 15 * MIN, blockMs: 15 * MIN },
  // One account attacked from many networks. Higher, so a stranger can't easily lock you out.
  loginEmail: { max: 50, windowMs: 60 * MIN, blockMs: 60 * MIN },
  // Sign-up attempts from one network.
  register: { max: 10, windowMs: 60 * MIN, blockMs: 60 * MIN },
  // Orders placed by one account (stops stock being locked up by mass orders).
  order: { max: 5, windowMs: 60 * MIN, blockMs: 60 * MIN },
  // "Forgot password" requests: per network, and per email (so nobody can flood one inbox).
  resetIp: { max: 10, windowMs: 60 * MIN, blockMs: 60 * MIN },
  resetEmail: { max: 3, windowMs: 60 * MIN, blockMs: 60 * MIN },
  // "Resend confirmation email", per account.
  verifyEmail: { max: 3, windowMs: 60 * MIN, blockMs: 60 * MIN },
} satisfies Record<string, Policy>;

type PolicyName = keyof typeof POLICIES;

// Kept on globalThis so dev-server hot reloads don't wipe it.
const g = globalThis as unknown as { __mivoRateLimit?: Map<string, Entry> };
const store = (g.__mivoRateLimit ??= new Map<string, Entry>());

function sweep(now: number) {
  if (store.size < 10_000) return;
  for (const [k, e] of store) if (e.windowEnds < now && e.blockedUntil < now) store.delete(k);
}

/** Milliseconds until `key` may try again (0 = allowed now). Doesn't count anything. */
export function blockedFor(policy: PolicyName, key: string, now = Date.now()) {
  const e = store.get(`${policy}:${key}`);
  return e && e.blockedUntil > now ? e.blockedUntil - now : 0;
}

/** Records one failure/attempt. Returns ms blocked (0 if still allowed). */
export function hit(policy: PolicyName, key: string, now = Date.now()) {
  const p = POLICIES[policy];
  const id = `${policy}:${key}`;
  sweep(now);
  let e = store.get(id);
  if (!e || e.windowEnds < now) {
    e = { count: 0, windowEnds: now + p.windowMs, blockedUntil: 0 };
    store.set(id, e);
  }
  e.count += 1;
  if (e.count >= p.max) {
    e.blockedUntil = now + p.blockMs;
    e.windowEnds = Math.max(e.windowEnds, e.blockedUntil);
  }
  return e.blockedUntil > now ? e.blockedUntil - now : 0;
}

/** Clears a counter, e.g. after a successful login ("in a row" means consecutive). */
export function reset(policy: PolicyName, key: string) {
  store.delete(`${policy}:${key}`);
}

/**
 * Client IP from proxy headers. Behind Dokploy's Traefik, X-Real-Ip is set by the
 * proxy itself. Otherwise take the LAST X-Forwarded-For entry: earlier entries can
 * be typed in by the client, the last one is added by the nearest proxy.
 */
export function clientIp(headers: Headers) {
  const real = headers.get("x-real-ip")?.trim();
  if (real) return real;
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }
  return "unknown";
}

export function minutesText(ms: number) {
  const m = Math.max(1, Math.ceil(ms / MIN));
  return `${m} minute${m === 1 ? "" : "s"}`;
}

// ---------------------------------------------------------------- Login helpers

const loginKeys = (email: string, ip: string) => ({ account: `${email}|${ip}`, ip, email });

/** How long this login is blocked for (0 = may try). Checked BEFORE the password. */
export function loginBlockedFor(email: string, ip: string) {
  const k = loginKeys(email, ip);
  return Math.max(blockedFor("loginAccount", k.account), blockedFor("loginIp", k.ip), blockedFor("loginEmail", k.email));
}

export function recordLoginFailure(email: string, ip: string) {
  const k = loginKeys(email, ip);
  return Math.max(hit("loginAccount", k.account), hit("loginIp", k.ip), hit("loginEmail", k.email));
}

export function recordLoginSuccess(email: string, ip: string) {
  reset("loginAccount", loginKeys(email, ip).account);
}

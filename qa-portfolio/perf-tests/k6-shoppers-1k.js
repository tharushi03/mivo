// k6 load test: up to 1,000 shoppers browsing MIVO at the same time.
//
// Each virtual user behaves like a person: opens the home page, looks at a product,
// sometimes opens the boutique's shop page or the cart, and pauses between pages.
// It only READS pages: it never logs in, places orders or uploads anything, so it
// can't create orders, hold stock or trip the login / order rate limits.
//
// Run from the qa-portfolio folder:
//   k6 run -e BASE_URL=https://staging.your-domain.lk perf-tests/k6-shoppers-1k.js
//   k6 run -e BASE_URL=https://staging.your-domain.lk -e PEAK=300 perf-tests/k6-shoppers-1k.js   (smaller first run)
// Live dashboard (open http://localhost:5665 while it runs), PowerShell:
//   $env:K6_WEB_DASHBOARD="true"; k6 run -e BASE_URL=... perf-tests/k6-shoppers-1k.js
//
// Safety:
//   - Without BASE_URL it targets http://localhost:3000 and refuses more than 20 users.
//   - Point it at staging, or at the live site only outside business hours and after
//     warning your host: 1,000 users is real load.
//   - Run k6 from a machine with spare CPU/RAM (or k6 Cloud). A busy laptop measures
//     itself, not MIVO.
import http from "k6/http";
import { check, group, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

const BASE_URL = (__ENV.BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const PEAK = Number(__ENV.PEAK || 1000);
const LOCAL = /localhost|127\.0\.0\.1/.test(BASE_URL);
if (LOCAL && PEAK > 20) {
  throw new Error(`Refusing to send ${PEAK} users to ${BASE_URL}. Pass -e BASE_URL=https://your-staging-site, or -e PEAK=20 for a local smoke test.`);
}

const pageTime = {
  home: new Trend("page_home_ms", true),
  product: new Trend("page_product_ms", true),
  shop: new Trend("page_shop_ms", true),
  cart: new Trend("page_cart_ms", true),
};
const brokenPages = new Rate("pages_not_rendered");

// The ramp from the guide, scaled to PEAK: 20% in 2 min, 100% in 3 more, hold 5, down in 2.
// -e QUICK=1 squeezes it into 35 seconds, to check the script works before a real run.
const QUICK = __ENV.QUICK === "1";
export const options = {
  stages: QUICK
    ? [
        { duration: "10s", target: PEAK },
        { duration: "20s", target: PEAK },
        { duration: "5s", target: 0 },
      ]
    : [
        { duration: "2m", target: Math.ceil(PEAK * 0.2) },
        { duration: "3m", target: PEAK },
        { duration: "5m", target: PEAK },
        { duration: "2m", target: 0 },
      ],
  thresholds: {
    http_req_failed: ["rate<0.01"], // under 1% failed requests
    http_req_duration: ["p(95)<1500"], // 95% of pages in under 1.5 s at peak
    page_home_ms: ["p(95)<1000"], // the home page is served from the cache: should stay fast
    page_product_ms: ["p(95)<2000"],
    pages_not_rendered: ["rate<0.01"], // a 200 that shows an error page still counts as broken
    checks: ["rate>0.99"],
  },
};
// k6 fetches only the HTML of each page (no images, fonts or scripts), so this measures the server.

const pick = (list) => list[Math.floor(Math.random() * list.length)];
const think = (min, max) => sleep(min + Math.random() * (max - min));

function visit(name, path, mustContain) {
  const res = http.get(`${BASE_URL}${path}`, { tags: { page: name } });
  pageTime[name].add(res.timings.duration);
  const ok = check(res, {
    [`${name}: status 200`]: (r) => r.status === 200,
    [`${name}: shows the page`]: (r) => typeof r.body === "string" && r.body.includes(mustContain),
  });
  brokenPages.add(!ok);
  return res;
}

export default function () {
  let productIds = [];
  let shopSlug = null;

  group("home", () => {
    const res = visit("home", "/", "MIVO");
    productIds = [...new Set(((res.body || "").match(/\/product\/[0-9a-f-]{36}/g) || []).map((h) => h.slice(9)))];
  });
  think(2, 5);

  if (productIds.length > 0) {
    group("product", () => {
      const res = visit("product", `/product/${pick(productIds)}`, "Customer reviews");
      const m = (res.body || "").match(/href="\/s\/([a-z0-9-]+)"/);
      shopSlug = m ? m[1] : null;
    });
    think(3, 8);
  }

  // About a third of shoppers look at more from the same boutique.
  if (shopSlug && Math.random() < 0.35) {
    group("shop", () => visit("shop", `/s/${shopSlug}`, "MIVO"));
    think(2, 5);
  }

  // About a fifth open the cart.
  if (Math.random() < 0.2) {
    group("cart", () => visit("cart", "/cart", "MIVO"));
    think(1, 3);
  }
}

export function handleSummary(data) {
  const m = data.metrics;
  const ms = (v) => (v === undefined ? "-" : `${Math.round(v)} ms`);
  const p95 = (name) => (m[name] ? ms(m[name].values["p(95)"]) : "-");
  const failed = Object.entries(data.metrics)
    .filter(([, v]) => v.thresholds && Object.values(v.thresholds).some((t) => !t.ok))
    .map(([k]) => k);
  const text = [
    "",
    `MIVO shoppers load test: peak ${PEAK} users against ${BASE_URL}`,
    `  requests:            ${m.http_reqs.values.count} (${m.http_reqs.values.rate.toFixed(1)} per second)`,
    `  failed requests:     ${(m.http_req_failed.values.rate * 100).toFixed(2)}%`,
    `  all pages p95:       ${p95("http_req_duration")}`,
    `  home / product p95:  ${p95("page_home_ms")} / ${p95("page_product_ms")}`,
    `  shop / cart p95:     ${p95("page_shop_ms")} / ${p95("page_cart_ms")}`,
    `  checks passed:       ${(m.checks.values.rate * 100).toFixed(2)}%`,
    failed.length ? `  FAILED thresholds:   ${failed.join(", ")}` : "  all thresholds passed",
    "",
  ].join("\n");
  return { "reports/k6-shoppers-1k-summary.json": JSON.stringify(data, null, 2), stdout: text };
}

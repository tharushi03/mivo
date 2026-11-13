// k6 load test: MIVO home page (GET /) with up to 50 virtual users.
//
// Run from the qa-portfolio folder (the summary is saved to reports/):
//        k6 run perf-tests/k6-homepage-load.js
//        k6 run -e BASE_URL=https://staging.mivo.lk perf-tests/k6-homepage-load.js
//
// Test a production build (`npm run build && npm start`) or staging, not `npm run dev`:
// the dev server compiles on demand and is much slower. Never point this at the live site
// during business hours without warning: 50 users hammering it is a real load.
import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";

const productCards = new Trend("product_cards_on_page");
const fullPageErrors = new Rate("page_without_products");

export const options = {
  stages: [
    { duration: "30s", target: 10 }, // warm up
    { duration: "1m", target: 50 }, // ramp to 50 users
    { duration: "2m", target: 50 }, // hold
    { duration: "30s", target: 0 }, // ramp down
  ],
  thresholds: {
    http_req_failed: ["rate<0.01"], // under 1% errors
    http_req_duration: ["p(95)<800", "p(99)<1500"], // 95% of requests under 0.8 s
    page_without_products: ["rate<0.01"], // the page actually rendered the shop
    checks: ["rate>0.99"],
  },
};

export default function () {
  const res = http.get(`${BASE_URL}/`, { tags: { page: "home" } });

  const cards = (res.body && res.body.match(/href="\/product\//g)) || [];
  productCards.add(cards.length);
  fullPageErrors.add(cards.length === 0);

  check(res, {
    "status is 200": (r) => r.status === 200,
    "is HTML": (r) => (r.headers["Content-Type"] || "").includes("text/html"),
    "shows the MIVO brand": (r) => r.body.includes("MIVO"),
    "lists products": () => cards.length > 0,
  });

  // A shopper looks at the page for 1-3 seconds before doing anything else.
  sleep(1 + Math.random() * 2);
}

export function handleSummary(data) {
  return {
    "reports/k6-summary.json": JSON.stringify(data, null, 2),
    stdout: textSummary(data),
  };
}

function textSummary(data) {
  const m = data.metrics;
  const ms = (v) => `${Math.round(v)} ms`;
  return [
    "",
    "MIVO home page load test",
    `  requests:        ${m.http_reqs.values.count}`,
    `  failed:          ${(m.http_req_failed.values.rate * 100).toFixed(2)}%`,
    `  median / p95:    ${ms(m.http_req_duration.values.med)} / ${ms(m.http_req_duration.values["p(95)"])}`,
    `  checks passed:   ${(m.checks.values.rate * 100).toFixed(2)}%`,
    "",
  ].join("\n");
}

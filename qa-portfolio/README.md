# MIVO QA Portfolio

A quality management system built around **MIVO**, a working multi-vendor clothing marketplace
(Next.js 16, PostgreSQL, Drizzle, Auth.js). MIVO takes real money (bank transfers and cash on
delivery), splits each order into one package per boutique, and pays boutiques after a 7-day return
window. That makes it a good subject for QA: the risks are real.

## What's here

| Folder | Contents |
|---|---|
| [`qms/`](qms/quality-policy.md) | Quality policy: QA vs QC, severity levels, Definition of Done, entry/exit criteria |
| [`requirements/`](requirements/) | [Stakeholder interview](requirements/stakeholder-interview.md) and risk list · [User stories with acceptance criteria](requirements/user-stories.md) · [Traceability matrix](requirements/traceability-matrix.csv) |
| [`manual/`](manual/) | [15 test cases](manual/test-cases.csv) (positive, negative, security, concurrency) · [Test data strategy](manual/test-data-strategy.md) |
| [`test-data/`](test-data/) | Fixture files: a valid slip image and a fake one (a text file renamed `.jpg`) |
| [`ui-tests/`](ui-tests/) | Playwright end-to-end tests, Page Object Model, Chromium + Firefox + WebKit |
| [`api-tests/`](api-tests/mivo-api.json) | Postman collection: login, checkout Server Action, access control |
| [`perf-tests/`](perf-tests/k6-homepage-load.js) | k6 load test of the home page, 50 virtual users, with pass/fail thresholds |
| [`uat/`](uat/uat-checklist.md) | User acceptance checklist for the product owner |
| [`issues/`](issues/bug-report-template.md) | Bug report template with a worked example |
| [`reports/`](reports/README.md) | Where test reports are written (not committed) |
| [`../.github/workflows/qa.yml`](../.github/workflows/qa.yml) | CI: type check, lint, migrate + seed a fresh database, build, run Playwright in 3 browsers |

The workflow lives in the repository root's `.github/workflows/`, because GitHub only runs
workflows from there.

## Running the UI tests locally

Prerequisites: MIVO running at http://localhost:3000 (`npm run dev` in the `mivo` folder), with the
seed and demo data loaded (`npm run db:seed && npm run db:seed:demo`).

```bash
cd qa-portfolio/ui-tests
npm install
npx playwright install chromium firefox webkit   # first time only
npx playwright test                             # all three browsers
npx playwright test --project=chromium          # one browser
npx playwright show-report ../reports/playwright-html
```

The suite reads `DATABASE_URL` (and the bank settings it checks) from the environment, or from the
app's `.env.local`. It creates its own buyers and removes them, their orders and the stock they
took when it finishes, so it can run against your dev database without leaving anything behind.
See [test data strategy](manual/test-data-strategy.md).

## Running the API tests

Import `api-tests/mivo-api.json` into Postman, set the collection variables (base URL, buyer
login, cron secret, and for checkout the action ID and a product ID), then run the collection.
Or from the command line:

```bash
npx newman run api-tests/mivo-api.json --env-var baseUrl=http://localhost:3000 --env-var cronSecret=<your CRON_SECRET>
```

Checkout is a Next.js Server Action, so its "endpoint" is the page URL plus a `Next-Action` header
whose ID changes with each build. The collection explains where to find it.

## Running the load test

Install [k6](https://grafana.com/docs/k6/latest/set-up/install-k6/), start a **production** build
(`npm run build && npm start`), then from `qa-portfolio/`:

```bash
k6 run perf-tests/k6-homepage-load.js
```

## Coverage at a glance

- 5 user stories, 28 acceptance criteria, 15 test cases, 3 automated in 3 browsers
- The traceability matrix lists the remaining gaps openly (e.g. "cancelled order cannot be verified"
  has no test case yet), which is the point of keeping one.

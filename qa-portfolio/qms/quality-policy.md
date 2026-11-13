# MIVO Quality Policy

MIVO is a marketplace where buyers pay MIVO (by bank transfer or cash on delivery), boutiques ship
their own packages, and MIVO pays each boutique after the return window. Mistakes cost real
money, or let a stranger read someone else's data. This policy sets out how we prevent and catch
those mistakes.

## 1. Quality goals

| Area | Goal |
|---|---|
| Money | Every rupee is accounted for: order totals, refunds, commission and payouts match to the cent. A boutique is never paid twice or paid for a returned item. |
| Stock | Stock never goes negative, and never sells the same last item twice. |
| Privacy | Buyers see only their own orders and bank slips. Boutiques see only their own packages. |
| Access | Each action checks the user's role on the server, not just in the page. |
| Delivery | Each boutique dispatches within 2 days of an order being ready. COD packages are only booked on MIVO's courier accounts. |

## 2. QA and QC: who does what

**Quality Assurance (QA)** prevents defects. It covers the *process*:
- Each change starts from a user story with acceptance criteria (`requirements/user-stories.md`).
- Risky logic (money, stock, permissions) is written with database transactions, row locks and
  conditional updates. Reviews check for these.
- Every requirement is traced to at least one test (`requirements/traceability-matrix.csv`).

**Quality Control (QC)** finds defects. It covers the *product*:
- Manual test cases, including negative and abuse cases (`manual/test-cases.csv`).
- Automated UI tests in three browsers (`ui-tests/`).
- API checks (`api-tests/`) and a load test (`perf-tests/`).
- User acceptance testing with the product owner (`uat/`).

## 3. Severity levels

| Severity | Meaning | Examples | Release? |
|---|---|---|---|
| **Critical** | Money lost, data exposed, or checkout unusable | Boutique paid twice; buyer can open another buyer's slip; Place Order fails for everyone | Blocks release; fix immediately |
| **High** | A core flow is wrong for some users, no workaround | Stock not returned after cancel; COD package accepted with a non-COD courier | Blocks release |
| **Medium** | Wrong but has a workaround, or affects admins only | Activity log missing an entry; wrong count on a tab | Fix in next release |
| **Low** | Cosmetic or wording | Misaligned button; typo in an email | Backlog |

## 4. Definition of Done

A change is done only when **all** of these are true:

1. Every acceptance criterion in its user story passes.
2. **No open Critical or High bugs in checkout, payments, payouts, refunds or stock.**
3. Server-side checks exist for every rule. Hiding a button in the page is not enough.
4. TypeScript (`npx tsc --noEmit`) and ESLint pass with no errors.
5. The Playwright suite passes in Chromium, Firefox and WebKit (CI workflow `qa.yml`).
6. A new database change comes with a migration in `drizzle/` that applies cleanly to an empty database.
7. The traceability matrix is updated, so each new requirement has at least one test.
8. Emails or screens that buyers or boutiques see have been checked by a person.

## 5. Entry and exit criteria for a test cycle

**Entry:** the build compiles; migrations apply; the seed and demo data load; test accounts can log in.

**Exit:** all Priority 1 test cases pass; no open Critical or High bugs; any open Medium bugs are
recorded in `issues/` with an owner; the product owner has signed off the UAT checklist.

## 6. Continuous improvement

Every escaped bug (one found after release) gets:
1. a bug report (`issues/bug-report-template.md`) with its root cause,
2. a new test case that would have caught it,
3. a note in the retrospective on why the process missed it.

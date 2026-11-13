# Test Data Strategy

MIVO's tests create real orders, reduce real stock and send real emails. Without a plan, test
runs damage each other and the data people use for demos. This document explains where test data
comes from, how it is kept apart, and how it is cleaned up.

## 1. Environments

| Environment | Database | Data | Used for |
|---|---|---|---|
| **Local dev** | `mivo` in Docker (`mivo-db`) | Seed + demo seed | Development, manual testing, local Playwright runs |
| **CI** | Fresh Postgres service per run (GitHub Actions) | Seed + demo seed, thrown away after the run | Automated regression on every push and pull request |
| **Production** | Live database | Real customers | **Never** used for testing. No seed, no load tests without warning. |

The CI database is the cleanest option: it is created empty, filled, tested and deleted, so runs
can never affect each other.

## 2. Baseline data (seed scripts)

```bash
npm run db:migrate      # create tables
npm run db:seed         # accounts (password for all: password123)
npm run db:seed:demo    # products with generated photos and stock per size
```

| Account | Role | State |
|---|---|---|
| `admin@mivo.lk` | Admin | — |
| `seller@mivo.lk` | Boutique "Mivo Test Boutique" | Approved |
| `batik@mivo.lk` | Boutique "Colombo Batik House" | Awaiting approval (its Batik Kaftan is hidden) |
| `buyer@mivo.lk` | Buyer | For manual testing |

| Product | Price (LKR) | Stock per size | Useful for |
|---|---|---|---|
| Linen Wrap Dress | 6,450 | S 3, M 3, L 2 | Happy-path checkout (automated tests) |
| Cotton Puff-Sleeve Top | 3,200 | XS 2, S 3, M 3, L 2, XL 2 | Multi-size orders |
| Wide-Leg Trousers | 4,800 | S 1, M 0, L 2, XL 0 | Sold-out sizes, last-item races |
| Handloom Saree | 12,900 | FREE SIZE 2 | One-size items |
| Archived Blazer | 9,900 | M 1 (inactive) | Must never appear in the shop |
| Batik Kaftan | 5,600 | FREE SIZE 5 | Unapproved boutique: must be hidden |

These seed accounts use a known password. **Never run the seed against production.**

## 3. Automated tests create their own users

Shared accounts cause flaky tests: MIVO limits each buyer to 5 orders an hour and 3 unfinished
COD orders, so a shared `buyer@mivo.lk` would hit those limits after a few runs.

Instead, the Playwright suite (`ui-tests/global-setup.ts`):
1. creates **one fresh buyer per browser** for each run, e.g. `qa-chromium-1731400000@mivo.test`,
2. marks their email as confirmed (so checkout is allowed),
3. writes the logins to `.auth/users.json` for the tests to use.

The `@mivo.test` domain is reserved for test data. It can't receive mail, and it makes test rows
easy to find and delete.

## 4. Cleanup (global teardown)

After every run, `ui-tests/global-teardown.ts`:
1. puts back the stock taken by orders from `@mivo.test` buyers (orders that weren't cancelled),
2. deletes those orders (items, packages and refunds go with them),
3. deletes the `@mivo.test` users.

If a run crashes before teardown, the next run's teardown still removes **all** `@mivo.test`
data, not just its own, so leftovers never pile up.

## 5. Fixture files (`test-data/`)

| File | What it is | Used in |
|---|---|---|
| `valid-slip.png` | A real, tiny PNG image | TC-04: valid slip upload |
| `fake-slip.jpg` | A **text file** renamed to `.jpg` | TC-05: server must detect the real type and reject it |

## 6. Couriers and tracking numbers

- Fresh databases have **no** courier with a MIVO COD account, so checkout offers bank transfer
  only. To test COD, go to Admin → Couriers, give Koombiyo an account number such as `KB-TEST-001`,
  and tick *MIVO COD account*.
- Use clearly fake tracking numbers with a courier prefix and a test range, e.g. `KB900001`
  (Koombiyo) or `PR900001` (Pronto). Never use a real customer's tracking number.
- Test phone numbers: `0771234567`. Test addresses: `12 Galle Road, Colombo`.

## 7. Emails

- **Local:** leave `SMTP_HOST` empty and emails are saved to `.outbox/` instead of being sent.
  Testers open them to check content.
- **CI:** emails are not checked by the UI suite; `SMTP_HOST` points at a dummy host so the
  server starts, and sending failures are logged without affecting the tests.

## 8. Sensitive data

- No real bank slips, NICs, phone numbers or addresses in test data.
- Test bank details (`PLATFORM_BANK_*`) in CI are fake values set in the workflow.
- Screenshots and traces saved by Playwright on failure contain only test data.

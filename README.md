# MIVO

Curated clothing marketplace for Sri Lankan boutiques. Next.js 16 (App Router), Postgres + Drizzle ORM, Auth.js.

## Local development

```bash
cp .env.example .env.local   # fill in DATABASE_URL and AUTH_SECRET; leave SMTP_HOST empty
npm install
npm run db:migrate
npm run db:seed              # demo admin / seller / buyer accounts
npm run dev
```

Without `SMTP_HOST`, emails are saved to `.outbox/*.html` instead of being sent (development only).

## Deploying (Dokploy)

### 1. Environment variables
Set everything in [`.env.example`](.env.example). In production the server **refuses to start** if a required
variable is missing or wrong, and prints which ones (see `src/lib/env-check.ts`).

### 2. Persistent volume for uploads (required)
Product photos and bank slips are files on disk. Containers start empty on every deploy, so without a
volume **all uploads disappear on the next redeploy**.

- Dokploy → your app → **Advanced → Volumes / Mounts** → add a volume mounted at `/data`
- Set `UPLOAD_DIR=/data/uploads`

### 3. Database migrations
Run before (or right after) each deploy that includes new files in `drizzle/`:

```bash
npm run db:migrate
```

### 4. Hourly job (required)
Unpaid bank-transfer orders get a reminder after 24 hours and are cancelled after 72 hours, which puts their
stock back on sale. Expired password-reset links are cleaned up. Add a Dokploy **Schedule** (hourly, `0 * * * *`)
that runs inside the app container:

```bash
curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron
```

It returns e.g. `{"reminded":1,"expired":0,"tokensDeleted":3}` and is safe to run more often.

### 5. Database backups
Add a daily `pg_dump` backup of the Postgres service in Dokploy (Database → Backups) before taking real orders.

### 6. Courier accounts (before offering cash on delivery)
Couriers pay COD cash to whoever owns the account a parcel was booked on, so COD parcels must be booked on
**MIVO's** merchant accounts. On **Admin → Couriers**, for each courier MIVO has an account with, enter the
account number and booking steps for boutiques (never a password) and tick **MIVO COD account**.
Until at least one courier is ticked, checkout offers bank transfer only. COD packages can only be dispatched
with ticked couriers. **Admin → Shipments → Download on-the-way packages (CSV)** lists parcels with couriers
and the COD cash each should bring in, for matching against courier statements.

### 7. One app instance
Login, sign-up, order and password-reset rate limits are kept in memory. That is correct for a single
container; if you ever scale to several, move them to Redis or Postgres (`src/lib/rate-limit.ts`).

## Money rules (summary)

- Buyers pay MIVO (bank transfer, or cash to the courier for COD). Delivery is LKR 400 per boutique package.
- A boutique becomes payable for a package **7 days after delivery** (the return window, `SITE.returnDays`).
- Payout = items − commission (at the rate saved on each item at checkout) + delivery fees the boutique paid
  itself on prepaid packages. COD packages are booked on MIVO's courier accounts, so there is nothing to repay.
- Cancellations and returns create refund records; admins settle them on **Admin → Orders → Refunds due**.

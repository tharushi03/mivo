// Direct database access for test setup, cleanup and checks.
// Uses DATABASE_URL, or reads it from the app's .env.local when running locally.
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";

export const TEST_DOMAIN = "@mivo.test";
export const TEST_PASSWORD = "Qa-Test-Pass-2026!";
export const USERS_FILE = join(__dirname, "..", ".auth", "users.json");

/**
 * A setting of the app under test: from the environment (CI), or else from the app's
 * .env.local (local runs), so tests and app always agree.
 */
export function appEnv(name: string): string | undefined {
  if (process.env[name]) return process.env[name];
  const envFile = join(__dirname, "..", "..", "..", ".env.local");
  if (!existsSync(envFile)) return undefined;
  const line = readFileSync(envFile, "utf8")
    .split(/\r?\n/)
    .find((l) => l.startsWith(`${name}=`));
  return line?.slice(name.length + 1).trim().replace(/^"|"$/g, "");
}

function databaseUrl() {
  const url = appEnv("DATABASE_URL");
  if (!url) throw new Error("Set DATABASE_URL to the database the app under test uses.");
  return url;
}

export async function withDb<T>(fn: (db: Client) => Promise<T>): Promise<T> {
  const db = new Client({ connectionString: databaseUrl() });
  await db.connect();
  try {
    return await fn(db);
  } finally {
    await db.end();
  }
}

/**
 * Removes every test user (email ending in @mivo.test) and their orders, putting back the
 * stock those orders took. Cancelled orders already returned their stock, so they are skipped.
 */
export async function removeTestData(db: Client) {
  await db.query("begin");
  try {
    const buyers = `select id from users where email like '%' || $1`;
    await db.query(
      `update product_variants v set stock = v.stock + t.qty
         from (select oi.product_id, oi.selected_size, sum(oi.quantity)::int as qty
                 from order_items oi join orders o on o.id = oi.order_id
                where o.buyer_id in (${buyers}) and o.order_status <> 'CANCELLED'
                group by oi.product_id, oi.selected_size) t
        where v.product_id = t.product_id and v.size = t.selected_size`,
      [TEST_DOMAIN],
    );
    const orders = await db.query(`delete from orders where buyer_id in (${buyers})`, [TEST_DOMAIN]);
    const users = await db.query(`delete from users where email like '%' || $1`, [TEST_DOMAIN]);
    await db.query("commit");
    return { orders: orders.rowCount ?? 0, users: users.rowCount ?? 0 };
  } catch (err) {
    await db.query("rollback");
    throw err;
  }
}

// Runs once before all tests: clears leftovers from earlier runs, then creates one fresh,
// email-confirmed buyer per browser. Fresh users mean MIVO's per-buyer limits (5 orders an
// hour, 3 open COD orders) never make the tests flaky.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import bcrypt from "bcryptjs";
import type { FullConfig } from "@playwright/test";
import { removeTestData, TEST_DOMAIN, TEST_PASSWORD, USERS_FILE, withDb } from "./support/db";

export default async function globalSetup(config: FullConfig) {
  const run = Date.now();
  const hash = await bcrypt.hash(TEST_PASSWORD, 10);
  const users: Record<string, { email: string; password: string }> = {};

  await withDb(async (db) => {
    const left = await removeTestData(db);
    if (left.users) console.log(`[setup] removed ${left.users} leftover test users and ${left.orders} orders`);

    for (const project of config.projects) {
      const email = `qa-${project.name}-${run}${TEST_DOMAIN}`;
      await db.query(
        `insert into users (name, email, password_hash, role, email_verified)
         values ($1, $2, $3, 'BUYER', now())`,
        [`QA Buyer (${project.name})`, email, hash],
      );
      users[project.name] = { email, password: TEST_PASSWORD };
    }
  });

  mkdirSync(dirname(USERS_FILE), { recursive: true });
  writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

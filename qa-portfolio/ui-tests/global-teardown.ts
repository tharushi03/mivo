// Runs once after all tests: deletes the test buyers and their orders and restores stock,
// so the database is left exactly as before the run.
import { removeTestData, withDb } from "./support/db";

export default async function globalTeardown() {
  const removed = await withDb(removeTestData);
  console.log(`[teardown] removed ${removed.users} test users and ${removed.orders} orders; stock restored`);
}

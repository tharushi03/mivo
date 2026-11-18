import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set");

// Connection pool size: how many queries can run at once (extra ones wait their turn).
// Set DB_POOL_MAX to change it; 10 suits one app container. Each container has its own
// pool, so containers × DB_POOL_MAX must stay below Postgres's max_connections (100 by default).
const poolMax = Number(process.env.DB_POOL_MAX);
const max = Number.isInteger(poolMax) && poolMax >= 1 && poolMax <= 100 ? poolMax : 10;

// Reuse one connection pool across hot reloads in development.
const globalForDb = globalThis as unknown as { pgClient?: ReturnType<typeof postgres> };
const client = globalForDb.pgClient ?? postgres(connectionString, { max });
if (process.env.NODE_ENV !== "production") globalForDb.pgClient = client;

export const db = drizzle(client, { schema });

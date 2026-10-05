import { Pool, type QueryResultRow } from "pg";

// Tiger Cloud needs TLS; a local Postgres (for development) usually has none.
// node-postgres treats sslmode=require in the URL as verify-full and lets it
// override the ssl option, so we drop it from the URL and set TLS here.
export const dbUrl = (process.env.DATABASE_URL ?? "").replace(/([?&])sslmode=[^&]*&?/, "$1").replace(/[?&]$/, "");
export const dbSsl = /@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl) ? false : { rejectUnauthorized: false };

// One pool per server process.
const globalForPool = globalThis as unknown as { pgPool?: Pool };

export const pool =
  globalForPool.pgPool ??
  new Pool({
    connectionString: dbUrl,
    max: 3,
    ssl: dbSsl,
  });

if (process.env.NODE_ENV !== "production") globalForPool.pgPool = pool;

export async function q<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const res = await pool.query<T>(text, params);
  return res.rows;
}

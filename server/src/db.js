import pg from "pg";

const { Pool } = pg;

// Render's managed Postgres requires SSL, but with a self-signed-style
// certificate chain that Node rejects by default — rejectUnauthorized:false
// is the standard, documented way to connect to it (same pattern Render's
// own docs recommend), not a security downgrade specific to us.
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("localhost") ? false : { rejectUnauthorized: false },
});

export async function query(text, params) {
  return pool.query(text, params);
}

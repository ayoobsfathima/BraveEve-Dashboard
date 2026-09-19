/**
 * Adds a team member login to the dashboard.
 *
 * Usage:
 *   node scripts/create_user.js <username> <password> "<Display Name>" [email]
 *
 * Example:
 *   node scripts/create_user.js priya "correct-horse-battery" "Priya Sharma" priya@example.com
 *
 * The email is optional, but without it this person will never be picked
 * as the "owner" for a completion email -- see braveeve_sent_by/nccn_sent_by
 * in schema.sql. Existing users can have an email added later directly in
 * the database (UPDATE users SET email = '...' WHERE username = '...';).
 */
import "dotenv/config";
import { query } from "../server/src/db.js";
import { hashPassword } from "../server/src/auth.js";

const [username, password, displayName, email] = process.argv.slice(2);

if (!username || !password || !displayName) {
  console.error('Usage: node scripts/create_user.js <username> <password> "<Display Name>" [email]');
  process.exit(1);
}

const passwordHash = await hashPassword(password);

try {
  await query(
    "INSERT INTO users (username, password_hash, display_name, email) VALUES ($1, $2, $3, $4)",
    [username, passwordHash, displayName, email || null]
  );
  console.log(`Created user "${username}" (${displayName})${email ? `, email: ${email}` : " -- no email set"}.`);
} catch (err) {
  if (err.code === "23505") {
    console.error(`A user named "${username}" already exists.`);
  } else {
    console.error("Failed to create user:", err.message);
  }
  process.exit(1);
}

process.exit(0);

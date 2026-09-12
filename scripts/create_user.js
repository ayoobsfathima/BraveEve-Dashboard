/**
 * Adds a team member login to the dashboard.
 *
 * Usage:
 *   node scripts/create_user.js <username> <password> "<Display Name>"
 *
 * Example:
 *   node scripts/create_user.js priya "correct-horse-battery" "Priya Sharma"
 */
import "dotenv/config";
import { query } from "../server/src/db.js";
import { hashPassword } from "../server/src/auth.js";

const [username, password, displayName] = process.argv.slice(2);

if (!username || !password || !displayName) {
  console.error('Usage: node scripts/create_user.js <username> <password> "<Display Name>"');
  process.exit(1);
}

const passwordHash = await hashPassword(password);

try {
  await query(
    "INSERT INTO users (username, password_hash, display_name) VALUES ($1, $2, $3)",
    [username, passwordHash, displayName]
  );
  console.log(`Created user "${username}" (${displayName}).`);
} catch (err) {
  if (err.code === "23505") {
    console.error(`A user named "${username}" already exists.`);
  } else {
    console.error("Failed to create user:", err.message);
  }
  process.exit(1);
}

process.exit(0);

/**
 * Sets (or updates) an existing team member's email address, used for
 * routing "patient finished a tool" alerts to the person who sent them
 * the link, instead of the whole team.
 *
 * Usage:
 *   node scripts/set_user_email.js <username> <email>
 *
 * Example:
 *   node scripts/set_user_email.js fathimaayoob fathima@example.com
 */
import "dotenv/config";
import { query } from "../server/src/db.js";

const [username, email] = process.argv.slice(2);

if (!username || !email) {
  console.error("Usage: node scripts/set_user_email.js <username> <email>");
  process.exit(1);
}

const result = await query("UPDATE users SET email = $1 WHERE username = $2 RETURNING id, display_name", [
  email,
  username,
]);

if (result.rows.length === 0) {
  console.error(`No user named "${username}" found.`);
  process.exit(1);
}

console.log(`Set email for "${username}" (${result.rows[0].display_name}) to ${email}.`);
process.exit(0);

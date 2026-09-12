import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { pool } from "../server/src/db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(__dirname, "..", "server", "data", "schema.sql");

const sql = fs.readFileSync(schemaPath, "utf8");

try {
  await pool.query(sql);
  console.log("Schema applied successfully.");
} catch (err) {
  console.error("Failed to apply schema:", err.message);
  process.exit(1);
}

process.exit(0);

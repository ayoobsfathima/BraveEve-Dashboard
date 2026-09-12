import bcrypt from "bcryptjs";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { pool, query } from "./db.js";

const PgSession = connectPgSimple(session);

export function sessionMiddleware() {
  return session({
    store: new PgSession({
      pool,
      createTableIfMissing: true,
    }),
    secret: process.env.SESSION_SECRET || "change-me-in-production",
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 1000 * 60 * 60 * 24 * 14, // 14 days — a field team member shouldn't need to re-login daily
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
    },
  });
}

export function requireLogin(req, res, next) {
  if (req.session && req.session.userId) return next();
  return res.status(401).json({ error: "Not logged in." });
}

export async function verifyLogin(username, password) {
  const result = await query("SELECT id, username, password_hash, display_name FROM users WHERE username = $1", [
    username,
  ]);
  const user = result.rows[0];
  if (!user) return null;

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return null;

  return { id: user.id, username: user.username, displayName: user.display_name };
}

export async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

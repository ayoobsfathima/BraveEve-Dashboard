import express from "express";
import { verifyLogin } from "../auth.js";

const router = express.Router();

router.post("/login", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required." });
  }

  const user = await verifyLogin(username, password);
  if (!user) {
    return res.status(401).json({ error: "Incorrect username or password." });
  }

  req.session.userId = user.id;
  req.session.displayName = user.displayName;
  res.json({ id: user.id, displayName: user.displayName });
});

router.post("/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.get("/me", (req, res) => {
  if (!req.session || !req.session.userId) return res.status(401).json({ error: "Not logged in." });
  res.json({ id: req.session.userId, displayName: req.session.displayName });
});

export default router;

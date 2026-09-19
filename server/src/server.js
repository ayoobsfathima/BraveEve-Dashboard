import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { sessionMiddleware, requireLogin } from "./auth.js";
import authRoutes from "./routes/auth.js";
import patientsRoutes from "./routes/patients.js";
import qq10Routes from "./routes/qq10.js";
import interviewsRoutes from "./routes/interviews.js";
import { startCompletionPoller } from "./completionPoller.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "..", "..", "public");

const app = express();
app.use(express.json());
app.set("trust proxy", 1); // needed for secure cookies behind Render's proxy
app.use(sessionMiddleware());
app.use(express.static(PUBLIC_DIR));

app.use("/api/auth", authRoutes);
app.use("/api/patients", patientsRoutes);
app.use("/api/qq10", qq10Routes);
app.use("/api/interviews", interviewsRoutes);

// Everything else in the app requires login — this is a simple whole-page
// gate, not per-field permissions, matching "any of the 2-4 team members
// can see and edit everything."
app.get("/api/session-check", requireLogin, (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`BraveEve Dashboard listening on http://localhost:${PORT}`);
  startCompletionPoller();
});

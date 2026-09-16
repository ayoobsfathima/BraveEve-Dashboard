import express from "express";
import { query } from "../db.js";
import { requireLogin } from "../auth.js";
import { sendCsv } from "../csvUtil.js";
import { transcribeAndTranslate } from "../voice.js";

const router = express.Router();
router.use(requireLogin);

async function createHcp(hcp) {
  const result = await query(
    `INSERT INTO health_professionals (name, age, date_of_birth, department, designation)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [hcp.name, hcp.age || null, hcp.dateOfBirth || null, hcp.department || null, hcp.designation || null]
  );
  return result.rows[0].id;
}

async function updateHcp(hcpId, hcp) {
  await query(
    `UPDATE health_professionals SET name = $1, age = $2, date_of_birth = $3, department = $4, designation = $5
     WHERE id = $6`,
    [hcp.name, hcp.age || null, hcp.dateOfBirth || null, hcp.department || null, hcp.designation || null, hcpId]
  );
}

router.post("/", async (req, res) => {
  const b = req.body;
  if (!b.hcp || !b.hcp.name) {
    return res.status(400).json({ error: "Health professional name is required." });
  }

  try {
    const hcpId = await createHcp(b.hcp);
    const result = await query(
      `INSERT INTO hcp_interviews (
        health_professional_id, interview_date,
        q1_usefulness, q2_clarity, q3_workflow, q4_communication, q5_suggestions, native_notes, created_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING id`,
      [
        hcpId,
        b.interviewDate || new Date().toISOString().slice(0, 10),
        b.q1Usefulness || null,
        b.q2Clarity || null,
        b.q3Workflow || null,
        b.q4Communication || null,
        b.q5Suggestions || null,
        JSON.stringify(b.nativeNotes || {}),
        req.session.userId,
      ]
    );
    res.json({ id: result.rows[0].id });
  } catch (err) {
    console.error("[interviews] save failed:", err);
    res.status(500).json({ error: "Could not save interview." });
  }
});

router.get("/", async (req, res) => {
  try {
    const result = await query(
      `SELECT i.id, i.interview_date, h.name AS hcp_name, h.department, h.designation, i.created_at
       FROM hcp_interviews i
       JOIN health_professionals h ON h.id = i.health_professional_id
       ORDER BY i.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error("[interviews] list failed:", err);
    res.status(500).json({ error: "Could not load interviews." });
  }
});

// CSV export — defined before "/:id" so "export.csv" isn't swallowed by
// the :id param route.
router.get("/export.csv", async (req, res) => {
  try {
    const result = await query(
      `SELECT h.name AS hcp_name, h.department, h.designation, i.interview_date,
              i.q1_usefulness, i.q2_clarity, i.q3_workflow, i.q4_communication, i.q5_suggestions, i.created_at
       FROM hcp_interviews i
       JOIN health_professionals h ON h.id = i.health_professional_id
       ORDER BY i.created_at DESC`
    );
    sendCsv(res, "hcp_interviews.csv", result.rows, [
      "hcp_name", "department", "designation", "interview_date",
      "q1_usefulness", "q2_clarity", "q3_workflow", "q4_communication", "q5_suggestions", "created_at",
    ]);
  } catch (err) {
    console.error("[interviews] export failed:", err);
    res.status(500).json({ error: "Could not export interviews." });
  }
});

// Voice note: raw audio in, { nativeText, englishText } out. Pure
// speech-to-text -- nothing is saved here, the interviewer reviews/edits
// the transcribed text before it's included in the actual Save.
router.post(
  "/transcribe",
  express.raw({ type: "*/*", limit: "10mb" }),
  async (req, res) => {
    if (!req.body || !Buffer.isBuffer(req.body) || req.body.length === 0) {
      return res.status(400).json({ error: "No audio received." });
    }
    try {
      const mimeType = req.headers["content-type"] || "audio/webm";
      const { nativeText, englishText } = await transcribeAndTranslate(req.body, mimeType);
      res.json({ nativeText, englishText });
    } catch (err) {
      console.error("[interviews] transcribe failed:", err);
      res.status(502).json({
        error: "Couldn't transcribe that. Please try again, or type your notes instead.",
      });
    }
  }
);

// One interview's full detail, including the HCP's info — for the
// review/edit screen.
router.get("/:id", async (req, res) => {
  try {
    const result = await query(
      `SELECT i.*, h.name AS hcp_name, h.age AS hcp_age, h.date_of_birth AS hcp_date_of_birth,
              h.department AS hcp_department, h.designation AS hcp_designation
       FROM hcp_interviews i
       JOIN health_professionals h ON h.id = i.health_professional_id
       WHERE i.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Interview not found." });
    res.json(result.rows[0]);
  } catch (err) {
    console.error("[interviews] get failed:", err);
    res.status(500).json({ error: "Could not load interview." });
  }
});

// Update an existing interview (and its HCP's details) in place
router.put("/:id", async (req, res) => {
  const b = req.body;
  if (!b.hcp || !b.hcp.name) {
    return res.status(400).json({ error: "Health professional name is required." });
  }
  try {
    const existing = await query("SELECT health_professional_id FROM hcp_interviews WHERE id = $1", [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: "Interview not found." });

    await updateHcp(existing.rows[0].health_professional_id, b.hcp);

    await query(
      `UPDATE hcp_interviews SET
        interview_date = $1, q1_usefulness = $2, q2_clarity = $3, q3_workflow = $4,
        q4_communication = $5, q5_suggestions = $6, native_notes = $7
       WHERE id = $8`,
      [
        b.interviewDate || new Date().toISOString().slice(0, 10),
        b.q1Usefulness || null,
        b.q2Clarity || null,
        b.q3Workflow || null,
        b.q4Communication || null,
        b.q5Suggestions || null,
        JSON.stringify(b.nativeNotes || {}),
        req.params.id,
      ]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error("[interviews] update failed:", err);
    res.status(500).json({ error: "Could not update interview." });
  }
});

export default router;

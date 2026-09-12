import express from "express";
import { query } from "../db.js";
import { requireLogin } from "../auth.js";

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
        q1_usefulness, q2_clarity, q3_workflow, q4_communication, q5_suggestions, created_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING id`,
      [
        hcpId,
        b.interviewDate || new Date().toISOString().slice(0, 10),
        b.q1Usefulness || null,
        b.q2Clarity || null,
        b.q3Workflow || null,
        b.q4Communication || null,
        b.q5Suggestions || null,
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

export default router;

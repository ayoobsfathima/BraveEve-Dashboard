import express from "express";
import { query } from "../db.js";
import { requireLogin } from "../auth.js";

const router = express.Router();
router.use(requireLogin);

const VALID_TOOLS = ["braveeve", "nccn"];
const VALID_ANSWERS = ["strongly_agree", "mostly_agree", "neither", "mostly_disagree", "strongly_disagree"];

router.post("/", async (req, res) => {
  const b = req.body;
  if (!VALID_TOOLS.includes(b.tool)) {
    return res.status(400).json({ error: "tool must be 'braveeve' or 'nccn'." });
  }
  if (!b.patientId) {
    return res.status(400).json({ error: "patientId is required." });
  }

  const answerFields = [
    "q1HelpedCommunicate", "q2Relevant", "q3EasyToComplete", "q4IncludedAllAspects",
    "q5Enjoyed", "q6WouldRepeat", "q7TooLong", "q8TooEmbarrassing", "q9TooComplicated", "q10UpsetMe",
  ];
  for (const field of answerFields) {
    if (b[field] && !VALID_ANSWERS.includes(b[field])) {
      return res.status(400).json({ error: `Invalid answer for ${field}.` });
    }
  }

  try {
    const result = await query(
      `INSERT INTO qq10_responses (
        patient_id, tool,
        q1_helped_communicate, q2_relevant, q3_easy_to_complete, q4_included_all_aspects,
        q5_enjoyed, q6_would_repeat, q7_too_long, q8_too_embarrassing, q9_too_complicated, q10_upset_me,
        comment_improve, comment_missed, comment_overrepresented, created_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
      ON CONFLICT (patient_id, tool) DO UPDATE SET
        q1_helped_communicate = EXCLUDED.q1_helped_communicate,
        q2_relevant = EXCLUDED.q2_relevant,
        q3_easy_to_complete = EXCLUDED.q3_easy_to_complete,
        q4_included_all_aspects = EXCLUDED.q4_included_all_aspects,
        q5_enjoyed = EXCLUDED.q5_enjoyed,
        q6_would_repeat = EXCLUDED.q6_would_repeat,
        q7_too_long = EXCLUDED.q7_too_long,
        q8_too_embarrassing = EXCLUDED.q8_too_embarrassing,
        q9_too_complicated = EXCLUDED.q9_too_complicated,
        q10_upset_me = EXCLUDED.q10_upset_me,
        comment_improve = EXCLUDED.comment_improve,
        comment_missed = EXCLUDED.comment_missed,
        comment_overrepresented = EXCLUDED.comment_overrepresented
      RETURNING id`,
      [
        b.patientId, b.tool,
        b.q1HelpedCommunicate || null, b.q2Relevant || null, b.q3EasyToComplete || null,
        b.q4IncludedAllAspects || null, b.q5Enjoyed || null, b.q6WouldRepeat || null,
        b.q7TooLong || null, b.q8TooEmbarrassing || null, b.q9TooComplicated || null, b.q10UpsetMe || null,
        b.commentImprove || null, b.commentMissed || null, b.commentOverrepresented || null,
        req.session.userId,
      ]
    );
    res.json({ id: result.rows[0].id });
  } catch (err) {
    console.error("[qq10] save failed:", err);
    res.status(500).json({ error: "Could not save QQ-10 response." });
  }
});

export default router;

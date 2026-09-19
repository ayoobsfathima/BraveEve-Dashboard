import { query } from "./db.js";
import { fetchSheetRows } from "./sheetsReader.js";
import { sendCompletionEmail } from "./mailer.js";

// Column layout of BraveEve's "responses" sheet (see braveeve_node's
// server/src/sheets.js HEADER) -- kept in sync by hand since the two
// projects don't share code.
const BE = {
  patientId: 1,
  questionNumber: 5,
  category: 6,
  problemItem: 7,
  answer: 8,
};

// Column layout of NCCN's response sheet (see NCCN's app.py HEADER_ROW).
const NCCN = {
  patientId: 5,
};

/**
 * Pulls BraveEve's "SESSION_STATUS" sentinel rows (one per finished/aborted
 * session -- see braveeve_node's persistCompletionMarker) into
 * { patientCode, status }[]. A session with no pid (opened without a QR
 * link, e.g. internal testing) is skipped since it can't be tied to a study
 * patient.
 */
function extractBraveEveCompletions(rows) {
  const out = [];
  for (const row of rows) {
    const patientCode = (row[BE.patientId] || "").trim();
    const category = row[BE.category];
    const problemItem = row[BE.problemItem];
    if (!patientCode || category !== "META" || problemItem !== "SESSION_STATUS") continue;
    const answer = (row[BE.answer] || "").trim();
    out.push({ patientCode, status: answer === "COMPLETED" ? "completed" : "stopped_early" });
  }
  return out;
}

/**
 * NCCN writes exactly one row per patient, only on final submit -- so any
 * row with a pid is a completion.
 */
function extractNccnCompletions(rows) {
  const out = [];
  for (const row of rows) {
    const patientCode = (row[NCCN.patientId] || "").trim();
    if (!patientCode) continue;
    out.push({ patientCode, status: "completed" });
  }
  return out;
}

/**
 * Inserts newly-seen completions into tool_completions (first sighting per
 * patient/tool wins, matching the study's one-attempt-per-tool design), and
 * emails the team for each one that was actually new. Returns the count of
 * new completions found, for logging.
 */
async function recordAndNotify(tool, completions) {
  let newCount = 0;
  for (const { patientCode, status } of completions) {
    const result = await query(
      `INSERT INTO tool_completions (patient_code, tool, status)
       VALUES ($1, $2, $3)
       ON CONFLICT (patient_code, tool) DO NOTHING
       RETURNING id`,
      [patientCode, tool, status]
    );
    if (result.rows.length === 0) continue; // already recorded -- not new
    newCount++;

    let patientName = null;
    let ownerEmail = null;
    try {
      const sentByColumn = tool === "braveeve" ? "braveeve_sent_by" : "nccn_sent_by";
      const p = await query(
        `SELECT p.name, u.email AS owner_email
         FROM patients p
         LEFT JOIN users u ON u.id = p.${sentByColumn}
         WHERE p.patient_code = $1`,
        [patientCode]
      );
      if (p.rows.length > 0) {
        patientName = p.rows[0].name;
        ownerEmail = p.rows[0].owner_email || null;
      }
    } catch (err) {
      console.error("[completionPoller] patient lookup failed:", err);
    }

    try {
      // Owner's email if we know who sent this patient the link; otherwise
      // sendCompletionEmail falls back to the whole team (NOTIFY_EMAIL_TO).
      const sent = await sendCompletionEmail({ patientName, patientCode, tool, status, to: ownerEmail });
      if (sent) await query("UPDATE tool_completions SET notified_at = now() WHERE patient_code = $1 AND tool = $2", [patientCode, tool]);
    } catch (err) {
      // A failed email shouldn't stop the poller from recording the next
      // completion, or from trying again next cycle for other patients.
      console.error(`[completionPoller] failed to send email for ${patientCode}/${tool}:`, err);
    }
  }
  return newCount;
}

export async function pollOnce() {
  const braveeveSheetId = process.env.BRAVEEVE_GOOGLE_SHEET_ID;
  const nccnSheetId = process.env.NCCN_GOOGLE_SHEET_ID;
  const braveeveTab = process.env.BRAVEEVE_GOOGLE_SHEET_TAB || "responses";
  const nccnTab = process.env.NCCN_GOOGLE_SHEET_TAB || "responses";

  if (!braveeveSheetId && !nccnSheetId) return; // not configured -- nothing to do

  try {
    if (braveeveSheetId) {
      const rows = await fetchSheetRows(braveeveSheetId, braveeveTab);
      const completions = extractBraveEveCompletions(rows);
      const newCount = await recordAndNotify("braveeve", completions);
      if (newCount > 0) console.log(`[completionPoller] ${newCount} new BraveEve completion(s).`);
    }
  } catch (err) {
    console.error("[completionPoller] BraveEve poll failed:", err);
  }

  try {
    if (nccnSheetId) {
      const rows = await fetchSheetRows(nccnSheetId, nccnTab);
      const completions = extractNccnCompletions(rows);
      const newCount = await recordAndNotify("nccn", completions);
      if (newCount > 0) console.log(`[completionPoller] ${newCount} new NCCN completion(s).`);
    }
  } catch (err) {
    console.error("[completionPoller] NCCN poll failed:", err);
  }
}

/**
 * Starts polling both sheets on an interval (default 2 minutes). Safe to
 * call even when nothing is configured -- pollOnce() just no-ops each tick.
 */
export function startCompletionPoller() {
  const intervalMs = Number(process.env.COMPLETION_POLL_INTERVAL_MS) || 2 * 60 * 1000;
  if (!process.env.BRAVEEVE_GOOGLE_SHEET_ID && !process.env.NCCN_GOOGLE_SHEET_ID) {
    console.log("[completionPoller] BRAVEEVE_GOOGLE_SHEET_ID / NCCN_GOOGLE_SHEET_ID not set -- completion polling disabled.");
    return;
  }
  console.log(`[completionPoller] polling every ${Math.round(intervalMs / 1000)}s.`);
  pollOnce();
  setInterval(pollOnce, intervalMs);
}

// Exported for testing.
export { extractBraveEveCompletions, extractNccnCompletions, recordAndNotify };

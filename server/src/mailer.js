import nodemailer from "nodemailer";

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT) || 587,
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  return transporter;
}

/**
 * Sends a "patient X just finished tool Y" alert to the study team's
 * inbox(es) (NOTIFY_EMAIL_TO, comma-separated). Silently no-ops (with a
 * console log) if SMTP isn't configured, rather than crashing the poller --
 * email is a notification convenience, not something that should ever take
 * down data collection.
 */
export async function sendCompletionEmail({ patientName, patientCode, tool, status, to: toOverride }) {
  // Prefer whoever sent this specific patient the link (the "owner"); fall
  // back to the whole team list if no owner is on record -- e.g. the link
  // was shared some other way, or this patient predates the mark-sent
  // feature.
  const to = toOverride || process.env.NOTIFY_EMAIL_TO;
  const t = getTransporter();
  if (!t || !to) {
    console.log(
      `[mailer] SMTP not configured or no recipient -- would have emailed ${to || "(no recipient)"}: ` +
        `${patientCode} (${patientName || "no name on file"}) ` +
        `${status === "completed" ? "completed" : "stopped early on"} ${tool}.`
    );
    return false;
  }

  const toolLabel = tool === "braveeve" ? "BraveEve" : "NCCN Distress Thermometer";
  const statusLabel = status === "completed" ? "just completed" : "stopped partway through";
  const dashboardUrl = process.env.DASHBOARD_BASE_URL || "";

  await t.sendMail({
    from: process.env.NOTIFY_EMAIL_FROM || process.env.SMTP_USER,
    to,
    subject: `${patientCode} ${statusLabel} ${toolLabel}`,
    text:
      `${patientCode}${patientName ? ` (${patientName})` : ""} ${statusLabel} ${toolLabel}.\n\n` +
      (status === "completed"
        ? "They're ready for the QQ-10 usability interview on this tool.\n\n"
        : "They didn't finish -- you may want to follow up before scheduling the interview.\n\n") +
      (dashboardUrl ? `Open their record: ${dashboardUrl}\n` : ""),
  });
  return true;
}

import nodemailer from "nodemailer";

// Render (and most PaaS hosts) block outbound SMTP ports (25/465/587)
// entirely, so raw SMTP -- which works fine locally -- times out once
// deployed there. Brevo sends over a normal HTTPS request instead, so it
// works everywhere, and (like SendGrid) lets you verify just one sender
// email address rather than a whole domain via DNS -- much lighter setup
// for a small study team. Tried first when configured; SMTP is kept as a
// fallback for local testing or a host that does allow SMTP out.
async function sendViaBrevo({ from, to, subject, text }) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) return null; // not configured -- caller falls back to SMTP

  const recipients = to.split(",").map((s) => s.trim()).filter(Boolean);

  const resp = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      sender: { email: from },
      to: recipients.map((email) => ({ email })),
      subject,
      textContent: text,
    }),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`Brevo API error ${resp.status}: ${body}`);
  }
  return true;
}

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
 * Sends a "patient X just finished tool Y" alert -- to whoever sent that
 * patient the link (the "owner"), or the whole team (NOTIFY_EMAIL_TO) if no
 * owner is on record. Tries Brevo first (works on Render), falls back to
 * SMTP (works locally, and anywhere SMTP isn't blocked). Silently no-ops
 * (with a console log) if neither is configured, or if sending fails --
 * email is a notification convenience, not something that should ever take
 * down data collection.
 */
export async function sendCompletionEmail({ patientName, patientCode, tool, status, to: toOverride }) {
  const to = toOverride || process.env.NOTIFY_EMAIL_TO;
  if (!to) {
    console.log(
      `[mailer] No recipient -- would have emailed (no recipient): ` +
        `${patientCode} (${patientName || "no name on file"}) ` +
        `${status === "completed" ? "completed" : "stopped early on"} ${tool}.`
    );
    return false;
  }

  const toolLabel = tool === "braveeve" ? "BraveEve" : "NCCN Distress Thermometer";
  const statusLabel = status === "completed" ? "just completed" : "stopped partway through";
  const dashboardUrl = process.env.DASHBOARD_BASE_URL || "";
  const from = process.env.NOTIFY_EMAIL_FROM || process.env.SMTP_USER;
  const subject = `${patientCode} ${statusLabel} ${toolLabel}`;
  const text =
    `${patientCode}${patientName ? ` (${patientName})` : ""} ${statusLabel} ${toolLabel}.\n\n` +
    (status === "completed"
      ? "They're ready for the QQ-10 usability interview on this tool.\n\n"
      : "They didn't finish -- you may want to follow up before scheduling the interview.\n\n") +
    (dashboardUrl ? `Open their record: ${dashboardUrl}\n` : "");

  try {
    const sentViaBrevo = await sendViaBrevo({ from, to, subject, text });
    if (sentViaBrevo) return true;
  } catch (err) {
    console.error(`[mailer] Brevo send failed, falling back to SMTP if configured:`, err.message);
  }

  const t = getTransporter();
  if (!t) {
    console.log(
      `[mailer] Neither BREVO_API_KEY nor SMTP is configured -- would have emailed ${to}: ` +
        `${patientCode} (${patientName || "no name on file"}) ` +
        `${status === "completed" ? "completed" : "stopped early on"} ${tool}.`
    );
    return false;
  }

  await t.sendMail({ from, to, subject, text });
  return true;
}

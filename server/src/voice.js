/**
 * Wraps Sarvam AI's /speech-to-text endpoint (Saaras v3), same pattern as
 * BraveEve's own voice.js. For every recording we make two calls in
 * parallel on the same audio clip:
 *   - mode="transcribe" -> text in whatever language was spoken (native script)
 *   - mode="translate"  -> the same content, in English
 *
 * Used for HCP interview answers: the native-language text is kept for
 * the record (matches what was actually said), the English text is what
 * fills the textarea for the interviewer to review/edit.
 */

const SARVAM_STT_URL = "https://api.sarvam.ai/speech-to-text";
const SARVAM_MODEL = "saaras:v3";

async function callSarvamSTT(audioBuffer, mimeType, mode) {
  const apiKey = process.env.SARVAM_API_KEY;
  if (!apiKey) {
    throw new Error("SARVAM_API_KEY is not set");
  }

  const baseMimeType = (mimeType || "audio/webm").split(";")[0].trim();
  const extension = baseMimeType.includes("mp4") ? "mp4" : baseMimeType.includes("ogg") ? "ogg" : "webm";

  const form = new FormData();
  const blob = new Blob([audioBuffer], { type: baseMimeType });
  form.append("file", blob, `note.${extension}`);
  form.append("model", SARVAM_MODEL);
  form.append("mode", mode);

  const res = await fetch(SARVAM_STT_URL, {
    method: "POST",
    headers: { "api-subscription-key": apiKey },
    body: form,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Sarvam STT (${mode}) failed: HTTP ${res.status} ${body}`);
  }

  const data = await res.json();
  return (data.transcript || "").trim();
}

/** Returns { nativeText, englishText } for one audio clip. */
export async function transcribeAndTranslate(audioBuffer, mimeType) {
  const [nativeText, englishText] = await Promise.all([
    callSarvamSTT(audioBuffer, mimeType, "transcribe"),
    callSarvamSTT(audioBuffer, mimeType, "translate"),
  ]);
  return { nativeText, englishText };
}

import express from "express";
import QRCode from "qrcode";
import { query } from "../db.js";
import { requireLogin } from "../auth.js";
import { sendCsv } from "../csvUtil.js";

const router = express.Router();
router.use(requireLogin);

async function nextPatientCode() {
  const result = await query("SELECT COUNT(*)::int AS count FROM patients");
  const n = result.rows[0].count + 1;
  return `BE-P${String(n).padStart(3, "0")}`;
}

function randomFirstTool() {
  return Math.random() < 0.5 ? "braveeve" : "nccn";
}

async function upsertHcp(hcp) {
  if (!hcp || !hcp.name) return null;
  const result = await query(
    `INSERT INTO health_professionals (name, age, date_of_birth, department, designation)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [hcp.name, hcp.age || null, hcp.dateOfBirth || null, hcp.department || null, hcp.designation || null]
  );
  return result.rows[0].id;
}

// Updates an existing HCP row in place (used when editing a patient who
// already has a treating HCP on file) rather than creating a duplicate row.
async function updateHcp(hcpId, hcp) {
  await query(
    `UPDATE health_professionals SET name = $1, age = $2, date_of_birth = $3, department = $4, designation = $5
     WHERE id = $6`,
    [hcp.name, hcp.age || null, hcp.dateOfBirth || null, hcp.department || null, hcp.designation || null, hcpId]
  );
}

// Create a patient (the socio-demographic + clinical form)
router.post("/", async (req, res) => {
  try {
    const b = req.body;
    const patientCode = await nextPatientCode();
    const treatingHcpId = await upsertHcp(b.treatingHcp);
    const firstTool = randomFirstTool();

    const result = await query(
      `INSERT INTO patients (
        patient_code, name, age, date_of_birth, phone_number, place_of_residence, smartphone_familiarity,
        marital_status, family_type, education_level, occupation_status, occupation_detail,
        religion, religion_other, health_insurance, insurance_type, insurance_type_other,
        family_history_cancer, family_history_relationship, stage_of_cancer, date_of_diagnosis,
        time_since_diagnosis_months, treatment_intent, surgery, surgery_type, surgery_type_other,
        reconstruction_done, reconstruction_type, chemotherapy, chemotherapy_cycles,
        adjuvant_therapy, neoadjuvant_therapy, radiation_therapy, radiation_sessions,
        hormone_therapy, hormone_therapy_duration_months, other_treatments,
        treating_hcp_id, first_tool, created_by
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
        $21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40
      ) RETURNING id, patient_code, first_tool`,
      [
        patientCode,
        b.name,
        b.age || null,
        b.dateOfBirth || null,
        b.phoneNumber || null,
        b.placeOfResidence || null,
        b.smartphoneFamiliarity ?? null,
        b.maritalStatus || null,
        b.familyType || null,
        b.educationLevel || null,
        b.occupationStatus || null,
        b.occupationDetail || null,
        b.religion || null,
        b.religionOther || null,
        b.healthInsurance ?? null,
        b.insuranceType || null,
        b.insuranceTypeOther || null,
        b.familyHistoryCancer ?? null,
        b.familyHistoryRelationship || null,
        b.stageOfCancer || null,
        b.dateOfDiagnosis || null,
        b.timeSinceDiagnosisMonths || null,
        b.treatmentIntent || null,
        b.surgery ?? null,
        b.surgeryType || null,
        b.surgeryTypeOther || null,
        b.reconstructionDone ?? null,
        b.reconstructionType || null,
        b.chemotherapy ?? null,
        b.chemotherapyCycles || null,
        b.adjuvantTherapy ?? null,
        b.neoadjuvantTherapy ?? null,
        b.radiationTherapy ?? null,
        b.radiationSessions || null,
        b.hormoneTherapy ?? null,
        b.hormoneTherapyDurationMonths || null,
        b.otherTreatments || null,
        treatingHcpId,
        firstTool,
        req.session.userId,
      ]
    );

    res.json({ id: result.rows[0].id, patientCode: result.rows[0].patient_code, firstTool: result.rows[0].first_tool });
  } catch (err) {
    console.error("[patients] create failed:", err);
    res.status(500).json({ error: "Could not save patient." });
  }
});

// List patients (most recent first) — for the dashboard's patient picker
router.get("/", async (req, res) => {
  try {
    const result = await query(
      `SELECT p.id, p.patient_code, p.name, p.created_at, p.first_tool,
              (SELECT COUNT(*) FROM qq10_responses q WHERE q.patient_id = p.id AND q.tool = 'braveeve') AS qq10_braveeve_count,
              (SELECT COUNT(*) FROM qq10_responses q WHERE q.patient_id = p.id AND q.tool = 'nccn') AS qq10_nccn_count,
              (SELECT status FROM tool_completions t WHERE t.patient_code = p.patient_code AND t.tool = 'braveeve') AS braveeve_status,
              (SELECT status FROM tool_completions t WHERE t.patient_code = p.patient_code AND t.tool = 'nccn') AS nccn_status
       FROM patients p
       ORDER BY p.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error("[patients] list failed:", err);
    res.status(500).json({ error: "Could not load patients." });
  }
});

// CSV export — defined before "/:id" so "export.csv" isn't swallowed by
// the :id param route.
router.get("/export.csv", async (req, res) => {
  try {
    const result = await query(
      `SELECT p.*, h.name AS treating_hcp_name, h.department AS treating_hcp_department,
              h.designation AS treating_hcp_designation
       FROM patients p
       LEFT JOIN health_professionals h ON h.id = p.treating_hcp_id
       ORDER BY p.created_at DESC`
    );
    const columns = [
      "patient_code", "name", "age", "date_of_birth", "place_of_residence", "smartphone_familiarity",
      "marital_status", "family_type", "education_level", "occupation_status", "occupation_detail",
      "religion", "religion_other", "health_insurance", "insurance_type", "insurance_type_other",
      "family_history_cancer", "family_history_relationship", "stage_of_cancer", "date_of_diagnosis",
      "time_since_diagnosis_months", "treatment_intent", "surgery", "surgery_type", "surgery_type_other",
      "reconstruction_done", "reconstruction_type", "chemotherapy", "chemotherapy_cycles",
      "adjuvant_therapy", "neoadjuvant_therapy", "radiation_therapy", "radiation_sessions",
      "hormone_therapy", "hormone_therapy_duration_months", "other_treatments",
      "treating_hcp_name", "treating_hcp_department", "treating_hcp_designation", "first_tool", "created_at",
    ];
    sendCsv(res, "patients.csv", result.rows, columns);
  } catch (err) {
    console.error("[patients] export failed:", err);
    res.status(500).json({ error: "Could not export patients." });
  }
});

// One patient's full record, including their treating HCP's details
router.get("/:id", async (req, res) => {
  try {
    const result = await query(
      `SELECT p.*, h.name AS treating_hcp_name, h.age AS treating_hcp_age,
              h.department AS treating_hcp_department, h.designation AS treating_hcp_designation,
              (SELECT status FROM tool_completions t WHERE t.patient_code = p.patient_code AND t.tool = 'braveeve') AS braveeve_status,
              (SELECT status FROM tool_completions t WHERE t.patient_code = p.patient_code AND t.tool = 'nccn') AS nccn_status
       FROM patients p
       LEFT JOIN health_professionals h ON h.id = p.treating_hcp_id
       WHERE p.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Patient not found." });
    res.json(result.rows[0]);
  } catch (err) {
    console.error("[patients] get failed:", err);
    res.status(500).json({ error: "Could not load patient." });
  }
});

// Update an existing patient's record
router.put("/:id", async (req, res) => {
  try {
    const b = req.body;
    const existing = await query("SELECT treating_hcp_id FROM patients WHERE id = $1", [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: "Patient not found." });

    let treatingHcpId = existing.rows[0].treating_hcp_id;
    if (b.treatingHcp && b.treatingHcp.name) {
      if (treatingHcpId) {
        await updateHcp(treatingHcpId, b.treatingHcp);
      } else {
        treatingHcpId = await upsertHcp(b.treatingHcp);
      }
    }

    await query(
      `UPDATE patients SET
        name=$1, age=$2, date_of_birth=$3, phone_number=$4, place_of_residence=$5, smartphone_familiarity=$6,
        marital_status=$7, family_type=$8, education_level=$9, occupation_status=$10, occupation_detail=$11,
        religion=$12, religion_other=$13, health_insurance=$14, insurance_type=$15, insurance_type_other=$16,
        family_history_cancer=$17, family_history_relationship=$18, stage_of_cancer=$19, date_of_diagnosis=$20,
        time_since_diagnosis_months=$21, treatment_intent=$22, surgery=$23, surgery_type=$24, surgery_type_other=$25,
        reconstruction_done=$26, reconstruction_type=$27, chemotherapy=$28, chemotherapy_cycles=$29,
        adjuvant_therapy=$30, neoadjuvant_therapy=$31, radiation_therapy=$32, radiation_sessions=$33,
        hormone_therapy=$34, hormone_therapy_duration_months=$35, other_treatments=$36,
        treating_hcp_id=$37, updated_at=now()
       WHERE id=$38`,
      [
        b.name, b.age || null, b.dateOfBirth || null, b.phoneNumber || null, b.placeOfResidence || null, b.smartphoneFamiliarity ?? null,
        b.maritalStatus || null, b.familyType || null, b.educationLevel || null, b.occupationStatus || null, b.occupationDetail || null,
        b.religion || null, b.religionOther || null, b.healthInsurance ?? null, b.insuranceType || null, b.insuranceTypeOther || null,
        b.familyHistoryCancer ?? null, b.familyHistoryRelationship || null, b.stageOfCancer || null, b.dateOfDiagnosis || null,
        b.timeSinceDiagnosisMonths || null, b.treatmentIntent || null, b.surgery ?? null, b.surgeryType || null, b.surgeryTypeOther || null,
        b.reconstructionDone ?? null, b.reconstructionType || null, b.chemotherapy ?? null, b.chemotherapyCycles || null,
        b.adjuvantTherapy ?? null, b.neoadjuvantTherapy ?? null, b.radiationTherapy ?? null, b.radiationSessions || null,
        b.hormoneTherapy ?? null, b.hormoneTherapyDurationMonths || null, b.otherTreatments || null,
        treatingHcpId, req.params.id,
      ]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error("[patients] update failed:", err);
    res.status(500).json({ error: "Could not update patient." });
  }
});

// QR codes for both tools, generated locally (never sent to any third-party
// service, given these links carry a patient identifier)
router.get("/:id/qrcodes", async (req, res) => {
  try {
    const result = await query("SELECT patient_code FROM patients WHERE id = $1", [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: "Patient not found." });

    const pid = result.rows[0].patient_code;
    const braveeveUrl = `${process.env.BRAVEEVE_BASE_URL}?pid=${encodeURIComponent(pid)}`;
    const nccnUrl = `${process.env.NCCN_BASE_URL}?pid=${encodeURIComponent(pid)}`;

    const [braveeveQr, nccnQr] = await Promise.all([
      QRCode.toDataURL(braveeveUrl, { margin: 1, width: 300 }),
      QRCode.toDataURL(nccnUrl, { margin: 1, width: 300 }),
    ]);

    res.json({ patientCode: pid, braveeveUrl, nccnUrl, braveeveQr, nccnQr });
  } catch (err) {
    console.error("[patients] qrcodes failed:", err);
    res.status(500).json({ error: "Could not generate QR codes." });
  }
});

// Records who first sent a patient the link for a given tool, so the
// completion email for that tool can go to just this person instead of the
// whole team. First sender wins -- a later click (e.g. a re-send, or
// another team member also sharing it) doesn't reassign ownership.
router.post("/:id/mark-sent", async (req, res) => {
  try {
    const tool = req.body.tool;
    if (tool !== "braveeve" && tool !== "nccn") {
      return res.status(400).json({ error: "tool must be 'braveeve' or 'nccn'." });
    }
    const column = tool === "braveeve" ? "braveeve_sent_by" : "nccn_sent_by";
    await query(
      `UPDATE patients SET ${column} = $1 WHERE id = $2 AND ${column} IS NULL`,
      [req.session.userId, req.params.id]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error("[patients] mark-sent failed:", err);
    res.status(500).json({ error: "Could not record sender." });
  }
});

export default router;

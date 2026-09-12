import express from "express";
import QRCode from "qrcode";
import { query } from "../db.js";
import { requireLogin } from "../auth.js";

const router = express.Router();
router.use(requireLogin);

async function nextPatientCode() {
  const result = await query("SELECT COUNT(*)::int AS count FROM patients");
  const n = result.rows[0].count + 1;
  return `BE-P${String(n).padStart(3, "0")}`;
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

// Create a patient (the socio-demographic + clinical form)
router.post("/", async (req, res) => {
  try {
    const b = req.body;
    const patientCode = await nextPatientCode();
    const treatingHcpId = await upsertHcp(b.treatingHcp);

    const result = await query(
      `INSERT INTO patients (
        patient_code, name, age, date_of_birth, place_of_residence, smartphone_familiarity,
        marital_status, family_type, education_level, occupation_status, occupation_detail,
        religion, religion_other, health_insurance, insurance_type, insurance_type_other,
        family_history_cancer, family_history_relationship, stage_of_cancer, date_of_diagnosis,
        time_since_diagnosis_months, treatment_intent, surgery, surgery_type, surgery_type_other,
        reconstruction_done, reconstruction_type, chemotherapy, chemotherapy_cycles,
        adjuvant_therapy, neoadjuvant_therapy, radiation_therapy, radiation_sessions,
        hormone_therapy, hormone_therapy_duration_months, other_treatments,
        treating_hcp_id, created_by
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
        $21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38
      ) RETURNING id, patient_code`,
      [
        patientCode,
        b.name,
        b.age || null,
        b.dateOfBirth || null,
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
        req.session.userId,
      ]
    );

    res.json({ id: result.rows[0].id, patientCode: result.rows[0].patient_code });
  } catch (err) {
    console.error("[patients] create failed:", err);
    res.status(500).json({ error: "Could not save patient." });
  }
});

// List patients (most recent first) — for the dashboard's patient picker
router.get("/", async (req, res) => {
  try {
    const result = await query(
      `SELECT p.id, p.patient_code, p.name, p.created_at,
              (SELECT COUNT(*) FROM qq10_responses q WHERE q.patient_id = p.id AND q.tool = 'braveeve') AS qq10_braveeve_count,
              (SELECT COUNT(*) FROM qq10_responses q WHERE q.patient_id = p.id AND q.tool = 'nccn') AS qq10_nccn_count
       FROM patients p
       ORDER BY p.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error("[patients] list failed:", err);
    res.status(500).json({ error: "Could not load patients." });
  }
});

// One patient's full record
router.get("/:id", async (req, res) => {
  try {
    const result = await query("SELECT * FROM patients WHERE id = $1", [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: "Patient not found." });
    res.json(result.rows[0]);
  } catch (err) {
    console.error("[patients] get failed:", err);
    res.status(500).json({ error: "Could not load patient." });
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

export default router;

const root = document.getElementById("app");
let currentUser = null;
let lastError = null;

function esc(str) {
  const d = document.createElement("div");
  d.textContent = str ?? "";
  return d.innerHTML;
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}

function errorBanner() {
  if (!lastError) return "";
  return `<div class="error-banner">${esc(lastError)}</div>`;
}

function topbar() {
  return `
    <div class="topbar">
      <h1 style="margin:0">BraveEve Study Dashboard</h1>
      <div class="who">
        ${currentUser ? `${esc(currentUser.displayName)} &nbsp; <button class="btn secondary small" id="logout-btn">Log out</button>` : ""}
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------

function screenLogin() {
  root.innerHTML = `
    <div class="login-shell">
      <h1 style="text-align:center">BraveEve Study Dashboard</h1>
      <div class="card">
        ${errorBanner()}
        <div class="field">
          <label>Username</label>
          <input type="text" id="login-username" autofocus />
        </div>
        <div class="field">
          <label>Password</label>
          <input type="password" id="login-password" />
        </div>
        <button class="btn" id="login-btn" style="width:100%">Log in</button>
      </div>
    </div>
  `;
  const submit = async () => {
    const username = document.getElementById("login-username").value.trim();
    const password = document.getElementById("login-password").value;
    try {
      currentUser = await api("/api/auth/login", { method: "POST", body: JSON.stringify({ username, password }) });
      lastError = null;
      await navigateHome();
    } catch (err) {
      lastError = err.message;
      screenLogin();
    }
  };
  document.getElementById("login-btn").onclick = submit;
  document.getElementById("login-password").addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
}

// ---------------------------------------------------------------------
// Home: patient list
// ---------------------------------------------------------------------

async function navigateHome() {
  lastError = null;
  let patients = [];
  try {
    patients = await api("/api/patients");
  } catch (err) {
    lastError = err.message;
  }
  screenHome(patients);
}

function toolStatusLabel(status) {
  if (status === "completed") return "✓ completed";
  if (status === "stopped_early") return "⚠ stopped early";
  return "—";
}

function screenHome(patients) {
  root.innerHTML = `
    ${topbar()}
    ${errorBanner()}
    <div class="card">
      <div class="btn-row">
        <button class="btn" id="new-patient-btn">+ New Patient</button>
        <button class="btn secondary" id="interviews-btn">HCP Interviews</button>
      </div>
    </div>
    <div class="card">
      <h2>Export data</h2>
      <div class="btn-row">
        <a class="btn secondary" href="/api/patients/export.csv">Patients CSV</a>
        <a class="btn secondary" href="/api/qq10/export.csv">QQ-10 Responses CSV</a>
        <a class="btn secondary" href="/api/interviews/export.csv">HCP Interviews CSV</a>
      </div>
    </div>
    <div class="card">
      <h2>Patients (${patients.length})</h2>
      <input type="text" id="patient-search" placeholder="Search by name or code..." style="margin-bottom:12px"/>
      <table>
        <thead>
          <tr><th>Code</th><th>Name</th><th>First tool</th><th>BraveEve</th><th>NCCN</th><th>QQ-10 BraveEve</th><th>QQ-10 NCCN</th><th>Added</th></tr>
        </thead>
        <tbody id="patient-rows">
          ${patients.map((p) => `
            <tr class="clickable" data-id="${p.id}" data-search="${esc((p.patient_code + " " + p.name).toLowerCase())}">
              <td><span class="badge">${esc(p.patient_code)}</span></td>
              <td>${esc(p.name)}</td>
              <td>${p.first_tool === "braveeve" ? "BraveEve" : p.first_tool === "nccn" ? "NCCN" : "—"}</td>
              <td>${toolStatusLabel(p.braveeve_status)}</td>
              <td>${toolStatusLabel(p.nccn_status)}</td>
              <td>${Number(p.qq10_braveeve_count) > 0 ? "✓ done" : "—"}</td>
              <td>${Number(p.qq10_nccn_count) > 0 ? "✓ done" : "—"}</td>
              <td>${new Date(p.created_at).toLocaleDateString()}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
  document.getElementById("new-patient-btn").onclick = () => screenPatientForm(null);
  document.getElementById("interviews-btn").onclick = () => navigateInterviews();
  root.querySelectorAll("tr[data-id]").forEach((row) => {
    row.onclick = () => navigatePatientDetail(row.dataset.id);
  });
  document.getElementById("patient-search").addEventListener("input", (e) => {
    const q = e.target.value.trim().toLowerCase();
    root.querySelectorAll("#patient-rows tr[data-id]").forEach((row) => {
      row.style.display = row.dataset.search.includes(q) ? "" : "none";
    });
  });
  const logoutBtn = document.getElementById("logout-btn");
  if (logoutBtn) logoutBtn.onclick = async () => { await api("/api/auth/logout", { method: "POST" }); currentUser = null; screenLogin(); };
}

// ---------------------------------------------------------------------
// New patient — the socio-demographic + clinical form
// ---------------------------------------------------------------------

function radioGroup(name, options) {
  return `
    <div class="radio-inline">
      ${options.map(([value, label]) => `
        <label><input type="radio" name="${name}" value="${value}"/> ${esc(label)}</label>
      `).join("")}
    </div>
  `;
}

function screenPatientForm(existing) {
  const isEdit = !!existing;
  const p = existing || {};

  root.innerHTML = `
    ${topbar()}
    ${errorBanner()}
    <div class="card">
      <h2>${isEdit ? "Edit Patient" : "New Patient"} — Socio-Demographic &amp; Clinical Details</h2>

      <div class="section-heading">Patient Information</div>
      <div class="field-row">
        <div class="field"><label>Name</label><input type="text" id="f-name"/></div>
        <div class="field"><label>Date of birth</label><input type="date" id="f-dob"/></div>
        <div class="field"><label>Age (years)</label><input type="number" id="f-age" placeholder="Auto-filled from DOB"/></div>
        <div class="field"><label>Phone number</label><input type="tel" id="f-phone" placeholder="e.g. 9876543210"/></div>
      </div>
      <div class="field"><label>How are the tools being administered?</label>
        ${radioGroup("admin_mode", [["in_person", "In person"], ["phone_call", "By phone call"]])}
      </div>
      <div class="field"><label>Place of residence</label>
        ${radioGroup("place", [["Urban", "Urban"], ["Semi-urban", "Semi-urban"], ["Rural", "Rural"]])}
      </div>
      <div class="field"><label>Smartphone familiarity</label>
        ${radioGroup("smartphone", [["yes", "Yes"], ["no", "No"]])}
      </div>

      <div class="section-heading">Marital and Family Details</div>
      <div class="field-row">
        <div class="field"><label>Marital status</label>
          <select id="f-marital"><option></option>
            ${["Single", "Married", "Widowed", "Separated", "Divorced"].map((o) => `<option>${o}</option>`).join("")}
          </select>
        </div>
        <div class="field"><label>Family type</label>
          <select id="f-family"><option></option>
            ${["Nuclear", "Joint", "Extended"].map((o) => `<option>${o}</option>`).join("")}
          </select>
        </div>
        <div class="field"><label>Education level</label>
          <select id="f-education"><option></option>
            ${["No formal education", "Primary", "Secondary", "Graduate", "Postgraduate", "Doctorate"].map((o) => `<option>${o}</option>`).join("")}
          </select>
        </div>
      </div>
      <div class="field"><label>Occupation</label>
        ${radioGroup("occupation", [["Unemployed", "Unemployed"], ["Employed", "Employed"]])}
        <input type="text" id="f-occupation-detail" placeholder="If employed, specify" style="margin-top:8px"/>
      </div>
      <div class="field"><label>Religion</label>
        ${radioGroup("religion", [["Hindu", "Hindu"], ["Muslim", "Muslim"], ["Christian", "Christian"], ["Sikh", "Sikh"], ["Jain", "Jain"], ["Other", "Other"]])}
        <input type="text" id="f-religion-other" placeholder="If Other, specify" style="margin-top:8px"/>
      </div>
      <div class="field"><label>Health insurance coverage</label>
        ${radioGroup("insurance", [["yes", "Yes"], ["no", "No"]])}
        <div class="radio-inline" style="margin-top:8px">
          ${radioGroup("insurance_type", [["Government", "Government"], ["Private", "Private"], ["Other", "Other"]])}
        </div>
        <input type="text" id="f-insurance-other" placeholder="If Other, specify" style="margin-top:8px"/>
      </div>

      <div class="section-heading">Medical Details</div>
      <div class="field"><label>Family history of cancer</label>
        ${radioGroup("family_history", [["yes", "Yes"], ["no", "No"]])}
        <input type="text" id="f-family-history-relationship" placeholder="If Yes, specify relationship" style="margin-top:8px"/>
      </div>
      <div class="field-row">
        <div class="field"><label>Stage of cancer</label><input type="text" id="f-stage"/></div>
        <div class="field"><label>Date of diagnosis</label><input type="date" id="f-diagnosis-date"/></div>
        <div class="field"><label>Time since diagnosis (months)</label><input type="number" id="f-diagnosis-months"/></div>
      </div>

      <div class="section-heading">Treatment Details</div>
      <div class="field"><label>Intent of treatment</label>
        ${radioGroup("intent", [["Curative", "Curative"], ["Palliative", "Palliative"]])}
      </div>
      <div class="field"><label>Surgery</label>
        ${radioGroup("surgery", [["yes", "Yes"], ["no", "No"]])}
        <div class="radio-inline" style="margin-top:8px">
          ${radioGroup("surgery_type", [["Mastectomy", "Mastectomy"], ["Lumpectomy", "Lumpectomy"], ["Other", "Other"]])}
        </div>
        <input type="text" id="f-surgery-other" placeholder="If Other, specify" style="margin-top:8px"/>
      </div>
      <div class="field"><label>Reconstruction done</label>
        ${radioGroup("reconstruction", [["yes", "Yes"], ["no", "No"]])}
        <input type="text" id="f-reconstruction-type" placeholder="If Yes, type" style="margin-top:8px"/>
      </div>
      <div class="field-row">
        <div class="field"><label>Chemotherapy</label>
          ${radioGroup("chemo", [["yes", "Yes"], ["no", "No"]])}
          <input type="number" id="f-chemo-cycles" placeholder="Cycles to date" style="margin-top:8px"/>
        </div>
        <div class="field"><label>Radiation therapy</label>
          ${radioGroup("radiation", [["yes", "Yes"], ["no", "No"]])}
          <input type="number" id="f-radiation-sessions" placeholder="Sessions to date" style="margin-top:8px"/>
        </div>
        <div class="field"><label>Hormone therapy</label>
          ${radioGroup("hormone", [["yes", "Yes"], ["no", "No"]])}
          <input type="number" id="f-hormone-months" placeholder="Duration (months)" style="margin-top:8px"/>
        </div>
      </div>
      <div class="field-row">
        <div class="field"><label>Adjuvant therapy</label>${radioGroup("adjuvant", [["yes", "Yes"], ["no", "No"]])}</div>
        <div class="field"><label>Neoadjuvant therapy</label>${radioGroup("neoadjuvant", [["yes", "Yes"], ["no", "No"]])}</div>
      </div>
      <div class="field"><label>Other treatments (e.g. targeted therapy)</label><input type="text" id="f-other-treatments"/></div>

      <div class="section-heading">Treating Health Care Professional</div>
      <div class="field-row">
        <div class="field"><label>Name</label><input type="text" id="f-hcp-name"/></div>
        <div class="field"><label>Age</label><input type="number" id="f-hcp-age"/></div>
        <div class="field"><label>Department</label><input type="text" id="f-hcp-department"/></div>
        <div class="field"><label>Designation</label><input type="text" id="f-hcp-designation"/></div>
      </div>

      <div class="btn-row">
        <button class="btn secondary" id="cancel-btn">Cancel</button>
        <button class="btn" id="save-btn">${isEdit ? "Save Changes" : "Save Patient"}</button>
      </div>
    </div>
  `;

  // --- pre-fill, when editing ---
  const setText = (id, value) => { if (value !== null && value !== undefined) document.getElementById(id).value = value; };
  const setDate = (id, value) => { if (value) document.getElementById(id).value = String(value).slice(0, 10); };
  const setRadio = (name, value) => { if (value) { const el = root.querySelector(`input[name="${name}"][value="${value}"]`); if (el) el.checked = true; } };
  const setYesNo = (name, boolValue) => { if (boolValue !== null && boolValue !== undefined) setRadio(name, boolValue ? "yes" : "no"); };

  if (isEdit) {
    setText("f-name", p.name);
    setText("f-age", p.age);
    setDate("f-dob", p.date_of_birth);
    setText("f-phone", p.phone_number);
    setRadio("admin_mode", p.administration_mode);
    setRadio("place", p.place_of_residence);
    setYesNo("smartphone", p.smartphone_familiarity);
    document.getElementById("f-marital").value = p.marital_status || "";
    document.getElementById("f-family").value = p.family_type || "";
    document.getElementById("f-education").value = p.education_level || "";
    setRadio("occupation", p.occupation_status);
    setText("f-occupation-detail", p.occupation_detail);
    setRadio("religion", p.religion);
    setText("f-religion-other", p.religion_other);
    setYesNo("insurance", p.health_insurance);
    setRadio("insurance_type", p.insurance_type);
    setText("f-insurance-other", p.insurance_type_other);
    setYesNo("family_history", p.family_history_cancer);
    setText("f-family-history-relationship", p.family_history_relationship);
    setText("f-stage", p.stage_of_cancer);
    setDate("f-diagnosis-date", p.date_of_diagnosis);
    setText("f-diagnosis-months", p.time_since_diagnosis_months);
    setRadio("intent", p.treatment_intent);
    setYesNo("surgery", p.surgery);
    setRadio("surgery_type", p.surgery_type);
    setText("f-surgery-other", p.surgery_type_other);
    setYesNo("reconstruction", p.reconstruction_done);
    setText("f-reconstruction-type", p.reconstruction_type);
    setYesNo("chemo", p.chemotherapy);
    setText("f-chemo-cycles", p.chemotherapy_cycles);
    setYesNo("adjuvant", p.adjuvant_therapy);
    setYesNo("neoadjuvant", p.neoadjuvant_therapy);
    setYesNo("radiation", p.radiation_therapy);
    setText("f-radiation-sessions", p.radiation_sessions);
    setYesNo("hormone", p.hormone_therapy);
    setText("f-hormone-months", p.hormone_therapy_duration_months);
    setText("f-other-treatments", p.other_treatments);
    setText("f-hcp-name", p.treating_hcp_name);
    setText("f-hcp-age", p.treating_hcp_age);
    setText("f-hcp-department", p.treating_hcp_department);
    setText("f-hcp-designation", p.treating_hcp_designation);
  }

  // --- auto-calculate age from date of birth ---
  const calcAge = (dobStr) => {
    if (!dobStr) return null;
    const dob = new Date(dobStr);
    if (isNaN(dob.getTime())) return null;
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const monthDiff = today.getMonth() - dob.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) age--;
    return age >= 0 && age < 130 ? age : null;
  };
  document.getElementById("f-dob").addEventListener("change", (e) => {
    const age = calcAge(e.target.value);
    if (age !== null) document.getElementById("f-age").value = age;
  });
  // if editing an existing patient with a DOB but no stored age, fill it in now
  if (isEdit && p.date_of_birth && (p.age === null || p.age === undefined || p.age === "")) {
    const age = calcAge(String(p.date_of_birth).slice(0, 10));
    if (age !== null) document.getElementById("f-age").value = age;
  }

  const radioVal = (name) => root.querySelector(`input[name="${name}"]:checked`)?.value;
  const yesNo = (name) => {
    const v = radioVal(name);
    return v === undefined ? null : v === "yes";
  };
  const val = (id) => document.getElementById(id).value.trim() || null;

  document.getElementById("cancel-btn").onclick = () => (isEdit ? navigatePatientDetail(existing.id) : navigateHome());
  document.getElementById("save-btn").onclick = async () => {
    const body = {
      name: val("f-name"),
      age: val("f-age"),
      dateOfBirth: val("f-dob"),
      phoneNumber: val("f-phone"),
      administrationMode: radioVal("admin_mode") || null,
      placeOfResidence: radioVal("place"),
      smartphoneFamiliarity: yesNo("smartphone"),
      maritalStatus: document.getElementById("f-marital").value || null,
      familyType: document.getElementById("f-family").value || null,
      educationLevel: document.getElementById("f-education").value || null,
      occupationStatus: radioVal("occupation"),
      occupationDetail: val("f-occupation-detail"),
      religion: radioVal("religion"),
      religionOther: val("f-religion-other"),
      healthInsurance: yesNo("insurance"),
      insuranceType: radioVal("insurance_type"),
      insuranceTypeOther: val("f-insurance-other"),
      familyHistoryCancer: yesNo("family_history"),
      familyHistoryRelationship: val("f-family-history-relationship"),
      stageOfCancer: val("f-stage"),
      dateOfDiagnosis: val("f-diagnosis-date"),
      timeSinceDiagnosisMonths: val("f-diagnosis-months"),
      treatmentIntent: radioVal("intent"),
      surgery: yesNo("surgery"),
      surgeryType: radioVal("surgery_type"),
      surgeryTypeOther: val("f-surgery-other"),
      reconstructionDone: yesNo("reconstruction"),
      reconstructionType: val("f-reconstruction-type"),
      chemotherapy: yesNo("chemo"),
      chemotherapyCycles: val("f-chemo-cycles"),
      adjuvantTherapy: yesNo("adjuvant"),
      neoadjuvantTherapy: yesNo("neoadjuvant"),
      radiationTherapy: yesNo("radiation"),
      radiationSessions: val("f-radiation-sessions"),
      hormoneTherapy: yesNo("hormone"),
      hormoneTherapyDurationMonths: val("f-hormone-months"),
      otherTreatments: val("f-other-treatments"),
      treatingHcp: val("f-hcp-name") ? {
        name: val("f-hcp-name"),
        age: val("f-hcp-age"),
        department: val("f-hcp-department"),
        designation: val("f-hcp-designation"),
      } : null,
    };

    if (!body.name) {
      lastError = "Patient name is required.";
      screenPatientForm(existing);
      return;
    }

    try {
      if (isEdit) {
        await api(`/api/patients/${existing.id}`, { method: "PUT", body: JSON.stringify(body) });
        lastError = null;
        await navigatePatientDetail(existing.id);
      } else {
        const result = await api("/api/patients", { method: "POST", body: JSON.stringify(body) });
        lastError = null;
        await navigatePatientDetail(result.id);
      }
    } catch (err) {
      lastError = err.message;
      screenPatientForm(existing);
    }
  };
}

// ---------------------------------------------------------------------
// Patient detail: QR codes + QQ-10 entry points
// ---------------------------------------------------------------------

async function navigatePatientDetail(id) {
  lastError = null;
  try {
    const [patient, qr] = await Promise.all([
      api(`/api/patients/${id}`),
      api(`/api/patients/${id}/qrcodes`),
    ]);
    screenPatientDetail(patient, qr);
  } catch (err) {
    lastError = err.message;
    await navigateHome();
  }
}

function screenPatientDetail(patient, qr) {
  root.innerHTML = `
    ${topbar()}
    ${errorBanner()}
    <div class="card">
      <button class="btn secondary small" id="back-btn">← All patients</button>
      <h2 style="margin-top:14px">${esc(patient.name)} <span class="badge">${esc(patient.patient_code)}</span></h2>
      <p style="color:var(--muted)">Administered: ${patient.administration_mode === "in_person" ? "In person" : patient.administration_mode === "phone_call" ? "By phone call" : "not recorded yet — set it under Edit Patient Details"}</p>
      <div class="btn-row">
        <button class="btn secondary small" id="edit-patient-btn">Edit Patient Details</button>
      </div>
    </div>

    <div class="card">
      <h2>QR codes</h2>
      <p style="color:var(--muted)">Show these to the patient at their OPD visit — they can scan whichever they're ready to use once they're home.</p>
      ${patient.first_tool ? `<p><span class="badge">Randomized order: complete ${patient.first_tool === "braveeve" ? "BraveEve" : "NCCN Distress Thermometer"} first</span></p>` : ""}
      ${patient.phone_number ? `<p style="color:var(--muted)">📞 On file: ${esc(patient.phone_number)}</p>` : `<p style="color:var(--muted)">No phone number on file — WhatsApp will ask you to pick a contact instead of sending directly.</p>`}
      <div class="qr-row">
        <div class="qr-card">
          <div class="label">BraveEve ${patient.first_tool === "braveeve" ? "— go first" : patient.first_tool === "nccn" ? "— go second" : ""}</div>
          <img src="${qr.braveeveQr}" alt="BraveEve QR code"/>
          <div class="url">${esc(qr.braveeveUrl)}</div>
          <div style="margin:4px 0">${toolStatusLabel(patient.braveeve_status)}</div>
          <button class="btn-whatsapp" id="wa-braveeve-btn">📱 ${patient.phone_number ? "Send" : "Share"} via WhatsApp</button>
        </div>
        <div class="qr-card">
          <div class="label">NCCN Distress Thermometer ${patient.first_tool === "nccn" ? "— go first" : patient.first_tool === "braveeve" ? "— go second" : ""}</div>
          <img src="${qr.nccnQr}" alt="NCCN QR code"/>
          <div class="url">${esc(qr.nccnUrl)}</div>
          <div style="margin:4px 0">${toolStatusLabel(patient.nccn_status)}</div>
          <button class="btn-whatsapp" id="wa-nccn-btn">📱 ${patient.phone_number ? "Send" : "Share"} via WhatsApp</button>
        </div>
      </div>
      <p style="color:var(--muted);font-size:13px">Whoever sends a link below gets emailed automatically when that patient finishes it, so you know it's time for the QQ-10 interview.</p>
    </div>

    <div class="card">
      <h2>QQ-10 (patient feedback on the tool just used)</h2>
      <div class="btn-row">
        <button class="btn" id="qq10-braveeve-btn">QQ-10 — BraveEve</button>
        <button class="btn" id="qq10-nccn-btn">QQ-10 — NCCN Distress Thermometer</button>
      </div>
    </div>
  `;
  document.getElementById("back-btn").onclick = () => navigateHome();
  document.getElementById("edit-patient-btn").onclick = () => screenPatientForm(patient);
  document.getElementById("qq10-braveeve-btn").onclick = () => navigateQQ10(patient, "braveeve");
  document.getElementById("qq10-nccn-btn").onclick = () => navigateQQ10(patient, "nccn");

  // Indian mobile numbers are typically entered as 10 digits with no
  // country code -- WhatsApp's link format needs the full international
  // number with no spaces/dashes/+ sign, so we add "91" when it looks
  // like a bare 10-digit number, and leave anything else as-is.
  const cleanPhoneForWhatsApp = (raw) => {
    if (!raw) return null;
    const digits = raw.replace(/\D/g, "");
    if (digits.length === 10) return `91${digits}`;
    return digits || null;
  };
  const patientPhone = cleanPhoneForWhatsApp(patient.phone_number);

  const shareViaWhatsApp = (toolName, url, tool) => {
    const message = `Hi! Whenever you have a few minutes, please use this link to complete the ${toolName}: ${url}`;
    const target = patientPhone ? `https://wa.me/${patientPhone}` : "https://wa.me/";
    // Open first, synchronously in response to the click, so browsers don't
    // treat it as a blocked popup -- the tracking call below doesn't need
    // to finish (or even succeed) before that happens.
    window.open(`${target}?text=${encodeURIComponent(message)}`, "_blank");
    // Records who sent this link, so the "patient finished" email later
    // goes to this person specifically rather than the whole team (see
    // /:id/mark-sent). Fire-and-forget -- a failure here shouldn't block
    // or alarm whoever's sending the link.
    api(`/api/patients/${patient.id}/mark-sent`, { method: "POST", body: JSON.stringify({ tool }) }).catch(() => {});
  };
  document.getElementById("wa-braveeve-btn").onclick = () => shareViaWhatsApp("BraveEve check-in", qr.braveeveUrl, "braveeve");
  document.getElementById("wa-nccn-btn").onclick = () => shareViaWhatsApp("NCCN Distress Thermometer", qr.nccnUrl, "nccn");
  const logoutBtn = document.getElementById("logout-btn");
  if (logoutBtn) logoutBtn.onclick = async () => { await api("/api/auth/logout", { method: "POST" }); currentUser = null; screenLogin(); };
}

// ---------------------------------------------------------------------
// QQ-10 form
// ---------------------------------------------------------------------

// QQ-10 wording. English is the standard instrument text. The Kannada text
// below is a DRAFT translation -- it must be reviewed by a native Kannada
// speaker before being used with patients. To swap in the official
// translation, just replace the strings in QQ10_TEXT.kn; nothing else in
// the app needs to change.
const QQ10_FIELDS = [
  "q1HelpedCommunicate", "q2Relevant", "q3EasyToComplete", "q4IncludedAllAspects", "q5Enjoyed",
  "q6WouldRepeat", "q7TooLong", "q8TooEmbarrassing", "q9TooComplicated", "q10UpsetMe",
];
const QQ10_VALUES = ["strongly_agree", "mostly_agree", "neither", "mostly_disagree", "strongly_disagree"];

const QQ10_TEXT = {
  en: {
    instructions: "Please circle the answer below each statement that best fits the patient's feelings about the questionnaire they recently completed.",
    questions: [
      "The questionnaire helped me to communicate about my condition",
      "The questionnaire was relevant to my condition",
      "The questionnaire was easy to complete",
      "The questionnaire included all the aspects of my condition that I am concerned about",
      "I enjoyed filling in the questionnaire",
      "I would be happy to complete the questionnaire again in the future as part of my routine care",
      "The questionnaire was too long",
      "The questionnaire was too embarrassing",
      "The questionnaire was too complicated",
      "The questionnaire upset me",
    ],
    options: ["Strongly agree", "Mostly agree", "Neither agree or disagree", "Mostly disagree", "Strongly disagree"],
    commentsHeading: "Additional Comments",
    commentImprove: "Comments or suggestions on how the questionnaire could be improved (structure, appearance, or design)?",
    commentMissed: "Were any important symptoms, problems, or concerns missed out by the questionnaire?",
    commentOverrepresented: "Do you feel any areas or problems in the questionnaire were over-represented?",
  },
  kn: {
    instructions: "ನೀವು ಇತ್ತೀಚೆಗೆ ಪೂರ್ಣಗೊಳಿಸಿದ ಪ್ರಶ್ನಾವಳಿಯ ಬಗ್ಗೆ ನಿಮ್ಮ ಭಾವನೆಗಳಿಗೆ ಹೆಚ್ಚು ಹೊಂದುವ ಉತ್ತರವನ್ನು ಪ್ರತಿ ಹೇಳಿಕೆಯ ಕೆಳಗೆ ಗುರುತಿಸಿ.",
    questions: [
      "ಪ್ರಶ್ನಾವಳಿಯು ನನ್ನ ಆರೋಗ್ಯ ಸ್ಥಿತಿಯ ಬಗ್ಗೆ ಸಂವಹನ ನಡೆಸಲು ನನಗೆ ಸಹಾಯ ಮಾಡಿತು",
      "ಪ್ರಶ್ನಾವಳಿಯು ನನ್ನ ಆರೋಗ್ಯ ಸ್ಥಿತಿಗೆ ಸಂಬಂಧಿಸಿತ್ತು",
      "ಪ್ರಶ್ನಾವಳಿಯನ್ನು ಭರ್ತಿ ಮಾಡುವುದು ಸುಲಭವಾಗಿತ್ತು",
      "ನನಗೆ ಚಿಂತೆಯಾಗಿರುವ ನನ್ನ ಆರೋಗ್ಯ ಸ್ಥಿತಿಯ ಎಲ್ಲಾ ಅಂಶಗಳನ್ನೂ ಪ್ರಶ್ನಾವಳಿಯು ಒಳಗೊಂಡಿತ್ತು",
      "ಪ್ರಶ್ನಾವಳಿಯನ್ನು ಭರ್ತಿ ಮಾಡುವುದನ್ನು ನಾನು ಆನಂದಿಸಿದೆ",
      "ಭವಿಷ್ಯದಲ್ಲಿ ನನ್ನ ನಿಯಮಿತ ಆರೈಕೆಯ ಭಾಗವಾಗಿ ಈ ಪ್ರಶ್ನಾವಳಿಯನ್ನು ಮತ್ತೆ ಭರ್ತಿ ಮಾಡಲು ನನಗೆ ಸಂತೋಷವಾಗುತ್ತದೆ",
      "ಪ್ರಶ್ನಾವಳಿಯು ತುಂಬಾ ಉದ್ದವಾಗಿತ್ತು",
      "ಪ್ರಶ್ನಾವಳಿಯು ತುಂಬಾ ಮುಜುಗರ ಉಂಟುಮಾಡಿತು",
      "ಪ್ರಶ್ನಾವಳಿಯು ತುಂಬಾ ಸಂಕೀರ್ಣವಾಗಿತ್ತು",
      "ಪ್ರಶ್ನಾವಳಿಯು ನನ್ನನ್ನು ಅಸಮಾಧಾನಗೊಳಿಸಿತು",
    ],
    options: [
      "ಬಲವಾಗಿ ಒಪ್ಪುತ್ತೇನೆ",
      "ಬಹುಮಟ್ಟಿಗೆ ಒಪ್ಪುತ್ತೇನೆ",
      "ಒಪ್ಪುವುದೂ ಇಲ್ಲ, ಒಪ್ಪದಿರುವುದೂ ಇಲ್ಲ",
      "ಬಹುಮಟ್ಟಿಗೆ ಒಪ್ಪುವುದಿಲ್ಲ",
      "ಬಲವಾಗಿ ಒಪ್ಪುವುದಿಲ್ಲ",
    ],
    commentsHeading: "ಹೆಚ್ಚುವರಿ ಕಾಮೆಂಟ್‌ಗಳು",
    commentImprove: "ಪ್ರಶ್ನಾವಳಿಯನ್ನು ಹೇಗೆ ಸುಧಾರಿಸಬಹುದು (ರಚನೆ, ಸ್ವರೂಪ ಅಥವಾ ವಿನ್ಯಾಸ) ಎಂಬ ಬಗ್ಗೆ ಯಾವುದೇ ಕಾಮೆಂಟ್‌ಗಳು ಅಥವಾ ಸಲಹೆಗಳಿವೆಯೇ?",
    commentMissed: "ಪ್ರಶ್ನಾವಳಿಯಲ್ಲಿ ಯಾವುದೇ ಪ್ರಮುಖ ಲಕ್ಷಣಗಳು, ಸಮಸ್ಯೆಗಳು ಅಥವಾ ಕಾಳಜಿಗಳು ಬಿಟ್ಟುಹೋಗಿವೆಯೇ?",
    commentOverrepresented: "ಪ್ರಶ್ನಾವಳಿಯಲ್ಲಿ ಯಾವುದೇ ಕ್ಷೇತ್ರಗಳು ಅಥವಾ ಸಮಸ್ಯೆಗಳಿಗೆ ಅಗತ್ಯಕ್ಕಿಂತ ಹೆಚ್ಚು ಒತ್ತು ನೀಡಲಾಗಿದೆ ಎಂದು ನಿಮಗೆ ಅನಿಸುತ್ತದೆಯೇ?",
  },
};

function camelToSnake(str) {
  return str.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}

// Spoken-language text for voice-recorded QQ-10 comments, keyed by field
// (commentImprove / commentMissed / commentOverrepresented). Saved
// alongside the English text, same idea as the HCP interviews.
let qq10NativeNotes = {};
let activeQq10Recorder = null;
let qq10RecordingTimer = null;
const QQ10_MAX_RECORDING_MS = 28000; // Sarvam's sync endpoint caps at 30s

async function navigateQQ10(patient, tool) {
  lastError = null;
  let existing = null;
  try {
    existing = await api(`/api/qq10/${patient.id}/${tool}`);
  } catch (err) {
    lastError = err.message;
  }
  qq10NativeNotes = (existing && existing.native_notes) || {};
  screenQQ10(patient, tool, existing, null);
}

function qq10MicHtml(fieldId) {
  const voiceSupported = !!(navigator.mediaDevices && window.MediaRecorder);
  if (!voiceSupported) return "";
  return `
    <button class="mic-btn" id="mic-${fieldId}" type="button">🎙️ Record answer</button>
    <div class="mic-status" id="mic-status-${fieldId}"></div>
  `;
}

function wireQq10Mic(fieldId, textareaId) {
  const micBtn = document.getElementById(`mic-${fieldId}`);
  const micStatus = document.getElementById(`mic-status-${fieldId}`);
  if (!micBtn) return;

  micBtn.onclick = async () => {
    if (activeQq10Recorder && activeQq10Recorder.state === "recording") {
      activeQq10Recorder.stop();
      return;
    }
    await startQq10Recording(fieldId, textareaId, micBtn, micStatus);
  };
}

async function startQq10Recording(fieldId, textareaId, micBtn, micStatus) {
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    micStatus.textContent = "Couldn't access the microphone. You can still type.";
    return;
  }

  const chunks = [];
  const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
  const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
  activeQq10Recorder = recorder;

  recorder.addEventListener("dataavailable", (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  });

  recorder.addEventListener("stop", async () => {
    stream.getTracks().forEach((t) => t.stop());
    clearTimeout(qq10RecordingTimer);
    micBtn.textContent = "🎙️ Record answer";
    micBtn.classList.remove("recording");
    micBtn.disabled = true;
    micStatus.textContent = "Transcribing…";

    const blobType = recorder.mimeType || "audio/webm";
    const blob = new Blob(chunks, { type: blobType });

    try {
      const res = await fetch("/api/qq10/transcribe", {
        method: "POST",
        headers: { "Content-Type": blobType },
        body: blob,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Transcription failed");

      const textarea = document.getElementById(textareaId);
      if (textarea) {
        const existingText = textarea.value.trim();
        textarea.value = existingText ? `${existingText} ${data.englishText}`.trim() : (data.englishText || "");
      }
      qq10NativeNotes[fieldId] = qq10NativeNotes[fieldId]
        ? `${qq10NativeNotes[fieldId]} ${data.nativeText || ""}`.trim()
        : (data.nativeText || "");

      micStatus.textContent = data.englishText
        ? "Added below (translated to English) — feel free to edit it."
        : "Didn't catch that clearly. Please try again or type instead.";
    } catch (err) {
      micStatus.textContent = "Couldn't transcribe that. Please try again or type instead.";
    } finally {
      micBtn.disabled = false;
      activeQq10Recorder = null;
    }
  });

  recorder.start();
  micBtn.textContent = "⏹ Stop recording";
  micBtn.classList.add("recording");
  micStatus.textContent = "Listening… tap again to stop.";

  qq10RecordingTimer = setTimeout(() => {
    if (activeQq10Recorder && activeQq10Recorder.state === "recording") activeQq10Recorder.stop();
  }, QQ10_MAX_RECORDING_MS);
}

// draft: in-progress values carried across a language switch, so flipping
// English <-> Kannada doesn't wipe what's already been ticked/typed.
function screenQQ10(patient, tool, existing, draft) {
  const isEdit = !!existing;
  const toolLabel = tool === "braveeve" ? "BraveEve" : "NCCN Distress Thermometer";
  const lang = (draft && draft.language) || (existing && existing.language) || "en";
  const T = QQ10_TEXT[lang] || QQ10_TEXT.en;

  const answerFor = (field) => (draft ? draft.answers[field] : existing && existing[camelToSnake(field)]) || null;
  const commentFor = (field, col) => (draft ? draft.comments[field] : existing && existing[col]) || "";

  const commentBlock = (field, col, textareaId) => `
    <div class="field">
      <label>${esc(T[field])}</label>
      ${qq10MicHtml(field)}
      <textarea id="${textareaId}">${esc(commentFor(field, col))}</textarea>
    </div>
  `;

  root.innerHTML = `
    ${topbar()}
    ${errorBanner()}
    <div class="card">
      <button class="btn secondary small" id="back-btn">← ${esc(patient.name)}</button>
      <h2 style="margin-top:14px">QQ-10 — ${toolLabel}</h2>
      ${isEdit ? `<p style="color:var(--muted)">A response is already on file for this patient/tool — reviewing it below. Saving will update it.</p>` : ""}

      <div class="field">
        <label>Language of this QQ-10</label>
        <div class="radio-inline">
          <label><input type="radio" name="qq10_lang" value="en" ${lang === "en" ? "checked" : ""}/> English</label>
          <label><input type="radio" name="qq10_lang" value="kn" ${lang === "kn" ? "checked" : ""}/> ಕನ್ನಡ (Kannada)</label>
        </div>
      </div>

      <p style="color:var(--muted)">${esc(T.instructions)}</p>

      ${QQ10_FIELDS.map((field, i) => `
        <div class="likert-question">
          <p>${i + 1}. ${esc(T.questions[i])}</p>
          <div class="likert-options">
            ${QQ10_VALUES.map((value, j) => `
              <label><input type="radio" name="${field}" value="${value}" ${answerFor(field) === value ? "checked" : ""}/> ${esc(T.options[j])}</label>
            `).join("")}
          </div>
        </div>
      `).join("")}

      <div class="section-heading">${esc(T.commentsHeading)}</div>
      ${commentBlock("commentImprove", "comment_improve", "f-comment-improve")}
      ${commentBlock("commentMissed", "comment_missed", "f-comment-missed")}
      ${commentBlock("commentOverrepresented", "comment_overrepresented", "f-comment-overrepresented")}

      <div class="btn-row">
        <button class="btn secondary" id="cancel-btn">Cancel</button>
        <button class="btn" id="save-btn">${isEdit ? "Update QQ-10" : "Save QQ-10"}</button>
      </div>
    </div>
  `;

  const backTo = () => navigatePatientDetail(patient.id);
  document.getElementById("back-btn").onclick = backTo;
  document.getElementById("cancel-btn").onclick = backTo;

  wireQq10Mic("commentImprove", "f-comment-improve");
  wireQq10Mic("commentMissed", "f-comment-missed");
  wireQq10Mic("commentOverrepresented", "f-comment-overrepresented");

  const collect = () => {
    const answers = {};
    for (const field of QQ10_FIELDS) {
      const checked = root.querySelector(`input[name="${field}"]:checked`);
      answers[field] = checked ? checked.value : null;
    }
    return {
      answers,
      comments: {
        commentImprove: document.getElementById("f-comment-improve").value,
        commentMissed: document.getElementById("f-comment-missed").value,
        commentOverrepresented: document.getElementById("f-comment-overrepresented").value,
      },
    };
  };

  root.querySelectorAll('input[name="qq10_lang"]').forEach((el) => {
    el.addEventListener("change", () => {
      if (activeQq10Recorder && activeQq10Recorder.state === "recording") activeQq10Recorder.stop();
      screenQQ10(patient, tool, existing, { language: el.value, ...collect() });
    });
  });

  document.getElementById("save-btn").onclick = async () => {
    const { answers, comments } = collect();
    const body = { patientId: patient.id, tool, language: lang, ...answers };
    body.commentImprove = comments.commentImprove.trim() || null;
    body.commentMissed = comments.commentMissed.trim() || null;
    body.commentOverrepresented = comments.commentOverrepresented.trim() || null;
    body.nativeNotes = qq10NativeNotes;

    try {
      await api("/api/qq10", { method: "POST", body: JSON.stringify(body) });
      lastError = null;
      await navigatePatientDetail(patient.id);
    } catch (err) {
      lastError = err.message;
      screenQQ10(patient, tool, existing, { language: lang, answers, comments });
    }
  };
}

// ---------------------------------------------------------------------
// HCP interviews
// ---------------------------------------------------------------------

async function navigateInterviews() {
  lastError = null;
  let interviews = [];
  try {
    interviews = await api("/api/interviews");
  } catch (err) {
    lastError = err.message;
  }
  screenInterviews(interviews);
}

function screenInterviews(interviews) {
  root.innerHTML = `
    ${topbar()}
    ${errorBanner()}
    <div class="card">
      <button class="btn secondary small" id="back-btn">← All patients</button>
      <div class="btn-row">
        <button class="btn" id="new-interview-btn">+ New HCP Interview</button>
      </div>
    </div>
    <div class="card">
      <h2>HCP Interviews (${interviews.length})</h2>
      <table>
        <thead><tr><th>HCP</th><th>Department</th><th>Designation</th><th>Date</th></tr></thead>
        <tbody>
          ${interviews.map((i) => `
            <tr class="clickable" data-id="${i.id}">
              <td>${esc(i.hcp_name)}</td>
              <td>${esc(i.department || "—")}</td>
              <td>${esc(i.designation || "—")}</td>
              <td>${new Date(i.interview_date).toLocaleDateString()}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
  document.getElementById("back-btn").onclick = () => navigateHome();
  document.getElementById("new-interview-btn").onclick = () => screenInterviewForm(null);
  root.querySelectorAll("tr[data-id]").forEach((row) => {
    row.onclick = () => navigateInterviewDetail(row.dataset.id);
  });
}

async function navigateInterviewDetail(id) {
  lastError = null;
  try {
    const interview = await api(`/api/interviews/${id}`);
    screenInterviewForm(interview);
  } catch (err) {
    lastError = err.message;
    await navigateInterviews();
  }
}

let interviewNativeNotes = {};
let activeInterviewRecorder = null;
let interviewRecordingTimer = null;
const INTERVIEW_MAX_RECORDING_MS = 28000; // Sarvam's sync endpoint caps at 30s

function micFieldHtml(fieldId) {
  const voiceSupported = !!(navigator.mediaDevices && window.MediaRecorder);
  if (!voiceSupported) return "";
  return `
    <button class="mic-btn" id="mic-${fieldId}" type="button">🎙️ Record answer</button>
    <div class="mic-status" id="mic-status-${fieldId}"></div>
  `;
}

function wireInterviewMic(fieldId, textareaId) {
  const micBtn = document.getElementById(`mic-${fieldId}`);
  const micStatus = document.getElementById(`mic-status-${fieldId}`);
  if (!micBtn) return;

  micBtn.onclick = async () => {
    if (activeInterviewRecorder && activeInterviewRecorder.state === "recording") {
      activeInterviewRecorder.stop();
      return;
    }
    await startInterviewRecording(fieldId, textareaId, micBtn, micStatus);
  };
}

async function startInterviewRecording(fieldId, textareaId, micBtn, micStatus) {
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    micStatus.textContent = "Couldn't access the microphone. You can still type.";
    return;
  }

  const chunks = [];
  const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
  activeInterviewRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);

  activeInterviewRecorder.addEventListener("dataavailable", (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  });

  activeInterviewRecorder.addEventListener("stop", async () => {
    stream.getTracks().forEach((t) => t.stop());
    clearTimeout(interviewRecordingTimer);
    micBtn.textContent = "🎙️ Record answer";
    micBtn.classList.remove("recording");
    micBtn.disabled = true;
    micStatus.textContent = "Transcribing…";

    const blobType = activeInterviewRecorder.mimeType || "audio/webm";
    const blob = new Blob(chunks, { type: blobType });

    try {
      const res = await fetch("/api/interviews/transcribe", {
        method: "POST",
        headers: { "Content-Type": blobType },
        body: blob,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Transcription failed");

      const textarea = document.getElementById(textareaId);
      if (textarea) {
        const existingText = textarea.value.trim();
        textarea.value = existingText ? `${existingText} ${data.englishText}`.trim() : (data.englishText || "");
      }
      interviewNativeNotes[fieldId] = interviewNativeNotes[fieldId]
        ? `${interviewNativeNotes[fieldId]} ${data.nativeText || ""}`.trim()
        : (data.nativeText || "");

      micStatus.textContent = data.englishText
        ? "Added below — feel free to edit it."
        : "Didn't catch that clearly. Please try again or type instead.";
    } catch (err) {
      micStatus.textContent = "Couldn't transcribe that. Please try again or type instead.";
    } finally {
      micBtn.disabled = false;
      activeInterviewRecorder = null;
    }
  });

  activeInterviewRecorder.start();
  micBtn.textContent = "⏹ Stop recording";
  micBtn.classList.add("recording");
  micStatus.textContent = "Listening… tap again to stop.";

  interviewRecordingTimer = setTimeout(() => {
    if (activeInterviewRecorder && activeInterviewRecorder.state === "recording") activeInterviewRecorder.stop();
  }, INTERVIEW_MAX_RECORDING_MS);
}

function screenInterviewForm(existing) {
  const isEdit = !!existing;
  const i = existing || {};
  interviewNativeNotes = (existing && existing.native_notes) || {};

  root.innerHTML = `
    ${topbar()}
    ${errorBanner()}
    <div class="card">
      <button class="btn secondary small" id="back-btn">← HCP Interviews</button>
      <h2 style="margin-top:14px">${isEdit ? "Edit" : "New"} HCP Interview</h2>

      <div class="section-heading">Health Care Professional</div>
      <div class="field-row">
        <div class="field"><label>Name</label><input type="text" id="f-hcp-name" value="${esc(i.hcp_name || "")}"/></div>
        <div class="field"><label>Age</label><input type="number" id="f-hcp-age" value="${esc(i.hcp_age ?? "")}"/></div>
        <div class="field"><label>Department</label><input type="text" id="f-hcp-department" value="${esc(i.hcp_department || "")}"/></div>
        <div class="field"><label>Designation</label><input type="text" id="f-hcp-designation" value="${esc(i.hcp_designation || "")}"/></div>
      </div>
      <div class="field"><label>Interview date</label><input type="date" id="f-interview-date" value="${i.interview_date ? String(i.interview_date).slice(0, 10) : ""}"/></div>

      <div class="section-heading">Interview Questions</div>
      <div class="field">
        <label>1. Usefulness and Relevance — How useful are the distress reports for understanding patients' emotional and psychosocial needs?</label>
        ${micFieldHtml("q1Usefulness")}
        <textarea id="f-q1">${esc(i.q1_usefulness || "")}</textarea>
      </div>
      <div class="field">
        <label>2. Clarity and Interpretation — How clear and easy to interpret is the information presented?</label>
        ${micFieldHtml("q2Clarity")}
        <textarea id="f-q2">${esc(i.q2_clarity || "")}</textarea>
      </div>
      <div class="field">
        <label>3. Impact on Clinical Workflow — How do the reports fit into existing workflow and patient interactions?</label>
        ${micFieldHtml("q3Workflow")}
        <textarea id="f-q3">${esc(i.q3_workflow || "")}</textarea>
      </div>
      <div class="field">
        <label>4. Communication and Team Use — How is the information used or shared within the care team?</label>
        ${micFieldHtml("q4Communication")}
        <textarea id="f-q4">${esc(i.q4_communication || "")}</textarea>
      </div>
      <div class="field">
        <label>5. Suggestions for Improvement — What would make the reports more useful, actionable, or user-friendly?</label>
        ${micFieldHtml("q5Suggestions")}
        <textarea id="f-q5">${esc(i.q5_suggestions || "")}</textarea>
      </div>

      <div class="btn-row">
        <button class="btn secondary" id="cancel-btn">Cancel</button>
        <button class="btn" id="save-btn">${isEdit ? "Save Changes" : "Save Interview"}</button>
      </div>
    </div>
  `;
  const backTo = () => navigateInterviews();
  document.getElementById("back-btn").onclick = backTo;
  document.getElementById("cancel-btn").onclick = backTo;

  wireInterviewMic("q1Usefulness", "f-q1");
  wireInterviewMic("q2Clarity", "f-q2");
  wireInterviewMic("q3Workflow", "f-q3");
  wireInterviewMic("q4Communication", "f-q4");
  wireInterviewMic("q5Suggestions", "f-q5");

  document.getElementById("save-btn").onclick = async () => {
    const name = document.getElementById("f-hcp-name").value.trim();
    if (!name) {
      lastError = "Health professional name is required.";
      screenInterviewForm(existing);
      return;
    }
    const body = {
      hcp: {
        name,
        age: document.getElementById("f-hcp-age").value.trim() || null,
        department: document.getElementById("f-hcp-department").value.trim() || null,
        designation: document.getElementById("f-hcp-designation").value.trim() || null,
      },
      interviewDate: document.getElementById("f-interview-date").value || null,
      q1Usefulness: document.getElementById("f-q1").value.trim() || null,
      q2Clarity: document.getElementById("f-q2").value.trim() || null,
      q3Workflow: document.getElementById("f-q3").value.trim() || null,
      q4Communication: document.getElementById("f-q4").value.trim() || null,
      q5Suggestions: document.getElementById("f-q5").value.trim() || null,
      nativeNotes: interviewNativeNotes,
    };
    try {
      if (isEdit) {
        await api(`/api/interviews/${existing.id}`, { method: "PUT", body: JSON.stringify(body) });
      } else {
        await api("/api/interviews", { method: "POST", body: JSON.stringify(body) });
      }
      lastError = null;
      await navigateInterviews();
    } catch (err) {
      lastError = err.message;
      screenInterviewForm(existing);
    }
  };
}

// ---------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------

(async function init() {
  root.innerHTML = `<p>Loading...</p>`;
  try {
    currentUser = await api("/api/auth/me");
    await navigateHome();
  } catch {
    screenLogin();
  }
})();

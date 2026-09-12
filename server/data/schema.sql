-- BraveEve Study Dashboard — schema
-- Run once against your Render Postgres database to set up all tables.

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Health care professionals: used both as a patient's treating clinician
-- (referenced from patients.treating_hcp_id) and as the subject of a
-- semi-structured interview (referenced from hcp_interviews). One table so
-- the same person isn't re-entered in two different shapes if they show up
-- in both contexts.
CREATE TABLE IF NOT EXISTS health_professionals (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  age INTEGER,
  date_of_birth DATE,
  department TEXT,
  designation TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS patients (
  id SERIAL PRIMARY KEY,
  patient_code TEXT UNIQUE NOT NULL, -- e.g. "BE-P001" — the ID embedded in personalized QR links

  -- Patient information
  name TEXT NOT NULL,
  age INTEGER,
  date_of_birth DATE,
  place_of_residence TEXT,      -- Urban / Semi-urban / Rural
  smartphone_familiarity BOOLEAN,

  -- Marital and family details
  marital_status TEXT,          -- Single / Married / Widowed / Separated / Divorced
  family_type TEXT,             -- Nuclear / Joint / Extended
  education_level TEXT,         -- No formal education / Primary / Secondary / Graduate / Postgraduate / Doctorate
  occupation_status TEXT,       -- Unemployed / Employed
  occupation_detail TEXT,       -- free text, if Employed
  religion TEXT,                -- Hindu / Muslim / Christian / Sikh / Jain / Other
  religion_other TEXT,
  health_insurance BOOLEAN,
  insurance_type TEXT,          -- Government / Private / Other
  insurance_type_other TEXT,

  -- Medical details
  family_history_cancer BOOLEAN,
  family_history_relationship TEXT,
  stage_of_cancer TEXT,
  date_of_diagnosis DATE,
  time_since_diagnosis_months INTEGER,

  -- Treatment details
  treatment_intent TEXT,        -- Curative / Palliative
  surgery BOOLEAN,
  surgery_type TEXT,            -- Mastectomy / Lumpectomy / Other
  surgery_type_other TEXT,
  reconstruction_done BOOLEAN,
  reconstruction_type TEXT,
  chemotherapy BOOLEAN,
  chemotherapy_cycles INTEGER,
  adjuvant_therapy BOOLEAN,
  neoadjuvant_therapy BOOLEAN,
  radiation_therapy BOOLEAN,
  radiation_sessions INTEGER,
  hormone_therapy BOOLEAN,
  hormone_therapy_duration_months INTEGER,
  other_treatments TEXT,

  -- Treating health care professional for this patient (from the same form)
  treating_hcp_id INTEGER REFERENCES health_professionals(id),

  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- QQ-10: patient-completed, once per tool (BraveEve, NCCN Distress Thermometer)
CREATE TABLE IF NOT EXISTS qq10_responses (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES patients(id),
  tool TEXT NOT NULL CHECK (tool IN ('braveeve', 'nccn')),

  -- Each item: 'strongly_agree' | 'mostly_agree' | 'neither' | 'mostly_disagree' | 'strongly_disagree'
  q1_helped_communicate TEXT,
  q2_relevant TEXT,
  q3_easy_to_complete TEXT,
  q4_included_all_aspects TEXT,
  q5_enjoyed TEXT,
  q6_would_repeat TEXT,
  q7_too_long TEXT,
  q8_too_embarrassing TEXT,
  q9_too_complicated TEXT,
  q10_upset_me TEXT,

  comment_improve TEXT,          -- suggestions on how the questionnaire could be improved
  comment_missed TEXT,           -- important symptoms/concerns missed
  comment_overrepresented TEXT,  -- areas over-represented

  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- one QQ-10 per patient per tool
  UNIQUE (patient_id, tool)
);

-- HCP semi-structured interviews: standalone, not tied to individual patients
CREATE TABLE IF NOT EXISTS hcp_interviews (
  id SERIAL PRIMARY KEY,
  health_professional_id INTEGER NOT NULL REFERENCES health_professionals(id),
  interview_date DATE NOT NULL DEFAULT CURRENT_DATE,

  q1_usefulness TEXT,     -- Usefulness and relevance
  q2_clarity TEXT,        -- Clarity and interpretation
  q3_workflow TEXT,       -- Impact on clinical workflow
  q4_communication TEXT,  -- Communication and team use
  q5_suggestions TEXT,    -- Suggestions for improvement

  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_qq10_patient ON qq10_responses(patient_id);
CREATE INDEX IF NOT EXISTS idx_patients_code ON patients(patient_code);

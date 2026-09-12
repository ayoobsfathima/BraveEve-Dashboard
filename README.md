# BraveEve Study Dashboard

Internal tool for the study team (2-4 people) to register patients, generate
personalized QR codes for BraveEve and the NCCN Distress Thermometer,
collect QQ-10 feedback, and record HCP semi-structured interviews.

## Setup

1. **Create a Postgres database on Render** (New + → PostgreSQL). Copy its
   "Internal Database URL" if this app will also run on Render, or
   "External Database URL" otherwise.

2. **Set environment variables** (copy `.env.example` to `.env` locally, or
   set these directly in Render's dashboard for deployment):
   - `DATABASE_URL` — from step 1
   - `SESSION_SECRET` — any long random string
   - `BRAVEEVE_BASE_URL` / `NCCN_BASE_URL` — the two live tool URLs

3. **Install dependencies and apply the schema:**
   ```
   npm install
   npm run migrate
   ```

4. **Create a login for each team member:**
   ```
   npm run create-user -- <username> <password> "<Display Name>"
   ```
   Run this once per person. There's no self-service signup — accounts are
   created this way only.

5. **Run it:**
   ```
   npm start
   ```

## What's here

- `patients` — the socio-demographic + clinical intake form
- `health_professionals` — shared by both the "treating HCP" on a patient
  record and standalone HCP interviews
- `qq10_responses` — one per patient per tool (braveeve / nccn), resubmitting
  updates rather than duplicating
- `hcp_interviews` — standalone, not tied to a specific patient

QR codes are generated locally (via the `qrcode` package) and never sent to
a third-party service, since the links carry a patient identifier.

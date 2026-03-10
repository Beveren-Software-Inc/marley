# Daily Medication Chart & Medication Sheet — Design

This document describes how to design and implement:

1. **Daily Medication Chart** — Nurse view: track medication schedule **by session** (e.g. Morning / Noon / Evening / Night).
2. **Medication Sheet (Report)** — Update and record **administration status** (given / not given / time / initials).

---

## 1. What You Already Have (Summary)

| Concept | In your app |
|--------|-------------|
| **Prescription** | **Patient Medication Order** (PMO) — header linked to encounter/admission. |
| **Each drug line** | **Inpatient Medication Order Entry** — drug, dose, **Prescription Frequency**, instructions. |
| **When to give** | **Prescription Frequency** has `dosage_strength`: list of `{ strength, strength_time }` (e.g. 9:00, 14:00, 21:00). So “session” = one of these times. |
| **What was given** | **Medicine Given** (child of Admission Detail, table `table_yrwe`) — date, time, medicine_code, qty, user. Optional link to PMO and `medicine_given_timing`. |
| **Nurse actions** | **CreateMedicineGivenModal** (pick prescription + order line or direct item, set date/time, save) and **MedicineGivenList** (list of given doses). |

So: **schedule** comes from Prescription Frequency times; **administration status** is “did we create a Medicine Given row for this drug at this date/time?”.

---

## 2. Daily Medication Chart — What It Is and What It Looks Like

### Purpose

- One place for the nurse to see **all medications due for a patient for a chosen day**, grouped **by session** (e.g. Morning, Noon, Evening, Night).
- Lets the nurse quickly see “what’s due in this session?” and then record “given” in the same flow.

### “Schedule by session” — What sessions are

- **Sessions** = time slots that match how nurses work (e.g. shift-based or fixed times).
- Your **Prescription Frequency** already defines **times** via `dosage_strength[].strength_time` (e.g. 9:00, 14:00, 21:00).
- Map those times to **session labels**:

  | Time window (example) | Session label |
  |------------------------|---------------|
  | 05:00 – 10:59         | Morning       |
  | 11:00 – 14:59         | Noon          |
  | 15:00 – 18:59         | Evening       |
  | 19:00 – 23:59         | Night         |

- For each **Inpatient Medication Order Entry** row you have `patient_frequency` (Prescription Frequency). From that frequency you get the list of times; each time falls into one session. So each (medication line, date, session) can be “due” or “not due”.

### Layout (conceptual)

**Option A — Matrix (chart)**

- **Rows**: Active medication lines (from Patient Medication Order → Inpatient Medication Order Entry for that admission, valid for the selected date).
- **Columns**: Sessions (e.g. Morning | Noon | Evening | Night).
- **Cell** for (medication, session):
  - **Empty** — not due in this session (frequency doesn’t have a time in this slot).
  - **Due** — due in this session, not yet given (or link to “Give”).
  - **Given at HH:MM** (and optionally nurse initials) — already recorded in Medicine Given for that drug/date/time in that session.

**Option B — List grouped by session**

- Sections: “Morning”, “Noon”, “Evening”, “Night”.
- Under each section: list of medications due in that session, each with status (Due / Given at HH:MM) and a “Mark given” action.

Both options use the **same data**; the chart is a matrix view of it, the list is a grouped view.

### Data needed (backend)

1. **Active orders for the day**
   - Patient Medication Orders for the admission with `docstatus = 1` and date range covering the selected day.
   - Their **Inpatient Medication Order Entry** rows (drug, dose, patient_frequency, etc.).

2. **Sessions for each order line**
   - For each order line, get Prescription Frequency → `dosage_strength` (or equivalent) → list of times.
   - Map each time to a session (e.g. 9:00 → Morning, 14:00 → Noon, 21:00 → Night). Frequencies with no times (e.g. OD, HS) can use a default (e.g. Morning or “Once daily”).

3. **Administration status**
   - For the selected **date**, get all **Medicine Given** rows for this admission (already available via `get_medicine_given(admission, ...)`).
   - For each (drug, date, session): see if there is a Medicine Given for that drug on that date with time in that session → “Given at HH:MM” + user; otherwise “Due”.

### Suggested API (example)

- **`get_daily_medication_chart(admission, date)`**
  - Returns:
    - `sessions`: list of `{ id, label, sort_order }` (e.g. Morning, Noon, Evening, Night).
    - `rows`: list of:
      - Medication line info (drug name, dose, frequency name, order entry id, prescription id).
      - `slots`: list of `{ session_id, due: bool, given_at?: "HH:MM", given_by?: string }`.
  - Implementation: get active PMO + IMOE for admission and date; for each IMOE get frequency times → sessions; for each (IMOE, date, session) check Medicine Given and set `due` / `given_at` / `given_by`.

### UI (Nurse app)

- **Screen**: e.g. “Daily Medication Chart” or “Medication Chart” under Nurse.
- **Controls**: Patient (from navbar), **Date** (default today).
- **Content**: Either matrix (rows = meds, columns = sessions) or list-by-session.
- **Actions**: “Mark as given” on a “Due” cell/row → open existing **CreateMedicineGivenModal** (or a slim variant) pre-filled with that prescription + order line and date/time, then save → new Medicine Given row → chart refreshes and shows “Given at HH:MM”.

---

## 3. Medication Sheet (Report) — What It Is and How It Updates Administration Status

### Purpose

- **Report** = list (or printable) view of the same underlying data: which medications were **due** and whether they were **administered** (and when, by whom).
- “Update administration status” = record that a dose was **given** (or refused / held, if you add those later). That update is done by creating (or editing) **Medicine Given** rows.

### What it looks like

- **List** (one row per “due dose” or per medication-session-day):
  - Columns: e.g. Date, Medication, Dose, Frequency, **Session** (or Time due), **Status** (Due / Given / Refused / Held), **Time given**, **Given by**.
- **Actions**: “Mark given” (or “Update status”) → same as chart: open modal to record Medicine Given (or future: set status to Refused/Held with a reason).
- So the **Medication Sheet** is another view over the same model (schedule + Medicine Given), focused on **status** and **reporting**, rather than the matrix “chart” view.

### Same backend, different view

- Reuse the same **schedule + administration** logic as the Daily Medication Chart (which orders are due when, and which of those have a Medicine Given).
- API can be the same: e.g. `get_daily_medication_chart(admission, date)` or a variant `get_medication_sheet(admission, from_date, to_date)` that returns a flat list of “due doses” with status (Due / Given at / by) for reporting and filtering.
- “Update administration status” = call your existing **create_medicine_given** (and later, if you add refusal/hold, an API to record that).

---

## 4. Is It “Schedule” or Something Else?

- **Schedule** = the set of (medication, date, time/session) when a dose is **due**. That comes from:
  - Patient Medication Order (validity dates),
  - Inpatient Medication Order Entry (drug, dose, **Prescription Frequency**),
  - Prescription Frequency → **dosage_strength** (times) or rules for OD/HS etc.
- So the schedule is **derived** from existing data; you don’t store a separate “schedule” entity. You compute “what’s due on date D” from orders + frequency.
- **Administration** = the fact that a dose was given (or not). That’s stored as **Medicine Given** rows. So:
  - **Daily Medication Chart** = schedule by session + administration status (read) + “mark given” (write via Medicine Given).
  - **Medication Sheet** = same data in list/report form, same way to update status (Medicine Given).

---

## 5. Implementation Checklist

### Backend

- [ ] **Map Prescription Frequency → sessions**
  - Add or use a helper: given a frequency name, return list of times (from `dosage_strength`) and optionally map to session labels. Handle frequencies with no times (OD, HS, etc.) with a default time/session.
- [ ] **API: get_daily_medication_chart(admission, date)**
  - Returns sessions + rows (medication lines + per-session due/given status). Uses existing PMO, IMOE, Medicine Given, and Prescription Frequency.
- [ ] (Optional) **API: get_medication_sheet(admission, from_date, to_date)**  
  - Same data in a flat list for report/print.

### Frontend

- [ ] **Daily Medication Chart screen (Nurse)**
  - Date picker, call chart API, render matrix or list-by-session.
  - “Mark as given” → CreateMedicineGivenModal (or small variant) pre-filled with the right order line and date/time → on success refresh chart.
- [ ] **Medication Sheet (report) screen or print**
  - Same API (or sheet API), table with columns: Date, Medication, Dose, Frequency, Session, Status, Time given, Given by. “Update administration status” = same “Mark given” flow.

### Data model (optional enhancements)

- [ ] **medicine_given_timing** on Medicine Given: store session label (e.g. “Morning”) when recording, so reporting and chart can show it without recomputing from time.
- [ ] Later: status “Refused” / “Held” (separate store or flags on Medicine Given) if required by your workflow.

---

## 6. Summary

| Item | What it is | How it works |
|------|------------|--------------|
| **Daily Medication Chart** | Nurse view: medications due **by session** for a day | Schedule from PMO + IMOE + Prescription Frequency times → sessions. Administration from Medicine Given. UI: matrix or list-by-session; “Mark given” creates Medicine Given. |
| **Medication Sheet (Report)** | List/report to see and **update administration status** | Same schedule + Medicine Given. Shown as list (Date, Med, Session, Status, Time given). “Update status” = record given (and later refused/held) via same backend. |
| **Schedule** | When each drug is due | Derived from orders + Prescription Frequency (`dosage_strength` times), not a separate entity. |
| **Administration status** | Given / not given (and when, by whom) | Stored in **Medicine Given**; chart and sheet both read from it and update it by creating (or editing) rows. |

You can implement the chart first (with the shared API), then add the sheet as an alternative view and/or print layout using the same API and the same “Mark given” flow.

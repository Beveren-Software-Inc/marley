# Reminder for Long-Acting Medicines (BRD)

## What it is

**Long-acting medicines** are drugs given at **extended intervals** (e.g. once weekly, every 2 weeks, every 4 weeks) — for example depot antipsychotics, some contraceptives, or long-acting insulin. Because they are not given daily, staff can easily miss the next due date.

**Automatic alerts for extended-duration medications** means the system:

1. **Identifies** which prescribed medications are “long-acting” (by frequency, e.g. Q1W, Q2W, Q4W).
2. **Computes** when the next dose is **due** (from last administration or order start).
3. **Surfaces reminders** (in-app list, notifications, or both) when a dose is **due today**, **due soon**, or **overdue**.

So nurses/doctors see “Patient X is due for [Medication] on [date]” and can act (e.g. record administration or schedule the dose).

---

## How we handle it (this codebase)

### 1. Definition of “long-acting”

We use the **Prescription Frequency** doctype:

- **long_acting** (checkbox): when **checked**, that frequency is treated as long-acting for reminders. No hardcoded list of frequency names — the system loads all Prescription Frequencies where `long_acting = 1`.
- **reminder_interval_days** (optional): if you add this field to Prescription Frequency, it is used as the interval in days for the next-due calculation. If not set, the code uses a small fallback map for known names (e.g. Q1W=7, Q2W=14, Q3W=21, Q4W=28) and defaults to 7 days for any other long-acting frequency.

So: check **Long Acting** on whichever Prescription Frequencies are extended-duration (weekly, every 2 weeks, etc.); optionally set **Reminder interval (days)** for custom intervals.

### 2. When is the “next dose” due?

- **Last given date**: From **Medicine Given** (Admission Detail) we take the **latest** administration date for that (admission, drug).
- If there is **no** administration yet, we use the order’s **start_date** as the reference.
- **Next due date** = last given date (or start_date) + interval in days (from `reminder_interval_days` or the fallback map).

### 3. What we alert on

- **Overdue**: next_due_date &lt; today  
- **Due today**: next_due_date == today  
- **Due soon**: next_due_date in the next N days (e.g. 1–7 days ahead)

Configurable “days ahead” (e.g. 7) lets you show “due in the next week” as well as due today/overdue.

### 4. Implementation

- **Backend**: API `get_long_acting_medication_reminders(patient=None, admission=None, days_ahead=7)`  
  Returns list of items: patient, admission, prescription, order_entry, drug, drug_name, frequency, last_given_date, next_due_date, status (overdue / due_today / due_soon).

- **Frontend**: Nurse subtopic **“Long Acting Med Reminder”** (`n-reminder`):
  - Lists due/upcoming long-acting medications (optional filter by current patient or show all for the unit).
  - Each row shows: patient, medication, frequency, last given, next due, status.
  - Action: **“Record administration”** → opens **Create Medicine Given** (existing modal) so the nurse can record the dose; after save, the reminder can drop off or move to the next due date.

- **Optional later**: Scheduled job (daily) that creates **Frappe Notifications** or dashboard widgets for due/overdue long-acting meds; or push to a “Reminders” panel in the Nurse landing page.

---

## Summary

| Term | Meaning |
|------|--------|
| **Long-acting medicine** | Prescription whose frequency has **Long Acting** checked on Prescription Frequency. |
| **Automatic alerts** | In-app list (and optionally notifications) of “due today”, “due soon”, “overdue” for these meds. |
| **How we handle it** | API that computes next due date from last Medicine Given (or order start) + interval; Nurse screen “Long Acting Med Reminder” to show and act on them. |

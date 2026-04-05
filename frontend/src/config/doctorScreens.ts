// doctorScreens.ts

// Original flat doctor screens (kept for backward compatibility)
export const doctorScreens = [
  { id: 'mh', title: 'Medical History (Allergies)', desc: 'View allergies, past medical/surgical history.' },
  // { id: 'pi', title: 'Patient Information', desc: 'Demographics and contact details.' },
  { id: 'dpn', title: 'Doctor Progress Note', desc: 'Daily progress notes.' },
  { id: 'dos', title: 'Doctors Order Sheet', desc: 'Orders for labs, meds, procedures.' },
  // { id: 'dn', title: 'Doctors Note', desc: 'Free-text notes.' },
  { id: 'dmc', title: 'Doctor Medication Chart', desc: 'Medication chart overview.' },
  { id: 'admission', title: 'Admission', desc: 'View and manage inpatient admissions.' },
  { id: 'df', title: 'Discharge Form', desc: 'Discharge summary and instructions.' },
  // { id: 'med', title: 'Medication', desc: 'Active medication list.' },
  // { id: 'mr', title: 'Medical Report', desc: 'Formal reports and letters.' },
  { id: 'gm', title: 'Given Medicines', desc: 'Administration history.' },
  { id: 'rx', title: 'Doctors Prescriptions', desc: 'Prescribed items.' },
  // { id: 'dx', title: 'Diagnoses', desc: 'Current diagnoses.' },
  { id: 'warn', title: 'Warning Messages', desc: 'Allergies and critical flags.' },
  { id: 'psy-o', title: 'Psychologist Order', desc: 'Orders from psychologist.' },
  { id: 'psy-n', title: 'Psychologists Notes', desc: 'Notes from psychologist.' },
  { id: 'nut', title: 'Nutritionist Notes', desc: 'Dietary notes and plans.' },
  { id: 'ther', title: 'Therapist Notes', desc: 'Therapy notes.' },
  { id: 'nurse', title: 'Nursing Notes', desc: 'Nursing documentation.' },
  { id: 'lab', title: 'Laboratory', desc: 'Lab requests and results.' },
  {id: 'patients', title: 'Patients List', desc: 'List of all patients.'},
  // { id: 'op', title: 'OP Visit', desc: 'Outpatient visits.' },
  { id: 'tpr', title: 'TPR/Vital Signs', desc: 'Vitals and charts.' },
  { id: 'fall', title: 'Morse Fall Scale', desc: 'Fall risk assessment.' },
  { id: 'ect', title: 'ECT', desc: 'ECT details.' },
  { id: 'obs', title: 'Observation Level', desc: 'Observation level tracking.' },
  { id: 'env', title: 'Environmental Checklist', desc: 'Environmental safety checklist.' },
  { id: 'sleep', title: 'Sleeping Pattern', desc: 'Sleeping pattern tracking.' },
  { id: 'iop', title: 'IOP Dashboard', desc: 'Intensive outpatient scheduling and enrollment.' },
  { id: 'sl', title: 'Sick Leave', desc: 'Leave requests.' },
  // { id: 'ipm', title: 'IP Medication', desc: 'Inpatient medications.' },
  { id: 'pvh', title: 'Patient Visit History', desc: 'Prior encounters.' },
  { id: 'pkg', title: 'Package Detail', desc: 'Package info.' },
  { id: 'nurse-tasks', title: 'Nursing Task Assignment', desc: 'Assign and view nursing tasks.' },
  { id: 'd-long-acting-meds', title: 'Long Acting Medicine', desc: 'View and manage long acting medicine.' },
  { id: 'physical-exam', title: 'Physical Examination', desc: 'Document physical examination findings by body system.' },
  { id: 'patient-history', title: 'Patient History', desc: 'Structured patient history with template-driven detail items.' }
].sort((a, b) => a.title.localeCompare(b.title))

// Screen group type definition (if not already defined elsewhere)
export interface ScreenItem {
  id: string
  title: string
}

export interface ScreenGroup {
  groupTitle: string
  screens: ScreenItem[]
}

// Doctor screens organized into groups
export const doctorScreenGroups: ScreenGroup[] = [
  {
    groupTitle: 'Patient Overview',
    screens: [
      { id: 'warn', title: 'Warning Messages' },
      { id: 'mh', title: 'Medical History (Allergies)' },
      { id: 'physical-exam', title: 'Physical Examination' },
      {id:'patients', title: 'Patients List'},
      { id: 'fall', title: 'Morse Fall Scale' }, // Risk Assessment
    ],
  },
  {
    groupTitle: 'Clinical Documentation',
    screens: [
      { id: 'dpn', title: 'Doctor Progress Note' },
      { id: 'dos', title: 'Doctors Order' },
      { id: 'dx', title: 'Diagnoses' },
      { id: 'psy-n', title: 'Psychology Notes' },
      { id: 'psy-o', title: 'Psychology Order' },
      { id: 'nut', title: 'Nutritionist Notes' },
      { id: 'ther', title: 'Therapist Notes' },
      { id: 'nurse', title: 'Nursing Notes' },
      { id: 'patient-history', title: 'History Form' },
    ],
  },
  {
    groupTitle: 'Medication & Pharmacy',
    screens: [
      { id: 'rx', title: 'Doctors Prescriptions' },
      { id: 'dmc', title: 'Doctor Medication Chart' },
      { id: 'gm', title: 'Given Medicines' },
      { id: 'd-long-acting-meds', title: 'Long Acting Med Reminder' },
    ],
  },
  {
    groupTitle: 'Laboratory & Diagnostics',
    screens: [
      { id: 'lab', title: 'Laboratory' },
      { id: 'tpr', title: 'TPR / Vital Signs' },
      { id: 'ect', title: 'ECT Forms' },
      { id: 'obs', title: 'Observation Level' },
    ],
  },
  {
    groupTitle: 'Admission & Discharge',
    screens: [
      { id: 'admission', title: 'Admission Form' },
      { id: 'df', title: 'Discharge Form' },
    ],
  },
  {
    groupTitle: 'Daily Routine Care',
    screens: [
      { id: 'fall', title: 'Morse Fall Scale' },
      { id: 'sleep', title: 'Sleeping Pattern' },
      { id: 'env', title: 'Environmental Checklist' },
    ],
  },
  {
    groupTitle: 'Services & Scheduling',
    screens: [
      { id: 'op', title: 'OP Visit' },
      { id: 'sl', title: 'Sick Leave' },
    ],
  },
  {
    groupTitle: 'Scales & Assessments',
    screens: [
      { id: 'morse-fall', title: 'Morse Fall Scale' },
      { id: 'adhd', title: 'ADHD Assessment' },
      { id: 'depression', title: 'Depression Assessment' },
      { id: 'mood', title: 'Mood Disorder Assessment' },
      { id: 'gad7', title: 'GAD7 Assessment' },
      { id: 'pain', title: 'Pain Assessment' },
    ],
  }
]
/** Shared field labels for Physical Examination create + detail views */
export const PE_BASIC_FIELDS = [
  { key: 'weight', label: 'Weight' },
  { key: 'height', label: 'Height' },
  { key: 'blood_pressure', label: 'Blood Pressure' },
  { key: 'temp_pressure', label: 'Temp Pressure' },
  { key: 'pulse', label: 'Pulse' },
  { key: 'resp_rate', label: 'Respiratory Rate' },
] as const

export const PE_VISIT_FIELDS = [
  { key: 'trans_no', label: 'Trans No' },
  { key: 'patient', label: 'Patient' },
  { key: 'patient_name', label: 'Patient Name' },
  { key: 'inpatient_admission', label: 'Inpatient Admission' },
  { key: 'patient_visit', label: 'Patient Visit' },
] as const

export const PE_FINDING_SECTIONS = [
  {
    key: 'skin_',
    label: 'Skin, Hair, Nail, Gait, Surface, Abnormalities',
    accent: 'border-l-amber-400 bg-amber-50/50',
    titleClass: 'text-amber-800',
  },
  {
    key: 'cvsresp',
    label: 'CVS / RESP',
    accent: 'border-l-red-400 bg-red-50/50',
    titleClass: 'text-red-800',
  },
  {
    key: 'cnc',
    label: 'CNC (incl. AIMS)',
    accent: 'border-l-purple-400 bg-purple-50/50',
    titleClass: 'text-purple-800',
  },
  {
    key: 'git',
    label: 'GIT',
    accent: 'border-l-green-400 bg-green-50/50',
    titleClass: 'text-green-800',
  },
  {
    key: 'others',
    label: 'Others',
    accent: 'border-l-slate-400 bg-slate-50/50',
    titleClass: 'text-slate-700',
  },
] as const

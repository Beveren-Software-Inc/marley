// import { useState, useCallback, useRef, useEffect } from 'react'
// import { apiRequest } from '../../services/apiClient'
// import { fetchPatientVisits, fetchPatientOptions, fetchInpatientAdmissionOptions, type LinkFieldOption } from '../../services/common'
// import { toast } from '../../hooks/useToast'
// import { ChevronDown, Check, Stethoscope , ClipboardList } from 'lucide-react'

import {
  CM_BTN_CANCEL,
  CM_BTN_PRIMARY,
  CREATE_MODAL_BODY_GRADIENT,
  CREATE_MODAL_OVERLAY,
  CREATE_MODAL_TAB_BAR,
  CreateModalFooter,
  CreateModalHeader,
  MODAL_FIELD_CLASS,
  MODAL_LABEL_CLASS,
  MODAL_SECTION_CLASS,
  MODAL_SECTION_TITLE_CLASS,
  MODAL_TEXTAREA_CLASS,
  createModalShellClass,
  createModalTabButtonClass,
} from '../ui/CreateModalChrome'
// // ─── Link Combobox ────────────────────────────────────────────────────────────

// interface LinkComboboxProps {
//   label: string
//   value: string
//   onSelect: (opt: LinkFieldOption) => void
//   onClear: () => void
//   fetchOptions: (s: string) => Promise<LinkFieldOption[]>
//   placeholder?: string
// }

// const LinkCombobox = ({ label, value, onSelect, onClear, fetchOptions, placeholder }: LinkComboboxProps) => {
//   const [query, setQuery] = useState(value)
//   const [options, setOptions] = useState<LinkFieldOption[]>([])
//   const [open, setOpen] = useState(false)
//   const [loading, setLoading] = useState(false)
//   const ref = useRef<HTMLDivElement>(null)

//   useEffect(() => { setQuery(value) }, [value])
//   useEffect(() => {
//     if (!open) return
//     const t = setTimeout(async () => {
//       setLoading(true)
//       try { setOptions(await fetchOptions(query)) } catch { setOptions([]) } finally { setLoading(false) }
//     }, query.trim() === '' ? 0 : 300)
//     return () => clearTimeout(t)
//   }, [query, open, fetchOptions])
//   useEffect(() => {
//     const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
//     document.addEventListener('mousedown', h)
//     return () => document.removeEventListener('mousedown', h)
//   }, [])

//   return (
//     <div ref={ref} className="relative">
//       <label className="block text-xs font-semibold text-slate-600 mb-1">{label}</label>
//       <div className="relative">
//         <input type="text" value={query} onChange={e => { setQuery(e.target.value); onClear(); setOpen(true) }}
//           onFocus={() => setOpen(true)} placeholder={placeholder ?? 'Search...'} autoComplete="off"
//           className="w-full rounded-md border border-slate-300 px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white" />
//         <span className="absolute inset-y-0 right-2 flex items-center pointer-events-none text-slate-400">
//           {loading ? <span className="w-3.5 h-3.5 border-2 border-slate-300 border-t-primary rounded-full animate-spin" /> : <ChevronDown className="w-3.5 h-3.5" />}
//         </span>
//       </div>
//       {open && (
//         <div className="absolute z-30 mt-1 w-full bg-white border border-slate-200 rounded-md shadow-lg max-h-52 overflow-y-auto">
//           {options.length === 0
//             ? <div className="px-3 py-2 text-xs text-slate-400">{loading ? 'Searching…' : 'No results found'}</div>
//             : options.map(opt => (
//               <button key={opt.name} type="button" onClick={() => { onSelect(opt); setQuery(opt.label); setOpen(false) }}
//                 className="w-full text-left px-3 py-2 text-sm hover:bg-primary/5">
//                 <span className="font-medium text-slate-800">{opt.label}</span>
//                 {opt.label !== opt.name && <span className="ml-1.5 text-xs text-slate-400">{opt.name}</span>}
//               </button>
//             ))}
//         </div>
//       )}
//     </div>
//   )
// }

// // ─── Types ────────────────────────────────────────────────────────────────────

// interface PhysicalExaminationModalProps {
//   admissionNo?: string
//   patient?: string
//   patientName?: string
//   onClose: () => void
//   onSuccess?: () => void
// }

// type TabId = 'general' | 'findings'

// const TABS: { id: TabId; label: string }[] = [
//   { id: 'general',  label: 'General' },
//   { id: 'findings', label: 'Examination Findings' },
// ]

// const ic = 'w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white'
// const lc = 'block text-xs font-semibold text-slate-600 mb-1'

// // Clinical system fields definition
// const SYSTEMS = [
//   {
//     fieldname: 'skin_',
//     label: 'Skin, Hair, Nail, Gait, Surface, Abnormalities',
//     placeholder: 'Document findings related to skin, hair, nails, gait, surface and any abnormalities…',
//     icon: '🩺',
//     color: 'border-amber-200 bg-amber-50',
//     headerColor: 'text-amber-700',
//   },
//   {
//     fieldname: 'cvsresp',
//     label: 'CVS / RESP',
//     placeholder: 'Document cardiovascular and respiratory examination findings…',
//     icon: '❤️',
//     color: 'border-red-200 bg-red-50',
//     headerColor: 'text-red-700',
//   },
//   {
//     fieldname: 'cnc',
//     label: 'CNC: Include Abnormal Involuntary Movements (AIMS)',
//     placeholder: 'Document central nervous system findings including AIMS assessment…',
//     icon: '🧠',
//     color: 'border-purple-200 bg-purple-50',
//     headerColor: 'text-purple-700',
//   },
//   {
//     fieldname: 'git',
//     label: 'GIT',
//     placeholder: 'Document gastrointestinal tract examination findings…',
//     icon: '🫃',
//     color: 'border-green-200 bg-green-50',
//     headerColor: 'text-green-700',
//   },
//   {
//     fieldname: 'others',
//     label: 'Others',
//     placeholder: 'Any additional examination findings not covered above…',
//     icon: '📋',
//     color: 'border-slate-200 bg-slate-50',
//     headerColor: 'text-slate-600',
//   },
// ] as const

// // ─── Modal ────────────────────────────────────────────────────────────────────

// export const PhysicalExaminationModal = ({
//   admissionNo = '',
//   patient = '',
//   patientName = '',
//   onClose,
//   onSuccess,
// }: PhysicalExaminationModalProps) => {
//   const [activeTab, setActiveTab] = useState<TabId>('general')
//   const [submitting, setSubmitting] = useState(false)

//   // General
//   const [inpatientAdmission, setInpatientAdmission] = useState(admissionNo)
//   const [patientVisit, setPatientVisit] = useState('')
//   const [patientVisitLabel, setPatientVisitLabel] = useState('')
//   const [patientField, setPatientField] = useState(patient)
//   const [patientNameField, setPatientNameField] = useState(patientName || '')
//   const isLockedContext = Boolean(admissionNo)

//   // Findings
//   const [skin, setSkin] = useState('')
//   const [cvsresp, setCvsresp] = useState('')
//   const [cnc, setCnc] = useState('')
//   const [git, setGit] = useState('')
//   const [others, setOthers] = useState('')

//   const findingsValues: Record<string, string> = { skin_: skin, cvsresp, cnc, git, others }
//   const findingsSetters: Record<string, (v: string) => void> = {
//     skin_: setSkin, cvsresp: setCvsresp, cnc: setCnc, git: setGit, others: setOthers,
//   }

//   const filledCount = [skin, cvsresp, cnc, git, others].filter(v => v.trim().length > 0).length

//   const fetchVisits = useCallback(
//     (search: string) => fetchPatientVisits(patientField, search || undefined),
//     [patientField]
//   )

//   const fetchPatientOpts = useCallback((s: string) => fetchPatientOptions(s || undefined), [])
//   const fetchAdmissionOpts = useCallback(
//     (s: string) => fetchInpatientAdmissionOptions(s || undefined, patientField || undefined),
//     [patientField]
//   )

//   const handleSubmit = async (e: React.FormEvent) => {
//     e.preventDefault(); e.stopPropagation()
//     setSubmitting(true)
//     try {
//       const payload = {
//         inpatient_admission: inpatientAdmission || undefined,
//         patient_visit: patientVisit || undefined,
//         patient: patientField || undefined,
//         patient_name: patientNameField || undefined,
//         skin_: skin || undefined,
//         cvsresp: cvsresp || undefined,
//         cnc: cnc || undefined,
//         git: git || undefined,
//         others: others || undefined,
//       }
//       await apiRequest('/api/resource/Physical%20Examination', {
//         method: 'POST',
//         body: JSON.stringify({ data: payload }),
//       })
//       toast.success('Physical Examination saved successfully.')
//       onSuccess?.()
//       onClose()
//     } catch (err) {
//       toast.error(err instanceof Error ? err.message : 'Failed to save record.')
//     } finally {
//       setSubmitting(false)
//     }
//   }

//   const currentTabIdx = TABS.findIndex(t => t.id === activeTab)

//   return (
//     <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
//       onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
//       <div className="absolute inset-0 bg-black/50" />
//       <div className="relative z-10 w-full max-w-2xl max-h-[92vh] bg-white rounded-xl shadow-2xl flex flex-col overflow-hidden"
//         onMouseDown={e => e.stopPropagation()}>

//         {/* Header */}
//         <div className="flex items-start justify-between px-6 py-4 border-b border-slate-200 bg-slate-50 shrink-0">
//           <div className="flex items-center gap-3">
//             <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
//               <Stethoscope className="w-5 h-5 text-primary" />
//             </div>
//             <div>
//               <h2 className="text-lg font-bold text-slate-900">Physical Examination</h2>
//               <p className="text-xs text-slate-500 mt-0.5">
//                 {patientName ? `${patientName} · ` : ''}{admissionNo || 'New Record'}
//               </p>
//             </div>
//           </div>
//           <button type="button" onClick={onClose}
//             className="inline-flex items-center justify-center w-8 h-8 rounded-md text-slate-500 hover:text-slate-800 hover:bg-slate-200 ml-4 shrink-0"
//             aria-label="Close"><X className="w-5 h-5" /></button>
//         </div>

//         {/* Tabs */}
//         <div className="flex border-b border-slate-200 bg-white shrink-0">
//           {TABS.map(tab => (
//             <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)}
//               className={`flex items-center gap-1.5 px-5 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
//                 activeTab === tab.id ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
//               }`}>
//               {tab.label}
//               {tab.id === 'findings' && filledCount > 0 && (
//                 <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold bg-primary/10 text-primary">
//                   {filledCount}/5
//                 </span>
//               )}
//             </button>
//           ))}
//         </div>

//         {/* Body */}
//         <form onSubmit={handleSubmit} noValidate className="flex-1 overflow-y-auto">
//           <div className="px-6 py-5">

//             {/* ── Tab 1: General ── */}
//             {activeTab === 'general' && (
//               <div className="space-y-5">
//                 <div>
//                   <p className="text-sm font-semibold text-slate-800 border-b border-slate-200 pb-1.5 mb-4">Patient & Visit Information</p>
//                   <div className="grid grid-cols-2 gap-4">
//                     {isLockedContext ? (
//                       <div>
//                         <label className={lc}>Inpatient Admission</label>
//                         <input type="text" value={inpatientAdmission} readOnly className={`${ic} bg-slate-100 cursor-not-allowed`} />
//                       </div>
//                     ) : (
//                       <LinkCombobox
//                         label="Inpatient Admission"
//                         value={inpatientAdmission}
//                         onSelect={opt => setInpatientAdmission(opt.name)}
//                         onClear={() => setInpatientAdmission('')}
//                         fetchOptions={fetchAdmissionOpts}
//                         placeholder="Search admissions..."
//                       />
//                     )}
//                     <LinkCombobox
//                       label="Patient Visit"
//                       value={patientVisitLabel}
//                       onSelect={opt => { setPatientVisit(opt.name); setPatientVisitLabel(opt.label) }}
//                       onClear={() => { setPatientVisit(''); setPatientVisitLabel('') }}
//                       fetchOptions={fetchVisits}
//                       placeholder="Search patient visits..."
//                     />
//                     {isLockedContext ? (
//                       <div>
//                         <label className={lc}>Patient</label>
//                         <input type="text" value={patientField} readOnly className={`${ic} bg-slate-100 cursor-not-allowed`} />
//                       </div>
//                     ) : (
//                       <LinkCombobox
//                         label="Patient"
//                         value={patientNameField || patientField}
//                         onSelect={opt => { setPatientField(opt.name); setPatientNameField(opt.label) }}
//                         onClear={() => { setPatientField(''); setPatientNameField('') }}
//                         fetchOptions={fetchPatientOpts}
//                         placeholder="Search patients..."
//                       />
//                     )}
//                     <div>
//                       <label className={lc}>Patient Name</label>
//                       <input type="text" value={patientNameField} readOnly
//                         className={`${ic} bg-slate-100 cursor-not-allowed`} />
//                     </div>
//                   </div>
//                 </div>

//                 <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
//                   <p className="text-xs font-semibold text-primary mb-1">Ready to document?</p>
//                   <p className="text-xs text-slate-600">
//                     Switch to the <strong>Examination Findings</strong> tab to document findings for each body system.
//                   </p>
//                 </div>
//               </div>
//             )}

//             {/* ── Tab 2: Examination Findings ── */}
//             {activeTab === 'findings' && (
//               <div className="space-y-4">
//                 <p className="text-xs text-slate-500 flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-md px-3 py-2">
//                   <Stethoscope className="w-3.5 h-3.5 shrink-0 text-slate-400" />
//                   Document your findings for each body system below. All fields are optional but should be completed as thoroughly as possible.
//                 </p>

//                 {SYSTEMS.map(sys => (
//                   <div key={sys.fieldname} className={`rounded-lg border p-4 ${sys.color}`}>
//                     <div className="flex items-center gap-2 mb-2">
//                       <span className="text-base leading-none">{sys.icon}</span>
//                       <label className={`text-xs font-bold uppercase tracking-wide ${sys.headerColor}`}>
//                         {sys.label}
//                       </label>
//                       {findingsValues[sys.fieldname]?.trim().length > 0 && (
//                         <span className="ml-auto w-4 h-4 rounded-full bg-green-500 flex items-center justify-center shrink-0">
//                           <Check className="w-2.5 h-2.5 text-white" />
//                         </span>
//                       )}
//                     </div>
//                     <textarea
//                       value={findingsValues[sys.fieldname]}
//                       onChange={e => findingsSetters[sys.fieldname](e.target.value)}
//                       rows={3}
//                       placeholder={sys.placeholder}
//                       className="w-full rounded-md border border-white/80 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none shadow-sm"
//                     />
//                   </div>
//                 ))}
//               </div>
//             )}
//           </div>

//           {/* Footer */}
//           <div className="sticky bottom-0 bg-white border-t border-slate-200 px-6 py-4 flex items-center justify-between gap-3 shrink-0">
//             <div className="flex gap-1">
//               {TABS.map((tab, i) => (
//                 <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)}
//                   className={`w-2 h-2 rounded-full transition-colors ${activeTab === tab.id ? 'bg-primary' : 'bg-slate-300 hover:bg-slate-400'}`}
//                   aria-label={`${i + 1}. ${tab.label}`} />
//               ))}
//             </div>
//             <div className="flex gap-3">
//               {currentTabIdx > 0 && (
//                 <button type="button" onClick={() => setActiveTab(TABS[currentTabIdx - 1].id)}
//                   className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50">
//                   ← Previous
//                 </button>
//               )}
//               {currentTabIdx < TABS.length - 1 && (
//                 <button type="button" onClick={() => setActiveTab(TABS[currentTabIdx + 1].id)}
//                   className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary/90">
//                   Next →
//                 </button>
//               )}
//               <button type="button" onClick={onClose}
//                 className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50">
//                 Cancel
//               </button>
//               <button type="submit" disabled={submitting}
//                 className="px-5 py-2 text-sm font-semibold text-white bg-primary rounded-md hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed">
//                 {submitting ? 'Saving...' : 'Save Examination'}
//               </button>
//             </div>
//           </div>
//         </form>
//       </div>
//     </div>
//   )
// }


import { useState, useCallback, useRef, useEffect } from 'react'
import { apiRequest } from '../../services/apiClient'
import { fetchPatientVisits, fetchPatientOptions, fetchInpatientAdmissionOptions, type LinkFieldOption } from '../../services/common'
import { toast } from '../../hooks/useToast'
import { ChevronDown, Check, Stethoscope, ClipboardList } from 'lucide-react'
import { useCareContext } from '../../providers/CareContextProvider'

// ─── Link Combobox ────────────────────────────────────────────────────────────

interface LinkComboboxProps {
  label: string
  value: string
  onSelect: (opt: LinkFieldOption) => void
  onClear: () => void
  fetchOptions: (s: string) => Promise<LinkFieldOption[]>
  placeholder?: string
  disabled?: boolean
}

const LinkCombobox = ({ label, value, onSelect, onClear, fetchOptions, placeholder, disabled = false }: LinkComboboxProps) => {
  const [query, setQuery] = useState(value)
  const [options, setOptions] = useState<LinkFieldOption[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => { setQuery(value) }, [value])
  useEffect(() => {
    if (!open || disabled) return
    const t = setTimeout(async () => {
      setLoading(true)
      try { setOptions(await fetchOptions(query)) } catch { setOptions([]) } finally { setLoading(false) }
    }, query.trim() === '' ? 0 : 300)
    return () => clearTimeout(t)
  }, [query, open, fetchOptions, disabled])
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  return (
    <div ref={ref} className="relative">
      <label className="block text-xs font-semibold text-slate-600 mb-1">{label}</label>
      <div className="relative">
        <input 
          type="text" 
          value={query} 
          onChange={e => { 
            if (!disabled) {
              setQuery(e.target.value); 
              onClear(); 
              setOpen(true)
            }
          }}
          onFocus={() => !disabled && setOpen(true)} 
          placeholder={placeholder ?? 'Search...'} 
          autoComplete="off"
          disabled={disabled}
          className={`w-full rounded-md border border-slate-300 px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white ${disabled ? 'bg-slate-100 cursor-not-allowed' : ''}`} 
        />
        <span className="absolute inset-y-0 right-2 flex items-center pointer-events-none text-slate-400">
          {loading ? <span className="w-3.5 h-3.5 border-2 border-slate-300 border-t-primary rounded-full animate-spin" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </span>
      </div>
      {open && !disabled && (
        <div className="absolute z-30 mt-1 w-full bg-white border border-slate-200 rounded-md shadow-lg max-h-52 overflow-y-auto">
          {options.length === 0
            ? <div className="px-3 py-2 text-xs text-slate-400">{loading ? 'Searching…' : 'No results found'}</div>
            : options.map(opt => (
              <button key={opt.name} type="button" onClick={() => { onSelect(opt); setQuery(opt.label); setOpen(false) }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-primary/5">
                <span className="font-medium text-slate-800">{opt.label}</span>
                {opt.label !== opt.name && <span className="ml-1.5 text-xs text-slate-400">{opt.name}</span>}
              </button>
            ))}
        </div>
      )}
    </div>
  )
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface PhysicalExaminationModalProps {
  admissionNo?: string
  patient?: string
  patientName?: string
  onClose: () => void
  onSuccess?: () => void
}

type TabId = 'general' | 'findings'

const TABS: { id: TabId; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'findings', label: 'Examination Findings' },
]
const ic = MODAL_FIELD_CLASS
const lc = MODAL_LABEL_CLASS

// Clinical system fields definition
const SYSTEMS = [
  {
    fieldname: 'skin_',
    label: 'Skin, Hair, Nail, Gait, Surface, Abnormalities',
    placeholder: 'Document findings related to skin, hair, nails, gait, surface and any abnormalities…',
    icon: '🩺',
    color: 'border-amber-200 bg-amber-50',
    headerColor: 'text-amber-700',
  },
  {
    fieldname: 'cvsresp',
    label: 'CVS / RESP',
    placeholder: 'Document cardiovascular and respiratory examination findings…',
    icon: '❤️',
    color: 'border-red-200 bg-red-50',
    headerColor: 'text-red-700',
  },
  {
    fieldname: 'cnc',
    label: 'CNC: Include Abnormal Involuntary Movements (AIMS)',
    placeholder: 'Document central nervous system findings including AIMS assessment…',
    icon: '🧠',
    color: 'border-purple-200 bg-purple-50',
    headerColor: 'text-purple-700',
  },
  {
    fieldname: 'git',
    label: 'GIT',
    placeholder: 'Document gastrointestinal tract examination findings…',
    icon: '🫃',
    color: 'border-green-200 bg-green-50',
    headerColor: 'text-green-700',
  },
  {
    fieldname: 'others',
    label: 'Others',
    placeholder: 'Any additional examination findings not covered above…',
    icon: '📋',
    color: 'border-slate-200 bg-slate-50',
    headerColor: 'text-slate-600',
  },
] as const

// ─── Modal ────────────────────────────────────────────────────────────────────

export const PhysicalExaminationModal = ({
  admissionNo = '',
  patient = '',
  patientName = '',
  onClose,
  onSuccess,
}: PhysicalExaminationModalProps) => {
  // Get context from CareContextProvider
  const { mode, activeVisit, activeAdmission, selectedPatient: contextPatient } = useCareContext()
  
  const [activeTab, setActiveTab] = useState<TabId>('general')
  const [submitting, setSubmitting] = useState(false)

  // Determine if we're in IP or OP mode based on context
  const isIPMode = mode === 'IP'
  const isOPMode = mode === 'OP'
  
  // Determine the active admission/visit from context
  const activeAdmissionFromContext = activeAdmission || admissionNo
  const activeVisitFromContext = activeVisit
  
  // General form fields
  const [inpatientAdmission, setInpatientAdmission] = useState(activeAdmissionFromContext || '')
  const [patientVisit, setPatientVisit] = useState(activeVisitFromContext || '')
  const [patientVisitLabel, setPatientVisitLabel] = useState('')
  const [patientField, setPatientField] = useState(patient || contextPatient || '')
  const [patientNameField, setPatientNameField] = useState(patientName || '')
  
  // Lock fields based on context
  const isPatientLocked = Boolean(patient) || Boolean(contextPatient)
  const hasAdmissionContext = Boolean(activeAdmissionFromContext || admissionNo || inpatientAdmission)
  const hasVisitContext = Boolean(activeVisitFromContext || patientVisit)
  const hidePatientVisit = isIPMode || (isOPMode && hasVisitContext)
  const hideInpatientAdmission =
    (isOPMode && hasVisitContext) || (isIPMode && hasAdmissionContext && isPatientLocked)
  const hidePatientField = isPatientLocked
  const hidePatientName = isPatientLocked

  useEffect(() => {
    if (!isPatientLocked || patientNameField || patientName) return
    const patientId = patient || contextPatient
    if (!patientId) return
    let cancelled = false
    fetchPatientOptions(patientId)
      .then((opts) => {
        if (cancelled) return
        const match = opts.find((o) => o.name === patientId)
        if (match?.label) setPatientNameField(match.label)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [isPatientLocked, patient, contextPatient, patientName, patientNameField])

  useEffect(() => {
    if (hidePatientVisit) setPatientVisit('')
  }, [hidePatientVisit])

  // Findings
  const [skin, setSkin] = useState('')
  const [cvsresp, setCvsresp] = useState('')
  const [cnc, setCnc] = useState('')
  const [git, setGit] = useState('')
  const [others, setOthers] = useState('')

  const findingsValues: Record<string, string> = { skin_: skin, cvsresp, cnc, git, others }
  const findingsSetters: Record<string, (v: string) => void> = {
    skin_: setSkin, cvsresp: setCvsresp, cnc: setCnc, git: setGit, others: setOthers,
  }

  const findingsFilledCount = [skin, cvsresp, cnc, git, others].filter(v => v.trim().length > 0).length

  // Fetch functions
  const fetchVisits = useCallback(
    (search: string) => fetchPatientVisits(patientField, search || undefined),
    [patientField]
  )

  const fetchPatientOpts = useCallback((s: string) => fetchPatientOptions(s || undefined), [])
  
  const fetchAdmissionOpts = useCallback(
    (s: string) => fetchInpatientAdmissionOptions(s || undefined, patientField || undefined),
    [patientField]
  )

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); e.stopPropagation()
    setSubmitting(true)
    try {
      const payload = {
        inpatient_admission: inpatientAdmission || undefined,
        patient_visit: patientVisit || undefined,
        patient: patientField || undefined,
        patient_name: patientNameField || undefined,
        skin_: skin || undefined,
        cvsresp: cvsresp || undefined,
        cnc: cnc || undefined,
        git: git || undefined,
        others: others || undefined,
      }
      await apiRequest('/api/resource/Physical%20Examination', {
        method: 'POST',
        body: JSON.stringify({ data: payload }),
      })
      toast.success('Physical Examination saved successfully.')
      onSuccess?.()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save record.')
    } finally {
      setSubmitting(false)
    }
  }

  const currentTabIdx = TABS.findIndex(t => t.id === activeTab)

  const contextSubtitle = [
    patientNameField || patientName,
    isIPMode && inpatientAdmission ? `IP admission ${inpatientAdmission}` : null,
    isOPMode && (patientVisitLabel || patientVisit) ? `OP visit ${patientVisitLabel || patientVisit}` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div
      className={CREATE_MODAL_OVERLAY}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className={createModalShellClass('max-w-2xl w-full max-h-[92vh]')}
        onClick={(e) => e.stopPropagation()}
      >
        <CreateModalHeader
          title="Physical Examination"
          icon={<Stethoscope className="h-5 w-5 text-emerald-700" strokeWidth={2} />}
          subtitle={contextSubtitle || 'Document examination findings by body system'}
          onClose={onClose}
        >
          <div className={`${CREATE_MODAL_TAB_BAR} -mb-px mt-3`}>
            {TABS.map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={createModalTabButtonClass(activeTab === tab.id)}
              >
                {tab.label}
                {tab.id === 'findings' && findingsFilledCount > 0 ? (
                  <span className="ml-1.5 inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">
                    {findingsFilledCount}/5
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </CreateModalHeader>

        <form onSubmit={handleSubmit} noValidate className={`${CREATE_MODAL_BODY_GRADIENT} flex min-h-0 flex-1 flex-col`}>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="space-y-5 px-5 py-5 sm:px-6 sm:py-6">

            {/* ── Tab 1: General ── */}
            {activeTab === 'general' && (
              <div className="space-y-5">
                <section className={MODAL_SECTION_CLASS}>
                  <h3 className={MODAL_SECTION_TITLE_CLASS}>
                    <ClipboardList className="h-4 w-4 text-emerald-600" strokeWidth={2} />
                    Patient & visit
                    {isIPMode ? (
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-800">
                        IP
                      </span>
                    ) : null}
                    {isOPMode ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
                        OP
                      </span>
                    ) : null}
                  </h3>
                  {hidePatientField && hidePatientName && hidePatientVisit && hideInpatientAdmission ? (
                    <p className="text-sm leading-relaxed text-slate-600">
                      Patient and care episode are set from your current selection. Continue to document
                      examination findings.
                    </p>
                  ) : (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {/* Inpatient Admission - hidden in OP when visit is set; read-only in IP mode */}
                    {!hideInpatientAdmission && (
                      isIPMode && hasAdmissionContext ? (
                        <div>
                          <label className={lc}>Inpatient Admission *</label>
                          <input
                            type="text"
                            value={inpatientAdmission}
                            readOnly
                            className={`${ic} bg-slate-100 cursor-not-allowed`}
                          />
                          <p className="text-xs text-slate-400 mt-1">Auto-selected from IP context</p>
                        </div>
                      ) : (
                        <LinkCombobox
                          label="Inpatient Admission"
                          value={inpatientAdmission}
                          onSelect={opt => setInpatientAdmission(opt.name)}
                          onClear={() => setInpatientAdmission('')}
                          fetchOptions={fetchAdmissionOpts}
                          placeholder="Search admissions..."
                          disabled={isOPMode}
                        />
                      )
                    )}

                    {/* Patient Visit - hidden in IP or when OP visit is already selected */}
                    {!hidePatientVisit && (
                      isOPMode && hasVisitContext ? (
                        <div>
                          <label className={lc}>Patient Visit *</label>
                          <input
                            type="text"
                            value={patientVisitLabel || patientVisit}
                            readOnly
                            className={`${ic} bg-slate-100 cursor-not-allowed`}
                          />
                          <p className="text-xs text-slate-400 mt-1">Auto-selected from OP context</p>
                        </div>
                      ) : (
                        <LinkCombobox
                          label="Patient Visit"
                          value={patientVisitLabel}
                          onSelect={opt => { setPatientVisit(opt.name); setPatientVisitLabel(opt.label) }}
                          onClear={() => { setPatientVisit(''); setPatientVisitLabel('') }}
                          fetchOptions={fetchVisits}
                          placeholder="Search patient visits..."
                        />
                      )
                    )}

                    {/* Patient - hidden when already selected in care context */}
                    {!hidePatientField && (
                      <LinkCombobox
                        label="Patient"
                        value={patientNameField || patientField}
                        onSelect={opt => { setPatientField(opt.name); setPatientNameField(opt.label) }}
                        onClear={() => { setPatientField(''); setPatientNameField('') }}
                        fetchOptions={fetchPatientOpts}
                        placeholder="Search patients..."
                      />
                    )}

                    {!hidePatientName && (
                      <div>
                        <label className={lc}>Patient Name</label>
                        <input
                          type="text"
                          value={patientNameField}
                          readOnly
                          className={`${ic} bg-slate-100 cursor-not-allowed`}
                        />
                      </div>
                    )}
                  </div>
                  )}
                </section>
              </div>
            )}

            {/* ── Tab 2: Examination Findings ── */}
            {activeTab === 'findings' && (
              <div className="space-y-4">
                <div className="flex items-start gap-2.5 rounded-xl border border-emerald-100/90 bg-white/80 px-4 py-3 shadow-sm ring-1 ring-emerald-50">
                  <Stethoscope className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" strokeWidth={2} />
                  <p className="text-sm leading-relaxed text-slate-600">
                    Document findings for each body system. All fields are optional; complete as thoroughly as
                    clinically appropriate.
                  </p>
                </div>

                {SYSTEMS.map(sys => (
                  <section
                    key={sys.fieldname}
                    className={`${MODAL_SECTION_CLASS} border-l-4 ${sys.color}`}
                  >
                    <div className="mb-3 flex items-center gap-2">
                      <span className="text-lg leading-none" aria-hidden>
                        {sys.icon}
                      </span>
                      <label className={`flex-1 text-xs font-bold uppercase tracking-wide ${sys.headerColor}`}>
                        {sys.label}
                      </label>
                      {findingsValues[sys.fieldname]?.trim().length > 0 ? (
                        <span
                          className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white shadow-sm"
                          aria-label="Completed"
                        >
                          <Check className="h-3 w-3" strokeWidth={3} />
                        </span>
                      ) : null}
                    </div>
                    <textarea
                      value={findingsValues[sys.fieldname]}
                      onChange={e => findingsSetters[sys.fieldname](e.target.value)}
                      rows={4}
                      placeholder={sys.placeholder}
                      className={MODAL_TEXTAREA_CLASS}
                    />
                  </section>
                ))}
              </div>
            )}

            </div>
          </div>

          <CreateModalFooter
            hint={
              <div className="flex items-center gap-2">
                {TABS.map((tab, i) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`h-2 w-2 rounded-full transition-colors ${
                      activeTab === tab.id ? 'bg-emerald-600' : 'bg-slate-300 hover:bg-emerald-300'
                    }`}
                    aria-label={`${i + 1}. ${tab.label}`}
                  />
                ))}
              </div>
            }
          >
            {currentTabIdx > 0 ? (
              <button
                type="button"
                onClick={() => setActiveTab(TABS[currentTabIdx - 1].id)}
                className={CM_BTN_CANCEL}
              >
                ← Previous
              </button>
            ) : null}
            {currentTabIdx < TABS.length - 1 ? (
              <button
                type="button"
                onClick={() => setActiveTab(TABS[currentTabIdx + 1].id)}
                className={CM_BTN_PRIMARY}
              >
                Next →
              </button>
            ) : null}
            <button type="button" onClick={onClose} className={CM_BTN_CANCEL}>
              Cancel
            </button>
            <button type="submit" disabled={submitting} className={CM_BTN_PRIMARY}>
              {submitting ? 'Saving…' : 'Save examination'}
            </button>
          </CreateModalFooter>
        </form>
      </div>
    </div>
  )
}
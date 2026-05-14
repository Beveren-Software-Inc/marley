// import { useState, useEffect } from 'react'
// import { createSickLeave, type CreateSickLeaveInput } from '../../services/sickLeave'
// import {
//   fetchHealthcarePractitioners,
//   fetchInpatientAdmissions,
//   fetchLeadSources,
//   type LinkFieldOption,
// } from '../../services/common'
// import { searchPatients, fetchPatients, type PatientListItem } from '../../services/patients'

// interface CreateSickLeaveModalProps {
//   onClose: () => void
//   onSuccess: () => void
//   patient?: string
// }

// export const CreateSickLeaveModal = ({ onClose, onSuccess, patient }: CreateSickLeaveModalProps) => {
//   const [saving, setSaving] = useState(false)
//   const [error, setError] = useState<string | null>(null)

//   // Form values
//   const [patientId, setPatientId] = useState(patient || '')
//   const [patientName, setPatientName] = useState('')
//   const [admissionNo, setAdmissionNo] = useState('')
//   const [fromDate, setFromDate] = useState(new Date().toISOString().split('T')[0])
//   const [toDate, setToDate] = useState('')
//   const [days, setDays] = useState('')
//   const [diagnosis, setDiagnosis] = useState('')
//   const [doctorId, setDoctorId] = useState('')
//   const [sourceId, setSourceId] = useState('')

//   // Patient dropdown
//   const [patientOptions, setPatientOptions] = useState<PatientListItem[]>([])
//   const [patientOpen, setPatientOpen] = useState(false)
//   const [patientQuery, setPatientQuery] = useState('')
//   const [patientLoading, setPatientLoading] = useState(false)

//   // Admission dropdown
//   const [admissionOptions, setAdmissionOptions] = useState<LinkFieldOption[]>([])
//   const [admissionOpen, setAdmissionOpen] = useState(false)
//   const [admissionQuery, setAdmissionQuery] = useState('')
//   const [selectedAdmission, setSelectedAdmission] = useState<LinkFieldOption | null>(null)

//   // Doctor dropdown
//   const [doctorOptions, setDoctorOptions] = useState<LinkFieldOption[]>([])
//   const [doctorOpen, setDoctorOpen] = useState(false)
//   const [doctorQuery, setDoctorQuery] = useState('')
//   const [selectedDoctor, setSelectedDoctor] = useState<LinkFieldOption | null>(null)

//   // Source dropdown
//   const [sourceOptions, setSourceOptions] = useState<LinkFieldOption[]>([])
//   const [sourceOpen, setSourceOpen] = useState(false)
//   const [sourceQuery, setSourceQuery] = useState('')
//   const [selectedSource, setSelectedSource] = useState<LinkFieldOption | null>(null)

//   // Load initial patient label
//   useEffect(() => {
//     if (patient) {
//       fetchPatients(1, 0, patient).then((res) => {
//         if (res.length > 0) setPatientQuery(res[0].patient_name)
//       }).catch(() => {})
//     }
//   }, [patient])

//   // Auto-calculate days when both dates are set
//   useEffect(() => {
//     if (fromDate && toDate) {
//       try {
//         const from = new Date(fromDate)
//         const to = new Date(toDate)
//         const diff = Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)) + 1
//         if (diff > 0) setDays(String(diff))
//       } catch { /* ignore */ }
//     }
//   }, [fromDate, toDate])

//   useEffect(() => {
//     if (!patientOpen) return
//     let cancelled = false
//     const run = async () => {
//       setPatientLoading(true)
//       try {
//         const res = patientQuery.trim() ? await searchPatients(patientQuery, 20) : await fetchPatients(20, 0)
//         if (!cancelled) setPatientOptions(res)
//       } catch { if (!cancelled) setPatientOptions([]) }
//       finally { if (!cancelled) setPatientLoading(false) }
//     }
//     const t = setTimeout(run, patientQuery.trim() ? 300 : 0)
//     return () => { cancelled = true; clearTimeout(t) }
//   }, [patientQuery, patientOpen])

//   useEffect(() => {
//     if (!admissionOpen) return
//     let cancelled = false
//     const run = async () => {
//       try {
//         const res = await fetchInpatientAdmissions(patientId || undefined, admissionQuery || undefined)
//         if (!cancelled) setAdmissionOptions(res)
//       } catch { if (!cancelled) setAdmissionOptions([]) }
//     }
//     const t = setTimeout(run, admissionQuery.trim() ? 300 : 0)
//     return () => { cancelled = true; clearTimeout(t) }
//   }, [admissionQuery, admissionOpen, patientId])

//   useEffect(() => {
//     if (!doctorOpen) return
//     let cancelled = false
//     const run = async () => {
//       try {
//         const res = await fetchHealthcarePractitioners(doctorQuery || undefined)
//         if (!cancelled) setDoctorOptions(res)
//       } catch { if (!cancelled) setDoctorOptions([]) }
//     }
//     const t = setTimeout(run, doctorQuery.trim() ? 300 : 0)
//     return () => { cancelled = true; clearTimeout(t) }
//   }, [doctorQuery, doctorOpen])

//   useEffect(() => {
//     if (!sourceOpen) return
//     let cancelled = false
//     const run = async () => {
//       try {
//         const res = await fetchLeadSources(sourceQuery || undefined)
//         if (!cancelled) setSourceOptions(res)
//       } catch { if (!cancelled) setSourceOptions([]) }
//     }
//     const t = setTimeout(run, sourceQuery.trim() ? 300 : 0)
//     return () => { cancelled = true; clearTimeout(t) }
//   }, [sourceQuery, sourceOpen])

//   const closeAllDropdowns = () => {
//     setPatientOpen(false)
//     setAdmissionOpen(false)
//     setDoctorOpen(false)
//     setSourceOpen(false)
//   }

//   const handleSubmit = async (e: React.FormEvent) => {
//     e.preventDefault()
//     if (!fromDate) { setError('From Date is required'); return }
//     setSaving(true)
//     setError(null)
//     try {
//       const payload: CreateSickLeaveInput = {
//         from_date: fromDate,
//         to_date: toDate || undefined,
//         days: days || undefined,
//         diagnosis: diagnosis || undefined,
//         doctor: doctorId || undefined,
//         source: sourceId || undefined,
//         admission_no: admissionNo || undefined,
//         patient: patientId || undefined,
//         patient_name: patientName || undefined,
//       }
//       const result = await createSickLeave(payload)
//       if (result.success) {
//         onSuccess()
//       } else {
//         setError(result.message || 'Failed to create sick leave')
//       }
//     } catch (e) {
//       setError(e instanceof Error ? e.message : 'Failed to create sick leave')
//     } finally {
//       setSaving(false)
//     }
//   }

//   // Reusable link-field dropdown block
//   const LinkField = ({
//     label,
//     required,
//     isOpen,
//     query,
//     selectedLabel,
//     options,
//     loading: fieldLoading,
//     onFocus,
//     onChange,
//     onSelect,
//     placeholder,
//   }: {
//     label: string
//     required?: boolean
//     isOpen: boolean
//     query: string
//     selectedLabel: string | null | undefined
//     options: LinkFieldOption[]
//     loading?: boolean
//     onFocus: () => void
//     onChange: (v: string) => void
//     onSelect: (o: LinkFieldOption) => void
//     placeholder: string
//   }) => (
//     <div>
//       <label className="block text-sm font-medium text-slate-700 mb-1">
//         {label} {required && <span className="text-red-500">*</span>}
//       </label>
//       <div className="relative">
//         <input
//           type="text"
//           value={isOpen ? query : (selectedLabel ?? query)}
//           onChange={(e) => { onChange(e.target.value); onFocus() }}
//           onFocus={onFocus}
//           placeholder={placeholder}
//           className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
//         />
//         {fieldLoading && <span className="absolute right-3 top-2.5 text-xs text-slate-400">Loading…</span>}
//         {isOpen && options.length > 0 && (
//           <div className="absolute z-10 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-60 overflow-y-auto top-full">
//             {options.map((o) => (
//               <button
//                 key={o.name}
//                 type="button"
//                 onClick={() => onSelect(o)}
//                 className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100"
//               >
//                 {o.label}
//               </button>
//             ))}
//           </div>
//         )}
//       </div>
//     </div>
//   )

//   return (
//     <div className={CREATE_MODAL_OVERLAY}>
//       <div className={createModalShellClass('max-w-2xl w-full max-h-[90vh] overflow-hidden')}>
//         {/* Header */}
//         <div className="relative shrink-0 border-b border-emerald-100/60 bg-gradient-to-r from-emerald-100 via-teal-50 to-sky-100 p-4 sm:px-5 flex-shrink-0">
//           <div className="flex items-center justify-between">
//             <h2 className="text-lg font-semibold tracking-tight text-emerald-950">New Sick Leave</h2>
//             <button type="button" onClick={onClose} className="shrink-0 rounded-lg p-2 text-emerald-800/70 transition hover:bg-emerald-200/50 hover:text-emerald-950">
//               <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
//                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
//               </svg>
//             </button>
//           </div>
//         </div>

//         {/* Body — min-height 500px so the form never feels cramped */}
//         <form
//           onSubmit={handleSubmit}
//           className="p-6 space-y-5 overflow-y-auto flex-1"
//           style={{ minHeight: '500px' }}
//           onClick={(e) => {
//             const target = e.target as HTMLElement
//             if (target.tagName !== 'INPUT' && !target.closest('.absolute')) closeAllDropdowns()
//           }}
//         >
//           {/* Patient & Admission */}
//           <div>
//             <h3 className="text-sm font-semibold text-slate-700 mb-3">Patient & Admission</h3>
//             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
//               {/* Patient */}
//               <div className="md:col-span-2">
//                 <label className="block text-sm font-medium text-slate-700 mb-1">Patient</label>
//                 <div className="relative">
//                   <input
//                     type="text"
//                     value={patientQuery}
//                     onChange={(e) => { setPatientQuery(e.target.value); setPatientOpen(true) }}
//                     onFocus={() => setPatientOpen(true)}
//                     placeholder="Search patient…"
//                     className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
//                   />
//                   {patientLoading && <span className="absolute right-3 top-2.5 text-xs text-slate-400">Loading…</span>}
//                   {patientOpen && patientOptions.length > 0 && (
//                     <div className="absolute z-10 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-60 overflow-y-auto top-full">
//                       {patientOptions.map((p) => (
//                         <button key={p.name} type="button"
//                           onClick={() => { setPatientId(p.name); setPatientQuery(p.patient_name); setPatientName(p.patient_name); setPatientOpen(false) }}
//                           className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100">
//                           <div className="font-medium">{p.patient_name}</div>
//                           {p.mobile && <div className="text-xs text-slate-500">{p.mobile}</div>}
//                         </button>
//                       ))}
//                     </div>
//                   )}
//                 </div>
//               </div>

//               {/* Admission No */}
//               <div className="md:col-span-2">
//                 <LinkField
//                   label="Admission No"
//                   isOpen={admissionOpen}
//                   query={admissionQuery}
//                   selectedLabel={selectedAdmission?.label}
//                   options={admissionOptions}
//                   onFocus={() => setAdmissionOpen(true)}
//                   onChange={(v) => { setAdmissionQuery(v); if (!v) { setAdmissionNo(''); setSelectedAdmission(null) } }}
//                   onSelect={(a) => { setAdmissionNo(a.name); setSelectedAdmission(a); setAdmissionQuery(a.label); setAdmissionOpen(false) }}
//                   placeholder="Search admission…"
//                 />
//               </div>
//             </div>
//           </div>

//           {/* Leave Period */}
//           <div>
//             <h3 className="text-sm font-semibold text-slate-700 mb-3">Leave Period</h3>
//             <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
//               <div>
//                 <label className="block text-sm font-medium text-slate-700 mb-1">
//                   From Date <span className="text-red-500">*</span>
//                 </label>
//                 <input
//                   type="date"
//                   value={fromDate}
//                   onChange={(e) => setFromDate(e.target.value)}
//                   className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
//                 />
//               </div>
//               <div>
//                 <label className="block text-sm font-medium text-slate-700 mb-1">To Date</label>
//                 <input
//                   type="date"
//                   value={toDate}
//                   onChange={(e) => setToDate(e.target.value)}
//                   className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
//                 />
//               </div>
//               <div>
//                 <label className="block text-sm font-medium text-slate-700 mb-1">Days</label>
//                 <input
//                   type="text"
//                   value={days}
//                   onChange={(e) => setDays(e.target.value)}
//                   placeholder="Auto-calculated"
//                   className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
//                 />
//               </div>
//             </div>
//           </div>

//           {/* Clinical Details */}
//           <div>
//             <h3 className="text-sm font-semibold text-slate-700 mb-3">Clinical Details</h3>
//             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
//               {/* Doctor */}
//               <LinkField
//                 label="Doctor"
//                 isOpen={doctorOpen}
//                 query={doctorQuery}
//                 selectedLabel={selectedDoctor?.label}
//                 options={doctorOptions}
//                 onFocus={() => setDoctorOpen(true)}
//                 onChange={(v) => { setDoctorQuery(v); if (!v) { setDoctorId(''); setSelectedDoctor(null) } }}
//                 onSelect={(d) => { setDoctorId(d.name); setSelectedDoctor(d); setDoctorQuery(d.label); setDoctorOpen(false) }}
//                 placeholder="Search doctor…"
//               />

//               {/* Source */}
//               <LinkField
//                 label="Source"
//                 isOpen={sourceOpen}
//                 query={sourceQuery}
//                 selectedLabel={selectedSource?.label}
//                 options={sourceOptions}
//                 onFocus={() => setSourceOpen(true)}
//                 onChange={(v) => { setSourceQuery(v); if (!v) { setSourceId(''); setSelectedSource(null) } }}
//                 onSelect={(s) => { setSourceId(s.name); setSelectedSource(s); setSourceQuery(s.label); setSourceOpen(false) }}
//                 placeholder="Search source…"
//               />

//               {/* Diagnosis */}
//               <div className="md:col-span-2">
//                 <label className="block text-sm font-medium text-slate-700 mb-1">Diagnosis</label>
//                 <textarea
//                   value={diagnosis}
//                   onChange={(e) => setDiagnosis(e.target.value)}
//                   rows={4}
//                   placeholder="Enter diagnosis details…"
//                   className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
//                 />
//               </div>
//             </div>
//           </div>

//           {error && (
//             <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">{error}</div>
//           )}

//           <div className="flex justify-end gap-3 pt-2">
//             <button
//               type="button"
//               onClick={onClose}
//               className={CM_BTN_CANCEL}
//             >
//               Cancel
//             </button>
//             <button
//               type="submit"
//               disabled={saving}
//               className={CM_BTN_PRIMARY}
//             >
//               {saving ? 'Saving…' : 'Save Sick Leave'}
//             </button>
//           </div>
//         </form>
//       </div>
//     </div>
//   )
// }

import { useState, useEffect } from 'react'
import {
  CM_BTN_CANCEL,
  CM_BTN_PRIMARY,
  CREATE_MODAL_OVERLAY,
  createModalShellClass,
} from '../ui/CreateModalChrome'
import { createSickLeave, type CreateSickLeaveInput } from '../../services/sickLeave'
import {
  fetchHealthcarePractitioners,
  fetchInpatientAdmissions,
  fetchPatientVisits,
  fetchLeadSources,
  getCurrentUserPractitioner,
  type LinkFieldOption,
} from '../../services/common'
import { searchPatients, fetchPatients, type PatientListItem } from '../../services/patients'
import { useCareContext } from '../../providers/CareContextProvider'

interface CreateSickLeaveModalProps {
  onClose: () => void
  onSuccess: () => void
  patient?: string
}

export const CreateSickLeaveModal = ({ onClose, onSuccess, patient }: CreateSickLeaveModalProps) => {
  // Get context from CareContextProvider
  const { mode, activeVisit, activeAdmission, selectedPatient: contextPatient } = useCareContext()
  
  // Determine if we're in IP or OP mode based on context
  const isIPMode = mode === 'IP'
  const isOPMode = mode === 'OP'
  
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Form values
  const [patientId, setPatientId] = useState(patient || contextPatient || '')
  const [patientName, setPatientName] = useState('')
  const [admissionNo, setAdmissionNo] = useState(() => {
    if (isIPMode && activeAdmission) return activeAdmission
    return ''
  })
  const [patientVisitNo, setPatientVisitNo] = useState(() => {
    if (isOPMode && activeVisit) return activeVisit
    return ''
  })
  const [fromDate, setFromDate] = useState(new Date().toISOString().split('T')[0])
  const [toDate, setToDate] = useState('')
  const [days, setDays] = useState('')
  const [diagnosis, setDiagnosis] = useState('')
  const [doctorId, setDoctorId] = useState('')
  const [sourceId, setSourceId] = useState('')

  // Patient dropdown
  const [patientOptions, setPatientOptions] = useState<PatientListItem[]>([])
  const [patientOpen, setPatientOpen] = useState(false)
  const [patientQuery, setPatientQuery] = useState('')
  const [patientLoading, setPatientLoading] = useState(false)

  // Admission dropdown (IP mode)
  const [admissionOptions, setAdmissionOptions] = useState<LinkFieldOption[]>([])
  const [admissionOpen, setAdmissionOpen] = useState(false)
  const [admissionQuery, setAdmissionQuery] = useState('')
  const [selectedAdmission, setSelectedAdmission] = useState<LinkFieldOption | null>(null)

  // Visit dropdown (OP mode)
  const [visitOptions, setVisitOptions] = useState<LinkFieldOption[]>([])
  const [visitOpen, setVisitOpen] = useState(false)
  const [visitQuery, setVisitQuery] = useState('')
  const [selectedVisit, setSelectedVisit] = useState<LinkFieldOption | null>(null)

  // Doctor dropdown
  const [doctorOptions, setDoctorOptions] = useState<LinkFieldOption[]>([])
  const [doctorOpen, setDoctorOpen] = useState(false)
  const [doctorQuery, setDoctorQuery] = useState('')
  const [selectedDoctor, setSelectedDoctor] = useState<LinkFieldOption | null>(null)

  // Source dropdown
  const [sourceOptions, setSourceOptions] = useState<LinkFieldOption[]>([])
  const [sourceOpen, setSourceOpen] = useState(false)
  const [sourceQuery, setSourceQuery] = useState('')
  const [selectedSource, setSelectedSource] = useState<LinkFieldOption | null>(null)

  // Load initial patient label
  useEffect(() => {
    const patientToLoad = patient || contextPatient
    if (patientToLoad) {
      fetchPatients(1, 0, patientToLoad).then((res) => {
        if (res.length > 0) setPatientQuery(res[0].patient_name)
      }).catch(() => {})
    }
  }, [patient, contextPatient])

  // Auto-load admission/visit label if context exists
  useEffect(() => {
    if (isIPMode && activeAdmission && patientId) {
      const loadAdmissionLabel = async () => {
        try {
          const admissions = await fetchInpatientAdmissions(patientId, activeAdmission)
          const matched = admissions.find(a => a.name === activeAdmission)
          if (matched) {
            setSelectedAdmission(matched)
            setAdmissionQuery(matched.label)
          }
        } catch (err) {
          console.error('Failed to load admission label:', err)
        }
      }
      loadAdmissionLabel()
    } else if (isOPMode && activeVisit && patientId) {
      const loadVisitLabel = async () => {
        try {
          const visits = await fetchPatientVisits(patientId, activeVisit)
          const matched = visits.find(v => v.name === activeVisit)
          if (matched) {
            setSelectedVisit(matched)
            setVisitQuery(matched.label)
          }
        } catch (err) {
          console.error('Failed to load visit label:', err)
        }
      }
      loadVisitLabel()
    }
  }, [isIPMode, isOPMode, activeAdmission, activeVisit, patientId])

  // Auto-calculate days when both dates are set
  useEffect(() => {
    if (fromDate && toDate) {
      try {
        const from = new Date(fromDate)
        const to = new Date(toDate)
        const diff = Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)) + 1
        if (diff > 0) setDays(String(diff))
      } catch { /* ignore */ }
    }
  }, [fromDate, toDate])

  useEffect(() => {
    if (!patientOpen) return
    let cancelled = false
    const run = async () => {
      setPatientLoading(true)
      try {
        const res = patientQuery.trim() ? await searchPatients(patientQuery, 20) : await fetchPatients(20, 0)
        if (!cancelled) setPatientOptions(res)
      } catch { if (!cancelled) setPatientOptions([]) }
      finally { if (!cancelled) setPatientLoading(false) }
    }
    const t = setTimeout(run, patientQuery.trim() ? 300 : 0)
    return () => { cancelled = true; clearTimeout(t) }
  }, [patientQuery, patientOpen])

  // Fetch admissions on open / query change (IP mode)
  useEffect(() => {
    if (!isIPMode) return
    if (!admissionOpen) return
    let cancelled = false
    const run = async () => {
      try {
        const res = await fetchInpatientAdmissions(patientId || undefined, admissionQuery || undefined)
        if (!cancelled) setAdmissionOptions(res)
      } catch { if (!cancelled) setAdmissionOptions([]) }
    }
    const t = setTimeout(run, admissionQuery.trim() ? 300 : 0)
    return () => { cancelled = true; clearTimeout(t) }
  }, [admissionQuery, admissionOpen, patientId, isIPMode])

  // Fetch visits on open / query change (OP mode)
  useEffect(() => {
    if (!isOPMode) return
    if (!visitOpen) return
    let cancelled = false
    const run = async () => {
      try {
        const res = await fetchPatientVisits(patientId || undefined, visitQuery || undefined)
        if (!cancelled) setVisitOptions(res)
      } catch { if (!cancelled) setVisitOptions([]) }
    }
    const t = setTimeout(run, visitQuery.trim() ? 300 : 0)
    return () => { cancelled = true; clearTimeout(t) }
  }, [visitQuery, visitOpen, patientId, isOPMode])

  useEffect(() => {
    if (!doctorOpen) return
    let cancelled = false
    const run = async () => {
      try {
        const res = await fetchHealthcarePractitioners(doctorQuery || undefined)
        if (!cancelled) setDoctorOptions(res)
      } catch { if (!cancelled) setDoctorOptions([]) }
    }
    const t = setTimeout(run, doctorQuery.trim() ? 300 : 0)
    return () => { cancelled = true; clearTimeout(t) }
  }, [doctorQuery, doctorOpen])

  // Auto-fill current user's practitioner
  useEffect(() => {
    getCurrentUserPractitioner().then(pract => {
      if (pract && !doctorId) setDoctorId(pract)
    })
  }, [])

  useEffect(() => {
    if (!sourceOpen) return
    let cancelled = false
    const run = async () => {
      try {
        const res = await fetchLeadSources(sourceQuery || undefined)
        if (!cancelled) setSourceOptions(res)
      } catch { if (!cancelled) setSourceOptions([]) }
    }
    const t = setTimeout(run, sourceQuery.trim() ? 300 : 0)
    return () => { cancelled = true; clearTimeout(t) }
  }, [sourceQuery, sourceOpen])

  const closeAllDropdowns = () => {
    setPatientOpen(false)
    setAdmissionOpen(false)
    setVisitOpen(false)
    setDoctorOpen(false)
    setSourceOpen(false)
  }

  // Get mode-specific help text
  const getModeHelpText = () => {
    if (isIPMode) {
      return `Creating sick leave for IP admission: ${admissionNo || 'not selected yet'}`
    }
    if (isOPMode) {
      return `Creating sick leave for OP visit: ${patientVisitNo || 'not selected yet'}`
    }
    return 'Select either IP or OP mode from the context switcher above'
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!fromDate) { setError('From Date is required'); return }
    if (!patientId) { setError('Patient is required'); return }
    
    // Validate based on mode
    if (isIPMode && !admissionNo) {
      setError('Please select an inpatient admission (IP mode active)')
      return
    }
    if (isOPMode && !patientVisitNo) {
      setError('Please select a patient visit (OP mode active)')
      return
    }
    
    setSaving(true)
    setError(null)
    try {
      const payload: CreateSickLeaveInput = {
        from_date: fromDate,
        to_date: toDate || undefined,
        days: days || undefined,
        diagnosis: diagnosis || undefined,
        doctor: doctorId || undefined,
        source: sourceId || undefined,
        admission_no: admissionNo || undefined,
        patient_visit: patientVisitNo || undefined,
        patient: patientId || undefined,
        patient_name: patientName || undefined,
      }
      const result = await createSickLeave(payload)
      if (result.success) {
        onSuccess()
      } else {
        setError(result.message || 'Failed to create sick leave')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create sick leave')
    } finally {
      setSaving(false)
    }
  }

  // Reusable link-field dropdown block
  const LinkField = ({
    label,
    required,
    isOpen,
    query,
    selectedLabel,
    options,
    loading: fieldLoading,
    onFocus,
    onChange,
    onSelect,
    placeholder,
    disabled,
  }: {
    label: string
    required?: boolean
    isOpen: boolean
    query: string
    selectedLabel: string | null | undefined
    options: LinkFieldOption[]
    loading?: boolean
    onFocus: () => void
    onChange: (v: string) => void
    onSelect: (o: LinkFieldOption) => void
    placeholder: string
    disabled?: boolean
  }) => (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <div className="relative">
        <input
          type="text"
          value={isOpen ? query : (selectedLabel ?? query)}
          onChange={(e) => { onChange(e.target.value); onFocus() }}
          onFocus={onFocus}
          placeholder={placeholder}
          disabled={disabled}
          className={`w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary ${disabled ? 'bg-slate-100 cursor-not-allowed' : ''}`}
        />
        {fieldLoading && <span className="absolute right-3 top-2.5 text-xs text-slate-400">Loading…</span>}
        {isOpen && !disabled && options.length > 0 && (
          <div className="absolute z-10 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-60 overflow-y-auto top-full">
            {options.map((o) => (
              <button
                key={o.name}
                type="button"
                onClick={() => onSelect(o)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100"
              >
                {o.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )

  return (
    <div className={CREATE_MODAL_OVERLAY}>
      <div className={createModalShellClass('max-w-2xl w-full max-h-[90vh] overflow-hidden')}>
        {/* Header */}
        <div className="relative shrink-0 border-b border-emerald-100/60 bg-gradient-to-r from-emerald-100 via-teal-50 to-sky-100 p-4 sm:px-5 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-emerald-950">New Sick Leave</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {isIPMode && <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-[10px] font-medium mr-2">IP Mode Active</span>}
                {isOPMode && <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-[10px] font-medium mr-2">OP Mode Active</span>}
                {getModeHelpText()}
              </p>
            </div>
            <button type="button" onClick={onClose} className="shrink-0 rounded-lg p-2 text-emerald-800/70 transition hover:bg-emerald-200/50 hover:text-emerald-950">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body — min-height 500px so the form never feels cramped */}
        <form
          onSubmit={handleSubmit}
          className="p-6 space-y-5 overflow-y-auto flex-1"
          style={{ minHeight: '500px' }}
          onClick={(e) => {
            const target = e.target as HTMLElement
            if (target.tagName !== 'INPUT' && !target.closest('.absolute')) closeAllDropdowns()
          }}
        >
          {/* Mode indicator box */}
          <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
            <p className="text-xs font-semibold text-primary mb-1">
              {isIPMode ? '🏥 Creating Sick Leave for Inpatient' : isOPMode ? '👤 Creating Sick Leave for Outpatient' : '📋 Select Context'}
            </p>
            <p className="text-xs text-slate-600">
              {isIPMode 
                ? `The sick leave will be linked to the selected inpatient admission. Make sure you have an admission selected below.`
                : isOPMode
                ? `The sick leave will be linked to the selected outpatient visit. Make sure you have a visit selected below.`
                : 'Please select either IP or OP mode from the top navbar before creating a sick leave.'
              }
            </p>
          </div>

          {/* Patient & Admission */}
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Patient & Admission</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Patient */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Patient <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={patientQuery}
                    onChange={(e) => { setPatientQuery(e.target.value); setPatientOpen(true) }}
                    onFocus={() => setPatientOpen(true)}
                    placeholder="Search patient…"
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    disabled={Boolean(contextPatient)}
                  />
                  {contextPatient && (
                    <p className="text-xs text-slate-400 mt-1 absolute -bottom-5 left-0">Patient auto-selected from context</p>
                  )}
                  {patientLoading && <span className="absolute right-3 top-2.5 text-xs text-slate-400">Loading…</span>}
                  {patientOpen && !contextPatient && patientOptions.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-60 overflow-y-auto top-full">
                      {patientOptions.map((p) => (
                        <button key={p.name} type="button"
                          onClick={() => { setPatientId(p.name); setPatientQuery(p.patient_name); setPatientName(p.patient_name); setPatientOpen(false) }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100">
                          <div className="font-medium">{p.patient_name}</div>
                          {p.mobile && <div className="text-xs text-slate-500">{p.mobile}</div>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Admission No (IP mode) */}
              {isIPMode && (
                <div className="md:col-span-2">
                  <LinkField
                    label="Admission No"
                    required
                    isOpen={admissionOpen}
                    query={admissionQuery}
                    selectedLabel={selectedAdmission?.label}
                    options={admissionOptions}
                    onFocus={() => setAdmissionOpen(true)}
                    onChange={(v) => { setAdmissionQuery(v); if (!v) { setAdmissionNo(''); setSelectedAdmission(null) } }}
                    onSelect={(a) => { setAdmissionNo(a.name); setSelectedAdmission(a); setAdmissionQuery(a.label); setAdmissionOpen(false) }}
                    placeholder="Search admission…"
                    disabled={!!activeAdmission}
                  />
                  {activeAdmission && (
                    <p className="text-xs text-slate-400 mt-1">Auto-selected from IP context</p>
                  )}
                </div>
              )}

              {/* Patient Visit (OP mode) */}
              {isOPMode && (
                <div className="md:col-span-2">
                  <LinkField
                    label="Patient Visit"
                    required
                    isOpen={visitOpen}
                    query={visitQuery}
                    selectedLabel={selectedVisit?.label}
                    options={visitOptions}
                    onFocus={() => setVisitOpen(true)}
                    onChange={(v) => { setVisitQuery(v); if (!v) { setPatientVisitNo(''); setSelectedVisit(null) } }}
                    onSelect={(v) => { setPatientVisitNo(v.name); setSelectedVisit(v); setVisitQuery(v.label); setVisitOpen(false) }}
                    placeholder="Search visit…"
                    disabled={!!activeVisit}
                  />
                  {activeVisit && (
                    <p className="text-xs text-slate-400 mt-1">Auto-selected from OP context</p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Leave Period */}
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Leave Period</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  From Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">To Date</label>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Days</label>
                <input
                  type="text"
                  value={days}
                  onChange={(e) => setDays(e.target.value)}
                  placeholder="Auto-calculated"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>
          </div>

          {/* Clinical Details */}
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Clinical Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Doctor */}
              <LinkField
                label="Doctor"
                isOpen={doctorOpen}
                query={doctorQuery}
                selectedLabel={selectedDoctor?.label}
                options={doctorOptions}
                onFocus={() => setDoctorOpen(true)}
                onChange={(v) => { setDoctorQuery(v); if (!v) { setDoctorId(''); setSelectedDoctor(null) } }}
                onSelect={(d) => { setDoctorId(d.name); setSelectedDoctor(d); setDoctorQuery(d.label); setDoctorOpen(false) }}
                placeholder="Search doctor…"
              />

              {/* Source */}
              <LinkField
                label="Source"
                isOpen={sourceOpen}
                query={sourceQuery}
                selectedLabel={selectedSource?.label}
                options={sourceOptions}
                onFocus={() => setSourceOpen(true)}
                onChange={(v) => { setSourceQuery(v); if (!v) { setSourceId(''); setSelectedSource(null) } }}
                onSelect={(s) => { setSourceId(s.name); setSelectedSource(s); setSourceQuery(s.label); setSourceOpen(false) }}
                placeholder="Search source…"
              />

              {/* Diagnosis */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">Diagnosis</label>
                <textarea
                  value={diagnosis}
                  onChange={(e) => setDiagnosis(e.target.value)}
                  rows={4}
                  placeholder="Enter diagnosis details…"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                />
              </div>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">{error}</div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className={CM_BTN_CANCEL}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || (!isIPMode && !isOPMode) || (isIPMode && !admissionNo) || (isOPMode && !patientVisitNo)}
              className={CM_BTN_PRIMARY}
            >
              {saving ? 'Saving…' : 'Save Sick Leave'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
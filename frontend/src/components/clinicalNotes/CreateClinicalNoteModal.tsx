

// import { useState, useEffect } from 'react'
// import {
//   CM_BTN_CANCEL,
//   CM_BTN_PRIMARY,
//   CREATE_MODAL_OVERLAY,
//   createModalShellClass,
// } from '../ui/CreateModalChrome'
// import { createClinicalNote } from '../../services/clinicalNotes'
// import { searchPatients, fetchPatients, type PatientListItem } from '../../services/patients'
// import { fetchHealthcarePractitioners, fetchInpatientAdmissionOptions, fetchPatientVisits as fetchPatientVisitOptions, getCurrentUserPractitioner, type LinkFieldOption } from '../../services/common'
// import {
//   linkComboboxDropdownClassTall,
//   linkComboboxInputClass,
//   linkComboboxInputWithClearClass,
//   linkComboboxOptionClass,
// } from '../ui/linkComboboxStyles'
// import { toast } from '../../hooks/useToast'
// import { CreatePractitionerModal } from '../practitioners/CreatePractitionerModal'
// import { useCareContext } from '../../providers/CareContextProvider'

// interface CreateClinicalNoteModalProps {
//   onClose: () => void
//   onSuccess?: () => void
//   initialPatient?: string
//   defaultClinicalNoteType?: string
//   defaultNoteType?: string
//   title?: string
//   defaultAdmission?: string
//   defaultVisit?: string
// }

// export const CreateClinicalNoteModal = ({
//   onClose,
//   onSuccess,
//   initialPatient,
//   defaultClinicalNoteType,
//   defaultNoteType,
//   title = 'Create Clinical Note',
//   defaultAdmission,
//   defaultVisit,
// }: CreateClinicalNoteModalProps) => {
//   // Get context from CareContextProvider
//   const { mode, activeVisit, activeAdmission, selectedPatient: contextPatient } = useCareContext()
  
//   // Determine if we're in IP or OP mode based on context
//   const isIPMode = mode === 'IP'
//   const isOPMode = mode === 'OP'
  
//   const [formData, setFormData] = useState({
//     patient: initialPatient || contextPatient || '',
//     practitioner: '',
//     posting_date: new Date().toISOString().slice(0, 16),
//     note: '',
//     admission_no: (isIPMode && activeAdmission) ? activeAdmission : (defaultAdmission || ''),
//     patient_visit: (isOPMode && activeVisit) ? activeVisit : (defaultVisit || ''),
//   })
//   const [loading, setLoading] = useState(false)
//   const [error, setError] = useState<string | null>(null)
//   const [showCreatePractitioner, setShowCreatePractitioner] = useState(false)

//   const [patientOptions, setPatientOptions] = useState<PatientListItem[]>([])
//   const [patientOpen, setPatientOpen] = useState(false)
//   const [patientQuery, setPatientQuery] = useState(initialPatient || contextPatient || '')
//   const [patientLoading, setPatientLoading] = useState(false)

//   const [practitionerOptions, setPractitionerOptions] = useState<LinkFieldOption[]>([])
//   const [practitionerOpen, setPractitionerOpen] = useState(false)
//   const [practitionerQuery, setPractitionerQuery] = useState('')

//   // Admission and Visit options
//   const [admissionOptions, setAdmissionOptions] = useState<{ name: string; label: string }[]>([])
//   const [visitOptions, setVisitOptions] = useState<{ name: string; label: string }[]>([])
  

//   // Load admissions and visits when patient changes
//   useEffect(() => {
//     if (formData.patient) {
//       // Load inpatient admissions
//       fetchInpatientAdmissionOptions(undefined, formData.patient)
//         .then(setAdmissionOptions)
//         .catch(() => setAdmissionOptions([]))
      
//       // Load patient visits
//       fetchPatientVisitOptions(formData.patient)
//         .then(setVisitOptions)
//         .catch(() => setVisitOptions([]))
//     } else {
//       setAdmissionOptions([])
//       setVisitOptions([])
//     }
//   }, [formData.patient])

//   // Auto-fetch patient name if context patient exists
//   useEffect(() => {
//     if (contextPatient && !initialPatient) {
//       const loadPatientName = async () => {
//         try {
//           const patients = await fetchPatients(1, 0, contextPatient)
//           if (patients.length > 0) {
//             setPatientQuery(patients[0].patient_name)
//           }
//         } catch (err) {
//           console.error('Failed to load patient name:', err)
//         }
//       }
//       loadPatientName()
//     }
//   }, [contextPatient, initialPatient])

//   const handleSubmit = async (e: React.FormEvent) => {
//     e.preventDefault()

//     if (!formData.patient) {
//       setError('Patient is required')
//       return
//     }
//     if (!formData.note.trim()) {
//       setError('Note is required')
//       return
//     }

//     // Validate based on global mode
//     if (isIPMode && !formData.admission_no) {
//       setError('Please select an inpatient admission (IP mode active)')
//       return
//     }
//     if (isOPMode && !formData.patient_visit) {
//       setError('Please select a patient visit (OP mode active)')
//       return
//     }

//     try {
//       setLoading(true)
//       setError(null)

//       const payload: any = {
//         patient: formData.patient,
//         note: formData.note,
//         clinical_note_type: defaultClinicalNoteType,
//         note_type: defaultNoteType,
//         practitioner: formData.practitioner || undefined,
//         posting_date: formData.posting_date || undefined,
//       }

//       // Add the appropriate care context based on global mode
//       if (isIPMode && formData.admission_no) {
//         payload.admission_no = formData.admission_no
//       } else if (isOPMode && formData.patient_visit) {
//         payload.patient_visit = formData.patient_visit
//       }

//       await createClinicalNote(payload)

//       toast.success('Clinical note created successfully')
//       if (onSuccess) onSuccess()
//       onClose()
//     } catch (err) {
//       const message = err instanceof Error ? err.message : 'Failed to create clinical note'
//       setError(message)
//       toast.error(message)
//     } finally {
//       setLoading(false)
//     }
//   }

//   const handleChange = (field: string, value: string) => {
//     setFormData(prev => ({ ...prev, [field]: value }))
//   }

//   // Load initial patient label
//   useEffect(() => {
//     if (initialPatient || contextPatient) {
//       const patientToLoad = initialPatient || contextPatient
//       const loadInitialPatient = async () => {
//         try {
//           const patients = await fetchPatients(1, 0, patientToLoad)
//           if (patients.length > 0) {
//             setPatientQuery(patients[0].patient_name)
//           }
//         } catch (err) {
//           console.error('Failed to load initial patient:', err)
//         }
//       }
//       loadInitialPatient()
//     }
//   }, [initialPatient, contextPatient])

//   // Load practitioners
//   useEffect(() => {
//     const loadPractitioners = async () => {
//       try {
//         const results = await fetchHealthcarePractitioners()
//         setPractitionerOptions(results)
//       } catch (err) {
//         console.error('Failed to load practitioners:', err)
//       }
//     }
//     loadPractitioners()
//   }, [])

//   // Auto-populate current user's practitioner
//   useEffect(() => {
//     const autoPopulatePractitioner = async () => {
//       try {
//         const practitioner = await getCurrentUserPractitioner()
//         if (practitioner) {
//           setFormData(prev => ({ ...prev, practitioner }))
//           // Also set the query for display
//           const practitionerOption = practitionerOptions.find(p => p.name === practitioner)
//           if (practitionerOption) {
//             setPractitionerQuery(practitionerOption.label)
//           }
//         }
//       } catch (err) {
//         console.error('Failed to auto-populate practitioner:', err)
//       }
//     }
//     autoPopulatePractitioner()
//   }, [practitionerOptions])

//   // Search patients
//   useEffect(() => {
//     if (!patientOpen) return

//     const timeoutId = setTimeout(async () => {
//       try {
//         setPatientLoading(true)
//         let results: PatientListItem[] = []
//         if (patientQuery.trim() === '') {
//           results = await fetchPatients(20, 0)
//         } else {
//           results = await searchPatients(patientQuery, 20)
//         }
//         setPatientOptions(results)
//       } catch (err) {
//         console.error('Failed to search patients:', err)
//         setPatientOptions([])
//       } finally {
//         setPatientLoading(false)
//       }
//     }, patientQuery.trim() === '' ? 0 : 300)

//     return () => clearTimeout(timeoutId)
//   }, [patientQuery, patientOpen])

//   const handlePatientSelect = (patient: PatientListItem) => {
//     setFormData(prev => ({ ...prev, patient: patient.name }))
//     setPatientQuery(patient.patient_name)
//     setPatientOpen(false)
//     // Reset admission/visit selections when patient changes
//     setFormData(prev => ({ ...prev, admission_no: '', patient_visit: '' }))
//   }

//   const handlePractitionerSelect = (pract: LinkFieldOption) => {
//     setFormData(prev => ({ ...prev, practitioner: pract.name }))
//     setPractitionerQuery(pract.label)
//     setPractitionerOpen(false)
//   }

//   // Get mode-specific help text
//   const getModeHelpText = () => {
//     if (isIPMode) {
//       return `Creating clinical note for IP admission: ${formData.admission_no || 'not selected yet'}`
//     }
//     if (isOPMode) {
//       return `Creating clinical note for OP visit: ${formData.patient_visit || 'not selected yet'}`
//     }
//     return 'Select either IP or OP mode from the context switcher above'
//   }

//   return (
//     <div className={CREATE_MODAL_OVERLAY}>
//       <div className={createModalShellClass('max-w-xl w-full max-h-[90vh]')}>
//         <div className="p-6 border-b border-slate-200 bg-white z-10 shrink-0">
//           <div className="flex items-center justify-between">
//             <div>
//               <h2 className="text-lg font-semibold tracking-tight text-emerald-950">{title}</h2>
//               <p className="text-xs text-slate-500 mt-0.5">
//                 {isIPMode && <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-[10px] font-medium mr-2">IP Mode Active</span>}
//                 {isOPMode && <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-[10px] font-medium mr-2">OP Mode Active</span>}
//                 {getModeHelpText()}
//               </p>
//             </div>
//             <button
//               onClick={onClose}
//               className="shrink-0 rounded-lg p-2 text-emerald-800/70 transition hover:bg-emerald-200/50 hover:text-emerald-950"
//             >
//               <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
//                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
//               </svg>
//             </button>
//           </div>
//         </div>

//         <form
//           onSubmit={handleSubmit}
//           className="flex flex-col flex-1 min-h-0"
//           onClick={e => {
//             const target = e.target as HTMLElement
//             if (target.tagName !== 'INPUT' && !target.closest('.absolute')) {
//               setPatientOpen(false)
//               setPractitionerOpen(false)
//             }
//           }}
//         >
//           {/* Scrollable body */}
//           <div className="p-6 space-y-4 overflow-y-auto flex-1">
//             {error && (
//               <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">
//                 {error}
//               </div>
//             )}

//             <div className="space-y-4">
//               {/* Mode indicator box */}
//               <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
//                 <p className="text-xs font-semibold text-primary mb-1">
//                   {isIPMode ? '🏥 Creating Inpatient Clinical Note' : isOPMode ? '👤 Creating Outpatient Clinical Note' : '📋 Select Context'}
//                 </p>
//                 <p className="text-xs text-slate-600">
//                   {isIPMode
//                     ? `The clinical note will be linked to the selected inpatient admission. Make sure you have an admission selected below.`
//                     : isOPMode
//                     ? `The clinical note will be linked to the selected outpatient visit. Make sure you have a visit selected below.`
//                     : 'Please select either IP or OP mode from the top navbar before creating a clinical note.'
//                   }
//                 </p>
//               </div>

//               <div>
//                 <label className="block text-sm font-medium text-slate-700 mb-1">
//                   Patient <span className="text-red-500">*</span>
//                 </label>
//                 <div className="relative">
//                   <input
//                     type="text"
//                     value={patientQuery}
//                     onChange={e => {
//                       setPatientQuery(e.target.value)
//                       setPatientOpen(true)
//                     }}
//                     onFocus={() => setPatientOpen(true)}
//                     placeholder="Search patient..."
//                     className={linkComboboxInputClass}
//                     disabled={Boolean(contextPatient)}
//                   />
//                   {contextPatient && (
//                     <p className="text-xs text-slate-400 mt-1">Patient auto-selected from context</p>
//                   )}
//                   {patientLoading && (
//                     <div className="absolute right-3 top-2.5 text-slate-400 text-xs">Loading...</div>
//                   )}
//                   {patientOpen && !contextPatient && patientOptions.length > 0 && (
//                     <div className={linkComboboxDropdownClassTall}>
//                       {patientOptions.map(p => (
//                         <button
//                           key={p.name}
//                           type="button"
//                           onClick={() => handlePatientSelect(p)}
//                           className={linkComboboxOptionClass}
//                         >
//                           <div className="font-medium">{p.patient_name}</div>
//                           {p.mobile && (
//                             <div className="text-xs text-slate-500">{p.mobile}</div>
//                           )}
//                         </button>
//                       ))}
//                     </div>
//                   )}
//                 </div>
//               </div>

//               {/* Care Context Selection */}
//               {formData.patient && (
//                 <div>
//                   <label className="block text-sm font-medium text-slate-700 mb-1">
//                     Care Context <span className="text-red-500">*</span>
//                   </label>
//                   <div className="flex gap-3 mb-3">
//                     <button
//                       type="button"
//                       disabled
//                       className={`px-3 py-1.5 text-sm rounded-md border transition-colors cursor-not-allowed ${
//                         isIPMode
//                           ? 'bg-primary text-white border-primary'
//                           : 'bg-slate-100 text-slate-400 border-slate-200'
//                       }`}
//                     >
//                       Inpatient Admission
//                     </button>
//                     <button
//                       type="button"
//                       disabled
//                       className={`px-3 py-1.5 text-sm rounded-md border transition-colors cursor-not-allowed ${
//                         isOPMode
//                           ? 'bg-primary text-white border-primary'
//                           : 'bg-slate-100 text-slate-400 border-slate-200'
//                       }`}
//                     >
//                       Patient Visit
//                     </button>
//                   </div>
//                   <p className="text-xs text-slate-500 -mt-2 mb-2">
//                     Context is determined by the IP/OP switcher in the navbar
//                   </p>
//                 </div>
//               )}

//               {/* Admission Selection - Only shown in IP mode */}
//               {isIPMode && formData.patient && (
//                 <div>
//                   <label className="block text-sm font-medium text-slate-700 mb-1">
//                     Inpatient Admission <span className="text-red-500">*</span>
//                   </label>
//                   {activeAdmission ? (
//                     <div>
//                       <input
//                         type="text"
//                         value={formData.admission_no}
//                         readOnly
//                         className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-slate-100 cursor-not-allowed"
//                       />
//                       <p className="text-xs text-slate-400 mt-1">Auto-selected from IP context</p>
//                     </div>
//                   ) : (
//                     <select
//                       value={formData.admission_no}
//                       onChange={(e) => handleChange('admission_no', e.target.value)}
//                       required
//                       className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
//                     >
//                       <option value="">— Select admission —</option>
//                       {admissionOptions.map((a) => (
//                         <option key={a.name} value={a.name}>{a.label}</option>
//                       ))}
//                     </select>
//                   )}
//                 </div>
//               )}

//               {/* Visit Selection - Only shown in OP mode */}
//               {isOPMode && formData.patient && (
//                 <div>
//                   <label className="block text-sm font-medium text-slate-700 mb-1">
//                     Patient Visit <span className="text-red-500">*</span>
//                   </label>
//                   {activeVisit ? (
//                     <div>
//                       <input
//                         type="text"
//                         value={formData.patient_visit}
//                         readOnly
//                         className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-slate-100 cursor-not-allowed"
//                       />
//                       <p className="text-xs text-slate-400 mt-1">Auto-selected from OP context</p>
//                     </div>
//                   ) : (
//                     <select
//                       value={formData.patient_visit}
//                       onChange={(e) => handleChange('patient_visit', e.target.value)}
//                       required
//                       className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
//                     >
//                       <option value="">— Select visit —</option>
//                       {visitOptions.map((v) => (
//                         <option key={v.name} value={v.name}>{v.label}</option>
//                       ))}
//                     </select>
//                   )}
//                 </div>
//               )}

//               <div>
//                 <label className="block text-sm font-medium text-slate-700 mb-1">
//                   Practitioner
//                 </label>
//                 <div className="relative flex items-center">
//                   <input
//                     type="text"
//                     value={practitionerQuery}
//                     onChange={e => {
//                       setPractitionerQuery(e.target.value)
//                       setPractitionerOpen(true)
//                     }}
//                     onFocus={() => setPractitionerOpen(true)}
//                     placeholder="Search practitioner..."
//                     className={linkComboboxInputWithClearClass}
//                   />
//                   <button
//                     type="button"
//                     onClick={(e) => {
//                       e.stopPropagation()
//                       setShowCreatePractitioner(true)
//                     }}
//                     className="absolute right-2 p-1 text-primary hover:text-primary/80 rounded"
//                     title="Create New Practitioner"
//                   >
//                     <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
//                       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
//                     </svg>
//                   </button>
//                   {practitionerOpen && practitionerOptions.length > 0 && (
//                     <div className={`${linkComboboxDropdownClassTall} top-full`}>
//                       {practitionerOptions.map(pr => (
//                         <button
//                           key={pr.name}
//                           type="button"
//                           onClick={() => handlePractitionerSelect(pr)}
//                           className={linkComboboxOptionClass}
//                         >
//                           {pr.label}
//                         </button>
//                       ))}
//                     </div>
//                   )}
//                 </div>
//               </div>

//               <div>
//                 <label className="block text-sm font-medium text-slate-700 mb-1">
//                   Posting Date
//                 </label>
//                 <input
//                   type="datetime-local"
//                   value={formData.posting_date}
//                   onChange={e => handleChange('posting_date', e.target.value)}
//                   className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
//                 />
//               </div>

//               <div>
//                 <label className="block text-sm font-medium text-slate-700 mb-1">
//                   Note <span className="text-red-500">*</span>
//                 </label>
//                 <textarea
//                   value={formData.note}
//                   onChange={e => handleChange('note', e.target.value)}
//                   rows={5}
//                   className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
//                   placeholder="Enter clinical note..."
//                 />
//               </div>
//             </div>
//           </div>

//           {/* Fixed footer - always visible */}
//           <div className="shrink-0 flex justify-end gap-3 px-6 py-4 border-t border-slate-200 bg-white">
//             <button
//               type="button"
//               onClick={onClose}
//               className={CM_BTN_CANCEL}
//             >
//               Cancel
//             </button>
//             <button
//               type="submit"
//               disabled={loading || (!isIPMode && !isOPMode) || (isIPMode && !formData.admission_no) || (isOPMode && !formData.patient_visit)}
//               className={CM_BTN_PRIMARY}
//             >
//               {loading ? 'Saving...' : 'Save Note'}
//             </button>
//           </div>
//         </form>
//       </div>

//       {showCreatePractitioner && (
//         <CreatePractitionerModal
//           onClose={() => setShowCreatePractitioner(false)}
//           onSuccess={(practitionerName) => {
//             setFormData({ ...formData, practitioner: practitionerName })
//             const newPract = practitionerOptions.find(p => p.name === practitionerName)
//             if (newPract) {
//               setPractitionerQuery(newPract.label)
//             } else {
//               fetchHealthcarePractitioners().then(setPractitionerOptions).catch(console.error)
//               setPractitionerQuery(practitionerName)
//             }
//             setPractitionerOpen(false)
//             setShowCreatePractitioner(false)
//           }}
//         />
//       )}
//     </div>
//   )
// }


import { useState, useEffect } from 'react'
import {
  CM_BTN_CANCEL,
  CM_BTN_PRIMARY,
  CREATE_MODAL_BODY_GRADIENT,
  CREATE_MODAL_OVERLAY,
  CreateModalFooter,
  CreateModalHeader,
  createModalShellClass,
} from '../ui/CreateModalChrome'
import { NotebookPen } from 'lucide-react'
import { createClinicalNote } from '../../services/clinicalNotes'
import { searchPatients, fetchPatients, type PatientListItem } from '../../services/patients'
import { fetchHealthcarePractitioners, fetchInpatientAdmissionOptions, fetchPatientVisits as fetchPatientVisitOptions, fetchCostCenters, getCurrentUserPractitioner, type LinkFieldOption } from '../../services/common'
import {
  linkComboboxDropdownClassTall,
  linkComboboxInputClass,
  linkComboboxInputWithClearClass,
  linkComboboxOptionClass,
} from '../ui/linkComboboxStyles'
import { toast } from '../../hooks/useToast'
import { CreatePractitionerModal } from '../practitioners/CreatePractitionerModal'
import { useCareContext } from '../../providers/CareContextProvider'

interface CreateClinicalNoteModalProps {
  onClose: () => void
  onSuccess?: () => void
  initialPatient?: string
  defaultClinicalNoteType?: string
  defaultNoteType?: string
  title?: string
  defaultAdmission?: string
  defaultVisit?: string
}

export const CreateClinicalNoteModal = ({
  onClose,
  onSuccess,
  initialPatient,
  defaultClinicalNoteType,
  defaultNoteType,
  title = 'Create Clinical Note',
  defaultAdmission,
  defaultVisit,
}: CreateClinicalNoteModalProps) => {
  // Get context from CareContextProvider
  const { mode, activeVisit, activeAdmission, selectedPatient: contextPatient, userCostCenter, costCenterCompany } = useCareContext()
  
  // Determine if we're in IP or OP mode based on context
  const isIPMode = mode === 'IP'
  const isOPMode = mode === 'OP'
  
  const [formData, setFormData] = useState({
    patient: initialPatient || contextPatient || '',
    practitioner: '',
    posting_date: new Date().toISOString().slice(0, 16),
    note: '',
    admission_no: (isIPMode && activeAdmission) ? activeAdmission : (defaultAdmission || ''),
    patient_visit: (isOPMode && activeVisit) ? activeVisit : (defaultVisit || ''),
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showCreatePractitioner, setShowCreatePractitioner] = useState(false)

  const [patientOptions, setPatientOptions] = useState<PatientListItem[]>([])
  const [patientOpen, setPatientOpen] = useState(false)
  const [patientQuery, setPatientQuery] = useState(initialPatient || contextPatient || '')
  const [patientLoading, setPatientLoading] = useState(false)

  const [practitionerOptions, setPractitionerOptions] = useState<LinkFieldOption[]>([])
  const [filteredPractitionerOptions, setFilteredPractitionerOptions] = useState<LinkFieldOption[]>([])
  const [practitionerOpen, setPractitionerOpen] = useState(false)
  const [practitionerQuery, setPractitionerQuery] = useState('')
  const [practitionerLoading, setPractitionerLoading] = useState(false)

  // Admission and Visit options
  const [admissionOptions, setAdmissionOptions] = useState<{ name: string; label: string }[]>([])
  const [visitOptions, setVisitOptions] = useState<{ name: string; label: string }[]>([])

  const [costCenterOptions, setCostCenterOptions] = useState<LinkFieldOption[]>([])
  const [costCenterOpen, setCostCenterOpen] = useState(false)
  const [costCenterQuery, setCostCenterQuery] = useState('')
  const [costCenter, setCostCenter] = useState(userCostCenter || '')

  // Load admissions and visits when patient changes
  useEffect(() => {
    if (formData.patient) {
      // Load inpatient admissions
      fetchInpatientAdmissionOptions(undefined, formData.patient)
        .then(setAdmissionOptions)
        .catch(() => setAdmissionOptions([]))
      
      // Load patient visits
      fetchPatientVisitOptions(formData.patient)
        .then(setVisitOptions)
        .catch(() => setVisitOptions([]))
    } else {
      setAdmissionOptions([])
      setVisitOptions([])
    }
  }, [formData.patient])

  // Auto-fetch patient name if context patient exists
  useEffect(() => {
    if (contextPatient && !initialPatient) {
      const loadPatientName = async () => {
        try {
          const patients = await fetchPatients(1, 0, contextPatient)
          if (patients.length > 0) {
            setPatientQuery(patients[0].patient_name)
          }
        } catch (err) {
          console.error('Failed to load patient name:', err)
        }
      }
      loadPatientName()
    }
  }, [contextPatient, initialPatient])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.patient) {
      setError('Patient is required')
      return
    }
    if (!formData.note.trim()) {
      setError('Note is required')
      return
    }

    // Validate based on global mode
    if (isIPMode && !formData.admission_no) {
      setError('Please select an inpatient admission (IP mode active)')
      return
    }
    if (isOPMode && !formData.patient_visit) {
      setError('Please select a patient visit (OP mode active)')
      return
    }

    try {
      setLoading(true)
      setError(null)

      const payload: any = {
        patient: formData.patient,
        note: formData.note,
        clinical_note_type: defaultClinicalNoteType,
        note_type: defaultNoteType,
        practitioner: formData.practitioner || undefined,
        posting_date: formData.posting_date || undefined,
        cost_center: costCenter || undefined,
      }

      // Add the appropriate care context based on global mode
      if (isIPMode && formData.admission_no) {
        payload.admission_no = formData.admission_no
      } else if (isOPMode && formData.patient_visit) {
        payload.patient_visit = formData.patient_visit
      }

      await createClinicalNote(payload)

      toast.success('Clinical note created successfully')
      if (onSuccess) onSuccess()
      onClose()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create clinical note'
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  // Load initial patient label
  useEffect(() => {
    if (initialPatient || contextPatient) {
      const patientToLoad = initialPatient || contextPatient
      const loadInitialPatient = async () => {
        try {
          const patients = await fetchPatients(1, 0, patientToLoad)
          if (patients.length > 0) {
            setPatientQuery(patients[0].patient_name)
          }
        } catch (err) {
          console.error('Failed to load initial patient:', err)
        }
      }
      loadInitialPatient()
    }
  }, [initialPatient, contextPatient])

  // Load practitioners
  useEffect(() => {
    const loadPractitioners = async () => {
      try {
        setPractitionerLoading(true)
        const results = await fetchHealthcarePractitioners()
        setPractitionerOptions(results)
        setFilteredPractitionerOptions(results) // Initialize filtered options with all practitioners
      } catch (err) {
        console.error('Failed to load practitioners:', err)
        setPractitionerOptions([])
        setFilteredPractitionerOptions([])
      } finally {
        setPractitionerLoading(false)
      }
    }
    loadPractitioners()
  }, [])

  // Filter practitioners based on search query
  useEffect(() => {
    if (!practitionerOpen) return

    const timeoutId = setTimeout(() => {
      if (!practitionerQuery.trim()) {
        // If query is empty, show all practitioners
        setFilteredPractitionerOptions(practitionerOptions)
      } else {
        // Filter practitioners by label (case-insensitive)
        const filtered = practitionerOptions.filter(pract => 
          pract.label.toLowerCase().includes(practitionerQuery.toLowerCase())
        )
        setFilteredPractitionerOptions(filtered)
      }
    }, 300) // Debounce to avoid filtering on every keystroke

    return () => clearTimeout(timeoutId)
  }, [practitionerQuery, practitionerOpen, practitionerOptions])

  // Auto-populate current user's linked practitioner (independent of the dropdown list limit)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const practitionerId = await getCurrentUserPractitioner()
        if (!practitionerId || cancelled) return
        setFormData((prev) =>
          prev.practitioner ? prev : { ...prev, practitioner: practitionerId },
        )
        try {
          const options = await fetchHealthcarePractitioners(practitionerId)
          if (cancelled) return
          const match = options.find((p) => p.name === practitionerId)
          setPractitionerQuery(match?.label || practitionerId)
        } catch {
          if (!cancelled) setPractitionerQuery(practitionerId)
        }
      } catch (err) {
        console.error('Failed to auto-populate practitioner:', err)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Search patients
  useEffect(() => {
    if (!patientOpen) return

    const timeoutId = setTimeout(async () => {
      try {
        setPatientLoading(true)
        let results: PatientListItem[] = []
        if (patientQuery.trim() === '') {
          results = await fetchPatients(20, 0)
        } else {
          results = await searchPatients(patientQuery, 20)
        }
        setPatientOptions(results)
      } catch (err) {
        console.error('Failed to search patients:', err)
        setPatientOptions([])
      } finally {
        setPatientLoading(false)
      }
    }, patientQuery.trim() === '' ? 0 : 300)

    return () => clearTimeout(timeoutId)
  }, [patientQuery, patientOpen])

  useEffect(() => {
    if (!isOPMode || !formData.patient || visitOptions.length === 0) return
    setFormData((prev) => {
      const hasVisit = (id: string) => visitOptions.some((v) => v.name === id)
      let next = prev.patient_visit
      if (activeVisit && hasVisit(activeVisit)) next = activeVisit
      else if (defaultVisit && hasVisit(defaultVisit)) next = defaultVisit
      else if (prev.patient_visit && hasVisit(prev.patient_visit)) next = prev.patient_visit
      else next = visitOptions[0]?.name || ''
      return next === prev.patient_visit ? prev : { ...prev, patient_visit: next }
    })
  }, [isOPMode, formData.patient, activeVisit, defaultVisit, visitOptions])

  useEffect(() => {
    if (userCostCenter && !costCenter) {
      setCostCenter(userCostCenter)
      setCostCenterQuery(userCostCenter)
    }
  }, [userCostCenter, costCenter])

  useEffect(() => {
    const refDoctype = isIPMode ? 'Inpatient Admission' : isOPMode ? 'Patient Visit' : null
    const refName = isIPMode ? formData.admission_no : isOPMode ? formData.patient_visit : null
    if (!refDoctype || !refName) return

    fetch(`/api/resource/${refDoctype}/${encodeURIComponent(refName)}?fields=["cost_center"]`)
      .then((r) => r.json())
      .then((data) => {
        const cc = data?.data?.cost_center
        if (cc) {
          setCostCenter(cc)
          setCostCenterQuery(cc)
        }
      })
      .catch(() => {})
  }, [isIPMode, isOPMode, formData.admission_no, formData.patient_visit])

  useEffect(() => {
    if (!costCenterOpen) return
    fetchCostCenters(costCenterCompany, costCenterQuery || undefined)
      .then(setCostCenterOptions)
      .catch(() => setCostCenterOptions([]))
  }, [costCenterOpen, costCenterQuery, costCenterCompany])

  const handlePatientSelect = (patient: PatientListItem) => {
    setFormData((prev) => ({
      ...prev,
      patient: patient.name,
      admission_no: '',
      patient_visit: '',
    }))
    setPatientQuery(patient.patient_name)
    setPatientOpen(false)
  }

  const handlePractitionerSelect = (pract: LinkFieldOption) => {
    setFormData(prev => ({ ...prev, practitioner: pract.name }))
    setPractitionerQuery(pract.label)
    setPractitionerOpen(false)
  }

  // Get mode-specific help text
  const getModeHelpText = () => {
    if (isIPMode) {
      return `Creating clinical note for IP admission: ${formData.admission_no || 'not selected yet'}`
    }
    if (isOPMode) {
      return `Creating clinical note for OP visit: ${formData.patient_visit || 'not selected yet'}`
    }
    return 'Select either IP or OP mode from the context switcher above'
  }

  return (
    <div className={CREATE_MODAL_OVERLAY}>
      <div className={createModalShellClass('max-w-4xl w-full max-h-[94vh] min-h-[min(640px,92vh)]')}>
        <CreateModalHeader
          title={title}
          icon={<NotebookPen className="h-5 w-5 text-emerald-700" strokeWidth={2} />}
          subtitle={
            <>
              {isIPMode ? <span className="mr-2 inline-flex items-center gap-1 rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">IP Mode Active</span> : null}
              {isOPMode ? <span className="mr-2 inline-flex items-center gap-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">OP Mode Active</span> : null}
              {getModeHelpText()}
            </>
          }
          onClose={onClose}
        />

        <form
          onSubmit={handleSubmit}
          className={`${CREATE_MODAL_BODY_GRADIENT} flex flex-col flex-1 min-h-0`}
          onClick={e => {
            const target = e.target as HTMLElement
            if (target.tagName !== 'INPUT' && !target.closest('.absolute')) {
              setPatientOpen(false)
              setPractitionerOpen(false)
              setCostCenterOpen(false)
            }
          }}
        >
          {/* Scrollable body */}
          <div className="p-6 space-y-4 overflow-y-auto flex-1 min-h-[min(52vh,560px)]">
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Patient <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={patientQuery}
                    onChange={e => {
                      setPatientQuery(e.target.value)
                      setPatientOpen(true)
                    }}
                    onFocus={() => setPatientOpen(true)}
                    placeholder="Search patient..."
                    className={linkComboboxInputClass}
                    disabled={Boolean(contextPatient)}
                  />
                  {contextPatient && (
                    <p className="text-xs text-slate-400 mt-1">Patient auto-selected from context</p>
                  )}
                  {patientLoading && (
                    <div className="absolute right-3 top-2.5 text-slate-400 text-xs">Loading...</div>
                  )}
                  {patientOpen && !contextPatient && patientOptions.length > 0 && (
                    <div className={linkComboboxDropdownClassTall}>
                      {patientOptions.map(p => (
                        <button
                          key={p.name}
                          type="button"
                          onClick={() => handlePatientSelect(p)}
                          className={linkComboboxOptionClass}
                        >
                          <div className="font-medium">{p.patient_name}</div>
                          {p.mobile && (
                            <div className="text-xs text-slate-500">{p.mobile}</div>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Practitioner
                </label>
                <div className="relative flex items-center">
                  <input
                    type="text"
                    value={practitionerQuery}
                    onChange={e => {
                      setPractitionerQuery(e.target.value)
                      setPractitionerOpen(true)
                    }}
                    onFocus={() => setPractitionerOpen(true)}
                    placeholder="Search practitioner..."
                    className={linkComboboxInputWithClearClass}
                  />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setShowCreatePractitioner(true)
                    }}
                    className="absolute right-2 p-1 text-primary hover:text-primary/80 rounded"
                    title="Create New Practitioner"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </button>
                  {practitionerLoading && (
                    <div className="absolute right-8 top-2.5 text-slate-400 text-xs">Loading...</div>
                  )}
                  {practitionerOpen && !practitionerLoading && filteredPractitionerOptions.length > 0 && (
                    <div className={`${linkComboboxDropdownClassTall} top-full left-0`}>
                      {filteredPractitionerOptions.map(pr => (
                        <button
                          key={pr.name}
                          type="button"
                          onClick={() => handlePractitionerSelect(pr)}
                          className={linkComboboxOptionClass}
                        >
                          <div>
                            <div className="font-medium">{pr.label}</div>
                            <div className="text-xs text-slate-500">{pr.name}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  {practitionerOpen && !practitionerLoading && filteredPractitionerOptions.length === 0 && practitionerQuery && (
                    <div className={`${linkComboboxDropdownClassTall} top-full left-0`}>
                      <div className="px-4 py-2 text-sm text-slate-500">
                        No practitioners found matching "{practitionerQuery}"
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {isIPMode && formData.patient && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Inpatient Admission <span className="text-red-500">*</span>
                  </label>
                  {activeAdmission ? (
                    <div>
                      <input
                        type="text"
                        value={formData.admission_no}
                        readOnly
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-slate-100 cursor-not-allowed"
                      />
                      <p className="text-xs text-slate-400 mt-1">Auto-selected from IP context</p>
                    </div>
                  ) : (
                    <select
                      value={formData.admission_no}
                      onChange={(e) => handleChange('admission_no', e.target.value)}
                      required
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      <option value="">— Select admission —</option>
                      {admissionOptions.map((a) => (
                        <option key={a.name} value={a.name}>{a.label}</option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {isOPMode && formData.patient && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Patient Visit <span className="text-red-500">*</span>
                  </label>
                  {activeVisit ? (
                    <div>
                      <input
                        type="text"
                        value={formData.patient_visit}
                        readOnly
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-slate-100 cursor-not-allowed"
                      />
                      <p className="text-xs text-slate-400 mt-1">Auto-selected from OP context</p>
                    </div>
                  ) : (
                    <select
                      value={formData.patient_visit}
                      onChange={(e) => handleChange('patient_visit', e.target.value)}
                      required
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      <option value="">— Select visit —</option>
                      {visitOptions.map((v) => (
                        <option key={v.name} value={v.name}>{v.label}</option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Posting Date
                </label>
                <input
                  type="datetime-local"
                  value={formData.posting_date}
                  onChange={e => handleChange('posting_date', e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Branch
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={
                      costCenter
                        ? costCenterOptions.find((c) => c.name === costCenter)?.label || costCenterQuery || costCenter
                        : costCenterQuery
                    }
                    onChange={(e) => {
                      setCostCenterQuery(e.target.value)
                      setCostCenterOpen(true)
                      setCostCenter('')
                    }}
                    onFocus={() => setCostCenterOpen(true)}
                    placeholder="Search branch..."
                    className={linkComboboxInputClass}
                  />
                  {costCenterOpen && (
                    <div className={linkComboboxDropdownClassTall}>
                      {costCenterOptions.length > 0 ? (
                        costCenterOptions.map((cc) => (
                          <button
                            key={cc.name}
                            type="button"
                            onClick={() => {
                              setCostCenter(cc.name)
                              setCostCenterQuery(cc.label || cc.name)
                              setCostCenterOpen(false)
                            }}
                            className={linkComboboxOptionClass}
                          >
                            {cc.label || cc.name}
                          </button>
                        ))
                      ) : (
                        <div className="px-4 py-2 text-sm text-slate-500">No branches found</div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Note <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={formData.note}
                  onChange={e => handleChange('note', e.target.value)}
                  rows={20}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-primary min-h-[min(42vh,420px)] resize-y"
                  placeholder="Enter clinical note..."
                />
              </div>
            </div>
          </div>

          <CreateModalFooter>
            <button type="button" onClick={onClose} className={CM_BTN_CANCEL}>Cancel</button>
            <button
              type="submit"
              disabled={loading || (!isIPMode && !isOPMode) || (isIPMode && !formData.admission_no) || (isOPMode && !formData.patient_visit)}
              className={CM_BTN_PRIMARY}
            >
              {loading ? 'Saving...' : 'Save Note'}
            </button>
          </CreateModalFooter>
        </form>
      </div>

      {showCreatePractitioner && (
        <CreatePractitionerModal
          onClose={() => setShowCreatePractitioner(false)}
          onSuccess={(practitionerName) => {
            setFormData({ ...formData, practitioner: practitionerName })
            const newPract = practitionerOptions.find(p => p.name === practitionerName)
            if (newPract) {
              setPractitionerQuery(newPract.label)
            } else {
              // Refresh practitioner list
              fetchHealthcarePractitioners().then(results => {
                setPractitionerOptions(results)
                setFilteredPractitionerOptions(results)
              }).catch(console.error)
              setPractitionerQuery(practitionerName)
            }
            setPractitionerOpen(false)
            setShowCreatePractitioner(false)
          }}
        />
      )}
    </div>
  )
}
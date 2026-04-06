// import { useState, useEffect } from 'react'
// import { createClinicalNote } from '../../services/clinicalNotes'
// import { searchPatients, fetchPatients, type PatientListItem } from '../../services/patients'
// import { fetchHealthcarePractitioners, fetchInpatientAdmissionOptions, fetchPatientVisits as fetchPatientVisitOptions, type LinkFieldOption } from '../../services/common'
// import { toast } from '../../hooks/useToast'
// import { CreatePractitionerModal } from '../practitioners/CreatePractitionerModal'

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
//   const [formData, setFormData] = useState({
//     patient: initialPatient || '',
//     practitioner: '',
//     posting_date: new Date().toISOString().slice(0, 16),
//     note: '',
//     admission_no: defaultAdmission || '',
//     patient_visit: defaultVisit || '',
//   })
//   const [loading, setLoading] = useState(false)
//   const [error, setError] = useState<string | null>(null)
//   const [showCreatePractitioner, setShowCreatePractitioner] = useState(false)

//   const [patientOptions, setPatientOptions] = useState<PatientListItem[]>([])
//   const [patientOpen, setPatientOpen] = useState(false)
//   const [patientQuery, setPatientQuery] = useState(initialPatient || '')
//   const [patientLoading, setPatientLoading] = useState(false)

//   const [practitionerOptions, setPractitionerOptions] = useState<LinkFieldOption[]>([])
//   const [practitionerOpen, setPractitionerOpen] = useState(false)
//   const [practitionerQuery, setPractitionerQuery] = useState('')

//   // Admission and Visit options
//   const [admissionOptions, setAdmissionOptions] = useState<{ name: string; label: string }[]>([])
//   const [visitOptions, setVisitOptions] = useState<{ name: string; label: string }[]>([])
//   const [careContextType, setCareContextType] = useState<'admission' | 'visit'>('admission')

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

//     // Validate that either admission or visit is selected based on context
//     if (careContextType === 'admission' && !formData.admission_no) {
//       setError('Please select an inpatient admission')
//       return
//     }
//     if (careContextType === 'visit' && !formData.patient_visit) {
//       setError('Please select a patient visit')
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

//       // Add the appropriate care context
//       if (careContextType === 'admission' && formData.admission_no) {
//         payload.admission_no = formData.admission_no
//       } else if (careContextType === 'visit' && formData.patient_visit) {
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
//     if (initialPatient) {
//       const loadInitialPatient = async () => {
//         try {
//           const patients = await fetchPatients(1, 0, initialPatient)
//           if (patients.length > 0) {
//             setPatientQuery(patients[0].patient_name)
//           }
//         } catch (err) {
//           console.error('Failed to load initial patient:', err)
//         }
//       }
//       loadInitialPatient()
//     }
//   }, [initialPatient])

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

//   return (
//     <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
//       <div className="bg-white rounded-lg shadow-xl max-w-xl w-full mx-4 max-h-[90vh] overflow-y-auto">
//         <div className="p-6 border-b border-slate-200 sticky top-0 bg-white z-10">
//           <div className="flex items-center justify-between">
//             <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
//             <button
//               onClick={onClose}
//               className="text-slate-400 hover:text-slate-600"
//             >
//               <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
//                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
//               </svg>
//             </button>
//           </div>
//         </div>

//         <form
//           onSubmit={handleSubmit}
//           className="p-6 space-y-4"
//           onClick={e => {
//             const target = e.target as HTMLElement
//             if (target.tagName !== 'INPUT' && !target.closest('.absolute')) {
//               setPatientOpen(false)
//               setPractitionerOpen(false)
//             }
//           }}
//         >
//           {error && (
//             <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">
//               {error}
//             </div>
//           )}

//           <div className="space-y-4">
//             <div>
//               <label className="block text-sm font-medium text-slate-700 mb-1">
//                 Patient <span className="text-red-500">*</span>
//               </label>
//               <div className="relative">
//                 <input
//                   type="text"
//                   value={patientQuery}
//                   onChange={e => {
//                     setPatientQuery(e.target.value)
//                     setPatientOpen(true)
//                   }}
//                   onFocus={() => setPatientOpen(true)}
//                   placeholder="Search patient..."
//                   className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
//                 />
//                 {patientLoading && (
//                   <div className="absolute right-3 top-2.5 text-slate-400 text-xs">Loading...</div>
//                 )}
//                 {patientOpen && patientOptions.length > 0 && (
//                   <div className="absolute z-10 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
//                     {patientOptions.map(p => (
//                       <button
//                         key={p.name}
//                         type="button"
//                         onClick={() => handlePatientSelect(p)}
//                         className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 focus:bg-slate-100 focus:outline-none"
//                       >
//                         <div className="font-medium">{p.patient_name}</div>
//                         {p.mobile && (
//                           <div className="text-xs text-slate-500">{p.mobile}</div>
//                         )}
//                       </button>
//                     ))}
//                   </div>
//                 )}
//               </div>
//             </div>

//             {/* Care Context Selection */}
//             {formData.patient && (
//               <div>
//                 <label className="block text-sm font-medium text-slate-700 mb-1">
//                   Care Context <span className="text-red-500">*</span>
//                 </label>
//                 <div className="flex gap-3 mb-3">
//                   <button
//                     type="button"
//                     onClick={() => setCareContextType('admission')}
//                     className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
//                       careContextType === 'admission'
//                         ? 'bg-primary text-white border-primary'
//                         : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
//                     }`}
//                   >
//                     Inpatient Admission
//                   </button>
//                   <button
//                     type="button"
//                     onClick={() => setCareContextType('visit')}
//                     className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
//                       careContextType === 'visit'
//                         ? 'bg-primary text-white border-primary'
//                         : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
//                     }`}
//                   >
//                     Patient Visit
//                   </button>
//                 </div>
//               </div>
//             )}

//             {/* Admission Selection */}
//             {careContextType === 'admission' && formData.patient && (
//               <div>
//                 <label className="block text-sm font-medium text-slate-700 mb-1">
//                   Inpatient Admission <span className="text-red-500">*</span>
//                 </label>
//                 <select
//                   value={formData.admission_no}
//                   onChange={(e) => handleChange('admission_no', e.target.value)}
//                   required
//                   className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
//                 >
//                   <option value="">— Select admission —</option>
//                   {admissionOptions.map((a) => (
//                     <option key={a.name} value={a.name}>{a.label}</option>
//                   ))}
//                 </select>
//               </div>
//             )}

//             {/* Visit Selection */}
//             {careContextType === 'visit' && formData.patient && (
//               <div>
//                 <label className="block text-sm font-medium text-slate-700 mb-1">
//                   Patient Visit <span className="text-red-500">*</span>
//                 </label>
//                 <select
//                   value={formData.patient_visit}
//                   onChange={(e) => handleChange('patient_visit', e.target.value)}
//                   required
//                   className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
//                 >
//                   <option value="">— Select visit —</option>
//                   {visitOptions.map((v) => (
//                     <option key={v.name} value={v.name}>{v.label}</option>
//                   ))}
//                 </select>
//               </div>
//             )}

//             <div>
//               <label className="block text-sm font-medium text-slate-700 mb-1">
//                 Practitioner
//               </label>
//               <div className="relative flex items-center">
//                 <input
//                   type="text"
//                   value={practitionerQuery}
//                   onChange={e => {
//                     setPractitionerQuery(e.target.value)
//                     setPractitionerOpen(true)
//                   }}
//                   onFocus={() => setPractitionerOpen(true)}
//                   placeholder="Search practitioner..."
//                   className="w-full rounded-md border border-slate-300 px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
//                 />
//                 <button
//                   type="button"
//                   onClick={(e) => {
//                     e.stopPropagation()
//                     setShowCreatePractitioner(true)
//                   }}
//                   className="absolute right-2 p-1 text-primary hover:text-primary/80 rounded"
//                   title="Create New Practitioner"
//                 >
//                   <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
//                     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
//                   </svg>
//                 </button>
//                 {practitionerOpen && practitionerOptions.length > 0 && (
//                   <div className="absolute z-10 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-60 overflow-y-auto top-full">
//                     {practitionerOptions.map(pr => (
//                       <button
//                         key={pr.name}
//                         type="button"
//                         onClick={() => handlePractitionerSelect(pr)}
//                         className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 focus:bg-slate-100 focus:outline-none"
//                       >
//                         {pr.label}
//                       </button>
//                     ))}
//                   </div>
//                 )}
//               </div>
//             </div>

//             <div>
//               <label className="block text-sm font-medium text-slate-700 mb-1">
//                 Posting Date
//               </label>
//               <input
//                 type="datetime-local"
//                 value={formData.posting_date}
//                 onChange={e => handleChange('posting_date', e.target.value)}
//                 className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
//               />
//             </div>

//             <div>
//               <label className="block text-sm font-medium text-slate-700 mb-1">
//                 Note <span className="text-red-500">*</span>
//               </label>
//               <textarea
//                 value={formData.note}
//                 onChange={e => handleChange('note', e.target.value)}
//                 rows={5}
//                 className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
//                 placeholder="Enter clinical note..."
//               />
//             </div>
//           </div>

//           <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
//             <button
//               type="button"
//               onClick={onClose}
//               className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50"
//             >
//               Cancel
//             </button>
//             <button
//               type="submit"
//               disabled={loading}
//               className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50"
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
import { createClinicalNote } from '../../services/clinicalNotes'
import { searchPatients, fetchPatients, type PatientListItem } from '../../services/patients'
import { fetchHealthcarePractitioners, fetchInpatientAdmissionOptions, fetchPatientVisits as fetchPatientVisitOptions, type LinkFieldOption } from '../../services/common'
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
  const { mode, activeVisit, activeAdmission, selectedPatient: contextPatient } = useCareContext()
  
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
  const [practitionerOpen, setPractitionerOpen] = useState(false)
  const [practitionerQuery, setPractitionerQuery] = useState('')

  // Admission and Visit options
  const [admissionOptions, setAdmissionOptions] = useState<{ name: string; label: string }[]>([])
  const [visitOptions, setVisitOptions] = useState<{ name: string; label: string }[]>([])
  

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
        const results = await fetchHealthcarePractitioners()
        setPractitionerOptions(results)
      } catch (err) {
        console.error('Failed to load practitioners:', err)
      }
    }
    loadPractitioners()
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

  const handlePatientSelect = (patient: PatientListItem) => {
    setFormData(prev => ({ ...prev, patient: patient.name }))
    setPatientQuery(patient.patient_name)
    setPatientOpen(false)
    // Reset admission/visit selections when patient changes
    setFormData(prev => ({ ...prev, admission_no: '', patient_visit: '' }))
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-slate-200 sticky top-0 bg-white z-10">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {isIPMode && <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-[10px] font-medium mr-2">IP Mode Active</span>}
                {isOPMode && <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-[10px] font-medium mr-2">OP Mode Active</span>}
                {getModeHelpText()}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="p-6 space-y-4"
          onClick={e => {
            const target = e.target as HTMLElement
            if (target.tagName !== 'INPUT' && !target.closest('.absolute')) {
              setPatientOpen(false)
              setPractitionerOpen(false)
            }
          }}
        >
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="space-y-4">
            {/* Mode indicator box */}
            <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
              <p className="text-xs font-semibold text-primary mb-1">
                {isIPMode ? '🏥 Creating Inpatient Clinical Note' : isOPMode ? '👤 Creating Outpatient Clinical Note' : '📋 Select Context'}
              </p>
              <p className="text-xs text-slate-600">
                {isIPMode 
                  ? `The clinical note will be linked to the selected inpatient admission. Make sure you have an admission selected below.`
                  : isOPMode
                  ? `The clinical note will be linked to the selected outpatient visit. Make sure you have a visit selected below.`
                  : 'Please select either IP or OP mode from the top navbar before creating a clinical note.'
                }
              </p>
            </div>

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
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  disabled={Boolean(contextPatient)}
                />
                {contextPatient && (
                  <p className="text-xs text-slate-400 mt-1">Patient auto-selected from context</p>
                )}
                {patientLoading && (
                  <div className="absolute right-3 top-2.5 text-slate-400 text-xs">Loading...</div>
                )}
                {patientOpen && !contextPatient && patientOptions.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
                    {patientOptions.map(p => (
                      <button
                        key={p.name}
                        type="button"
                        onClick={() => handlePatientSelect(p)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 focus:bg-slate-100 focus:outline-none"
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

            {/* Care Context Selection - Now determined by global mode, not user-selectable */}
            {formData.patient && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Care Context <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-3 mb-3">
                  <button
                    type="button"
                    disabled
                    className={`px-3 py-1.5 text-sm rounded-md border transition-colors cursor-not-allowed ${
                      isIPMode
                        ? 'bg-primary text-white border-primary'
                        : 'bg-slate-100 text-slate-400 border-slate-200'
                    }`}
                  >
                    Inpatient Admission
                  </button>
                  <button
                    type="button"
                    disabled
                    className={`px-3 py-1.5 text-sm rounded-md border transition-colors cursor-not-allowed ${
                      isOPMode
                        ? 'bg-primary text-white border-primary'
                        : 'bg-slate-100 text-slate-400 border-slate-200'
                    }`}
                  >
                    Patient Visit
                  </button>
                </div>
                <p className="text-xs text-slate-500 -mt-2 mb-2">
                  Context is determined by the IP/OP switcher in the navbar
                </p>
              </div>
            )}

            {/* Admission Selection - Only shown in IP mode */}
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

            {/* Visit Selection - Only shown in OP mode */}
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
                  className="w-full rounded-md border border-slate-300 px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
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
                {practitionerOpen && practitionerOptions.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-60 overflow-y-auto top-full">
                    {practitionerOptions.map(pr => (
                      <button
                        key={pr.name}
                        type="button"
                        onClick={() => handlePractitionerSelect(pr)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 focus:bg-slate-100 focus:outline-none"
                      >
                        {pr.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

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
                Note <span className="text-red-500">*</span>
              </label>
              <textarea
                value={formData.note}
                onChange={e => handleChange('note', e.target.value)}
                rows={5}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="Enter clinical note..."
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || (!isIPMode && !isOPMode) || (isIPMode && !formData.admission_no) || (isOPMode && !formData.patient_visit)}
              className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? 'Saving...' : 'Save Note'}
            </button>
          </div>
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
              fetchHealthcarePractitioners().then(setPractitionerOptions).catch(console.error)
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
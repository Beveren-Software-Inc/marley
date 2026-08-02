// import { useEffect, useState } from 'react'
// import { createVitalSign } from '../../services/vitalSigns'
// import { searchPatients, fetchPatients, type PatientListItem } from '../../services/patients'
// import { fetchInpatientRecords, type InpatientRecord } from '../../services/inpatientRecords'
// import { toast } from '../../hooks/useToast'

// interface CreateVitalSignModalProps {
//   onClose: () => void
//   onSuccess?: () => void
//   initialPatient?: string
// }

// export const CreateVitalSignModal = ({
//   onClose,
//   onSuccess,
//   initialPatient,
// }: CreateVitalSignModalProps) => {
//   const [formData, setFormData] = useState({
//     patient: initialPatient || '',
//     signs_datetime: new Date().toISOString().slice(0, 16),
//     temperature: '',
//     pulse: '',
//     respiratory_rate: '',
//     bp_systolic: '',
//     bp_diastolic: '',
//     spo2: '',
//     height: '',
//     weight: '',
//     vital_signs_note: '',
//     remarks: '',
//     admission_no: '',
//   })
//   const [loading, setLoading] = useState(false)
//   const [error, setError] = useState<string | null>(null)

//   const [patientOptions, setPatientOptions] = useState<PatientListItem[]>([])
//   const [patientOpen, setPatientOpen] = useState(false)
//   const [patientQuery, setPatientQuery] = useState(initialPatient || '')
//   const [patientLoading, setPatientLoading] = useState(false)

//   const [admissionOptions, setAdmissionOptions] = useState<{ value: string; label: string }[]>([])
//   const [admissionOpen, setAdmissionOpen] = useState(false)
//   const [admissionQuery, setAdmissionQuery] = useState('')

//   const handleChange = (field: string, value: string) => {
//     setFormData(prev => ({ ...prev, [field]: value }))
//   }

//   const handleSubmit = async (e: React.FormEvent) => {
//     e.preventDefault()

//     if (!formData.patient) {
//       setError('Patient is required')
//       return
//     }

//     try {
//       setLoading(true)
//       setError(null)

//       const [datePart, timePartRaw] = formData.signs_datetime.split('T')
//       const timePart = timePartRaw ? `${timePartRaw}:00`.slice(0, 8) : undefined

//       await createVitalSign({
//         patient: formData.patient,
//         signs_date: datePart,
//         signs_time: timePart,
//         temperature: formData.temperature || undefined,
//         pulse: formData.pulse || undefined,
//         respiratory_rate: formData.respiratory_rate || undefined,
//         bp_systolic: formData.bp_systolic || undefined,
//         bp_diastolic: formData.bp_diastolic || undefined,
//         spo2: formData.spo2 ? Number(formData.spo2) : undefined,
//         height: formData.height ? Number(formData.height) : undefined,
//         weight: formData.weight ? Number(formData.weight) : undefined,
//         vital_signs_note: formData.vital_signs_note || undefined,
//         remarks: formData.remarks || undefined,
//         admission_no: formData.admission_no || undefined,
//       })

//       toast.success('Vital Signs record created successfully')
//       onSuccess?.()
//       onClose()
//     } catch (err) {
//       const msg = err instanceof Error ? err.message : 'Failed to create vital signs'
//       setError(msg)
//       toast.error(msg)
//     } finally {
//       setLoading(false)
//     }
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
//           console.error('Failed to load initial patient for vital signs:', err)
//         }
//       }
//       loadInitialPatient()
//     }
//   }, [initialPatient])

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
//         console.error('Failed to search patients for vital signs:', err)
//         setPatientOptions([])
//       } finally {
//         setPatientLoading(false)
//       }
//     }, patientQuery.trim() === '' ? 0 : 300)

//     return () => clearTimeout(timeoutId)
//   }, [patientQuery, patientOpen])

//   // Load admissions for selected patient
//   useEffect(() => {
//     if (!admissionOpen) return

//     const timeoutId = setTimeout(async () => {
//       try {
//         const records: InpatientRecord[] = await fetchInpatientRecords(
//           undefined,
//           admissionQuery || undefined,
//           formData.patient || undefined,
//           undefined,
//           undefined,
//           undefined
//         )
//         setAdmissionOptions(
//           records.slice(0, 30).map((r) => ({
//             value: r.name,
//             label: `${r.name} - ${r.patient_name || r.patient || ''}`,
//           }))
//         )
//       } catch (err) {
//         console.error('Failed to load admissions for vital signs:', err)
//         setAdmissionOptions([])
//       }
//     }, admissionQuery.trim() === '' ? 0 : 300)

//     return () => clearTimeout(timeoutId)
//   }, [admissionQuery, admissionOpen, formData.patient])

//   const handlePatientSelect = (patient: PatientListItem) => {
//     setFormData(prev => ({ ...prev, patient: patient.name }))
//     setPatientQuery(patient.patient_name)
//     setPatientOpen(false)
//   }

//   return (
//     <div className={CREATE_MODAL_OVERLAY}>
//       <div className={createModalShellClass('max-w-2xl w-full max-h-[90vh] overflow-y-auto')}>
//         <div className="p-4 border-b border-slate-200 flex items-center justify-between">
//           <h2 className="text-lg font-semibold tracking-tight text-emerald-950">Create Vital Signs</h2>
//           <button
//             onClick={onClose}
//             className="shrink-0 rounded-lg p-2 text-emerald-800/70 transition hover:bg-emerald-200/50 hover:text-emerald-950"
//           >
//             <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
//               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
//             </svg>
//           </button>
//         </div>
//         <form onSubmit={handleSubmit} className="p-4 space-y-4">
//           {error && (
//             <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">
//               {error}
//             </div>
//           )}

//           <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
//             <div className="md:col-span-2">
//               <label className="block text-sm font-medium text-slate-700 mb-1">
//                 Patient <span className="text-red-500">*</span>
//               </label>
//               <div className="relative">
//                 <input
//                   type="text"
//                   value={patientQuery}
//                   onChange={(e) => {
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
//                     {patientOptions.map((p) => (
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

//             <div>
//               <label className="block text-sm font-medium text-slate-700 mb-1">
//                 Date &amp; Time
//               </label>
//               <input
//                 type="datetime-local"
//                 value={formData.signs_datetime}
//                 onChange={(e) => handleChange('signs_datetime', e.target.value)}
//                 className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
//               />
//             </div>

//             <div>
//               <label className="block text-sm font-medium text-slate-700 mb-1">
//                 Admission No
//               </label>
//               <div className="relative">
//                 <input
//                   type="text"
//                   value={formData.admission_no || admissionQuery}
//                   onChange={(e) => {
//                     const value = e.target.value
//                     setAdmissionQuery(value)
//                     if (!value) {
//                       handleChange('admission_no', '')
//                     }
//                     setAdmissionOpen(true)
//                   }}
//                   onFocus={() => setAdmissionOpen(true)}
//                   placeholder={formData.patient ? 'Search admission for this patient...' : 'Select patient first'}
//                   className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-slate-100"
//                   disabled={!formData.patient}
//                 />
//                 {admissionOpen && admissionOptions.length > 0 && (
//                   <div className="absolute z-20 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
//                     {admissionOptions.map((opt) => (
//                       <button
//                         key={opt.value}
//                         type="button"
//                         onClick={() => {
//                           handleChange('admission_no', opt.value)
//                           setAdmissionQuery(opt.value)
//                           setAdmissionOpen(false)
//                         }}
//                         className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 focus:bg-slate-100 focus:outline-none"
//                       >
//                         <div className="font-medium text-slate-800">{opt.value}</div>
//                         {opt.label !== opt.value && (
//                           <div className="text-xs text-slate-500 truncate">{opt.label}</div>
//                         )}
//                       </button>
//                     ))}
//                   </div>
//                 )}
//               </div>
//             </div>

//             <div>
//               <label className="block text-sm font-medium text-slate-700 mb-1">
//                 Temperature
//               </label>
//               <input
//                 type="text"
//                 value={formData.temperature}
//                 onChange={(e) => handleChange('temperature', e.target.value)}
//                 className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
//                 placeholder="e.g. 37.0 °C"
//               />
//             </div>

//             <div>
//               <label className="block text-sm font-medium text-slate-700 mb-1">
//                 Pulse
//               </label>
//               <input
//                 type="text"
//                 value={formData.pulse}
//                 onChange={(e) => handleChange('pulse', e.target.value)}
//                 className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
//                 placeholder="beats per minute"
//               />
//             </div>

//             <div>
//               <label className="block text-sm font-medium text-slate-700 mb-1">
//                 Respiratory Rate
//               </label>
//               <input
//                 type="text"
//                 value={formData.respiratory_rate}
//                 onChange={(e) => handleChange('respiratory_rate', e.target.value)}
//                 className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
//                 placeholder="breaths per minute"
//               />
//             </div>

//             <div>
//               <label className="block text-sm font-medium text-slate-700 mb-1">
//                 BP Systolic
//               </label>
//               <input
//                 type="text"
//                 value={formData.bp_systolic}
//                 onChange={(e) => handleChange('bp_systolic', e.target.value)}
//                 className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
//                 placeholder="e.g. 120"
//               />
//             </div>

//             <div>
//               <label className="block text-sm font-medium text-slate-700 mb-1">
//                 BP Diastolic
//               </label>
//               <input
//                 type="text"
//                 value={formData.bp_diastolic}
//                 onChange={(e) => handleChange('bp_diastolic', e.target.value)}
//                 className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
//                 placeholder="e.g. 80"
//               />
//             </div>

//             <div>
//               <label className="block text-sm font-medium text-slate-700 mb-1">
//                 SPO2
//               </label>
//               <input
//                 type="number"
//                 value={formData.spo2}
//                 onChange={(e) => handleChange('spo2', e.target.value)}
//                 className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
//                 placeholder="%"
//                 min={0}
//                 max={100}
//               />
//             </div>

//             <div>
//               <label className="block text-sm font-medium text-slate-700 mb-1">
//                 Height (cm)
//               </label>
//               <input
//                 type="number"
//                 step="0.01"
//                 value={formData.height}
//                 onChange={(e) => handleChange('height', e.target.value)}
//                 className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
//               />
//             </div>

//             <div>
//               <label className="block text-sm font-medium text-slate-700 mb-1">
//                 Weight (kg)
//               </label>
//               <input
//                 type="number"
//                 step="0.1"
//                 value={formData.weight}
//                 onChange={(e) => handleChange('weight', e.target.value)}
//                 className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
//               />
//             </div>

//             <div className="md:col-span-2">
//               <label className="block text-sm font-medium text-slate-700 mb-1">
//                 Notes
//               </label>
//               <textarea
//                 value={formData.vital_signs_note}
//                 onChange={(e) => handleChange('vital_signs_note', e.target.value)}
//                 rows={3}
//                 className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
//                 placeholder="Clinical notes..."
//               />
//             </div>

//             <div className="md:col-span-2">
//               <label className="block text-sm font-medium text-slate-700 mb-1">
//                 Remarks
//               </label>
//               <textarea
//                 value={formData.remarks}
//                 onChange={(e) => handleChange('remarks', e.target.value)}
//                 rows={2}
//                 className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
//               />
//             </div>
//           </div>

//           <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
//             <button
//               type="button"
//               onClick={onClose}
//               className={CM_BTN_CANCEL}
//             >
//               Cancel
//             </button>
//             <button
//               type="submit"
//               disabled={loading}
//               className={CM_BTN_PRIMARY}
//             >
//               {loading ? 'Saving…' : 'Save'}
//             </button>
//           </div>
//         </form>
//       </div>
//     </div>
//   )
// }


import { useEffect, useState } from 'react'
import {
  CM_BTN_CANCEL,
  CM_BTN_PRIMARY,
  CREATE_MODAL_BODY_GRADIENT,
  CREATE_MODAL_OVERLAY,
  CreateModalFooter,
  CreateModalHeader,
  createModalShellClass,
} from '../ui/CreateModalChrome'
import { Activity } from 'lucide-react'
import { createVitalSign, updateVitalSign, type VitalSign } from '../../services/vitalSigns'
import { searchPatients, fetchPatients, type PatientListItem } from '../../services/patients'
import { fetchInpatientRecords } from '../../services/inpatientRecords'
import { fetchPatientVisits, type LinkFieldOption } from '../../services/common'
import { toast } from '../../hooks/useToast'
import { useCareContext } from '../../providers/CareContextProvider'
import { toDatetimeLocalValue } from '../../utils/datetimeLocal'

interface CreateVitalSignModalProps {
  onClose: () => void
  onSuccess?: () => void
  initialPatient?: string
  editRow?: VitalSign
}

export const CreateVitalSignModal = ({
  onClose,
  onSuccess,
  initialPatient,
  editRow,
}: CreateVitalSignModalProps) => {
  // Get context from CareContextProvider
  const isEditMode = Boolean(editRow)
  const { mode, activeVisit, activeAdmission, selectedPatient: contextPatient } = useCareContext()
  
  // Determine if we're in IP or OP mode based on context
  const isIPMode = mode === 'IP'
  const isOPMode = mode === 'OP'
  
  const [formData, setFormData] = useState({
    patient: editRow?.patient || initialPatient || contextPatient || '',
    signs_datetime: editRow?.signs_date
      ? `${editRow.signs_date}T${(editRow.signs_time || '00:00:00').slice(0, 5)}`
      : toDatetimeLocalValue(),
    temperature: editRow?.temperature || '',
    pulse: editRow?.pulse || '',
    respiratory_rate: editRow?.respiratory_rate || '',
    bp_systolic: editRow?.bp_systolic || '',
    bp_diastolic: editRow?.bp_diastolic || '',
    spo2: editRow?.spo2 != null ? String(editRow.spo2) : '',
    height: editRow?.height || '',
    weight: editRow?.weight || '',
    vital_signs_note: editRow?.vital_signs_note || '',
    remarks: editRow?.remarks || '',
    admission_no: editRow?.admission_no || ((isIPMode && activeAdmission) ? activeAdmission : ''),
    patient_visit: editRow?.patient_visit || ((isOPMode && activeVisit) ? activeVisit : ''),
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [patientOptions, setPatientOptions] = useState<PatientListItem[]>([])
  const [patientOpen, setPatientOpen] = useState(false)
  const [patientQuery, setPatientQuery] = useState(initialPatient || contextPatient || '')
  const [patientLoading, setPatientLoading] = useState(false)

  const [admissionOptions, setAdmissionOptions] = useState<{ value: string; label: string }[]>([])
  const [admissionOpen, setAdmissionOpen] = useState(false)
  const [admissionQuery, setAdmissionQuery] = useState('')

  // Visit options for OP mode
  const [visitOptions, setVisitOptions] = useState<LinkFieldOption[]>([])
  const [visitOpen, setVisitOpen] = useState(false)
  const [visitQuery, setVisitQuery] = useState('')
  const [visitLabel, setVisitLabel] = useState('')

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const hasCareContext =
      Boolean(formData.patient) ||
      Boolean(formData.admission_no) ||
      Boolean(formData.patient_visit)

    if (!hasCareContext) {
      setError('Patient, inpatient admission, or patient visit is required')
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

      const [datePart, timePartRaw] = formData.signs_datetime.split('T')
      const timePart = timePartRaw ? `${timePartRaw}:00`.slice(0, 8) : undefined

      const payload: any = {
        patient: formData.patient || undefined,
        signs_date: datePart,
        signs_time: timePart,
        temperature: formData.temperature || undefined,
        pulse: formData.pulse || undefined,
        respiratory_rate: formData.respiratory_rate || undefined,
        bp_systolic: formData.bp_systolic || undefined,
        bp_diastolic: formData.bp_diastolic || undefined,
        spo2: formData.spo2 ? Number(formData.spo2) : undefined,
        height: formData.height ? Number(formData.height) : undefined,
        weight: formData.weight ? Number(formData.weight) : undefined,
        vital_signs_note: formData.vital_signs_note || undefined,
        remarks: formData.remarks || undefined,
      }

      // Add the appropriate care context based on global mode
      if (isIPMode && formData.admission_no) {
        payload.admission_no = formData.admission_no
      } else if (isOPMode && formData.patient_visit) {
        payload.patient_visit = formData.patient_visit
      }

      if (editRow) {
        await updateVitalSign({ ...payload, name: editRow.name })
      } else {
        await createVitalSign(payload)
      }

      toast.success(`Vital Signs record ${editRow ? 'updated' : 'created'} successfully`)
      onSuccess?.()
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : `Failed to ${editRow ? 'update' : 'create'} vital signs`
      setError(msg)
      toast.error(msg)
    } finally {
      setLoading(false)
    }
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
          console.error('Failed to load initial patient for vital signs:', err)
        }
      }
      loadInitialPatient()
    }
  }, [initialPatient, contextPatient])

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
        console.error('Failed to search patients for vital signs:', err)
        setPatientOptions([])
      } finally {
        setPatientLoading(false)
      }
    }, patientQuery.trim() === '' ? 0 : 300)

    return () => clearTimeout(timeoutId)
  }, [patientQuery, patientOpen])

  // Load admissions for selected patient (IP mode)
  useEffect(() => {
    if (!isIPMode) return
    if (!admissionOpen) return

    const timeoutId = setTimeout(async () => {
      try {
        const response = await fetchInpatientRecords(
          undefined,
          admissionQuery || undefined,
          formData.patient || undefined,
          undefined,
          undefined,
          undefined
        )
        setAdmissionOptions(
          response.data.slice(0, 30).map((r) => ({
            value: r.name,
            label: `${r.name} - ${r.patient_name || r.patient || ''}`,
          }))
        )
      } catch (err) {
        console.error('Failed to load admissions for vital signs:', err)
        setAdmissionOptions([])
      }
    }, admissionQuery.trim() === '' ? 0 : 300)

    return () => clearTimeout(timeoutId)
  }, [admissionQuery, admissionOpen, formData.patient, isIPMode])

  // Load visits for selected patient (OP mode)
  useEffect(() => {
    if (!isOPMode) return
    if (!visitOpen && !formData.patient_visit) return

    const timeoutId = setTimeout(async () => {
      try {
        const visits = await fetchPatientVisits(formData.patient, visitQuery || undefined)
        setVisitOptions(visits.slice(0, 30))
      } catch (err) {
        console.error('Failed to load visits for vital signs:', err)
        setVisitOptions([])
      }
    }, visitQuery.trim() === '' ? 0 : 300)

    return () => clearTimeout(timeoutId)
  }, [visitQuery, visitOpen, formData.patient, isOPMode])

  // Auto-load visit label if activeVisit exists
  useEffect(() => {
    if (isOPMode && activeVisit && formData.patient) {
      const loadVisitLabel = async () => {
        try {
          const visits = await fetchPatientVisits(formData.patient, undefined)
          const matchedVisit = visits.find(v => v.name === activeVisit)
          if (matchedVisit) {
            setVisitLabel(matchedVisit.label)
            setVisitQuery(matchedVisit.label)
          }
        } catch (err) {
          console.error('Failed to load visit label:', err)
        }
      }
      loadVisitLabel()
    }
  }, [isOPMode, activeVisit, formData.patient])

  const handlePatientSelect = (patient: PatientListItem) => {
    setFormData(prev => ({ ...prev, patient: patient.name, admission_no: '', patient_visit: '' }))
    setPatientQuery(patient.patient_name)
    setPatientOpen(false)
    setAdmissionQuery('')
    setVisitQuery('')
    setVisitLabel('')
  }

  const handleAdmissionSelect = (admission: { value: string; label: string }) => {
    handleChange('admission_no', admission.value)
    setAdmissionQuery(admission.value)
    setAdmissionOpen(false)
  }

  const handleVisitSelect = (visit: LinkFieldOption) => {
    handleChange('patient_visit', visit.name)
    setVisitQuery(visit.label)
    setVisitLabel(visit.label)
    setVisitOpen(false)
  }

  // Get mode-specific help text
  const getModeHelpText = () => {
    if (isIPMode) {
      return `Recording vital signs for IP admission: ${formData.admission_no || 'not selected yet'}`
    }
    if (isOPMode) {
      return `Recording vital signs for OP visit: ${visitLabel || formData.patient_visit || 'not selected yet'}`
    }
    return 'Select either IP or OP mode from the context switcher above'
  }

  return (
    <div className={CREATE_MODAL_OVERLAY}>
      <div className={createModalShellClass('max-w-2xl w-full max-h-[90vh] overflow-hidden')}>
        <CreateModalHeader
          title={isEditMode ? 'Edit Vital Signs' : 'Create Vital Signs'}
          icon={<Activity className="h-5 w-5 text-emerald-700" strokeWidth={2} />}
          subtitle={
            <>
              {isIPMode ? <span className="mr-2 inline-flex items-center gap-1 rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">IP Mode Active</span> : null}
              {isOPMode ? <span className="mr-2 inline-flex items-center gap-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">OP Mode Active</span> : null}
              {getModeHelpText()}
            </>
          }
          onClose={onClose}
        />
        <form onSubmit={handleSubmit} className={`${CREATE_MODAL_BODY_GRADIENT} space-y-4 p-4`}>
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Mode indicator box */}
          <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
            <p className="text-xs font-semibold text-primary mb-1">
              {isIPMode ? '🏥 Recording Vital Signs for Inpatient' : isOPMode ? '👤 Recording Vital Signs for Outpatient' : '📋 Select Context'}
            </p>
            <p className="text-xs text-slate-600">
              {isIPMode 
                ? `The vital signs will be linked to the selected inpatient admission. Make sure you have an admission selected below.`
                : isOPMode
                ? `The vital signs will be linked to the selected outpatient visit. Make sure you have a visit selected below.`
                : 'Please select either IP or OP mode from the top navbar before recording vital signs.'
              }
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Patient <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={patientQuery}
                  onChange={(e) => {
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
                    {patientOptions.map((p) => (
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

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Date &amp; Time
              </label>
              <input
                type="datetime-local"
                value={formData.signs_datetime}
                onChange={(e) => handleChange('signs_datetime', e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            {/* Admission Selection - Only shown in IP mode */}
            {isIPMode && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Admission No <span className="text-red-500">*</span>
                </label>
                <div className="relative">
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
                    <>
                      <input
                        type="text"
                        value={admissionQuery || formData.admission_no}
                        onChange={(e) => {
                          const value = e.target.value
                          setAdmissionQuery(value)
                          if (!value) {
                            handleChange('admission_no', '')
                          }
                          setAdmissionOpen(true)
                        }}
                        onFocus={() => setAdmissionOpen(true)}
                        placeholder={formData.patient ? 'Search admission for this patient...' : 'Select patient first'}
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-slate-100"
                        disabled={!formData.patient}
                      />
                      {admissionOpen && admissionOptions.length > 0 && (
                        <div className="absolute z-20 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
                          {admissionOptions.map((opt) => (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => handleAdmissionSelect(opt)}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 focus:bg-slate-100 focus:outline-none"
                            >
                              <div className="font-medium text-slate-800">{opt.value}</div>
                              {opt.label !== opt.value && (
                                <div className="text-xs text-slate-500 truncate">{opt.label}</div>
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Visit Selection - Only shown in OP mode */}
            {isOPMode && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Patient Visit <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  {activeVisit ? (
                    <div>
                      <input
                        type="text"
                        value={visitLabel || formData.patient_visit}
                        readOnly
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-slate-100 cursor-not-allowed"
                      />
                      <p className="text-xs text-slate-400 mt-1">Auto-selected from OP context</p>
                    </div>
                  ) : (
                    <>
                      <input
                        type="text"
                        value={visitQuery}
                        onChange={(e) => {
                          setVisitQuery(e.target.value)
                          setVisitOpen(true)
                          if (!e.target.value) {
                            handleChange('patient_visit', '')
                          }
                        }}
                        onFocus={() => setVisitOpen(true)}
                        placeholder={formData.patient ? 'Search visits for this patient...' : 'Select patient first'}
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-slate-100"
                        disabled={!formData.patient}
                      />
                      {visitOpen && visitOptions.length > 0 && (
                        <div className="absolute z-20 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
                          {visitOptions.map((visit) => (
                            <button
                              key={visit.name}
                              type="button"
                              onClick={() => handleVisitSelect(visit)}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 focus:bg-slate-100 focus:outline-none"
                            >
                              <div className="font-medium text-slate-800">{visit.label}</div>
                              {visit.name !== visit.label && (
                                <div className="text-xs text-slate-500 truncate">{visit.name}</div>
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Temperature
              </label>
              <input
                type="text"
                value={formData.temperature}
                onChange={(e) => handleChange('temperature', e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                placeholder="e.g. 37.0 °C"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Pulse
              </label>
              <input
                type="text"
                value={formData.pulse}
                onChange={(e) => handleChange('pulse', e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                placeholder="beats per minute"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Respiratory Rate
              </label>
              <input
                type="text"
                value={formData.respiratory_rate}
                onChange={(e) => handleChange('respiratory_rate', e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                placeholder="breaths per minute"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                BP Systolic
              </label>
              <input
                type="text"
                value={formData.bp_systolic}
                onChange={(e) => handleChange('bp_systolic', e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                placeholder="e.g. 120"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                BP Diastolic
              </label>
              <input
                type="text"
                value={formData.bp_diastolic}
                onChange={(e) => handleChange('bp_diastolic', e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                placeholder="e.g. 80"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                SPO2
              </label>
              <input
                type="number"
                value={formData.spo2}
                onChange={(e) => handleChange('spo2', e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                placeholder="%"
                min={0}
                max={100}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Height (cm)
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.height}
                onChange={(e) => handleChange('height', e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Weight (kg)
              </label>
              <input
                type="number"
                step="0.1"
                value={formData.weight}
                onChange={(e) => handleChange('weight', e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Notes
              </label>
              <textarea
                value={formData.vital_signs_note}
                onChange={(e) => handleChange('vital_signs_note', e.target.value)}
                rows={3}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                placeholder="Clinical notes..."
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Remarks
              </label>
              <textarea
                value={formData.remarks}
                onChange={(e) => handleChange('remarks', e.target.value)}
                rows={2}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <CreateModalFooter>
            <button type="button" onClick={onClose} className={CM_BTN_CANCEL}>Cancel</button>
            <button
              type="submit"
              disabled={loading || (!isIPMode && !isOPMode) || (isIPMode && !formData.admission_no) || (isOPMode && !formData.patient_visit)}
              className={CM_BTN_PRIMARY}
            >
              {loading ? 'Saving…' : isEditMode ? 'Update' : 'Save'}
            </button>
          </CreateModalFooter>
        </form>
      </div>
    </div>
  )
}
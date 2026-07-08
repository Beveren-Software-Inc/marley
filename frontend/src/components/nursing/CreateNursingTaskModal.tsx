// import { useEffect, useState } from 'react'
// import { apiRequest } from '../../services/apiClient'
// import { toast } from '../../hooks/useToast'
// import { CreateHealthcareActivityModal } from '../activities/CreateHealthcareActivityModal'
// import { fetchHealthcarePractitioners } from '../../services/common'

// interface CreateNursingTaskModalProps {
//   onClose: () => void
//   onSuccess: () => void
//   patient?: string
// }

// interface ActivityOption {
//   name: string
//   label: string
// }

// interface NurseOption {
//   name: string
//   label?: string
//   department?: string
// }

// export const CreateNursingTaskModal = ({ onClose, onSuccess, patient }: CreateNursingTaskModalProps) => {
//   const [activityQuery, setActivityQuery] = useState('')
//   const [activityOptions, setActivityOptions] = useState<ActivityOption[]>([])
//   const [activity, setActivity] = useState('')
//   const [activityOpen, setActivityOpen] = useState(false)
//   const [assignedTo, setAssignedTo] = useState('')
//   const [nurseQuery, setNurseQuery] = useState('')
//   const [nurseOptions, setNurseOptions] = useState<NurseOption[]>([])
//   const [nurseOpen, setNurseOpen] = useState(false)
//   const [requestedStart, setRequestedStart] = useState(() => {
//     const now = new Date()
//     const iso = now.toISOString().slice(0, 16) // yyyy-MM-ddTHH:mm
//     return iso
//   })
//   const [submitting, setSubmitting] = useState(false)
//   const [error, setError] = useState<string | null>(null)
//   const [showCreateActivity, setShowCreateActivity] = useState(false)

//   // Activity (Healthcare Activity) search
//   useEffect(() => {
//     if (!activityOpen) return
//     const t = setTimeout(async () => {
//       try {
//         const params = new URLSearchParams()
//         if (activityQuery) params.append('search', activityQuery)
//         const res = await fetch(
//           `/api/method/healthcare.api.common.get_healthcare_activities${params.toString() ? `?${params.toString()}` : ''}`
//         )
//         const data = await res.json()
//         if (Array.isArray(data?.message)) {
//           setActivityOptions(
//             data.message.map((r: any) => ({
//               name: r.name,
//               label: r.activity_type || r.activity || r.name,
//             }))
//           )
//         } else {
//           setActivityOptions([])
//         }
//       } catch {
//         setActivityOptions([])
//       }
//     }, activityQuery.trim() === '' ? 0 : 300)
//     return () => clearTimeout(t)
//   }, [activityQuery, activityOpen])

//   // Assigned To (Healthcare Practitioner) search
//   useEffect(() => {
//     if (!nurseOpen) return
//     const t = setTimeout(async () => {
//       try {
//         const results = await fetchHealthcarePractitioners(nurseQuery || undefined)
//         setNurseOptions(results as NurseOption[])
//       } catch {
//         setNurseOptions([])
//       }
//     }, nurseQuery.trim() === '' ? 0 : 300)
//     return () => clearTimeout(t)
//   }, [nurseQuery, nurseOpen])

//   const handleSubmit = async (e: React.FormEvent) => {
//     e.preventDefault()
//     setError(null)
//     if (!patient) {
//       setError('Select a patient in the header before assigning a task.')
//       return
//     }
//     if (!activity) {
//       setError('Activity is required.')
//       return
//     }

//     try {
//       setSubmitting(true)
//       await apiRequest(
//         '/api/method/healthcare.api.nursing_task.create_nursing_task',
//         {
//           method: 'POST',
//           body: JSON.stringify({
//             patient,
//             activity,
//             assigned_to: assignedTo || undefined,
//             requested_start_time: requestedStart ? new Date(requestedStart).toISOString() : undefined,
//           }),
//         }
//       )
//       toast.success('Nursing task created.')
//       onSuccess()
//       onClose()
//     } catch (err) {
//       setError(err instanceof Error ? err.message : 'Failed to create nursing task')
//     } finally {
//       setSubmitting(false)
//     }
//   }

//   return (
//     <div className={CREATE_MODAL_OVERLAY}>
//       <div className={createModalShellClass('max-w-lg w-full max-h-[90vh]')}>
//         <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
//           <h2 className="text-sm font-semibold text-slate-900">New Nursing Task</h2>
//           <button
//             type="button"
//             onClick={onClose}
//             className="inline-flex items-center justify-center w-8 h-8 rounded-md text-slate-500 hover:text-slate-800 hover:bg-slate-200"
//             aria-label="Close"
//           >
//             <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
//               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
//             </svg>
//           </button>
//         </div>

//         <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
//           {error && (
//             <div className="px-4 py-2 text-xs text-red-700 bg-red-50 border-b border-red-200">
//               {error}
//             </div>
//           )}

//           <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm text-slate-800">
//             <div>
//               <label className="block text-xs font-medium text-slate-600 mb-1">Patient</label>
//               <div className="px-3 py-2 rounded-md border border-slate-200 bg-slate-50 text-sm">
//                 {patient || 'Select a patient in the header'}
//               </div>
//             </div>

//             <div>
//               <label className="block text-xs font-medium text-slate-600 mb-1">
//                 Activity (Nursing Task) <span className="text-red-500">*</span>
//               </label>
//               <div className="relative">
//                 <input
//                   type="text"
//                   value={activityQuery || activity}
//                   onChange={(e) => {
//                     setActivityQuery(e.target.value)
//                     setActivity('')
//                     setActivityOpen(true)
//                   }}
//                   onFocus={() => setActivityOpen(true)}
//                   className="w-full rounded-md border border-slate-300 px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
//                   placeholder="Search Healthcare Activity..."
//                 />
//                 <button
//                   type="button"
//                   onClick={(e) => {
//                     e.stopPropagation()
//                     setShowCreateActivity(true)
//                   }}
//                   className="absolute right-2 top-1/2 -translate-y-1/2 text-primary hover:text-primary/80"
//                   title="Create Healthcare Activity"
//                 >
//                   <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
//                     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
//                   </svg>
//                 </button>
//               </div>
//               {activityOpen && activityOptions.length > 0 && (
//                 <div className="mt-1 max-h-40 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg text-sm">
//                   {activityOptions.map((opt) => (
//                     <button
//                       key={opt.name}
//                       type="button"
//                       className="block w-full text-left px-3 py-1.5 hover:bg-slate-50"
//                       onClick={() => {
//                         setActivity(opt.name)
//                         setActivityQuery(opt.label)
//                         setActivityOpen(false)
//                       }}
//                     >
//                       {opt.label}
//                     </button>
//                   ))}
//                 </div>
//               )}
//             </div>

//             <div>
//               <label className="block text-xs font-medium text-slate-600 mb-1">Assigned To (Healthcare Practitioner)</label>
//               <input
//                 type="text"
//                 value={nurseQuery || assignedTo}
//                 onChange={(e) => {
//                   setNurseQuery(e.target.value)
//                   setAssignedTo('')
//                   setNurseOpen(true)
//                 }}
//                 onFocus={() => setNurseOpen(true)}
//                 className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
//                 placeholder="Search Healthcare Practitioner..."
//               />
//               {nurseOpen && nurseOptions.length > 0 && (
//                 <div className="mt-1 max-h-40 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg text-sm">
//                   {nurseOptions.map((u) => (
//                     <button
//                       key={u.name}
//                       type="button"
//                       className="block w-full text-left px-3 py-1.5 hover:bg-slate-50"
//                       onClick={() => {
//                         setAssignedTo(u.name)
//                         setNurseQuery(u.label || u.name)
//                         setNurseOpen(false)
//                       }}
//                     >
//                       <div className="font-medium">{u.label || u.name}</div>
//                       {u.department && (
//                         <div className="text-[11px] text-slate-500">{u.department}</div>
//                       )}
//                     </button>
//                   ))}
//                 </div>
//               )}
//             </div>

//             <div>
//               <label className="block text-xs font-medium text-slate-600 mb-1">Requested Start</label>
//               <input
//                 type="datetime-local"
//                 value={requestedStart}
//                 onChange={(e) => setRequestedStart(e.target.value)}
//                 className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
//               />
//             </div>
//           </div>

//           <div className="px-4 py-3 border-t border-slate-200 flex justify-end gap-2">
//             <button
//               type="button"
//               onClick={onClose}
//               className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-md hover:bg-slate-200"
//             >
//               Cancel
//             </button>
//             <button
//               type="submit"
//               disabled={submitting}
//               className={CM_BTN_PRIMARY}
//             >
//               {submitting ? 'Creating…' : 'Create Task'}
//             </button>
//           </div>
//         </form>
//         {showCreateActivity && (
//           <CreateHealthcareActivityModal
//             onClose={() => setShowCreateActivity(false)}
//             onSuccess={(activityName, label) => {
//               setActivity(activityName)
//               setActivityQuery(label)
//               setShowCreateActivity(false)
//             }}
//           />
//         )}
//       </div>
//     </div>
//   )
// }

import { useEffect, useState } from 'react'
import {
  CM_BTN_PRIMARY,
  CREATE_MODAL_OVERLAY,
  createModalShellClass,
} from '../ui/CreateModalChrome'
import { apiRequest } from '../../services/apiClient'
import { toast } from '../../hooks/useToast'
import { CreateHealthcareActivityModal } from '../activities/CreateHealthcareActivityModal'
import { fetchHealthcarePractitioners, fetchInpatientAdmissions, fetchPatientVisits, getCurrentUserPractitioner, type LinkFieldOption } from '../../services/common'
import { useCareContext } from '../../providers/CareContextProvider'

interface CreateNursingTaskModalProps {
  onClose: () => void
  onSuccess: () => void
  patient?: string
}

interface ActivityOption {
  name: string
  label: string
}

interface NurseOption {
  name: string
  label?: string
  department?: string
}

export const CreateNursingTaskModal = ({ onClose, onSuccess, patient }: CreateNursingTaskModalProps) => {
  // Get context from CareContextProvider
  const { mode, activeVisit, activeAdmission, selectedPatient: contextPatient } = useCareContext()
  
  // Determine if we're in IP or OP mode based on context
  const isIPMode = mode === 'IP'
  const isOPMode = mode === 'OP'
  
  const [activityQuery, setActivityQuery] = useState('')
  const [activityOptions, setActivityOptions] = useState<ActivityOption[]>([])
  const [activity, setActivity] = useState('')
  const [activityOpen, setActivityOpen] = useState(false)
  const [assignedTo, setAssignedTo] = useState('')
  const [nurseQuery, setNurseQuery] = useState('')
  const [nurseOptions, setNurseOptions] = useState<NurseOption[]>([])
  const [nurseOpen, setNurseOpen] = useState(false)
  const [requestedStart, setRequestedStart] = useState(() => {
    const now = new Date()
    const iso = now.toISOString().slice(0, 16) // yyyy-MM-ddTHH:mm
    return iso
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showCreateActivity, setShowCreateActivity] = useState(false)

  // Care context fields
  const [admissionNo, setAdmissionNo] = useState(() => {
    if (isIPMode && activeAdmission) return activeAdmission
    return ''
  })
  const [patientVisitNo, setPatientVisitNo] = useState(() => {
    if (isOPMode && activeVisit) return activeVisit
    return ''
  })
  const [admissionOptions, setAdmissionOptions] = useState<LinkFieldOption[]>([])
  const [admissionOpen, setAdmissionOpen] = useState(false)
  const [admissionQuery, setAdmissionQuery] = useState('')
  const [selectedAdmission, setSelectedAdmission] = useState<LinkFieldOption | null>(null)
  
  const [visitOptions, setVisitOptions] = useState<LinkFieldOption[]>([])
  const [visitOpen, setVisitOpen] = useState(false)
  const [visitQuery, setVisitQuery] = useState('')
  const [selectedVisit, setSelectedVisit] = useState<LinkFieldOption | null>(null)

  // Get patient from context or prop
  const effectivePatient = patient || contextPatient || ''

  // Auto-load admission/visit label if context exists
  useEffect(() => {
    if (isIPMode && activeAdmission && effectivePatient) {
      const loadAdmissionLabel = async () => {
        try {
          const admissions = await fetchInpatientAdmissions(effectivePatient, activeAdmission)
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
    } else if (isOPMode && activeVisit && effectivePatient) {
      const loadVisitLabel = async () => {
        try {
          const visits = await fetchPatientVisits(effectivePatient, activeVisit)
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
  }, [isIPMode, isOPMode, activeAdmission, activeVisit, effectivePatient])

  // Fetch admissions on open / query change (IP mode)
  useEffect(() => {
    if (!isIPMode) return
    if (!admissionOpen) return
    let cancelled = false
    const run = async () => {
      try {
        const res = await fetchInpatientAdmissions(effectivePatient || undefined, admissionQuery || undefined)
        if (!cancelled) setAdmissionOptions(res)
      } catch { if (!cancelled) setAdmissionOptions([]) }
    }
    const t = setTimeout(run, admissionQuery.trim() ? 300 : 0)
    return () => { cancelled = true; clearTimeout(t) }
  }, [admissionQuery, admissionOpen, effectivePatient, isIPMode])

  // Fetch visits on open / query change (OP mode)
  useEffect(() => {
    if (!isOPMode) return
    if (!visitOpen) return
    let cancelled = false
    const run = async () => {
      try {
        const res = await fetchPatientVisits(effectivePatient || undefined, visitQuery || undefined)
        if (!cancelled) setVisitOptions(res)
      } catch { if (!cancelled) setVisitOptions([]) }
    }
    const t = setTimeout(run, visitQuery.trim() ? 300 : 0)
    return () => { cancelled = true; clearTimeout(t) }
  }, [visitQuery, visitOpen, effectivePatient, isOPMode])

  // Activity (Healthcare Activity) search
  useEffect(() => {
    if (!activityOpen) return
    const t = setTimeout(async () => {
      try {
        const params = new URLSearchParams()
        if (activityQuery) params.append('search', activityQuery)
        const res = await fetch(
          `/api/method/healthcare.api.common.get_healthcare_activities${params.toString() ? `?${params.toString()}` : ''}`
        )
        const data = await res.json()
        if (Array.isArray(data?.message)) {
          setActivityOptions(
            data.message.map((r: any) => ({
              name: r.name,
              label: r.activity_type || r.activity || r.name,
            }))
          )
        } else {
          setActivityOptions([])
        }
      } catch {
        setActivityOptions([])
      }
    }, activityQuery.trim() === '' ? 0 : 300)
    return () => clearTimeout(t)
  }, [activityQuery, activityOpen])

  // Assigned To (Healthcare Practitioner) search
  useEffect(() => {
    if (!nurseOpen) return
    const t = setTimeout(async () => {
      try {
        const results = await fetchHealthcarePractitioners(nurseQuery || undefined)
        setNurseOptions(results as NurseOption[])
      } catch {
        setNurseOptions([])
      }
    }, nurseQuery.trim() === '' ? 0 : 300)
    return () => clearTimeout(t)
  }, [nurseQuery, nurseOpen])

  // Auto-fill current user's practitioner
  useEffect(() => {
    getCurrentUserPractitioner().then(pract => {
      if (pract && !assignedTo) setAssignedTo(pract)
    })
  }, [])

  // Get mode-specific help text
  const getModeHelpText = () => {
    if (isIPMode) {
      return `Creating nursing task for IP admission: ${admissionNo || 'not selected yet'}`
    }
    if (isOPMode) {
      return `Creating nursing task for OP visit: ${patientVisitNo || 'not selected yet'}`
    }
    return 'Select either IP or OP mode from the context switcher above'
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    
    if (!effectivePatient) {
      setError('Select a patient in the header before assigning a task.')
      return
    }
    
    if (!activity) {
      setError('Activity is required.')
      return
    }
    
    // Validate based on mode
    if (isIPMode && !admissionNo) {
      setError('Please select an inpatient admission (IP mode active)')
      return
    }
    if (isOPMode && !patientVisitNo) {
      setError('Please select a patient visit (OP mode active)')
      return
    }

    try {
      setSubmitting(true)
      
      const payload: any = {
        patient: effectivePatient,
        activity,
        assigned_to: assignedTo || undefined,
        requested_start_time: requestedStart ? new Date(requestedStart).toISOString() : undefined,
      }
      
      // Add the appropriate care context based on mode
      if (isIPMode && admissionNo) {
        payload.admission_no = admissionNo
      } else if (isOPMode && patientVisitNo) {
        payload.patient_visit = patientVisitNo
      }
      
      await apiRequest(
        '/api/method/healthcare.api.nursing_task.create_nursing_task',
        {
          method: 'POST',
          body: JSON.stringify(payload),
        }
      )
      toast.success('Nursing task created.')
      onSuccess()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create nursing task')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={CREATE_MODAL_OVERLAY}>
      <div className={createModalShellClass('max-w-lg w-full max-h-[90vh]')}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">New Nursing Task</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {isIPMode && <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-[10px] font-medium mr-2">IP Mode Active</span>}
              {isOPMode && <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-[10px] font-medium mr-2">OP Mode Active</span>}
              {getModeHelpText()}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center w-8 h-8 rounded-md text-slate-500 hover:text-slate-800 hover:bg-slate-200"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          {error && (
            <div className="px-4 py-2 text-xs text-red-700 bg-red-50 border-b border-red-200">
              {error}
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm text-slate-800">
            {/* Mode indicator box */}
            <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
              <p className="text-xs font-semibold text-primary mb-1">
                {isIPMode ? '🏥 Creating Nursing Task for Inpatient' : isOPMode ? '👤 Creating Nursing Task for Outpatient' : '📋 Select Context'}
              </p>
              <p className="text-xs text-slate-600">
                {isIPMode 
                  ? `The nursing task will be linked to the selected inpatient admission. Make sure you have an admission selected below.`
                  : isOPMode
                  ? `The nursing task will be linked to the selected outpatient visit. Make sure you have a visit selected below.`
                  : 'Please select either IP or OP mode from the top navbar before creating a nursing task.'
                }
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Patient <span className="text-red-500">*</span>
              </label>
              <div className="px-3 py-2 rounded-md border border-slate-200 bg-slate-50 text-sm">
                {effectivePatient || 'Select a patient in the header'}
              </div>
              {contextPatient && (
                <p className="text-xs text-slate-400 mt-1">Patient auto-selected from context</p>
              )}
            </div>

            {/* Care Context Selection - IP mode */}
            {isIPMode && (
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Inpatient Admission <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  {activeAdmission ? (
                    <div>
                      <input
                        type="text"
                        value={selectedAdmission?.label || admissionNo}
                        readOnly
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-slate-100 cursor-not-allowed"
                      />
                      <p className="text-xs text-slate-400 mt-1">Auto-selected from IP context</p>
                    </div>
                  ) : (
                    <>
                      <input
                        type="text"
                        value={admissionOpen ? admissionQuery : (selectedAdmission?.label ?? admissionQuery)}
                        onChange={(e) => { setAdmissionQuery(e.target.value); setAdmissionOpen(true); if (!e.target.value) { setAdmissionNo(''); setSelectedAdmission(null) } }}
                        onFocus={() => setAdmissionOpen(true)}
                        placeholder="Search admission…"
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                      {admissionOpen && admissionOptions.length > 0 && (
                        <div className="absolute z-10 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-60 overflow-y-auto top-full">
                          {admissionOptions.map((a) => (
                            <button
                              key={a.name}
                              type="button"
                              onClick={() => { setAdmissionNo(a.name); setSelectedAdmission(a); setAdmissionQuery(a.label); setAdmissionOpen(false) }}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100"
                            >
                              {a.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Care Context Selection - OP mode */}
            {isOPMode && (
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Patient Visit <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  {activeVisit ? (
                    <div>
                      <input
                        type="text"
                        value={selectedVisit?.label || patientVisitNo}
                        readOnly
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-slate-100 cursor-not-allowed"
                      />
                      <p className="text-xs text-slate-400 mt-1">Auto-selected from OP context</p>
                    </div>
                  ) : (
                    <>
                      <input
                        type="text"
                        value={visitOpen ? visitQuery : (selectedVisit?.label ?? visitQuery)}
                        onChange={(e) => { setVisitQuery(e.target.value); setVisitOpen(true); if (!e.target.value) { setPatientVisitNo(''); setSelectedVisit(null) } }}
                        onFocus={() => setVisitOpen(true)}
                        placeholder="Search visit…"
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                      {visitOpen && visitOptions.length > 0 && (
                        <div className="absolute z-10 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-60 overflow-y-auto top-full">
                          {visitOptions.map((v) => (
                            <button
                              key={v.name}
                              type="button"
                              onClick={() => { setPatientVisitNo(v.name); setSelectedVisit(v); setVisitQuery(v.label); setVisitOpen(false) }}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100"
                            >
                              {v.label}
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
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Activity (Nursing Task) <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={activityQuery || activity}
                  onChange={(e) => {
                    setActivityQuery(e.target.value)
                    setActivity('')
                    setActivityOpen(true)
                  }}
                  onFocus={() => setActivityOpen(true)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Search Healthcare Activity..."
                />
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setShowCreateActivity(true)
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-primary hover:text-primary/80"
                  title="Create Healthcare Activity"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </button>
              </div>
              {activityOpen && activityOptions.length > 0 && (
                <div className="mt-1 max-h-40 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg text-sm">
                  {activityOptions.map((opt) => (
                    <button
                      key={opt.name}
                      type="button"
                      className="block w-full text-left px-3 py-1.5 hover:bg-slate-50"
                      onClick={() => {
                        setActivity(opt.name)
                        setActivityQuery(opt.label)
                        setActivityOpen(false)
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Assigned To (Healthcare Practitioner)</label>
              <input
                type="text"
                value={nurseQuery || assignedTo}
                onChange={(e) => {
                  setNurseQuery(e.target.value)
                  setAssignedTo('')
                  setNurseOpen(true)
                }}
                onFocus={() => setNurseOpen(true)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="Search doctor..."
              />
              {nurseOpen && nurseOptions.length > 0 && (
                <div className="mt-1 max-h-40 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg text-sm">
                  {nurseOptions.map((u) => (
                    <button
                      key={u.name}
                      type="button"
                      className="block w-full text-left px-3 py-1.5 hover:bg-slate-50"
                      onClick={() => {
                        setAssignedTo(u.name)
                        setNurseQuery(u.label || u.name)
                        setNurseOpen(false)
                      }}
                    >
                      <div className="font-medium">{u.label || u.name}</div>
                      {u.department && (
                        <div className="text-[11px] text-slate-500">{u.department}</div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Requested Start</label>
              <input
                type="datetime-local"
                value={requestedStart}
                onChange={(e) => setRequestedStart(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          <div className="px-4 py-3 border-t border-slate-200 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-md hover:bg-slate-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || (!isIPMode && !isOPMode) || (isIPMode && !admissionNo) || (isOPMode && !patientVisitNo)}
              className={CM_BTN_PRIMARY}
            >
              {submitting ? 'Creating…' : 'Create Task'}
            </button>
          </div>
        </form>
        {showCreateActivity && (
          <CreateHealthcareActivityModal
            onClose={() => setShowCreateActivity(false)}
            onSuccess={(activityName, label) => {
              setActivity(activityName)
              setActivityQuery(label)
              setShowCreateActivity(false)
            }}
          />
        )}
      </div>
    </div>
  )
}
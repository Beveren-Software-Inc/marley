// import { useState, useEffect } from 'react'
// import { createGroomingChart, type CreateGroomingChartInput } from '../../services/groomingCharts'
// import { fetchCostCenters, fetchInpatientAdmissions, type LinkFieldOption } from '../../services/common'
// import { searchPatients, fetchPatients, type PatientListItem } from '../../services/patients'

// interface CreateGroomingChartModalProps {
//   onClose: () => void
//   onSuccess: () => void
//   patient?: string
// }

// const CheckField = ({
//   label,
//   name,
//   checked,
//   onChange,
// }: {
//   label: string
//   name: string
//   checked: boolean
//   onChange: (name: string, val: 0 | 1) => void
// }) => (
//   <label className="flex items-center gap-2 cursor-pointer select-none">
//     <div
//       onClick={() => onChange(name, checked ? 0 : 1)}
//       className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors cursor-pointer flex-shrink-0 ${
//         checked ? 'bg-primary border-primary' : 'bg-white border-slate-300 hover:border-primary/60'
//       }`}
//     >
//       {checked && (
//         <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
//           <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
//         </svg>
//       )}
//     </div>
//     <span className="text-sm text-slate-700">{label}</span>
//   </label>
// )

// export const CreateGroomingChartModal = ({ onClose, onSuccess, patient }: CreateGroomingChartModalProps) => {
//   const [activeTab, setActiveTab] = useState<'details' | 'hygiene' | 'meals' | 'measurements'>('details')
//   const [saving, setSaving] = useState(false)
//   const [error, setError] = useState<string | null>(null)

//   // Form values
//   const [date, setDate] = useState(new Date().toISOString().split('T')[0])
//   const [patientId, setPatientId] = useState(patient || '')
//   const [admissionNo, setAdmissionNo] = useState('')
//   const [costCenter, setCostCenter] = useState('')
//   const [patientName, setPatientName] = useState('')
//   const [lmp, setLmp] = useState('')
//   const [weight, setWeight] = useState<string>('')

//   // Check fields – hygiene
//   const [brushTeethMorning, setBrushTeethMorning] = useState<0 | 1>(0)
//   const [changeClothesMorning, setChangeClothesMorning] = useState<0 | 1>(0)
//   const [brushTeethNoon, setBrushTeethNoon] = useState<0 | 1>(0)
//   const [changeClothesNoon, setChangeClothesNoon] = useState<0 | 1>(0)
//   const [shower, setShower] = useState<0 | 1>(0)
//   const [bowel, setBowel] = useState<0 | 1>(0)
//   const [bedWetting, setBedWetting] = useState<0 | 1>(0)

//   // Check fields – meals
//   const [breakfast, setBreakfast] = useState<0 | 1>(0)
//   const [snack1, setSnack1] = useState<0 | 1>(0)
//   const [lunch, setLunch] = useState<0 | 1>(0)
//   const [snack2, setSnack2] = useState<0 | 1>(0)
//   const [dinner, setDinner] = useState<0 | 1>(0)
//   const [snack3, setSnack3] = useState<0 | 1>(0)

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

//   // Cost Center dropdown
//   const [ccOptions, setCcOptions] = useState<LinkFieldOption[]>([])
//   const [ccOpen, setCcOpen] = useState(false)
//   const [ccQuery, setCcQuery] = useState('')
//   const [selectedCc, setSelectedCc] = useState<LinkFieldOption | null>(null)

//   // Load initial patient label if patient prop provided
//   useEffect(() => {
//     if (patient) {
//       fetchPatients(1, 0, patient).then((res) => {
//         if (res.length > 0) setPatientQuery(res[0].patient_name)
//       }).catch(() => {})
//     }
//   }, [patient])

//   // Fetch patients on open / query change
//   useEffect(() => {
//     if (!patientOpen) return
//     let cancelled = false
//     const run = async () => {
//       setPatientLoading(true)
//       try {
//         const res = patientQuery.trim()
//           ? await searchPatients(patientQuery, 20)
//           : await fetchPatients(20, 0)
//         if (!cancelled) setPatientOptions(res)
//       } catch { if (!cancelled) setPatientOptions([]) }
//       finally { if (!cancelled) setPatientLoading(false) }
//     }
//     const t = setTimeout(run, patientQuery.trim() ? 300 : 0)
//     return () => { cancelled = true; clearTimeout(t) }
//   }, [patientQuery, patientOpen])

//   // Fetch admissions on open / query change
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

//   // Fetch cost centers on open / query change
//   useEffect(() => {
//     if (!ccOpen) return
//     let cancelled = false
//     const run = async () => {
//       try {
//         const res = await fetchCostCenters(undefined, ccQuery || undefined)
//         if (!cancelled) setCcOptions(res)
//       } catch { if (!cancelled) setCcOptions([]) }
//     }
//     const t = setTimeout(run, ccQuery.trim() ? 300 : 0)
//     return () => { cancelled = true; clearTimeout(t) }
//   }, [ccQuery, ccOpen])

//   const handleSubmit = async (e: React.FormEvent) => {
//     e.preventDefault()
//     if (!patientId) { setError('Patient is required'); return }
//     setSaving(true)
//     setError(null)
//     try {
//       const payload: CreateGroomingChartInput = {
//         date,
//         file_no: patientId,
//         patient_name: patientName || undefined,
//         admission_no: admissionNo || undefined,
//         cost_center: costCenter || undefined,
//         brush_teeth_morning: brushTeethMorning,
//         change_clothes_morning: changeClothesMorning,
//         brush_teeth_noon: brushTeethNoon,
//         change_clothes_noon: changeClothesNoon,
//         shower, bowel, bed_wetting: bedWetting,
//         breakfast, snack_1: snack1, lunch, snack_2: snack2, dinner, snack_3: snack3,
//         weight: weight ? parseFloat(weight) : null,
//         lmp: lmp || undefined,
//       }
//       const result = await createGroomingChart(payload)
//       if (result.success) {
//         onSuccess()
//       } else {
//         setError(result.message || 'Failed to create grooming chart')
//       }
//     } catch (e) {
//       setError(e instanceof Error ? e.message : 'Failed to create grooming chart')
//     } finally {
//       setSaving(false)
//     }
//   }

//   const closeAllDropdowns = () => {
//     setPatientOpen(false)
//     setAdmissionOpen(false)
//     setCcOpen(false)
//   }

//   const TABS = [
//     { id: 'details', label: 'Details' },
//     { id: 'hygiene', label: 'Hygiene' },
//     { id: 'meals', label: 'Meals' },
//     { id: 'measurements', label: 'Measurements' },
//   ] as const

//   return (
//     <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
//       <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col">
//         {/* Header */}
//         <div className="p-4 border-b border-slate-200 flex-shrink-0">
//           <div className="flex items-center justify-between">
//             <h2 className="text-xl font-semibold text-slate-900">New Grooming Chart</h2>
//             <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
//               <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
//                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
//               </svg>
//             </button>
//           </div>
//         </div>

//         {/* Tabs */}
//         <div className="flex border-b border-slate-200 px-4 flex-shrink-0">
//           {TABS.map((tab) => (
//             <button
//               key={tab.id}
//               type="button"
//               onClick={() => setActiveTab(tab.id)}
//               className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px ${
//                 activeTab === tab.id
//                   ? 'border-primary text-primary'
//                   : 'border-transparent text-slate-500 hover:text-slate-700'
//               }`}
//             >
//               {tab.label}
//             </button>
//           ))}
//         </div>

//         {/* Body with consistent minimum height and fixed footer */}
//         <form
//           onSubmit={handleSubmit}
//           className="flex flex-col flex-1 min-h-0"
//           onClick={(e) => {
//             const target = e.target as HTMLElement
//             if (target.tagName !== 'INPUT' && !target.closest('.absolute')) closeAllDropdowns()
//           }}
//         >
//           {/* Scrollable content area */}
//           <div className="p-6 space-y-4 overflow-y-auto flex-1 min-h-0 min-h-[500px]">
//           {/* ─── Details ─── */}
//           {activeTab === 'details' && (
//             <>
//               <div>
//                 <h3 className="text-sm font-semibold text-slate-700 mb-3">Patient Information</h3>
//                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
//                   {/* Patient */}
//                   <div className="md:col-span-2">
//                     <label className="block text-sm font-medium text-slate-700 mb-1">
//                       Patient <span className="text-red-500">*</span>
//                     </label>
//                     <div className="relative flex items-center">
//                       <input
//                         type="text"
//                         value={patientQuery}
//                         onChange={(e) => { setPatientQuery(e.target.value); setPatientOpen(true) }}
//                         onFocus={() => setPatientOpen(true)}
//                         placeholder="Search patient…"
//                         className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
//                       />
//                       {patientLoading && (
//                         <span className="absolute right-3 top-2.5 text-xs text-slate-400">Loading…</span>
//                       )}
//                       {patientOpen && patientOptions.length > 0 && (
//                         <div className="absolute z-10 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-60 overflow-y-auto top-full">
//                           {patientOptions.map((p) => (
//                             <button
//                               key={p.name}
//                               type="button"
//                               onClick={() => {
//                                 setPatientId(p.name)
//                                 setPatientQuery(p.patient_name)
//                                 setPatientName(p.patient_name)
//                                 setPatientOpen(false)
//                               }}
//                               className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100"
//                             >
//                               <div className="font-medium">{p.patient_name}</div>
//                               {p.mobile && <div className="text-xs text-slate-500">{p.mobile}</div>}
//                             </button>
//                           ))}
//                         </div>
//                       )}
//                     </div>
//                   </div>
//                 </div>
//               </div>

//               <div>
//                 <h3 className="text-sm font-semibold text-slate-700 mb-3">Admission Details</h3>
//                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
//                   {/* Date */}
//                   <div>
//                     <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
//                     <input
//                       type="date"
//                       value={date}
//                       onChange={(e) => setDate(e.target.value)}
//                       className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
//                     />
//                   </div>

//                   {/* Admission No */}
//                   <div>
//                     <label className="block text-sm font-medium text-slate-700 mb-1">Admission No</label>
//                     <div className="relative">
//                       <input
//                         type="text"
//                         value={admissionOpen ? admissionQuery : (selectedAdmission?.label ?? admissionQuery)}
//                         onChange={(e) => { setAdmissionQuery(e.target.value); setAdmissionOpen(true); if (!e.target.value) { setAdmissionNo(''); setSelectedAdmission(null) } }}
//                         onFocus={() => setAdmissionOpen(true)}
//                         placeholder="Search admission…"
//                         className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
//                       />
//                       {admissionOpen && admissionOptions.length > 0 && (
//                         <div className="absolute z-10 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-60 overflow-y-auto top-full">
//                           {admissionOptions.map((a) => (
//                             <button
//                               key={a.name}
//                               type="button"
//                               onClick={() => { setAdmissionNo(a.name); setSelectedAdmission(a); setAdmissionQuery(a.label); setAdmissionOpen(false) }}
//                               className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100"
//                             >
//                               {a.label}
//                             </button>
//                           ))}
//                         </div>
//                       )}
//                     </div>
//                   </div>

//                   {/* Cost Centre */}
//                   <div className="md:col-span-2">
//                     <label className="block text-sm font-medium text-slate-700 mb-1">Cost Centre</label>
//                     <div className="relative">
//                       <input
//                         type="text"
//                         value={ccOpen ? ccQuery : (selectedCc?.label ?? ccQuery)}
//                         onChange={(e) => { setCcQuery(e.target.value); setCcOpen(true); if (!e.target.value) { setCostCenter(''); setSelectedCc(null) } }}
//                         onFocus={() => setCcOpen(true)}
//                         placeholder="Search cost centre…"
//                         className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
//                       />
//                       {ccOpen && ccOptions.length > 0 && (
//                         <div className="absolute z-10 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-60 overflow-y-auto top-full">
//                           {ccOptions.map((cc) => (
//                             <button
//                               key={cc.name}
//                               type="button"
//                               onClick={() => { setCostCenter(cc.name); setSelectedCc(cc); setCcQuery(cc.label); setCcOpen(false) }}
//                               className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100"
//                             >
//                               {cc.label}
//                             </button>
//                           ))}
//                         </div>
//                       )}
//                     </div>
//                   </div>
//                 </div>
//               </div>
//             </>
//           )}

//           {/* ─── Hygiene ─── */}
//           {activeTab === 'hygiene' && (
//             <>
//               <div>
//                 <h3 className="text-sm font-semibold text-slate-700 mb-3">Morning</h3>
//                 <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
//                   <CheckField label="Brush Teeth" name="brush_teeth_morning" checked={!!brushTeethMorning} onChange={(_, v) => setBrushTeethMorning(v)} />
//                   <CheckField label="Change Clothes" name="change_clothes_morning" checked={!!changeClothesMorning} onChange={(_, v) => setChangeClothesMorning(v)} />
//                 </div>
//               </div>
//               <div>
//                 <h3 className="text-sm font-semibold text-slate-700 mb-3">Noon</h3>
//                 <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
//                   <CheckField label="Brush Teeth" name="brush_teeth_noon" checked={!!brushTeethNoon} onChange={(_, v) => setBrushTeethNoon(v)} />
//                   <CheckField label="Change Clothes" name="change_clothes_noon" checked={!!changeClothesNoon} onChange={(_, v) => setChangeClothesNoon(v)} />
//                 </div>
//               </div>
//               <div>
//                 <h3 className="text-sm font-semibold text-slate-700 mb-3">General</h3>
//                 <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
//                   <CheckField label="Shower" name="shower" checked={!!shower} onChange={(_, v) => setShower(v)} />
//                   <CheckField label="Bowel" name="bowel" checked={!!bowel} onChange={(_, v) => setBowel(v)} />
//                   <CheckField label="Bed Wetting" name="bed_wetting" checked={!!bedWetting} onChange={(_, v) => setBedWetting(v)} />
//                 </div>
//               </div>
//             </>
//           )}

//           {/* ─── Meals ─── */}
//           {activeTab === 'meals' && (
//             <div>
//               <h3 className="text-sm font-semibold text-slate-700 mb-3">Meal Tracking</h3>
//               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
//                 <CheckField label="Breakfast" name="breakfast" checked={!!breakfast} onChange={(_, v) => setBreakfast(v)} />
//                 <CheckField label="Snack 1" name="snack_1" checked={!!snack1} onChange={(_, v) => setSnack1(v)} />
//                 <CheckField label="Lunch" name="lunch" checked={!!lunch} onChange={(_, v) => setLunch(v)} />
//                 <CheckField label="Snack 2" name="snack_2" checked={!!snack2} onChange={(_, v) => setSnack2(v)} />
//                 <CheckField label="Dinner" name="dinner" checked={!!dinner} onChange={(_, v) => setDinner(v)} />
//                 <CheckField label="Snack 3" name="snack_3" checked={!!snack3} onChange={(_, v) => setSnack3(v)} />
//               </div>
//             </div>
//           )}

//           {/* ─── Measurements ─── */}
//           {activeTab === 'measurements' && (
//             <div>
//               <h3 className="text-sm font-semibold text-slate-700 mb-3">Clinical Measurements</h3>
//               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
//                 <div>
//                   <label className="block text-sm font-medium text-slate-700 mb-1">Weight (kg)</label>
//                   <input
//                     type="number"
//                     step="0.1"
//                     min="0"
//                     value={weight}
//                     onChange={(e) => setWeight(e.target.value)}
//                     placeholder="e.g. 70.5"
//                     className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
//                   />
//                 </div>
//                 <div>
//                   <label className="block text-sm font-medium text-slate-700 mb-1">LMP (Last Menstrual Period)</label>
//                   <input
//                     type="date"
//                     value={lmp}
//                     onChange={(e) => setLmp(e.target.value)}
//                     className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
//                   />
//                 </div>
//               </div>
//             </div>
//           )}

//             {error && (
//               <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">
//                 {error}
//               </div>
//             )}
//           </div>

//           {/* Fixed Footer */}
//           <div className="border-t border-slate-200 bg-white px-6 py-4 flex justify-end gap-3 flex-shrink-0">
//             <button
//               type="button"
//               onClick={onClose}
//               className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50"
//             >
//               Cancel
//             </button>
//             <button
//               type="submit"
//               disabled={saving}
//               className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50"
//             >
//               {saving ? 'Saving…' : 'Save Chart'}
//             </button>
//           </div>
//         </form>
//       </div>
//     </div>
//   )
// }


import { useState, useEffect } from 'react'
import { createGroomingChart, type CreateGroomingChartInput } from '../../services/groomingCharts'
import { fetchCostCenters, fetchInpatientAdmissions, fetchPatientVisits, type LinkFieldOption } from '../../services/common'
import { searchPatients, fetchPatients, type PatientListItem } from '../../services/patients'
import { useCareContext } from '../../providers/CareContextProvider'

interface CreateGroomingChartModalProps {
  onClose: () => void
  onSuccess: () => void
  patient?: string
}

const CheckField = ({
  label,
  name,
  checked,
  onChange,
}: {
  label: string
  name: string
  checked: boolean
  onChange: (name: string, val: 0 | 1) => void
}) => (
  <label className="flex items-center gap-2 cursor-pointer select-none">
    <div
      onClick={() => onChange(name, checked ? 0 : 1)}
      className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors cursor-pointer flex-shrink-0 ${
        checked ? 'bg-primary border-primary' : 'bg-white border-slate-300 hover:border-primary/60'
      }`}
    >
      {checked && (
        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      )}
    </div>
    <span className="text-sm text-slate-700">{label}</span>
  </label>
)

export const CreateGroomingChartModal = ({ onClose, onSuccess, patient }: CreateGroomingChartModalProps) => {
  // Get context from CareContextProvider
  const { mode, activeVisit, activeAdmission, selectedPatient: contextPatient } = useCareContext()
  
  // Determine if we're in IP or OP mode based on context
  const isIPMode = mode === 'IP'
  const isOPMode = mode === 'OP'
  
  const [activeTab, setActiveTab] = useState<'details' | 'hygiene' | 'meals' | 'measurements'>('details')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Form values
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [patientId, setPatientId] = useState(patient || contextPatient || '')
  const [admissionNo, setAdmissionNo] = useState(() => {
    if (isIPMode && activeAdmission) return activeAdmission
    return ''
  })
  const [patientVisitNo, setPatientVisitNo] = useState(() => {
    if (isOPMode && activeVisit) return activeVisit
    return ''
  })
  const [costCenter, setCostCenter] = useState('')
  const [patientName, setPatientName] = useState('')
  const [lmp, setLmp] = useState('')
  const [weight, setWeight] = useState<string>('')

  // Check fields – hygiene
  const [brushTeethMorning, setBrushTeethMorning] = useState<0 | 1>(0)
  const [changeClothesMorning, setChangeClothesMorning] = useState<0 | 1>(0)
  const [brushTeethNoon, setBrushTeethNoon] = useState<0 | 1>(0)
  const [changeClothesNoon, setChangeClothesNoon] = useState<0 | 1>(0)
  const [shower, setShower] = useState<0 | 1>(0)
  const [bowel, setBowel] = useState<0 | 1>(0)
  const [bedWetting, setBedWetting] = useState<0 | 1>(0)

  // Check fields – meals
  const [breakfast, setBreakfast] = useState<0 | 1>(0)
  const [snack1, setSnack1] = useState<0 | 1>(0)
  const [lunch, setLunch] = useState<0 | 1>(0)
  const [snack2, setSnack2] = useState<0 | 1>(0)
  const [dinner, setDinner] = useState<0 | 1>(0)
  const [snack3, setSnack3] = useState<0 | 1>(0)

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

  // Cost Center dropdown
  const [ccOptions, setCcOptions] = useState<LinkFieldOption[]>([])
  const [ccOpen, setCcOpen] = useState(false)
  const [ccQuery, setCcQuery] = useState('')
  const [selectedCc, setSelectedCc] = useState<LinkFieldOption | null>(null)

  // Load initial patient label if patient prop provided
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

  // Fetch patients on open / query change
  useEffect(() => {
    if (!patientOpen) return
    let cancelled = false
    const run = async () => {
      setPatientLoading(true)
      try {
        const res = patientQuery.trim()
          ? await searchPatients(patientQuery, 20)
          : await fetchPatients(20, 0)
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

  // Fetch cost centers on open / query change
  useEffect(() => {
    if (!ccOpen) return
    let cancelled = false
    const run = async () => {
      try {
        const res = await fetchCostCenters(undefined, ccQuery || undefined)
        if (!cancelled) setCcOptions(res)
      } catch { if (!cancelled) setCcOptions([]) }
    }
    const t = setTimeout(run, ccQuery.trim() ? 300 : 0)
    return () => { cancelled = true; clearTimeout(t) }
  }, [ccQuery, ccOpen])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
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
      const payload: CreateGroomingChartInput = {
        date,
        file_no: patientId,
        patient_name: patientName || undefined,
        admission_no: admissionNo || undefined,
        patient_visit: patientVisitNo || undefined,
        cost_center: costCenter || undefined,
        brush_teeth_morning: brushTeethMorning,
        change_clothes_morning: changeClothesMorning,
        brush_teeth_noon: brushTeethNoon,
        change_clothes_noon: changeClothesNoon,
        shower, bowel, bed_wetting: bedWetting,
        breakfast, snack_1: snack1, lunch, snack_2: snack2, dinner, snack_3: snack3,
        weight: weight ? parseFloat(weight) : null,
        lmp: lmp || undefined,
      }
      const result = await createGroomingChart(payload)
      if (result.success) {
        onSuccess()
      } else {
        setError(result.message || 'Failed to create grooming chart')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create grooming chart')
    } finally {
      setSaving(false)
    }
  }

  const closeAllDropdowns = () => {
    setPatientOpen(false)
    setAdmissionOpen(false)
    setVisitOpen(false)
    setCcOpen(false)
  }

  // Get mode-specific help text
  const getModeHelpText = () => {
    if (isIPMode) {
      return `Creating grooming chart for IP admission: ${admissionNo || 'not selected yet'}`
    }
    if (isOPMode) {
      return `Creating grooming chart for OP visit: ${patientVisitNo || 'not selected yet'}`
    }
    return 'Select either IP or OP mode from the context switcher above'
  }

  const TABS = [
    { id: 'details', label: 'Details' },
    { id: 'hygiene', label: 'Hygiene' },
    { id: 'meals', label: 'Meals' },
    { id: 'measurements', label: 'Measurements' },
  ] as const

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-slate-200 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">New Grooming Chart</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {isIPMode && <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-[10px] font-medium mr-2">IP Mode Active</span>}
                {isOPMode && <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-[10px] font-medium mr-2">OP Mode Active</span>}
                {getModeHelpText()}
              </p>
            </div>
            <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 px-4 flex-shrink-0">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px ${
                activeTab === tab.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Body with consistent minimum height and fixed footer */}
        <form
          onSubmit={handleSubmit}
          className="flex flex-col flex-1 min-h-0"
          onClick={(e) => {
            const target = e.target as HTMLElement
            if (target.tagName !== 'INPUT' && !target.closest('.absolute')) closeAllDropdowns()
          }}
        >
          {/* Scrollable content area */}
          <div className="p-6 space-y-4 overflow-y-auto flex-1 min-h-0 min-h-[500px]">
            {/* Mode indicator box */}
            <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
              <p className="text-xs font-semibold text-primary mb-1">
                {isIPMode ? '🏥 Creating Grooming Chart for Inpatient' : isOPMode ? '👤 Creating Grooming Chart for Outpatient' : '📋 Select Context'}
              </p>
              <p className="text-xs text-slate-600">
                {isIPMode 
                  ? `The grooming chart will be linked to the selected inpatient admission. Make sure you have an admission selected below.`
                  : isOPMode
                  ? `The grooming chart will be linked to the selected outpatient visit. Make sure you have a visit selected below.`
                  : 'Please select either IP or OP mode from the top navbar before creating a grooming chart.'
                }
              </p>
            </div>

            {/* ─── Details ─── */}
            {activeTab === 'details' && (
              <>
                <div>
                  <h3 className="text-sm font-semibold text-slate-700 mb-3">Patient Information</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Patient */}
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Patient <span className="text-red-500">*</span>
                      </label>
                      <div className="relative flex items-center">
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
                        {patientLoading && (
                          <span className="absolute right-3 top-2.5 text-xs text-slate-400">Loading…</span>
                        )}
                        {patientOpen && !contextPatient && patientOptions.length > 0 && (
                          <div className="absolute z-10 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-60 overflow-y-auto top-full">
                            {patientOptions.map((p) => (
                              <button
                                key={p.name}
                                type="button"
                                onClick={() => {
                                  setPatientId(p.name)
                                  setPatientQuery(p.patient_name)
                                  setPatientName(p.patient_name)
                                  setPatientOpen(false)
                                }}
                                className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100"
                              >
                                <div className="font-medium">{p.patient_name}</div>
                                {p.mobile && <div className="text-xs text-slate-500">{p.mobile}</div>}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-slate-700 mb-3">Admission Details</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Date */}
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
                      <input
                        type="date"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>

                    {/* Admission No (IP mode) */}
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

                    {/* Patient Visit (OP mode) */}
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

                    {/* Cost Centre */}
                    <div className={isIPMode || isOPMode ? "md:col-span-2" : "md:col-span-2"}>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Cost Centre</label>
                      <div className="relative">
                        <input
                          type="text"
                          value={ccOpen ? ccQuery : (selectedCc?.label ?? ccQuery)}
                          onChange={(e) => { setCcQuery(e.target.value); setCcOpen(true); if (!e.target.value) { setCostCenter(''); setSelectedCc(null) } }}
                          onFocus={() => setCcOpen(true)}
                          placeholder="Search cost centre…"
                          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                        {ccOpen && ccOptions.length > 0 && (
                          <div className="absolute z-10 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-60 overflow-y-auto top-full">
                            {ccOptions.map((cc) => (
                              <button
                                key={cc.name}
                                type="button"
                                onClick={() => { setCostCenter(cc.name); setSelectedCc(cc); setCcQuery(cc.label); setCcOpen(false) }}
                                className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100"
                              >
                                {cc.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* ─── Hygiene ─── */}
            {activeTab === 'hygiene' && (
              <>
                <div>
                  <h3 className="text-sm font-semibold text-slate-700 mb-3">Morning</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <CheckField label="Brush Teeth" name="brush_teeth_morning" checked={!!brushTeethMorning} onChange={(_, v) => setBrushTeethMorning(v)} />
                    <CheckField label="Change Clothes" name="change_clothes_morning" checked={!!changeClothesMorning} onChange={(_, v) => setChangeClothesMorning(v)} />
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-700 mb-3">Noon</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <CheckField label="Brush Teeth" name="brush_teeth_noon" checked={!!brushTeethNoon} onChange={(_, v) => setBrushTeethNoon(v)} />
                    <CheckField label="Change Clothes" name="change_clothes_noon" checked={!!changeClothesNoon} onChange={(_, v) => setChangeClothesNoon(v)} />
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-700 mb-3">General</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <CheckField label="Shower" name="shower" checked={!!shower} onChange={(_, v) => setShower(v)} />
                    <CheckField label="Bowel" name="bowel" checked={!!bowel} onChange={(_, v) => setBowel(v)} />
                    <CheckField label="Bed Wetting" name="bed_wetting" checked={!!bedWetting} onChange={(_, v) => setBedWetting(v)} />
                  </div>
                </div>
              </>
            )}

            {/* ─── Meals ─── */}
            {activeTab === 'meals' && (
              <div>
                <h3 className="text-sm font-semibold text-slate-700 mb-3">Meal Tracking</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <CheckField label="Breakfast" name="breakfast" checked={!!breakfast} onChange={(_, v) => setBreakfast(v)} />
                  <CheckField label="Snack 1" name="snack_1" checked={!!snack1} onChange={(_, v) => setSnack1(v)} />
                  <CheckField label="Lunch" name="lunch" checked={!!lunch} onChange={(_, v) => setLunch(v)} />
                  <CheckField label="Snack 2" name="snack_2" checked={!!snack2} onChange={(_, v) => setSnack2(v)} />
                  <CheckField label="Dinner" name="dinner" checked={!!dinner} onChange={(_, v) => setDinner(v)} />
                  <CheckField label="Snack 3" name="snack_3" checked={!!snack3} onChange={(_, v) => setSnack3(v)} />
                </div>
              </div>
            )}

            {/* ─── Measurements ─── */}
            {activeTab === 'measurements' && (
              <div>
                <h3 className="text-sm font-semibold text-slate-700 mb-3">Clinical Measurements</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Weight (kg)</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      value={weight}
                      onChange={(e) => setWeight(e.target.value)}
                      placeholder="e.g. 70.5"
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">LMP (Last Menstrual Period)</label>
                    <input
                      type="date"
                      value={lmp}
                      onChange={(e) => setLmp(e.target.value)}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">
                {error}
              </div>
            )}
          </div>

          {/* Fixed Footer */}
          <div className="border-t border-slate-200 bg-white px-6 py-4 flex justify-end gap-3 flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || (!isIPMode && !isOPMode) || (isIPMode && !admissionNo) || (isOPMode && !patientVisitNo)}
              className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save Chart'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
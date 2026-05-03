// import { useState, useEffect, useRef, useCallback } from 'react'
// import { createNurseTask, type CreateNurseTaskData } from '../../services/nurseTask'
// import {
//   fetchHealthcarePractitioners,
//   fetchRouteOfAdministrationList,
//   fetchPatientVisits,
//   fetchInpatientAdmissions,
//   fetchBranches,
//   fetchPrescriptionFrequencies,
//   type LinkFieldOption,
// } from '../../services/common'
// import { toast } from '../../hooks/useToast'
// import { X, ChevronDown } from 'lucide-react'

// const TASK_TYPES = [
//   'Medication Administration',
//   'Vital Monitoring',
//   'Therapy Assistance',
//   'Grooming / Care',
//   'Lab Support',
//   'Documentation',
// ]

// const REF_DOCTYPES = ['', 'Patient Visit', 'Inpatient Admission'] as const
// type RefDoctype = (typeof REF_DOCTYPES)[number]

// // ─── Reusable inline combobox ─────────────────────────────────────────────────
// interface ComboProps {
//   value: string
//   display: string
//   placeholder: string
//   options: LinkFieldOption[]
//   onSearch: (q: string) => void
//   onSelect: (opt: LinkFieldOption) => void
//   onClear?: () => void
//   onOpen: () => void
// }

// const Combo = ({ display, placeholder, options, onSearch, onSelect, onClear, onOpen }: ComboProps) => {
//   const [open, setOpen] = useState(false)
//   const ref = useRef<HTMLDivElement>(null)
//   const inputRef = useRef<HTMLInputElement>(null)
//   const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 })

//   useEffect(() => {
//     const h = (e: MouseEvent) => {
//       if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
//     }
//     document.addEventListener('mousedown', h)
//     return () => document.removeEventListener('mousedown', h)
//   }, [])

//   const handleFocus = () => {
//     setOpen(true)
//     onOpen()
//     if (inputRef.current) {
//       const rect = inputRef.current.getBoundingClientRect()
//       setDropdownPos({
//         top: rect.bottom + window.scrollY,
//         left: rect.left + window.scrollX,
//         width: rect.width,
//       })
//     }
//   }

//   const handleSearch = (q: string) => {
//     onSearch(q)
//     setOpen(true)
//     if (inputRef.current) {
//       const rect = inputRef.current.getBoundingClientRect()
//       setDropdownPos({
//         top: rect.bottom + window.scrollY,
//         left: rect.left + window.scrollX,
//         width: rect.width,
//       })
//     }
//   }

//   return (
//     <div className="relative" ref={ref}>
//       <input
//         ref={inputRef}
//         type="text"
//         value={display}
//         onChange={(e) => handleSearch(e.target.value)}
//         onFocus={handleFocus}
//         placeholder={placeholder}
//         className="w-full rounded-md border border-slate-300 px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
//       />
//       <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
//         {display && onClear && (
//           <button type="button" onClick={() => { onClear(); setOpen(false) }}
//             className="text-slate-400 hover:text-slate-600 text-xs leading-none">✕</button>
//         )}
//         <ChevronDown className="w-3.5 h-3.5 text-slate-400 pointer-events-none" />
//       </div>
//       {open && options.length > 0 && (
//         <div 
//           className="fixed z-50 max-h-44 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-xl text-sm"
//           style={{
//             top: `${dropdownPos.top}px`,
//             left: `${dropdownPos.left}px`,
//             width: `${dropdownPos.width}px`,
//           }}
//         >
//           {options.map((opt) => (
//             <button key={opt.name} type="button"
//               className="block w-full text-left px-3 py-2 hover:bg-blue-50"
//               onClick={() => { onSelect(opt); setOpen(false) }}>
//               <div className="font-medium">{opt.label || opt.name}</div>
//               {(opt as any).designation && (
//                 <div className="text-[11px] text-slate-500">{(opt as any).designation}</div>
//               )}
//             </button>
//           ))}
//         </div>
//       )}
//     </div>
//   )
// }

// // ─── Modal props ──────────────────────────────────────────────────────────────
// interface CreateNurseTaskModalProps {
//   patient?: string
//   onClose: () => void
//   onSuccess: () => void
//   defaultTaskType?: string
//   defaultMedication?: string
//   defaultMedicationName?: string
//   defaultDosage?: string
//   defaultDescription?: string
//   defaultScheduledTime?: string
// }

// export const CreateNurseTaskModal = ({
//   patient,
//   onClose,
//   onSuccess,
//   defaultTaskType,
//   defaultMedication,
//   defaultMedicationName,
//   defaultDosage,
//   defaultDescription,
//   defaultScheduledTime,
// }: CreateNurseTaskModalProps) => {
//   const defaultDatetime = () => {
//     const d = defaultScheduledTime ? new Date(defaultScheduledTime) : new Date()
//     return d.toISOString().slice(0, 16)
//   }

//   // ── Core form state ──
//   const [form, setForm] = useState({
//     task_type: defaultTaskType || TASK_TYPES[0],
//     description: defaultDescription || '',
//     priority: 'Routine',
//     scheduled_time: defaultDatetime(),
//     due_time: '',
//     dosage: defaultDosage || '',
//     is_prn: false,
//     prn_indication: '',
//     min_interval_hours: '',
//     notes: '',
//   })

//   // ── Reference doctype + encounter ──
//   const [refDoctype, setRefDoctype] = useState<RefDoctype>('')
//   const [encounter, setEncounter] = useState('')
//   const [encounterDisplay, setEncounterDisplay] = useState('')
//   const [encounterOptions, setEncounterOptions] = useState<LinkFieldOption[]>([])

//   // ── Assigned nurse (Healthcare Practitioner) ──
//   const [assignedNurse, setAssignedNurse] = useState('')
//   const [nurseDisplay, setNurseDisplay] = useState('')
//   const [nurseOptions, setNurseOptions] = useState<LinkFieldOption[]>([])

//   // ── Route of Administration ──
//   const [route, setRoute] = useState('')
//   const [routeDisplay, setRouteDisplay] = useState('')
//   const [routeOptions, setRouteOptions] = useState<LinkFieldOption[]>([])

//   // ── Shift (Shift Assignment) ──
//   const [shift, setShift] = useState('')
//   const [shiftDisplay, setShiftDisplay] = useState('')
//   const [shiftOptions, setShiftOptions] = useState<LinkFieldOption[]>([])

//   // ── Cost Center ──
//   const [costCenter, setCostCenter] = useState('')
//   const [costCenterDisplay, setCostCenterDisplay] = useState('')
//   const [costCenterOptions, setCostCenterOptions] = useState<LinkFieldOption[]>([])

//   // ── Frequency (Prescription Frequency) ──
//   const [frequency, setFrequency] = useState('')
//   const [frequencyDisplay, setFrequencyDisplay] = useState('')
//   const [frequencyOptions, setFrequencyOptions] = useState<LinkFieldOption[]>([])

//   // ── Tab state ──
//   const [activeTab, setActiveTab] = useState<'basic' | 'medication'>('basic')

//   const [submitting, setSubmitting] = useState(false)
//   const [error, setError] = useState<string | null>(null)

//   // Load encounter options whenever reference doctype or patient changes
//   useEffect(() => {
//     setEncounter('')
//     setEncounterDisplay('')
//     setEncounterOptions([])
//     if (!refDoctype || !patient) return
//     const load = async () => {
//       try {
//         if (refDoctype === 'Patient Visit') {
//           const opts = await fetchPatientVisits(patient)
//           setEncounterOptions(opts)
//         } else if (refDoctype === 'Inpatient Admission') {
//           const opts = await fetchInpatientAdmissions(patient)
//           setEncounterOptions(opts)
//         }
//       } catch {
//         setEncounterOptions([])
//       }
//     }
//     load()
//   }, [refDoctype, patient])

//   const loadNurseOptions = useCallback(async (q?: string) => {
//     try {
//       const opts = await fetchHealthcarePractitioners(q || undefined)
//       setNurseOptions(opts)
//     } catch { setNurseOptions([]) }
//   }, [])

//   const loadRouteOptions = useCallback(async (q?: string) => {
//     try {
//       const opts = await fetchRouteOfAdministrationList(q || undefined)
//       setRouteOptions(opts)
//     } catch { setRouteOptions([]) }
//   }, [])

//   const loadShiftOptions = useCallback(async (q?: string) => {
//     // Shift Assignment — use frappe resource API directly
//     try {
//       const params = new URLSearchParams()
//       if (q) params.append('filters', JSON.stringify([['shift_type', 'like', `%${q}%`]]))
//       params.append('fields', JSON.stringify(['name', 'shift_type']))
//       params.append('limit', '50')
//       const res = await fetch(`/api/resource/Shift Assignment?${params.toString()}`)
//       const data = await res.json()
//       const list = (data?.data || []) as { name: string; shift_type?: string }[]
//       setShiftOptions(list.map((r) => ({ name: r.name, label: r.shift_type || r.name })))
//     } catch { setShiftOptions([]) }
//   }, [])

//   const loadCostCenterOptions = useCallback(async (q?: string) => {
//     try {
//       const opts = await fetchBranches(q || undefined)
//       setCostCenterOptions(opts)
//     } catch { setCostCenterOptions([]) }
//   }, [])

//   const loadFrequencyOptions = useCallback(async (q?: string) => {
//     try {
//       const opts = await fetchPrescriptionFrequencies(q || undefined)
//       setFrequencyOptions(opts)
//     } catch { setFrequencyOptions([]) }
//   }, [])

//   const set = (field: string, value: string | boolean) =>
//     setForm((prev) => ({ ...prev, [field]: value }))

//   const handleSubmit = async (e: React.FormEvent) => {
//     e.preventDefault()
//     setError(null)

//     if (!patient) {
//       setError('A patient must be selected before creating a nurse task.')
//       return
//     }

//     const toDatetime = (v: string) =>
//       v ? new Date(v).toISOString().replace('T', ' ').slice(0, 19) : undefined

//     const payload: CreateNurseTaskData = {
//       patient,
//       task_type: form.task_type,
//       scheduled_time: toDatetime(form.scheduled_time) ?? '',
//       due_time: form.due_time ? toDatetime(form.due_time) : undefined,
//       description: form.description || undefined,
//       priority: form.priority,
//       assigned_nurse: assignedNurse || undefined,
//       shift: shift || undefined,
//       cost_center: costCenter || undefined,
//       medication: defaultMedication || undefined,
//       dosage: form.dosage || undefined,
//       route: route || undefined,
//       frequency: frequency || undefined,
//       is_prn: form.is_prn,
//       prn_indication: form.is_prn ? (form.prn_indication || undefined) : undefined,
//       min_interval_hours: form.min_interval_hours ? Number(form.min_interval_hours) : undefined,
//       notes: form.notes || undefined,
//       reference_doctype: refDoctype || undefined,
//       encounter: encounter || undefined,
//     }

//     try {
//       setSubmitting(true)
//       await createNurseTask(payload)
//       toast.success('Nurse task created')
//       onSuccess()
//       onClose()
//     } catch (err) {
//       const msg = err instanceof Error ? err.message : 'Failed to create nurse task'
//       setError(msg)
//       toast.error(msg)
//     } finally {
//       setSubmitting(false)
//     }
//   }

//   const showMedSection = defaultMedication || form.task_type === 'Medication Administration'

//   return (
//     <div className={CREATE_MODAL_OVERLAY}>
//       <div className={createModalShellClass('max-w-lg w-full max-h-[90vh]')}>

//         {/* Header */}
//         <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 shrink-0">
//           <h2 className="text-base font-semibold text-slate-900">New Nurse Task</h2>
//           <button type="button" onClick={onClose}
//             className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100">
//             <X className="w-5 h-5" />
//           </button>
//         </div>

//         {/* Tabs */}
//         <div className="flex border-b border-slate-200 px-5 shrink-0 bg-slate-50">
//           <button
//             type="button"
//             onClick={() => setActiveTab('basic')}
//             className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
//               activeTab === 'basic'
//                 ? 'border-primary text-primary'
//                 : 'border-transparent text-slate-600 hover:text-slate-900'
//             }`}
//           >
//             Basic Info
//           </button>
//           {showMedSection && (
//             <button
//               type="button"
//               onClick={() => setActiveTab('medication')}
//               className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
//                 activeTab === 'medication'
//                   ? 'border-primary text-primary'
//                   : 'border-transparent text-slate-600 hover:text-slate-900'
//               }`}
//             >
//               Medication & Notes
//             </button>
//           )}
//         </div>

//         <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
//           {error && (
//             <div className="px-5 py-2 text-sm text-red-700 bg-red-50 border-b border-red-200 shrink-0">
//               {error}
//             </div>
//           )}

//           {/* BASIC TAB */}
//           {activeTab === 'basic' && (
//             <div className="flex-1 overflow-y-auto p-5 space-y-4 text-sm min-h-[500px]">

//               {/* ── Patient (read-only) ── */}
//               <div>
//                 <label className="block text-xs font-medium text-slateate-600 mb-1">Patient</label>
//                 <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
//                   {patient || <span className="text-slate-400">No patient selected</span>}
//                 </div>
//               </div>

//               {/* ── Reference Type + Encounter (dynamic link) ── */}
//               <div className="grid grid-cols-2 gap-3">
//                 <div>
//                   <label className="block text-xs font-medium text-slate-600 mb-1">Reference Type</label>
//                   <select
//                     value={refDoctype}
//                     onChange={(e) => setRefDoctype(e.target.value as RefDoctype)}
//                     className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
//                   >
//                     {REF_DOCTYPES.map((d) => (
//                       <option key={d} value={d}>{d || 'Select type…'}</option>
//                     ))}
//                   </select>
//                 </div>
//                 <div>
//                   <label className="block text-xs font-medium text-slate-600 mb-1">
//                     {refDoctype || 'Encounter'}
//                   </label>
//                   <Combo
//                     value={encounter}
//                     display={encounterDisplay}
//                     placeholder={refDoctype ? `Search ${refDoctype}…` : 'Select type first'}
//                     options={encounterOptions}
//                     onOpen={() => {}}
//                     onSearch={(q) => {
//                       setEncounterDisplay(q)
//                       setEncounter('')
//                       if (!refDoctype || !patient) return
//                       if (refDoctype === 'Patient Visit') {
//                         fetchPatientVisits(patient).then(setEncounterOptions).catch(() => {})
//                       } else {
//                         fetchInpatientAdmissions(patient).then(setEncounterOptions).catch(() => {})
//                       }
//                     }}
//                     onSelect={(opt) => {
//                       setEncounter(opt.name)
//                       setEncounterDisplay(opt.label || opt.name)
//                     }}
//                     onClear={() => { setEncounter(''); setEncounterDisplay('') }}
//                   />
//                 </div>
//               </div>

//               {/* ── Task Type + Priority ── */}
//               <div className="grid grid-cols-2 gap-3">
//                 <div>
//                   <label className="block text-xs font-medium text-slate-600 mb-1">
//                     Task Type <span className="text-red-500">*</span>
//                   </label>
//                   <select
//                     value={form.task_type}
//                     onChange={(e) => set('task_type', e.target.value)}
//                     className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
//                     required
//                   >
//                     {TASK_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
//                   </select>
//                 </div>
//                 <div>
//                   <label className="block text-xs font-medium text-slate-600 mb-1">Priority</label>
//                   <select
//                     value={form.priority}
//                     onChange={(e) => set('priority', e.target.value)}
//                     className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
//                   >
//                     <option>Routine</option>
//                     <option>Urgent</option>
//                     <option>STAT</option>
//                   </select>
//                 </div>
//               </div>

//               {/* ── Description ── */}
//               <div>
//                 <label className="block text-xs font-medium text-slate-600 mb-1">Description</label>
//                 <textarea
//                   value={form.description}
//                   onChange={(e) => set('description', e.target.value)}
//                   rows={2}
//                   placeholder="Details about this task…"
//                   className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
//                 />
//               </div>

//               {/* ── Scheduled + Due time ── */}
//               <div className="grid grid-cols-2 gap-3">
//                 <div>
//                   <label className="block text-xs font-medium text-slate-600 mb-1">
//                     Scheduled Time <span className="text-red-500">*</span>
//                   </label>
//                   <input type="datetime-local" value={form.scheduled_time}
//                     onChange={(e) => set('scheduled_time', e.target.value)}
//                     className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
//                     required />
//                 </div>
//                 <div>
//                   <label className="block text-xs font-medium text-slate-600 mb-1">Due Time</label>
//                   <input type="datetime-local" value={form.due_time}
//                     onChange={(e) => set('due_time', e.target.value)}
//                     className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
//                   />
//                 </div>
//               </div>

//               {/* ── Assigned Nurse + Shift ── */}
//               <div className="grid grid-cols-2 gap-3">
//                 <div>
//                   <label className="block text-xs font-medium text-slate-600 mb-1">Assigned Nurse</label>
//                   <Combo
//                     value={assignedNurse}
//                     display={nurseDisplay}
//                     placeholder="Search practitioner…"
//                     options={nurseOptions}
//                     onOpen={() => loadNurseOptions()}
//                     onSearch={(q) => { setNurseDisplay(q); setAssignedNurse(''); loadNurseOptions(q) }}
//                     onSelect={(opt) => { setAssignedNurse(opt.name); setNurseDisplay(opt.label || opt.name) }}
//                     onClear={() => { setAssignedNurse(''); setNurseDisplay('') }}
//                   />
//                 </div>
//                 <div>
//                   <label className="block text-xs font-medium text-slate-600 mb-1">Shift</label>
//                   <Combo
//                     value={shift}
//                     display={shiftDisplay}
//                     placeholder="Search shift…"
//                     options={shiftOptions}
//                     onOpen={() => loadShiftOptions()}
//                     onSearch={(q) => { setShiftDisplay(q); setShift(''); loadShiftOptions(q) }}
//                     onSelect={(opt) => { setShift(opt.name); setShiftDisplay(opt.label || opt.name) }}
//                     onClear={() => { setShift(''); setShiftDisplay('') }}
//                   />
//                 </div>
//               </div>

//               {/* ── Cost Center ── */}
//               <div>
//                 <label className="block text-xs font-medium text-slate-600 mb-1">Cost Center</label>
//                 <Combo
//                   value={costCenter}
//                   display={costCenterDisplay}
//                   placeholder="Search cost center…"
//                   options={costCenterOptions}
//                   onOpen={() => loadCostCenterOptions()}
//                   onSearch={(q) => { setCostCenterDisplay(q); setCostCenter(''); loadCostCenterOptions(q) }}
//                   onSelect={(opt) => { setCostCenter(opt.name); setCostCenterDisplay(opt.label || opt.name) }}
//                   onClear={() => { setCostCenter(''); setCostCenterDisplay('') }}
//                 />
//               </div>
//             </div>
//           )}

//           {/* MEDICATION & NOTES TAB */}
//           {activeTab === 'medication' && showMedSection && (
//             <div className="flex-1 overflow-y-auto p-5 space-y-4 text-sm min-h-[500px]">
//               {/* ── Medication Info ── */}
//               <div className="rounded-md border border-blue-200 bg-blue-50 p-3 space-y-3">
//                 <p className="text-xs font-semibold text-blue-800">Medication Information</p>

//                 {defaultMedicationName && (
//                   <div>
//                     <label className="block text-xs font-medium text-slate-600 mb-1">Medicine</label>
//                     <div className="text-sm text-slate-700 font-medium">{defaultMedicationName}</div>
//                   </div>
//                 )}

//                 {/* Dosage + Route */}
//                 <div className="grid grid-cols-2 gap-3">
//                   <div>
//                     <label className="block text-xs font-medium text-slate-600 mb-1">Dosage</label>
//                     <input
//                       type="text"
//                       value={form.dosage}
//                       onChange={(e) => set('dosage', e.target.value)}
//                       placeholder="e.g. 1-0-1"
//                       className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
//                     />
//                   </div>
//                   <div>
//                     <label className="block text-xs font-medium text-slate-600 mb-1">Administration Route</label>
//                     <Combo
//                       value={route}
//                       display={routeDisplay}
//                       placeholder="Search route…"
//                       options={routeOptions}
//                       onOpen={() => loadRouteOptions()}
//                       onSearch={(q) => { setRouteDisplay(q); setRoute(''); loadRouteOptions(q) }}
//                       onSelect={(opt) => { setRoute(opt.name); setRouteDisplay(opt.label || opt.name) }}
//                       onClear={() => { setRoute(''); setRouteDisplay('') }}
//                     />
//                   </div>
//                 </div>

//                 {/* Frequency */}
//                 <div>
//                   <label className="block text-xs font-medium text-slate-600 mb-1">Frequency</label>
//                   <Combo
//                     value={frequency}
//                     display={frequencyDisplay}
//                     placeholder="Search frequency…"
//                     options={frequencyOptions}
//                     onOpen={() => loadFrequencyOptions()}
//                     onSearch={(q) => { setFrequencyDisplay(q); setFrequency(''); loadFrequencyOptions(q) }}
//                     onSelect={(opt) => { setFrequency(opt.name); setFrequencyDisplay(opt.label || opt.name) }}
//                     onClear={() => { setFrequency(''); setFrequencyDisplay('') }}
//                   />
//                 </div>

//                 {/* PRN */}
//                 <label className="flex items-center gap-2 cursor-pointer text-sm">
//                   <input
//                     type="checkbox"
//                     checked={form.is_prn}
//                     onChange={(e) => set('is_prn', e.target.checked)}
//                     className="w-4 h-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
//                   />
//                   <span className="text-slate-700">PRN (as-needed)</span>
//                 </label>

//                 {form.is_prn && (
//                   <div className="grid grid-cols-2 gap-3">
//                     <div>
//                       <label className="block text-xs font-medium text-slate-600 mb-1">PRN Indication</label>
//                       <input
//                         type="text"
//                         value={form.prn_indication}
//                         onChange={(e) => set('prn_indication', e.target.value)}
//                         placeholder="e.g. Pain > 6/10"
//                         className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
//                       />
//                     </div>
//                     <div>
//                       <label className="block text-xs font-medium text-slate-600 mb-1">Min Interval (hrs)</label>
//                       <input
//                         type="number"
//                         min={0}
//                         step={0.5}
//                         value={form.min_interval_hours}
//                         onChange={(e) => set('min_interval_hours', e.target.value)}
//                         placeholder="e.g. 4"
//                         className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
//                       />
//                     </div>
//                   </div>
//                 )}
//               </div>

//               {/* ── Notes ── */}
//               <div>
//                 <label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
//                 <textarea
//                   value={form.notes}
//                   onChange={(e) => set('notes', e.target.value)}
//                   rows={6}
//                   placeholder="Any additional notes…"
//                   className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
//                 />
//               </div>
//             </div>
//           )}

//           {/* Footer */}
//           <div className="px-5 py-4 border-t border-slate-200 flex justify-end gap-2 shrink-0">
//             <button type="button" onClick={onClose}
//               className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-md hover:bg-slate-200">
//               Cancel
//             </button>
//             <button type="submit" disabled={submitting || !patient}
//               className={CM_BTN_PRIMARY}>
//               {submitting ? 'Creating…' : 'Create Task'}
//             </button>
//           </div>
//         </form>
//       </div>
//     </div>
//   )
// }

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  CM_BTN_PRIMARY,
  CREATE_MODAL_OVERLAY,
  createModalShellClass,
} from '../ui/CreateModalChrome'
import { createNurseTask, type CreateNurseTaskData } from '../../services/nurseTask'
import {
  fetchHealthcarePractitioners,
  getCurrentUserPractitioner,
  fetchRouteOfAdministrationList,
  fetchPatientVisits,
  fetchInpatientAdmissions,
  fetchBranches,
  fetchPrescriptionFrequencies,
  type LinkFieldOption,
} from '../../services/common'
import { toast } from '../../hooks/useToast'
import { X, ChevronDown } from 'lucide-react'
import { useCareContext } from '../../providers/CareContextProvider'

const TASK_TYPES = [
  'Medication Administration',
  'Vital Monitoring',
  'Therapy Assistance',
  'Grooming / Care',
  'Lab Support',
  'Documentation',
]

// const REF_DOCTYPES = ['', 'Patient Visit', 'Inpatient Admission'] as const
// type RefDoctype = (typeof REF_DOCTYPES)[number]

// ─── Reusable inline combobox ─────────────────────────────────────────────────
interface ComboProps {
  value: string
  display: string
  placeholder: string
  options: LinkFieldOption[]
  onSearch: (q: string) => void
  onSelect: (opt: LinkFieldOption) => void
  onClear?: () => void
  onOpen: () => void
  disabled?: boolean
}

const Combo = ({ display, placeholder, options, onSearch, onSelect, onClear, onOpen, disabled }: ComboProps) => {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 })

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const handleFocus = () => {
    if (disabled) return
    setOpen(true)
    onOpen()
    if (inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect()
      setDropdownPos({
        top: rect.bottom + window.scrollY,
        left: rect.left + window.scrollX,
        width: rect.width,
      })
    }
  }

  const handleSearch = (q: string) => {
    if (disabled) return
    onSearch(q)
    setOpen(true)
    if (inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect()
      setDropdownPos({
        top: rect.bottom + window.scrollY,
        left: rect.left + window.scrollX,
        width: rect.width,
      })
    }
  }

  return (
    <div className="relative" ref={ref}>
      <input
        ref={inputRef}
        type="text"
        value={display}
        onChange={(e) => handleSearch(e.target.value)}
        onFocus={handleFocus}
        placeholder={placeholder}
        disabled={disabled}
        className={`w-full rounded-md border border-slate-300 px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-primary ${disabled ? 'bg-slate-100 cursor-not-allowed' : ''}`}
      />
      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
        {display && onClear && !disabled && (
          <button type="button" onClick={() => { onClear(); setOpen(false) }}
            className="text-slate-400 hover:text-slate-600 text-xs leading-none">✕</button>
        )}
        <ChevronDown className="w-3.5 h-3.5 text-slate-400 pointer-events-none" />
      </div>
      {open && !disabled && options.length > 0 && (
        <div 
          className="fixed z-50 max-h-44 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-xl text-sm"
          style={{
            top: `${dropdownPos.top}px`,
            left: `${dropdownPos.left}px`,
            width: `${dropdownPos.width}px`,
          }}
        >
          {options.map((opt) => (
            <button key={opt.name} type="button"
              className="block w-full text-left px-3 py-2 hover:bg-blue-50"
              onClick={() => { onSelect(opt); setOpen(false) }}>
              <div className="font-medium">{opt.label || opt.name}</div>
              {(opt as any).designation && (
                <div className="text-[11px] text-slate-500">{(opt as any).designation}</div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Modal props ──────────────────────────────────────────────────────────────
interface CreateNurseTaskModalProps {
  patient?: string
  onClose: () => void
  onSuccess: () => void
  defaultTaskType?: string
  defaultMedication?: string
  defaultMedicationName?: string
  defaultDosage?: string
  defaultDescription?: string
  defaultScheduledTime?: string
}

export const CreateNurseTaskModal = ({
  patient,
  onClose,
  onSuccess,
  defaultTaskType,
  defaultMedication,
  defaultMedicationName,
  defaultDosage,
  defaultDescription,
  defaultScheduledTime,
}: CreateNurseTaskModalProps) => {
  // Get context from CareContextProvider
  const { mode, activeVisit, activeAdmission, selectedPatient: contextPatient } = useCareContext()
  
  // Determine if we're in IP or OP mode based on context
  const isIPMode = mode === 'IP'
  const isOPMode = mode === 'OP'
  
  const defaultDatetime = () => {
    const d = defaultScheduledTime ? new Date(defaultScheduledTime) : new Date()
    return d.toISOString().slice(0, 16)
  }

  // Get effective patient
  const effectivePatient = patient || contextPatient || ''

  // ── Core form state ──
  const [form, setForm] = useState({
    task_type: defaultTaskType || TASK_TYPES[0],
    description: defaultDescription || '',
    priority: 'Routine',
    scheduled_time: defaultDatetime(),
    due_time: '',
    dosage: defaultDosage || '',
    is_prn: false,
    prn_indication: '',
    min_interval_hours: '',
    notes: '',
  })

  // ── Reference doctype + encounter (now determined by mode) ──
  const refDoctype = isIPMode ? 'Inpatient Admission' : isOPMode ? 'Patient Visit' : ''
  const [encounter, setEncounter] = useState(() => {
    if (isIPMode && activeAdmission) return activeAdmission
    if (isOPMode && activeVisit) return activeVisit
    return ''
  })
  const [encounterDisplay, setEncounterDisplay] = useState('')
  const [encounterOptions, setEncounterOptions] = useState<LinkFieldOption[]>([])

  // ── Assigned nurse (Healthcare Practitioner) ──
  const [assignedNurse, setAssignedNurse] = useState('')
  const [nurseDisplay, setNurseDisplay] = useState('')
  const [nurseOptions, setNurseOptions] = useState<LinkFieldOption[]>([])

  // ── Route of Administration ──
  const [route, setRoute] = useState('')
  const [routeDisplay, setRouteDisplay] = useState('')
  const [routeOptions, setRouteOptions] = useState<LinkFieldOption[]>([])

  // ── Shift (Shift Assignment) ──
  const [shift, setShift] = useState('')
  const [shiftDisplay, setShiftDisplay] = useState('')
  const [shiftOptions, setShiftOptions] = useState<LinkFieldOption[]>([])

  // ── Cost Center ──
  const [costCenter, setCostCenter] = useState('')
  const [costCenterDisplay, setCostCenterDisplay] = useState('')
  const [costCenterOptions, setCostCenterOptions] = useState<LinkFieldOption[]>([])

  // ── Frequency (Prescription Frequency) ──
  const [frequency, setFrequency] = useState('')
  const [frequencyDisplay, setFrequencyDisplay] = useState('')
  const [frequencyOptions, setFrequencyOptions] = useState<LinkFieldOption[]>([])

  // ── Tab state ──
  const [activeTab, setActiveTab] = useState<'basic' | 'medication'>('basic')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Auto-load encounter label if context exists
  useEffect(() => {
    if (isIPMode && activeAdmission && effectivePatient) {
      const loadAdmissionLabel = async () => {
        try {
          const admissions = await fetchInpatientAdmissions(effectivePatient, activeAdmission)
          const matched = admissions.find(a => a.name === activeAdmission)
          if (matched) {
            setEncounterDisplay(matched.label)
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
            setEncounterDisplay(matched.label)
          }
        } catch (err) {
          console.error('Failed to load visit label:', err)
        }
      }
      loadVisitLabel()
    }
  }, [isIPMode, isOPMode, activeAdmission, activeVisit, effectivePatient])

  // Load encounter options whenever reference doctype or patient changes
  useEffect(() => {
    if (!refDoctype || !effectivePatient) return
    const load = async () => {
      try {
        if (refDoctype === 'Patient Visit') {
          const opts = await fetchPatientVisits(effectivePatient)
          setEncounterOptions(opts)
          // If we have activeVisit and no encounterDisplay yet, try to find it
          if (isOPMode && activeVisit && !encounterDisplay) {
            const matched = opts.find(v => v.name === activeVisit)
            if (matched) setEncounterDisplay(matched.label)
          }
        } else if (refDoctype === 'Inpatient Admission') {
          const opts = await fetchInpatientAdmissions(effectivePatient)
          setEncounterOptions(opts)
          // If we have activeAdmission and no encounterDisplay yet, try to find it
          if (isIPMode && activeAdmission && !encounterDisplay) {
            const matched = opts.find(a => a.name === activeAdmission)
            if (matched) setEncounterDisplay(matched.label)
          }
        }
      } catch {
        setEncounterOptions([])
      }
    }
    load()
  }, [refDoctype, effectivePatient, isOPMode, isIPMode, activeVisit, activeAdmission, encounterDisplay])

  const loadNurseOptions = useCallback(async (q?: string) => {
    try {
      const opts = await fetchHealthcarePractitioners(q || undefined)
      setNurseOptions(opts)
    } catch { setNurseOptions([]) }
  }, [])

  // Auto-populate assigned nurse if current user is a healthcare practitioner
  useEffect(() => {
    const autoPopulateNurse = async () => {
      try {
        const practitioner = await getCurrentUserPractitioner()
        if (practitioner) {
          setAssignedNurse(practitioner)
          setNurseDisplay(practitioner)
        }
      } catch (err) {
        console.error('Failed to auto-populate assigned nurse:', err)
        // If this fails, leave field blank - user can select manually
      }
    }
    
    autoPopulateNurse()
  }, [])

  const loadRouteOptions = useCallback(async (q?: string) => {
    try {
      const opts = await fetchRouteOfAdministrationList(q || undefined)
      setRouteOptions(opts)
    } catch { setRouteOptions([]) }
  }, [])

  const loadShiftOptions = useCallback(async (q?: string) => {
    // Shift Assignment — use frappe resource API directly
    try {
      const params = new URLSearchParams()
      if (q) params.append('filters', JSON.stringify([['shift_type', 'like', `%${q}%`]]))
      params.append('fields', JSON.stringify(['name', 'shift_type']))
      params.append('limit', '50')
      const res = await fetch(`/api/resource/Shift Assignment?${params.toString()}`)
      const data = await res.json()
      const list = (data?.data || []) as { name: string; shift_type?: string }[]
      setShiftOptions(list.map((r) => ({ name: r.name, label: r.shift_type || r.name })))
    } catch { setShiftOptions([]) }
  }, [])

  const loadCostCenterOptions = useCallback(async (q?: string) => {
    try {
      const opts = await fetchBranches(q || undefined)
      setCostCenterOptions(opts)
    } catch { setCostCenterOptions([]) }
  }, [])

  const loadFrequencyOptions = useCallback(async (q?: string) => {
    try {
      const opts = await fetchPrescriptionFrequencies(q || undefined)
      setFrequencyOptions(opts)
    } catch { setFrequencyOptions([]) }
  }, [])

  const set = (field: string, value: string | boolean) =>
    setForm((prev) => ({ ...prev, [field]: value }))

  // Get mode-specific help text
  const getModeHelpText = () => {
    if (isIPMode) {
      return `Creating nurse task for IP admission: ${encounter || 'not selected yet'}`
    }
    if (isOPMode) {
      return `Creating nurse task for OP visit: ${encounter || 'not selected yet'}`
    }
    return 'Select either IP or OP mode from the context switcher above'
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!effectivePatient) {
      setError('A patient must be selected before creating a nurse task.')
      return
    }

    if (!refDoctype) {
      setError('Please select either IP or OP mode from the navbar')
      return
    }

    if (!encounter) {
      setError(isIPMode ? 'Please select an inpatient admission' : 'Please select a patient visit')
      return
    }

    const toDatetime = (v: string) =>
      v ? new Date(v).toISOString().replace('T', ' ').slice(0, 19) : undefined

    const payload: CreateNurseTaskData = {
      patient: effectivePatient,
      task_type: form.task_type,
      scheduled_time: toDatetime(form.scheduled_time) ?? '',
      due_time: form.due_time ? toDatetime(form.due_time) : undefined,
      description: form.description || undefined,
      priority: form.priority,
      assigned_nurse: assignedNurse || undefined,
      shift: shift || undefined,
      cost_center: costCenter || undefined,
      medication: defaultMedication || undefined,
      dosage: form.dosage || undefined,
      route: route || undefined,
      frequency: frequency || undefined,
      is_prn: form.is_prn,
      prn_indication: form.is_prn ? (form.prn_indication || undefined) : undefined,
      min_interval_hours: form.min_interval_hours ? Number(form.min_interval_hours) : undefined,
      notes: form.notes || undefined,
      reference_doctype: refDoctype || undefined,
      encounter: encounter || undefined,
    }

    try {
      setSubmitting(true)
      await createNurseTask(payload)
      toast.success('Nurse task created')
      onSuccess()
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create nurse task'
      setError(msg)
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  const showMedSection = defaultMedication || form.task_type === 'Medication Administration'
  const isContextLocked = Boolean(isIPMode || isOPMode)

  return (
    <div className={CREATE_MODAL_OVERLAY}>
      <div className={createModalShellClass('max-w-lg w-full max-h-[90vh]')}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-slate-900">New Nurse Task</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {isIPMode && <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-[10px] font-medium mr-2">IP Mode Active</span>}
              {isOPMode && <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-[10px] font-medium mr-2">OP Mode Active</span>}
              {getModeHelpText()}
            </p>
          </div>
          <button type="button" onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode indicator box */}
        <div className="mx-5 mt-4 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
          <p className="text-xs font-semibold text-primary mb-1">
            {isIPMode ? '🏥 Creating Nurse Task for Inpatient' : isOPMode ? '👤 Creating Nurse Task for Outpatient' : '📋 Select Context'}
          </p>
          <p className="text-xs text-slate-600">
            {isIPMode 
              ? `The nurse task will be linked to the selected inpatient admission. Make sure you have an admission selected below.`
              : isOPMode
              ? `The nurse task will be linked to the selected outpatient visit. Make sure you have a visit selected below.`
              : 'Please select either IP or OP mode from the top navbar before creating a nurse task.'
            }
          </p>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 px-5 shrink-0 bg-slate-50 mt-3">
          <button
            type="button"
            onClick={() => setActiveTab('basic')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'basic'
                ? 'border-primary text-primary'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            Basic Info
          </button>
          {showMedSection && (
            <button
              type="button"
              onClick={() => setActiveTab('medication')}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'medication'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              Medication & Notes
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          {error && (
            <div className="px-5 py-2 text-sm text-red-700 bg-red-50 border-b border-red-200 shrink-0">
              {error}
            </div>
          )}

          {/* BASIC TAB */}
          {activeTab === 'basic' && (
            <div className="flex-1 overflow-y-auto p-5 space-y-4 text-sm min-h-[500px]">

              {/* ── Patient (read-only) ── */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Patient <span className="text-red-500">*</span>
                </label>
                <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  {effectivePatient || <span className="text-slate-400">No patient selected</span>}
                </div>
                {contextPatient && (
                  <p className="text-xs text-slate-400 mt-1">Patient auto-selected from context</p>
                )}
              </div>

              {/* ── Reference Type + Encounter (now determined by mode) ── */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Reference Type <span className="text-red-500">*</span>
                  </label>
                  <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                    {refDoctype || '— Select IP/OP mode from navbar —'}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    {refDoctype || 'Encounter'} <span className="text-red-500">*</span>
                  </label>
                  {activeAdmission || activeVisit ? (
                    <div>
                      <input
                        type="text"
                        value={encounterDisplay}
                        readOnly
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-slate-100 cursor-not-allowed"
                      />
                      <p className="text-xs text-slate-400 mt-1">Auto-selected from {isIPMode ? 'IP' : 'OP'} context</p>
                    </div>
                  ) : (
                    <Combo
                      value={encounter}
                      display={encounterDisplay}
                      placeholder={refDoctype ? `Search ${refDoctype}…` : 'Select IP/OP mode first'}
                      options={encounterOptions}
                      onOpen={() => {}}
                      onSearch={(q) => {
                        setEncounterDisplay(q)
                        setEncounter('')
                        if (!refDoctype || !effectivePatient) return
                        if (refDoctype === 'Patient Visit') {
                          fetchPatientVisits(effectivePatient).then(setEncounterOptions).catch(() => {})
                        } else {
                          fetchInpatientAdmissions(effectivePatient).then(setEncounterOptions).catch(() => {})
                        }
                      }}
                      onSelect={(opt) => {
                        setEncounter(opt.name)
                        setEncounterDisplay(opt.label || opt.name)
                      }}
                      onClear={() => { setEncounter(''); setEncounterDisplay('') }}
                      disabled={!isContextLocked}
                    />
                  )}
                </div>
              </div>

              {/* ── Task Type + Priority ── */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Task Type <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={form.task_type}
                    onChange={(e) => set('task_type', e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                    required
                  >
                    {TASK_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Priority</label>
                  <select
                    value={form.priority}
                    onChange={(e) => set('priority', e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                  >
                    <option>Routine</option>
                    <option>Urgent</option>
                    <option>STAT</option>
                  </select>
                </div>
              </div>

              {/* ── Description ── */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => set('description', e.target.value)}
                  rows={2}
                  placeholder="Details about this task…"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                />
              </div>

              {/* ── Scheduled + Due time ── */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Scheduled Time <span className="text-red-500">*</span>
                  </label>
                  <input type="datetime-local" value={form.scheduled_time}
                    onChange={(e) => set('scheduled_time', e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                    required />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Due Time</label>
                  <input type="datetime-local" value={form.due_time}
                    onChange={(e) => set('due_time', e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                  />
                </div>
              </div>

              {/* ── Assigned Nurse + Shift ── */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Assigned Nurse</label>
                  <Combo
                    value={assignedNurse}
                    display={nurseDisplay}
                    placeholder="Search practitioner…"
                    options={nurseOptions}
                    onOpen={() => loadNurseOptions()}
                    onSearch={(q) => { setNurseDisplay(q); setAssignedNurse(''); loadNurseOptions(q) }}
                    onSelect={(opt) => { setAssignedNurse(opt.name); setNurseDisplay(opt.label || opt.name) }}
                    onClear={() => { setAssignedNurse(''); setNurseDisplay('') }}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Shift</label>
                  <Combo
                    value={shift}
                    display={shiftDisplay}
                    placeholder="Search shift…"
                    options={shiftOptions}
                    onOpen={() => loadShiftOptions()}
                    onSearch={(q) => { setShiftDisplay(q); setShift(''); loadShiftOptions(q) }}
                    onSelect={(opt) => { setShift(opt.name); setShiftDisplay(opt.label || opt.name) }}
                    onClear={() => { setShift(''); setShiftDisplay('') }}
                  />
                </div>
              </div>

              {/* ── Cost Center ── */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Cost Center</label>
                <Combo
                  value={costCenter}
                  display={costCenterDisplay}
                  placeholder="Search cost center…"
                  options={costCenterOptions}
                  onOpen={() => loadCostCenterOptions()}
                  onSearch={(q) => { setCostCenterDisplay(q); setCostCenter(''); loadCostCenterOptions(q) }}
                  onSelect={(opt) => { setCostCenter(opt.name); setCostCenterDisplay(opt.label || opt.name) }}
                  onClear={() => { setCostCenter(''); setCostCenterDisplay('') }}
                />
              </div>
            </div>
          )}

          {/* MEDICATION & NOTES TAB */}
          {activeTab === 'medication' && showMedSection && (
            <div className="flex-1 overflow-y-auto p-5 space-y-4 text-sm min-h-[500px]">
              {/* ── Medication Info ── */}
              <div className="rounded-md border border-blue-200 bg-blue-50 p-3 space-y-3">
                <p className="text-xs font-semibold text-blue-800">Medication Information</p>

                {defaultMedicationName && (
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Medicine</label>
                    <div className="text-sm text-slate-700 font-medium">{defaultMedicationName}</div>
                  </div>
                )}

                {/* Dosage + Route */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Dosage</label>
                    <input
                      type="text"
                      value={form.dosage}
                      onChange={(e) => set('dosage', e.target.value)}
                      placeholder="e.g. 1-0-1"
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Administration Route</label>
                    <Combo
                      value={route}
                      display={routeDisplay}
                      placeholder="Search route…"
                      options={routeOptions}
                      onOpen={() => loadRouteOptions()}
                      onSearch={(q) => { setRouteDisplay(q); setRoute(''); loadRouteOptions(q) }}
                      onSelect={(opt) => { setRoute(opt.name); setRouteDisplay(opt.label || opt.name) }}
                      onClear={() => { setRoute(''); setRouteDisplay('') }}
                    />
                  </div>
                </div>

                {/* Frequency */}
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Frequency</label>
                  <Combo
                    value={frequency}
                    display={frequencyDisplay}
                    placeholder="Search frequency…"
                    options={frequencyOptions}
                    onOpen={() => loadFrequencyOptions()}
                    onSearch={(q) => { setFrequencyDisplay(q); setFrequency(''); loadFrequencyOptions(q) }}
                    onSelect={(opt) => { setFrequency(opt.name); setFrequencyDisplay(opt.label || opt.name) }}
                    onClear={() => { setFrequency(''); setFrequencyDisplay('') }}
                  />
                </div>

                {/* PRN */}
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <input
                    type="checkbox"
                    checked={form.is_prn}
                    onChange={(e) => set('is_prn', e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                  />
                  <span className="text-slate-700">PRN (as-needed)</span>
                </label>

                {form.is_prn && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">PRN Indication</label>
                      <input
                        type="text"
                        value={form.prn_indication}
                        onChange={(e) => set('prn_indication', e.target.value)}
                        placeholder="e.g. Pain > 6/10"
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Min Interval (hrs)</label>
                      <input
                        type="number"
                        min={0}
                        step={0.5}
                        value={form.min_interval_hours}
                        onChange={(e) => set('min_interval_hours', e.target.value)}
                        placeholder="e.g. 4"
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* ── Notes ── */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => set('notes', e.target.value)}
                  rows={6}
                  placeholder="Any additional notes…"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                />
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="px-5 py-4 border-t border-slate-200 flex justify-end gap-2 shrink-0">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-md hover:bg-slate-200">
              Cancel
            </button>
            <button type="submit" disabled={submitting || !effectivePatient || (!isIPMode && !isOPMode) || (isIPMode && !encounter) || (isOPMode && !encounter)}
              className={CM_BTN_PRIMARY}>
              {submitting ? 'Creating…' : 'Create Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
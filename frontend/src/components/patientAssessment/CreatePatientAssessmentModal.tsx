
// import { useEffect, useRef, useState } from 'react'
// import { ChevronDown, ChevronUp, Trash2, ClipboardList } from 'lucide-react'
// import {
//   createPatientAssessment,
//   fetchAssessmentTemplates,
//   fetchTemplateParameters,
//   fetchAssessmentParameters,
//   type AssessmentSheetRow,
//   type AssessmentTemplateOption,
// } from '../../services/patientAssessment'
// import {
//   fetchPatientVisits,
//   fetchInpatientAdmissions,
//   fetchHealthcarePractitioners,
//   fetchCompanies,
//   type LinkFieldOption,
// } from '../../services/common'
// import { searchPatients, fetchPatients, type PatientListItem } from '../../services/patients'
// import { useCareContext } from '../../providers/CareContextProvider'

// interface CreatePatientAssessmentModalProps {
//   onClose: () => void
//   onSuccess: () => void
//   patient?: string
// }

// type TabId = 'details' | 'sheet' | 'more'

// const TABS: { id: TabId; label: string }[] = [
//   { id: 'details', label: 'Details' },
//   { id: 'sheet', label: 'Assessment Sheet' },
//   { id: 'more', label: 'More Info' },
// ]

// const nowLocal = () => {
//   const d = new Date()
//   const pad = (n: number) => String(n).padStart(2, '0')
//   return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
// }

// /** Simple inline combobox (header-level fields) */
// const Combo = ({
//   label,
//   required,
//   placeholder,
//   displayValue,
//   onQueryChange,
//   onOpen,
//   open,
//   options,
//   onSelect,
//   loading,
//   disabled,
// }: {
//   label: string
//   required?: boolean
//   placeholder: string
//   displayValue: string
//   onQueryChange: (q: string) => void
//   onOpen: () => void
//   open: boolean
//   options: { name: string; label: string }[]
//   onSelect: (opt: { name: string; label: string }) => void
//   loading?: boolean
//   disabled?: boolean
// }) => (
//   <div>
//     <label className="block text-sm font-medium text-slate-700 mb-1">
//       {label} {required && <span className="text-red-500">*</span>}
//     </label>
//     <div className="relative">
//       <input
//         type="text"
//         disabled={disabled}
//         value={displayValue}
//         onChange={(e) => onQueryChange(e.target.value)}
//         onFocus={onOpen}
//         placeholder={placeholder}
//         className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-slate-50 disabled:text-slate-400"
//       />
//       {loading && <span className="absolute right-3 top-2.5 text-xs text-slate-400">…</span>}
//       {open && options.length > 0 && (
//         <div className="absolute z-20 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-48 overflow-y-auto top-full">
//           {options.map((o) => (
//             <button key={o.name} type="button" onClick={() => onSelect(o)}
//               className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100">
//               {o.label}
//             </button>
//           ))}
//         </div>
//       )}
//     </div>
//   </div>
// )

// export const CreatePatientAssessmentModal = ({
//   onClose,
//   onSuccess,
//   patient,
// }: CreatePatientAssessmentModalProps) => {
//   // Get context from CareContextProvider
//   const { mode, activeVisit, activeAdmission, selectedPatient: contextPatient } = useCareContext()
  
//   // Determine if we're in IP or OP mode based on context
//   const isIPMode = mode === 'IP'
//   const isOPMode = mode === 'OP'
  
//   const [activeTab, setActiveTab] = useState<TabId>('details')
//   const [saving, setSaving] = useState(false)
//   const [error, setError] = useState<string | null>(null)

//   // ── Core fields ──────────────────────────────────────────────────────────────
//   const [patientId, setPatientId] = useState(patient || contextPatient || '')
//   const [patientName, setPatientName] = useState('')
//   // Reference type is now determined by global mode
//   const referenceType = isIPMode ? 'Inpatient Admission' : isOPMode ? 'Patient Visit' : ''
//   const [encounterId, setEncounterId] = useState(() => {
//     if (isIPMode && activeAdmission) return activeAdmission
//     if (isOPMode && activeVisit) return activeVisit
//     return ''
//   })
//   const [assessmentDatetime, setAssessmentDatetime] = useState(nowLocal())
//   const [assessmentDescription, setAssessmentDescription] = useState('')
//   const [familyHistory, setFamilyHistory] = useState('')
//   const [companyId, setCompanyId] = useState('')
//   const [therapySession, setTherapySession] = useState('')

//   // ── Assessment sheet ─────────────────────────────────────────────────────────
//   const [sheetRows, setSheetRows] = useState<AssessmentSheetRow[]>([])
//   const [scaleMin, setScaleMin] = useState(0)
//   const [scaleMax, setScaleMax] = useState(100)
//   const [loadingTemplate, setLoadingTemplate] = useState(false)
//   const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set())

//   // All available assessment parameters (loaded once)
//   const [allParameters, setAllParameters] = useState<AssessmentTemplateOption[]>([])
//   const allParamsLoaded = useRef(false)

//   // Per-row combobox state
//   const [paramOpen, setParamOpen] = useState<Record<number, boolean>>({})
//   const [paramQuery, setParamQuery] = useState<Record<number, string>>({})

//   // ── Header combobox states ────────────────────────────────────────────────────
//   const [patientQuery, setPatientQuery] = useState('')
//   const [patientOpen, setPatientOpen] = useState(false)
//   const [patientOptions, setPatientOptions] = useState<PatientListItem[]>([])
//   const [patientLoading, setPatientLoading] = useState(false)

//   const [templateQuery, setTemplateQuery] = useState('')
//   const [templateOpen, setTemplateOpen] = useState(false)
//   const [templateOptions, setTemplateOptions] = useState<AssessmentTemplateOption[]>([])
//   const [selectedTemplate, setSelectedTemplate] = useState<AssessmentTemplateOption | null>(null)

//   const [encounterQuery, setEncounterQuery] = useState('')
//   const [encounterOpen, setEncounterOpen] = useState(false)
//   const [encounterOptions, setEncounterOptions] = useState<LinkFieldOption[]>([])
//   const [selectedEncounter, setSelectedEncounter] = useState<LinkFieldOption | null>(null)

//   const [practQuery, setPractQuery] = useState('')
//   const [practOpen, setPractOpen] = useState(false)
//   const [practOptions, setPractOptions] = useState<LinkFieldOption[]>([])
//   const [selectedPract, setSelectedPract] = useState<LinkFieldOption | null>(null)

//   const [companyQuery, setCompanyQuery] = useState('')
//   const [companyOpen, setCompanyOpen] = useState(false)
//   const [companyOptions, setCompanyOptions] = useState<LinkFieldOption[]>([])
//   const [selectedCompany, setSelectedCompany] = useState<LinkFieldOption | null>(null)

//   // ── Load all assessment parameters once ───────────────────────────────────────
//   useEffect(() => {
//     if (allParamsLoaded.current) return
//     allParamsLoaded.current = true
//     fetchAssessmentParameters().then(setAllParameters).catch(() => {})
//   }, [])

//   // ── Patient label on mount ────────────────────────────────────────────────────
//   useEffect(() => {
//     const patientToLoad = patient || contextPatient
//     if (!patientToLoad) return
//     fetchPatients(1, 0, patientToLoad).then((res) => {
//       if (res.length > 0) { setPatientQuery(res[0].patient_name); setPatientName(res[0].patient_name) }
//     }).catch(() => {})
//   }, [patient, contextPatient])

//   // ── Auto-load encounter label if context exists ──────────────────────────────
//   useEffect(() => {
//     if (isIPMode && activeAdmission && patientId) {
//       const loadAdmissionLabel = async () => {
//         try {
//           const admissions = await fetchInpatientAdmissions(patientId, activeAdmission)
//           const matched = admissions.find(a => a.name === activeAdmission)
//           if (matched) {
//             setSelectedEncounter(matched)
//             setEncounterQuery(matched.label)
//           }
//         } catch (err) {
//           console.error('Failed to load admission label:', err)
//         }
//       }
//       loadAdmissionLabel()
//     } else if (isOPMode && activeVisit && patientId) {
//       const loadVisitLabel = async () => {
//         try {
//           const visits = await fetchPatientVisits(patientId, activeVisit)
//           const matched = visits.find(v => v.name === activeVisit)
//           if (matched) {
//             setSelectedEncounter(matched)
//             setEncounterQuery(matched.label)
//           }
//         } catch (err) {
//           console.error('Failed to load visit label:', err)
//         }
//       }
//       loadVisitLabel()
//     }
//   }, [isIPMode, isOPMode, activeAdmission, activeVisit, patientId])

//   // ── Patient options ───────────────────────────────────────────────────────────
//   useEffect(() => {
//     if (!patientOpen) return
//     let c = false
//     const run = async () => {
//       setPatientLoading(true)
//       try {
//         const res = patientQuery.trim() ? await searchPatients(patientQuery, 20) : await fetchPatients(20, 0)
//         if (!c) setPatientOptions(res)
//       } catch { if (!c) setPatientOptions([]) }
//       finally { if (!c) setPatientLoading(false) }
//     }
//     const t = setTimeout(run, patientQuery.trim() ? 300 : 0)
//     return () => { c = true; clearTimeout(t) }
//   }, [patientQuery, patientOpen])

//   // ── Template options ──────────────────────────────────────────────────────────
//   useEffect(() => {
//     if (!templateOpen) return
//     let c = false
//     const t = setTimeout(async () => {
//       try { const res = await fetchAssessmentTemplates(templateQuery || undefined); if (!c) setTemplateOptions(res) }
//       catch { if (!c) setTemplateOptions([]) }
//     }, templateQuery.trim() ? 300 : 0)
//     return () => { c = true; clearTimeout(t) }
//   }, [templateQuery, templateOpen])

//   // ── Encounter options (based on mode) ─────────────────────────────────────────
//   useEffect(() => {
//     if (!encounterOpen || !referenceType) return
//     let c = false
//     const t = setTimeout(async () => {
//       try {
//         const res = referenceType === 'Patient Visit'
//           ? await fetchPatientVisits(patientId || undefined, encounterQuery || undefined)
//           : await fetchInpatientAdmissions(patientId || undefined, encounterQuery || undefined)
//         if (!c) setEncounterOptions(res)
//       } catch { if (!c) setEncounterOptions([]) }
//     }, encounterQuery.trim() ? 300 : 0)
//     return () => { c = true; clearTimeout(t) }
//   }, [encounterQuery, encounterOpen, referenceType, patientId])

//   // ── Practitioner options ──────────────────────────────────────────────────────
//   useEffect(() => {
//     if (!practOpen) return
//     let c = false
//     const t = setTimeout(async () => {
//       try { const res = await fetchHealthcarePractitioners(practQuery || undefined); if (!c) setPractOptions(res) }
//       catch { if (!c) setPractOptions([]) }
//     }, practQuery.trim() ? 300 : 0)
//     return () => { c = true; clearTimeout(t) }
//   }, [practQuery, practOpen])

//   // ── Company options ───────────────────────────────────────────────────────────
//   useEffect(() => {
//     if (!companyOpen) return
//     let c = false
//     const t = setTimeout(async () => {
//       try { const res = await fetchCompanies(companyQuery || undefined); if (!c) setCompanyOptions(res) }
//       catch { if (!c) setCompanyOptions([]) }
//     }, companyQuery.trim() ? 300 : 0)
//     return () => { c = true; clearTimeout(t) }
//   }, [companyQuery, companyOpen])

//   // ── Template selection: load parameters ──────────────────────────────────────
//   const handleTemplateSelect = async (tmpl: AssessmentTemplateOption) => {
//     setSelectedTemplate(tmpl)
//     setTemplateQuery(tmpl.label)
//     setTemplateOpen(false)
//     setLoadingTemplate(true)
//     try {
//       const data = await fetchTemplateParameters(tmpl.name)
//       setScaleMin(data.scale_min)
//       setScaleMax(data.scale_max)
//       const rows = data.parameters.map((p) => ({ parameter: p.parameter, score: 0, time: '', comments: '', yes: false }))
//       setSheetRows(rows)
//       setParamQuery(Object.fromEntries(rows.map((r, i) => [i, r.parameter])))
//       setExpandedRows(new Set(rows.map((_, i) => i)))
//     } catch {
//       // leave rows as-is
//     } finally {
//       setLoadingTemplate(false)
//     }
//   }

//   // ── Sheet row helpers ─────────────────────────────────────────────────────────
//   const addSheetRow = () => {
//     const idx = sheetRows.length
//     setSheetRows((prev) => [...prev, { parameter: '', score: 0, time: '', comments: '', yes: false }])
//     setExpandedRows((prev) => new Set([...prev, idx]))
//     setParamQuery((prev) => ({ ...prev, [idx]: '' }))
//   }

//   const removeSheetRow = (idx: number) => {
//     setSheetRows((prev) => prev.filter((_, i) => i !== idx))
//     setExpandedRows((prev) => { const n = new Set(prev); n.delete(idx); return n })
//   }

//   const updateRow = (idx: number, field: keyof AssessmentSheetRow, value: string | number | boolean) =>
//     setSheetRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)))

//   const toggleExpanded = (idx: number) =>
//     setExpandedRows((prev) => {
//       const n = new Set(prev)
//       n.has(idx) ? n.delete(idx) : n.add(idx)
//       return n
//     })

//   // Filtered parameter options for a row's query
//   const paramOptionsFor = (idx: number) => {
//     const q = (paramQuery[idx] || '').toLowerCase()
//     if (!q) return allParameters
//     return allParameters.filter((p) => p.label.toLowerCase().includes(q))
//   }

//   const totalObtained = sheetRows.reduce((s, r) => s + (Number(r.score) || 0), 0)

//   // Get mode-specific help text
//   const getModeHelpText = () => {
//     if (isIPMode) {
//       return `Creating assessment for IP admission: ${encounterId || 'not selected yet'}`
//     }
//     if (isOPMode) {
//       return `Creating assessment for OP visit: ${encounterId || 'not selected yet'}`
//     }
//     return 'Select either IP or OP mode from the context switcher above'
//   }

//   // ── Submit ────────────────────────────────────────────────────────────────────
//   const handleSubmit = async (e: React.FormEvent) => {
//     e.preventDefault()
//     if (!patientId) { setError('Patient is required'); return }
//     if (!assessmentDatetime) { setError('Assessment date / time is required'); return }
//     if (!referenceType) { setError('Please select either IP or OP mode from the navbar'); return }
//     if (!encounterId) { 
//       setError(isIPMode ? 'Please select an inpatient admission' : 'Please select a patient visit')
//       return 
//     }
//     setSaving(true); setError(null)
//     try {
//       const result = await createPatientAssessment({
//         patient: patientId,
//         patient_name: patientName || undefined,
//         assessment_template: selectedTemplate?.name || undefined,
//         reference_type: referenceType || undefined,
//         encounter: encounterId || undefined,
//         healthcare_practitioner: selectedPract?.name || undefined,
//         company: companyId || undefined,
//         therapy_session: therapySession || undefined,
//         assessment_datetime: assessmentDatetime,
//         assessment_description: assessmentDescription || undefined,
//         family_history: familyHistory || undefined,
//         assessment_sheet: sheetRows.filter((r) => r.parameter.trim()),
//       })
//       if (result.success) {
//         onSuccess()
//       } else {
//         setError(result.message || 'Failed to create assessment')
//       }
//     } catch (e) {
//       setError(e instanceof Error ? e.message : 'Failed to create assessment')
//     } finally {
//       setSaving(false)
//     }
//   }

//   const closeAllDropdowns = () => {
//     setPatientOpen(false); setTemplateOpen(false); setEncounterOpen(false)
//     setPractOpen(false); setCompanyOpen(false)
//     setParamOpen({})
//   }

//   return (
//     <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
//       <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full mx-4 max-h-[92vh] overflow-hidden flex flex-col">

//         {/* ── Header ───────────────────────────────────────────────────────── */}
//         <div className="px-5 py-4 border-b border-slate-200 flex-shrink-0 flex items-center justify-between">
//           <div>
//             <h2 className="text-lg font-semibold text-slate-900">New Patient Assessment</h2>
//             <p className="text-xs text-slate-500 mt-0.5">
//               {isIPMode && <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-[10px] font-medium mr-2">IP Mode Active</span>}
//               {isOPMode && <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-[10px] font-medium mr-2">OP Mode Active</span>}
//               {getModeHelpText()}
//             </p>
//           </div>
//           <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
//             <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
//               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
//             </svg>
//           </button>
//         </div>

//         {/* ── Tabs ─────────────────────────────────────────────────────────── */}
//         <div className="flex border-b border-slate-200 px-5 flex-shrink-0 bg-white">
//           {TABS.map((tab) => (
//             <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)}
//               className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
//                 activeTab === tab.id ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-700'
//               }`}
//             >
//               {tab.label}
//               {tab.id === 'sheet' && sheetRows.length > 0 && (
//                 <span className="ml-1.5 text-[11px] bg-primary/10 text-primary rounded-full px-1.5 py-0.5 font-semibold">
//                   {sheetRows.length}
//                 </span>
//               )}
//             </button>
//           ))}
//         </div>

//         <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0"
//           onClick={(e) => { if (!(e.target as HTMLElement).closest('.relative')) closeAllDropdowns() }}
//         >
//           <div className="flex-1 overflow-y-auto p-5 space-y-4 min-h-0">

//             {/* Mode indicator box */}
//             <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
//               <p className="text-xs font-semibold text-primary mb-1">
//                 {isIPMode ? '🏥 Creating Assessment for Inpatient' : isOPMode ? '👤 Creating Assessment for Outpatient' : '📋 Select Context'}
//               </p>
//               <p className="text-xs text-slate-600">
//                 {isIPMode 
//                   ? `The assessment will be linked to the selected inpatient admission. Make sure you have an admission selected below.`
//                   : isOPMode
//                   ? `The assessment will be linked to the selected outpatient visit. Make sure you have a visit selected below.`
//                   : 'Please select either IP or OP mode from the top navbar before creating an assessment.'
//                 }
//               </p>
//             </div>

//             {/* ═══ DETAILS TAB ════════════════════════════════════════════════ */}
//             {activeTab === 'details' && (
//               <>
//                 {/* Reference Type + Encounter - Now determined by mode */}
//                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
//                   <div>
//                     <label className="block text-sm font-medium text-slate-700 mb-1">Reference Type</label>
//                     <div className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-slate-50">
//                       {referenceType || '— Select IP/OP mode from navbar —'}
//                     </div>
//                   </div>
//                   <div className="relative">
//                     <label className="block text-sm font-medium text-slate-700 mb-1">
//                       Encounter <span className="text-red-500">*</span>
//                     </label>
//                     {(isIPMode && activeAdmission) || (isOPMode && activeVisit) ? (
//                       <div>
//                         <input
//                           type="text"
//                           value={selectedEncounter?.label || encounterId}
//                           readOnly
//                           className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-slate-100 cursor-not-allowed"
//                         />
//                         <p className="text-xs text-slate-400 mt-1">Auto-selected from {isIPMode ? 'IP' : 'OP'} context</p>
//                       </div>
//                     ) : (
//                       <>
//                         <input type="text" disabled={!referenceType}
//                           value={encounterOpen ? encounterQuery : (selectedEncounter?.label ?? encounterQuery)}
//                           onChange={(e) => {
//                             setEncounterQuery(e.target.value); setEncounterOpen(true)
//                             if (!e.target.value) { setEncounterId(''); setSelectedEncounter(null) }
//                           }}
//                           onFocus={() => referenceType && setEncounterOpen(true)}
//                           placeholder={referenceType ? `Search ${referenceType}…` : 'Select IP/OP mode first'}
//                           className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-slate-50 disabled:text-slate-400"
//                         />
//                         {encounterOpen && encounterOptions.length > 0 && (
//                           <div className="absolute z-20 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-48 overflow-y-auto top-full">
//                             {encounterOptions.map((enc) => (
//                               <button key={enc.name} type="button"
//                                 onClick={() => { setEncounterId(enc.name); setSelectedEncounter(enc); setEncounterQuery(enc.label); setEncounterOpen(false) }}
//                                 className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100"
//                               >{enc.label}</button>
//                             ))}
//                           </div>
//                         )}
//                       </>
//                     )}
//                   </div>
//                 </div>

//                 {/* Patient */}
//                 <div className="relative">
//                   <label className="block text-sm font-medium text-slate-700 mb-1">
//                     Patient <span className="text-red-500">*</span>
//                   </label>
//                   <input type="text" value={patientQuery}
//                     onChange={(e) => { setPatientQuery(e.target.value); setPatientOpen(true); if (!e.target.value) { setPatientId(''); setPatientName('') } }}
//                     onFocus={() => setPatientOpen(true)}
//                     placeholder="Search patient…"
//                     className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
//                     disabled={Boolean(contextPatient)}
//                   />
//                   {contextPatient && <p className="text-xs text-slate-400 mt-1">Patient auto-selected from context</p>}
//                   {patientLoading && <span className="absolute right-3 top-9 text-xs text-slate-400">Loading…</span>}
//                   {patientOpen && !contextPatient && patientOptions.length > 0 && (
//                     <div className="absolute z-20 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-48 overflow-y-auto top-full">
//                       {patientOptions.map((p) => (
//                         <button key={p.name} type="button"
//                           onClick={() => {
//                             setPatientId(p.name); setPatientQuery(p.patient_name); setPatientName(p.patient_name); setPatientOpen(false)
//                             setEncounterId(''); setEncounterQuery(''); setSelectedEncounter(null)
//                           }}
//                           className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100"
//                         >
//                           <div className="font-medium">{p.patient_name}</div>
//                           {p.mobile && <div className="text-xs text-slate-500">{p.mobile}</div>}
//                         </button>
//                       ))}
//                     </div>
//                   )}
//                 </div>

//                 {/* Template */}
//                 <div>
//                   <label className="block text-sm font-medium text-slate-700 mb-1">Assessment Template</label>
//                   <div className="relative flex gap-2">
//                     <input type="text"
//                       value={templateOpen ? templateQuery : (selectedTemplate?.label ?? templateQuery)}
//                       onChange={(e) => { setTemplateQuery(e.target.value); setTemplateOpen(true); if (!e.target.value) { setSelectedTemplate(null); setSheetRows([]) } }}
//                       onFocus={() => setTemplateOpen(true)}
//                       placeholder="Search template…"
//                       className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
//                     />
//                     {selectedTemplate && (
//                       <button type="button" onClick={() => setActiveTab('sheet')}
//                         className="flex-shrink-0 px-3 py-2 text-xs font-medium text-white bg-primary rounded-md hover:bg-primary/90 whitespace-nowrap"
//                       >
//                         Edit Sheet {loadingTemplate ? '…' : `(${sheetRows.length})`}
//                       </button>
//                     )}
//                     {templateOpen && templateOptions.length > 0 && (
//                       <div className="absolute z-20 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-48 overflow-y-auto top-full left-0">
//                         {templateOptions.map((t) => (
//                           <button key={t.name} type="button" onClick={() => handleTemplateSelect(t)}
//                             className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100">{t.label}</button>
//                         ))}
//                       </div>
//                     )}
//                   </div>
//                   {selectedTemplate && (
//                     <p className="text-xs text-slate-500 mt-1">
//                       {loadingTemplate ? 'Loading parameters…' : `${sheetRows.length} parameter${sheetRows.length !== 1 ? 's' : ''} loaded — go to Assessment Sheet tab to enter scores.`}
//                     </p>
//                   )}
//                 </div>

//                 {/* Assessment Date/Time */}
//                 <div>
//                   <label className="block text-sm font-medium text-slate-700 mb-1">
//                     Assessment Date / Time <span className="text-red-500">*</span>
//                   </label>
//                   <input type="datetime-local" value={assessmentDatetime}
//                     onChange={(e) => setAssessmentDatetime(e.target.value)}
//                     className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
//                   />
//                 </div>

//                 {/* Practitioner + Company */}
//                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
//                   <Combo label="Healthcare Practitioner" placeholder="Search practitioner…"
//                     displayValue={practOpen ? practQuery : (selectedPract?.label ?? practQuery)}
//                     onQueryChange={(q) => { setPractQuery(q); setPractOpen(true); if (!q) setSelectedPract(null) }}
//                     onOpen={() => setPractOpen(true)} open={practOpen} options={practOptions}
//                     onSelect={(o) => { setSelectedPract(o); setPractQuery(o.label); setPractOpen(false) }}
//                   />
//                   <Combo label="Company" placeholder="Search company…"
//                     displayValue={companyOpen ? companyQuery : (selectedCompany?.label ?? companyQuery)}
//                     onQueryChange={(q) => { setCompanyQuery(q); setCompanyOpen(true); if (!q) { setCompanyId(''); setSelectedCompany(null) } }}
//                     onOpen={() => setCompanyOpen(true)} open={companyOpen} options={companyOptions}
//                     onSelect={(o) => { setCompanyId(o.name); setSelectedCompany(o); setCompanyQuery(o.label); setCompanyOpen(false) }}
//                   />
//                 </div>

//                 {/* Therapy Session */}
//                 <div>
//                   <label className="block text-sm font-medium text-slate-700 mb-1">Therapy Session</label>
//                   <input type="text" value={therapySession} onChange={(e) => setTherapySession(e.target.value)}
//                     placeholder="Therapy session ID (optional)"
//                     className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
//                   />
//                 </div>

//                 {/* Description */}
//                 <div>
//                   <label className="block text-sm font-medium text-slate-700 mb-1">Assessment Description</label>
//                   <textarea rows={3} value={assessmentDescription} onChange={(e) => setAssessmentDescription(e.target.value)}
//                     placeholder="Brief description of the assessment…"
//                     className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
//                   />
//                 </div>
//               </>
//             )}

//             {/* ═══ ASSESSMENT SHEET TAB ═══════════════════════════════════════ */}
//             {activeTab === 'sheet' && (
//               <div className="space-y-3">
//                 {/* Scale + score summary */}
//                 {sheetRows.length > 0 && (
//                   <div className="flex items-center gap-4 text-xs text-slate-600 bg-blue-50 border border-blue-200 rounded-md px-3 py-2.5">
//                     <span>Scale: <strong>{scaleMin}</strong> – <strong>{scaleMax}</strong></span>
//                     <span className="text-slate-300">|</span>
//                     <span>Total so far: <strong className="text-primary text-sm">{totalObtained}</strong></span>
//                   </div>
//                 )}

//                 {sheetRows.length === 0 ? (
//                   <div className="text-center py-12 border border-dashed border-slate-300 rounded-lg">
//                     <ClipboardList className="w-10 h-10 text-slate-300 mx-auto mb-3" />
//                     <p className="text-sm text-slate-500 mb-1">No parameters yet.</p>
//                     <p className="text-xs text-slate-400 mb-4">Select a template on the Details tab to auto-load parameters, or add rows manually.</p>
//                     <button type="button" onClick={addSheetRow}
//                       className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary/90">
//                       + Add Parameter Row
//                     </button>
//                   </div>
//                 ) : (
//                   <>
//                     <div className="space-y-3">
//                       {sheetRows.map((row, idx) => {
//                         const isExpanded = expandedRows.has(idx)
//                         const filteredParams = paramOptionsFor(idx)

//                         return (
//                           <div key={idx} className="border border-slate-200 rounded-lg bg-white shadow-sm overflow-visible">
//                             {/* Card header */}
//                             <button type="button" onClick={() => toggleExpanded(idx)}
//                               className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-200 hover:bg-slate-100 transition-colors cursor-pointer"
//                             >
//                               <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
//                                 <ClipboardList className="w-4 h-4 text-primary" />
//                                 <span>Parameter {idx + 1}</span>
//                                 {row.parameter && (
//                                   <span className="text-slate-400 font-normal">— {row.parameter}</span>
//                                 )}
//                                 {row.score > 0 && (
//                                   <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-primary/10 text-primary border border-primary/20">
//                                     Score: {row.score}
//                                   </span>
//                                 )}
//                               </div>
//                               <div className="flex items-center gap-2">
//                                 <button type="button" onClick={(e) => { e.stopPropagation(); removeSheetRow(idx) }}
//                                   className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
//                                   title="Remove">
//                                   <Trash2 className="w-4 h-4" />
//                                 </button>
//                                 <div className="text-slate-400">
//                                   {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
//                                 </div>
//                               </div>
//                             </button>

//                             {/* Expanded body */}
//                             {isExpanded && (
//                               <div className="p-4 space-y-4">
//                                 {/* Row 1: Parameter (full width dropdown) */}
//                                 <div>
//                                   <label className="block text-xs font-medium text-slate-600 mb-1">
//                                     Parameter <span className="text-red-500">*</span>
//                                   </label>
//                                   <div className="relative">
//                                     <input type="text"
//                                       value={paramOpen[idx] ? (paramQuery[idx] ?? row.parameter) : row.parameter}
//                                       onChange={(e) => {
//                                         setParamQuery((prev) => ({ ...prev, [idx]: e.target.value }))
//                                         setParamOpen((prev) => ({ ...prev, [idx]: true }))
//                                         if (!e.target.value) updateRow(idx, 'parameter', '')
//                                       }}
//                                       onFocus={() => {
//                                         setParamQuery((prev) => ({ ...prev, [idx]: '' }))
//                                         setParamOpen((prev) => ({ ...prev, [idx]: true }))
//                                       }}
//                                       placeholder="Search assessment parameter…"
//                                       className="w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
//                                     />
//                                     {paramOpen[idx] && filteredParams.length > 0 && (
//                                       <div className="absolute z-30 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-52 overflow-y-auto top-full">
//                                         {filteredParams.map((p) => (
//                                           <button key={p.name} type="button"
//                                             onClick={() => {
//                                               updateRow(idx, 'parameter', p.name)
//                                               setParamQuery((prev) => ({ ...prev, [idx]: p.label }))
//                                               setParamOpen((prev) => ({ ...prev, [idx]: false }))
//                                             }}
//                                             className="w-full text-left px-3 py-2.5 text-sm hover:bg-slate-100"
//                                           >{p.label}</button>
//                                         ))}
//                                       </div>
//                                     )}
//                                   </div>
//                                 </div>

//                                 {/* Row 2: Score + Time + Yes */}
//                                 <div className="grid grid-cols-3 gap-3">
//                                   <div>
//                                     <label className="block text-xs font-medium text-slate-600 mb-1"></label>
//                                     <div className="flex items-center h-[42px]">
//                                       <input
//                                         type="checkbox"
//                                         checked={!!(row as any).yes}
//                                         onChange={(e) => updateRow(idx, 'yes' as any, e.target.checked)}
//                                         className="w-5 h-5 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer accent-primary"
//                                       />
//                                       <span className="ml-2 text-sm text-slate-600">{(row as any).yes ? 'Yes' : 'No'}</span>
//                                     </div>
//                                   </div>
//                                   <div>
//                                     <label className="block text-xs font-medium text-slate-600 mb-1">
//                                       Score <span className="text-slate-400">({scaleMin}–{scaleMax || '∞'})</span>
//                                     </label>
//                                     <input type="number"
//                                       min={scaleMin} max={scaleMax || undefined} step="0.1"
//                                       value={row.score}
//                                       onChange={(e) => updateRow(idx, 'score', parseFloat(e.target.value) || 0)}
//                                       className="w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
//                                     />
//                                   </div>
//                                   <div>
//                                     <label className="block text-xs font-medium text-slate-600 mb-1">Time</label>
//                                     <input type="time" value={row.time || ''}
//                                       onChange={(e) => updateRow(idx, 'time', e.target.value)}
//                                       className="w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
//                                     />
//                                   </div>
//                                 </div>

//                                 {/* Row 3: Comments (tall textarea) */}
//                                 <div>
//                                   <label className="block text-xs font-medium text-slate-600 mb-1">Comments</label>
//                                   <textarea rows={3} value={row.comments || ''}
//                                     onChange={(e) => updateRow(idx, 'comments', e.target.value)}
//                                     placeholder="Observations, notes, or remarks for this parameter…"
//                                     className="w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-y min-h-[80px]"
//                                   />
//                                 </div>
//                               </div>
//                             )}
//                           </div>
//                         )
//                       })}
//                     </div>

//                     {/* Add Row + total */}
//                     <div className="flex items-center justify-between pt-1">
//                       <button type="button" onClick={addSheetRow}
//                         className="flex items-center gap-1.5 text-sm text-primary hover:underline font-medium">
//                         <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
//                           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
//                         </svg>
//                         Add Parameter Row
//                       </button>
//                       <span className="text-xs text-slate-500">
//                         Total score: <strong className="text-primary">{totalObtained}</strong>
//                       </span>
//                     </div>
//                   </>
//                 )}
//               </div>
//             )}

//             {/* ═══ MORE INFO TAB ══════════════════════════════════════════════ */}
//             {activeTab === 'more' && (
//               <div>
//                 <label className="block text-sm font-medium text-slate-700 mb-1">Family History</label>
//                 <textarea rows={6} value={familyHistory} onChange={(e) => setFamilyHistory(e.target.value)}
//                   placeholder="Relevant family history…"
//                   className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
//                 />
//               </div>
//             )}

//             {error && (
//               <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">{error}</div>
//             )}
//           </div>

//           {/* ── Footer ───────────────────────────────────────────────────────── */}
//           <div className="border-t border-slate-200 bg-white px-5 py-4 flex items-center justify-between gap-3 flex-shrink-0">
//             <div className="text-xs text-slate-400">
//               {sheetRows.length > 0 && `${sheetRows.filter((r) => r.parameter.trim()).length} / ${sheetRows.length} parameters filled`}
//             </div>
//             <div className="flex gap-3">
//               <button type="button" onClick={onClose}
//                 className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50">
//                 Cancel
//               </button>
//               <button type="submit" disabled={saving || (!isIPMode && !isOPMode) || (isIPMode && !encounterId) || (isOPMode && !encounterId)}
//                 className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50">
//                 {saving ? 'Creating…' : 'Create Assessment'}
//               </button>
//             </div>
//           </div>
//         </form>
//       </div>
//     </div>
//   )
// }


import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, Trash2, ClipboardList } from 'lucide-react'
import {
  createPatientAssessment,
  fetchAssessmentTemplates,
  fetchTemplateParameters,
  fetchAssessmentParameters,
  type AssessmentSheetRow,
  type AssessmentTemplateOption,
} from '../../services/patientAssessment'
import {
  fetchPatientVisits,
  fetchInpatientAdmissions,
  fetchHealthcarePractitioners,
  fetchCompanies,
  type LinkFieldOption,
} from '../../services/common'
import { searchPatients, fetchPatients, type PatientListItem } from '../../services/patients'
import { useCareContext } from '../../providers/CareContextProvider'

interface CreatePatientAssessmentModalProps {
  onClose: () => void
  onSuccess: () => void
  patient?: string
}

type TabId = 'details' | 'sheet' | 'more'

const TABS: { id: TabId; label: string }[] = [
  { id: 'details', label: 'Details' },
  { id: 'sheet', label: 'Assessment Sheet' },
  { id: 'more', label: 'More Info' },
]

const nowLocal = () => {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/** Simple inline combobox (header-level fields) */
const Combo = ({
  label,
  required,
  placeholder,
  displayValue,
  onQueryChange,
  onOpen,
  open,
  options,
  onSelect,
  loading,
  disabled,
}: {
  label: string
  required?: boolean
  placeholder: string
  displayValue: string
  onQueryChange: (q: string) => void
  onOpen: () => void
  open: boolean
  options: { name: string; label: string }[]
  onSelect: (opt: { name: string; label: string }) => void
  loading?: boolean
  disabled?: boolean
}) => (
  <div>
    <label className="block text-sm font-medium text-slate-700 mb-1">
      {label} {required && <span className="text-red-500">*</span>}
    </label>
    <div className="relative">
      <input
        type="text"
        disabled={disabled}
        value={displayValue}
        onChange={(e) => onQueryChange(e.target.value)}
        onFocus={onOpen}
        placeholder={placeholder}
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-slate-50 disabled:text-slate-400"
      />
      {loading && <span className="absolute right-3 top-2.5 text-xs text-slate-400">…</span>}
      {open && options.length > 0 && (
        <div className="absolute z-20 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-48 overflow-y-auto top-full">
          {options.map((o) => (
            <button key={o.name} type="button" onClick={() => onSelect(o)}
              className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100">
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  </div>
)

export const CreatePatientAssessmentModal = ({
  onClose,
  onSuccess,
  patient,
}: CreatePatientAssessmentModalProps) => {
  // Get context from CareContextProvider
  const { mode, activeVisit, activeAdmission, selectedPatient: contextPatient } = useCareContext()
  
  // Determine if we're in IP or OP mode based on context
  const isIPMode = mode === 'IP'
  const isOPMode = mode === 'OP'
  
  const [activeTab, setActiveTab] = useState<TabId>('details')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ── Core fields ──────────────────────────────────────────────────────────────
  const [patientId, setPatientId] = useState(patient || contextPatient || '')
  const [patientName, setPatientName] = useState('')
  // Reference type is now determined by global mode
  const referenceType = isIPMode ? 'Inpatient Admission' : isOPMode ? 'Patient Visit' : ''
  const [encounterId, setEncounterId] = useState(() => {
    if (isIPMode && activeAdmission) return activeAdmission
    if (isOPMode && activeVisit) return activeVisit
    return ''
  })
  const [assessmentDatetime, setAssessmentDatetime] = useState(nowLocal())
  const [assessmentDescription, setAssessmentDescription] = useState('')
  const [familyHistory, setFamilyHistory] = useState('')
  const [companyId, setCompanyId] = useState('')
  const [therapySession, setTherapySession] = useState('')

  // ── Assessment sheet ─────────────────────────────────────────────────────────
  const [sheetRows, setSheetRows] = useState<AssessmentSheetRow[]>([])
  const [loadingTemplate, setLoadingTemplate] = useState(false)
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set())

  // All available assessment parameters (loaded once)
  const [allParameters, setAllParameters] = useState<AssessmentTemplateOption[]>([])
  const allParamsLoaded = useRef(false)

  // Per-row combobox state
  const [paramOpen, setParamOpen] = useState<Record<number, boolean>>({})
  const [paramQuery, setParamQuery] = useState<Record<number, string>>({})

  // ── Header combobox states ────────────────────────────────────────────────────
  const [patientQuery, setPatientQuery] = useState('')
  const [patientOpen, setPatientOpen] = useState(false)
  const [patientOptions, setPatientOptions] = useState<PatientListItem[]>([])
  const [patientLoading, setPatientLoading] = useState(false)

  const [templateQuery, setTemplateQuery] = useState('')
  const [templateOpen, setTemplateOpen] = useState(false)
  const [templateOptions, setTemplateOptions] = useState<AssessmentTemplateOption[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState<AssessmentTemplateOption | null>(null)

  const [encounterQuery, setEncounterQuery] = useState('')
  const [encounterOpen, setEncounterOpen] = useState(false)
  const [encounterOptions, setEncounterOptions] = useState<LinkFieldOption[]>([])
  const [selectedEncounter, setSelectedEncounter] = useState<LinkFieldOption | null>(null)

  const [practQuery, setPractQuery] = useState('')
  const [practOpen, setPractOpen] = useState(false)
  const [practOptions, setPractOptions] = useState<LinkFieldOption[]>([])
  const [selectedPract, setSelectedPract] = useState<LinkFieldOption | null>(null)

  const [companyQuery, setCompanyQuery] = useState('')
  const [companyOpen, setCompanyOpen] = useState(false)
  const [companyOptions, setCompanyOptions] = useState<LinkFieldOption[]>([])
  const [selectedCompany, setSelectedCompany] = useState<LinkFieldOption | null>(null)

  // ── Load all assessment parameters once ───────────────────────────────────────
  useEffect(() => {
    if (allParamsLoaded.current) return
    allParamsLoaded.current = true
    fetchAssessmentParameters().then(setAllParameters).catch(() => {})
  }, [])

  // ── Patient label on mount ────────────────────────────────────────────────────
  useEffect(() => {
    const patientToLoad = patient || contextPatient
    if (!patientToLoad) return
    fetchPatients(1, 0, patientToLoad).then((res) => {
      if (res.length > 0) { setPatientQuery(res[0].patient_name); setPatientName(res[0].patient_name) }
    }).catch(() => {})
  }, [patient, contextPatient])

  // ── Auto-load encounter label if context exists ──────────────────────────────
  useEffect(() => {
    if (isIPMode && activeAdmission && patientId) {
      const loadAdmissionLabel = async () => {
        try {
          const admissions = await fetchInpatientAdmissions(patientId, activeAdmission)
          const matched = admissions.find(a => a.name === activeAdmission)
          if (matched) {
            setSelectedEncounter(matched)
            setEncounterQuery(matched.label)
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
            setSelectedEncounter(matched)
            setEncounterQuery(matched.label)
          }
        } catch (err) {
          console.error('Failed to load visit label:', err)
        }
      }
      loadVisitLabel()
    }
  }, [isIPMode, isOPMode, activeAdmission, activeVisit, patientId])

  // ── Patient options ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!patientOpen) return
    let c = false
    const run = async () => {
      setPatientLoading(true)
      try {
        const res = patientQuery.trim() ? await searchPatients(patientQuery, 20) : await fetchPatients(20, 0)
        if (!c) setPatientOptions(res)
      } catch { if (!c) setPatientOptions([]) }
      finally { if (!c) setPatientLoading(false) }
    }
    const t = setTimeout(run, patientQuery.trim() ? 300 : 0)
    return () => { c = true; clearTimeout(t) }
  }, [patientQuery, patientOpen])

  // ── Template options ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!templateOpen) return
    let c = false
    const t = setTimeout(async () => {
      try { const res = await fetchAssessmentTemplates(templateQuery || undefined); if (!c) setTemplateOptions(res) }
      catch { if (!c) setTemplateOptions([]) }
    }, templateQuery.trim() ? 300 : 0)
    return () => { c = true; clearTimeout(t) }
  }, [templateQuery, templateOpen])

  // ── Encounter options (based on mode) ─────────────────────────────────────────
  useEffect(() => {
    if (!encounterOpen || !referenceType) return
    let c = false
    const t = setTimeout(async () => {
      try {
        const res = referenceType === 'Patient Visit'
          ? await fetchPatientVisits(patientId || undefined, encounterQuery || undefined)
          : await fetchInpatientAdmissions(patientId || undefined, encounterQuery || undefined)
        if (!c) setEncounterOptions(res)
      } catch { if (!c) setEncounterOptions([]) }
    }, encounterQuery.trim() ? 300 : 0)
    return () => { c = true; clearTimeout(t) }
  }, [encounterQuery, encounterOpen, referenceType, patientId])

  // ── Practitioner options ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!practOpen) return
    let c = false
    const t = setTimeout(async () => {
      try { const res = await fetchHealthcarePractitioners(practQuery || undefined); if (!c) setPractOptions(res) }
      catch { if (!c) setPractOptions([]) }
    }, practQuery.trim() ? 300 : 0)
    return () => { c = true; clearTimeout(t) }
  }, [practQuery, practOpen])

  // ── Company options ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!companyOpen) return
    let c = false
    const t = setTimeout(async () => {
      try { const res = await fetchCompanies(companyQuery || undefined); if (!c) setCompanyOptions(res) }
      catch { if (!c) setCompanyOptions([]) }
    }, companyQuery.trim() ? 300 : 0)
    return () => { c = true; clearTimeout(t) }
  }, [companyQuery, companyOpen])

  // ── Template selection: load parameters ──────────────────────────────────────
  const handleTemplateSelect = async (tmpl: AssessmentTemplateOption) => {
    setSelectedTemplate(tmpl)
    setTemplateQuery(tmpl.label)
    setTemplateOpen(false)
    setLoadingTemplate(true)
    try {
      const data = await fetchTemplateParameters(tmpl.name)
      const rows = data.parameters.map((p) => ({ parameter: p.parameter, score: 0, time: '', comments: '' }))
      setSheetRows(rows)
      setParamQuery(Object.fromEntries(rows.map((r, i) => [i, r.parameter])))
      setExpandedRows(new Set(rows.map((_, i) => i)))
    } catch {
      // leave rows as-is
    } finally {
      setLoadingTemplate(false)
    }
  }

  // ── Sheet row helpers ─────────────────────────────────────────────────────────
  const addSheetRow = () => {
    const idx = sheetRows.length
    setSheetRows((prev) => [...prev, { parameter: '', score: 0, time: '', comments: '' }])
    setExpandedRows((prev) => new Set([...prev, idx]))
    setParamQuery((prev) => ({ ...prev, [idx]: '' }))
  }

  const removeSheetRow = (idx: number) => {
    setSheetRows((prev) => prev.filter((_, i) => i !== idx))
    setExpandedRows((prev) => { const n = new Set(prev); n.delete(idx); return n })
  }

  const updateRow = (idx: number, field: keyof AssessmentSheetRow, value: string | boolean) =>
    setSheetRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)))

  const toggleExpanded = (idx: number) =>
    setExpandedRows((prev) => {
      const n = new Set(prev)
      n.has(idx) ? n.delete(idx) : n.add(idx)
      return n
    })

  // Filtered parameter options for a row's query
  const paramOptionsFor = (idx: number) => {
    const q = (paramQuery[idx] || '').toLowerCase()
    if (!q) return allParameters
    return allParameters.filter((p) => p.label.toLowerCase().includes(q))
  }

  // Get mode-specific help text
  const getModeHelpText = () => {
    if (isIPMode) {
      return `Creating assessment for IP admission: ${encounterId || 'not selected yet'}`
    }
    if (isOPMode) {
      return `Creating assessment for OP visit: ${encounterId || 'not selected yet'}`
    }
    return 'Select either IP or OP mode from the context switcher above'
  }

  // ── Submit ────────────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!patientId) { setError('Patient is required'); return }
    if (!assessmentDatetime) { setError('Assessment date / time is required'); return }
    if (!referenceType) { setError('Please select either IP or OP mode from the navbar'); return }
    if (!encounterId) { 
      setError(isIPMode ? 'Please select an inpatient admission' : 'Please select a patient visit')
      return 
    }
    setSaving(true); setError(null)
    try {
      const result = await createPatientAssessment({
        patient: patientId,
        patient_name: patientName || undefined,
        assessment_template: selectedTemplate?.name || undefined,
        reference_type: referenceType || undefined,
        encounter: encounterId || undefined,
        healthcare_practitioner: selectedPract?.name || undefined,
        company: companyId || undefined,
        therapy_session: therapySession || undefined,
        assessment_datetime: assessmentDatetime,
        assessment_description: assessmentDescription || undefined,
        family_history: familyHistory || undefined,
        assessment_sheet: sheetRows.filter((r) => r.parameter.trim()),
      })
      if (result.success) {
        onSuccess()
      } else {
        setError(result.message || 'Failed to create assessment')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create assessment')
    } finally {
      setSaving(false)
    }
  }

  const closeAllDropdowns = () => {
    setPatientOpen(false); setTemplateOpen(false); setEncounterOpen(false)
    setPractOpen(false); setCompanyOpen(false)
    setParamOpen({})
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full mx-4 max-h-[92vh] overflow-hidden flex flex-col">

        {/* ── Header ───────────────────────────────────────────────────────── */}
        <div className="px-5 py-4 border-b border-slate-200 flex-shrink-0 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">New Patient Assessment</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {isIPMode && <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-[10px] font-medium mr-2">IP Mode Active</span>}
              {isOPMode && <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-[10px] font-medium mr-2">OP Mode Active</span>}
              {getModeHelpText()}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* ── Tabs ─────────────────────────────────────────────────────────── */}
        <div className="flex border-b border-slate-200 px-5 flex-shrink-0 bg-white">
          {TABS.map((tab) => (
            <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === tab.id ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab.label}
              {tab.id === 'sheet' && sheetRows.length > 0 && (
                <span className="ml-1.5 text-[11px] bg-primary/10 text-primary rounded-full px-1.5 py-0.5 font-semibold">
                  {sheetRows.length}
                </span>
              )}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0"
          onClick={(e) => { if (!(e.target as HTMLElement).closest('.relative')) closeAllDropdowns() }}
        >
          <div className="flex-1 overflow-y-auto p-5 space-y-4 min-h-0">

            {/* Mode indicator box */}
            <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
              <p className="text-xs font-semibold text-primary mb-1">
                {isIPMode ? '🏥 Creating Assessment for Inpatient' : isOPMode ? '👤 Creating Assessment for Outpatient' : '📋 Select Context'}
              </p>
              <p className="text-xs text-slate-600">
                {isIPMode 
                  ? `The assessment will be linked to the selected inpatient admission. Make sure you have an admission selected below.`
                  : isOPMode
                  ? `The assessment will be linked to the selected outpatient visit. Make sure you have a visit selected below.`
                  : 'Please select either IP or OP mode from the top navbar before creating an assessment.'
                }
              </p>
            </div>

            {/* ═══ DETAILS TAB ════════════════════════════════════════════════ */}
            {activeTab === 'details' && (
              <>
                {/* Reference Type + Encounter - Now determined by mode */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Reference Type</label>
                    <div className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-slate-50">
                      {referenceType || '— Select IP/OP mode from navbar —'}
                    </div>
                  </div>
                  <div className="relative">
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Encounter <span className="text-red-500">*</span>
                    </label>
                    {(isIPMode && activeAdmission) || (isOPMode && activeVisit) ? (
                      <div>
                        <input
                          type="text"
                          value={selectedEncounter?.label || encounterId}
                          readOnly
                          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-slate-100 cursor-not-allowed"
                        />
                        <p className="text-xs text-slate-400 mt-1">Auto-selected from {isIPMode ? 'IP' : 'OP'} context</p>
                      </div>
                    ) : (
                      <>
                        <input type="text" disabled={!referenceType}
                          value={encounterOpen ? encounterQuery : (selectedEncounter?.label ?? encounterQuery)}
                          onChange={(e) => {
                            setEncounterQuery(e.target.value); setEncounterOpen(true)
                            if (!e.target.value) { setEncounterId(''); setSelectedEncounter(null) }
                          }}
                          onFocus={() => referenceType && setEncounterOpen(true)}
                          placeholder={referenceType ? `Search ${referenceType}…` : 'Select IP/OP mode first'}
                          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-slate-50 disabled:text-slate-400"
                        />
                        {encounterOpen && encounterOptions.length > 0 && (
                          <div className="absolute z-20 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-48 overflow-y-auto top-full">
                            {encounterOptions.map((enc) => (
                              <button key={enc.name} type="button"
                                onClick={() => { setEncounterId(enc.name); setSelectedEncounter(enc); setEncounterQuery(enc.label); setEncounterOpen(false) }}
                                className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100"
                              >{enc.label}</button>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Patient */}
                <div className="relative">
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Patient <span className="text-red-500">*</span>
                  </label>
                  <input type="text" value={patientQuery}
                    onChange={(e) => { setPatientQuery(e.target.value); setPatientOpen(true); if (!e.target.value) { setPatientId(''); setPatientName('') } }}
                    onFocus={() => setPatientOpen(true)}
                    placeholder="Search patient…"
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    disabled={Boolean(contextPatient)}
                  />
                  {contextPatient && <p className="text-xs text-slate-400 mt-1">Patient auto-selected from context</p>}
                  {patientLoading && <span className="absolute right-3 top-9 text-xs text-slate-400">Loading…</span>}
                  {patientOpen && !contextPatient && patientOptions.length > 0 && (
                    <div className="absolute z-20 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-48 overflow-y-auto top-full">
                      {patientOptions.map((p) => (
                        <button key={p.name} type="button"
                          onClick={() => {
                            setPatientId(p.name); setPatientQuery(p.patient_name); setPatientName(p.patient_name); setPatientOpen(false)
                            setEncounterId(''); setEncounterQuery(''); setSelectedEncounter(null)
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

                {/* Template */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Assessment Template</label>
                  <div className="relative flex gap-2">
                    <input type="text"
                      value={templateOpen ? templateQuery : (selectedTemplate?.label ?? templateQuery)}
                      onChange={(e) => { setTemplateQuery(e.target.value); setTemplateOpen(true); if (!e.target.value) { setSelectedTemplate(null); setSheetRows([]) } }}
                      onFocus={() => setTemplateOpen(true)}
                      placeholder="Search template…"
                      className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                    {selectedTemplate && (
                      <button type="button" onClick={() => setActiveTab('sheet')}
                        className="flex-shrink-0 px-3 py-2 text-xs font-medium text-white bg-primary rounded-md hover:bg-primary/90 whitespace-nowrap"
                      >
                        Edit Sheet {loadingTemplate ? '…' : `(${sheetRows.length})`}
                      </button>
                    )}
                    {templateOpen && templateOptions.length > 0 && (
                      <div className="absolute z-20 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-48 overflow-y-auto top-full left-0">
                        {templateOptions.map((t) => (
                          <button key={t.name} type="button" onClick={() => handleTemplateSelect(t)}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100">{t.label}</button>
                        ))}
                      </div>
                    )}
                  </div>
                  {selectedTemplate && (
                    <p className="text-xs text-slate-500 mt-1">
                      {loadingTemplate ? 'Loading parameters…' : `${sheetRows.length} parameter${sheetRows.length !== 1 ? 's' : ''} loaded — go to Assessment Sheet tab to enter details.`}
                    </p>
                  )}
                </div>

                {/* Assessment Date/Time */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Assessment Date / Time <span className="text-red-500">*</span>
                  </label>
                  <input type="datetime-local" value={assessmentDatetime}
                    onChange={(e) => setAssessmentDatetime(e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                {/* Practitioner + Company */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Combo label="Healthcare Practitioner" placeholder="Search practitioner…"
                    displayValue={practOpen ? practQuery : (selectedPract?.label ?? practQuery)}
                    onQueryChange={(q) => { setPractQuery(q); setPractOpen(true); if (!q) setSelectedPract(null) }}
                    onOpen={() => setPractOpen(true)} open={practOpen} options={practOptions}
                    onSelect={(o) => { setSelectedPract(o); setPractQuery(o.label); setPractOpen(false) }}
                  />
                  <Combo label="Company" placeholder="Search company…"
                    displayValue={companyOpen ? companyQuery : (selectedCompany?.label ?? companyQuery)}
                    onQueryChange={(q) => { setCompanyQuery(q); setCompanyOpen(true); if (!q) { setCompanyId(''); setSelectedCompany(null) } }}
                    onOpen={() => setCompanyOpen(true)} open={companyOpen} options={companyOptions}
                    onSelect={(o) => { setCompanyId(o.name); setSelectedCompany(o); setCompanyQuery(o.label); setCompanyOpen(false) }}
                  />
                </div>

                {/* Therapy Session */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Therapy Session</label>
                  <input type="text" value={therapySession} onChange={(e) => setTherapySession(e.target.value)}
                    placeholder="Therapy session ID (optional)"
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Assessment Description</label>
                  <textarea rows={3} value={assessmentDescription} onChange={(e) => setAssessmentDescription(e.target.value)}
                    placeholder="Brief description of the assessment…"
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                  />
                </div>
              </>
            )}

            {/* ═══ ASSESSMENT SHEET TAB ═══════════════════════════════════════ */}
            {activeTab === 'sheet' && (
              <div className="space-y-3">
                {sheetRows.length === 0 ? (
                  <div className="text-center py-12 border border-dashed border-slate-300 rounded-lg">
                    <ClipboardList className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                    <p className="text-sm text-slate-500 mb-1">No parameters yet.</p>
                    <p className="text-xs text-slate-400 mb-4">Select a template on the Details tab to auto-load parameters, or add rows manually.</p>
                    <button type="button" onClick={addSheetRow}
                      className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary/90">
                      + Add Parameter Row
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="space-y-3">
                      {sheetRows.map((row, idx) => {
                        const isExpanded = expandedRows.has(idx)
                        const filteredParams = paramOptionsFor(idx)

                        return (
                          <div key={idx} className="border border-slate-200 rounded-lg bg-white shadow-sm overflow-visible">
                            {/* Card header */}
                            <button type="button" onClick={() => toggleExpanded(idx)}
                              className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-200 hover:bg-slate-100 transition-colors cursor-pointer"
                            >
                              <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                                <ClipboardList className="w-4 h-4 text-primary" />
                                <span>Parameter {idx + 1}</span>
                                {row.parameter && (
                                  <span className="text-slate-400 font-normal">— {row.parameter}</span>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                <button type="button" onClick={(e) => { e.stopPropagation(); removeSheetRow(idx) }}
                                  className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                  title="Remove">
                                  <Trash2 className="w-4 h-4" />
                                </button>
                                <div className="text-slate-400">
                                  {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                </div>
                              </div>
                            </button>

                            {/* Expanded body */}
                            {isExpanded && (
                              <div className="p-4 space-y-4">
                                {/* Row 1: Parameter (full width dropdown) */}
                                <div>
                                  <label className="block text-xs font-medium text-slate-600 mb-1">
                                    Parameter <span className="text-red-500">*</span>
                                  </label>
                                  <div className="relative">
                                    <input type="text"
                                      value={paramOpen[idx] ? (paramQuery[idx] ?? row.parameter) : row.parameter}
                                      onChange={(e) => {
                                        setParamQuery((prev) => ({ ...prev, [idx]: e.target.value }))
                                        setParamOpen((prev) => ({ ...prev, [idx]: true }))
                                        if (!e.target.value) updateRow(idx, 'parameter', '')
                                      }}
                                      onFocus={() => {
                                        setParamQuery((prev) => ({ ...prev, [idx]: '' }))
                                        setParamOpen((prev) => ({ ...prev, [idx]: true }))
                                      }}
                                      placeholder="Search assessment parameter…"
                                      className="w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                                    />
                                    {paramOpen[idx] && filteredParams.length > 0 && (
                                      <div className="absolute z-30 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-52 overflow-y-auto top-full">
                                        {filteredParams.map((p) => (
                                          <button key={p.name} type="button"
                                            onClick={() => {
                                              updateRow(idx, 'parameter', p.name)
                                              setParamQuery((prev) => ({ ...prev, [idx]: p.label }))
                                              setParamOpen((prev) => ({ ...prev, [idx]: false }))
                                            }}
                                            className="w-full text-left px-3 py-2.5 text-sm hover:bg-slate-100"
                                          >{p.label}</button>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {/* Row 2: Time + Yes */}
                                <div className="grid grid-cols-2 gap-3">
                                  <div>
                                    <label className="block text-xs font-medium text-slate-600 mb-1">
                                      Yes/No
                                    </label>
                                    <div className="flex items-center h-[42px]">
                                      <input
                                        type="checkbox"
                                        checked={!!(row as any).yes}
                                        onChange={(e) => updateRow(idx, 'yes' as any, e.target.checked)}
                                        className="w-5 h-5 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer accent-primary"
                                      />
                                      <span className="ml-2 text-sm text-slate-600">{(row as any).yes ? 'Yes' : 'No'}</span>
                                    </div>
                                  </div>
                                  <div>
                                    <label className="block text-xs font-medium text-slate-600 mb-1">Time</label>
                                    <input type="time" value={row.time || ''}
                                      onChange={(e) => updateRow(idx, 'time', e.target.value)}
                                      className="w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                                    />
                                  </div>
                                </div>

                                {/* Row 3: Comments (tall textarea) */}
                                <div>
                                  <label className="block text-xs font-medium text-slate-600 mb-1">Comments</label>
                                  <textarea rows={3} value={row.comments || ''}
                                    onChange={(e) => updateRow(idx, 'comments', e.target.value)}
                                    placeholder="Observations, notes, or remarks for this parameter…"
                                    className="w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-y min-h-[80px]"
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>

                    {/* Add Row button */}
                    <div className="flex items-center justify-between pt-1">
                      <button type="button" onClick={addSheetRow}
                        className="flex items-center gap-1.5 text-sm text-primary hover:underline font-medium">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        Add Parameter Row
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ═══ MORE INFO TAB ══════════════════════════════════════════════ */}
            {activeTab === 'more' && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Family History</label>
                <textarea rows={6} value={familyHistory} onChange={(e) => setFamilyHistory(e.target.value)}
                  placeholder="Relevant family history…"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                />
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">{error}</div>
            )}
          </div>

          {/* ── Footer ───────────────────────────────────────────────────────── */}
          <div className="border-t border-slate-200 bg-white px-5 py-4 flex items-center justify-between gap-3 flex-shrink-0">
            <div className="text-xs text-slate-400">
              {sheetRows.length > 0 && `${sheetRows.filter((r) => r.parameter.trim()).length} / ${sheetRows.length} parameters filled`}
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50">
                Cancel
              </button>
              <button type="submit" disabled={saving || (!isIPMode && !isOPMode) || (isIPMode && !encounterId) || (isOPMode && !encounterId)}
                className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50">
                {saving ? 'Creating…' : 'Create Assessment'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
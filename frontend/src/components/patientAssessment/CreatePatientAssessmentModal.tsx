
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
//     <div className={CREATE_MODAL_OVERLAY}>
//       <div className={createModalShellClass('max-w-3xl w-full max-h-[92vh] overflow-hidden')}>

//         {/* ── Header ───────────────────────────────────────────────────────── */}
//         <div className="relative shrink-0 border-b border-emerald-100/60 bg-gradient-to-r from-emerald-100 via-teal-50 to-sky-100 px-5 py-4 sm:px-6 flex flex-shrink-0 items-center justify-between">
//           <div>
//             <h2 className="text-lg font-semibold tracking-tight text-emerald-950">New Patient Assessment</h2>
//             <p className="text-xs text-slate-500 mt-0.5">
//               {isIPMode && <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-[10px] font-medium mr-2">IP Mode Active</span>}
//               {isOPMode && <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-[10px] font-medium mr-2">OP Mode Active</span>}
//               {getModeHelpText()}
//             </p>
//           </div>
//           <button type="button" onClick={onClose} className="shrink-0 rounded-lg p-2 text-emerald-800/70 transition hover:bg-emerald-200/50 hover:text-emerald-950">
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
//                     <p className="text-sm text-slate-500 mb-1">NO PARAMETERS YET.</p>
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
//           <div className={`${CREATE_MODAL_FOOTER_STICKY} items-center justify-between gap-3`}>
//             <div className="text-xs text-slate-400">
//               {sheetRows.length > 0 && `${sheetRows.filter((r) => r.parameter.trim()).length} / ${sheetRows.length} parameters filled`}
//             </div>
//             <div className="flex gap-3">
//               <button type="button" onClick={onClose}
//                 className={CM_BTN_CANCEL}>
//                 Cancel
//               </button>
//               <button type="submit" disabled={saving || (!isIPMode && !isOPMode) || (isIPMode && !encounterId) || (isOPMode && !encounterId)}
//                 className={CM_BTN_PRIMARY}>
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
import {
  CM_BTN_CANCEL,
  CM_BTN_PRIMARY,
  CREATE_MODAL_FOOTER_STICKY,
  CREATE_MODAL_OVERLAY,
  createModalShellClass,
} from '../ui/CreateModalChrome'
import { ChevronDown, ChevronUp, Trash2, ClipboardList } from 'lucide-react'
import {
  createPatientAssessment,
  updatePatientAssessment,
  fetchAssessmentTemplates,
  fetchDefaultPatientAssessmentTemplate,
  fetchPatientAssessment,
  fetchTemplateParameters,
  fetchAssessmentParameters,
  mapTemplateParameterToSheetRow,
  type AssessmentSheetRow,
  type AssessmentTemplateOption,
  type PatientAssessmentDoc,
  type PatientAssessmentRow,
} from '../../services/patientAssessment'
import {
  fetchPatientVisits,
  fetchInpatientAdmissions,
  fetchHealthcarePractitioners,
  type LinkFieldOption,
} from '../../services/common'
import { searchPatients, fetchPatients, type PatientListItem } from '../../services/patients'
import { useCareContext } from '../../providers/CareContextProvider'
import {
  LOCKED_PRACTITIONER_INPUT_CLASS,
  useLockedLinkedPractitioner,
} from '../../hooks/useLockedLinkedPractitioner'

interface CreatePatientAssessmentModalProps {
  onClose: () => void
  onSuccess: () => void
  patient?: string
  editRow?: PatientAssessmentRow
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
  readOnly,
  renderOption,
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
  readOnly?: boolean
  renderOption?: (opt: { name: string; label: string }) => React.ReactNode
}) => (
  <div>
    <label className="block text-sm font-medium text-slate-700 mb-1">
      {label} {required && <span className="text-red-500">*</span>}
    </label>
    <div className="relative">
      <input
        type="text"
        disabled={disabled}
        readOnly={readOnly}
        value={displayValue}
        onChange={(e) => {
          if (readOnly) return
          onQueryChange(e.target.value)
        }}
        onFocus={() => {
          if (!readOnly) onOpen()
        }}
        placeholder={placeholder}
        title={readOnly ? 'Locked to your linked practitioner' : undefined}
        className={
          readOnly
            ? LOCKED_PRACTITIONER_INPUT_CLASS
            : 'w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-slate-50 disabled:text-slate-400'
        }
      />
      {loading && <span className="absolute right-3 top-2.5 text-xs text-slate-400">…</span>}
      {open && !readOnly && options.length > 0 && (
        <div className="absolute z-20 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-48 overflow-y-auto top-full">
          {options.map((o) => (
            <button key={o.name} type="button" onClick={() => onSelect(o)}
              className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100">
              {renderOption ? renderOption(o) : o.label}
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
  editRow,
}: CreatePatientAssessmentModalProps) => {
  // Get context from CareContextProvider
  const isEditMode = Boolean(editRow)
  const { mode, activeVisit, activeAdmission, selectedPatient: contextPatient } = useCareContext()
  
  // Determine if we're in IP or OP mode based on context
  const isIPMode = mode === 'IP'
  const isOPMode = mode === 'OP'
  
  const [activeTab, setActiveTab] = useState<TabId>('details')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ── Core fields ──────────────────────────────────────────────────────────────
  const [patientId, setPatientId] = useState(editRow?.patient || patient || contextPatient || '')
  const [patientName, setPatientName] = useState(editRow?.patient_name || '')
  // Reference type is now determined by global mode
  const referenceType = isIPMode ? 'Inpatient Admission' : isOPMode ? 'Patient Visit' : ''
  const [encounterId, setEncounterId] = useState(() => {
    if (editRow?.encounter) return editRow.encounter
    if (isIPMode && activeAdmission) return activeAdmission
    if (isOPMode && activeVisit) return activeVisit
    return ''
  })
  const [assessmentDatetime, setAssessmentDatetime] = useState(
    editRow?.assessment_datetime?.replace(' ', 'T').slice(0, 19) || nowLocal()
  )
  const [assessmentDescription, setAssessmentDescription] = useState(editRow?.assessment_description || '')
  const [familyHistory, setFamilyHistory] = useState(editRow?.family_history || '')

  // ── Assessment sheet ─────────────────────────────────────────────────────────
  const [sheetRows, setSheetRows] = useState<AssessmentSheetRow[]>([])
  const [loadingTemplate, setLoadingTemplate] = useState(false)
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set())
  const [attemptedSubmit, setAttemptedSubmit] = useState(false)

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
  const [selectedTemplate, setSelectedTemplate] = useState<AssessmentTemplateOption | null>(
    editRow?.assessment_template ? { name: editRow.assessment_template, label: editRow.assessment_template } : null
  )

  const [encounterQuery, setEncounterQuery] = useState('')
  const [encounterOpen, setEncounterOpen] = useState(false)
  const [encounterOptions, setEncounterOptions] = useState<LinkFieldOption[]>([])
  const [selectedEncounter, setSelectedEncounter] = useState<LinkFieldOption | null>(null)

  const [practQuery, setPractQuery] = useState('')
  const [practOpen, setPractOpen] = useState(false)
  const [practOptions, setPractOptions] = useState<LinkFieldOption[]>([])
  const [selectedPract, setSelectedPract] = useState<LinkFieldOption | null>(
    editRow?.healthcare_practitioner
      ? { name: editRow.healthcare_practitioner, label: editRow.practitioner_name || editRow.healthcare_practitioner }
      : null
  )
  const {
    locked: practitionerLocked,
    practitionerId: linkedPractitionerId,
    practitionerLabel: linkedPractitionerLabel,
  } = useLockedLinkedPractitioner()
  const practFieldLocked = practitionerLocked && !isEditMode

  // ── Load all assessment parameters once ───────────────────────────────────────
  useEffect(() => {
    if (allParamsLoaded.current) return
    allParamsLoaded.current = true
    fetchAssessmentParameters().then(setAllParameters).catch(() => {})
  }, [])

  // ── Patient label on mount ────────────────────────────────────────────────────
  useEffect(() => {
    if (editRow) {
      if (editRow.assessment_template) {
        setTemplateQuery(editRow.assessment_template)
      }
      if (editRow.healthcare_practitioner) {
        setPractQuery(editRow.practitioner_name || editRow.healthcare_practitioner)
      }
    }
    const patientToLoad = patient || contextPatient
    if (!patientToLoad) return
    fetchPatients(1, 0, patientToLoad).then((res) => {
      if (res.length > 0) { setPatientQuery(res[0].patient_name); setPatientName(res[0].patient_name) }
    }).catch(() => {})
  }, [patient, contextPatient])

  useEffect(() => {
    if (!editRow) return
    let cancelled = false
    ;(async () => {
      try {
        const doc: PatientAssessmentDoc = await fetchPatientAssessment(editRow.name)
        if (cancelled) return
        if (doc.assessment_template) {
          const template = { name: doc.assessment_template, label: doc.assessment_template }
          setSelectedTemplate(template)
          setTemplateQuery(template.label)
        }
        if (doc.healthcare_practitioner) {
          const pract = {
            name: doc.healthcare_practitioner,
            label: doc.practitioner_name || doc.healthcare_practitioner,
          }
          setSelectedPract(pract)
          setPractQuery(pract.label)
        }
        setAssessmentDescription(doc.assessment_description || '')
        setFamilyHistory(doc.family_history || '')
        if (Array.isArray(doc.assessment_sheet)) {
          // Merge template metadata so single-choice parameters keep their
          // checkbox options (and hide Yes/No) while editing.
          const templateMeta = new Map<string, AssessmentSheetRow>()
          if (doc.assessment_template) {
            try {
              const templateData = await fetchTemplateParameters(doc.assessment_template)
              if (cancelled) return
              for (const param of templateData.parameters) {
                templateMeta.set(param.parameter, mapTemplateParameterToSheetRow(param))
              }
            } catch {
              // Template metadata is optional; rows still edit as free text.
            }
          }
          const rows = doc.assessment_sheet.map((row) => {
            const parameter = row.parameter || row.parameter_label || ''
            const meta = templateMeta.get(parameter)
            return {
              parameter,
              score: Number(row.score || 0),
              // Frappe Time values come back as "10:22:42.734604"; <input type="time"> needs "HH:MM".
              time: (row.time || '').slice(0, 5),
              comments: row.comments || '',
              yes: row.yes == null ? undefined : Boolean(row.yes),
              is_select: meta?.is_select ?? false,
              select_options: meta?.select_options ?? [],
            }
          })
          setSheetRows(rows)
          setParamQuery(Object.fromEntries(rows.map((r, i) => [i, r.parameter])))
          setExpandedRows(new Set(rows.map((_, i) => i)))
        }
      } catch {
        // Keep row-level defaults if the fuller document fetch fails.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [editRow])

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

  const defaultTemplateLoaded = useRef(false)

  // ── Default assessment template on open ─────────────────────────────────────
  useEffect(() => {
    if (editRow) return
    if (defaultTemplateLoaded.current) return
    defaultTemplateLoaded.current = true
    let cancelled = false
    ;(async () => {
      try {
        const defaultTmpl = await fetchDefaultPatientAssessmentTemplate()
        if (!defaultTmpl || cancelled) return
        setSelectedTemplate(defaultTmpl)
        setTemplateQuery(defaultTmpl.label)
        setLoadingTemplate(true)
        const data = await fetchTemplateParameters(defaultTmpl.name)
        if (cancelled) return
        const rows = data.parameters.map(mapTemplateParameterToSheetRow)
        setSheetRows(rows)
        setParamQuery(Object.fromEntries(rows.map((r, i) => [i, r.parameter])))
        setExpandedRows(new Set(rows.map((_, i) => i)))
      } catch {
        // optional default
      } finally {
        if (!cancelled) setLoadingTemplate(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

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

  // Auto-fill current user's linked practitioner (create only)
  useEffect(() => {
    if (isEditMode || !linkedPractitionerId) return
    setSelectedPract((prev) =>
      prev || {
        name: linkedPractitionerId,
        label: linkedPractitionerLabel || linkedPractitionerId,
      },
    )
    setPractQuery((q) => q.trim() || linkedPractitionerLabel || linkedPractitionerId)
  }, [isEditMode, linkedPractitionerId, linkedPractitionerLabel])

  // ── Template selection: load parameters ──────────────────────────────────────
  const handleTemplateSelect = async (tmpl: AssessmentTemplateOption) => {
    setSelectedTemplate(tmpl)
    setTemplateQuery(tmpl.label)
    setTemplateOpen(false)
    setLoadingTemplate(true)
    try {
      const data = await fetchTemplateParameters(tmpl.name)
      const rows = data.parameters.map(mapTemplateParameterToSheetRow)
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

  const updateRow = (idx: number, field: keyof AssessmentSheetRow, value: string | boolean | undefined) => {
    setSheetRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)))
    // Answering a parameter clears the stale "missing answer" banner; remaining
    // unanswered rows stay highlighted until the sheet is complete.
    if (field === 'yes' || field === 'comments') setError(null)
  }

  // "HH:MM" (24h) for the <input type="time"> field, taken from the device clock.
  const currentTimeValue = () => {
    const now = new Date()
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  }

  // Ticking Yes/No (or a single-choice result) stamps the moment the parameter
  // was answered into Time, so the sheet records when each observation was made
  // without the user typing it. The value stays editable afterwards.
  const answerRow = (idx: number, field: 'yes' | 'comments', value: boolean | string) => {
    setSheetRows((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, [field]: value, time: currentTimeValue() } : r)),
    )
    setError(null)
  }

  // Every parameter must be answered (Yes/No, or one of its select options)
  // before the assessment can be saved.
  const rowHasAnswer = (row: AssessmentSheetRow) => {
    const hasSelect = Boolean(row.is_select) && (row.select_options?.length || 0) > 0
    return hasSelect ? Boolean((row.comments || '').trim()) : row.yes === true || row.yes === false
  }

  // Picking a parameter manually resets template-only metadata so stale
  // single-choice options never appear on an unrelated parameter.
  const selectParameter = (idx: number, parameterName: string) => {
    setSheetRows((prev) =>
      prev.map((r, i) =>
        i === idx ? { ...r, parameter: parameterName, is_select: false, select_options: [] } : r,
      ),
    )
    setParamQuery((prev) => ({ ...prev, [idx]: parameterName }))
    setParamOpen((prev) => ({ ...prev, [idx]: false }))
  }

  const toggleExpanded = (idx: number) =>
    setExpandedRows((prev) => {
      const n = new Set(prev)
      if (n.has(idx)) n.delete(idx)
      else n.add(idx)
      return n
    })

  // Filtered parameter options for a row's query
  const paramOptionsFor = (idx: number) => {
    const q = (paramQuery[idx] || '').toLowerCase()
    if (!q) return allParameters
    return allParameters.filter((p) => p.label.toLowerCase().includes(q))
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

    // Block saving while any parameter is still unanswered
    const unanswered = sheetRows
      .map((row, idx) => ({ row, idx }))
      .filter(({ row }) => Boolean(row.parameter.trim()) && !rowHasAnswer(row))
    if (unanswered.length > 0) {
      setAttemptedSubmit(true)
      setActiveTab('sheet')
      setExpandedRows((prev) => new Set([...prev, ...unanswered.map(({ idx }) => idx)]))
      const missing = unanswered.slice(0, 3).map(({ row }) => `"${row.parameter}"`).join(', ')
      const extra = unanswered.length > 3 ? ` and ${unanswered.length - 3} more` : ''
      setError(
        `Please select Yes or No (or a result) for every parameter before saving — still missing: ${missing}${extra}.`
      )
      requestAnimationFrame(() => {
        document
          .getElementById(`assessment-param-${unanswered[0].idx}`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      })
      return
    }
    setAttemptedSubmit(false)

    setSaving(true); setError(null)
    try {
      const payload = {
        patient: patientId,
        patient_name: patientName || undefined,
        assessment_template: selectedTemplate?.name || undefined,
        reference_type: referenceType || undefined,
        encounter: encounterId || undefined,
        healthcare_practitioner: selectedPract?.name || undefined,
        assessment_datetime: assessmentDatetime,
        assessment_description: assessmentDescription || undefined,
        family_history: familyHistory || undefined,
        assessment_sheet: sheetRows
          .filter((r) => r.parameter.trim())
          .map((r) => ({
            parameter: r.parameter,
            score: r.score ?? 0,
            time: r.time || '',
            comments: r.comments || '',
            yes: Boolean(r.yes),
          })),
      }
      const result = editRow
        ? await updatePatientAssessment({ name: editRow.name, ...payload })
        : await createPatientAssessment(payload)
      if (result.success) {
        onSuccess()
      } else {
        setError(result.message || `Failed to ${editRow ? 'update' : 'create'} assessment`)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : `Failed to ${editRow ? 'update' : 'create'} assessment`)
    } finally {
      setSaving(false)
    }
  }

  const closeAllDropdowns = () => {
    setPatientOpen(false); setTemplateOpen(false); setEncounterOpen(false)
    setPractOpen(false)
    setParamOpen({})
  }

  return (
    <div className={CREATE_MODAL_OVERLAY}>
      <div className={createModalShellClass('max-w-3xl w-full h-[min(88vh,860px)] max-h-[92vh] overflow-hidden')}>

        {/* ── Header ───────────────────────────────────────────────────────── */}
        <div className="relative shrink-0 border-b border-emerald-100/60 bg-gradient-to-r from-emerald-100 via-teal-50 to-sky-100 px-5 py-4 sm:px-6 flex flex-shrink-0 items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-emerald-950">{isEditMode ? 'Edit Patient Assessment' : 'New Patient Assessment'}</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {isIPMode && <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-[10px] font-medium mr-2">IP Mode Active</span>}
              {isOPMode && <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-[10px] font-medium mr-2">OP Mode Active</span>}
              {!isIPMode && !isOPMode && <span>Select IP or OP mode from the navbar to continue</span>}
            </p>
          </div>
          <button type="button" onClick={onClose} className="shrink-0 rounded-lg p-2 text-emerald-800/70 transition hover:bg-emerald-200/50 hover:text-emerald-950">
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

                {/* Patient + Assessment Template — same row */}
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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

                  {/* Assessment Template */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Assessment Template</label>
                    <div className="relative">
                      <input type="text"
                        value={templateOpen ? templateQuery : (selectedTemplate?.label ?? templateQuery)}
                        onChange={(e) => { setTemplateQuery(e.target.value); setTemplateOpen(true); if (!e.target.value) { setSelectedTemplate(null); setSheetRows([]) } }}
                        onFocus={() => setTemplateOpen(true)}
                        placeholder="Search template…"
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
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
                        {loadingTemplate ? 'Loading parameters…' : `${sheetRows.length} parameter${sheetRows.length !== 1 ? 's' : ''} loaded — open the Assessment Sheet tab to enter details.`}
                      </p>
                    )}
                  </div>
                </div>

                {/* Assessment Date/Time + Username — same row */}
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Assessment Date / Time <span className="text-red-500">*</span>
                    </label>
                    <input type="datetime-local" value={assessmentDatetime}
                      onChange={(e) => setAssessmentDatetime(e.target.value)}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>

                  {/* Username */}
                  <Combo label="Username" placeholder="Search username…"
                    displayValue={practOpen ? practQuery : (selectedPract?.label ?? practQuery)}
                    onQueryChange={(q) => { setPractQuery(q); setPractOpen(true); if (!q) setSelectedPract(null) }}
                    onOpen={() => setPractOpen(true)} open={practOpen} options={practOptions}
                    onSelect={(o) => { setSelectedPract(o); setPractQuery(o.label); setPractOpen(false) }}
                    readOnly={practFieldLocked}
                    renderOption={(o) => (<div><div className="font-medium">{o.label}</div><div className="text-xs text-slate-500">{o.name}</div></div>)}
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

                {/* Context note — small, bottom of the Details tab only */}
                <p className="text-[11px] leading-relaxed text-slate-400">
                  {isIPMode
                    ? 'The assessment will be linked to the selected inpatient admission. Make sure you have an admission selected.'
                    : isOPMode
                    ? 'The assessment will be linked to the selected outpatient visit. Make sure you have a visit selected.'
                    : 'Select either IP or OP mode from the navbar before creating an assessment.'}
                </p>
              </>
            )}

            {/* ═══ ASSESSMENT SHEET TAB ═══════════════════════════════════════ */}
            {activeTab === 'sheet' && (
              <div className="space-y-3">
                {attemptedSubmit && sheetRows.some((r) => Boolean(r.parameter.trim()) && !rowHasAnswer(r)) && (
                  <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                    Every parameter needs an answer before this assessment can be saved. Highlighted rows below are missing a Yes or No selection.
                  </div>
                )}
                {sheetRows.length === 0 ? (
                  <div className="text-center py-12 border border-dashed border-slate-300 rounded-lg">
                    <ClipboardList className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                    <p className="text-sm text-slate-500 mb-1">NO PARAMETERS YET.</p>
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
                        const rowHasSelect =
                          Boolean(row.is_select) && (row.select_options?.length || 0) > 0
                        const missingAnswer = attemptedSubmit && Boolean(row.parameter.trim()) && !rowHasAnswer(row)

                        return (
                          <div key={idx} id={`assessment-param-${idx}`}
                            className={`border rounded-lg bg-white shadow-sm overflow-visible ${missingAnswer ? 'border-red-400 ring-1 ring-red-200' : 'border-slate-200'}`}>
                            {/* Card header — parameter name shown only here */}
                            <div className={`flex items-start justify-between gap-2 px-3 py-2 border-b border-slate-200 ${missingAnswer ? 'bg-red-50' : 'bg-slate-50'}`}>
                              <button type="button" onClick={() => toggleExpanded(idx)}
                                className="flex min-w-0 flex-1 flex-wrap items-start gap-x-2 gap-y-1 text-left"
                              >
                                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                                  {idx + 1}
                                </span>
                                <span className={`min-w-0 break-words text-sm font-medium leading-6 ${row.parameter ? 'text-slate-800' : 'text-slate-400'}`}>
                                  {row.parameter || 'Select parameter…'}
                                </span>
                                {rowHasSelect ? (
                                  <span className={`break-words rounded-full px-2 py-0.5 text-[10px] font-semibold leading-4 ${
                                    row.comments ? 'bg-sky-50 text-sky-700' : 'bg-slate-100 text-slate-500'
                                  }`}>
                                    {row.comments || 'Select result'}
                                  </span>
                                ) : row.yes === true ? (
                                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide leading-4 text-emerald-700">Yes</span>
                                ) : row.yes === false ? (
                                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide leading-4 text-slate-500">No</span>
                                ) : null}
                              </button>
                              <div className="flex shrink-0 items-center gap-1">
                                <button type="button" onClick={() => removeSheetRow(idx)}
                                  className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                  title="Remove parameter">
                                  <Trash2 className="w-4 h-4" />
                                </button>
                                <button type="button" onClick={() => toggleExpanded(idx)}
                                  className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded transition-colors"
                                  title={isExpanded ? 'Collapse' : 'Expand'}>
                                  {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                </button>
                              </div>
                            </div>

                            {/* Expanded body */}
                            {isExpanded && (
                              <div className="p-4 space-y-4">
                                {/* Parameter picker only while the row has no parameter */}
                                {!row.parameter.trim() && (
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
                                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                                      />
                                      {paramOpen[idx] && filteredParams.length > 0 && (
                                        <div className="absolute z-30 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-52 overflow-y-auto top-full">
                                          {filteredParams.map((p) => (
                                            <button key={p.name} type="button"
                                              onClick={() => selectParameter(idx, p.name)}
                                              className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100"
                                            >{p.label}</button>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}

                                {/* Answer + Time — Yes/No is a single-choice radio group */}
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                  <div>
                                    <label className="block text-xs font-medium text-slate-600 mb-1">
                                      {rowHasSelect ? 'Result' : 'Yes / No'}
                                    </label>
                                    <div role="radiogroup" aria-label={rowHasSelect ? 'Result' : 'Yes or No'}
                                      className="flex flex-wrap items-start gap-x-5 gap-y-2 py-2">
                                      {(rowHasSelect
                                        ? row.select_options!.map((opt) => ({ label: opt, value: opt }))
                                        : [{ label: 'Yes', value: 'yes' }, { label: 'No', value: 'no' }]
                                      ).map((opt) => {
                                        const current = rowHasSelect
                                          ? (row.comments || '')
                                          : row.yes === true ? 'yes' : row.yes === false ? 'no' : ''
                                        const active = current === opt.value
                                        return (
                                          <label key={opt.label}
                                            className="inline-flex cursor-pointer items-start gap-2 text-sm text-slate-700">
                                            <input type="radio" name={`param-${rowHasSelect ? 'result' : 'answer'}-${idx}`}
                                              className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-primary"
                                              checked={active}
                                              onChange={() => answerRow(
                                                idx,
                                                rowHasSelect ? 'comments' : 'yes',
                                                rowHasSelect ? opt.value : opt.value === 'yes',
                                              )}
                                            />
                                            <span className={`break-words ${active ? 'font-medium text-slate-900' : ''}`}>
                                              {opt.label}
                                            </span>
                                          </label>
                                        )
                                      })}
                                    </div>
                                    {missingAnswer && (
                                      <p className="mt-1 text-[11px] font-medium text-red-600">
                                        {rowHasSelect ? 'Please select a result' : 'Please select Yes or No'}
                                      </p>
                                    )}
                                  </div>
                                  <div>
                                    <label className="block text-xs font-medium text-slate-600 mb-1">Time</label>
                                    <input type="time" value={row.time || ''}
                                      onChange={(e) => updateRow(idx, 'time', e.target.value)}
                                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                                    />
                                  </div>
                                </div>

                                {/* Comments — free-text parameters only */}
                                {!rowHasSelect && (
                                  <div>
                                    <label className="block text-xs font-medium text-slate-600 mb-1">Comments</label>
                                    <textarea rows={2} value={row.comments || ''}
                                      onChange={(e) => updateRow(idx, 'comments', e.target.value)}
                                      placeholder="Observations, notes, or remarks for this parameter…"
                                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-y min-h-[56px]"
                                    />
                                  </div>
                                )}
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
          <div className={`${CREATE_MODAL_FOOTER_STICKY} items-center justify-between gap-3`}>
            <div className="text-xs text-slate-400">
              {sheetRows.length > 0 && `${sheetRows.filter((r) => r.parameter.trim()).length} / ${sheetRows.length} parameters filled`}
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={onClose}
                className={CM_BTN_CANCEL}>
                Cancel
              </button>
              <button type="submit" disabled={saving || (!isIPMode && !isOPMode) || (isIPMode && !encounterId) || (isOPMode && !encounterId)}
                className={CM_BTN_PRIMARY}>
                {saving ? 'Saving…' : isEditMode ? 'Update Assessment' : 'Create Assessment'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
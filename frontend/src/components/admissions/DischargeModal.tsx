// import { useState, useEffect, useRef, useCallback } from 'react'
// import { createDischarge, UnbilledServicesError } from '../../services/inpatientRecords'
// import { uploadPatientFile, type PatientDocumentRow } from '../../services/patients'
// import { MedicineGivenList } from '../medication/MedicineGivenList'
// import { MedicineReconciliationList } from '../medication/MedicineReconciliationList'
// import { fetchHealthcarePractitioners, fetchUsers, fetchDischargeTemplates, fetchDischargeChecklist, fetchDepartments, fetchDocumentTypes, type LinkFieldOption } from '../../services/common'
// import { PortalActionsMenu } from '../ui/PortalActionsMenu'
// import { toast } from '../../hooks/useToast'
// import { saveDischargeDraft, loadDischargeDraft, clearDischargeDraft, draftSavedAt } from '../../services/dischargeDraft'
// import { X, CheckCircle2, Circle, ChevronDown, ChevronUp, AlertCircle, Receipt, PenLine, Trash2, Check, Save, Clock } from 'lucide-react'

// // ─── Signature Pad Component ────────────────────────────────────────────────

// interface SignaturePadProps {
//   onSave: (file: File) => void
//   onClear?: () => void
//   existingUrl?: string
//   uploading?: boolean
// }

// const SignaturePad = ({ onSave, onClear, existingUrl, uploading }: SignaturePadProps) => {
//   const canvasRef = useRef<HTMLCanvasElement>(null)
//   const isDrawing = useRef(false)
//   const [hasStrokes, setHasStrokes] = useState(false)
//   const [mode, setMode] = useState<'idle' | 'drawing' | 'done'>(existingUrl ? 'done' : 'idle')

//   // Initialise canvas context
//   const initCtx = useCallback(() => {
//     const canvas = canvasRef.current
//     if (!canvas) return null
//     const ctx = canvas.getContext('2d')
//     if (!ctx) return null
//     ctx.strokeStyle = '#1e293b'
//     ctx.lineWidth = 2.2
//     ctx.lineCap = 'round'
//     ctx.lineJoin = 'round'
//     return ctx
//   }, [])

//   const getPos = (e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
//     const rect = canvas.getBoundingClientRect()
//     const scaleX = canvas.width / rect.width
//     const scaleY = canvas.height / rect.height
//     if ('touches' in e) {
//       const t = e.touches[0]
//       return { x: (t.clientX - rect.left) * scaleX, y: (t.clientY - rect.top) * scaleY }
//     }
//     return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY }
//   }

//   const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
//     e.preventDefault()
//     const canvas = canvasRef.current
//     if (!canvas) return
//     const ctx = initCtx()
//     if (!ctx) return
//     isDrawing.current = true
//     const pos = getPos(e, canvas)
//     ctx.beginPath()
//     ctx.moveTo(pos.x, pos.y)
//   }

//   const draw = (e: React.MouseEvent | React.TouchEvent) => {
//     e.preventDefault()
//     if (!isDrawing.current) return
//     const canvas = canvasRef.current
//     if (!canvas) return
//     const ctx = initCtx()
//     if (!ctx) return
//     const pos = getPos(e, canvas)
//     ctx.lineTo(pos.x, pos.y)
//     ctx.stroke()
//     setHasStrokes(true)
//   }

//   const endDraw = () => {
//     isDrawing.current = false
//   }

//   const clearCanvas = () => {
//     const canvas = canvasRef.current
//     if (!canvas) return
//     const ctx = canvas.getContext('2d')
//     if (!ctx) return
//     ctx.clearRect(0, 0, canvas.width, canvas.height)
//     setHasStrokes(false)
//     onClear?.()
//   }

//   const saveSignature = () => {
//     const canvas = canvasRef.current
//     if (!canvas) return
//     canvas.toBlob((blob) => {
//       if (!blob) return
//       const file = new File([blob], `signature_${Date.now()}.png`, { type: 'image/png' })
//       onSave(file)
//       setMode('done')
//     }, 'image/png')
//   }

//   // When switching into drawing mode, set canvas size
//   useEffect(() => {
//     if (mode !== 'drawing') return
//     const canvas = canvasRef.current
//     if (!canvas) return
//     // Set internal resolution to match display size
//     const rect = canvas.getBoundingClientRect()
//     canvas.width = rect.width * window.devicePixelRatio
//     canvas.height = rect.height * window.devicePixelRatio
//     const ctx = canvas.getContext('2d')
//     if (ctx) ctx.scale(window.devicePixelRatio, window.devicePixelRatio)
//     setHasStrokes(false)
//   }, [mode])

//   if (mode === 'idle') {
//     return (
//       <button
//         type="button"
//         onClick={() => setMode('drawing')}
//         className="w-full h-full min-h-[96px] flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-200 text-slate-400 hover:border-green-400 hover:text-green-600 hover:bg-green-50/50 transition-all group"
//       >
//         <PenLine className="w-5 h-5 group-hover:scale-110 transition-transform" />
//         <span className="text-xs font-medium">Add Signature</span>
//       </button>
//     )
//   }

//   if (mode === 'done' && existingUrl) {
//     return (
//       <div className="w-full h-full min-h-[96px] flex flex-col items-center justify-center gap-2 rounded-lg border border-green-200 bg-green-50 p-2">
//         <img
//           src={existingUrl}
//           alt="Signature"
//           className="max-h-16 object-contain"
//         />
//         <button
//           type="button"
//           onClick={() => { setMode('drawing'); clearCanvas() }}
//           className="text-xs text-slate-500 hover:text-red-500 flex items-center gap-1 transition-colors"
//         >
//           <Trash2 className="w-3 h-3" /> Re-sign
//         </button>
//       </div>
//     )
//   }

//   return (
//     <div className="w-full rounded-lg border border-slate-300 bg-white overflow-hidden flex flex-col">
//       {/* Canvas header */}
//       <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-slate-100 bg-slate-50">
//         <span className="text-xs font-medium text-slate-500 flex items-center gap-1">
//           <PenLine className="w-3 h-3" /> Draw signature
//         </span>
//         <div className="flex items-center gap-1">
//           <button
//             type="button"
//             onClick={clearCanvas}
//             disabled={!hasStrokes}
//             className="text-xs text-slate-400 hover:text-red-500 disabled:opacity-30 flex items-center gap-0.5 transition-colors px-1.5 py-0.5 rounded hover:bg-red-50"
//           >
//             <Trash2 className="w-3 h-3" /> Clear
//           </button>
//           <button
//             type="button"
//             onClick={() => { setMode('idle'); clearCanvas() }}
//             className="text-xs text-slate-400 hover:text-slate-600 px-1.5 py-0.5 rounded hover:bg-slate-100 transition-colors"
//           >
//             Cancel
//           </button>
//         </div>
//       </div>

//       {/* Drawing surface */}
//       <div className="relative" style={{ touchAction: 'none' }}>
//         <canvas
//           ref={canvasRef}
//           style={{ width: '100%', height: '96px', display: 'block', cursor: 'crosshair' }}
//           onMouseDown={startDraw}
//           onMouseMove={draw}
//           onMouseUp={endDraw}
//           onMouseLeave={endDraw}
//           onTouchStart={startDraw}
//           onTouchMove={draw}
//           onTouchEnd={endDraw}
//         />
//         {!hasStrokes && (
//           <span className="absolute inset-0 flex items-center justify-center text-xs text-slate-300 pointer-events-none select-none">
//             Sign here
//           </span>
//         )}
//       </div>

//       {/* Save button */}
//       <div className="px-2.5 py-2 border-t border-slate-100 flex justify-end">
//         <button
//           type="button"
//           onClick={saveSignature}
//           disabled={!hasStrokes || uploading}
//           className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md bg-green-600 text-white hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
//         >
//           {uploading ? (
//             <span className="flex items-center gap-1">
//               <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
//               Saving…
//             </span>
//           ) : (
//             <>
//               <Check className="w-3 h-3" /> Save Signature
//             </>
//           )}
//         </button>
//       </div>
//     </div>
//   )
// }

// // ─── Types ──────────────────────────────────────────────────────────────────

// interface ChecklistItem {
//   name: string
//   action_required: string
//   department: string
//   department_label?: string
//   user: string
//   name1: string
//   date_time: string
//   click: boolean
//   description?: string
// }

// interface DischargeModalProps {
//   admission: {
//     name: string
//     patient: string
//     patient_name?: string
//   }
//   onClose: () => void
//   onSuccess: () => void
// }

// // Group checklist items by department
// const groupByDepartment = (items: ChecklistItem[]) => {
//   return items.reduce((acc, item) => {
//     const dept = item.department_label || item.department || 'General'
//     if (!acc[dept]) acc[dept] = []
//     acc[dept].push(item)
//     return acc
//   }, {} as Record<string, ChecklistItem[]>)
// }

// // Relationship options – must match IP Patient Relative doctype
// const RELATION_OPTIONS = [
//   'Father',
//   'Mother',
//   'Brother',
//   'Sister',
//   'Husband',
//   'Wife',
//   'Son',
//   'Daughter',
// ] as const

// // ─── Main Modal ─────────────────────────────────────────────────────────────

// export const DischargeModal = ({ admission, onClose, onSuccess }: DischargeModalProps) => {
//   const [submitting, setSubmitting] = useState(false)
//   const [error, setError] = useState<string | null>(null)
//   const [unbilledServices, setUnbilledServices] = useState<{ type: string; ids: string[] }[] | null>(null)
//   const [activeTab, setActiveTab] = useState<'details' | 'checklist' | 'documents' | 'reconcile' | 'relatives'>('details')

//   // Checklist state
//   const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([])
//   const [checklistLoading, setChecklistLoading] = useState(false)
//   const [expandedDepts, setExpandedDepts] = useState<Record<string, boolean>>({})
//   const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({})

//   // Documents state
//   const [documents, setDocuments] = useState<PatientDocumentRow[]>([])
//   const [documentTypes, setDocumentTypes] = useState<{ name: string; document_name?: string }[]>([])
//   const [documentUploading, setDocumentUploading] = useState<number | null>(null)
//   // Track per-row signature upload state separately
//   const [signatureUploading, setSignatureUploading] = useState<number | null>(null)

//   // Relatives / guardians
//   const [relatives, setRelatives] = useState<
//     { relationship_with_patient: string; relative_name: string; cpr__id_no: string; any_remarks: string, relative_phone_no: string, relative_alternative_phone_no: string, relative_alternative_phone_no_2: string }[]
//   >([{ relationship_with_patient: '', relative_name: '', cpr__id_no: '', any_remarks: '', relative_phone_no: '', relative_alternative_phone_no: '', relative_alternative_phone_no_2: '' }])

//   // Link field dropdowns
//   const [dischargedByUsers, setDischargedByUsers] = useState<LinkFieldOption[]>([])
//   const [finalDischargeUsers, setFinalDischargeUsers] = useState<LinkFieldOption[]>([])
//   const [receivingDoctors, setReceivingDoctors] = useState<LinkFieldOption[]>([])
//   const [dischargeTemplates, setDischargeTemplates] = useState<LinkFieldOption[]>([])

//   const [dischargedByOpen, setDischargedByOpen] = useState(false)
//   const [finalDischargeOpen, setFinalDischargeOpen] = useState(false)
//   const [receivingDoctorsOpen, setReceivingDoctorsOpen] = useState(false)
//   const [dischargeTemplateOpen, setDischargeTemplateOpen] = useState(false)

//   const [dischargedByQuery, setDischargedByQuery] = useState('')
//   const [finalDischargeQuery, setFinalDischargeQuery] = useState('')
//   const [receivingDoctorsQuery, setReceivingDoctorsQuery] = useState('')
//   const [dischargeTemplateQuery, setDischargeTemplateQuery] = useState('')

//   const [selectedDischargedBy, setSelectedDischargedBy] = useState<LinkFieldOption | null>(null)
//   const [selectedFinalDischarge, setSelectedFinalDischarge] = useState<LinkFieldOption | null>(null)
//   const [selectedReceivingDoctor, setSelectedReceivingDoctor] = useState<LinkFieldOption | null>(null)
//   const [selectedDischargeTemplate, setSelectedDischargeTemplate] = useState<LinkFieldOption | null>(null)

//   // Department dropdown for checklist (portal so it shows outside)
//   const [departmentOptions, setDepartmentOptions] = useState<LinkFieldOption[]>([])
//   const [departmentQuery, setDepartmentQuery] = useState('')
//   const [departmentOpenForItem, setDepartmentOpenForItem] = useState<string | null>(null)
//   const departmentTriggerRef = useRef<HTMLInputElement | null>(null)

//   // User dropdown for checklist (portal so it shows outside)
//   const [userOpenForItem, setUserOpenForItem] = useState<string | null>(null)
//   const [userQuery, setUserQuery] = useState('')
//   const userTriggerRef = useRef<HTMLInputElement | null>(null)

//   // Normalize datetime to Frappe/MySQL format
//   const toFrappeDateTime = (value?: string) => {
//     if (!value) return ''
//     let s = value.trim()
//     if (s.includes('T')) {
//       if (s.endsWith('Z')) s = s.slice(0, -1)
//       s = s.replace('T', ' ')
//     }
//     if (s.length > 19) s = s.slice(0, 19)
//     if (s.length === 16) s += ':00'
//     return s
//   }

//   const [formData, setFormData] = useState({
//     discharge_type: '',
//     ama_type: '',
//     discharge_date: new Date().toISOString().slice(0, 16),
//     discharge_time: new Date().toISOString().slice(0, 10),
//     final_discharge_date: new Date().toISOString().slice(0, 10),
//     final_discharge_time: new Date().toTimeString().slice(0, 5),
//     discharged_by_user: '',
//     final_discharge_user_id: '',
//     receiving_doctors: '',
//     discharge_template: '',
//     discharge_treatment_plan: '',
//     discharge_reason: '',
//     discharge_diagnosis: '',
//     discharge_conditions: '',
//     discharge_instructions: '',
//     discharge_medic_stopped_reason: '',
//     final_exam_mental_status_summary: '',
//     management_in_hospital: '',
//     prognosis: '',
//     next_appointment_date: '',
//     next_appointment_time: ''
//   })

//   // Load initial data, then restore any saved draft
//   useEffect(() => {
//     const loadData = async () => {
//       try {
//         const [users, doctors, templates, docTypes] = await Promise.all([
//           fetchUsers(),
//           fetchHealthcarePractitioners(),
//           fetchDischargeTemplates(),
//           fetchDocumentTypes(),
//         ])
//         setDischargedByUsers(users)
//         setFinalDischargeUsers(users)
//         setReceivingDoctors(doctors)
//         setDischargeTemplates(templates)
//         setDocumentTypes(docTypes)

//         // Try to restore a saved draft first
//         const draft = loadDischargeDraft(admission.name)
//         if (draft) {
//           setFormData(prev => ({ ...prev, ...draft.formData }))
//           if (draft.selectedOptions.dischargedBy) {
//             setSelectedDischargedBy(draft.selectedOptions.dischargedBy)
//             setDischargedByQuery(draft.selectedOptions.dischargedByQuery || draft.selectedOptions.dischargedBy.label)
//           }
//           if (draft.selectedOptions.finalDischarge) {
//             setSelectedFinalDischarge(draft.selectedOptions.finalDischarge)
//             setFinalDischargeQuery(draft.selectedOptions.finalDischargeQuery || draft.selectedOptions.finalDischarge.label)
//           }
//           if (draft.selectedOptions.receivingDoctor) {
//             setSelectedReceivingDoctor(draft.selectedOptions.receivingDoctor)
//             setReceivingDoctorsQuery(draft.selectedOptions.receivingDoctorsQuery || draft.selectedOptions.receivingDoctor.label)
//           }
//           if (draft.selectedOptions.dischargeTemplate) {
//             setSelectedDischargeTemplate(draft.selectedOptions.dischargeTemplate)
//             setDischargeTemplateQuery(draft.selectedOptions.dischargeTemplateQuery || draft.selectedOptions.dischargeTemplate.label)
//             await loadChecklist(draft.selectedOptions.dischargeTemplate.name)
//           } else {
//             await loadChecklist('Inpatient Discharge')
//           }
//           if (Array.isArray(draft.checklistItems) && draft.checklistItems.length > 0) {
//             setChecklistItems(draft.checklistItems as ChecklistItem[])
//           }
//           if (Array.isArray(draft.documents) && draft.documents.length > 0) {
//             setDocuments(draft.documents as PatientDocumentRow[])
//           }
//           if (Array.isArray(draft.relatives) && draft.relatives.length > 0) {
//             setRelatives(draft.relatives as typeof relatives)
//           }
//           toast.info('Resumed from saved draft', 3000)
//           return
//         }

//         // No draft — apply defaults
//         await loadChecklist('Inpatient Discharge')
//         const defaultTemplate = templates.find(t => t.label === 'Inpatient Discharge' || t.name === 'Inpatient Discharge')
//         if (defaultTemplate) {
//           setSelectedDischargeTemplate(defaultTemplate)
//           setFormData(prev => ({ ...prev, discharge_template: defaultTemplate.name }))
//           setDischargeTemplateQuery(defaultTemplate.label)
//         }
//       } catch (err) {
//         console.error('Failed to load data:', err)
//       }
//     }
//     loadData()
//   }, [])

//   const loadChecklist = async (templateName: string) => {
//     if (!templateName) return
//     setChecklistLoading(true)
//     try {
//       const items = await fetchDischargeChecklist(templateName)
//       setChecklistItems(items)
//       const deptMap: Record<string, boolean> = {}
//       items.forEach((item: ChecklistItem) => {
//         const dept = item.department_label || item.department || 'General'
//         deptMap[dept] = true
//       })
//       setExpandedDepts(deptMap)
//     } catch (err) {
//       console.error('Failed to load checklist:', err)
//       setChecklistItems([])
//     } finally {
//       setChecklistLoading(false)
//     }
//   }

//   // ── Document helpers ─────────────────────────────────────────────────────

//   const addDocumentRow = () => {
//     setDocuments(prev => [...prev, { file_name: '', document_type: '', transaction_no: '', upload_remarks: '' }])
//   }

//   const removeDocumentRow = (idx: number) => {
//     setDocuments(prev => prev.filter((_, i) => i !== idx))
//   }

//   const updateDocumentRow = (idx: number, field: keyof PatientDocumentRow, value: string) => {
//     setDocuments(prev => {
//       const next = [...prev]
//       next[idx] = { ...next[idx], [field]: value }
//       return next
//     })
//   }

//   const handleDocumentFile = async (idx: number, file: File | null) => {
//     if (!file) return
//     setDocumentUploading(idx)
//     try {
//       const file_url = await uploadPatientFile(file)
//       if (!file_url) throw new Error('No URL returned from upload')
//       setDocuments(prev => {
//         const next = [...prev]
//         next[idx] = {
//           ...next[idx],
//           document: file_url,
//           file_name: next[idx].file_name?.trim() || file.name,
//         }
//         return next
//       })
//       toast.success('File uploaded')
//     } catch (err) {
//       toast.error(err instanceof Error ? err.message : 'File upload failed')
//     } finally {
//       setDocumentUploading(null)
//     }
//   }

//   // Upload signature canvas blob as a file
//   const handleSignatureFile = async (idx: number, file: File) => {
//     setSignatureUploading(idx)
//     try {
//       const file_url = await uploadPatientFile(file)
//       if (!file_url) throw new Error('No URL returned from signature upload')
//       setDocuments(prev => {
//         const next = [...prev]
//         next[idx] = {
//           ...next[idx],
//           document: file_url,
//           file_name: next[idx].file_name?.trim() || `Signature ${idx + 1}`,
//         }
//         return next
//       })
//       toast.success('Signature saved')
//     } catch (err) {
//       toast.error(err instanceof Error ? err.message : 'Signature upload failed')
//     } finally {
//       setSignatureUploading(null)
//     }
//   }

//   // ── Search effects ───────────────────────────────────────────────────────

//   useEffect(() => {
//     if (!dischargedByOpen) return
//     const search = async () => {
//       try { const results = await fetchUsers(dischargedByQuery); setDischargedByUsers(results) }
//       catch { setDischargedByUsers([]) }
//     }
//     const id = setTimeout(search, dischargedByQuery.trim() === '' ? 0 : 300)
//     return () => clearTimeout(id)
//   }, [dischargedByQuery, dischargedByOpen])

//   useEffect(() => {
//     if (!finalDischargeOpen) return
//     const search = async () => {
//       try { const results = await fetchUsers(finalDischargeQuery); setFinalDischargeUsers(results) }
//       catch { setFinalDischargeUsers([]) }
//     }
//     const id = setTimeout(search, finalDischargeQuery.trim() === '' ? 0 : 300)
//     return () => clearTimeout(id)
//   }, [finalDischargeQuery, finalDischargeOpen])

//   useEffect(() => {
//     if (!receivingDoctorsOpen) return
//     const search = async () => {
//       try { const results = await fetchHealthcarePractitioners(receivingDoctorsQuery); setReceivingDoctors(results) }
//       catch { setReceivingDoctors([]) }
//     }
//     const id = setTimeout(search, receivingDoctorsQuery.trim() === '' ? 0 : 300)
//     return () => clearTimeout(id)
//   }, [receivingDoctorsQuery, receivingDoctorsOpen])

//   useEffect(() => {
//     if (!dischargeTemplateOpen) return
//     const search = async () => {
//       try { const results = await fetchDischargeTemplates(dischargeTemplateQuery); setDischargeTemplates(results) }
//       catch { setDischargeTemplates([]) }
//     }
//     const id = setTimeout(search, dischargeTemplateQuery.trim() === '' ? 0 : 300)
//     return () => clearTimeout(id)
//   }, [dischargeTemplateQuery, dischargeTemplateOpen])

//   useEffect(() => {
//     if (!departmentOpenForItem) return
//     const search = async () => {
//       try { const results = await fetchDepartments(departmentQuery || undefined); setDepartmentOptions(results) }
//       catch { setDepartmentOptions([]) }
//     }
//     const id = setTimeout(search, departmentQuery.trim() === '' ? 0 : 300)
//     return () => clearTimeout(id)
//   }, [departmentQuery, departmentOpenForItem])

//   // Close checklist dropdowns when switching away from checklist tab
//   useEffect(() => {
//     if (activeTab !== 'checklist') {
//       setDepartmentOpenForItem(null)
//       setUserOpenForItem(null)
//     }
//   }, [activeTab])

//   // ── Checklist helpers ────────────────────────────────────────────────────

//   const toggleDept = (dept: string) => setExpandedDepts(prev => ({ ...prev, [dept]: !prev[dept] }))
//   const toggleItem = (itemName: string) => setExpandedItems(prev => ({ ...prev, [itemName]: !prev[itemName] }))

//   const toggleCheck = (itemName: string) => {
//     setChecklistItems(prev =>
//       prev.map(item =>
//         item.name === itemName
//           ? { ...item, click: !item.click, date_time: !item.click ? toFrappeDateTime(new Date().toISOString()) : '' }
//           : item
//       )
//     )
//   }

//   const updateChecklistItem = (itemName: string, field: keyof ChecklistItem, value: string) => {
//     setChecklistItems(prev =>
//       prev.map(item => item.name === itemName ? { ...item, [field]: value } : item)
//     )
//   }

//   const groupedChecklist = groupByDepartment(checklistItems)
//   const totalItems = checklistItems.length
//   const completedItems = checklistItems.filter(i => i.click).length
//   const allCompleted = totalItems > 0 && completedItems === totalItems

//   // ── Submit ───────────────────────────────────────────────────────────────

//   const handleSubmit = async (e: React.FormEvent) => {
//     e.preventDefault()
//     setError(null)
//     setUnbilledServices(null)

//     if (checklistItems.length > 0 && !allCompleted) {
//       const incomplete = totalItems - completedItems
//       setError(`Please complete all discharge checklist items. ${incomplete} item${incomplete > 1 ? 's' : ''} remaining.`)
//       setActiveTab('checklist')
//       return
//     }

//     try {
//       setSubmitting(true)
//       const patientRelatives = relatives
//         .map(r => ({
//           relationship_with_patient: r.relationship_with_patient?.trim() || '',
//           relative_name: r.relative_name?.trim() || '',
//           relative_phone_no: r.relative_phone_no?.trim() || '',
//           relative_alternative_phone_no: r.relative_alternative_phone_no?.trim() || '',
//           relative_alternative_phone_no_2: r.relative_alternative_phone_no_2?.trim() || '',

//           cpr__id_no: r.cpr__id_no?.trim() || '',
//           any_remarks: r.any_remarks?.trim() || '',
//         }))
//         .filter(r => r.relationship_with_patient || r.relative_name || r.cpr__id_no || r.any_remarks || r.relative_phone_no || r.relative_alternative_phone_no || r.relative_alternative_phone_no_2)

//       await createDischarge(admission.name, {
//         ...formData,
//         discharge_checklist: checklistItems.map(item => ({
//           action_required: item.action_required,
//           department: item.department,
//           user: item.user,
//           name1: item.name1,
//           date_time: item.date_time ? toFrappeDateTime(item.date_time) : '',
//           click: item.click ? 1 : 0,
//           description: item.description || ''
//         })),
//         patient_document: documents
//           .filter(r => (r.file_name || '').trim() || (r.document || '').trim())
//           .map(r => ({
//             file_name: (r.file_name || '').trim() || undefined,
//             document_type: (r.document_type || '').trim() || undefined,
//             transaction_no: (r.transaction_no || '').trim() || undefined,
//             upload_remarks: (r.upload_remarks || '').trim() || undefined,
//             document: (r.document || '').trim() || undefined,
//           })),
//         patient_relatives: patientRelatives,
//       })
//       clearDischargeDraft(admission.name)
//       toast.success('Patient discharged successfully!', 3000)
//       onSuccess()
//     } catch (err) {
//       if (err instanceof UnbilledServicesError) {
//         setUnbilledServices(err.services)
//         setError(null)
//       } else {
//         const errorMessage = err instanceof Error ? err.message : 'Failed to discharge patient'
//         toast.error(errorMessage, 5000)
//         setError(errorMessage)
//       }
//     } finally {
//       setSubmitting(false)
//     }
//   }

//   /** Save current form state to localStorage and close the modal. */
//   const handleSaveAndClose = () => {
//     saveDischargeDraft(admission.name, {
//       formData,
//       selectedOptions: {
//         dischargedBy: selectedDischargedBy,
//         finalDischarge: selectedFinalDischarge,
//         receivingDoctor: selectedReceivingDoctor,
//         dischargeTemplate: selectedDischargeTemplate,
//         dischargedByQuery,
//         finalDischargeQuery,
//         receivingDoctorsQuery,
//         dischargeTemplateQuery,
//       },
//       checklistItems,
//       documents,
//       relatives,
//     })
//     toast.success('Discharge progress saved. You can continue later.', 4000)
//     onClose()
//   }

//   const closeAllDropdowns = () => {
//     setDischargedByOpen(false)
//     setFinalDischargeOpen(false)
//     setReceivingDoctorsOpen(false)
//     setDischargeTemplateOpen(false)
//   }

//   // ── Render ───────────────────────────────────────────────────────────────

//   return (
//     <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
//       <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">

//         {/* Header */}
//         <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
//           <div>
//             <div className="flex items-center gap-2">
//               <h2 className="text-xl font-semibold text-slate-900">Discharge Patient</h2>
//               {draftSavedAt(admission.name) && (
//                 <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
//                   <Clock className="w-3 h-3" />
//                   Draft saved
//                 </span>
//               )}
//             </div>
//             <p className="text-sm text-slate-500 mt-0.5">
//               {admission.patient_name || admission.patient} &mdash; {admission.name}
//             </p>
//           </div>
//           <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
//             <X className="w-5 h-5" />
//           </button>
//         </div>

//         {/* Tabs */}
//         <div className="flex border-b border-slate-200 bg-slate-50">
//           {(['details', 'checklist', 'reconcile', 'documents', 'relatives'] as const).map((tab) => (
//             <button
//               key={tab}
//               type="button"
//               onClick={() => setActiveTab(tab)}
//               className={`px-6 py-3 text-sm font-medium transition-colors border-b-2 -mb-px flex items-center gap-2 capitalize ${
//                 activeTab === tab
//                   ? 'border-green-600 text-green-700 bg-white'
//                   : 'border-transparent text-slate-500 hover:text-slate-700'
//               }`}
//             >
//               {tab === 'checklist'
//                 ? 'Discharge Checklist'
//                 : tab === 'reconcile'
//                   ? 'Medicine Reconciliation'
//                   : tab.charAt(0).toUpperCase() + tab.slice(1)}
//               {tab === 'checklist' && totalItems > 0 && (
//                 <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
//                   allCompleted ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
//                 }`}>
//                   {completedItems}/{totalItems}
//                 </span>
//               )}
//               {tab === 'documents' && documents.length > 0 && (
//                 <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-200 text-slate-600">
//                   {documents.length}
//                 </span>
//               )}
//               {tab === 'relatives' && relatives.length > 0 && (
//                 <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-200 text-slate-600">
//                   {relatives.length}
//                 </span>
//               )}
//             </button>
//           ))}
//         </div>

//         <form
//           onSubmit={handleSubmit}
//           className="flex-1 overflow-y-auto"
//           onClick={(e) => {
//             const target = e.target as HTMLElement
//             if (!target.closest('.dropdown-container')) closeAllDropdowns()
//           }}
//         >
//           {/* Generic error */}
//           {error && !unbilledServices && (
//             <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-md flex items-start gap-2 text-red-700 text-sm">
//               <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
//               {error}
//             </div>
//           )}

//           {/* Unbilled services error */}
//           {unbilledServices && (
//             <div className="mx-6 mt-4 rounded-lg border border-red-200 bg-red-50 overflow-hidden">
//               <div className="flex items-start gap-3 px-4 py-3 bg-red-100/60 border-b border-red-200">
//                 <Receipt className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
//                 <div>
//                   <p className="text-sm font-semibold text-red-800">Cannot Discharge — Unbilled Services</p>
//                   <p className="text-xs text-red-600 mt-0.5">Please invoice the following services before discharging this patient.</p>
//                 </div>
//                 <button type="button" onClick={() => setUnbilledServices(null)} className="ml-auto text-red-400 hover:text-red-600">
//                   <X className="w-4 h-4" />
//                 </button>
//               </div>
//               {unbilledServices.length > 0 ? (
//                 <div className="divide-y divide-red-100">
//                   {unbilledServices.map((svc, i) => (
//                     <div key={i} className="px-4 py-3 flex items-start gap-3">
//                       <div className="w-2 h-2 rounded-full bg-red-400 mt-1.5 shrink-0" />
//                       <div className="flex-1 min-w-0">
//                         <p className="text-sm font-medium text-red-800">{svc.type}</p>
//                         {svc.ids.length > 0 && (
//                           <div className="flex flex-wrap gap-1.5 mt-1.5">
//                             {svc.ids.map(id => (
//                               <span key={id} className="inline-flex items-center px-2 py-0.5 rounded-md bg-white border border-red-200 text-xs font-mono text-red-700">{id}</span>
//                             ))}
//                           </div>
//                         )}
//                       </div>
//                     </div>
//                   ))}
//                 </div>
//               ) : (
//                 <div className="px-4 py-3 text-sm text-red-700">
//                   There are unbilled healthcare services. Please review and invoice them before proceeding.
//                 </div>
//               )}
//             </div>
//           )}

//           {/* ── TAB: DETAILS ── */}
//           {activeTab === 'details' && (
//             <div className="p-6 space-y-6">
//               <section>
//                 <h3 className="text-sm font-semibold text-slate-700 mb-3">Basic Information</h3>
//                 <div className="grid grid-cols-2 gap-4">
//                   <div>
//                     <label className="block text-sm font-medium text-slate-700 mb-1">Admission</label>
//                     <input type="text" value={admission.name} disabled className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-slate-50 text-slate-500" />
//                   </div>
//                   <div>
//                     <label className="block text-sm font-medium text-slate-700 mb-1">Patient</label>
//                     <input type="text" value={admission.patient_name || admission.patient} disabled className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-slate-50 text-slate-500" />
//                   </div>
//                   <div>
//                     <label className="block text-sm font-medium text-slate-700 mb-1">Discharge Type</label>
//                     <select
//                       value={formData.discharge_type}
//                       onChange={(e) => setFormData({ ...formData, discharge_type: e.target.value, ama_type: '' })}
//                       className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
//                     >
//                       <option value="">Select Discharge Type</option>
//                       <option value="Home">Home</option>
//                       <option value="Refer To Another Hospital">Refer To Another Hospital</option>
//                       <option value="AMA">AMA</option>
//                     </select>
//                   </div>
//                   {formData.discharge_type === 'AMA' && (
//                     <div>
//                       <label className="block text-sm font-medium text-slate-700 mb-1">AMA Type</label>
//                       <select
//                         value={formData.ama_type}
//                         onChange={(e) => setFormData({ ...formData, ama_type: e.target.value })}
//                         className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
//                       >
//                         <option value="">Select AMA Type</option>
//                         <option value="Refuse Admission">Refuse Admission</option>
//                         <option value="Refuse Treatment / Procedure">Refuse Treatment / Procedure</option>
//                         <option value="Discharge Against Medical Advice(DAMA)">Discharge Against Medical Advice (DAMA)</option>
//                       </select>
//                     </div>
//                   )}
//                   <div>
//                     <label className="block text-sm font-medium text-slate-700 mb-1">Discharge Date</label>
//                     <input type="datetime-local" value={formData.discharge_date}
//                       onChange={(e) => setFormData({ ...formData, discharge_date: e.target.value })}
//                       className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
//                   </div>
//                 </div>
//               </section>

//               <section>
//                 <h3 className="text-sm font-semibold text-slate-700 mb-3">Discharged By</h3>
//                 <div className="grid grid-cols-2 gap-4">
//                   {/* Discharged By User */}
//                   <div className="relative dropdown-container">
//                     <label className="block text-sm font-medium text-slate-700 mb-1">Discharged By User</label>
//                     <input type="text" value={selectedDischargedBy ? selectedDischargedBy.label : dischargedByQuery}
//                       onChange={(e) => {
//                         setSelectedDischargedBy(null)
//                         setFormData(prev => ({ ...prev, discharged_by_user: '' }))
//                         setDischargedByQuery(e.target.value)
//                         setDischargedByOpen(true)
//                       }}
//                       onFocus={() => setDischargedByOpen(true)}
//                       placeholder="Search user..."
//                       className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
//                     {dischargedByOpen && dischargedByUsers.length > 0 && (
//                       <div className="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg max-h-48 overflow-auto">
//                         {dischargedByUsers.map(user => (
//                           <button key={user.name} type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50"
//                             onClick={() => { setSelectedDischargedBy(user); setFormData({ ...formData, discharged_by_user: user.name }); setDischargedByQuery(user.label); setDischargedByOpen(false) }}>
//                             {user.label}
//                           </button>
//                         ))}
//                       </div>
//                     )}
//                   </div>

//                   {/* Final Discharge User */}
//                   <div className="relative dropdown-container">
//                     <label className="block text-sm font-medium text-slate-700 mb-1">Final Discharge User</label>
//                     <input type="text" value={selectedFinalDischarge ? selectedFinalDischarge.label : finalDischargeQuery}
//                       onChange={(e) => {
//                         setSelectedFinalDischarge(null)
//                         setFormData(prev => ({ ...prev, final_discharge_user_id: '' }))
//                         setFinalDischargeQuery(e.target.value)
//                         setFinalDischargeOpen(true)
//                       }}
//                       onFocus={() => setFinalDischargeOpen(true)}
//                       placeholder="Search user..."
//                       className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
//                     {finalDischargeOpen && finalDischargeUsers.length > 0 && (
//                       <div className="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg max-h-48 overflow-auto">
//                         {finalDischargeUsers.map(user => (
//                           <button key={user.name} type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50"
//                             onClick={() => { setSelectedFinalDischarge(user); setFormData({ ...formData, final_discharge_user_id: user.name }); setFinalDischargeQuery(user.label); setFinalDischargeOpen(false) }}>
//                             {user.label}
//                           </button>
//                         ))}
//                       </div>
//                     )}
//                   </div>

//                   {/* Receiving Doctors */}
//                   <div className="relative dropdown-container">
//                     <label className="block text-sm font-medium text-slate-700 mb-1">Receiving Doctors</label>
//                     <input type="text" value={selectedReceivingDoctor ? selectedReceivingDoctor.label : receivingDoctorsQuery}
//                       onChange={(e) => {
//                         setSelectedReceivingDoctor(null)
//                         setFormData(prev => ({ ...prev, receiving_doctors: '' }))
//                         setReceivingDoctorsQuery(e.target.value)
//                         setReceivingDoctorsOpen(true)
//                       }}
//                       onFocus={() => setReceivingDoctorsOpen(true)}
//                       placeholder="Search healthcare practitioner..."
//                       className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
//                     {receivingDoctorsOpen && receivingDoctors.length > 0 && (
//                       <div className="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg max-h-48 overflow-auto">
//                         {receivingDoctors.map(doctor => (
//                           <button key={doctor.name} type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50"
//                             onClick={() => { setSelectedReceivingDoctor(doctor); setFormData({ ...formData, receiving_doctors: doctor.name }); setReceivingDoctorsQuery(doctor.label); setReceivingDoctorsOpen(false) }}>
//                             <div className="font-medium">{doctor.label}</div>
//                             {doctor.department && <div className="text-xs text-slate-500">{doctor.department}</div>}
//                           </button>
//                         ))}
//                       </div>
//                     )}
//                   </div>

//                   {/* Discharge Template */}
//                   <div className="relative dropdown-container">
//                     <label className="block text-sm font-medium text-slate-700 mb-1">Discharge Template</label>
//                     <input type="text" value={selectedDischargeTemplate ? selectedDischargeTemplate.label : dischargeTemplateQuery}
//                       onChange={(e) => {
//                         setSelectedDischargeTemplate(null)
//                         setFormData(prev => ({ ...prev, discharge_template: '' }))
//                         setDischargeTemplateQuery(e.target.value)
//                         setDischargeTemplateOpen(true)
//                       }}
//                       onFocus={() => setDischargeTemplateOpen(true)}
//                       placeholder="Search discharge template..."
//                       className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
//                     {dischargeTemplateOpen && dischargeTemplates.length > 0 && (
//                       <div className="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg max-h-48 overflow-auto">
//                         {dischargeTemplates.map(template => (
//                           <button key={template.name} type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50"
//                             onClick={() => {
//                               setSelectedDischargeTemplate(template)
//                               setFormData({ ...formData, discharge_template: template.name })
//                               setDischargeTemplateQuery(template.label)
//                               setDischargeTemplateOpen(false)
//                               loadChecklist(template.name)
//                             }}>
//                             {template.label}
//                           </button>
//                         ))}
//                       </div>
//                     )}
//                   </div>
//                 </div>
//               </section>

//               <section>
//                 <h3 className="text-sm font-semibold text-slate-700 mb-3">Final Discharge</h3>
//                 <div className="grid grid-cols-2 gap-4">
//                   <div>
//                     <label className="block text-sm font-medium text-slate-700 mb-1">Final Discharge Date</label>
//                     <input type="date" value={formData.final_discharge_date}
//                       onChange={(e) => setFormData({ ...formData, final_discharge_date: e.target.value })}
//                       className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
//                   </div>
//                   <div>
//                     <label className="block text-sm font-medium text-slate-700 mb-1">Final Discharge Time</label>
//                     <input type="time" value={formData.final_discharge_time}
//                       onChange={(e) => setFormData({ ...formData, final_discharge_time: e.target.value })}
//                       className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
//                   </div>
//                 </div>
//               </section>

//               <section>
//                 <h3 className="text-sm font-semibold text-slate-700 mb-3">Medical Information</h3>
//                 <div className="grid grid-cols-2 gap-4">
//                   {[
//                     { key: 'discharge_treatment_plan', label: 'Discharge Treatment Plan' },
//                     { key: 'discharge_reason', label: 'Discharge Reason' },
//                     { key: 'discharge_diagnosis', label: 'Discharge Diagnosis' },
//                     { key: 'discharge_conditions', label: 'Discharge Conditions' },
//                     { key: 'discharge_instructions', label: 'Discharge Instructions' },
//                     { key: 'discharge_medic_stopped_reason', label: 'Discharge Medic Stopped Reason' },
//                     { key: 'final_exam_mental_status_summary', label: 'Final Exam Mental Status Summary' },
//                     { key: 'management_in_hospital', label: 'Management In Hospital' },
//                     { key: 'prognosis', label: 'Prognosis' },
//                   ].map(({ key, label }) => (
//                     <div key={key}>
//                       <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
//                       <textarea rows={3}
//                         value={formData[key as keyof typeof formData]}
//                         onChange={(e) => setFormData({ ...formData, [key]: e.target.value })}
//                         className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
//                     </div>
//                   ))}
//                 </div>
//               </section>

//               <section>
//                 <h3 className="text-sm font-semibold text-slate-700 mb-3">Next Appointment</h3>
//                 <div className="grid grid-cols-2 gap-4">
//                   <div>
//                     <label className="block text-sm font-medium text-slate-700 mb-1">Next Appointment Date</label>
//                     <input type="date" value={formData.next_appointment_date}
//                       onChange={(e) => setFormData({ ...formData, next_appointment_date: e.target.value })}
//                       className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
//                   </div>
//                   <div>
//                     <label className="block text-sm font-medium text-slate-700 mb-1">Next Appointment Time</label>
//                     <input type="datetime-local" value={formData.next_appointment_time}
//                       onChange={(e) => setFormData({ ...formData, next_appointment_time: e.target.value })}
//                       className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
//                   </div>
//                 </div>
//               </section>
//             </div>
//           )}

//           {/* ── TAB: CHECKLIST ── */}
//           {activeTab === 'checklist' && (
//             <div className="p-6">
//               {totalItems > 0 && (
//                 <div className="mb-6">
//                   <div className="flex items-center justify-between mb-2">
//                     <span className="text-sm font-medium text-slate-700">Checklist Progress</span>
//                     <span className={`text-sm font-semibold ${allCompleted ? 'text-green-600' : 'text-amber-600'}`}>
//                       {completedItems} of {totalItems} completed
//                     </span>
//                   </div>
//                   <div className="w-full bg-slate-200 rounded-full h-2">
//                     <div
//                       className={`h-2 rounded-full transition-all duration-300 ${allCompleted ? 'bg-green-500' : 'bg-amber-500'}`}
//                       style={{ width: `${totalItems ? (completedItems / totalItems) * 100 : 0}%` }}
//                     />
//                   </div>
//                   {allCompleted && (
//                     <p className="text-xs text-green-600 mt-1.5 flex items-center gap-1">
//                       <CheckCircle2 className="w-3.5 h-3.5" />
//                       All items completed — patient is ready for discharge
//                     </p>
//                   )}
//                 </div>
//               )}

//               {checklistLoading ? (
//                 <div className="flex items-center justify-center py-16 text-slate-400 text-sm">Loading checklist...</div>
//               ) : checklistItems.length === 0 ? (
//                 <div className="flex flex-col items-center justify-center py-16 text-slate-400">
//                   <Circle className="w-10 h-10 mb-3 opacity-30" />
//                   <p className="text-sm">No checklist items found for the selected template.</p>
//                 </div>
//               ) : (
//                 <>
//                 <div className="space-y-4">
//                   {Object.entries(groupedChecklist).map(([dept, items]) => {
//                     const deptCompleted = items.filter(i => i.click).length
//                     const deptTotal = items.length
//                     const isDeptDone = deptCompleted === deptTotal
//                     const isOpen = expandedDepts[dept] !== false
//                     return (
//                       <div key={dept} className="border border-slate-200 rounded-lg overflow-hidden">
//                         <button type="button" onClick={() => toggleDept(dept)}
//                           className={`w-full flex items-center justify-between px-4 py-3 text-left transition-colors ${isDeptDone ? 'bg-green-50' : 'bg-slate-50'} hover:bg-slate-100`}>
//                           <div className="flex items-center gap-3">
//                             {isDeptDone ? <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" /> : <Circle className="w-5 h-5 text-slate-400 shrink-0" />}
//                             <div>
//                               <span className="text-sm font-semibold text-slate-800">{dept}</span>
//                               <span className="ml-2 text-xs text-slate-500">({deptCompleted}/{deptTotal})</span>
//                             </div>
//                           </div>
//                           {isOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
//                         </button>
//                         {isOpen && (
//                           <div className="divide-y divide-slate-100">
//                             {items.map((item) => {
//                               const isItemExpanded = expandedItems[item.name]
//                               return (
//                                 <div key={item.name} className={`transition-colors ${item.click ? 'bg-green-50/40' : 'bg-white'}`}>
//                                   <div className="px-4 py-3">
//                                     <div className="flex items-start gap-3">
//                                       <button type="button" onClick={() => toggleCheck(item.name)} className="mt-0.5 shrink-0 focus:outline-none">
//                                         {item.click ? <CheckCircle2 className="w-5 h-5 text-green-500" /> : <Circle className="w-5 h-5 text-slate-300 hover:text-slate-400" />}
//                                       </button>
//                                       <div className="flex-1 min-w-0">
//                                         <p className={`text-sm font-medium ${item.click ? 'line-through text-slate-400' : 'text-slate-800'}`}>
//                                           {item.action_required}
//                                         </p>
//                                         <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
//                                           {item.name1 && <span className="text-xs text-slate-500"><span className="font-medium">Contact:</span> {item.name1}</span>}
//                                           {item.click && item.date_time && (
//                                             <span className="text-xs text-green-600">✓ Completed {new Date(item.date_time).toLocaleString()}</span>
//                                           )}
//                                         </div>
//                                         {item.click && (
//                                           <div className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-3">
//                                             <div>
//                                               <label className="block text-xs font-medium text-slate-600 mb-1">User</label>
//                                               <input
//                                                 type="text"
//                                                 ref={userOpenForItem === item.name ? userTriggerRef : undefined}
//                                                 value={userOpenForItem === item.name ? userQuery : (dischargedByUsers.find(u => u.name === item.user)?.label || item.user || '')}
//                                                 onChange={(e) => {
//                                                   updateChecklistItem(item.name, 'user', '')
//                                                   setUserQuery(e.target.value)
//                                                   setUserOpenForItem(item.name)
//                                                 }}
//                                                 onFocus={() => { setUserOpenForItem(item.name); setUserQuery(dischargedByUsers.find(u => u.name === item.user)?.label || item.user || '') }}
//                                                 placeholder="Search user..."
//                                                 className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-green-400"
//                                               />
//                                             </div>
//                                             <div>
//                                               <label className="block text-xs font-medium text-slate-600 mb-1">Date &amp; Time</label>
//                                               <input type="datetime-local" value={item.date_time ? item.date_time.slice(0, 16) : ''}
//                                                 onChange={(e) => updateChecklistItem(item.name, 'date_time', toFrappeDateTime(e.target.value))}
//                                                 className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-green-400" />
//                                             </div>
//                                             <div>
//                                               <label className="block text-xs font-medium text-slate-600 mb-1">Department</label>
//                                               <input
//                                                 type="text"
//                                                 ref={departmentOpenForItem === item.name ? departmentTriggerRef : undefined}
//                                                 value={item.department ? departmentOptions.find(d => d.name === item.department)?.label || item.department : (departmentOpenForItem === item.name ? departmentQuery : '')}
//                                                 onChange={(e) => {
//                                                   updateChecklistItem(item.name, 'department', '')
//                                                   setDepartmentQuery(e.target.value)
//                                                   setDepartmentOpenForItem(item.name)
//                                                 }}
//                                                 onFocus={() => { setDepartmentOpenForItem(item.name); setDepartmentQuery(item.department ? departmentOptions.find(d => d.name === item.department)?.label || item.department : '') }}
//                                                 placeholder="Select Department..."
//                                                 className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-green-400"
//                                               />
//                                             </div>
//                                           </div>
//                                         )}
//                                       </div>
//                                       {item.description && (
//                                         <button type="button" onClick={() => toggleItem(item.name)} className="shrink-0 text-xs text-slate-400 hover:text-slate-600 mt-0.5">
//                                           {isItemExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
//                                         </button>
//                                       )}
//                                     </div>
//                                     {isItemExpanded && item.description && (
//                                       <div className="mt-3 ml-8 p-3 bg-slate-50 rounded text-xs text-slate-600 border border-slate-100"
//                                         dangerouslySetInnerHTML={{ __html: item.description }} />
//                                     )}
//                                   </div>
//                                 </div>
//                               )
//                             })}
//                           </div>
//                         )}
//                       </div>
//                     )
//                   })}
//                 </div>

//                 {/* Department dropdown — portaled so it shows outside the scrollable checklist */}
//                 {departmentOpenForItem && (
//                   <PortalActionsMenu
//                     open={!!departmentOpenForItem}
//                     onClose={() => setDepartmentOpenForItem(null)}
//                     triggerRef={departmentTriggerRef}
//                     minWidth={160}
//                     maxWidth={280}
//                     maxHeight={280}
//                   >
//                     {departmentOptions.map((dept) => (
//                       <button
//                         key={dept.name}
//                         type="button"
//                         className="w-full text-left px-3 py-2 text-sm hover:bg-green-50"
//                         onClick={() => {
//                           if (departmentOpenForItem) {
//                             updateChecklistItem(departmentOpenForItem, 'department', dept.name)
//                             setDepartmentQuery(dept.label)
//                             setDepartmentOpenForItem(null)
//                           }
//                         }}
//                       >
//                         {dept.label}
//                       </button>
//                     ))}
//                   </PortalActionsMenu>
//                 )}

//                 {/* User dropdown — portaled so it shows outside the scrollable checklist */}
//                 {userOpenForItem && (
//                   <PortalActionsMenu
//                     open={!!userOpenForItem}
//                     onClose={() => setUserOpenForItem(null)}
//                     triggerRef={userTriggerRef}
//                     minWidth={160}
//                     maxWidth={280}
//                     maxHeight={280}
//                   >
//                     {dischargedByUsers
//                       .filter((u) => !userQuery.trim() || (u.label || u.name || '').toLowerCase().includes(userQuery.toLowerCase()))
//                       .slice(0, 30)
//                       .map((user) => (
//                         <button
//                           key={user.name}
//                           type="button"
//                           className="w-full text-left px-3 py-2 text-sm hover:bg-green-50"
//                           onClick={() => {
//                             if (userOpenForItem) {
//                               updateChecklistItem(userOpenForItem, 'user', user.name)
//                               setUserOpenForItem(null)
//                             }
//                           }}
//                         >
//                           {user.label}
//                         </button>
//                       ))}
//                   </PortalActionsMenu>
//                 )}
//                 </>
//               )}
//             </div>
//           )}

//           {/* ── TAB: MEDICINE RECONCILIATION ── */}
//           {activeTab === 'reconcile' && (
//             <div className="p-6 space-y-6">
//               <h3 className="text-sm font-semibold text-slate-700 mb-1">Medicine Reconciliation</h3>
//               <p className="text-xs text-slate-600 mb-2">
//                 Review medicines given during this admission and reconcile remaining doses (return to store or transfer to follow-up).
//               </p>
//               <div className="space-y-4">
//                 <div>
//                   <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">Medicines given</h4>
//                   <MedicineGivenList patient={admission.patient} />
//                 </div>
//                 <div>
//                   <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">Medicines not given (remaining)</h4>
//                   <MedicineReconciliationList
//                     admission={admission.name}
//                     onRefresh={() => {}}
//                   />
//                 </div>
//               </div>
//             </div>
//           )}

//           {/* ── TAB: DOCUMENTS ── */}
//           {activeTab === 'documents' && (
//             <div className="p-6">
//               <p className="text-sm text-slate-500 mb-4">
//                 Attach discharge documents or capture digital signatures. You can upload a photo of a signed document <em>or</em> draw a signature directly on-screen.
//               </p>
//               <div className="space-y-4">
//                 {documents.length === 0 && (
//                   <div className="text-center py-10 rounded-lg border-2 border-dashed border-slate-200 text-slate-400 text-sm">
//                     No documents added yet. Click below to add one.
//                   </div>
//                 )}

//                 {documents.map((row, idx) => (
//                   <div key={idx} className="rounded-lg border border-slate-200 bg-slate-50/50 overflow-hidden">
//                     {/* Card header */}
//                     <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200 bg-white">
//                       <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
//                         Document #{idx + 1}
//                       </span>
//                       <button type="button" onClick={() => removeDocumentRow(idx)}
//                         className="p-1 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors" title="Remove row">
//                         <X className="w-4 h-4" />
//                       </button>
//                     </div>

//                     {/* Two-column layout: metadata left, attachment/signature right */}
//                     <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] divide-y lg:divide-y-0 lg:divide-x divide-slate-200">

//                       {/* Left: metadata fields */}
//                       <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
//                         <div>
//                           <label className="block text-xs font-medium text-slate-600 mb-0.5">File Name</label>
//                           <input value={row.file_name} onChange={(e) => updateDocumentRow(idx, 'file_name', e.target.value)}
//                             placeholder="File name"
//                             className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
//                         </div>
//                         <div>
//                           <label className="block text-xs font-medium text-slate-600 mb-0.5">Document Type</label>
//                           <select value={row.document_type || ''} onChange={(e) => updateDocumentRow(idx, 'document_type', e.target.value)}
//                             className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary">
//                             <option value="">Select type</option>
//                             {documentTypes.map((dt) => (
//                               <option key={dt.name} value={dt.name}>{dt.document_name || dt.name}</option>
//                             ))}
//                           </select>
//                         </div>
//                         <div>
//                           <label className="block text-xs font-medium text-slate-600 mb-0.5">Transaction No</label>
//                           <input value={row.transaction_no || ''} onChange={(e) => updateDocumentRow(idx, 'transaction_no', e.target.value)}
//                             placeholder="Transaction number"
//                             className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
//                         </div>
//                         <div>
//                           <label className="block text-xs font-medium text-slate-600 mb-0.5">Upload Remarks</label>
//                           <input value={row.upload_remarks || ''} onChange={(e) => updateDocumentRow(idx, 'upload_remarks', e.target.value)}
//                             placeholder="Remarks"
//                             className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
//                         </div>

//                         {/* File upload */}
//                         <div className="sm:col-span-2">
//                           <label className="block text-xs font-medium text-slate-600 mb-0.5">
//                             File Attachment
//                             <span className="ml-1 font-normal text-slate-400">(photo of signed doc, PDF, etc.)</span>
//                           </label>
//                           <input type="file" disabled={documentUploading === idx}
//                             onChange={(e) => { const f = e.target.files?.[0]; if (f) handleDocumentFile(idx, f); e.target.value = '' }}
//                             className="w-full text-sm file:mr-2 file:rounded file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-white file:text-sm" />
//                           {documentUploading === idx && (
//                             <span className="text-xs text-slate-500 mt-0.5 block">Uploading...</span>
//                           )}
//                           {row.document && documentUploading !== idx && signatureUploading !== idx && (
//                             <span className="text-xs text-green-600 mt-0.5 block truncate" title={row.document}>
//                               ✓ File attached
//                             </span>
//                           )}
//                         </div>
//                       </div>

//                       {/* Right: digital signature pad */}
//                       <div className="p-4 flex flex-col gap-2">
//                         <div className="flex items-center gap-1.5 mb-1">
//                           <PenLine className="w-3.5 h-3.5 text-slate-400" />
//                           <span className="text-xs font-medium text-slate-600">Digital Signature</span>
//                           <span className="text-xs text-slate-400 ml-1">— draw &amp; save as file</span>
//                         </div>
//                         <div className="flex-1">
//                           <SignaturePad
//                             onSave={(file) => handleSignatureFile(idx, file)}
//                             onClear={() => {
//                               // If the current document was a signature, clear it
//                               // (only clear if it was set by signature, not file upload — we can't distinguish,
//                               //  so we leave it; user can re-upload to replace)
//                             }}
//                             existingUrl={row.document?.endsWith('.png') || row.document?.includes('signature_') ? row.document : undefined}
//                             uploading={signatureUploading === idx}
//                           />
//                         </div>
//                         {signatureUploading === idx && (
//                           <p className="text-xs text-slate-500 text-center">Uploading signature...</p>
//                         )}
//                         <p className="text-xs text-slate-400 leading-relaxed">
//                           Draw your signature above, then tap <strong>Save Signature</strong> — it will be stored as a PNG file attached to this document row.
//                         </p>
//                       </div>
//                     </div>
//                   </div>
//                 ))}

//                 <button type="button" onClick={addDocumentRow}
//                   className="flex items-center gap-1.5 text-sm text-primary font-medium hover:underline">
//                   <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
//                     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
//                   </svg>
//                   Add document
//                 </button>
//               </div>
//             </div>
//           )}

//           {/* ── TAB: RELATIVES ── */}
//           {activeTab === 'relatives' && (
//             <div className="p-6">
//               <p className="text-sm text-slate-500 mb-4">
//                 Add relatives / guardians who are relevant for this discharge record.
//               </p>
//               <div className="border border-slate-200 rounded-md">
//                 <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 bg-slate-50">
//                   <h3 className="text-sm font-semibold text-slate-800">Relatives / Guardians</h3>
//                   <button
//                     type="button"
//                     className="text-xs px-2 py-1 rounded-full bg-primary text-white hover:bg-primary/90"
//                     onClick={() =>
//                       setRelatives(prev => [
//                         ...prev,
//                         { relationship_with_patient: '', relative_name: '', cpr__id_no: '', any_remarks: '', relative_phone_no: '', relative_alternative_phone_no: '', relative_alternative_phone_no_2: '' },
//                       ])
//                     }
//                   >
//                     + Add Relative
//                   </button>
//                 </div>
//                 <div className="divide-y divide-slate-200">
//                   {relatives.map((row, idx) => (
//                     <div key={idx} className="px-3 py-3 space-y-2">
//                       <div className="grid grid-cols-3 gap-3">
//                         <div>
//                           <label className="block text-xs font-medium text-slate-700 mb-1">
//                             Relation
//                           </label>
//                           <select
//                             value={row.relationship_with_patient}
//                             onChange={(e) => {
//                               const value = e.target.value
//                               setRelatives(prev => prev.map((r, i) =>
//                                 i === idx ? { ...r, relationship_with_patient: value } : r
//                               ))
//                             }}
//                             className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-primary"
//                           >
//                             <option value="">Select relation</option>
//                             {RELATION_OPTIONS.map(opt => (
//                               <option key={opt} value={opt}>
//                                 {opt}
//                               </option>
//                             ))}
//                           </select>
//                         </div>
//                         <div>
//                           <label className="block text-xs font-medium text-slate-700 mb-1">
//                             Name
//                           </label>
//                           <input
//                             type="text"
//                             value={row.relative_name}
//                             onChange={(e) => {
//                               const value = e.target.value
//                               setRelatives(prev => prev.map((r, i) =>
//                                 i === idx ? { ...r, relative_name: value } : r
//                               ))
//                             }}
//                             className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
//                             placeholder="Relative full name"
//                           />
//                         </div>
//                         <div>
//                           <label className="block text-xs font-medium text-slate-700 mb-1">
//                             ID Number
//                           </label>
//                           <input
//                             type="text"
//                             value={row.cpr__id_no}
//                             onChange={(e) => {
//                               const value = e.target.value
//                               setRelatives(prev => prev.map((r, i) =>
//                                 i === idx ? { ...r, cpr__id_no: value } : r
//                               ))
//                             }}
//                             className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
//                             placeholder="CPR / ID"
//                           />
//                         </div>
//                       </div>

//                        <div className="grid grid-cols-3 gap-3">
//                          <div>
//                           <label className="block text-xs font-medium text-slate-700 mb-1">
//                             Phone No
//                           </label>
//                           <input
//                             type="text"
//                             value={row.relative_phone_no}
//                             onChange={(e) => {
//                               const value = e.target.value
//                               setRelatives(prev => prev.map((r, i) =>
//                                 i === idx ? { ...r, relative_phone_no: value } : r
//                               ))
//                             }}
//                             className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
//                             placeholder="Phone NO"
//                           />
//                         </div>
//                         <div>
//                           <label className="block text-xs font-medium text-slate-700 mb-1">
//                             Alternative Phone No
//                           </label>
//                           <input
//                             type="text"
//                             value={row.relative_alternative_phone_no}
//                             onChange={(e) => {
//                               const value = e.target.value
//                               setRelatives(prev => prev.map((r, i) =>
//                                 i === idx ? { ...r, relative_alternative_phone_no: value } : r
//                               ))
//                             }}
//                             className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
//                             placeholder="CPR / ID"
//                           />
//                         </div>
//                         <div>
//                           <label className="block text-xs font-medium text-slate-700 mb-1">
//                             Alternative Phone No 2
//                           </label>
//                           <input
//                             type="text"
//                             value={row.relative_alternative_phone_no_2}
//                             onChange={(e) => {
//                               const value = e.target.value
//                               setRelatives(prev => prev.map((r, i) =>
//                                 i === idx ? { ...r, relative_alternative_phone_no_2: value } : r
//                               ))
//                             }}
//                             className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
//                             placeholder="CPR / ID"
//                           />
//                         </div>
//                       </div>

                      
//                       <div className="flex items-start gap-2">
//                         <div className="flex-1">
//                           <label className="block text-xs font-medium text-slate-700 mb-1">
//                             Remarks
//                           </label>
//                           <textarea
//                             value={row.any_remarks}
//                             onChange={(e) => {
//                               const value = e.target.value
//                               setRelatives(prev => prev.map((r, i) =>
//                                 i === idx ? { ...r, any_remarks: value } : r
//                               ))
//                             }}
//                             rows={2}
//                             className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
//                             placeholder="Any notes about this relative / guardian"
//                           />
//                         </div>
//                         {relatives.length > 1 && (
//                           <button
//                             type="button"
//                             className="mt-5 text-xs text-red-600 hover:text-red-700"
//                             onClick={() =>
//                               setRelatives(prev => prev.filter((_, i) => i !== idx))
//                             }
//                           >
//                             Remove
//                           </button>
//                         )}
//                       </div>
//                     </div>
//                   ))}
//                 </div>
//               </div>
//             </div>
//           )}

//           {/* Footer */}
//           <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between bg-slate-50">
//             <div className="text-xs text-slate-500">
//               {totalItems > 0 && !allCompleted && (
//                 <span className="flex items-center gap-1 text-amber-600">
//                   <AlertCircle className="w-3.5 h-3.5" />
//                   {totalItems - completedItems} checklist item{totalItems - completedItems !== 1 ? 's' : ''} remaining
//                 </span>
//               )}
//               {allCompleted && totalItems > 0 && (
//                 <span className="flex items-center gap-1 text-green-600">
//                   <CheckCircle2 className="w-3.5 h-3.5" />
//                   Checklist complete
//                 </span>
//               )}
//             </div>
//             <div className="flex gap-2">
//               <button
//                 type="button"
//                 onClick={onClose}
//                 className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50"
//               >
//                 Cancel
//               </button>
//               <button
//                 type="button"
//                 onClick={handleSaveAndClose}
//                 disabled={submitting}
//                 className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-amber-800 bg-amber-50 border border-amber-300 rounded-md hover:bg-amber-100 disabled:opacity-50 disabled:cursor-not-allowed"
//                 title="Save progress and close. You can continue this discharge later."
//               >
//                 <Save className="w-4 h-4" />
//                 Save &amp; Close
//               </button>
//               <button
//                 type="submit"
//                 disabled={submitting}
//                 className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
//               >
//                 {submitting ? 'Discharging...' : 'Discharge Patient'}
//               </button>
//             </div>
//           </div>
//         </form>
//       </div>
//     </div>
//   )
// }
import { useState, useEffect, useRef, useCallback } from 'react'
import { createDischarge, UnbilledServicesError } from '../../services/inpatientRecords'
import { uploadPatientFile, type PatientDocumentRow } from '../../services/patients'
import { MedicineGivenList } from '../medication/MedicineGivenList'
import { MedicineReconciliationList } from '../medication/MedicineReconciliationList'
import { getDischargeReconciliationRows, type DischargeReconciliationRow } from '../../services/medicineGiven'
import type { MedicationOrderRow } from '../../services/prescriptions'
import { fetchHealthcarePractitioners, fetchUsers, fetchDischargeTemplates, fetchDischargeChecklist, fetchDepartments, fetchDocumentTypes, fetchNursingDischargeTemplates, type LinkFieldOption, fetchNursingDischargeChecklist } from '../../services/common'
import { PortalActionsMenu } from '../ui/PortalActionsMenu'
import { CreatePrescriptionModal } from '../prescriptions/CreatePrescriptionModal'
import { fetchDischargeTransferPrescriptions } from '../../services/prescriptions'
import { toast } from '../../hooks/useToast'
import { useCareContext } from '../../providers/CareContextProvider'
import { saveDischargeDraft, loadDischargeDraft, clearDischargeDraft, draftSavedAt } from '../../services/dischargeDraft'
import { X, CheckCircle2, Circle, ChevronDown, ChevronUp, AlertCircle, Receipt, PenLine, Trash2, Check, Save, Clock } from 'lucide-react'

// ─── Signature Pad Component ────────────────────────────────────────────────

interface SignaturePadProps {
  onSave: (file: File) => void
  onClear?: () => void
  existingUrl?: string
  uploading?: boolean
}

const SignaturePad = ({ onSave, onClear, existingUrl, uploading }: SignaturePadProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const isDrawing = useRef(false)
  const [hasStrokes, setHasStrokes] = useState(false)
  const [mode, setMode] = useState<'idle' | 'drawing' | 'done'>(existingUrl ? 'done' : 'idle')

  const initCtx = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.strokeStyle = '#1e293b'
    ctx.lineWidth = 2.2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    return ctx
  }, [])

  const getPos = (e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    if ('touches' in e) {
      const t = e.touches[0]
      return { x: (t.clientX - rect.left) * scaleX, y: (t.clientY - rect.top) * scaleY }
    }
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY }
  }

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = initCtx()
    if (!ctx) return
    isDrawing.current = true
    const pos = getPos(e, canvas)
    ctx.beginPath()
    ctx.moveTo(pos.x, pos.y)
  }

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    if (!isDrawing.current) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = initCtx()
    if (!ctx) return
    const pos = getPos(e, canvas)
    ctx.lineTo(pos.x, pos.y)
    ctx.stroke()
    setHasStrokes(true)
  }

  const endDraw = () => {
    isDrawing.current = false
  }

  const clearCanvas = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasStrokes(false)
    onClear?.()
  }

  const saveSignature = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.toBlob((blob) => {
      if (!blob) return
      const file = new File([blob], `signature_${Date.now()}.png`, { type: 'image/png' })
      onSave(file)
      setMode('done')
    }, 'image/png')
  }

  useEffect(() => {
    if (mode !== 'drawing') return
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * window.devicePixelRatio
    canvas.height = rect.height * window.devicePixelRatio
    const ctx = canvas.getContext('2d')
    if (ctx) ctx.scale(window.devicePixelRatio, window.devicePixelRatio)
    setHasStrokes(false)
  }, [mode])

  if (mode === 'idle') {
    return (
      <button
        type="button"
        onClick={() => setMode('drawing')}
        className="w-full h-full min-h-[96px] flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-200 text-slate-400 hover:border-green-400 hover:text-green-600 hover:bg-green-50/50 transition-all group"
      >
        <PenLine className="w-5 h-5 group-hover:scale-110 transition-transform" />
        <span className="text-xs font-medium">Add Signature</span>
      </button>
    )
  }

  if (mode === 'done' && existingUrl) {
    return (
      <div className="w-full h-full min-h-[96px] flex flex-col items-center justify-center gap-2 rounded-lg border border-green-200 bg-green-50 p-2">
        <img
          src={existingUrl}
          alt="Signature"
          className="max-h-16 object-contain"
        />
        <button
          type="button"
          onClick={() => { setMode('drawing'); clearCanvas() }}
          className="text-xs text-slate-500 hover:text-red-500 flex items-center gap-1 transition-colors"
        >
          <Trash2 className="w-3 h-3" /> Re-sign
        </button>
      </div>
    )
  }

  return (
    <div className="w-full rounded-lg border border-slate-300 bg-white overflow-hidden flex flex-col">
      <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-slate-100 bg-slate-50">
        <span className="text-xs font-medium text-slate-500 flex items-center gap-1">
          <PenLine className="w-3 h-3" /> Draw signature
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={clearCanvas}
            disabled={!hasStrokes}
            className="text-xs text-slate-400 hover:text-red-500 disabled:opacity-30 flex items-center gap-0.5 transition-colors px-1.5 py-0.5 rounded hover:bg-red-50"
          >
            <Trash2 className="w-3 h-3" /> Clear
          </button>
          <button
            type="button"
            onClick={() => { setMode('idle'); clearCanvas() }}
            className="text-xs text-slate-400 hover:text-slate-600 px-1.5 py-0.5 rounded hover:bg-slate-100 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>

      <div className="relative" style={{ touchAction: 'none' }}>
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height: '96px', display: 'block', cursor: 'crosshair' }}
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
        />
        {!hasStrokes && (
          <span className="absolute inset-0 flex items-center justify-center text-xs text-slate-300 pointer-events-none select-none">
            Sign here
          </span>
        )}
      </div>

      <div className="px-2.5 py-2 border-t border-slate-100 flex justify-end">
        <button
          type="button"
          onClick={saveSignature}
          disabled={!hasStrokes || uploading}
          className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md bg-green-600 text-white hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {uploading ? (
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              Saving…
            </span>
          ) : (
            <>
              <Check className="w-3 h-3" /> Save Signature
            </>
          )}
        </button>
      </div>
    </div>
  )
}

// ─── Types ──────────────────────────────────────────────────────────────────

interface ChecklistItem {
  name: string
  action_required: string
  department: string
  department_label?: string
  user: string
  name1: string
  date_time: string
  click: boolean
  description?: string
}

interface DischargeModalProps {
  admission: {
    name: string
    patient: string
    patient_name?: string
  }
  onClose: () => void
  onSuccess: () => void
}

const groupByDepartment = (items: ChecklistItem[]) => {
  return items.reduce((acc, item) => {
    const dept = item.department_label || item.department || 'General'
    if (!acc[dept]) acc[dept] = []
    acc[dept].push(item)
    return acc
  }, {} as Record<string, ChecklistItem[]>)
}

const RELATION_OPTIONS = [
  'Father',
  'Mother',
  'Brother',
  'Sister',
  'Husband',
  'Wife',
  'Son',
  'Daughter',
] as const

const TRANSFER_ALLOWED_ROLES = ['Doctor', 'System Manager', 'Healthcare Administrator', 'Administrator'] as const

function addDaysToIsoDate(dateStr: string, days: number): string {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

interface TransferPrescriptionModalProps {
  rows: DischargeReconciliationRow[]
  selectedNames: string[]
  onClose: () => void
  onConfirm: () => Promise<void>
  isSubmitting: boolean
}

const TransferPrescriptionModal = ({ rows, selectedNames, onClose, onConfirm, isSubmitting }: TransferPrescriptionModalProps) => (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
    <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[85vh] overflow-hidden flex flex-col">
      <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Confirm prescription transfer</h2>
          <p className="text-sm text-slate-600">Review the remaining discharge medicines before creating the follow-up prescription and patient visit.</p>
        </div>
        <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded-md hover:bg-slate-100 transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        {selectedNames.length === 0 ? (
          <div className="text-sm text-slate-500">No medicines selected for transfer.</div>
        ) : (
          <div className="space-y-4">
            <div className="text-sm text-slate-600">The following remaining medicines will be transferred to a new Patient Visit prescription:</div>
            <div className="bg-white border border-slate-200 rounded-lg overflow-auto max-h-[340px]">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-600">Drug</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-600">Remaining</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {rows
                    .filter((row) => selectedNames.includes(row.name))
                    .map((row) => (
                      <tr key={row.name} className="hover:bg-slate-50">
                        <td className="px-3 py-2 text-slate-800">{row.drug_name || row.drug}</td>
                        <td className="px-3 py-2 text-slate-700">{row.remaining}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
      <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-end gap-3 bg-slate-50">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 rounded border border-slate-300 text-slate-700 hover:bg-slate-100"
          disabled={isSubmitting}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={isSubmitting || selectedNames.length === 0}
          className="px-4 py-2 rounded bg-primary text-white hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? 'Creating prescription…' : 'Create prescription & visit'}
        </button>
      </div>
    </div>
  </div>
)

// ─── Main Modal ─────────────────────────────────────────────────────────────

export const DischargeModal = ({ admission, onClose, onSuccess }: DischargeModalProps) => {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [unbilledServices, setUnbilledServices] = useState<{ type: string; ids: string[] }[] | null>(null)
  const [activeTab, setActiveTab] = useState<'details' | 'checklist' | 'nursing' | 'transfer' | 'reconcile' | 'documents' | 'relatives'>('details')

  const { userRole } = useCareContext()
  const canViewMedicineTransfer = (userRole || []).some((role) => TRANSFER_ALLOWED_ROLES.includes(role as typeof TRANSFER_ALLOWED_ROLES[number]))

  const [transferRows, setTransferRows] = useState<DischargeReconciliationRow[]>([])
  const [transferLoading, setTransferLoading] = useState(false)
  const [transferError, setTransferError] = useState<string | null>(null)
  const [transferModalOpen, setTransferModalOpen] = useState(false)
  const [transferSelected, setTransferSelected] = useState<Set<string>>(new Set())
  const [transferPrescription, setTransferPrescription] = useState<{ name: string; patient_visit?: string } | null>(null)

  // Checklist state
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([])
  const [checklistLoading, setChecklistLoading] = useState(false)
  const [expandedDepts, setExpandedDepts] = useState<Record<string, boolean>>({})
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({})

  // Nursing Checklist state
  const [nurseChecklistItems, setNurseChecklistItems] = useState<ChecklistItem[]>([])
  const [nurseChecklistLoading, setNurseChecklistLoading] = useState(false)
  const [expandedNurseDepts, setExpandedNurseDepts] = useState<Record<string, boolean>>({})
  const [expandedNurseItems, setExpandedNurseItems] = useState<Record<string, boolean>>({})

  // Documents state
  const [documents, setDocuments] = useState<PatientDocumentRow[]>([])
  const [documentTypes, setDocumentTypes] = useState<{ name: string; document_name?: string }[]>([])
  const [documentUploading, setDocumentUploading] = useState<number | null>(null)
  const [signatureUploading, setSignatureUploading] = useState<number | null>(null)

  // Relatives / guardians
  const [relatives, setRelatives] = useState<
    { relationship_with_patient: string; relative_name: string; cpr__id_no: string; any_remarks: string, relative_phone_no: string, relative_alternative_phone_no: string, relative_alternative_phone_no_2: string }[]
  >([{ relationship_with_patient: '', relative_name: '', cpr__id_no: '', any_remarks: '', relative_phone_no: '', relative_alternative_phone_no: '', relative_alternative_phone_no_2: '' }])

  // Link field dropdowns
  const [dischargedByUsers, setDischargedByUsers] = useState<LinkFieldOption[]>([])
  const [finalDischargeUsers, setFinalDischargeUsers] = useState<LinkFieldOption[]>([])
  const [receivingDoctors, setReceivingDoctors] = useState<LinkFieldOption[]>([])
  const [dischargeTemplates, setDischargeTemplates] = useState<LinkFieldOption[]>([])
  const [nurseTemplateOptions, setNurseTemplateOptions] = useState<LinkFieldOption[]>([])

  const [dischargedByOpen, setDischargedByOpen] = useState(false)
  const [finalDischargeOpen, setFinalDischargeOpen] = useState(false)
  const [receivingDoctorsOpen, setReceivingDoctorsOpen] = useState(false)
  const [dischargeTemplateOpen, setDischargeTemplateOpen] = useState(false)
  const [nurseTemplateOpen, setNurseTemplateOpen] = useState(false)

  const [dischargedByQuery, setDischargedByQuery] = useState('')
  const [finalDischargeQuery, setFinalDischargeQuery] = useState('')
  const [receivingDoctorsQuery, setReceivingDoctorsQuery] = useState('')
  const [dischargeTemplateQuery, setDischargeTemplateQuery] = useState('')
  const [nurseTemplateQuery, setNurseTemplateQuery] = useState('')

  const [selectedDischargedBy, setSelectedDischargedBy] = useState<LinkFieldOption | null>(null)
  const [selectedFinalDischarge, setSelectedFinalDischarge] = useState<LinkFieldOption | null>(null)
  const [selectedReceivingDoctor, setSelectedReceivingDoctor] = useState<LinkFieldOption | null>(null)
  const [selectedDischargeTemplate, setSelectedDischargeTemplate] = useState<LinkFieldOption | null>(null)
  const [selectedNurseTemplate, setSelectedNurseTemplate] = useState<LinkFieldOption | null>(null)

  // Department dropdown for checklist
  const [departmentOptions, setDepartmentOptions] = useState<LinkFieldOption[]>([])
  const [departmentQuery, setDepartmentQuery] = useState('')
  const [departmentOpenForItem, setDepartmentOpenForItem] = useState<string | null>(null)
  const departmentTriggerRef = useRef<HTMLInputElement | null>(null)

  // User dropdown for checklist
  const [userOpenForItem, setUserOpenForItem] = useState<string | null>(null)
  const [userQuery, setUserQuery] = useState('')
  const userTriggerRef = useRef<HTMLInputElement | null>(null)

  const toFrappeDateTime = (value?: string) => {
    if (!value) return ''
    let s = value.trim()
    if (s.includes('T')) {
      if (s.endsWith('Z')) s = s.slice(0, -1)
      s = s.replace('T', ' ')
    }
    if (s.length > 19) s = s.slice(0, 19)
    if (s.length === 16) s += ':00'
    return s
  }

  const [formData, setFormData] = useState({
    discharge_type: '',
    ama_type: '',
    discharge_date: new Date().toISOString().slice(0, 16),
    discharge_time: new Date().toISOString().slice(0, 10),
    final_discharge_date: new Date().toISOString().slice(0, 10),
    final_discharge_time: new Date().toTimeString().slice(0, 5),
    discharged_by_user: '',
    final_discharge_user_id: '',
    receiving_doctors: '',
    discharge_template: '',
    nurse_discharge_template: '',
    discharge_treatment_plan: '',
    discharge_reason: '',
    discharge_diagnosis: '',
    discharge_conditions: '',
    discharge_instructions: '',
    discharge_medic_stopped_reason: '',
    final_exam_mental_status_summary: '',
    management_in_hospital: '',
    prognosis: '',
    next_appointment_date: '',
    next_appointment_time: ''
  })

  // Load initial data
  useEffect(() => {
    const loadData = async () => {
      try {
        const [users, doctors, templates, nurseTemplates, docTypes] = await Promise.all([
          fetchUsers(),
          fetchHealthcarePractitioners(),
          fetchDischargeTemplates(),
          fetchNursingDischargeTemplates(),
          fetchDocumentTypes(),
        ])
        setDischargedByUsers(users)
        setFinalDischargeUsers(users)
        setReceivingDoctors(doctors)
        setDischargeTemplates(templates)
        setNurseTemplateOptions(nurseTemplates)
        setDocumentTypes(docTypes)

        const draft = loadDischargeDraft(admission.name)
        if (draft) {
          setFormData(prev => ({ ...prev, ...draft.formData }))
          if (draft.selectedOptions.dischargedBy) {
            setSelectedDischargedBy(draft.selectedOptions.dischargedBy)
            setDischargedByQuery(draft.selectedOptions.dischargedByQuery || draft.selectedOptions.dischargedBy.label)
          }
          if (draft.selectedOptions.finalDischarge) {
            setSelectedFinalDischarge(draft.selectedOptions.finalDischarge)
            setFinalDischargeQuery(draft.selectedOptions.finalDischargeQuery || draft.selectedOptions.finalDischarge.label)
          }
          if (draft.selectedOptions.receivingDoctor) {
            setSelectedReceivingDoctor(draft.selectedOptions.receivingDoctor)
            setReceivingDoctorsQuery(draft.selectedOptions.receivingDoctorsQuery || draft.selectedOptions.receivingDoctor.label)
          }
          if (draft.selectedOptions.dischargeTemplate) {
            setSelectedDischargeTemplate(draft.selectedOptions.dischargeTemplate)
            setDischargeTemplateQuery(draft.selectedOptions.dischargeTemplateQuery || draft.selectedOptions.dischargeTemplate.label)
            await loadChecklist(draft.selectedOptions.dischargeTemplate.name)
          } else {
            await loadChecklist('Inpatient Discharge')
          }
          if (draft.selectedOptions.nurseTemplate) {
            setSelectedNurseTemplate(draft.selectedOptions.nurseTemplate)
            setNurseTemplateQuery(draft.selectedOptions.nurseTemplateQuery || draft.selectedOptions.nurseTemplate.label)
            await loadNurseChecklist(draft.selectedOptions.nurseTemplate.name)
          }
          if (Array.isArray(draft.checklistItems) && draft.checklistItems.length > 0) {
            setChecklistItems(draft.checklistItems as ChecklistItem[])
          }
          if (Array.isArray(draft.nurseChecklistItems) && draft.nurseChecklistItems.length > 0) {
            setNurseChecklistItems(draft.nurseChecklistItems as ChecklistItem[])
          }
          if (Array.isArray(draft.documents) && draft.documents.length > 0) {
            setDocuments(draft.documents as PatientDocumentRow[])
          }
          if (Array.isArray(draft.relatives) && draft.relatives.length > 0) {
            setRelatives(draft.relatives as typeof relatives)
          }
          if (draft.transferPrescription) {
            setTransferPrescription(draft.transferPrescription)
          }
          toast.info('Resumed from saved draft', 3000)
          return
        }

        await loadChecklist('Inpatient Discharge')
        const defaultTemplate = templates.find(t => t.label === 'Inpatient Discharge' || t.name === 'Inpatient Discharge')
        if (defaultTemplate) {
          setSelectedDischargeTemplate(defaultTemplate)
          setFormData(prev => ({ ...prev, discharge_template: defaultTemplate.name }))
          setDischargeTemplateQuery(defaultTemplate.label)
        }

        // Check for existing discharge transfer prescriptions
        try {
          const existingTransfers = await fetchDischargeTransferPrescriptions(admission.patient)
          if (existingTransfers.length > 0) {
            // Use the most recent one
            const latestTransfer = existingTransfers[0]
            setTransferPrescription({
              name: latestTransfer.name,
              patient_visit: latestTransfer.patient_encounter, // Assuming patient_encounter is the visit
            })
          }
        } catch (error) {
          console.error('Failed to check for existing transfer prescriptions:', error)
        }
      } catch (err) {
        console.error('Failed to load data:', err)
      }
    }
    loadData()
  }, [])

  const loadChecklist = async (templateName: string) => {
    if (!templateName) return
    setChecklistLoading(true)
    try {
      const items = await fetchDischargeChecklist(templateName)
      setChecklistItems(items)
      const deptMap: Record<string, boolean> = {}
      items.forEach((item: ChecklistItem) => {
        const dept = item.department_label || item.department || 'General'
        deptMap[dept] = true
      })
      setExpandedDepts(deptMap)
    } catch (err) {
      console.error('Failed to load checklist:', err)
      setChecklistItems([])
    } finally {
      setChecklistLoading(false)
    }
  }

  const loadNurseChecklist = async (templateName: string) => {
    if (!templateName) return
    setNurseChecklistLoading(true)
    try {
      const items = await fetchNursingDischargeChecklist(templateName)
      setNurseChecklistItems(items)
      const deptMap: Record<string, boolean> = {}
      items.forEach((item: ChecklistItem) => {
        const dept = item.department_label || item.department || 'General'
        deptMap[dept] = true
      })
      setExpandedNurseDepts(deptMap)
    } catch (err) {
      console.error('Failed to load nursing checklist:', err)
      setNurseChecklistItems([])
    } finally {
      setNurseChecklistLoading(false)
    }
  }

  const addDocumentRow = () => {
    setDocuments(prev => [...prev, { file_name: '', document_type: '', transaction_no: '', upload_remarks: '' }])
  }

  const removeDocumentRow = (idx: number) => {
    setDocuments(prev => prev.filter((_, i) => i !== idx))
  }

  const updateDocumentRow = (idx: number, field: keyof PatientDocumentRow, value: string) => {
    setDocuments(prev => {
      const next = [...prev]
      next[idx] = { ...next[idx], [field]: value }
      return next
    })
  }

  const handleDocumentFile = async (idx: number, file: File | null) => {
    if (!file) return
    setDocumentUploading(idx)
    try {
      const file_url = await uploadPatientFile(file)
      if (!file_url) throw new Error('No URL returned from upload')
      setDocuments(prev => {
        const next = [...prev]
        next[idx] = {
          ...next[idx],
          document: file_url,
          file_name: next[idx].file_name?.trim() || file.name,
        }
        return next
      })
      toast.success('File uploaded')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'File upload failed')
    } finally {
      setDocumentUploading(null)
    }
  }

  const handleSignatureFile = async (idx: number, file: File) => {
    setSignatureUploading(idx)
    try {
      const file_url = await uploadPatientFile(file)
      if (!file_url) throw new Error('No URL returned from signature upload')
      setDocuments(prev => {
        const next = [...prev]
        next[idx] = {
          ...next[idx],
          document: file_url,
          file_name: next[idx].file_name?.trim() || `Signature ${idx + 1}`,
        }
        return next
      })
      toast.success('Signature saved')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Signature upload failed')
    } finally {
      setSignatureUploading(null)
    }
  }

  // Search effects
  useEffect(() => {
    if (!dischargedByOpen) return
    const search = async () => {
      try { const results = await fetchUsers(dischargedByQuery); setDischargedByUsers(results) }
      catch { setDischargedByUsers([]) }
    }
    const id = setTimeout(search, dischargedByQuery.trim() === '' ? 0 : 300)
    return () => clearTimeout(id)
  }, [dischargedByQuery, dischargedByOpen])

  useEffect(() => {
    if (!finalDischargeOpen) return
    const search = async () => {
      try { const results = await fetchUsers(finalDischargeQuery); setFinalDischargeUsers(results) }
      catch { setFinalDischargeUsers([]) }
    }
    const id = setTimeout(search, finalDischargeQuery.trim() === '' ? 0 : 300)
    return () => clearTimeout(id)
  }, [finalDischargeQuery, finalDischargeOpen])

  useEffect(() => {
    if (!receivingDoctorsOpen) return
    const search = async () => {
      try { const results = await fetchHealthcarePractitioners(receivingDoctorsQuery); setReceivingDoctors(results) }
      catch { setReceivingDoctors([]) }
    }
    const id = setTimeout(search, receivingDoctorsQuery.trim() === '' ? 0 : 300)
    return () => clearTimeout(id)
  }, [receivingDoctorsQuery, receivingDoctorsOpen])

  useEffect(() => {
    if (!dischargeTemplateOpen) return
    const search = async () => {
      try { const results = await fetchDischargeTemplates(dischargeTemplateQuery); setDischargeTemplates(results) }
      catch { setDischargeTemplates([]) }
    }
    const id = setTimeout(search, dischargeTemplateQuery.trim() === '' ? 0 : 300)
    return () => clearTimeout(id)
  }, [dischargeTemplateQuery, dischargeTemplateOpen])

  useEffect(() => {
    if (!nurseTemplateOpen) return
    const search = async () => {
      try { const results = await fetchNursingDischargeTemplates(nurseTemplateQuery); setNurseTemplateOptions(results) }
      catch { setNurseTemplateOptions([]) }
    }
    const id = setTimeout(search, nurseTemplateQuery.trim() === '' ? 0 : 300)
    return () => clearTimeout(id)
  }, [nurseTemplateQuery, nurseTemplateOpen])

  useEffect(() => {
    if (!departmentOpenForItem) return
    const search = async () => {
      try { const results = await fetchDepartments(departmentQuery || undefined); setDepartmentOptions(results) }
      catch { setDepartmentOptions([]) }
    }
    const id = setTimeout(search, departmentQuery.trim() === '' ? 0 : 300)
    return () => clearTimeout(id)
  }, [departmentQuery, departmentOpenForItem])

  useEffect(() => {
    if (activeTab !== 'checklist' && activeTab !== 'nursing') {
      setDepartmentOpenForItem(null)
      setUserOpenForItem(null)
    }
  }, [activeTab])

  useEffect(() => {
    const loadTransferRows = async () => {
      if (activeTab !== 'transfer' || !admission?.name) {
        return
      }
      setTransferLoading(true)
      setTransferError(null)
      try {
        const rows = await getDischargeReconciliationRows(admission.name)
        setTransferRows(rows)
        setTransferSelected(new Set(rows.map((row) => row.name)))
      } catch (err) {
        setTransferError(err instanceof Error ? err.message : 'Failed to load remaining medicines')
        setTransferRows([])
        setTransferSelected(new Set())
      } finally {
        setTransferLoading(false)
      }
    }
    loadTransferRows()
  }, [activeTab, admission?.name])

  // Checklist helpers
  const toggleDept = (dept: string) => setExpandedDepts(prev => ({ ...prev, [dept]: !prev[dept] }))
  const toggleItem = (itemName: string) => setExpandedItems(prev => ({ ...prev, [itemName]: !prev[itemName] }))

  const toggleTransferSelection = (rowName: string) => {
    setTransferSelected((prev) => {
      const next = new Set(prev)
      if (next.has(rowName)) next.delete(rowName)
      else next.add(rowName)
      return next
    })
  }

  const refreshTransferRows = async () => {
    try {
      const rows = await getDischargeReconciliationRows(admission.name)
      setTransferRows(rows)
      setTransferSelected(new Set(rows.map((row) => row.name)))
    } catch {
      // ignore refresh failures
    }
  }

  const handleTransferCreated = async (result?: { patient_visit: string; patient_medication_order: string }) => {
    setTransferModalOpen(false)
    setTransferSelected(new Set())
    if (result?.patient_medication_order) {
      setTransferPrescription({
        name: result.patient_medication_order,
        patient_visit: result.patient_visit,
      })
    }
    await refreshTransferRows()
    onSuccess()
  }

  const toggleCheck = (itemName: string) => {
    setChecklistItems(prev =>
      prev.map(item =>
        item.name === itemName
          ? { ...item, click: !item.click, date_time: !item.click ? toFrappeDateTime(new Date().toISOString()) : '' }
          : item
      )
    )
  }

  const updateChecklistItem = (itemName: string, field: keyof ChecklistItem, value: string) => {
    setChecklistItems(prev =>
      prev.map(item => item.name === itemName ? { ...item, [field]: value } : item)
    )
  }

  // Nursing Checklist helpers
  const toggleNurseDept = (dept: string) => setExpandedNurseDepts(prev => ({ ...prev, [dept]: !prev[dept] }))
  const toggleNurseItem = (itemName: string) => setExpandedNurseItems(prev => ({ ...prev, [itemName]: !prev[itemName] }))

  const toggleNurseCheck = (itemName: string) => {
    setNurseChecklistItems(prev =>
      prev.map(item =>
        item.name === itemName
          ? { ...item, click: !item.click, date_time: !item.click ? toFrappeDateTime(new Date().toISOString()) : '' }
          : item
      )
    )
  }

  const updateNurseChecklistItem = (itemName: string, field: keyof ChecklistItem, value: string) => {
    setNurseChecklistItems(prev =>
      prev.map(item => item.name === itemName ? { ...item, [field]: value } : item)
    )
  }

  const groupedChecklist = groupByDepartment(checklistItems)
  const totalItems = checklistItems.length
  const completedItems = checklistItems.filter(i => i.click).length
  const allCompleted = totalItems > 0 && completedItems === totalItems

  const groupedNurseChecklist = groupByDepartment(nurseChecklistItems)
  const nurseTotalItems = nurseChecklistItems.length
  const nurseCompletedItems = nurseChecklistItems.filter(i => i.click).length
  const nurseAllCompleted = nurseTotalItems > 0 && nurseCompletedItems === nurseTotalItems

  const closeAllDropdowns = () => {
    setDischargedByOpen(false)
    setFinalDischargeOpen(false)
    setReceivingDoctorsOpen(false)
    setDischargeTemplateOpen(false)
    setNurseTemplateOpen(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setUnbilledServices(null)

    if (checklistItems.length > 0 && !allCompleted) {
      const incomplete = totalItems - completedItems
      setError(`Please complete all discharge checklist items. ${incomplete} item${incomplete > 1 ? 's' : ''} remaining.`)
      setActiveTab('checklist')
      return
    }

    try {
      setSubmitting(true)
      const patientRelatives = relatives
        .map(r => ({
          relationship_with_patient: r.relationship_with_patient?.trim() || '',
          relative_name: r.relative_name?.trim() || '',
          relative_phone_no: r.relative_phone_no?.trim() || '',
          relative_alternative_phone_no: r.relative_alternative_phone_no?.trim() || '',
          relative_alternative_phone_no_2: r.relative_alternative_phone_no_2?.trim() || '',
          cpr__id_no: r.cpr__id_no?.trim() || '',
          any_remarks: r.any_remarks?.trim() || '',
        }))
        .filter(r => r.relationship_with_patient || r.relative_name || r.cpr__id_no || r.any_remarks || r.relative_phone_no || r.relative_alternative_phone_no || r.relative_alternative_phone_no_2)

      await createDischarge(admission.name, {
        ...formData,
        discharge_checklist: checklistItems.map(item => ({
          action_required: item.action_required,
          department: item.department,
          user: item.user,
          name1: item.name1,
          date_time: item.date_time ? toFrappeDateTime(item.date_time) : '',
          click: item.click ? 1 : 0,
          description: item.description || ''
        })),
        nursing_checklist: nurseChecklistItems.map(item => ({
          action_required: item.action_required,
          user: item.user,
          name1: item.name1,
          date_time: item.date_time ? toFrappeDateTime(item.date_time) : '',
          click: item.click ? 1 : 0,
          description: item.description || ''
        })),
        patient_document: documents
          .filter(r => (r.file_name || '').trim() || (r.document || '').trim())
          .map(r => ({
            file_name: (r.file_name || '').trim() || undefined,
            document_type: (r.document_type || '').trim() || undefined,
            transaction_no: (r.transaction_no || '').trim() || undefined,
            upload_remarks: (r.upload_remarks || '').trim() || undefined,
            document: (r.document || '').trim() || undefined,
          })),
        patient_relatives: patientRelatives,
      })
      clearDischargeDraft(admission.name)
      toast.success('Patient discharged successfully!', 3000)
      onSuccess()
    } catch (err) {
      if (err instanceof UnbilledServicesError) {
        setUnbilledServices(err.services)
        setError(null)
      } else {
        const errorMessage = err instanceof Error ? err.message : 'Failed to discharge patient'
        toast.error(errorMessage, 5000)
        setError(errorMessage)
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleSaveAndClose = () => {
    saveDischargeDraft(admission.name, {
      formData,
      selectedOptions: {
        dischargedBy: selectedDischargedBy,
        finalDischarge: selectedFinalDischarge,
        receivingDoctor: selectedReceivingDoctor,
        dischargeTemplate: selectedDischargeTemplate,
        nurseTemplate: selectedNurseTemplate,
        dischargedByQuery,
        finalDischargeQuery,
        receivingDoctorsQuery,
        dischargeTemplateQuery,
        nurseTemplateQuery,
      },
      checklistItems,
      nurseChecklistItems,
      documents,
      relatives,
      transferPrescription,
    })
    toast.success('Discharge progress saved. You can continue later.', 4000)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-semibold text-slate-900">Discharge Patient</h2>
              {draftSavedAt(admission.name) && (
                <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                  <Clock className="w-3 h-3" />
                  Draft saved
                </span>
              )}
            </div>
            <p className="text-sm text-slate-500 mt-0.5">
              {admission.patient_name || admission.patient} &mdash; {admission.name}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 bg-slate-50 overflow-x-auto">
          {([
            'details',
            'checklist',
            'nursing',
            ...(canViewMedicineTransfer ? ['transfer'] as const : []),
            'reconcile',
            'documents',
            'relatives',
          ] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-3 text-sm font-medium transition-colors border-b-2 -mb-px flex items-center gap-2 whitespace-nowrap ${
                activeTab === tab
                  ? 'border-green-600 text-green-700 bg-white'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab === 'checklist'
                ? 'Discharge Checklist'
                : tab === 'nursing'
                ? 'Nursing Checklist'
                : tab === 'transfer'
                ? 'Medicine Transfer'
                : tab === 'reconcile'
                ? 'Medicine Reconciliation'
                : tab.charAt(0).toUpperCase() + tab.slice(1)}
              {tab === 'checklist' && totalItems > 0 && (
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                  allCompleted ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                }`}>
                  {completedItems}/{totalItems}
                </span>
              )}
              {tab === 'nursing' && nurseTotalItems > 0 && (
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                  nurseAllCompleted ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                }`}>
                  {nurseCompletedItems}/{nurseTotalItems}
                </span>
              )}
              {tab === 'documents' && documents.length > 0 && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-200 text-slate-600">
                  {documents.length}
                </span>
              )}
              {tab === 'relatives' && relatives.length > 0 && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-200 text-slate-600">
                  {relatives.length}
                </span>
              )}
            </button>
          ))}
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex-1 overflow-y-auto"
          onClick={(e) => {
            const target = e.target as HTMLElement
            if (!target.closest('.dropdown-container')) closeAllDropdowns()
          }}
        >
          {error && !unbilledServices && (
            <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-md flex items-start gap-2 text-red-700 text-sm">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              {error}
            </div>
          )}

          {unbilledServices && (
            <div className="mx-6 mt-4 rounded-lg border border-red-200 bg-red-50 overflow-hidden">
              <div className="flex items-start gap-3 px-4 py-3 bg-red-100/60 border-b border-red-200">
                <Receipt className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-red-800">Cannot Discharge — Unbilled Services</p>
                  <p className="text-xs text-red-600 mt-0.5">Please invoice the following services before discharging this patient.</p>
                </div>
                <button type="button" onClick={() => setUnbilledServices(null)} className="ml-auto text-red-400 hover:text-red-600">
                  <X className="w-4 h-4" />
                </button>
              </div>
              {unbilledServices.length > 0 ? (
                <div className="divide-y divide-red-100">
                  {unbilledServices.map((svc, i) => (
                    <div key={i} className="px-4 py-3 flex items-start gap-3">
                      <div className="w-2 h-2 rounded-full bg-red-400 mt-1.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-red-800">{svc.type}</p>
                        {svc.ids.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-1.5">
                            {svc.ids.map(id => (
                              <span key={id} className="inline-flex items-center px-2 py-0.5 rounded-md bg-white border border-red-200 text-xs font-mono text-red-700">{id}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="px-4 py-3 text-sm text-red-700">
                  There are unbilled healthcare services. Please review and invoice them before proceeding.
                </div>
              )}
            </div>
          )}

          {/* ── TAB: DETAILS ── */}
          {activeTab === 'details' && (
            <div className="p-6 space-y-6">
              <section>
                <h3 className="text-sm font-semibold text-slate-700 mb-3">Basic Information</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Admission</label>
                    <input type="text" value={admission.name} disabled className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-slate-50 text-slate-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Patient</label>
                    <input type="text" value={admission.patient_name || admission.patient} disabled className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-slate-50 text-slate-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Discharge Type</label>
                    <select
                      value={formData.discharge_type}
                      onChange={(e) => setFormData({ ...formData, discharge_type: e.target.value, ama_type: '' })}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      <option value="">Select Discharge Type</option>
                      <option value="Home">Home</option>
                      <option value="Refer To Another Hospital">Refer To Another Hospital</option>
                      <option value="AMA">AMA</option>
                    </select>
                  </div>
                  {formData.discharge_type === 'AMA' && (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">AMA Type</label>
                      <select
                        value={formData.ama_type}
                        onChange={(e) => setFormData({ ...formData, ama_type: e.target.value })}
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      >
                        <option value="">Select AMA Type</option>
                        <option value="Refuse Admission">Refuse Admission</option>
                        <option value="Refuse Treatment / Procedure">Refuse Treatment / Procedure</option>
                        <option value="Discharge Against Medical Advice(DAMA)">Discharge Against Medical Advice (DAMA)</option>
                      </select>
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Discharge Date</label>
                    <input type="datetime-local" value={formData.discharge_date}
                      onChange={(e) => setFormData({ ...formData, discharge_date: e.target.value })}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                  </div>
                </div>
              </section>

              <section>
                <h3 className="text-sm font-semibold text-slate-700 mb-3">Discharged By</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="relative dropdown-container">
                    <label className="block text-sm font-medium text-slate-700 mb-1">Discharged By User</label>
                    <input type="text" value={selectedDischargedBy ? selectedDischargedBy.label : dischargedByQuery}
                      onChange={(e) => {
                        setSelectedDischargedBy(null)
                        setFormData(prev => ({ ...prev, discharged_by_user: '' }))
                        setDischargedByQuery(e.target.value)
                        setDischargedByOpen(true)
                      }}
                      onFocus={() => setDischargedByOpen(true)}
                      placeholder="Search user..."
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                    {dischargedByOpen && dischargedByUsers.length > 0 && (
                      <div className="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg max-h-48 overflow-auto">
                        {dischargedByUsers.map(user => (
                          <button key={user.name} type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50"
                            onClick={() => { setSelectedDischargedBy(user); setFormData({ ...formData, discharged_by_user: user.name }); setDischargedByQuery(user.label); setDischargedByOpen(false) }}>
                            {user.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="relative dropdown-container">
                    <label className="block text-sm font-medium text-slate-700 mb-1">Final Discharge User</label>
                    <input type="text" value={selectedFinalDischarge ? selectedFinalDischarge.label : finalDischargeQuery}
                      onChange={(e) => {
                        setSelectedFinalDischarge(null)
                        setFormData(prev => ({ ...prev, final_discharge_user_id: '' }))
                        setFinalDischargeQuery(e.target.value)
                        setFinalDischargeOpen(true)
                      }}
                      onFocus={() => setFinalDischargeOpen(true)}
                      placeholder="Search user..."
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                    {finalDischargeOpen && finalDischargeUsers.length > 0 && (
                      <div className="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg max-h-48 overflow-auto">
                        {finalDischargeUsers.map(user => (
                          <button key={user.name} type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50"
                            onClick={() => { setSelectedFinalDischarge(user); setFormData({ ...formData, final_discharge_user_id: user.name }); setFinalDischargeQuery(user.label); setFinalDischargeOpen(false) }}>
                            {user.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="relative dropdown-container">
                    <label className="block text-sm font-medium text-slate-700 mb-1">Receiving Doctors</label>
                    <input type="text" value={selectedReceivingDoctor ? selectedReceivingDoctor.label : receivingDoctorsQuery}
                      onChange={(e) => {
                        setSelectedReceivingDoctor(null)
                        setFormData(prev => ({ ...prev, receiving_doctors: '' }))
                        setReceivingDoctorsQuery(e.target.value)
                        setReceivingDoctorsOpen(true)
                      }}
                      onFocus={() => setReceivingDoctorsOpen(true)}
                      placeholder="Search healthcare practitioner..."
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                    {receivingDoctorsOpen && receivingDoctors.length > 0 && (
                      <div className="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg max-h-48 overflow-auto">
                        {receivingDoctors.map(doctor => (
                          <button key={doctor.name} type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50"
                            onClick={() => { setSelectedReceivingDoctor(doctor); setFormData({ ...formData, receiving_doctors: doctor.name }); setReceivingDoctorsQuery(doctor.label); setReceivingDoctorsOpen(false) }}>
                            <div className="font-medium">{doctor.label}</div>
                            {doctor.department && <div className="text-xs text-slate-500">{doctor.department}</div>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="relative dropdown-container">
                    <label className="block text-sm font-medium text-slate-700 mb-1">Discharge Template</label>
                    <input type="text" value={selectedDischargeTemplate ? selectedDischargeTemplate.label : dischargeTemplateQuery}
                      onChange={(e) => {
                        setSelectedDischargeTemplate(null)
                        setFormData(prev => ({ ...prev, discharge_template: '' }))
                        setDischargeTemplateQuery(e.target.value)
                        setDischargeTemplateOpen(true)
                      }}
                      onFocus={() => setDischargeTemplateOpen(true)}
                      placeholder="Search discharge template..."
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                    {dischargeTemplateOpen && dischargeTemplates.length > 0 && (
                      <div className="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg max-h-48 overflow-auto">
                        {dischargeTemplates.map(template => (
                          <button key={template.name} type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50"
                            onClick={() => {
                              setSelectedDischargeTemplate(template)
                              setFormData({ ...formData, discharge_template: template.name })
                              setDischargeTemplateQuery(template.label)
                              setDischargeTemplateOpen(false)
                              loadChecklist(template.name)
                            }}>
                            {template.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="relative dropdown-container">
                    <label className="block text-sm font-medium text-slate-700 mb-1">Nursing Discharge Template</label>
                    <input type="text" value={selectedNurseTemplate ? selectedNurseTemplate.label : nurseTemplateQuery}
                      onChange={(e) => {
                        setSelectedNurseTemplate(null)
                        setFormData(prev => ({ ...prev, nurse_discharge_template: '' }))
                        setNurseTemplateQuery(e.target.value)
                        setNurseTemplateOpen(true)
                      }}
                      onFocus={() => setNurseTemplateOpen(true)}
                      placeholder="Search nursing template..."
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                    {nurseTemplateOpen && nurseTemplateOptions.length > 0 && (
                      <div className="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg max-h-48 overflow-auto">
                        {nurseTemplateOptions.map(template => (
                          <button key={template.name} type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50"
                            onClick={() => {
                              setSelectedNurseTemplate(template)
                              setFormData({ ...formData, nurse_discharge_template: template.name })
                              setNurseTemplateQuery(template.label)
                              setNurseTemplateOpen(false)
                              loadNurseChecklist(template.name)
                            }}>
                            {template.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </section>

              <section>
                <h3 className="text-sm font-semibold text-slate-700 mb-3">Final Discharge</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Final Discharge Date</label>
                    <input type="date" value={formData.final_discharge_date}
                      onChange={(e) => setFormData({ ...formData, final_discharge_date: e.target.value })}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Final Discharge Time</label>
                    <input type="time" value={formData.final_discharge_time}
                      onChange={(e) => setFormData({ ...formData, final_discharge_time: e.target.value })}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                  </div>
                </div>
              </section>

              <section>
                <h3 className="text-sm font-semibold text-slate-700 mb-3">Medical Information</h3>
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { key: 'discharge_treatment_plan', label: 'Discharge Treatment Plan' },
                    { key: 'discharge_reason', label: 'Discharge Reason' },
                    { key: 'discharge_diagnosis', label: 'Discharge Diagnosis' },
                    { key: 'discharge_conditions', label: 'Discharge Conditions' },
                    { key: 'discharge_instructions', label: 'Discharge Instructions' },
                    { key: 'discharge_medic_stopped_reason', label: 'Discharge Medic Stopped Reason' },
                    { key: 'final_exam_mental_status_summary', label: 'Final Exam Mental Status Summary' },
                    { key: 'management_in_hospital', label: 'Management In Hospital' },
                    { key: 'prognosis', label: 'Prognosis' },
                  ].map(({ key, label }) => (
                    <div key={key}>
                      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
                      <textarea rows={3}
                        value={formData[key as keyof typeof formData]}
                        onChange={(e) => setFormData({ ...formData, [key]: e.target.value })}
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <h3 className="text-sm font-semibold text-slate-700 mb-3">Next Appointment</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Next Appointment Date</label>
                    <input type="date" value={formData.next_appointment_date}
                      onChange={(e) => setFormData({ ...formData, next_appointment_date: e.target.value })}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Next Appointment Time</label>
                    <input type="datetime-local" value={formData.next_appointment_time}
                      onChange={(e) => setFormData({ ...formData, next_appointment_time: e.target.value })}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                  </div>
                </div>
              </section>
            </div>
          )}

          {/* ── TAB: CHECKLIST ── */}
          {activeTab === 'checklist' && (
            <div className="p-6">
              {totalItems > 0 && (
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-slate-700">Checklist Progress</span>
                    <span className={`text-sm font-semibold ${allCompleted ? 'text-green-600' : 'text-amber-600'}`}>
                      {completedItems} of {totalItems} completed
                    </span>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all duration-300 ${allCompleted ? 'bg-green-500' : 'bg-amber-500'}`}
                      style={{ width: `${totalItems ? (completedItems / totalItems) * 100 : 0}%` }}
                    />
                  </div>
                  {allCompleted && (
                    <p className="text-xs text-green-600 mt-1.5 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      All items completed — patient is ready for discharge
                    </p>
                  )}
                </div>
              )}

              {checklistLoading ? (
                <div className="flex items-center justify-center py-16 text-slate-400 text-sm">Loading checklist...</div>
              ) : checklistItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                  <Circle className="w-10 h-10 mb-3 opacity-30" />
                  <p className="text-sm">No checklist items found for the selected template.</p>
                </div>
              ) : (
                <>
                <div className="space-y-4">
                  {Object.entries(groupedChecklist).map(([dept, items]) => {
                    const deptCompleted = items.filter(i => i.click).length
                    const deptTotal = items.length
                    const isDeptDone = deptCompleted === deptTotal
                    const isOpen = expandedDepts[dept] !== false
                    return (
                      <div key={dept} className="border border-slate-200 rounded-lg overflow-hidden">
                        <button type="button" onClick={() => toggleDept(dept)}
                          className={`w-full flex items-center justify-between px-4 py-3 text-left transition-colors ${isDeptDone ? 'bg-green-50' : 'bg-slate-50'} hover:bg-slate-100`}>
                          <div className="flex items-center gap-3">
                            {isDeptDone ? <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" /> : <Circle className="w-5 h-5 text-slate-400 shrink-0" />}
                            <div>
                              <span className="text-sm font-semibold text-slate-800">{dept}</span>
                              <span className="ml-2 text-xs text-slate-500">({deptCompleted}/{deptTotal})</span>
                            </div>
                          </div>
                          {isOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                        </button>
                        {isOpen && (
                          <div className="divide-y divide-slate-100">
                            {items.map((item) => {
                              const isItemExpanded = expandedItems[item.name]
                              return (
                                <div key={item.name} className={`transition-colors ${item.click ? 'bg-green-50/40' : 'bg-white'}`}>
                                  <div className="px-4 py-3">
                                    <div className="flex items-start gap-3">
                                      <button type="button" onClick={() => toggleCheck(item.name)} className="mt-0.5 shrink-0 focus:outline-none">
                                        {item.click ? <CheckCircle2 className="w-5 h-5 text-green-500" /> : <Circle className="w-5 h-5 text-slate-300 hover:text-slate-400" />}
                                      </button>
                                      <div className="flex-1 min-w-0">
                                        <p className={`text-sm font-medium ${item.click ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                                          {item.action_required}
                                        </p>
                                        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
                                          {item.name1 && <span className="text-xs text-slate-500"><span className="font-medium">Contact:</span> {item.name1}</span>}
                                          {item.click && item.date_time && (
                                            <span className="text-xs text-green-600">✓ Completed {new Date(item.date_time).toLocaleString()}</span>
                                          )}
                                        </div>
                                        {item.click && (
                                          <div className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-3">
                                            <div>
                                              <label className="block text-xs font-medium text-slate-600 mb-1">User</label>
                                              <input
                                                type="text"
                                                ref={userOpenForItem === item.name ? userTriggerRef : undefined}
                                                value={userOpenForItem === item.name ? userQuery : (dischargedByUsers.find(u => u.name === item.user)?.label || item.user || '')}
                                                onChange={(e) => {
                                                  updateChecklistItem(item.name, 'user', '')
                                                  setUserQuery(e.target.value)
                                                  setUserOpenForItem(item.name)
                                                }}
                                                onFocus={() => { setUserOpenForItem(item.name); setUserQuery(dischargedByUsers.find(u => u.name === item.user)?.label || item.user || '') }}
                                                placeholder="Search user..."
                                                className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-green-400"
                                              />
                                            </div>
                                            <div>
                                              <label className="block text-xs font-medium text-slate-600 mb-1">Date &amp; Time</label>
                                              <input type="datetime-local" value={item.date_time ? item.date_time.slice(0, 16) : ''}
                                                onChange={(e) => updateChecklistItem(item.name, 'date_time', toFrappeDateTime(e.target.value))}
                                                className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-green-400" />
                                            </div>
                                            <div>
                                              <label className="block text-xs font-medium text-slate-600 mb-1">Department</label>
                                              <input
                                                type="text"
                                                ref={departmentOpenForItem === item.name ? departmentTriggerRef : undefined}
                                                value={item.department ? departmentOptions.find(d => d.name === item.department)?.label || item.department : (departmentOpenForItem === item.name ? departmentQuery : '')}
                                                onChange={(e) => {
                                                  updateChecklistItem(item.name, 'department', '')
                                                  setDepartmentQuery(e.target.value)
                                                  setDepartmentOpenForItem(item.name)
                                                }}
                                                onFocus={() => { setDepartmentOpenForItem(item.name); setDepartmentQuery(item.department ? departmentOptions.find(d => d.name === item.department)?.label || item.department : '') }}
                                                placeholder="Select Department..."
                                                className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-green-400"
                                              />
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                      {item.description && (
                                        <button type="button" onClick={() => toggleItem(item.name)} className="shrink-0 text-xs text-slate-400 hover:text-slate-600 mt-0.5">
                                          {isItemExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                        </button>
                                      )}
                                    </div>
                                    {isItemExpanded && item.description && (
                                      <div className="mt-3 ml-8 p-3 bg-slate-50 rounded text-xs text-slate-600 border border-slate-100"
                                        dangerouslySetInnerHTML={{ __html: item.description }} />
                                    )}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                {departmentOpenForItem && (
                  <PortalActionsMenu
                    open={!!departmentOpenForItem}
                    onClose={() => setDepartmentOpenForItem(null)}
                    triggerRef={departmentTriggerRef}
                    minWidth={160}
                    maxWidth={280}
                    maxHeight={280}
                  >
                    {departmentOptions.map((dept) => (
                      <button
                        key={dept.name}
                        type="button"
                        className="w-full text-left px-3 py-2 text-sm hover:bg-green-50"
                        onClick={() => {
                          if (departmentOpenForItem) {
                            updateChecklistItem(departmentOpenForItem, 'department', dept.name)
                            setDepartmentQuery(dept.label)
                            setDepartmentOpenForItem(null)
                          }
                        }}
                      >
                        {dept.label}
                      </button>
                    ))}
                  </PortalActionsMenu>
                )}

                {userOpenForItem && (
                  <PortalActionsMenu
                    open={!!userOpenForItem}
                    onClose={() => setUserOpenForItem(null)}
                    triggerRef={userTriggerRef}
                    minWidth={160}
                    maxWidth={280}
                    maxHeight={280}
                  >
                    {dischargedByUsers
                      .filter((u) => !userQuery.trim() || (u.label || u.name || '').toLowerCase().includes(userQuery.toLowerCase()))
                      .slice(0, 30)
                      .map((user) => (
                        <button
                          key={user.name}
                          type="button"
                          className="w-full text-left px-3 py-2 text-sm hover:bg-green-50"
                          onClick={() => {
                            if (userOpenForItem) {
                              updateChecklistItem(userOpenForItem, 'user', user.name)
                              setUserOpenForItem(null)
                            }
                          }}
                        >
                          {user.label}
                        </button>
                      ))}
                  </PortalActionsMenu>
                )}
                </>
              )}
            </div>
          )}

          {/* ── TAB: NURSING CHECKLIST ── */}
          {activeTab === 'nursing' && (
            <div className="p-6">
              {nurseTotalItems > 0 && (
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-slate-700">Nursing Checklist Progress</span>
                    <span className={`text-sm font-semibold ${nurseAllCompleted ? 'text-green-600' : 'text-amber-600'}`}>
                      {nurseCompletedItems} of {nurseTotalItems} completed
                    </span>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all duration-300 ${nurseAllCompleted ? 'bg-green-500' : 'bg-amber-500'}`}
                      style={{ width: `${nurseTotalItems ? (nurseCompletedItems / nurseTotalItems) * 100 : 0}%` }}
                    />
                  </div>
                  {nurseAllCompleted && (
                    <p className="text-xs text-green-600 mt-1.5 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      All nursing items completed
                    </p>
                  )}
                </div>
              )}

              {nurseChecklistLoading ? (
                <div className="flex items-center justify-center py-16 text-slate-400 text-sm">Loading nursing checklist...</div>
              ) : nurseChecklistItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                  <Circle className="w-10 h-10 mb-3 opacity-30" />
                  <p className="text-sm">No nursing checklist items found. Please select a nursing template.</p>
                  {!selectedNurseTemplate && (
                    <button
                      type="button"
                      onClick={() => setActiveTab('details')}
                      className="mt-4 text-sm text-primary hover:underline"
                    >
                      Go to Details tab to select a nursing template
                    </button>
                  )}
                </div>
              ) : (
                <>
                <div className="space-y-4">
                  {Object.entries(groupedNurseChecklist).map(([dept, items]) => {
                    const deptCompleted = items.filter(i => i.click).length
                    const deptTotal = items.length
                    const isDeptDone = deptCompleted === deptTotal
                    const isOpen = expandedNurseDepts[dept] !== false
                    return (
                      <div key={dept} className="border border-slate-200 rounded-lg overflow-hidden">
                        <button type="button" onClick={() => toggleNurseDept(dept)}
                          className={`w-full flex items-center justify-between px-4 py-3 text-left transition-colors ${isDeptDone ? 'bg-green-50' : 'bg-slate-50'} hover:bg-slate-100`}>
                          <div className="flex items-center gap-3">
                            {isDeptDone ? <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" /> : <Circle className="w-5 h-5 text-slate-400 shrink-0" />}
                            <div>
                              <span className="text-sm font-semibold text-slate-800">{dept}</span>
                              <span className="ml-2 text-xs text-slate-500">({deptCompleted}/{deptTotal})</span>
                            </div>
                          </div>
                          {isOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                        </button>
                        {isOpen && (
                          <div className="divide-y divide-slate-100">
                            {items.map((item) => {
                              const isItemExpanded = expandedNurseItems[item.name]
                              return (
                                <div key={item.name} className={`transition-colors ${item.click ? 'bg-green-50/40' : 'bg-white'}`}>
                                  <div className="px-4 py-3">
                                    <div className="flex items-start gap-3">
                                      <button type="button" onClick={() => toggleNurseCheck(item.name)} className="mt-0.5 shrink-0 focus:outline-none">
                                        {item.click ? <CheckCircle2 className="w-5 h-5 text-green-500" /> : <Circle className="w-5 h-5 text-slate-300 hover:text-slate-400" />}
                                      </button>
                                      <div className="flex-1 min-w-0">
                                        <p className={`text-sm font-medium ${item.click ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                                          {item.action_required}
                                        </p>
                                        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
                                          {item.name1 && <span className="text-xs text-slate-500"><span className="font-medium">Contact:</span> {item.name1}</span>}
                                          {item.click && item.date_time && (
                                            <span className="text-xs text-green-600">✓ Completed {new Date(item.date_time).toLocaleString()}</span>
                                          )}
                                        </div>
                                        {item.click && (
                                          <div className="mt-3 grid grid-cols-2 gap-3">
                                            <div>
                                              <label className="block text-xs font-medium text-slate-600 mb-1">User</label>
                                              <input
                                                type="text"
                                                ref={userOpenForItem === `nurse_${item.name}` ? userTriggerRef : undefined}
                                                value={userOpenForItem === `nurse_${item.name}` ? userQuery : (dischargedByUsers.find(u => u.name === item.user)?.label || item.user || '')}
                                                onChange={(e) => {
                                                  updateNurseChecklistItem(item.name, 'user', '')
                                                  setUserQuery(e.target.value)
                                                  setUserOpenForItem(`nurse_${item.name}`)
                                                }}
                                                onFocus={() => { setUserOpenForItem(`nurse_${item.name}`); setUserQuery(dischargedByUsers.find(u => u.name === item.user)?.label || item.user || '') }}
                                                placeholder="Search user..."
                                                className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-green-400"
                                              />
                                            </div>
                                            <div>
                                              <label className="block text-xs font-medium text-slate-600 mb-1">Date &amp; Time</label>
                                              <input type="datetime-local" value={item.date_time ? item.date_time.slice(0, 16) : ''}
                                                onChange={(e) => updateNurseChecklistItem(item.name, 'date_time', toFrappeDateTime(e.target.value))}
                                                className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-green-400" />
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                      {item.description && (
                                        <button type="button" onClick={() => toggleNurseItem(item.name)} className="shrink-0 text-xs text-slate-400 hover:text-slate-600 mt-0.5">
                                          {isItemExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                        </button>
                                      )}
                                    </div>
                                    {isItemExpanded && item.description && (
                                      <div className="mt-3 ml-8 p-3 bg-slate-50 rounded text-xs text-slate-600 border border-slate-100"
                                        dangerouslySetInnerHTML={{ __html: item.description }} />
                                    )}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                {userOpenForItem && userOpenForItem.startsWith('nurse_') && (
                  <PortalActionsMenu
                    open={!!userOpenForItem}
                    onClose={() => setUserOpenForItem(null)}
                    triggerRef={userTriggerRef}
                    minWidth={160}
                    maxWidth={280}
                    maxHeight={280}
                  >
                    {dischargedByUsers
                      .filter((u) => !userQuery.trim() || (u.label || u.name || '').toLowerCase().includes(userQuery.toLowerCase()))
                      .slice(0, 30)
                      .map((user) => (
                        <button
                          key={user.name}
                          type="button"
                          className="w-full text-left px-3 py-2 text-sm hover:bg-green-50"
                          onClick={() => {
                            if (userOpenForItem) {
                              const itemName = userOpenForItem.replace('nurse_', '')
                              updateNurseChecklistItem(itemName, 'user', user.name)
                              setUserOpenForItem(null)
                            }
                          }}
                        >
                          {user.label}
                        </button>
                      ))}
                  </PortalActionsMenu>
                )}
                </>
              )}
            </div>
          )}

          {/* ── TAB: MEDICINE RECONCILIATION ── */}
          {activeTab === 'reconcile' && (
            <div className="p-6 space-y-6">
              <h3 className="text-sm font-semibold text-slate-700 mb-1">Medicine Reconciliation</h3>
              <p className="text-xs text-slate-600 mb-2">
                Review medicines given during this admission and reconcile remaining doses (return to store or transfer to follow-up).
              </p>
              <div className="space-y-4">
                <div>
                  <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">Medicines given</h4>
                  <MedicineGivenList patient={admission.patient} />
                </div>
                <div>
                  <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">Medicines not given (remaining)</h4>
                  <MedicineReconciliationList
                    admission={admission.name}
                    onRefresh={() => {}}
                  />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'transfer' && (
            <div className="p-6 space-y-6">
              <h3 className="text-sm font-semibold text-slate-700 mb-1">Medicine Transfer</h3>
              <p className="text-xs text-slate-600 mb-2">
                Transfer remaining discharge medicines into a follow-up prescription. This creates a Patient Visit and a new prescription for the patient to continue at home.
              </p>

              {transferError && (
                <div className="bg-red-50 border border-red-200 rounded-md px-3 py-2 text-sm text-red-700">
                  {transferError}
                </div>
              )}

              {transferLoading ? (
                <div className="text-sm text-slate-600">Loading remaining discharge medicines…</div>
              ) : transferRows.length === 0 ? (
                <div className="text-sm text-slate-500">No remaining discharge medicines are available for transfer.</div>
              ) : (
                <div className="space-y-4">
                  {transferPrescription && (
                    <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                      Transfer prescription created: <strong>{transferPrescription.name}</strong>
                      {transferPrescription.patient_visit ? ` for visit ${transferPrescription.patient_visit}` : ''}.
                    </div>
                  )}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="text-sm text-slate-600">
                      Select which remaining medicines to transfer into the follow-up prescription.
                    </div>
                    <button
                      type="button"
                      onClick={() => setTransferModalOpen(true)}
                      disabled={!!transferPrescription || transferSelected.size === 0}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded bg-primary text-white hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {transferPrescription ? 'Transfer completed' : `Transfer medicine (${transferSelected.size})`}
                    </button>
                  </div>

                  <div className="bg-white border border-slate-200 rounded-lg overflow-auto max-h-[340px]">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="px-3 py-2 text-left w-10"></th>
                          <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-600">Drug</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-600">Remaining</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {transferRows.map((row) => (
                          <tr key={row.name} className="hover:bg-slate-50">
                            <td className="px-3 py-2">
                              <button
                                type="button"
                                onClick={() => toggleTransferSelection(row.name)}
                                className="text-slate-500 hover:text-slate-700"
                              >
                                {transferSelected.has(row.name) ? '✓' : '○'}
                              </button>
                            </td>
                            <td className="px-3 py-2 text-slate-800">{row.drug_name || row.drug}</td>
                            <td className="px-3 py-2 text-slate-700">{row.remaining}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── TAB: DOCUMENTS ── */}
          {activeTab === 'documents' && (
            <div className="p-6">
              <p className="text-sm text-slate-500 mb-4">
                Attach discharge documents or capture digital signatures. You can upload a photo of a signed document <em>or</em> draw a signature directly on-screen.
              </p>
              <div className="space-y-4">
                {documents.length === 0 && (
                  <div className="text-center py-10 rounded-lg border-2 border-dashed border-slate-200 text-slate-400 text-sm">
                    No documents added yet. Click below to add one.
                  </div>
                )}

                {documents.map((row, idx) => (
                  <div key={idx} className="rounded-lg border border-slate-200 bg-slate-50/50 overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200 bg-white">
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                        Document #{idx + 1}
                      </span>
                      <button type="button" onClick={() => removeDocumentRow(idx)}
                        className="p-1 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors" title="Remove row">
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] divide-y lg:divide-y-0 lg:divide-x divide-slate-200">

                      <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-0.5">File Name</label>
                          <input value={row.file_name} onChange={(e) => updateDocumentRow(idx, 'file_name', e.target.value)}
                            placeholder="File name"
                            className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-0.5">Document Type</label>
                          <select value={row.document_type || ''} onChange={(e) => updateDocumentRow(idx, 'document_type', e.target.value)}
                            className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary">
                            <option value="">Select type</option>
                            {documentTypes.map((dt) => (
                              <option key={dt.name} value={dt.name}>{dt.document_name || dt.name}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-0.5">Transaction No</label>
                          <input value={row.transaction_no || ''} onChange={(e) => updateDocumentRow(idx, 'transaction_no', e.target.value)}
                            placeholder="Transaction number"
                            className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-0.5">Upload Remarks</label>
                          <input value={row.upload_remarks || ''} onChange={(e) => updateDocumentRow(idx, 'upload_remarks', e.target.value)}
                            placeholder="Remarks"
                            className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                        </div>

                        <div className="sm:col-span-2">
                          <label className="block text-xs font-medium text-slate-600 mb-0.5">
                            File Attachment
                            <span className="ml-1 font-normal text-slate-400">(photo of signed doc, PDF, etc.)</span>
                          </label>
                          <input type="file" disabled={documentUploading === idx}
                            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleDocumentFile(idx, f); e.target.value = '' }}
                            className="w-full text-sm file:mr-2 file:rounded file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-white file:text-sm" />
                          {documentUploading === idx && (
                            <span className="text-xs text-slate-500 mt-0.5 block">Uploading...</span>
                          )}
                          {row.document && documentUploading !== idx && signatureUploading !== idx && (
                            <span className="text-xs text-green-600 mt-0.5 block truncate" title={row.document}>
                              ✓ File attached
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="p-4 flex flex-col gap-2">
                        <div className="flex items-center gap-1.5 mb-1">
                          <PenLine className="w-3.5 h-3.5 text-slate-400" />
                          <span className="text-xs font-medium text-slate-600">Digital Signature</span>
                          <span className="text-xs text-slate-400 ml-1">— draw &amp; save as file</span>
                        </div>
                        <div className="flex-1">
                          <SignaturePad
                            onSave={(file) => handleSignatureFile(idx, file)}
                            onClear={() => {}}
                            existingUrl={row.document?.endsWith('.png') || row.document?.includes('signature_') ? row.document : undefined}
                            uploading={signatureUploading === idx}
                          />
                        </div>
                        {signatureUploading === idx && (
                          <p className="text-xs text-slate-500 text-center">Uploading signature...</p>
                        )}
                        <p className="text-xs text-slate-400 leading-relaxed">
                          Draw your signature above, then tap <strong>Save Signature</strong> — it will be stored as a PNG file attached to this document row.
                        </p>
                      </div>
                    </div>
                  </div>
                ))}

                <button type="button" onClick={addDocumentRow}
                  className="flex items-center gap-1.5 text-sm text-primary font-medium hover:underline">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add document
                </button>
              </div>
            </div>
          )}

          {/* ── TAB: RELATIVES ── */}
          {activeTab === 'relatives' && (
            <div className="p-6">
              <p className="text-sm text-slate-500 mb-4">
                Add relatives / guardians who are relevant for this discharge record.
              </p>
              <div className="border border-slate-200 rounded-md">
                <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 bg-slate-50">
                  <h3 className="text-sm font-semibold text-slate-800">Relatives / Guardians</h3>
                  <button
                    type="button"
                    className="text-xs px-2 py-1 rounded-full bg-primary text-white hover:bg-primary/90"
                    onClick={() =>
                      setRelatives(prev => [
                        ...prev,
                        { relationship_with_patient: '', relative_name: '', cpr__id_no: '', any_remarks: '', relative_phone_no: '', relative_alternative_phone_no: '', relative_alternative_phone_no_2: '' },
                      ])
                    }
                  >
                    + Add Relative
                  </button>
                </div>
                <div className="divide-y divide-slate-200">
                  {relatives.map((row, idx) => (
                    <div key={idx} className="px-3 py-3 space-y-2">
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">
                            Relation
                          </label>
                          <select
                            value={row.relationship_with_patient}
                            onChange={(e) => {
                              const value = e.target.value
                              setRelatives(prev => prev.map((r, i) =>
                                i === idx ? { ...r, relationship_with_patient: value } : r
                              ))
                            }}
                            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-primary"
                          >
                            <option value="">Select relation</option>
                            {RELATION_OPTIONS.map(opt => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">
                            Name
                          </label>
                          <input
                            type="text"
                            value={row.relative_name}
                            onChange={(e) => {
                              const value = e.target.value
                              setRelatives(prev => prev.map((r, i) =>
                                i === idx ? { ...r, relative_name: value } : r
                              ))
                            }}
                            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                            placeholder="Relative full name"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">
                            ID Number
                          </label>
                          <input
                            type="text"
                            value={row.cpr__id_no}
                            onChange={(e) => {
                              const value = e.target.value
                              setRelatives(prev => prev.map((r, i) =>
                                i === idx ? { ...r, cpr__id_no: value } : r
                              ))
                            }}
                            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                            placeholder="CPR / ID"
                          />
                        </div>
                      </div>

                       <div className="grid grid-cols-3 gap-3">
                         <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">
                            Phone No
                          </label>
                          <input
                            type="text"
                            value={row.relative_phone_no}
                            onChange={(e) => {
                              const value = e.target.value
                              setRelatives(prev => prev.map((r, i) =>
                                i === idx ? { ...r, relative_phone_no: value } : r
                              ))
                            }}
                            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                            placeholder="Phone NO"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">
                            Alternative Phone No
                          </label>
                          <input
                            type="text"
                            value={row.relative_alternative_phone_no}
                            onChange={(e) => {
                              const value = e.target.value
                              setRelatives(prev => prev.map((r, i) =>
                                i === idx ? { ...r, relative_alternative_phone_no: value } : r
                              ))
                            }}
                            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                            placeholder="Alternative Phone"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">
                            Alternative Phone No 2
                          </label>
                          <input
                            type="text"
                            value={row.relative_alternative_phone_no_2}
                            onChange={(e) => {
                              const value = e.target.value
                              setRelatives(prev => prev.map((r, i) =>
                                i === idx ? { ...r, relative_alternative_phone_no_2: value } : r
                              ))
                            }}
                            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                            placeholder="Alternative Phone 2"
                          />
                        </div>
                      </div>

                      <div className="flex items-start gap-2">
                        <div className="flex-1">
                          <label className="block text-xs font-medium text-slate-700 mb-1">
                            Remarks
                          </label>
                          <textarea
                            value={row.any_remarks}
                            onChange={(e) => {
                              const value = e.target.value
                              setRelatives(prev => prev.map((r, i) =>
                                i === idx ? { ...r, any_remarks: value } : r
                              ))
                            }}
                            rows={2}
                            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                            placeholder="Any notes about this relative / guardian"
                          />
                        </div>
                        {relatives.length > 1 && (
                          <button
                            type="button"
                            className="mt-5 text-xs text-red-600 hover:text-red-700"
                            onClick={() =>
                              setRelatives(prev => prev.filter((_, i) => i !== idx))
                            }
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between bg-slate-50">
            <div className="text-xs text-slate-500">
              {totalItems > 0 && !allCompleted && (
                <span className="flex items-center gap-1 text-amber-600">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {totalItems - completedItems} checklist item{totalItems - completedItems !== 1 ? 's' : ''} remaining
                </span>
              )}
              {allCompleted && totalItems > 0 && (
                <span className="flex items-center gap-1 text-green-600">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Checklist complete
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveAndClose}
                disabled={submitting}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-amber-800 bg-amber-50 border border-amber-300 rounded-md hover:bg-amber-100 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Save progress and close. You can continue this discharge later."
              >
                <Save className="w-4 h-4" />
                Save &amp; Close
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? 'Discharging...' : 'Discharge Patient'}
              </button>
            </div>
          </div>
        </form>
        {transferModalOpen && (
          <CreatePrescriptionModal
            onClose={() => setTransferModalOpen(false)}
            onSuccess={handleTransferCreated}
            initialPatient={admission.patient}
            initialCareContext="Patient Visit"
            initialMedications={transferRows
              .filter((row) => transferSelected.has(row.name))
              .map((row) => ({
                drug: row.drug,
                drug_name: row.drug_name,
                dosage: '',
                no_of_days: 1,
                dosage_form: '',
                instructions: '',
                date: new Date().toISOString().split('T')[0],
                end_date: addDaysToIsoDate(new Date().toISOString().split('T')[0], 1),
                time: '08:00:00',
                patient_frequency: '',
                is_pink: false,
                is_prn: false,
                reference_no: '',
                route_of_administration: '',
                is_long_acting: false,
                long_acting_frequency: 'Weekly',
                medication_type: '',
              }))}
            transferAdmission={admission.name}
          />
        )}
      </div>
    </div>
  )
}
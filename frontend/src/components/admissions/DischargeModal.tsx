import { useState, useEffect, useRef, useCallback } from 'react'
import { createDischarge, UnbilledServicesError } from '../../services/inpatientRecords'
import { uploadPatientFile, type PatientDocumentRow } from '../../services/patients'
import { MedicineGivenList } from '../medication/MedicineGivenList'
import { fetchHealthcarePractitioners, fetchUsers, fetchDischargeTemplates, fetchDischargeChecklist, fetchDepartments, fetchDocumentTypes, type LinkFieldOption } from '../../services/common'
import { toast } from '../../hooks/useToast'
import { X, CheckCircle2, Circle, ChevronDown, ChevronUp, AlertCircle, Receipt, PenLine, Trash2, Check } from 'lucide-react'

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

  // Initialise canvas context
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

  // When switching into drawing mode, set canvas size
  useEffect(() => {
    if (mode !== 'drawing') return
    const canvas = canvasRef.current
    if (!canvas) return
    // Set internal resolution to match display size
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
      {/* Canvas header */}
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

      {/* Drawing surface */}
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

      {/* Save button */}
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

// Group checklist items by department
const groupByDepartment = (items: ChecklistItem[]) => {
  return items.reduce((acc, item) => {
    const dept = item.department_label || item.department || 'General'
    if (!acc[dept]) acc[dept] = []
    acc[dept].push(item)
    return acc
  }, {} as Record<string, ChecklistItem[]>)
}

// ─── Main Modal ─────────────────────────────────────────────────────────────

export const DischargeModal = ({ admission, onClose, onSuccess }: DischargeModalProps) => {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [unbilledServices, setUnbilledServices] = useState<{ type: string; ids: string[] }[] | null>(null)
  const [activeTab, setActiveTab] = useState<'details' | 'checklist' | 'documents' | 'reconcile'>('details')

  // Checklist state
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([])
  const [checklistLoading, setChecklistLoading] = useState(false)
  const [expandedDepts, setExpandedDepts] = useState<Record<string, boolean>>({})
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({})

  // Documents state
  const [documents, setDocuments] = useState<PatientDocumentRow[]>([])
  const [documentTypes, setDocumentTypes] = useState<{ name: string; document_name?: string }[]>([])
  const [documentUploading, setDocumentUploading] = useState<number | null>(null)
  // Track per-row signature upload state separately
  const [signatureUploading, setSignatureUploading] = useState<number | null>(null)

  // Link field dropdowns
  const [dischargedByUsers, setDischargedByUsers] = useState<LinkFieldOption[]>([])
  const [finalDischargeUsers, setFinalDischargeUsers] = useState<LinkFieldOption[]>([])
  const [receivingDoctors, setReceivingDoctors] = useState<LinkFieldOption[]>([])
  const [dischargeTemplates, setDischargeTemplates] = useState<LinkFieldOption[]>([])

  const [dischargedByOpen, setDischargedByOpen] = useState(false)
  const [finalDischargeOpen, setFinalDischargeOpen] = useState(false)
  const [receivingDoctorsOpen, setReceivingDoctorsOpen] = useState(false)
  const [dischargeTemplateOpen, setDischargeTemplateOpen] = useState(false)

  const [dischargedByQuery, setDischargedByQuery] = useState('')
  const [finalDischargeQuery, setFinalDischargeQuery] = useState('')
  const [receivingDoctorsQuery, setReceivingDoctorsQuery] = useState('')
  const [dischargeTemplateQuery, setDischargeTemplateQuery] = useState('')

  const [selectedDischargedBy, setSelectedDischargedBy] = useState<LinkFieldOption | null>(null)
  const [selectedFinalDischarge, setSelectedFinalDischarge] = useState<LinkFieldOption | null>(null)
  const [selectedReceivingDoctor, setSelectedReceivingDoctor] = useState<LinkFieldOption | null>(null)
  const [selectedDischargeTemplate, setSelectedDischargeTemplate] = useState<LinkFieldOption | null>(null)

  // Department dropdown for checklist
  const [departmentOptions, setDepartmentOptions] = useState<LinkFieldOption[]>([])
  const [departmentQuery, setDepartmentQuery] = useState('')
  const [departmentOpenForItem, setDepartmentOpenForItem] = useState<string | null>(null)

  // Normalize datetime to Frappe/MySQL format
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
    discharge_date: new Date().toISOString().slice(0, 16),
    discharge_time: new Date().toISOString().slice(0, 10),
    final_discharge_date: new Date().toISOString().slice(0, 10),
    final_discharge_time: new Date().toTimeString().slice(0, 5),
    discharged_by_user: '',
    final_discharge_user_id: '',
    receiving_doctors: '',
    discharge_template: '',
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
        const [users, doctors, templates, docTypes] = await Promise.all([
          fetchUsers(),
          fetchHealthcarePractitioners(),
          fetchDischargeTemplates(),
          fetchDocumentTypes(),
        ])
        setDischargedByUsers(users)
        setFinalDischargeUsers(users)
        setReceivingDoctors(doctors)
        setDischargeTemplates(templates)
        setDocumentTypes(docTypes)

        await loadChecklist('Inpatient Discharge')
        const defaultTemplate = templates.find(t => t.label === 'Inpatient Discharge' || t.name === 'Inpatient Discharge')
        if (defaultTemplate) {
          setSelectedDischargeTemplate(defaultTemplate)
          setFormData(prev => ({ ...prev, discharge_template: defaultTemplate.name }))
          setDischargeTemplateQuery(defaultTemplate.label)
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

  // ── Document helpers ─────────────────────────────────────────────────────

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

  // Upload signature canvas blob as a file
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

  // ── Search effects ───────────────────────────────────────────────────────

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
    if (!departmentOpenForItem) return
    const search = async () => {
      try { const results = await fetchDepartments(departmentQuery || undefined); setDepartmentOptions(results) }
      catch { setDepartmentOptions([]) }
    }
    const id = setTimeout(search, departmentQuery.trim() === '' ? 0 : 300)
    return () => clearTimeout(id)
  }, [departmentQuery, departmentOpenForItem])

  // ── Checklist helpers ────────────────────────────────────────────────────

  const toggleDept = (dept: string) => setExpandedDepts(prev => ({ ...prev, [dept]: !prev[dept] }))
  const toggleItem = (itemName: string) => setExpandedItems(prev => ({ ...prev, [itemName]: !prev[itemName] }))

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

  const groupedChecklist = groupByDepartment(checklistItems)
  const totalItems = checklistItems.length
  const completedItems = checklistItems.filter(i => i.click).length
  const allCompleted = totalItems > 0 && completedItems === totalItems

  // ── Submit ───────────────────────────────────────────────────────────────

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
        patient_document: documents
          .filter(r => (r.file_name || '').trim() || (r.document || '').trim())
          .map(r => ({
            file_name: (r.file_name || '').trim() || undefined,
            document_type: (r.document_type || '').trim() || undefined,
            transaction_no: (r.transaction_no || '').trim() || undefined,
            upload_remarks: (r.upload_remarks || '').trim() || undefined,
            document: (r.document || '').trim() || undefined,
          })),
      })
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

  const closeAllDropdowns = () => {
    setDischargedByOpen(false)
    setFinalDischargeOpen(false)
    setReceivingDoctorsOpen(false)
    setDischargeTemplateOpen(false)
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Discharge Patient</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              {admission.patient_name || admission.patient} &mdash; {admission.name}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 bg-slate-50">
          {(['details', 'checklist', 'reconcile', 'documents'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-3 text-sm font-medium transition-colors border-b-2 -mb-px flex items-center gap-2 capitalize ${
                activeTab === tab
                  ? 'border-green-600 text-green-700 bg-white'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab === 'checklist'
                ? 'Discharge Checklist'
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
              {tab === 'documents' && documents.length > 0 && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-200 text-slate-600">
                  {documents.length}
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
          {/* Generic error */}
          {error && !unbilledServices && (
            <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-md flex items-start gap-2 text-red-700 text-sm">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              {error}
            </div>
          )}

          {/* Unbilled services error */}
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
                    <select value={formData.discharge_type} onChange={(e) => setFormData({ ...formData, discharge_type: e.target.value })}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                      <option value="">Select Discharge Type</option>
                      <option value="Home">Home</option>
                      <option value="Dama">Dama</option>
                      <option value="Hospital">Hospital</option>
                    </select>
                  </div>
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
                  {/* Discharged By User */}
                  <div className="relative dropdown-container">
                    <label className="block text-sm font-medium text-slate-700 mb-1">Discharged By User</label>
                    <input type="text" value={selectedDischargedBy ? selectedDischargedBy.label : dischargedByQuery}
                      onChange={(e) => { setDischargedByQuery(e.target.value); setDischargedByOpen(true) }}
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

                  {/* Final Discharge User */}
                  <div className="relative dropdown-container">
                    <label className="block text-sm font-medium text-slate-700 mb-1">Final Discharge User</label>
                    <input type="text" value={selectedFinalDischarge ? selectedFinalDischarge.label : finalDischargeQuery}
                      onChange={(e) => { setFinalDischargeQuery(e.target.value); setFinalDischargeOpen(true) }}
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

                  {/* Receiving Doctors */}
                  <div className="relative dropdown-container">
                    <label className="block text-sm font-medium text-slate-700 mb-1">Receiving Doctors</label>
                    <input type="text" value={selectedReceivingDoctor ? selectedReceivingDoctor.label : receivingDoctorsQuery}
                      onChange={(e) => { setReceivingDoctorsQuery(e.target.value); setReceivingDoctorsOpen(true) }}
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

                  {/* Discharge Template */}
                  <div className="relative dropdown-container">
                    <label className="block text-sm font-medium text-slate-700 mb-1">Discharge Template</label>
                    <input type="text" value={selectedDischargeTemplate ? selectedDischargeTemplate.label : dischargeTemplateQuery}
                      onChange={(e) => { setDischargeTemplateQuery(e.target.value); setDischargeTemplateOpen(true) }}
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
                                              <input type="text" value={item.user || ''} onChange={(e) => updateChecklistItem(item.name, 'user', e.target.value)}
                                                placeholder="User who completed"
                                                className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-green-400" />
                                            </div>
                                            <div>
                                              <label className="block text-xs font-medium text-slate-600 mb-1">Date &amp; Time</label>
                                              <input type="datetime-local" value={item.date_time ? item.date_time.slice(0, 16) : ''}
                                                onChange={(e) => updateChecklistItem(item.name, 'date_time', toFrappeDateTime(e.target.value))}
                                                className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-green-400" />
                                            </div>
                                            <div className="relative">
                                              <label className="block text-xs font-medium text-slate-600 mb-1">Department</label>
                                              <input type="text"
                                                value={item.department ? departmentOptions.find(d => d.name === item.department)?.label || item.department : (departmentOpenForItem === item.name ? departmentQuery : '')}
                                                onChange={(e) => { setDepartmentQuery(e.target.value); setDepartmentOpenForItem(item.name) }}
                                                onFocus={() => { setDepartmentOpenForItem(item.name); setDepartmentQuery(item.department || '') }}
                                                placeholder="Select Department..."
                                                className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-green-400" />
                                              {departmentOpenForItem === item.name && departmentOptions.length > 0 && (
                                                <div className="absolute z-20 mt-1 w-full rounded border border-slate-200 bg-white shadow-lg max-h-40 overflow-auto">
                                                  {departmentOptions.map((dept) => (
                                                    <button key={dept.name} type="button" className="w-full text-left px-2 py-1.5 text-xs hover:bg-green-50"
                                                      onClick={() => { updateChecklistItem(item.name, 'department', dept.name); setDepartmentQuery(dept.label); setDepartmentOpenForItem(null) }}>
                                                      {dept.label}
                                                    </button>
                                                  ))}
                                                </div>
                                              )}
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
              )}
            </div>
          )}

          {/* ── TAB: MEDICINE RECONCILIATION ── */}
          {activeTab === 'reconcile' && (
            <div className="p-6 space-y-3">
              <h3 className="text-sm font-semibold text-slate-700 mb-1">Medicine Reconciliation</h3>
              <p className="text-xs text-slate-600 mb-2">
                Review medicines given during this admission and ensure remaining doses are reconciled back to Pharmacy
                before final discharge.
              </p>
              <MedicineGivenList patient={admission.patient} />
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
                    {/* Card header */}
                    <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200 bg-white">
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                        Document #{idx + 1}
                      </span>
                      <button type="button" onClick={() => removeDocumentRow(idx)}
                        className="p-1 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors" title="Remove row">
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Two-column layout: metadata left, attachment/signature right */}
                    <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] divide-y lg:divide-y-0 lg:divide-x divide-slate-200">

                      {/* Left: metadata fields */}
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

                        {/* File upload */}
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

                      {/* Right: digital signature pad */}
                      <div className="p-4 flex flex-col gap-2">
                        <div className="flex items-center gap-1.5 mb-1">
                          <PenLine className="w-3.5 h-3.5 text-slate-400" />
                          <span className="text-xs font-medium text-slate-600">Digital Signature</span>
                          <span className="text-xs text-slate-400 ml-1">— draw &amp; save as file</span>
                        </div>
                        <div className="flex-1">
                          <SignaturePad
                            onSave={(file) => handleSignatureFile(idx, file)}
                            onClear={() => {
                              // If the current document was a signature, clear it
                              // (only clear if it was set by signature, not file upload — we can't distinguish,
                              //  so we leave it; user can re-upload to replace)
                            }}
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
            <div className="flex gap-3">
              <button type="button" onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50">
                Cancel
              </button>
              <button type="submit" disabled={submitting}
                className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed">
                {submitting ? 'Discharging...' : 'Discharge Patient'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
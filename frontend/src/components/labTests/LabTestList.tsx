

import { useState, useEffect, useRef } from 'react'
import { useLabTests } from '../../hooks/useLabTests'
import { useCareContext } from '../../providers/CareContextProvider'
import { StatusPill } from '../ui/StatusPill'
import {
  getLabTestConsumables,
  requestLabConsumables,
  fetchLabTest,
  saveAndSubmitLabTest,
  updateLabTestStatus,
  updateLabTestRemarks,
  createSampleCollectionForLabSample,
  fetchLabTestTemplateDetails,
  type LabConsumableRow,
  type LabTest,
  type NormalTestResultRow,
  type ObservationSampleCollectionRow,
  type LabTestTemplateDetails,
} from '../../services/labTests'
import {
  fetchItems,
  fetchWarehouses,
  fetchDocumentTypes,
  fetchHealthcarePractitioners,
  fetchLabTestTemplates,
  type LinkFieldOption,
} from '../../services/common'
import { fetchServiceUnits, type ServiceUnit } from '../../services/inpatientRecords'
import { uploadPatientFile, type PatientDocumentRow } from '../../services/patients'
import { LabTestDetails } from './LabTestDetails'
import { EditLabTestModal } from './EditLabTestModal'
import { PrintFormatDropdown } from '../ui/PrintFormatDropdown'
import { PortalActionsMenu } from '../ui/PortalActionsMenu'
import { toast } from '../../hooks/useToast'
import { Search, X, ChevronDown } from 'lucide-react'

// ─── Constants ─────────────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  'Draft',
  'Requested',
  'Awaiting sample collection',
  'Sample Collection in Progress',
  'Sample Collected',
  'Testing in progress',
  'Completed',
  'Pending Review',
  'Reviewed',
  'Rejected',
  'Cancelled',
] as const

const statusColors: Record<string, string> = {
  'Reviewed': 'success',
  'Rejected': 'danger',
  'Completed': 'success',
  'Pending Review': 'warning',
  'Submitted': 'info',
  'Cancelled': 'default',
  'Draft': 'warning',
  'Pending': 'warning',
  'Requested': 'info',
  'Awaiting sample collection': 'warning',
  'Sample Collection in Progress': 'info',
  'Sample Collected': 'info',
  'Testing in progress': 'info',
}

// ─── Types ──────────────────────────────────────────────────────────────────

interface Filters {
  status: string
  fromDate: string
  toDate: string
  isOutsourced: string    // '', 'yes', 'no'
  opIp: string            // '', 'OP', 'IP'
  template: string        // template name
  templateLabel: string   // human label for template
}

// ─── Filter Bar ─────────────────────────────────────────────────────────────

interface FilterBarProps {
  filters: Filters
  onChange: (f: Filters) => void
  onClear: () => void
  activeCount: number
}

const FilterBar = ({
  filters,
  onChange,
  onClear,
  activeCount,
}: FilterBarProps) => {
  const set = (key: keyof Filters, value: string) =>
    onChange({ ...filters, [key]: value })

  const [templateQuery, setTemplateQuery] = useState('')
  const [templateOptions, setTemplateOptions] = useState<LinkFieldOption[]>([])
  const [templateOpen, setTemplateOpen] = useState(false)

  useEffect(() => {
    if (!templateOpen) return
    const t = setTimeout(async () => {
      try {
        const results = await fetchLabTestTemplates(templateQuery || undefined)
        setTemplateOptions(results)
      } catch {
        setTemplateOptions([])
      }
    }, templateQuery.trim() === '' ? 0 : 300)
    return () => clearTimeout(t)
  }, [templateOpen, templateQuery])

  return (
    <div className="flex flex-wrap items-end gap-3 px-4 py-3 bg-white border-b border-slate-200">
      {/* Status */}
      <div className="flex flex-col gap-1 min-w-[160px]">
        <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Status</label>
        <div className="relative">
          <select
            value={filters.status}
            onChange={(e) => set('status', e.target.value)}
            className="w-full appearance-none pl-3 pr-8 py-1.5 text-sm rounded-md border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
        </div>
      </div>

      {/* From Date */}
      <div className="flex flex-col gap-1 min-w-[150px]">
        <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">From Date</label>
        <input
          type="date"
          value={filters.fromDate}
          onChange={(e) => set('fromDate', e.target.value)}
          className="w-full px-3 py-1.5 text-sm rounded-md border border-slate-300 focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      {/* To Date */}
      <div className="flex flex-col gap-1 min-w-[150px]">
        <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">To Date</label>
        <input
          type="date"
          value={filters.toDate}
          onChange={(e) => set('toDate', e.target.value)}
          className="w-full px-3 py-1.5 text-sm rounded-md border border-slate-300 focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      {/* OP / IP */}
      <div className="flex flex-col gap-1 min-w-[140px]">
        <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">OP / IP</label>
        <div className="relative">
          <select
            value={filters.opIp}
            onChange={(e) => set('opIp', e.target.value)}
            className="w-full appearance-none pl-3 pr-8 py-1.5 text-sm rounded-md border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">All</option>
            <option value="OP">OP</option>
            <option value="IP">IP</option>
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
        </div>
      </div>

      {/* Is Outsourced */}
      <div className="flex flex-col gap-1 min-w-[160px]">
        <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Is Outsourced</label>
        <div className="relative">
          <select
            value={filters.isOutsourced}
            onChange={(e) => set('isOutsourced', e.target.value)}
            className="w-full appearance-none pl-3 pr-8 py-1.5 text-sm rounded-md border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">All</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
        </div>
      </div>

      {/* Lab Test Template */}
      <div className="flex flex-col gap-1 min-w-[200px] relative">
        <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Lab Test Template</label>
        <div className="relative">
          <input
            type="text"
            value={filters.template ? filters.templateLabel : templateQuery}
            onChange={(e) => {
              setTemplateQuery(e.target.value)
              onChange({ ...filters, template: '', templateLabel: '' })
              setTemplateOpen(true)
            }}
            onFocus={() => setTemplateOpen(true)}
            placeholder="Search lab test template..."
            className="w-full pl-3 pr-8 py-1.5 text-sm rounded-md border border-slate-300 focus:outline-none focus:ring-2 focus:ring-primary"
          />
          {filters.template && (
            <button
              type="button"
              onClick={() => {
                setTemplateQuery('')
                onChange({ ...filters, template: '', templateLabel: '' })
              }}
              className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              title="Clear template"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
        </div>
        {templateOpen && templateOptions.length > 0 && (
          <div className="absolute z-20 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-60 overflow-y-auto top-full">
            {templateOptions.map((opt) => (
              <button
                key={opt.name}
                type="button"
                onClick={() => {
                  onChange({ ...filters, template: opt.name, templateLabel: opt.label || opt.name })
                  setTemplateQuery('')
                  setTemplateOpen(false)
                }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 focus:bg-slate-100 focus:outline-none"
              >
                <div className="font-medium text-slate-800">{opt.label || opt.name}</div>
                {opt.label && opt.label !== opt.name && (
                  <div className="text-xs text-slate-500">{opt.name}</div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Clear button */}
      {activeCount > 0 && (
        <button
          type="button"
          onClick={onClear}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors self-end"
        >
          <X className="w-3.5 h-3.5" />
          Clear
          <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-primary text-white text-[10px] font-bold">
            {activeCount}
          </span>
        </button>
      )}
    </div>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const makeEmptyFilters = (): Filters => ({
  status: '',
  fromDate: '',
  toDate: '',
  isOutsourced: '',
  opIp: '',
  template: '',
  templateLabel: '',
})

// ─── Main Component ──────────────────────────────────────────────────────────

export const LabTestList = ({
  patient,
  isOutsourced,
  defaultStatus,
  byNurse,
}: {
  patient?: string
  isOutsourced?: boolean
  defaultStatus?: string
  byNurse?: boolean
}) => {
  const { mode, selectedPatient: contextPatient } = useCareContext()

  // Use context patient when no patient prop is passed.
  const effectivePatient = patient ?? (contextPatient || undefined)

  // Initialize opIp from context mode so the list pre-filters to the right care type.
  const [filters, setFilters] = useState<Filters>(() => ({
    ...makeEmptyFilters(),
    status: defaultStatus ?? '',
    opIp: mode === 'IP' ? 'IP' : mode === 'OP' ? 'OP' : '',
  }))

  // Sync opIp when global mode changes (e.g. user switches IP ↔ OP in the header).
  useEffect(() => {
    setFilters(prev => ({
      ...prev,
      opIp: mode === 'IP' ? 'IP' : mode === 'OP' ? 'OP' : '',
    }))
  }, [mode])

  const handleClear = () => {
    setFilters(makeEmptyFilters())
  }

  const activeCount = [
    filters.status,
    filters.fromDate,
    filters.toDate,
    filters.isOutsourced,
    filters.opIp,
    filters.template,
  ].filter(Boolean).length

  const { labTests, loading, error, refetch } = useLabTests(
    effectivePatient,
    filters.status || undefined,
    filters.status === 'Pending Review',
    isOutsourced !== undefined ? isOutsourced : (filters.isOutsourced ? filters.isOutsourced === 'yes' : undefined),
    filters.fromDate || undefined,
    filters.toDate || undefined,
    filters.template || undefined,
    filters.opIp || undefined,
    byNurse
  )

  // ── Inline Result Editing ──
  const [editingResult, setEditingResult] = useState<string | null>(null)
  const [editingValue, setEditingValue] = useState<string>('')
  const [updatingResult, setUpdatingResult] = useState<string | null>(null)

  const handleInlineResultUpdate = async (labTestName: string, newResult: string) => {
    setUpdatingResult(labTestName)
    try {
      await saveAndSubmitLabTest(labTestName, {
        custom_result: newResult,
        submit: false,
      })
      await refetch()
      toast.success('Result updated')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update result')
    } finally {
      setUpdatingResult(null)
      setEditingResult(null)
      setEditingValue('')
    }
  }

  // ── Consumables dialog ───────────────────────────────────────────────────

  const [requestingFor, setRequestingFor] = useState<string | null>(null)
  const [dialogItems, setDialogItems] = useState<LabConsumableRow[]>([])
  const [dialogLoading, setDialogLoading] = useState(false)
  const [dialogError, setDialogError] = useState<string | null>(null)
  const [itemOptions, setItemOptions] = useState<LinkFieldOption[]>([])
  const [warehouseOptions, setWarehouseOptions] = useState<LinkFieldOption[]>([])
  const [openItemIndex, setOpenItemIndex] = useState<number | null>(null)
  const [openWarehouseIndex, setOpenWarehouseIndex] = useState<number | null>(null)

  // ── Results dialog ───────────────────────────────────────────────────────

  const [resultDialogOpen, setResultDialogOpen] = useState(false)
  const [resultDialogLoading, setResultDialogLoading] = useState(false)
  const [resultDialogError, setResultDialogError] = useState<string | null>(null)
  const [activeLabTest, setActiveLabTest] = useState<LabTest | null>(null)
  const [customResult, setCustomResult] = useState('')
  const [labComment, setLabComment] = useState('')
  const [worksheetText, setWorksheetText] = useState('')
  const [resultDialogTab, setResultDialogTab] = useState<'results' | 'documents'>('results')
  const [resultDocuments, setResultDocuments] = useState<PatientDocumentRow[]>([])
  const [resultDocumentTypes, setResultDocumentTypes] = useState<{ name: string; document_name?: string }[]>([])
  const [resultDocumentUploading, setResultDocumentUploading] = useState<number | null>(null)
  // Normal test items + template meta for result entry
  const [normalTestItems, setNormalTestItems] = useState<NormalTestResultRow[]>([])
  const [templateDetails, setTemplateDetails] = useState<LabTestTemplateDetails>({})
  const [worksheetExpanded, setWorksheetExpanded] = useState(false)

  // ── Review actions ───────────────────────────────────────────────────────

  const [openActionRow, setOpenActionRow] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [selectedLabTestForDetails, setSelectedLabTestForDetails] = useState<string | null>(null)
  const [editLabTestName, setEditLabTestName] = useState<string | null>(null)
  const actionMenuRef = useRef<HTMLDivElement>(null)
  const [sampleModalLabTest, setSampleModalLabTest] = useState<LabTest | null>(null)
  const [sampleModalLoading, setSampleModalLoading] = useState(false)
  const [sampleModalError, setSampleModalError] = useState<string | null>(null)
  const [sampleFormRowIndex, setSampleFormRowIndex] = useState<number | null>(null)
  const [sampleFormLoading, setSampleFormLoading] = useState(false)
  const [sampleFormError, setSampleFormError] = useState<string | null>(null)
  const [sampleFormCollectionPoint, setSampleFormCollectionPoint] = useState<string>('')
  const [collectionPointQuery, setCollectionPointQuery] = useState<string>('')
  const [collectionPointOptions, setCollectionPointOptions] = useState<ServiceUnit[]>([])
  const [collectionPointOpen, setCollectionPointOpen] = useState(false)
  const [sampleFormRefPractitioner, setSampleFormRefPractitioner] = useState<string>('')
  const [refPractitionerOptions, setRefPractitionerOptions] = useState<LinkFieldOption[]>([])
  const [refPractitionerQuery, setRefPractitionerQuery] = useState('')
  const [refPractitionerOpen, setRefPractitionerOpen] = useState(false)
  const [sampleObsRows, setSampleObsRows] = useState<ObservationSampleCollectionRow[]>([])
  const [templateSampleDetails, setTemplateSampleDetails] = useState('')
  const [expandedSampleDetailIdx, setExpandedSampleDetailIdx] = useState<number | null>(null)

  useEffect(() => {
    const loadCollectionPoints = async () => {
      if (!collectionPointQuery.trim()) {
        setCollectionPointOptions([])
        return
      }
      try {
        const res = await fetchServiceUnits(undefined, undefined, collectionPointQuery.trim())
        setCollectionPointOptions(res)
      } catch {
        setCollectionPointOptions([])
      }
    }
    loadCollectionPoints()
  }, [collectionPointQuery])

  useEffect(() => {
    const loadPractitioners = async () => {
      if (!refPractitionerQuery.trim()) {
        setRefPractitionerOptions([])
        return
      }
      try {
        const res = await fetchHealthcarePractitioners(refPractitionerQuery.trim())
        setRefPractitionerOptions(res)
      } catch {
        setRefPractitionerOptions([])
      }
    }
    loadPractitioners()
  }, [refPractitionerQuery])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const el = e.target as HTMLElement
      if (el.closest('[data-portal-actions-menu]')) return
      if (el.closest('button[aria-label="Actions"]')) return
      if (actionMenuRef.current && !actionMenuRef.current.contains(e.target as Node)) {
        setOpenActionRow(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleStatusChange = async (name: string, newStatus: 'Reviewed' | 'Rejected') => {
    setOpenActionRow(null)
    setActionLoading(name)
    try {
      await updateLabTestStatus(name, newStatus)
      toast.success(newStatus === 'Reviewed' ? 'Lab test reviewed' : 'Lab test rejected')
      refetch()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : `Failed to ${newStatus === 'Reviewed' ? 'review' : 'reject'} lab test`)
    } finally {
      setActionLoading(null)
    }
  }

  const handleOpenSampleCollection = (labTest: LabTest) => {
    setOpenActionRow(null)
    setSampleModalError(null)
    setSampleModalLoading(true)
    setSampleModalLabTest(null)
    fetchLabTest(labTest.name)
      .then((full) => {
        setSampleModalLabTest(full)
      })
      .catch((e) => {
        const msg = e instanceof Error ? e.message : 'Failed to load lab test'
        setSampleModalError(msg)
        toast.error(msg)
      })
      .finally(() => setSampleModalLoading(false))
  }

  // ── Add Remarks modal (remarks table: multiple rows) ──────────────────────

  const [remarksModalOpen, setRemarksModalOpen] = useState(false)
  const [remarksLabTestName, setRemarksLabTestName] = useState<string | null>(null)
  const [remarksList, setRemarksList] = useState<Array<{ rrmark: string }>>([{ rrmark: '' }])
  const [remarksLoading, setRemarksLoading] = useState(false)
  const [remarksError, setRemarksError] = useState<string | null>(null)

  const openRemarksModal = async (labTestName: string) => {
    setOpenActionRow(null)
    setRemarksLabTestName(labTestName)
    setRemarksError(null)
    setRemarksList([{ rrmark: '' }])
    setRemarksLoading(true)
    setRemarksModalOpen(true)
    try {
      const doc = await fetchLabTest(labTestName)
      const existing = (doc as LabTest).remarks
      if (existing && existing.length > 0) {
        setRemarksList(existing.map((r) => ({ rrmark: r.rrmark || '' })))
      } else {
        setRemarksList([{ rrmark: '' }])
      }
    } catch (e) {
      setRemarksError(e instanceof Error ? e.message : 'Failed to load lab test')
    } finally {
      setRemarksLoading(false)
    }
  }

  const closeRemarksModal = () => {
    setRemarksModalOpen(false)
    setRemarksLabTestName(null)
    setRemarksList([{ rrmark: '' }])
    setRemarksError(null)
  }

  const addRemarksRow = () => setRemarksList((prev) => [...prev, { rrmark: '' }])
  const updateRemarksRow = (idx: number, value: string) => {
    setRemarksList((prev) => {
      const next = [...prev]
      next[idx] = { rrmark: value }
      return next
    })
  }
  const removeRemarksRow = (idx: number) => {
    setRemarksList((prev) => (prev.length <= 1 ? [{ rrmark: '' }] : prev.filter((_, i) => i !== idx)))
  }

  const handleSubmitRemarks = async () => {
    if (!remarksLabTestName) return
    const payload = remarksList.map((r) => ({ rrmark: (r.rrmark || '').trim() })).filter((r) => r.rrmark)
    setRemarksLoading(true)
    setRemarksError(null)
    try {
      await updateLabTestRemarks(remarksLabTestName, payload.length ? payload : [])
      toast.success('Remarks saved')
      refetch()
      closeRemarksModal()
    } catch (e) {
      setRemarksError(e instanceof Error ? e.message : 'Failed to save remarks')
      toast.error('Failed to save remarks')
    } finally {
      setRemarksLoading(false)
    }
  }

  const openRequestDialog = async (labTest: LabTest) => {
    try {
      setDialogError(null)
      setDialogLoading(true)
      setRequestingFor(labTest.name)
      if (!itemOptions.length) fetchItems().then(setItemOptions).catch(() => setItemOptions([]))
      if (!warehouseOptions.length) {
        fetchWarehouses(labTest.company || undefined)
          .then(setWarehouseOptions)
          .catch(() => setWarehouseOptions([]))
      }
      const items = await getLabTestConsumables(labTest.name)
      setDialogItems(items.length ? items : [{ item_code: '', item_name: '', qty: 1 }])
    } catch (e) {
      setDialogError(e instanceof Error ? e.message : 'Failed to load consumables')
    } finally {
      setDialogLoading(false)
    }
  }

  const closeRequestDialog = () => {
    setRequestingFor(null)
    setDialogItems([])
    setDialogError(null)
    setDialogLoading(false)
  }

  const updateItem = (index: number, field: keyof LabConsumableRow, value: string) => {
    setDialogItems((prev) =>
      prev.map((row, i) =>
        i === index ? { ...row, [field]: field === 'qty' ? Number(value) || 0 : value } : row
      )
    )
  }

  const addRow = () => setDialogItems((prev) => [...prev, { item_code: '', item_name: '', qty: 1 }])
  const removeRow = (index: number) => setDialogItems((prev) => prev.filter((_, i) => i !== index))

  const submitRequest = async () => {
    if (!requestingFor) return
    const validItems = dialogItems.filter((row) => row.item_code && row.qty > 0)
    if (!validItems.length) { setDialogError('Please add at least one item with quantity.'); return }
    try {
      setDialogLoading(true)
      setDialogError(null)
      const mrName = await requestLabConsumables(requestingFor, validItems)
      await refetch()
      closeRequestDialog()
      alert(`Material Request ${mrName} created`)
    } catch (e) {
      setDialogError(e instanceof Error ? e.message : 'Failed to create Material Request')
    } finally {
      setDialogLoading(false)
    }
  }

  const openResultDialog = async (labTestName: string) => {
    try {
      setResultDialogError(null)
      setResultDialogLoading(true)
      setResultDialogOpen(true)
      setResultDialogTab('results')
      setWorksheetExpanded(false)
      setActiveLabTest({ name: labTestName, patient: '' })
      const [doc, docTypes] = await Promise.all([fetchLabTest(labTestName), fetchDocumentTypes()])
      setActiveLabTest(doc)
      setCustomResult(doc.custom_result || '')
      setLabComment(doc.lab_test_comment || '')
      setWorksheetText(doc.worksheet_instructions || '')
      setResultDocumentTypes(docTypes)
      // Load normal test items (editable copy) — may be empty for brand-new tests
      const existingItems: NormalTestResultRow[] = (doc.normal_test_items || []).map((r: any) => ({ ...r }))
      setNormalTestItems(existingItems)
      // Fetch template details for min/max/worksheet/sample_details + compound rows
      if (doc.template) {
        fetchLabTestTemplateDetails(doc.template)
          .then((d) => {
            setTemplateDetails(d)
            // Pre-fill worksheet if lab test doesn't have its own
            if (!doc.worksheet_instructions && d.worksheet_instructions) {
              setWorksheetText(d.worksheet_instructions)
            }
            // If the lab test has no normal_test_items yet, build them from the template rows
            if (existingItems.length === 0 && (d.normal_test_templates || []).length > 0) {
              const fromTemplate: NormalTestResultRow[] = (d.normal_test_templates || []).map((t) => ({
                lab_test_event: t.lab_test_event || '',
                lab_test_name: t.lab_test_event || '',
                lab_test_uom: t.lab_test_uom || '',
                normal_range: t.normal_range || '',
                result_value: '',
                lab_test_comment: '',
                template: doc.template || '',
              }))
              setNormalTestItems(fromTemplate)
            }
          })
          .catch(() => setTemplateDetails({}))
      } else {
        setTemplateDetails({})
      }
      const docs = (doc as LabTest).documents && (doc as LabTest).documents!.length > 0
        ? (doc as LabTest).documents!.map((d) => ({ file_name: d.file_name || '', document_type: d.document_type || '', transaction_no: d.transaction_no || '', upload_remarks: d.upload_remarks || '', document: d.document || '' }))
        : [{ file_name: '', document_type: '', transaction_no: '', upload_remarks: '' }]
      setResultDocuments(docs)
    } catch (e) {
      setResultDialogError(e instanceof Error ? e.message : 'Failed to load lab test')
    } finally {
      setResultDialogLoading(false)
    }
  }

  const closeResultDialog = () => {
    setResultDialogOpen(false)
    setActiveLabTest(null)
    setCustomResult('')
    setLabComment('')
    setWorksheetText('')
    setResultDialogTab('results')
    setResultDocuments([])
    setResultDialogError(null)
    setResultDialogLoading(false)
    setNormalTestItems([])
    setTemplateDetails({})
    setWorksheetExpanded(false)
  }

  const addResultDocumentRow = () => setResultDocuments(prev => [...prev, { file_name: '', document_type: '', transaction_no: '', upload_remarks: '' }])
  const updateResultDocumentRow = (idx: number, field: keyof PatientDocumentRow, value: string) => {
    setResultDocuments(prev => { const next = [...prev]; next[idx] = { ...next[idx], [field]: value }; return next })
  }
  const handleResultDocumentFile = async (idx: number, file: File | null) => {
    if (!file) return
    setResultDocumentUploading(idx)
    try {
      const file_url = await uploadPatientFile(file)
      if (!file_url) throw new Error('No URL returned from upload')
      setResultDocuments(prev => {
        const next = [...prev]
        next[idx] = { ...next[idx], document: file_url, file_name: (next[idx].file_name || '').trim() || file.name }
        return next
      })
      toast.success('File uploaded')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'File upload failed')
    } finally {
      setResultDocumentUploading(null)
    }
  }

  const handleSubmitLabTestWithResults = async () => {
    if (!activeLabTest) return
    try {
      setResultDialogLoading(true)
      setResultDialogError(null)
      const docPayload = resultDocuments
        .filter((r) => (r.file_name || '').trim() || (r.document || '').trim())
        .map((r) => ({
          file_name: (r.file_name || '').trim() || undefined,
          document_type: (r.document_type || '').trim() || undefined,
          transaction_no: (r.transaction_no || '').trim() || undefined,
          upload_remarks: (r.upload_remarks || '').trim() || undefined,
          document: (r.document || '').trim() || undefined,
        }))
      await saveAndSubmitLabTest(activeLabTest.name, {
        custom_result: customResult,
        lab_test_comment: labComment,
        worksheet_instructions: worksheetText,
        documents: docPayload.length ? docPayload : undefined,
        normal_test_items: normalTestItems.length ? normalTestItems : undefined,
        submit: true,
      })
      await refetch()
      closeResultDialog()
    } catch (e) {
      setResultDialogError(e instanceof Error ? e.message : 'Failed to submit lab test with results')
    } finally {
      setResultDialogLoading(false)
    }
  }

  // Helper function to determine which range columns to show based on patient gender
  const getRangeHeaders = (labTestsList: LabTest[]) => {
    if (labTestsList.length === 0) return { showFemale: false, showMale: false, showGeneric: true }
    const gender = labTestsList[0].gender
    console.log('Determining range headers to show based on patient gender:', gender)
    if (gender === 'Female') return { showFemale: true, showMale: false, showGeneric: false }
    if (gender === 'Male') return { showFemale: false, showMale: true, showGeneric: false }
    return { showFemale: false, showMale: false, showGeneric: true }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  const rangeHeaders = getRangeHeaders(labTests)

  return (
    <div className="flex flex-col min-w-full">
      <FilterBar
        filters={filters}
        onChange={setFilters}
        onClear={handleClear}
        activeCount={activeCount}
      />

      {loading ? (
        <div className="flex items-center justify-center p-8">
          <div className="text-slate-600">Loading lab tests...</div>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center p-8">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 max-w-2xl w-full">
            <h3 className="text-red-800 font-semibold mb-2">Error Loading Lab Tests</h3>
            <p className="text-red-700 text-sm mb-2">{error.message}</p>
            <button onClick={() => refetch()} className="px-4 py-2 bg-red-600 text-white rounded-md text-sm hover:bg-red-700">
              Retry
            </button>
          </div>
        </div>
      ) : labTests.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 text-slate-400">
          <Search className="w-10 h-10 mb-3 opacity-30" />
          <p className="text-sm">
            {activeCount > 0 ? 'No lab tests match the current filters.' : 'No lab tests found.'}
          </p>
          {activeCount > 0 && (
            <button onClick={handleClear} className="mt-3 text-sm text-primary hover:underline">
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px]">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Lab Test ID</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Patient</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Test Name</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Practitioner</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Outsourced</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Date</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase">Amount</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Actions</th>
                {/* Gender-specific range headers */}
                {rangeHeaders.showFemale && (
                  <>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 uppercase">F-Min</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 uppercase">F-Max</th>
                  </>
                )}
                {rangeHeaders.showMale && (
                  <>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 uppercase">M-Min</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 uppercase">M-Max</th>
                  </>
                )}
                {rangeHeaders.showGeneric && (
                  <>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 uppercase">Min</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 uppercase">Max</th>
                  </>
                )}
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Results</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Inventory</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {labTests.map((labTest) => (
                <tr
                  key={labTest.name}
                  className="hover:bg-slate-50 cursor-pointer"
                  onClick={(e) => {
                    const target = e.target as HTMLElement
                    // Don't trigger row click when clicking buttons or inside the actions/controls
                    if (target.closest('button') || target.closest('a') || target.closest('[data-no-row-click]')) {
                      return
                    }
                    setSelectedLabTestForDetails(labTest.name)
                  }}
                >
                  <td className="px-4 py-3 text-sm font-medium text-slate-900">{labTest.name}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">{labTest.patient_name || labTest.patient}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">{labTest.lab_test_name || labTest.template || '-'}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">{labTest.practitioner_name || labTest.practitioner || '-'}</td>
                  <td className="px-4 py-3">
                    <StatusPill status={labTest.status || 'Draft'} color={statusColors[labTest.status || 'Draft'] || 'default'} />
                  </td>
                  <td className="px-4 py-3">
                    {labTest.is_outsourced ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700">
                        Outsourced
                      </span>
                    ) : (
                      <span className="text-slate-400 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">
                    {labTest.result_date
                      ? new Date(labTest.result_date).toLocaleDateString()
                      : labTest.submitted_date
                      ? new Date(labTest.submitted_date).toLocaleDateString()
                      : '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700 text-right">
                    {typeof labTest.grand_total === 'number'
                      ? labTest.grand_total.toFixed(3)
                      : typeof labTest.amount === 'number'
                      ? labTest.amount.toFixed(3)
                      : '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="relative inline-block" ref={openActionRow === labTest.name ? actionMenuRef : undefined}>
                        <button
                          type="button"
                          onClick={() => setOpenActionRow((prev) => (prev === labTest.name ? null : labTest.name))}
                          disabled={!!actionLoading}
                          className="inline-flex items-center justify-center w-8 h-8 rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                          aria-label="Actions"
                        >
                          {actionLoading === labTest.name ? (
                            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                            </svg>
                          ) : (
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                            </svg>
                          )}
                        </button>
                        <PortalActionsMenu
                          open={openActionRow === labTest.name}
                          onClose={() => setOpenActionRow(null)}
                          triggerRef={actionMenuRef}
                          minWidth={160}
                        >
                          <button
                            type="button"
                            onClick={() => { setOpenActionRow(null); setSelectedLabTestForDetails(labTest.name) }}
                            className="flex items-center gap-2 w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                          >
                            View Details
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenSampleCollection(labTest)}
                            className="flex items-center gap-2 w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                          >
                            Sample Collection
                          </button>
                          {labTest.docstatus === 0 && (
                            <button
                              type="button"
                              onClick={() => { setOpenActionRow(null); openResultDialog(labTest.name) }}
                              className="flex items-center gap-2 w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                            >
                              Enter Results &amp; Submit
                            </button>
                          )}
                          {labTest.docstatus === 0 && (
                            <button
                              type="button"
                              onClick={() => { setOpenActionRow(null); setEditLabTestName(labTest.name) }}
                              className="flex items-center gap-2 w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                            >
                              Edit
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => openRemarksModal(labTest.name)}
                            className="flex items-center gap-2 w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                          >
                            Add Remarks
                          </button>
                          {labTest.status === 'Pending Review' && (
                            <>
                              <div className="border-t border-slate-100 my-1" />
                              <button
                                type="button"
                                onClick={() => handleStatusChange(labTest.name, 'Reviewed')}
                                className="block w-full text-left px-3 py-2 text-sm text-green-700 font-medium hover:bg-green-50"
                              >
                                ✓ Reviewed
                              </button>
                              <button
                                type="button"
                                onClick={() => handleStatusChange(labTest.name, 'Rejected')}
                                className="block w-full text-left px-3 py-2 text-sm text-red-600 font-medium hover:bg-red-50"
                              >
                                ✗ Reject
                              </button>
                            </>
                          )}
                        </PortalActionsMenu>
                      </div>
                      <PrintFormatDropdown
                        doctype="Lab Test"
                        docName={labTest.name}
                        noLetterhead={0}
                        triggerPrint={1}
                      />
                    </div>
                  </td>

                  {/* Gender-specific range values */}
                  {rangeHeaders.showFemale && (
                    <>
                      <td className="px-4 py-3 text-center text-sm text-slate-700">
                        {labTest.female_min_range != null ? (
                          <span className="font-medium">{labTest.female_min_range}</span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center text-sm text-slate-700">
                        {labTest.female_max_range != null ? (
                          <span className="font-medium">{labTest.female_max_range}</span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                    </>
                  )}
                  {rangeHeaders.showMale && (
                    <>
                      <td className="px-4 py-3 text-center text-sm text-slate-700">
                        {labTest.male_min_range != null ? (
                          <span className="font-medium">{labTest.male_min_range}</span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center text-sm text-slate-700">
                        {labTest.male_max_range != null ? (
                          <span className="font-medium">{labTest.male_max_range}</span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                    </>
                  )}
                  {rangeHeaders.showGeneric && (
                    <>
                      <td className="px-4 py-3 text-center text-sm text-slate-700">
                        {labTest.min_range != null ? (
                          <span className="font-medium">{labTest.min_range}</span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center text-sm text-slate-700">
                        {labTest.max_range != null ? (
                          <span className="font-medium">{labTest.max_range}</span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                    </>
                  )}

                  {/* Editable Results cell */}
                  <td className="px-4 py-3 text-sm max-w-[200px]">
                    {updatingResult === labTest.name ? (
                      <div className="flex items-center gap-1">
                        <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                        </svg>
                        <span className="text-xs text-slate-400">Updating...</span>
                      </div>
                    ) : editingResult === labTest.name ? (
                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="text"
                          value={editingValue}
                          onChange={(e) => setEditingValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleInlineResultUpdate(labTest.name, editingValue)
                            } else if (e.key === 'Escape') {
                              setEditingResult(null)
                              setEditingValue('')
                            }
                          }}
                          onBlur={() => {
                            handleInlineResultUpdate(labTest.name, editingValue)
                          }}
                          className="w-full px-2 py-1 text-sm border border-primary rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                          autoFocus
                        />
                      </div>
                    ) : (
                      <div
                        onClick={(e) => {
                          e.stopPropagation()
                          setEditingResult(labTest.name)
                          setEditingValue(labTest.custom_result || '')
                        }}
                        className={`cursor-pointer hover:bg-slate-100 rounded-md px-2 py-1 transition-colors ${
                          labTest.custom_result ? 'text-slate-800 font-medium' : 'text-slate-300 italic'
                        }`}
                        title="Click to edit result"
                      >
                        {labTest.custom_result || 'Click to add result'}
                      </div>
                    )}
                  </td>

                  {/* Inventory cell */}
                  <td className="px-4 py-3 text-sm text-slate-700">
                    {labTest.docstatus === 0 && !labTest.material_request ? (
                      <button
                        type="button"
                        onClick={() => openRequestDialog(labTest)}
                        className="px-2 py-1 text-xs rounded-md border border-primary text-primary hover:bg-primary/5"
                      >
                        Request Consumables
                      </button>
                    ) : labTest.material_request ? (
                      <span className="text-xs text-slate-500">MR: {labTest.material_request}</span>
                    ) : (
                      <span className="text-xs text-slate-400">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Lab Test Details slide-over ── */}
      {selectedLabTestForDetails && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-end"
          onClick={() => setSelectedLabTestForDetails(null)}
        >
          <div className="absolute inset-0 bg-black/30" />
          <div
            className="relative z-10 h-full w-full max-w-2xl bg-white shadow-xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50 shrink-0">
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide">Lab Test Details</p>
                <p className="text-sm font-semibold text-slate-800">{selectedLabTestForDetails}</p>
              </div>
              <div className="flex items-center gap-2">
                <PrintFormatDropdown
                  doctype="Lab Test"
                  docName={selectedLabTestForDetails}
                  noLetterhead={0}
                  triggerPrint={1}
                  className="inline-flex items-center justify-center w-8 h-8 rounded border border-slate-300 bg-white text-primary hover:bg-slate-50"
                />
                <button
                  type="button"
                  onClick={() => setSelectedLabTestForDetails(null)}
                  className="inline-flex items-center justify-center w-8 h-8 rounded-md text-slate-500 hover:text-slate-800 hover:bg-slate-200"
                  aria-label="Close"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <LabTestDetails
                labTestName={selectedLabTestForDetails}
                onUpdate={() => refetch()}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Sample Collection modal ── */}
      {sampleModalLabTest && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-5xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  Sample Collection — {sampleModalLabTest.name}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Patient: {sampleModalLabTest.patient_name || sampleModalLabTest.patient || '-'}
                  {sampleModalLabTest.lab_test_name ? ` · ${sampleModalLabTest.lab_test_name}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => { setSampleModalLabTest(null); setSampleModalError(null); setTemplateSampleDetails('') }}
                className="text-slate-400 hover:text-slate-600 text-lg leading-none"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {sampleModalLoading && (
                <div className="text-sm text-slate-600">Loading sample instances…</div>
              )}
              {sampleModalError && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-md px-3 py-2">
                  {sampleModalError}
                </div>
              )}
              {!sampleModalLoading && !sampleModalError && (
                <>
                  {(!sampleModalLabTest.sample_instances || sampleModalLabTest.sample_instances.length === 0) ? (
                    <div className="text-sm text-slate-500 bg-slate-50 border border-slate-200 rounded-md p-4">
                      No sample instances are defined for this lab test. Please configure Sample Requirements on the Lab Test Template.
                    </div>
                  ) : (
                    <table className="w-full text-xs border border-slate-200 rounded-lg overflow-hidden">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="px-3 py-2.5 text-left font-semibold text-slate-600">Sample</th>
                          <th className="px-3 py-2.5 text-left font-semibold text-slate-600 w-16">Qty</th>
                          <th className="px-3 py-2.5 text-left font-semibold text-slate-600">Collection Instructions</th>
                          <th className="px-3 py-2.5 text-left font-semibold text-slate-600 w-44">Sample Collection</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {sampleModalLabTest.sample_instances!.map((row, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/60">
                            <td className="px-3 py-2.5 text-slate-800 font-medium">{row.sample || '-'}</td>
                            <td className="px-3 py-2.5 text-slate-700">{row.sample_qty ?? '-'}</td>
                            <td className="px-3 py-2.5 text-slate-600">
                              {row.sample_details ? (
                                <div>
                                  <button
                                    type="button"
                                    className="flex items-center gap-1.5 text-blue-600 hover:text-blue-800 text-sm font-semibold"
                                    onClick={() => setExpandedSampleDetailIdx(expandedSampleDetailIdx === idx ? null : idx)}
                                  >
                                    <span>📋 View Instructions</span>
                                    <span className="text-slate-400">{expandedSampleDetailIdx === idx ? '▲' : '▼'}</span>
                                  </button>
                                  {expandedSampleDetailIdx === idx && (
                                    <div className="mt-3 p-3 bg-blue-50 border border-blue-300 rounded text-sm text-slate-800 max-h-96 overflow-y-auto">
                                      {row.sample_details.includes('<') ? (
                                        <div 
                                          className="prose prose-base max-w-none [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:mb-2 [&_li]:leading-relaxed [&_strong]:font-semibold [&_strong]:text-slate-900 [&_em]:italic [&_p]:mb-2.5"
                                          dangerouslySetInnerHTML={{ __html: row.sample_details }}
                                        />
                                      ) : (
                                        <div className="whitespace-pre-wrap leading-relaxed text-base">{row.sample_details}</div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <span className="text-slate-400 italic">No instructions</span>
                              )}
                            </td>
                            <td className="px-3 py-2.5">
                              {row.sample_collection ? (
                                <button
                                  type="button"
                                  onClick={() => window.open(`/app/sample-collection/${encodeURIComponent(row.sample_collection!)}`, '_blank')}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-300 text-xs text-slate-700 hover:bg-slate-50"
                                >
                                  ✓ Open Record
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={async () => {
                                    setSampleFormError(null)
                                    setSampleObsRows([{ sample: row.sample, sample_qty: row.sample_qty, collection_date_time: new Date().toISOString().slice(0, 16).replace('T', ' ') }])
                                    if (sampleModalLabTest.template) {
                                      fetchLabTestTemplateDetails(sampleModalLabTest.template)
                                        .then((d) => setTemplateSampleDetails(d.sample_details || ''))
                                        .catch(() => setTemplateSampleDetails(''))
                                    }
                                    setSampleFormRowIndex(idx)
                                  }}
                                  className="inline-flex items-center px-2.5 py-1 rounded bg-primary text-white text-xs hover:bg-primary/90"
                                >
                                  + Create
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </>
              )}
            </div>
            <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex justify-end">
              <button
                type="button"
                onClick={() => { setSampleModalLabTest(null); setSampleModalError(null); setTemplateSampleDetails('') }}
                className="px-3 py-1.5 text-xs rounded-md border border-slate-300 text-slate-700 hover:bg-white"
              >
                Close
              </button>
            </div>
          </div>

          {/* Sample Collection Form Modal */}
          {sampleFormRowIndex !== null && sampleModalLabTest && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
              <div className="bg-white rounded-lg shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
                <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900">Create Sample Collection</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Sample: <strong>{sampleModalLabTest.sample_instances?.[sampleFormRowIndex!]?.sample || '—'}</strong>
                    </p>
                  </div>
                  <button type="button" disabled={sampleFormLoading}
                    onClick={() => { if (!sampleFormLoading) { setSampleFormRowIndex(null); setSampleFormError(null); setSampleFormCollectionPoint(''); setCollectionPointQuery(''); setCollectionPointOptions([]); setSampleFormRefPractitioner(''); setRefPractitionerQuery(''); setRefPractitionerOptions([]); setCollectionPointOpen(false); setRefPractitionerOpen(false); setSampleObsRows([]); setTemplateSampleDetails('') } }}
                    className="text-slate-400 hover:text-slate-600 disabled:opacity-40 text-lg"
                  >✕</button>
                </div>
                <div className="p-5 space-y-4 overflow-y-auto flex-1">
                  {sampleFormError && (
                    <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-md px-3 py-2">{sampleFormError}</div>
                  )}

                  {templateSampleDetails && (
                    <div className="rounded-md border border-blue-200 bg-blue-50 px-5 py-4">
                      <p className="text-sm font-bold text-blue-800 mb-3">📋 Collection Instructions (from template)</p>
                      <div 
                        className="prose prose-base max-w-none text-base text-blue-900 leading-relaxed [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:mb-2.5 [&_li]:leading-relaxed [&_strong]:font-semibold [&_strong]:text-blue-950 [&_em]:italic [&_p]:mb-3"
                        dangerouslySetInnerHTML={{ __html: templateSampleDetails }}
                      />
                    </div>
                  )}

                  {(() => {
                    const row = sampleModalLabTest.sample_instances?.[sampleFormRowIndex!]
                    if (!row) return null
                    return (
                      <>
                        <div className="grid grid-cols-2 gap-3 text-xs bg-slate-100 border border-slate-300 rounded-lg p-2">
                          <div>
                            <div className="text-[9px] font-medium text-slate-500 mb-0.5">Sample</div>
                            <div className="text-slate-900 font-semibold text-sm truncate">{row.sample || '-'}</div>
                          </div>
                          <div>
                            <div className="text-[9px] font-medium text-slate-500 mb-0.5">Qty / Patient</div>
                            <div className="text-slate-900 font-semibold text-sm truncate">
                              {row.sample_qty ?? '-'} · {sampleModalLabTest.patient_name || sampleModalLabTest.patient || '-'}
                            </div>
                          </div>
                        </div>

                        <div>
                          <label className="block text-sm font-bold text-slate-800 mb-2">Collection Details & Observations</label>
                          {row.sample_details && row.sample_details.includes('<') ? (
                            <div className="w-full rounded-md border border-slate-300 px-4 py-3 bg-slate-50 min-h-[280px] overflow-y-auto">
                              <div 
                                className="prose prose-base max-w-none text-base text-slate-800 leading-relaxed [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:mb-2.5 [&_li]:leading-relaxed [&_strong]:font-semibold [&_strong]:text-slate-900 [&_em]:italic [&_p]:mb-3"
                                dangerouslySetInnerHTML={{ __html: row.sample_details }}
                              />
                            </div>
                          ) : row.sample_details ? (
                            <div className="w-full rounded-md border border-slate-300 px-4 py-3 text-base bg-slate-50 min-h-[280px] whitespace-pre-wrap leading-relaxed text-slate-800 font-medium">
                              {row.sample_details}
                            </div>
                          ) : (
                            <div className="w-full rounded-md border border-slate-300 px-4 py-3 text-base bg-slate-50 min-h-[280px] text-slate-400 flex items-center justify-center">
                              Collection details will appear here...
                            </div>
                          )}
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="relative">
                            <label className="block text-xs font-semibold text-slate-700 mb-1">Collection Point</label>
                            <input type="text" value={sampleFormCollectionPoint || collectionPointQuery}
                              onChange={(e) => { setSampleFormCollectionPoint(''); setCollectionPointQuery(e.target.value); setCollectionPointOpen(true) }}
                              onFocus={() => setCollectionPointOpen(true)}
                              placeholder="Search service unit..."
                              className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                            />
                            {collectionPointOpen && (collectionPointQuery || collectionPointOptions.length > 0) && (
                              <div className="absolute z-20 mt-1 w-full max-h-48 overflow-auto rounded-md bg-white border border-slate-200 shadow-lg">
                                {collectionPointOptions.length === 0 ? (
                                  <div className="px-3 py-2 text-[11px] text-slate-500">Type to search…</div>
                                ) : collectionPointOptions.map((su) => (
                                  <button key={su.name} type="button"
                                    onClick={() => { setSampleFormCollectionPoint(su.name); setCollectionPointQuery(su.healthcare_service_unit_name || su.name); setCollectionPointOpen(false) }}
                                    className="w-full text-left px-3 py-1.5 text-[11px] hover:bg-slate-100">
                                    {su.healthcare_service_unit_name || su.name}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="relative">
                            <label className="block text-xs font-semibold text-slate-700 mb-1">Referring Practitioner</label>
                            <input type="text" value={sampleFormRefPractitioner || refPractitionerQuery}
                              onChange={(e) => { setSampleFormRefPractitioner(''); setRefPractitionerQuery(e.target.value); setRefPractitionerOpen(true) }}
                              onFocus={() => setRefPractitionerOpen(true)}
                              placeholder="Search practitioner..."
                              className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                            />
                            {refPractitionerOpen && (refPractitionerQuery || refPractitionerOptions.length > 0) && (
                              <div className="absolute z-20 mt-1 w-full max-h-48 overflow-auto rounded-md bg-white border border-slate-200 shadow-lg">
                                {refPractitionerOptions.length === 0 ? (
                                  <div className="px-3 py-2 text-[11px] text-slate-500">Type to search…</div>
                                ) : refPractitionerOptions.map((opt) => (
                                  <button key={opt.name} type="button"
                                    onClick={() => { setSampleFormRefPractitioner(opt.name); setRefPractitionerQuery(opt.label || opt.name); setRefPractitionerOpen(false) }}
                                    className="w-full text-left px-3 py-1.5 text-[11px] hover:bg-slate-100">
                                    {opt.label || opt.name}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>

                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <label className="block text-xs font-semibold text-slate-700">Observation Sample Collection</label>
                            <button type="button"
                              onClick={() => setSampleObsRows((prev) => [...prev, { sample: row.sample, sample_qty: row.sample_qty, collection_date_time: new Date().toISOString().slice(0, 16).replace('T', ' ') }])}
                              className="text-xs text-primary font-medium hover:underline">+ Add Row</button>
                          </div>
                          {sampleObsRows.length === 0 ? (
                            <div className="text-xs text-slate-400 italic border border-dashed border-slate-200 rounded p-3 text-center">No observation rows. Click "+ Add Row" to add.</div>
                          ) : (
                            <div className="overflow-x-auto rounded-lg border border-slate-200">
                              <table className="w-full text-xs">
                                <thead className="bg-slate-50 border-b border-slate-200">
                                  <tr>
                                    <th className="px-2 py-2 text-left font-medium text-slate-500">Sample</th>
                                    <th className="px-2 py-2 text-left font-medium text-slate-500">Qty</th>
                                    <th className="px-2 py-2 text-left font-medium text-slate-500">Specimen</th>
                                    <th className="px-2 py-2 text-left font-medium text-slate-500">Collected By</th>
                                    <th className="px-2 py-2 text-left font-medium text-slate-500">Date Time</th>
                                    <th className="px-2 py-2 text-left font-medium text-slate-500">Status</th>
                                    <th className="px-2 py-2 w-8"></th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {sampleObsRows.map((obsRow, obsIdx) => (
                                    <tr key={obsIdx}>
                                      <td className="px-2 py-1.5">
                                        <input value={obsRow.sample || ''} onChange={(e) => setSampleObsRows((prev) => { const n=[...prev]; n[obsIdx]={...n[obsIdx],sample:e.target.value}; return n })}
                                          className="w-full border border-slate-300 rounded px-1.5 py-1 focus:ring-1 focus:ring-primary focus:outline-none" placeholder="Sample" />
                                      </td>
                                      <td className="px-2 py-1.5">
                                        <input type="number" step="any" value={obsRow.sample_qty ?? ''} onChange={(e) => setSampleObsRows((prev) => { const n=[...prev]; n[obsIdx]={...n[obsIdx],sample_qty:parseFloat(e.target.value)||0}; return n })}
                                          className="w-16 border border-slate-300 rounded px-1.5 py-1 focus:ring-1 focus:ring-primary focus:outline-none" />
                                      </td>
                                      <td className="px-2 py-1.5">
                                        <input value={obsRow.specimen || ''} onChange={(e) => setSampleObsRows((prev) => { const n=[...prev]; n[obsIdx]={...n[obsIdx],specimen:e.target.value}; return n })}
                                          className="w-full border border-slate-300 rounded px-1.5 py-1 focus:ring-1 focus:ring-primary focus:outline-none" placeholder="Specimen" />
                                      </td>
                                      <td className="px-2 py-1.5">
                                        <input value={obsRow.collected_by || ''} onChange={(e) => setSampleObsRows((prev) => { const n=[...prev]; n[obsIdx]={...n[obsIdx],collected_by:e.target.value}; return n })}
                                          className="w-full border border-slate-300 rounded px-1.5 py-1 focus:ring-1 focus:ring-primary focus:outline-none" placeholder="Collected by" />
                                      </td>
                                      <td className="px-2 py-1.5">
                                        <input type="datetime-local" value={(obsRow.collection_date_time || '').replace(' ','T').slice(0,16)} onChange={(e) => setSampleObsRows((prev) => { const n=[...prev]; n[obsIdx]={...n[obsIdx],collection_date_time:e.target.value.replace('T',' ')+':00'}; return n })}
                                          className="border border-slate-300 rounded px-1.5 py-1 focus:ring-1 focus:ring-primary focus:outline-none" />
                                      </td>
                                      <td className="px-2 py-1.5">
                                        <select value={obsRow.status || 'Open'} onChange={(e) => setSampleObsRows((prev) => { const n=[...prev]; n[obsIdx]={...n[obsIdx],status:e.target.value}; return n })}
                                          className="border border-slate-300 rounded px-1.5 py-1 bg-white focus:ring-1 focus:ring-primary focus:outline-none">
                                          <option value="Open">Open</option>
                                          <option value="Collected">Collected</option>
                                        </select>
                                      </td>
                                      <td className="px-2 py-1.5 text-right">
                                        <button type="button" onClick={() => setSampleObsRows((prev) => prev.filter((_,i)=>i!==obsIdx))} className="text-red-400 hover:text-red-600">✕</button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      </>
                    )
                  })()}
                </div>
                <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex justify-end gap-2">
                  <button type="button" disabled={sampleFormLoading}
                    onClick={() => { if (!sampleFormLoading) { setSampleFormRowIndex(null); setSampleFormError(null); setSampleFormCollectionPoint(''); setCollectionPointQuery(''); setCollectionPointOptions([]); setSampleFormRefPractitioner(''); setRefPractitionerQuery(''); setRefPractitionerOptions([]); setCollectionPointOpen(false); setRefPractitionerOpen(false); setSampleObsRows([]); setTemplateSampleDetails('') } }}
                    className="px-4 py-2 text-xs rounded-md border border-slate-300 text-slate-700 hover:bg-white disabled:opacity-50">
                    Cancel
                  </button>
                  <button type="button" disabled={sampleFormLoading || sampleFormRowIndex === null}
                    className="px-4 py-2 text-xs rounded-md bg-primary text-white hover:bg-primary/90 disabled:opacity-50 font-medium"
                    onClick={async () => {
                      if (!sampleModalLabTest || sampleFormRowIndex === null) return
                      const row = sampleModalLabTest.sample_instances?.[sampleFormRowIndex]
                      if (!row) { setSampleFormError('Missing sample row data'); return }
                      try {
                        setSampleFormLoading(true)
                        setSampleFormError(null)
                        const res = await createSampleCollectionForLabSample(
                          sampleModalLabTest.name, sampleFormRowIndex,
                          row.sample_details || '',
                          sampleFormCollectionPoint || undefined,
                          sampleFormRefPractitioner || undefined,
                          sampleObsRows.length ? sampleObsRows : undefined
                        )
                        toast.success(`Sample Collection ${res.sample_collection} created`)
                        setSampleModalLabTest((prev) => {
                          if (!prev) return prev
                          const next = { ...prev }
                          const arr = [...(next.sample_instances || [])]
                          arr[sampleFormRowIndex] = { ...(arr[sampleFormRowIndex] || {}), sample_collection: res.sample_collection }
                          next.sample_instances = arr
                          return next
                        })
                        setSampleFormRowIndex(null)
                        setSampleObsRows([])
                        setTemplateSampleDetails('')
                      } catch (e) {
                        setSampleFormError(e instanceof Error ? e.message : 'Failed to create Sample Collection')
                      } finally {
                        setSampleFormLoading(false)
                      }
                    }}>
                    {sampleFormLoading ? 'Creating…' : 'Create Sample Collection'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Add Remarks modal ── */}
      {remarksModalOpen && remarksLabTestName && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between flex-shrink-0">
              <h2 className="text-lg font-semibold text-slate-900">Doctor&apos;s Remarks — {remarksLabTestName}</h2>
              <button
                type="button"
                onClick={closeRemarksModal}
                disabled={remarksLoading}
                className="text-slate-400 hover:text-slate-600 disabled:opacity-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-1 space-y-4">
              {remarksError && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-md px-3 py-2">
                  {remarksError}
                </div>
              )}
              <p className="text-sm text-slate-500">Add one or more remarks. You can add another row for each new remark.</p>
              {remarksList.map((row, idx) => (
                <div key={idx} className="rounded-lg border border-slate-200 bg-slate-50/50 overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 bg-white">
                    <span className="text-xs font-medium text-slate-500">Remark #{idx + 1}</span>
                    <button
                      type="button"
                      onClick={() => removeRemarksRow(idx)}
                      className="p-1 rounded text-slate-400 hover:text-red-500 hover:bg-red-50"
                      title="Remove row"
                      disabled={remarksList.length <= 1}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="p-3">
                    <textarea
                      value={row.rrmark}
                      onChange={(e) => updateRemarksRow(idx, e.target.value)}
                      placeholder="Enter remark..."
                      rows={3}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      disabled={remarksLoading}
                    />
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={addRemarksRow}
                className="flex items-center gap-1.5 text-sm text-primary font-medium hover:underline"
              >
                <span>+</span> Add another remark
              </button>
            </div>
            <div className="p-4 border-t border-slate-200 flex justify-end gap-2 flex-shrink-0 bg-white">
              <button
                type="button"
                onClick={closeRemarksModal}
                disabled={remarksLoading}
                className="px-3 py-2 text-sm border border-slate-300 rounded-md hover:bg-slate-50 text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmitRemarks}
                disabled={remarksLoading}
                className="px-3 py-2 text-sm bg-primary text-white rounded-md hover:bg-primary/90 disabled:opacity-50"
              >
                {remarksLoading ? 'Saving…' : 'Save remarks'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Consumables dialog ── */}
      {requestingFor && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Request Consumables for {requestingFor}</h2>
              <button type="button" onClick={closeRequestDialog} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <div className="p-4 space-y-3">
              {dialogError && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-md px-3 py-2">{dialogError}</div>
              )}
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm border border-slate-200 rounded-md">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-slate-700">Item Code</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-700">Item Name</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-700">Qty</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-700">Warehouse</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {dialogItems.map((row, index) => (
                      <tr key={index} className="border-t border-slate-200">
                        <td className="px-3 py-2">
                          <div className="relative">
                            <input type="text" value={row.item_code}
                              onChange={(e) => { updateItem(index, 'item_code', e.target.value); setOpenItemIndex(index) }}
                              onFocus={() => setOpenItemIndex(index)}
                              className="w-full border border-slate-300 rounded px-2 py-1 text-sm" placeholder="Select item..." />
                            {openItemIndex === index && itemOptions.length > 0 && (
                              <div className="absolute z-10 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-48 overflow-y-auto">
                                {itemOptions
                                  .filter((opt) => (opt.label || opt.name).toLowerCase().includes((row.item_code || '').toLowerCase()))
                                  .slice(0, 20)
                                  .map((opt) => (
                                    <button key={opt.name} type="button" className="w-full text-left px-3 py-1 text-xs hover:bg-slate-100"
                                      onClick={() => { updateItem(index, 'item_code', opt.name); updateItem(index, 'item_name', opt.label || opt.name); setOpenItemIndex(null) }}>
                                      {opt.label || opt.name}
                                    </button>
                                  ))}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <input type="text" value={row.item_name || ''} onChange={(e) => updateItem(index, 'item_name', e.target.value)}
                            className="w-full border border-slate-300 rounded px-2 py-1 text-sm" placeholder="Item name" />
                        </td>
                        <td className="px-3 py-2">
                          <input type="number" min={0} step={0.01} value={row.qty}
                            onChange={(e) => updateItem(index, 'qty', e.target.value)}
                            className="w-full border border-slate-300 rounded px-2 py-1 text-sm" />
                        </td>
                        <td className="px-3 py-2">
                          <div className="relative">
                            <input type="text" value={row.warehouse || ''}
                              onChange={(e) => { updateItem(index, 'warehouse', e.target.value); setOpenWarehouseIndex(index) }}
                              onFocus={() => setOpenWarehouseIndex(index)}
                              className="w-full border border-slate-300 rounded px-2 py-1 text-sm" placeholder="Select warehouse..." />
                            {openWarehouseIndex === index && warehouseOptions.length > 0 && (
                              <div className="absolute z-10 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-48 overflow-y-auto">
                                {warehouseOptions
                                  .filter((opt) => (opt.label || opt.name).toLowerCase().includes((row.warehouse || '').toLowerCase()))
                                  .slice(0, 20)
                                  .map((opt) => (
                                    <button key={opt.name} type="button" className="w-full text-left px-3 py-1 text-xs hover:bg-slate-100"
                                      onClick={() => { updateItem(index, 'warehouse', opt.name); setOpenWarehouseIndex(null) }}>
                                      {opt.label || opt.name}
                                    </button>
                                  ))}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button type="button" onClick={() => removeRow(index)} className="text-xs text-red-600 hover:text-red-800">Remove</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-between items-center pt-2">
                <button type="button" onClick={addRow} className="px-3 py-1 text-xs border border-slate-300 rounded-md hover:bg-slate-50">+ Add Row</button>
                <div className="flex gap-2">
                  <button type="button" onClick={closeRequestDialog} disabled={dialogLoading}
                    className="px-3 py-1 text-xs border border-slate-300 rounded-md hover:bg-slate-50">Cancel</button>
                  <button type="button" onClick={submitRequest} disabled={dialogLoading}
                    className="px-3 py-1 text-xs bg-primary text-white rounded-md hover:bg-primary/90 disabled:opacity-50">
                    {dialogLoading ? 'Submitting...' : 'Create Material Request'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Results dialog ── */}
      {resultDialogOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between flex-shrink-0">
              <h2 className="text-lg font-semibold text-slate-900">
                Enter Results {activeLabTest?.name ? `for ${activeLabTest.name}` : ''}
              </h2>
              <button type="button" onClick={closeResultDialog} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <div className="flex border-b border-slate-200 px-4 flex-shrink-0">
              {(['results', 'documents'] as const).map((tab) => (
                <button key={tab} type="button" onClick={() => setResultDialogTab(tab)}
                  className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px ${resultDialogTab === tab ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                  {tab === 'documents' ? `Documents${resultDocuments.length > 0 ? ` (${resultDocuments.length})` : ''}` : 'Results'}
                </button>
              ))}
            </div>
            <div className="p-4 overflow-y-auto flex-1 min-h-0 space-y-4">
              {resultDialogError && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-md px-3 py-2">{resultDialogError}</div>
              )}
              {resultDialogLoading ? (
                <div className="text-sm text-slate-600">Loading...</div>
              ) : resultDialogTab === 'results' ? (
                <>
                  {normalTestItems.length > 0 && (
                    <div>
                      <label className="block text-sm font-semibold text-slate-800 mb-2">Test Results</label>
                      <div className="rounded-lg border border-slate-200 overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="bg-slate-50 border-b border-slate-200">
                            <tr>
                              <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-600">Test / Event</th>
                              <th className="px-3 py-2.5 text-center text-xs font-semibold text-slate-600 w-24">Min</th>
                              <th className="px-3 py-2.5 text-center text-xs font-semibold text-slate-600 w-24">Max</th>
                              <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-600 w-36">Result</th>
                              <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-600">Comment</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {normalTestItems.map((row, idx) => {
                              const result = parseFloat(row.result_value || '')
                              const min = templateDetails.min_range
                              const max = templateDetails.max_range
                              const outOfRange = row.result_value !== '' && row.result_value != null && !isNaN(result)
                                && min != null && max != null
                                ? (result < min || result > max)
                                : false
                              return (
                                <tr key={idx} className={outOfRange ? 'bg-red-50' : 'hover:bg-slate-50/50'}>
                                  <td className="px-3 py-3">
                                    <div className="text-sm font-medium text-slate-800">
                                      {row.lab_test_event || row.lab_test_name || '—'}
                                    </div>
                                    {row.lab_test_uom && (
                                      <div className="text-[11px] text-slate-400 mt-0.5">{row.lab_test_uom}</div>
                                    )}
                                  </td>
                                  <td className="px-3 py-3 text-center">
                                    <span className={`text-sm font-medium ${min != null ? 'text-slate-700' : 'text-slate-300'}`}>
                                      {min != null ? min : '—'}
                                    </span>
                                  </td>
                                  <td className="px-3 py-3 text-center">
                                    <span className={`text-sm font-medium ${max != null ? 'text-slate-700' : 'text-slate-300'}`}>
                                      {max != null ? max : '—'}
                                    </span>
                                  </td>
                                  <td className="px-3 py-3">
                                    <input
                                      type="number"
                                      step="any"
                                      value={row.result_value ?? ''}
                                      onChange={(e) => {
                                        const v = e.target.value
                                        setNormalTestItems((prev) => {
                                          const next = [...prev]
                                          next[idx] = { ...next[idx], result_value: v }
                                          return next
                                        })
                                      }}
                                      className={`w-full border rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary ${
                                        outOfRange
                                          ? 'border-red-400 bg-red-50 text-red-700 focus:ring-red-300'
                                          : 'border-slate-300'
                                      }`}
                                      placeholder="0.00"
                                    />
                                    {outOfRange && (
                                      <div className="text-[10px] text-red-600 mt-0.5 font-medium">⚠ Out of range</div>
                                    )}
                                  </td>
                                  <td className="px-3 py-3">
                                    <input
                                      type="text"
                                      value={row.lab_test_comment || ''}
                                      onChange={(e) => {
                                        const v = e.target.value
                                        setNormalTestItems((prev) => {
                                          const next = [...prev]
                                          next[idx] = { ...next[idx], lab_test_comment: v }
                                          return next
                                        })
                                      }}
                                      className="w-full border border-slate-300 rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                                      placeholder="Add comment..."
                                    />
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Result</label>
                    <textarea className="w-full border border-slate-300 rounded-md p-2 text-sm min-h-[80px]"
                      value={customResult} onChange={(e) => setCustomResult(e.target.value)}
                      placeholder="Enter descriptive or custom result..." />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">General Comments</label>
                    <textarea className="w-full border border-slate-300 rounded-md p-2 text-sm min-h-[70px]"
                      value={labComment} onChange={(e) => setLabComment(e.target.value)}
                      placeholder="Overall test comments..." />
                  </div>

                  {(worksheetText || templateDetails.worksheet_instructions) && (
                    <div className="rounded-md border border-amber-200 bg-amber-50">
                      <button
                        type="button"
                        className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100 transition-colors"
                        onClick={() => setWorksheetExpanded((v) => !v)}
                      >
                        <span>📋 Worksheet Instructions</span>
                        <span className="text-xs text-amber-600">{worksheetExpanded ? '▲ Hide' : '▼ Show'}</span>
                      </button>
                      {worksheetExpanded && (
                        <div className="px-3 pb-3">
                          <textarea
                            className="w-full border border-amber-300 rounded-md p-2 text-sm bg-white min-h-[80px]"
                            value={worksheetText}
                            onChange={(e) => setWorksheetText(e.target.value)}
                            placeholder="Worksheet instructions..."
                          />
                        </div>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div className="space-y-4">
                  <p className="text-sm text-slate-500">Attach lab documents (reports, scans). Same document table as Admission, Discharge, Patient.</p>
                  {resultDocuments.length === 0 && (
                    <div className="text-center py-6 rounded-lg border-2 border-dashed border-slate-200 text-slate-400 text-sm">No documents. Click below to add one.</div>
                  )}
                  {resultDocuments.map((row, idx) => (
                    <div key={idx} className="rounded-lg border border-slate-200 bg-slate-50/50 p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-0.5">File Name</label>
                        <input value={row.file_name || ''} onChange={(e) => updateResultDocumentRow(idx, 'file_name', e.target.value)} placeholder="File name" className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-0.5">Document Type</label>
                        <select value={row.document_type || ''} onChange={(e) => updateResultDocumentRow(idx, 'document_type', e.target.value)} className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm bg-white">
                          <option value="">Select type</option>
                          {resultDocumentTypes.map((dt) => <option key={dt.name} value={dt.name}>{dt.document_name || dt.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-0.5">Transaction No</label>
                        <input value={row.transaction_no || ''} onChange={(e) => updateResultDocumentRow(idx, 'transaction_no', e.target.value)} placeholder="Optional" className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-0.5">Upload Remarks</label>
                        <input value={row.upload_remarks || ''} onChange={(e) => updateResultDocumentRow(idx, 'upload_remarks', e.target.value)} placeholder="Optional" className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-medium text-slate-600 mb-0.5">File</label>
                        <input type="file" disabled={resultDocumentUploading === idx} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleResultDocumentFile(idx, f); e.target.value = '' }} className="w-full text-sm file:mr-2 file:rounded file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-white file:text-sm" />
                        {resultDocumentUploading === idx && <span className="text-xs text-slate-500">Uploading...</span>}
                        {row.document && resultDocumentUploading !== idx && <span className="text-xs text-green-600 block">✓ File attached</span>}
                      </div>
                    </div>
                  ))}
                  <button type="button" onClick={addResultDocumentRow} className="flex items-center gap-1.5 text-sm text-primary font-medium hover:underline">
                    <span>+</span> Add document
                  </button>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 p-4 border-t border-slate-200 flex-shrink-0 bg-white">
              <button type="button" onClick={closeResultDialog} disabled={resultDialogLoading} className="px-3 py-1 text-sm border border-slate-300 rounded-md hover:bg-slate-50">Cancel</button>
              <button type="button" onClick={handleSubmitLabTestWithResults} disabled={resultDialogLoading} className="px-3 py-1 text-sm bg-primary text-white rounded-md hover:bg-primary/90 disabled:opacity-50">Save &amp; Submit</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Lab Test modal ── */}
      {editLabTestName && (
        <EditLabTestModal
          labTestName={editLabTestName}
          onClose={() => setEditLabTestName(null)}
          onSuccess={() => {
            setEditLabTestName(null)
            refetch()
          }}
        />
      )}
    </div>
  )
}
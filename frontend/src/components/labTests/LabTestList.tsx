import { useState, useEffect, useRef } from 'react'
import { useLabTests } from '../../hooks/useLabTests'
import { StatusPill } from '../ui/StatusPill'
import {
  getLabTestConsumables,
  requestLabConsumables,
  fetchLabTest,
  saveAndSubmitLabTest,
  updateLabTestStatus,
  updateLabTestRemarks,
  type LabConsumableRow,
  type LabTest,
} from '../../services/labTests'
import { fetchItems, fetchWarehouses, fetchDocumentTypes, type LinkFieldOption } from '../../services/common'
import { uploadPatientFile, type PatientDocumentRow } from '../../services/patients'
import { searchPatients, fetchPatients, type PatientListItem } from '../../services/patients'
import { LabTestDetails } from './LabTestDetails'
import { EditLabTestModal } from './EditLabTestModal'
import { PrintFormatDropdown } from '../ui/PrintFormatDropdown'
import { toast } from '../../hooks/useToast'
import { Search, X, ChevronDown } from 'lucide-react'

// ─── Constants ─────────────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  'Draft',
  'Requested',
  'Completed',
  'Pending Review',
  'Approved',
  'Rejected',
  'Cancelled',
] as const

const statusColors: Record<string, string> = {
  'Approved': 'success',
  'Rejected': 'danger',
  'Completed': 'success',
  'Pending Review': 'warning',
  'Submitted': 'info',
  'Cancelled': 'default',
  'Draft': 'warning',
  'Pending': 'warning',
  'Requested': 'info',
}

// ─── Types ──────────────────────────────────────────────────────────────────

interface Filters {
  patientId: string       // the actual patient ID used for fetching
  patientLabel: string    // display label shown in input
  status: string
  fromDate: string
  toDate: string
}

// ─── Filter Bar ─────────────────────────────────────────────────────────────

interface FilterBarProps {
  filters: Filters
  onChange: (f: Filters) => void
  onClear: () => void
  activeCount: number
  patientScoped: boolean
  patientOptions: PatientListItem[]
  patientOpen: boolean
  patientQuery: string
  onPatientQueryChange: (q: string) => void
  onPatientSelect: (p: PatientListItem) => void
  onPatientClear: () => void
  onPatientFocus: () => void
  patientFilterRef: React.RefObject<HTMLDivElement | null>
}

const FilterBar = ({
  filters,
  onChange,
  onClear,
  activeCount,
  patientScoped,
  patientOptions,
  patientOpen,
  patientQuery,
  onPatientQueryChange,
  onPatientSelect,
  onPatientClear,
  onPatientFocus,
  patientFilterRef,
}: FilterBarProps) => {
  const set = (key: keyof Filters, value: string) =>
    onChange({ ...filters, [key]: value })

  return (
    <div className="flex flex-wrap items-end gap-3 px-4 py-3 bg-white border-b border-slate-200">
      {/* Patient filter — hidden when component is scoped to a patient */}
      {!patientScoped && (
        <div ref={patientFilterRef} className="flex flex-col gap-1 min-w-[200px] flex-1 relative">
          <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Patient</label>
          <div className="relative">
            <input
              type="text"
              value={filters.patientId ? filters.patientLabel : patientQuery}
              onChange={(e) => {
                onPatientQueryChange(e.target.value)
              }}
              onFocus={onPatientFocus}
              placeholder="Search patient..."
              className="w-full pl-3 pr-8 py-1.5 text-sm rounded-md border border-slate-300 focus:outline-none focus:ring-2 focus:ring-primary"
            />
            {filters.patientId && (
              <button
                type="button"
                onClick={onPatientClear}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                title="Clear patient"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          {patientOpen && patientOptions.length > 0 && (
            <div className="absolute z-20 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-60 overflow-y-auto top-full">
              {patientOptions.map((p) => (
                <button
                  key={p.name}
                  type="button"
                  onClick={() => onPatientSelect(p)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 focus:bg-slate-100 focus:outline-none"
                >
                  <div className="font-medium text-slate-800">{p.patient_name || p.name}</div>
                  <div className="text-xs text-slate-500 flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                    {p.file_number && <span>File: {p.file_number}</span>}
                    {p.id_number && <span>ID: {p.id_number}</span>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

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
  patientId: '',
  patientLabel: '',
  status: '',
  fromDate: '',
  toDate: '',
})

// ─── Main Component ──────────────────────────────────────────────────────────

export const LabTestList = ({
  patient,
  isOutsourced,
  defaultStatus,
}: {
  patient?: string
  isOutsourced?: boolean
  defaultStatus?: string
}) => {
  // Single source of truth for all filters (including patient)
  const [filters, setFilters] = useState<Filters>(() => ({
    ...makeEmptyFilters(),
    status: defaultStatus ?? '',
  }))

  // Patient dropdown UI state (separate from committed filter values)
  const [patientQuery, setPatientQuery] = useState('')
  const [patientOptions, setPatientOptions] = useState<PatientListItem[]>([])
  const [patientOpen, setPatientOpen] = useState(false)
  const patientFilterRef = useRef<HTMLDivElement>(null)

  // Close patient dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (patientFilterRef.current && !patientFilterRef.current.contains(e.target as Node)) {
        setPatientOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Fetch patient options whenever dropdown opens or query changes
  useEffect(() => {
    if (!patientOpen) return
    const t = setTimeout(async () => {
      try {
        const results = patientQuery.trim() === ''
          ? await fetchPatients(20, 0)
          : await searchPatients(patientQuery, 20)
        setPatientOptions(results)
      } catch {
        setPatientOptions([])
      }
    }, patientQuery.trim() === '' ? 0 : 300)
    return () => clearTimeout(t)
  }, [patientQuery, patientOpen])

  const handlePatientQueryChange = (q: string) => {
    setPatientQuery(q)
    // If user starts typing after a patient was selected, clear the committed patient
    if (filters.patientId) {
      setFilters((prev) => ({ ...prev, patientId: '', patientLabel: '' }))
    }
    setPatientOpen(true)
  }

  const handlePatientSelect = (p: PatientListItem) => {
    const label = p.patient_name || p.name
    setFilters((prev) => ({ ...prev, patientId: p.name, patientLabel: label }))
    setPatientQuery('')
    setPatientOpen(false)
  }

  const handlePatientClear = () => {
    setFilters((prev) => ({ ...prev, patientId: '', patientLabel: '' }))
    setPatientQuery('')
  }

  // Clear ALL filters (always reset to truly empty — ignores defaultStatus intentionally)
  const handleClear = () => {
    setFilters(makeEmptyFilters())
    setPatientQuery('')
    setPatientOpen(false)
  }

  // Active filter count (excludes patient if component is scoped to one)
  const activeCount = (
    patient
      ? [filters.status, filters.fromDate, filters.toDate]
      : [filters.patientId, filters.status, filters.fromDate, filters.toDate]
  ).filter(Boolean).length

  // Effective patient: prop takes priority over filter
  const effectivePatient = patient || filters.patientId || undefined

  const { labTests, loading, error, refetch } = useLabTests(
    effectivePatient,
    filters.status || undefined,
    filters.status === 'Pending Review',
    isOutsourced
  )

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

  // ── Review actions ───────────────────────────────────────────────────────

  const [openActionRow, setOpenActionRow] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [selectedLabTestForDetails, setSelectedLabTestForDetails] = useState<string | null>(null)
  const [editLabTestName, setEditLabTestName] = useState<string | null>(null)
  const actionMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (actionMenuRef.current && !actionMenuRef.current.contains(e.target as Node)) {
        setOpenActionRow(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleStatusChange = async (name: string, newStatus: 'Approved' | 'Rejected') => {
    setOpenActionRow(null)
    setActionLoading(name)
    try {
      await updateLabTestStatus(name, newStatus)
      toast.success(`Lab test ${newStatus.toLowerCase()}`)
      refetch()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : `Failed to ${newStatus.toLowerCase()} lab test`)
    } finally {
      setActionLoading(null)
    }
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

  const openRequestDialog = async (labTestName: string) => {
    try {
      setDialogError(null)
      setDialogLoading(true)
      setRequestingFor(labTestName)
      if (!itemOptions.length) fetchItems().then(setItemOptions).catch(() => setItemOptions([]))
      if (!warehouseOptions.length) fetchWarehouses().then(setWarehouseOptions).catch(() => setWarehouseOptions([]))
      const items = await getLabTestConsumables(labTestName)
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
      setActiveLabTest({ name: labTestName, patient: '' })
      const [doc, docTypes] = await Promise.all([fetchLabTest(labTestName), fetchDocumentTypes()])
      setActiveLabTest(doc)
      setCustomResult(doc.custom_result || '')
      setLabComment(doc.lab_test_comment || '')
      setWorksheetText(doc.worksheet_instructions || '')
      setResultDocumentTypes(docTypes)
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

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col min-w-full">
      <FilterBar
        filters={filters}
        onChange={setFilters}
        onClear={handleClear}
        activeCount={activeCount}
        patientScoped={!!patient}
        patientOptions={patientOptions}
        patientOpen={patientOpen}
        patientQuery={patientQuery}
        onPatientQueryChange={handlePatientQueryChange}
        onPatientSelect={handlePatientSelect}
        onPatientClear={handlePatientClear}
        onPatientFocus={() => setPatientOpen(true)}
        patientFilterRef={patientFilterRef}
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
          <table className="w-full min-w-[900px]">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Lab Test ID</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Patient</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Test Name</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Practitioner</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Date</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Actions</th>
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
                  <td className="px-4 py-3 text-sm text-slate-700">
                    {labTest.result_date
                      ? new Date(labTest.result_date).toLocaleDateString()
                      : labTest.submitted_date
                      ? new Date(labTest.submitted_date).toLocaleDateString()
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
                        {openActionRow === labTest.name && (
                          <div className="absolute right-0 top-full mt-1 z-10 min-w-[160px] rounded-md border border-slate-200 bg-white py-1 shadow-lg">
                            <button
                              type="button"
                              onClick={() => { setOpenActionRow(null); setSelectedLabTestForDetails(labTest.name) }}
                              className="flex items-center gap-2 w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                            >
                              View Details
                            </button>
                            {labTest.docstatus === 0 && (
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenActionRow(null)
                                  openResultDialog(labTest.name)
                                }}
                                className="flex items-center gap-2 w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                              >
                                Enter Results &amp; Submit
                              </button>
                            )}
                            {labTest.docstatus === 0 && (
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenActionRow(null)
                                  setEditLabTestName(labTest.name)
                                }}
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
                                  onClick={() => handleStatusChange(labTest.name, 'Approved')}
                                  className="block w-full text-left px-3 py-2 text-sm text-green-700 font-medium hover:bg-green-50"
                                >
                                  ✓ Approve
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
                          </div>
                        )}
                      </div>
                      <PrintFormatDropdown
                        doctype="Lab Test"
                        docName={labTest.name}
                        noLetterhead={0}
                        triggerPrint={1}
                      />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">
                    {labTest.docstatus === 0 && !labTest.material_request ? (
                      <button
                        type="button"
                        onClick={() => openRequestDialog(labTest.name)}
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

      {/* ── Add Remarks modal (table: multiple remarks) ── */}
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
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col">
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
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Custom Result</label>
                    <textarea className="w-full border border-slate-300 rounded-md p-2 text-sm min-h-[90px]"
                      value={customResult} onChange={(e) => setCustomResult(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Comments</label>
                    <textarea className="w-full border border-slate-300 rounded-md p-2 text-sm min-h-[90px]"
                      value={labComment} onChange={(e) => setLabComment(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Worksheet Instructions</label>
                    <textarea className="w-full border border-slate-300 rounded-md p-2 text-sm min-h-[90px]"
                      value={worksheetText} onChange={(e) => setWorksheetText(e.target.value)} />
                  </div>
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

      {/* ── Edit Lab Test modal (basic fields) ── */}
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
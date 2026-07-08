import { useState, useEffect, useCallback, useRef } from 'react'
import {
  CM_BTN_CANCEL,
  CM_BTN_PRIMARY,
  CREATE_MODAL_OVERLAY,
  CREATE_MODAL_OVERLAY_STACK,
  createModalShellClass,
} from '../ui/CreateModalChrome'
import { apiRequest } from '../../services/apiClient'
import {
  fetchMedicalDepartments,
  fetchNursingChecklistTemplates,
  fetchItems,
  fetchLabTestTemplates,
  fetchUoms,
  fetchItemGroups,
  fetchLabTestSamples,
  type LinkFieldOption,
} from '../../services/common'
import { CreateLabTestSampleModal } from './CreateLabTestSampleModal'
import { Plus, Trash2, ChevronUp, ChevronDown } from 'lucide-react'

/* ─── Types ─────────────────────────────────────────────── */

interface PricingRow {
  patient_category: string
  price: string
}

interface GroupTemplateRow {
  template_or_new_line: 'Add Test' | 'Add New Line'
  lab_test_template: string
  lab_test_description: string
  group_event: string
  group_test_uom: string
  secondary_uom: string
  conversion_factor: string
  allow_blank: boolean
}

interface NormalTestRow {
  lab_test_event: string
  lab_test_uom: string
  normal_range: string
  secondary_uom: string
  conversion_factor: string
  allow_blank: boolean
}

interface DescriptiveRow {
  particulars: string
  allow_blank: boolean
}

interface SampleReqRow {
  sample: string        // link value
  sample_display: string // display label
  sample_qty: string
  sample_details: string
}

interface CreateLabTestTemplateModalProps {
  onClose: () => void
  onSuccess?: (created: { name: string; lab_test_name: string; department?: string }) => void
  templateName?: string
}

const PATIENT_CATEGORIES = ['', 'Royal', 'American Navy', 'Regular']
const RESULT_FORMATS = ['Single', 'Compound', 'Descriptive', 'Grouped', 'Imaging', 'No Result']
const TABS = ['Basic Info', 'Billing', 'Sample Collection', 'Advanced'] as const
type TabName = typeof TABS[number]

/* ─── Simple link combobox ───────────────────────────────── */
interface ComboboxProps {
  label: string
  required?: boolean
  displayValue: string
  placeholder?: string
  options: LinkFieldOption[]
  onFocus: () => void
  onSearch: (q: string) => void
  onSelect: (opt: LinkFieldOption) => void
  onClear?: () => void
  open: boolean
  setOpen: (v: boolean) => void
  showCreate?: boolean
  onCreateClick?: () => void
}
function LinkCombobox({
  label, required, displayValue, placeholder, options,
  onFocus, onSearch, onSelect, onClear, open, setOpen,
  showCreate, onCreateClick,
}: ComboboxProps) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <div className="relative">
        <input
          type="text"
          value={displayValue}
          onChange={e => { onSearch(e.target.value); setOpen(true) }}
          onFocus={() => { setOpen(true); onFocus() }}
          placeholder={placeholder ?? `Search ${label}…`}
          className="w-full rounded border border-slate-300 pr-8 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
        {displayValue && onClear ? (
          <button type="button" onClick={onClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs">✕</button>
        ) : (!displayValue && showCreate && onCreateClick) ? (
          <button type="button" onClick={onCreateClick}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-white border border-primary/40 text-primary flex items-center justify-center text-sm leading-none hover:bg-primary/5"
            title={`Create ${label}`}>+</button>
        ) : null}
        {open && options.length > 0 && (
          <div className="absolute z-20 w-full mt-1 bg-white border border-slate-300 rounded shadow-lg max-h-48 overflow-y-auto">
            {options.map(o => (
              <button key={o.name} type="button"
                onClick={() => { onSelect(o); setOpen(false) }}
                className="w-full text-left px-3 py-1.5 text-sm hover:bg-slate-100">{o.label}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/* ─── Self-contained UOM link field with + button inside ─── */
function UomCombobox({
  label, value, onChange, onCreateClick,
}: { label: string; value: string; onChange: (v: string) => void; onCreateClick: () => void }) {
  const [query, setQuery] = useState(value)
  const [options, setOptions] = useState<LinkFieldOption[]>([])
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => {
      fetchUoms(query || undefined).then(setOptions).catch(() => setOptions([]))
    }, query ? 250 : 0)
    return () => clearTimeout(t)
  }, [query, open])

  const select = (opt: LinkFieldOption) => {
    setQuery(opt.label)
    onChange(opt.name)
    setOpen(false)
  }

  const clear = () => {
    setQuery('')
    onChange('')
    setOpen(false)
  }

  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      <div className="relative" ref={ref}>
        <input
          type="text"
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); if (value) onChange('') }}
          onFocus={() => setOpen(true)}
          placeholder={`Search ${label}…`}
          className="w-full rounded border border-slate-300 pr-8 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
        {query ? (
          <button type="button" onClick={clear}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs">✕</button>
        ) : (
          <button type="button" onClick={onCreateClick}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-white border border-primary/40 text-primary flex items-center justify-center text-sm leading-none hover:bg-primary/5"
            title="Create UOM">+</button>
        )}
        {open && options.length > 0 && (
          <div className="absolute z-20 w-full mt-1 bg-white border border-slate-300 rounded shadow-lg max-h-48 overflow-y-auto">
            {options.map(o => (
              <button key={o.name} type="button"
                onMouseDown={e => { e.preventDefault(); select(o) }}
                className="w-full text-left px-3 py-1.5 text-sm hover:bg-slate-100">{o.label}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/* ─── Inline row combobox for tables ────────────────────── */
interface RowComboboxProps {
  value: string
  placeholder?: string
  options: LinkFieldOption[]
  open: boolean
  onFocus: () => void
  onChange: (q: string) => void
  onSelect: (opt: LinkFieldOption) => void
  onBlurClose: () => void
  className?: string
}
function RowCombobox({ value, placeholder, options, open, onFocus, onChange, onSelect, onBlurClose, className }: RowComboboxProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  return (
    <div className="relative" ref={wrapRef}
      onBlur={e => { if (!wrapRef.current?.contains(e.relatedTarget as Node)) onBlurClose() }}>
      <input
        type="text" value={value} placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        onFocus={onFocus}
        className={`rounded border border-slate-300 px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary ${className ?? 'w-40'}`}
      />
      {open && options.length > 0 && (
        <div className="absolute z-30 left-0 mt-0.5 bg-white border border-slate-300 rounded shadow-lg max-h-40 overflow-y-auto min-w-[160px]">
          {options.map(o => (
            <button key={o.name} type="button" onMouseDown={e => e.preventDefault()}
              onClick={() => { onSelect(o); onBlurClose() }}
              className="w-full text-left px-2 py-1 text-xs hover:bg-slate-100">{o.label}</button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ─── Main Modal ─────────────────────────────────────────── */
export const CreateLabTestTemplateModal = ({
  onClose, onSuccess, templateName,
}: CreateLabTestTemplateModalProps) => {

  const isEdit = !!templateName
  const [activeTab, setActiveTab] = useState<TabName>('Basic Info')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /* ── Basic Info ── */
  const [labTestName, setLabTestName] = useState('')
  const [isGroup, setIsGroup] = useState(false)
  const [disabled, setDisabled] = useState(false)

  const [deptOpts, setDeptOpts] = useState<LinkFieldOption[]>([])
  const [deptOpen, setDeptOpen] = useState(false)
  const [deptQuery, setDeptQuery] = useState('')
  const [selectedDept, setSelectedDept] = useState<LinkFieldOption | null>(null)

  const [nurseOpts, setNurseOpts] = useState<LinkFieldOption[]>([])
  const [nurseOpen, setNurseOpen] = useState(false)
  const [nurseQuery, setNurseQuery] = useState('')
  const [selectedNurse, setSelectedNurse] = useState<LinkFieldOption | null>(null)

  /* ── Result Format ── */
  const [resultFormat, setResultFormat] = useState('Single')
  const [labTestUom, setLabTestUom] = useState('')
  const [secondaryUom, setSecondaryUom] = useState('')
  const [conversionFactor, setConversionFactor] = useState('')
  const [minRange, setMinRange] = useState('')
  const [maxRange, setMaxRange] = useState('')
  const [normalRange, setNormalRange] = useState('')
  const [sensitivity, setSensitivity] = useState(false)
  const [labTestDescription, setLabTestDescription] = useState('')
  const [descriptiveResult, setDescriptiveResult] = useState('')

  const [groupRows, setGroupRows] = useState<GroupTemplateRow[]>([])
  const [normalRows, setNormalRows] = useState<NormalTestRow[]>([])
  const [descriptiveRows, setDescriptiveRows] = useState<DescriptiveRow[]>([])

  // Per-row combobox state for Group Tests template search
  const [openGroupRowIdx, setOpenGroupRowIdx] = useState<number | null>(null)
  const [groupRowOpts, setGroupRowOpts] = useState<LinkFieldOption[]>([])

  // Shared UOM combobox — used by top-level UOM fields and all table-row UOM cells
  // openUomCellKey: null | "g-{i}-uom" | "c-{i}-uom" | "c-{i}-suom"  (table rows only)
  const [uomSharedOpts, setUomSharedOpts] = useState<LinkFieldOption[]>([])
  const [openUomCellKey, setOpenUomCellKey] = useState<string | null>(null)
  // Create UOM mini-modal
  const [showCreateUom, setShowCreateUom] = useState(false)
  const [createUomTarget, setCreateUomTarget] = useState<'main-uom' | 'main-suom' | null>(null)
  const [newUomName, setNewUomName] = useState('')
  const [creatingUom, setCreatingUom] = useState(false)

  // Create Item Group mini-modal
  const [showCreateItemGroup, setShowCreateItemGroup] = useState(false)
  const [newItemGroupName, setNewItemGroupName] = useState('')
  const [creatingItemGroup, setCreatingItemGroup] = useState(false)

  // Create Lab Test Sample modal
  const [showCreateSampleModal, setShowCreateSampleModal] = useState(false)
  const [createSampleForRowIdx, setCreateSampleForRowIdx] = useState<number | null>(null)

  /* ── Billing ── */
  const [linkExistingItem, setLinkExistingItem] = useState(false)
  const [labTestCode, setLabTestCode] = useState('')

  const [itemGroupOpts, setItemGroupOpts] = useState<LinkFieldOption[]>([])
  const [itemGroupOpen, setItemGroupOpen] = useState(false)
  const [itemGroupQuery, setItemGroupQuery] = useState('')
  const [selectedItemGroup, setSelectedItemGroup] = useState<LinkFieldOption | null>(null)

  const [itemOpts, setItemOpts] = useState<LinkFieldOption[]>([])
  const [itemOpen, setItemOpen] = useState(false)
  const [itemQuery, setItemQuery] = useState('')
  const [selectedItem, setSelectedItem] = useState<LinkFieldOption | null>(null)

  const [isBillable, setIsBillable] = useState(true)
  const [pricingRows, setPricingRows] = useState<PricingRow[]>([])

  /* ── Worksheet ── */
  const [worksheetInstructions, setWorksheetInstructions] = useState('')
  const [legendPosition, setLegendPosition] = useState('Bottom')
  const [resultLegend, setResultLegend] = useState('')

  /* ── Sample Collection (child table) ── */
  const [sampleReqRows, setSampleReqRows] = useState<SampleReqRow[]>([])
  const [expandedSampleRow, setExpandedSampleRow] = useState<number | null>(null)
  const [openSampleRowIdx, setOpenSampleRowIdx] = useState<number | null>(null)
  const [sampleRowOpts, setSampleRowOpts] = useState<LinkFieldOption[]>([])

  /* ─── Load existing template ─────────────── */  useEffect(() => {
    if (!isEdit) return
    setLoading(true)
    apiRequest<Record<string, unknown>>(`/api/resource/Lab%20Test%20Template/${encodeURIComponent(templateName)}`)
      .then(doc => {
        setLabTestName((doc.lab_test_name as string) || '')
        setIsGroup(!!doc.is_group)
        setDisabled(!!doc.disabled)
        if (doc.department) {
          setSelectedDept({ name: doc.department as string, label: doc.department as string })
          setDeptQuery(doc.department as string)
        }
        if (doc.nursing_checklist_template) {
          setSelectedNurse({ name: doc.nursing_checklist_template as string, label: doc.nursing_checklist_template as string })
          setNurseQuery(doc.nursing_checklist_template as string)
        }
        setResultFormat((doc.lab_test_template_type as string) || 'Single')
        const uomVal = (doc.lab_test_uom as string) || ''
        const secUomVal = (doc.secondary_uom as string) || ''
        setLabTestUom(uomVal)
        setSecondaryUom(secUomVal)
        setConversionFactor(doc.conversion_factor ? String(doc.conversion_factor) : '')
        setMinRange(doc.min_range ? String(doc.min_range) : '')
        setMaxRange(doc.max_range ? String(doc.max_range) : '')
        setNormalRange((doc.lab_test_normal_range as string) || '')
        setSensitivity(!!doc.sensitivity)
        setLabTestDescription((doc.lab_test_description as string) || '')
        setDescriptiveResult((doc.descriptive_result as string) || '')
        setLinkExistingItem(!!doc.link_existing_item)
        setLabTestCode((doc.lab_test_code as string) || '')
        if (doc.lab_test_group) {
          setSelectedItemGroup({ name: doc.lab_test_group as string, label: doc.lab_test_group as string })
          setItemGroupQuery(doc.lab_test_group as string)
        }
        if (doc.item) {
          setSelectedItem({ name: doc.item as string, label: doc.item as string })
          setItemQuery(doc.item as string)
        }
        setIsBillable(doc.is_billable !== 0)
        setWorksheetInstructions((doc.worksheet_instructions as string) || '')
        setLegendPosition((doc.legend_print_position as string) || 'Bottom')
        setResultLegend((doc.result_legend as string) || '')

        // child tables
        if (Array.isArray(doc.pricing)) {
          setPricingRows((doc.pricing as Record<string,unknown>[]).map(r => ({
            patient_category: (r.patient_category as string) || '',
            price: r.price ? String(r.price) : '',
          })))
        }
        if (Array.isArray(doc.lab_test_groups)) {
          setGroupRows((doc.lab_test_groups as Record<string,unknown>[]).map(r => ({
            template_or_new_line: (r.template_or_new_line as 'Add Test' | 'Add New Line') || 'Add Test',
            lab_test_template: (r.lab_test_template as string) || '',
            lab_test_description: (r.lab_test_description as string) || '',
            group_event: (r.group_event as string) || '',
            group_test_uom: (r.group_test_uom as string) || '',
            secondary_uom: (r.secondary_uom as string) || '',
            conversion_factor: r.conversion_factor ? String(r.conversion_factor) : '',
            allow_blank: !!r.allow_blank,
          })))
        }
        if (Array.isArray(doc.normal_test_templates)) {
          setNormalRows((doc.normal_test_templates as Record<string,unknown>[]).map(r => ({
            lab_test_event: (r.lab_test_event as string) || '',
            lab_test_uom: (r.lab_test_uom as string) || '',
            normal_range: (r.normal_range as string) || '',
            secondary_uom: (r.secondary_uom as string) || '',
            conversion_factor: r.conversion_factor ? String(r.conversion_factor) : '',
            allow_blank: !!r.allow_blank,
          })))
        }
        if (Array.isArray(doc.descriptive_test_templates)) {
          setDescriptiveRows((doc.descriptive_test_templates as Record<string,unknown>[]).map(r => ({
            particulars: (r.particulars as string) || '',
            allow_blank: !!r.allow_blank,
          })))
        }
        if (Array.isArray(doc.sample_requirements)) {
          setSampleReqRows((doc.sample_requirements as Record<string,unknown>[]).map(r => ({
            sample: (r.sample as string) || '',
            sample_display: (r.sample as string) || '',
            sample_qty: r.sample_qty ? String(r.sample_qty) : '',
            sample_details: (r.sample_details as string) || '',
          })))
        }
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load template'))
      .finally(() => setLoading(false))
  }, [isEdit, templateName])

  /* ─── Link search helpers ─────────────────── */
  const loadDepts = useCallback((q?: string) =>
    fetchMedicalDepartments(q).then(setDeptOpts).catch(() => setDeptOpts([])), [])
  const loadNurse = useCallback((q?: string) =>
    fetchNursingChecklistTemplates(q).then(setNurseOpts).catch(() => setNurseOpts([])), [])
  const loadItems = useCallback((q?: string) =>
    fetchItems(q).then(setItemOpts).catch(() => setItemOpts([])), [])

  const loadItemGroups = useCallback(async (q?: string) => {
    fetchItemGroups(q).then(setItemGroupOpts).catch(() => setItemGroupOpts([]))
  }, [])

  const loadGroupRowTemplates = useCallback(async (q?: string) => {
    try {
      const results = await fetchLabTestTemplates(q)
      setGroupRowOpts(results.map(r => ({ name: r.name, label: r.label || r.name })))
    } catch { setGroupRowOpts([]) }
  }, [])

  const loadUoms = useCallback(async (q?: string) => {
    try {
      const params = new URLSearchParams()
      params.set('cmd', 'healthcare.healthcare.api.common.get_uoms')
      if (q) params.set('search', q)
      const res = await fetch(`/api/method/healthcare.api.common.get_uoms?${params.toString()}`, { credentials: 'include' })
      if (!res.ok) { setUomSharedOpts([]); return }
      const data = await res.json()
      setUomSharedOpts(data.message ?? [])
    } catch { setUomSharedOpts([]) }
  }, [])

  // Preload UOMs on mount so dropdown is ready instantly on first focus
  useEffect(() => { loadUoms() }, [loadUoms])

  const handleCreateUom = async () => {
    const name = newUomName.trim()
    if (!name) return
    setCreatingUom(true)
    try {
      const params = new URLSearchParams()
      params.set('uom_name', name)
      const res = await fetch(`/api/method/healthcare.api.common.create_uom?${params.toString()}`, { credentials: 'include' })
      const data = await res.json()
      if (!res.ok) {
        alert(data.message || 'Failed to create UOM')
        return
      }
      const created: LinkFieldOption = data.message
      setUomSharedOpts(prev => [created, ...prev.filter(o => o.name !== created.name)])
      if (createUomTarget === 'main-uom') {
        setLabTestUom(created.name)
      } else if (createUomTarget === 'main-suom') {
        setSecondaryUom(created.name)
      }
      setShowCreateUom(false)
      setNewUomName('')
    } finally {
      setCreatingUom(false)
    }
  }

  const handleCreateItemGroup = async () => {
    const name = newItemGroupName.trim()
    if (!name) return
    setCreatingItemGroup(true)
    try {
      const params = new URLSearchParams()
      params.set('group_name', name)
      const res = await fetch(`/api/method/healthcare.api.common.create_item_group?${params.toString()}`, { credentials: 'include' })
      const data = await res.json()
      if (!res.ok) { alert(data.message || 'Failed to create Item Group'); return }
      const created: LinkFieldOption = data.message
      setItemGroupOpts(prev => [created, ...prev.filter(o => o.name !== created.name)])
      setSelectedItemGroup(created)
      setItemGroupQuery(created.label)
      setShowCreateItemGroup(false)
      setNewItemGroupName('')
    } finally {
      setCreatingItemGroup(false)
    }
  }

  const loadSampleRowOpts = useCallback(async (q?: string) => {
    fetchLabTestSamples(q).then(opts =>
      setSampleRowOpts(opts.map(o => ({ name: o.name, label: o.sample || o.name })))
    ).catch(() => setSampleRowOpts([]))
  }, [])

  /* ─── Submit ─────────────────────────────── */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!labTestName.trim()) { setError('Template Name is required'); return }
    if (!selectedDept) { setError('Department is required'); return }

    const body: Record<string, unknown> = {
      lab_test_name: labTestName.trim(),
      department: selectedDept.name,
      is_group: isGroup ? 1 : 0,
      disabled: disabled ? 1 : 0,
      nursing_checklist_template: selectedNurse?.name || null,
      lab_test_template_type: resultFormat,
      is_billable: isBillable ? 1 : 0,
      link_existing_item: linkExistingItem ? 1 : 0,
      lab_test_code: labTestCode.trim() || null,
      lab_test_group: selectedItemGroup?.name || null,
      item: selectedItem?.name || null,
      lab_test_uom: labTestUom.trim() || null,
      secondary_uom: secondaryUom.trim() || null,
      conversion_factor: conversionFactor ? parseFloat(conversionFactor) : null,
      min_range: minRange ? parseFloat(minRange) : null,
      max_range: maxRange ? parseFloat(maxRange) : null,
      lab_test_normal_range: normalRange || null,
      sensitivity: sensitivity ? 1 : 0,
      lab_test_description: labTestDescription || null,
      descriptive_result: descriptiveResult || null,
      worksheet_instructions: worksheetInstructions || null,
      legend_print_position: legendPosition,
      result_legend: resultLegend || null,
      pricing: pricingRows.filter(r => r.patient_category).map(r => ({
        patient_category: r.patient_category,
        price: parseFloat(r.price) || 0,
      })),
      lab_test_groups: groupRows.map(r => ({
        template_or_new_line: r.template_or_new_line,
        lab_test_template: r.lab_test_template || null,
        group_event: r.group_event || null,
        group_test_uom: r.group_test_uom || null,
        secondary_uom: r.secondary_uom || null,
        conversion_factor: r.conversion_factor ? parseFloat(r.conversion_factor) : null,
        allow_blank: r.allow_blank ? 1 : 0,
      })),
      normal_test_templates: normalRows.map(r => ({
        lab_test_event: r.lab_test_event,
        lab_test_uom: r.lab_test_uom || null,
        normal_range: r.normal_range || null,
        secondary_uom: r.secondary_uom || null,
        conversion_factor: r.conversion_factor ? parseFloat(r.conversion_factor) : null,
        allow_blank: r.allow_blank ? 1 : 0,
      })),
      descriptive_test_templates: descriptiveRows.map(r => ({
        particulars: r.particulars,
        allow_blank: r.allow_blank ? 1 : 0,
      })),
      sample_requirements: sampleReqRows.filter(r => r.sample).map(r => ({
        sample: r.sample,
        sample_qty: r.sample_qty ? parseFloat(r.sample_qty) : null,
        sample_details: r.sample_details || null,
      })),
    }

    try {
      setSaving(true)
      setError(null)
      let created: { name: string; lab_test_name: string; department?: string }
      if (isEdit) {
        created = await apiRequest(`/api/resource/Lab%20Test%20Template/${encodeURIComponent(templateName!)}`, {
          method: 'PUT',
          body: JSON.stringify(body),
        })
      } else {
        created = await apiRequest('/api/resource/Lab%20Test%20Template', {
          method: 'POST',
          body: JSON.stringify(body),
        })
      }
      onSuccess?.(created)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save template')
    } finally {
      setSaving(false)
    }
  }

  /* ─── Child table row helpers ─────────────── */
  const addPricingRow = () => setPricingRows(r => [...r, { patient_category: '', price: '' }])
  const removePricingRow = (i: number) => setPricingRows(r => r.filter((_, idx) => idx !== i))
  const updatePricingRow = (i: number, key: keyof PricingRow, val: string) =>
    setPricingRows(r => r.map((row, idx) => idx === i ? { ...row, [key]: val } : row))

  const addGroupRow = () => setGroupRows(r => [...r, {
    template_or_new_line: 'Add Test', lab_test_template: '',
    lab_test_description: '', group_event: '', group_test_uom: '', secondary_uom: '',
    conversion_factor: '', allow_blank: false,
  }])
  const removeGroupRow = (i: number) => setGroupRows(r => r.filter((_, idx) => idx !== i))
  const updateGroupRow = (i: number, key: keyof GroupTemplateRow, val: string | boolean) =>
    setGroupRows(r => r.map((row, idx) => idx === i ? { ...row, [key]: val } : row))

  const addNormalRow = () => setNormalRows(r => [...r, {
    lab_test_event: '', lab_test_uom: '', normal_range: '',
    secondary_uom: '', conversion_factor: '', allow_blank: false,
  }])
  const removeNormalRow = (i: number) => setNormalRows(r => r.filter((_, idx) => idx !== i))
  const updateNormalRow = (i: number, key: keyof NormalTestRow, val: string | boolean) =>
    setNormalRows(r => r.map((row, idx) => idx === i ? { ...row, [key]: val } : row))

  const addDescRow = () => setDescriptiveRows(r => [...r, { particulars: '', allow_blank: false }])
  const removeDescRow = (i: number) => setDescriptiveRows(r => r.filter((_, idx) => idx !== i))
  const updateDescRow = (i: number, key: keyof DescriptiveRow, val: string | boolean) =>
    setDescriptiveRows(r => r.map((row, idx) => idx === i ? { ...row, [key]: val } : row))

  const addSampleReqRow = () => {
    const newIndex = sampleReqRows.length
    setSampleReqRows(r => [...r, { sample: '', sample_display: '', sample_qty: '', sample_details: '' }])
    // When adding new row, collapse the old one and expand the new one
    if (sampleReqRows.length >= 1) {
      setExpandedSampleRow(newIndex)
    } else {
      setExpandedSampleRow(0)
    }
  }
  const removeSampleReqRow = (i: number) => setSampleReqRows(r => r.filter((_, idx) => idx !== i))
  const updateSampleReqRow = (i: number, key: keyof SampleReqRow, val: string) =>
    setSampleReqRows(r => r.map((row, idx) => idx === i ? { ...row, [key]: val } : row))

  /* ─── Tab renderers ──────────────────────── */
  const renderBasicInfo = () => (
    <div className="space-y-6">
      {/* Basic Fields */}
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Template Name <span className="text-red-500">*</span>
            </label>
            <input type="text" value={labTestName} onChange={e => setLabTestName(e.target.value)}
              placeholder="e.g. CBC, LFT, KFT"
              className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <LinkCombobox label="Department" required
            displayValue={deptQuery} options={deptOpts} open={deptOpen} setOpen={setDeptOpen}
            onFocus={() => loadDepts()} onSearch={q => { setDeptQuery(q); loadDepts(q) }}
            onSelect={o => { setSelectedDept(o); setDeptQuery(o.label) }}
            onClear={() => { setSelectedDept(null); setDeptQuery('') }} />
        </div>
        <LinkCombobox label="Nursing Checklist Template"
          displayValue={nurseQuery} options={nurseOpts} open={nurseOpen} setOpen={setNurseOpen}
          onFocus={() => loadNurse()} onSearch={q => { setNurseQuery(q); loadNurse(q) }}
          onSelect={o => { setSelectedNurse(o); setNurseQuery(o.label) }}
          onClear={() => { setSelectedNurse(null); setNurseQuery('') }} />
        <div className="flex gap-6">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input type="checkbox" checked={isGroup} onChange={e => setIsGroup(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary" />
            <span className="text-sm font-medium text-slate-700">Is Group</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input type="checkbox" checked={disabled} onChange={e => setDisabled(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary" />
            <span className="text-sm font-medium text-slate-700">Disabled</span>
          </label>
        </div>
      </div>

      {/* Result Format Section */}
      <div className="border-t pt-6 space-y-4">
        <h3 className="text-sm font-semibold text-slate-700">Result Format</h3>
        
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Result Format</label>
          <select value={resultFormat} onChange={e => setResultFormat(e.target.value)}
            className="rounded border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
            {RESULT_FORMATS.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>

        {(isGroup || resultFormat === 'Grouped') && renderGroupTable()}

        {!isGroup && resultFormat === 'Single' && (
          <div className="space-y-4">
            {/* Row 1: UOM and Secondary UOM */}
            <div className="grid grid-cols-2 gap-4">
              <UomCombobox label="UOM" value={labTestUom}
                onChange={v => setLabTestUom(v)}
                onCreateClick={() => { setCreateUomTarget('main-uom'); setNewUomName(''); setShowCreateUom(true) }} />
              <UomCombobox label="Secondary UOM" value={secondaryUom}
                onChange={v => setSecondaryUom(v)}
                onCreateClick={() => { setCreateUomTarget('main-suom'); setNewUomName(''); setShowCreateUom(true) }} />
            </div>

            {/* Row 2: Conversion Factor and Min Range */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Conversion Factor</label>
                <input type="number" value={conversionFactor} onChange={e => setConversionFactor(e.target.value)}
                  className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Min Range</label>
                <input type="number" value={minRange} onChange={e => setMinRange(e.target.value)}
                  className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
            </div>

            {/* Row 3: Max Range and Normal Range (text) */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Max Range</label>
                <input type="number" value={maxRange} onChange={e => setMaxRange(e.target.value)}
                  className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Normal Range (text)</label>
                <textarea value={normalRange} onChange={e => setNormalRange(e.target.value)} rows={2}
                  placeholder="e.g. Male: 13.5–17.5 g/dL | Female: 12–15.5 g/dL"
                  className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none" />
              </div>
            </div>
          </div>
        )}

        {!isGroup && resultFormat === 'Compound' && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold text-slate-700">Compound Test Parameters</h4>
              <button type="button" onClick={addNormalRow}
                className="text-xs px-2 py-1 rounded bg-primary text-white hover:bg-primary/90">+ Add Row</button>
            </div>
            <div className="overflow-x-auto rounded border border-slate-200">
              <table className="min-w-full text-xs">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-2 py-2 text-left font-medium text-slate-600">Event / Parameter</th>
                    <th className="px-2 py-2 text-left font-medium text-slate-600">UOM</th>
                    <th className="px-2 py-2 text-left font-medium text-slate-600">Normal Range</th>
                    <th className="px-2 py-2 text-left font-medium text-slate-600">Sec. UOM</th>
                    <th className="px-2 py-2 text-left font-medium text-slate-600">Conv. Factor</th>
                    <th className="px-2 py-2 text-left font-medium text-slate-600">Allow Blank</th>
                    <th className="px-1 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {normalRows.length === 0 && (
                    <tr><td colSpan={7} className="text-center text-slate-400 py-3">No rows</td></tr>
                  )}
                  {normalRows.map((row, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      <td className="px-2 py-1">
                        <input value={row.lab_test_event} onChange={e => updateNormalRow(i, 'lab_test_event', e.target.value)} placeholder="e.g. Haemoglobin" className="w-28 rounded border border-slate-300 px-1 py-0.5 text-xs" />
                      </td>
                      <td className="px-2 py-1">
                        <RowCombobox
                          value={row.lab_test_uom} placeholder="UOM…"
                          options={openUomCellKey === `c-${i}-uom` ? uomSharedOpts : []}
                          open={openUomCellKey === `c-${i}-uom`}
                          onFocus={() => { setOpenUomCellKey(`c-${i}-uom`); loadUoms(row.lab_test_uom || undefined) }}
                          onChange={q => { updateNormalRow(i, 'lab_test_uom', q); setOpenUomCellKey(`c-${i}-uom`); loadUoms(q || undefined) }}
                          onSelect={opt => { updateNormalRow(i, 'lab_test_uom', opt.name); setOpenUomCellKey(null) }}
                          onBlurClose={() => setOpenUomCellKey(null)}
                          className="w-20"
                        />
                      </td>
                      <td className="px-2 py-1">
                        <input value={row.normal_range} onChange={e => updateNormalRow(i, 'normal_range', e.target.value)} placeholder="13–17" className="w-24 rounded border border-slate-300 px-1 py-0.5 text-xs" />
                      </td>
                      <td className="px-2 py-1">
                        <RowCombobox
                          value={row.secondary_uom} placeholder="Sec. UOM…"
                          options={openUomCellKey === `c-${i}-suom` ? uomSharedOpts : []}
                          open={openUomCellKey === `c-${i}-suom`}
                          onFocus={() => { setOpenUomCellKey(`c-${i}-suom`); loadUoms(row.secondary_uom || undefined) }}
                          onChange={q => { updateNormalRow(i, 'secondary_uom', q); setOpenUomCellKey(`c-${i}-suom`); loadUoms(q || undefined) }}
                          onSelect={opt => { updateNormalRow(i, 'secondary_uom', opt.name); setOpenUomCellKey(null) }}
                          onBlurClose={() => setOpenUomCellKey(null)}
                          className="w-20"
                        />
                      </td>
                      <td className="px-2 py-1">
                        <input type="number" value={row.conversion_factor} onChange={e => updateNormalRow(i, 'conversion_factor', e.target.value)} className="w-16 rounded border border-slate-300 px-1 py-0.5 text-xs" />
                      </td>
                      <td className="px-2 py-1 text-center">
                        <input type="checkbox" checked={row.allow_blank} onChange={e => updateNormalRow(i, 'allow_blank', e.target.checked)} />
                      </td>
                      <td className="px-1 py-1">
                        <button type="button" onClick={() => removeNormalRow(i)} className="text-red-400 hover:text-red-600 text-xs">✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {!isGroup && resultFormat === 'Descriptive' && (
          <div className="space-y-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={sensitivity} onChange={e => setSensitivity(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-primary" />
              <span className="text-sm text-slate-700">Sensitivity</span>
            </label>
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-semibold text-slate-700">Descriptive Test Components</h4>
                <button type="button" onClick={addDescRow}
                  className="text-xs px-2 py-1 rounded bg-primary text-white hover:bg-primary/90">+ Add Row</button>
              </div>
              <div className="overflow-x-auto rounded border border-slate-200">
                <table className="min-w-full text-xs">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-2 py-2 text-left font-medium text-slate-600">Result Component</th>
                      <th className="px-2 py-2 text-left font-medium text-slate-600">Allow Blank</th>
                      <th className="px-1 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {descriptiveRows.length === 0 && (
                      <tr><td colSpan={3} className="text-center text-slate-400 py-3">No rows</td></tr>
                    )}
                    {descriptiveRows.map((row, i) => (
                      <tr key={i} className="border-t border-slate-100">
                        <td className="px-2 py-1"><input value={row.particulars} onChange={e => updateDescRow(i, 'particulars', e.target.value)} placeholder="e.g. Culture Result" className="w-48 rounded border border-slate-300 px-1 py-0.5 text-xs" /></td>
                        <td className="px-2 py-1 text-center"><input type="checkbox" checked={row.allow_blank} onChange={e => updateDescRow(i, 'allow_blank', e.target.checked)} /></td>
                        <td className="px-1 py-1"><button type="button" onClick={() => removeDescRow(i)} className="text-red-400 hover:text-red-600 text-xs">✕</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {!isGroup && resultFormat === 'Imaging' && (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Description</label>
              <textarea value={labTestDescription} onChange={e => setLabTestDescription(e.target.value)}
                rows={3} placeholder="Imaging description template…"
                className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Default Descriptive Result</label>
              <textarea value={descriptiveResult} onChange={e => setDescriptiveResult(e.target.value)}
                rows={3} placeholder="Default result text…"
                className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none" />
            </div>
          </div>
        )}

        {resultFormat === 'No Result' && (
          <p className="text-sm text-slate-500 italic">No result format fields for "No Result" type.</p>
        )}
      </div>
    </div>
  )

  const renderGroupTable = () => (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-semibold text-slate-700">Group Tests</h4>
        <button type="button" onClick={addGroupRow}
          className="text-xs px-2 py-1 rounded bg-primary text-white hover:bg-primary/90">+ Add Row</button>
      </div>
      <div className="overflow-x-auto rounded border border-slate-200">
        <table className="min-w-full text-xs">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-2 py-2 text-left font-medium text-slate-600 whitespace-nowrap">Type</th>
              <th className="px-2 py-2 text-left font-medium text-slate-600 whitespace-nowrap">Test Template / Event</th>
              <th className="px-2 py-2 text-left font-medium text-slate-600 whitespace-nowrap">UOM</th>
              <th className="px-2 py-2 text-left font-medium text-slate-600 whitespace-nowrap">Allow Blank</th>
              <th className="px-1 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {groupRows.length === 0 && (
              <tr><td colSpan={5} className="text-center text-slate-400 py-3">No rows — click + Add Row</td></tr>
            )}
            {groupRows.map((row, i) => (
              <tr key={i} className="border-t border-slate-100">
                <td className="px-2 py-1.5">
                  <select value={row.template_or_new_line}
                    onChange={e => updateGroupRow(i, 'template_or_new_line', e.target.value as 'Add Test' | 'Add New Line')}
                    className="rounded border border-slate-300 px-1 py-0.5 text-xs">
                    <option value="Add Test">Add Test</option>
                    <option value="Add New Line">Add New Line</option>
                  </select>
                </td>
                <td className="px-2 py-1.5">
                  {row.template_or_new_line === 'Add Test' ? (
                    <RowCombobox
                      value={row.lab_test_template}
                      placeholder="Search template…"
                      options={openGroupRowIdx === i ? groupRowOpts : []}
                      open={openGroupRowIdx === i}
                      onFocus={() => { setOpenGroupRowIdx(i); loadGroupRowTemplates(row.lab_test_template || undefined) }}
                      onChange={q => {
                        updateGroupRow(i, 'lab_test_template', q)
                        setOpenGroupRowIdx(i)
                        loadGroupRowTemplates(q || undefined)
                      }}
                      onSelect={opt => {
                        updateGroupRow(i, 'lab_test_template', opt.name)
                        updateGroupRow(i, 'lab_test_description', opt.label)
                        setOpenGroupRowIdx(null)
                      }}
                      onBlurClose={() => setOpenGroupRowIdx(null)}
                      className="w-44"
                    />
                  ) : (
                    <input value={row.group_event}
                      onChange={e => updateGroupRow(i, 'group_event', e.target.value)}
                      placeholder="Event label"
                      className="w-44 rounded border border-slate-300 px-1.5 py-0.5 text-xs" />
                  )}
                </td>
                <td className="px-2 py-1.5">
                  <RowCombobox
                    value={row.group_test_uom}
                    placeholder="UOM…"
                    options={openUomCellKey === `g-${i}-uom` ? uomSharedOpts : []}
                    open={openUomCellKey === `g-${i}-uom`}
                    onFocus={() => { setOpenUomCellKey(`g-${i}-uom`); loadUoms(row.group_test_uom || undefined) }}
                    onChange={q => { updateGroupRow(i, 'group_test_uom', q); setOpenUomCellKey(`g-${i}-uom`); loadUoms(q || undefined) }}
                    onSelect={opt => { updateGroupRow(i, 'group_test_uom', opt.name); setOpenUomCellKey(null) }}
                    onBlurClose={() => setOpenUomCellKey(null)}
                    className="w-24"
                  />
                </td>
                <td className="px-2 py-1.5 text-center">
                  <input type="checkbox" checked={row.allow_blank}
                    onChange={e => updateGroupRow(i, 'allow_blank', e.target.checked)} />
                </td>
                <td className="px-1 py-1.5">
                  <button type="button" onClick={() => removeGroupRow(i)}
                    className="text-red-400 hover:text-red-600 text-xs">✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )

  const renderBilling = () => (
    <div className="space-y-6">
      {/* Billing Settings */}
      <div className="space-y-4">
        <div className="flex gap-6">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={isBillable} onChange={e => setIsBillable(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-primary" />
            <span className="text-sm font-medium text-slate-700">Is Billable</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={linkExistingItem} onChange={e => setLinkExistingItem(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-primary" />
            <span className="text-sm font-medium text-slate-700">Link Existing Item</span>
          </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {linkExistingItem ? (
            <LinkCombobox label="Item (ERPNext)"
              displayValue={itemQuery} options={itemOpts} open={itemOpen} setOpen={setItemOpen}
              onFocus={() => loadItems()} onSearch={q => { setItemQuery(q); loadItems(q) }}
              onSelect={o => { setSelectedItem(o); setItemQuery(o.label) }}
              onClear={() => { setSelectedItem(null); setItemQuery('') }} />
          ) : (
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Item Code</label>
              <input value={labTestCode} onChange={e => setLabTestCode(e.target.value)}
                placeholder="e.g. LFT-001"
                className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
          )}
          <LinkCombobox label="Item Group"
            displayValue={itemGroupQuery} options={itemGroupOpts} open={itemGroupOpen} setOpen={setItemGroupOpen}
            onFocus={() => loadItemGroups()} onSearch={q => { setItemGroupQuery(q); loadItemGroups(q) }}
            onSelect={o => { setSelectedItemGroup(o); setItemGroupQuery(o.label) }}
            onClear={() => { setSelectedItemGroup(null); setItemGroupQuery('') }}
            showCreate onCreateClick={() => { setNewItemGroupName(itemGroupQuery); setShowCreateItemGroup(true) }} />
        </div>
      </div>

      {/* Pricing Table */}
      <div className="border-t pt-6">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-semibold text-slate-700">Pricing by Patient Category</h4>
          <button type="button" onClick={addPricingRow}
            className="text-xs px-2 py-1 rounded bg-primary text-white hover:bg-primary/90">+ Add Row</button>
        </div>
        <div className="overflow-x-auto rounded border border-slate-200">
          <table className="min-w-full text-xs">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-slate-600">Patient Category</th>
                <th className="px-3 py-2 text-left font-medium text-slate-600">Price</th>
                <th className="px-2 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {pricingRows.length === 0 && (
                <tr><td colSpan={3} className="text-center text-slate-400 py-3">No pricing rows — click + Add Row</td></tr>
              )}
              {pricingRows.map((row, i) => (
                <tr key={i} className="border-t border-slate-100">
                  <td className="px-3 py-2.5">
                    <select value={row.patient_category}
                      onChange={e => updatePricingRow(i, 'patient_category', e.target.value)}
                      className="rounded border border-slate-300 px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-primary bg-white">
                      {PATIENT_CATEGORIES.map(c => <option key={c} value={c}>{c || '— Select —'}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-2.5">
                    <input type="number" value={row.price}
                      onChange={e => updatePricingRow(i, 'price', e.target.value)}
                      placeholder="0.00" min="0" step="0.01"
                      className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white" />
                  </td>
                  <td className="px-3 py-2.5">
                    <button type="button" onClick={() => removePricingRow(i)}
                      className="text-red-400 hover:text-red-600 text-sm">✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )

  const renderSampleCollection = () => (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-slate-500">
          Define all samples required for this test.
        </p>
        <button
          type="button"
          onClick={addSampleReqRow}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white text-sm rounded-md hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" /> Add Sample
        </button>
      </div>

      <div className="space-y-3">
        {sampleReqRows.map((row, i) => (
          <div
            key={i}
            className="border border-slate-200 rounded-lg bg-white shadow-sm overflow-hidden transition-all"
          >
            {/* Card header - clickable to expand/collapse */}
            <button
              type="button"
              onClick={() => setExpandedSampleRow(expandedSampleRow === i ? null : i)}
              className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-200 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <div className="flex items-center gap-2">
                  <span>Sample {i + 1}</span>
                  {row.sample_display && (
                    <span className="text-slate-400 font-normal">— {row.sample_display}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    removeSampleReqRow(i)
                  }}
                  className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                  title="Remove"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <div className="text-slate-400">
                  {expandedSampleRow === i ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </div>
              </div>
            </button>

            {/* Collapsible content */}
            {expandedSampleRow === i && (
              <div className="p-4 space-y-4 bg-white animate-in fade-in duration-200">
                {/* Row A: Sample and Quantity side by side */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-2">
                      Sample <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={row.sample_display}
                        onChange={e => {
                          updateSampleReqRow(i, 'sample_display', e.target.value)
                          updateSampleReqRow(i, 'sample', e.target.value)
                          setOpenSampleRowIdx(i)
                          loadSampleRowOpts(e.target.value || undefined)
                        }}
                        onFocus={() => {
                          setOpenSampleRowIdx(i)
                          loadSampleRowOpts(row.sample || undefined)
                        }}
                        onBlur={() => setTimeout(() => setOpenSampleRowIdx(null), 150)}
                        placeholder="Search for a sample type…"
                        className="w-full rounded-md border border-slate-300 px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                      {row.sample_display ? (
                        <button type="button"
                          onClick={() => { updateSampleReqRow(i, 'sample', ''); updateSampleReqRow(i, 'sample_display', '') }}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs">✕</button>
                      ) : (
                        <button type="button"
                          onClick={() => { setCreateSampleForRowIdx(i); setShowCreateSampleModal(true) }}
                          className="absolute right-1.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-white border border-primary/40 text-primary flex items-center justify-center text-sm leading-none hover:bg-primary/5"
                          title="Create Lab Test Sample">+</button>
                      )}
                      {openSampleRowIdx === i && sampleRowOpts.length > 0 && (
                        <div className="absolute z-30 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-48 overflow-y-auto">
                          {sampleRowOpts.map(o => (
                            <button
                              key={o.name}
                              type="button"
                              onMouseDown={e => e.preventDefault()}
                              onClick={() => {
                                updateSampleReqRow(i, 'sample', o.name)
                                updateSampleReqRow(i, 'sample_display', o.label)
                                setOpenSampleRowIdx(null)
                              }}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 transition-colors"
                            >
                              {o.label || o.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-2">Quantity</label>
                    <input
                      type="number"
                      value={row.sample_qty}
                      onChange={e => updateSampleReqRow(i, 'sample_qty', e.target.value)}
                      placeholder="e.g. 5"
                      min="0"
                      step="0.1"
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                </div>

                {/* Collection Instructions */}
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-2">Collection Instructions</label>
                  <textarea
                    value={row.sample_details}
                    onChange={e => updateSampleReqRow(i, 'sample_details', e.target.value)}
                    placeholder="e.g. 5 mL EDTA tube, keep at 4°C, centrifuge at 3000 rpm for 5 minutes"
                    rows={3}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                  />
                </div>
              </div>
            )}
          </div>
        ))}

        {sampleReqRows.length === 0 && (
          <div className="text-center py-12 text-slate-400 border-2 border-dashed border-slate-200 rounded-lg">
            <div className="w-10 h-10 mx-auto mb-2 opacity-30">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <p className="text-sm">NO SAMPLE REQUIREMENTS ADDED YET</p>
            <button
              type="button"
              onClick={addSampleReqRow}
              className="mt-3 text-sm text-primary hover:underline"
            >
              Add first sample
            </button>
          </div>
        )}
      </div>
    </div>
  )

  const renderAdvanced = () => (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-slate-700">Worksheet & Legend</h3>
      
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Worksheet Instructions</label>
        <textarea value={worksheetInstructions} onChange={e => setWorksheetInstructions(e.target.value)}
          rows={5} placeholder="Instructions to print on the worksheet…"
          className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none" />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Legend Print Position</label>
        <select value={legendPosition} onChange={e => setLegendPosition(e.target.value)}
          className="rounded border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary w-full md:w-48">
          {['Bottom', 'Top', 'Both'].map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Result Legend</label>
        <textarea value={resultLegend} onChange={e => setResultLegend(e.target.value)}
          rows={4} placeholder="Legend text to print with results…"
          className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none" />
      </div>
    </div>
  )

  /* ─── Main render ────────────────────────── */
  return (
    <>
    <div className={CREATE_MODAL_OVERLAY}
      onClick={e => {
        if (e.target === e.currentTarget) onClose()
        setDeptOpen(false); setNurseOpen(false); setItemOpen(false); setItemGroupOpen(false)
        setOpenGroupRowIdx(null); setOpenSampleRowIdx(null); setOpenUomCellKey(null)
      }}>
      <div className={createModalShellClass('w-full max-w-3xl flex flex-col h-[85vh]')}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="relative shrink-0 border-b border-emerald-100/60 bg-gradient-to-r from-emerald-100 via-teal-50 to-sky-100 px-6 py-4 flex flex-shrink-0 items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight text-emerald-950">
            {isEdit ? 'Edit Lab Test Template' : 'Create Lab Test Template'}
            {isEdit && <span className="ml-2 text-sm font-normal text-slate-500">{templateName}</span>}
          </h2>
          <button onClick={onClose} className="shrink-0 rounded-lg p-2 text-emerald-800/70 transition hover:bg-emerald-200/50 hover:text-emerald-950">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center p-8 text-slate-500">Loading…</div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
            {/* Tabs */}
            <div className="px-6 pt-3 border-b border-slate-200 flex gap-1 flex-shrink-0 overflow-x-auto">
              {TABS.map(tab => (
                <button key={tab} type="button" onClick={() => setActiveTab(tab)}
                  className={`px-3 py-2 text-xs font-medium rounded-t whitespace-nowrap transition-colors
                    ${activeTab === tab ? 'bg-primary text-white' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'}`}>
                  {tab}
                </button>
              ))}
            </div>

            {/* Tab body */}
            <div className="overflow-y-auto px-6 py-4 h-0 flex-1" style={{ scrollbarWidth: 'thin' }}>
              {activeTab === 'Basic Info' && renderBasicInfo()}
              {activeTab === 'Billing' && renderBilling()}
              {activeTab === 'Sample Collection' && renderSampleCollection()}
              {activeTab === 'Advanced' && renderAdvanced()}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-slate-200 flex-shrink-0">
              {error && (
                <div className="mb-3 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>
              )}
              <div className="flex justify-end gap-3">
                <button type="button" onClick={onClose}
                  className={CM_BTN_CANCEL}>
                  Cancel
                </button>
                <button type="submit" disabled={saving}
                  className={CM_BTN_PRIMARY}>
                  {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Template'}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>

    {/* Create UOM mini-modal */}
    {showCreateUom && (
      <div className={CREATE_MODAL_OVERLAY_STACK}
        onClick={() => { setShowCreateUom(false); setNewUomName('') }}>
        <div className={createModalShellClass('w-full max-w-sm p-6')} onClick={e => e.stopPropagation()}>
          <h3 className="text-base font-semibold text-slate-900 mb-4">Create UOM</h3>
          <div className="mb-4">
            <label className="block text-xs font-medium text-slate-600 mb-1">UOM Name <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={newUomName}
              onChange={e => setNewUomName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleCreateUom() } }}
              placeholder="e.g. mg, mL, Units"
              autoFocus
              className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => { setShowCreateUom(false); setNewUomName('') }}
              className={CM_BTN_CANCEL}>Cancel</button>
            <button type="button" onClick={handleCreateUom} disabled={creatingUom || !newUomName.trim()}
              className={CM_BTN_PRIMARY}>
              {creatingUom ? 'Creating…' : 'Create UOM'}
            </button>
          </div>
        </div>
      </div>
    )}

    {/* Create Item Group mini-modal */}
    {showCreateItemGroup && (
      <div className={CREATE_MODAL_OVERLAY_STACK}
        onClick={() => { setShowCreateItemGroup(false); setNewItemGroupName('') }}>
        <div className={createModalShellClass('w-full max-w-sm p-6')} onClick={e => e.stopPropagation()}>
          <h3 className="text-base font-semibold text-slate-900 mb-4">Create Item Group</h3>
          <div className="mb-4">
            <label className="block text-xs font-medium text-slate-600 mb-1">Item Group Name <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={newItemGroupName}
              onChange={e => setNewItemGroupName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleCreateItemGroup() } }}
              placeholder="e.g. Laboratory Services"
              autoFocus
              className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => { setShowCreateItemGroup(false); setNewItemGroupName('') }}
              className={CM_BTN_CANCEL}>Cancel</button>
            <button type="button" onClick={handleCreateItemGroup} disabled={creatingItemGroup || !newItemGroupName.trim()}
              className={CM_BTN_PRIMARY}>
              {creatingItemGroup ? 'Creating…' : 'Create Item Group'}
            </button>
          </div>
        </div>
      </div>
    )}

    {/* Create Lab Test Sample modal */}
    {showCreateSampleModal && (
      <CreateLabTestSampleModal
        onClose={() => { setShowCreateSampleModal(false); setCreateSampleForRowIdx(null) }}
        onSuccess={sampleName => {
          if (sampleName && createSampleForRowIdx !== null) {
            updateSampleReqRow(createSampleForRowIdx, 'sample', sampleName)
            updateSampleReqRow(createSampleForRowIdx, 'sample_display', sampleName)
            loadSampleRowOpts()
          }
          setShowCreateSampleModal(false)
          setCreateSampleForRowIdx(null)
        }}
      />
    )}
    </>
  )
}
import { useState, useEffect, useRef } from 'react'
import { fetchInpatientRecords, type InpatientRecord } from '../../services/inpatientRecords'
import { fetchServiceRequests } from '../../services/serviceRequests'
import { fetchCostCenters, fetchItems, type LinkFieldOption } from '../../services/common'
import { createIPService, type CreateIPServiceInput, type IPServiceLineInput } from '../../services/ipServices'
import { toast } from '../../hooks/useToast'
import { useCareContext } from '../../providers/CareContextProvider'

interface CreateIPServiceModalProps {
  onClose: () => void
  onSuccess: (ipServiceName: string) => void
  initialPatient?: string
  initialServiceRequest?: string
  initialCategory?: 'Medical Service' | 'Other Service'
  openInNewTab?: boolean
}

const TYPE_OPTIONS = [
  { value: 'Internal Service', label: 'Internal Service' },
  { value: 'External Service', label: 'External Service' },
]

type TabId = 'details' | 'items'

interface ItemRow {
  id: string
  service_code: string
  item_label: string
  amount: string
  note: string
}

function nextId() {
  return `row-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export const CreateIPServiceModal = ({
  onClose,
  onSuccess,
  initialPatient,
  initialServiceRequest,
  openInNewTab = true,
}: CreateIPServiceModalProps) => {
  // Get context from CareContextProvider
  const { mode, activeAdmission, selectedPatient: contextPatient } = useCareContext()
  
  // Determine if we're in IP mode
  const isIPMode = mode === 'IP'
  
  const [tab, setTab] = useState<TabId>('details')
  const [admissionNo, setAdmissionNo] = useState('')
  const [admissionSearch, setAdmissionSearch] = useState('')
  const [admissions, setAdmissions] = useState<InpatientRecord[]>([])
  const [admissionOpen, setAdmissionOpen] = useState(false)
  const [serviceRequest, setServiceRequest] = useState(initialServiceRequest || '')
  const [serviceRequests, setServiceRequests] = useState<{ name: string; template_name?: string }[]>([])
  const [category, setCategory] = useState<string>(initialCategory || 'Medical Service')
  const [type, setType] = useState<string>('External Service')
  const [costCenter, setCostCenter] = useState('')
  const [costCenters, setCostCenters] = useState<LinkFieldOption[]>([])
  const [costCenterOpen, setCostCenterOpen] = useState(false)
  const [costCenterSearch, setCostCenterSearch] = useState('')
  const [items, setItems] = useState<ItemRow[]>([])

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const admissionDropdownRef = useRef<HTMLDivElement>(null)
  const costCenterDropdownRef = useRef<HTMLDivElement>(null)

  // Get effective patient and admission
  const effectivePatient = initialPatient || contextPatient || ''
  const effectiveAdmission = activeAdmission || ''

  // Auto-load admission from context
  useEffect(() => {
    if (isIPMode && effectiveAdmission && !admissionNo) {
      // Fetch and set the admission from context
      fetchInpatientRecords(undefined, effectiveAdmission, effectivePatient, undefined, undefined, undefined)
        .then((list) => {
          const matched = list.find(a => a.name === effectiveAdmission)
          if (matched) {
            setAdmissionNo(matched.name)
          } else if (list.length > 0) {
            setAdmissionNo(list[0].name)
          }
        })
        .catch(() => {})
    }
  }, [isIPMode, effectiveAdmission, effectivePatient, admissionNo])

  // Auto-load service request if provided
  useEffect(() => {
    if (initialServiceRequest) setServiceRequest(initialServiceRequest)
  }, [initialServiceRequest])

  useEffect(() => {
    if (initialCategory) setCategory(initialCategory)
  }, [initialCategory])

  // Load service requests for the patient
  useEffect(() => {
    if (!effectivePatient) return
    fetchServiceRequests(50, 0, effectivePatient, 'IP Service Type')
      .then(setServiceRequests)
      .catch(() => setServiceRequests([]))
  }, [effectivePatient])

  // Load admissions with search
  useEffect(() => {
    if (!admissionOpen) return
    const t = setTimeout(() => {
      fetchInpatientRecords(undefined, admissionSearch || undefined, effectivePatient, undefined, undefined, undefined)
        .then((list) => setAdmissions(list.slice(0, 30)))
        .catch(() => setAdmissions([]))
    }, admissionSearch.trim() === '' ? 0 : 300)
    return () => clearTimeout(t)
  }, [admissionOpen, admissionSearch, effectivePatient])

  // Load cost centers (optionally by company when admission is selected)
  useEffect(() => {
    const selectedAdmission = admissions.find((a) => a.name === admissionNo)
    const company = selectedAdmission?.company
    fetchCostCenters(company, costCenterSearch || undefined)
      .then(setCostCenters)
      .catch(() => setCostCenters([]))
  }, [admissionNo, admissions, costCenterSearch])

  const selectedAdmission = admissions.find((a) => a.name === admissionNo)

  const addItemRow = () => {
    setItems((prev) => [...prev, { id: nextId(), service_code: '', item_label: '', amount: '', note: '' }])
  }

  const removeItemRow = (id: string) => {
    setItems((prev) => prev.filter((r) => r.id !== id))
  }

  const updateItemRow = (id: string, field: keyof ItemRow, value: string) => {
    setItems((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r))
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!admissionNo.trim()) {
      setError('Admission is required.')
      return
    }
    if (!costCenter.trim()) {
      setError('Cost Center is required.')
      return
    }

    const needItems = !serviceRequest
    const validItems = items.filter((r) => r.service_code.trim() && r.amount.trim() && !isNaN(parseFloat(r.amount)))
    if (needItems && validItems.length === 0) {
      setError('Without a Service Request you must add at least one item with a price.')
      setTab('items')
      return
    }

    try {
      setSubmitting(true)
      const input: CreateIPServiceInput = {
        admission_no: admissionNo.trim(),
        cost_center: costCenter.trim(),
        type,
        category,
      }
      if (serviceRequest) input.service_request = serviceRequest
      if (validItems.length > 0) {
        input.services = validItems.map(
          (r): IPServiceLineInput => ({
            service_code: r.service_code.trim(),
            amount: parseFloat(r.amount),
            note: r.note.trim() || undefined,
          })
        )
      }

      const { name } = await createIPService(input)
      toast.success(`IP Service ${name} created.`)
      onSuccess(name)
      onClose()
      if (openInNewTab) {
        window.open(`/app/ip-service/${encodeURIComponent(name)}`, '_blank')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create IP Service')
    } finally {
      setSubmitting(false)
    }
  }

  // Get mode-specific help text
  const getModeHelpText = () => {
    if (isIPMode) {
      return `Creating IP service for admission: ${admissionNo || 'auto-selected from context'}`
    }
    return 'Select IP mode from the context switcher above'
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full min-h-[32rem] max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 flex-shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Create IP Service</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {isIPMode && <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-[10px] font-medium mr-2">IP Mode Active</span>}
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

        {/* Mode indicator box */}
        <div className="mx-4 mt-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
          <p className="text-xs font-semibold text-primary mb-1">
            {isIPMode ? '🏥 Creating IP Service for Inpatient' : '📋 Select IP Context'}
          </p>
          <p className="text-xs text-slate-600">
            {isIPMode 
              ? `The IP service will be linked to the selected inpatient admission.`
              : 'Please select IP mode from the top navbar before creating an IP service.'
            }
          </p>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 flex-shrink-0 mt-3">
          <button
            type="button"
            onClick={() => setTab('details')}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === 'details'
                ? 'border-primary text-primary'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            Details
          </button>
          <button
            type="button"
            onClick={() => setTab('items')}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === 'items'
                ? 'border-primary text-primary'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            Items
            {items.length > 0 && (
              <span className="ml-1.5 rounded-full bg-slate-200 px-1.5 py-0.5 text-xs">{items.length}</span>
            )}
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          {error && (
            <div className="px-4 py-2 text-sm text-red-700 bg-red-50 border-b border-red-200 flex-shrink-0">
              {error}
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-4 min-h-[20rem]">
            {tab === 'details' && (
              <div className="space-y-4">
                <div ref={admissionDropdownRef} className="relative">
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Inpatient Admission <span className="text-red-500">*</span>
                  </label>
                  {activeAdmission ? (
                    <div>
                      <input
                        type="text"
                        value={selectedAdmission ? `${selectedAdmission.name}${selectedAdmission.patient_name ? ` – ${selectedAdmission.patient_name}` : ''}` : admissionNo}
                        readOnly
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-slate-100 cursor-not-allowed"
                      />
                      <p className="text-xs text-slate-400 mt-1">Auto-selected from IP context</p>
                    </div>
                  ) : (
                    <>
                      <input
                        type="text"
                        value={
                          admissionOpen
                            ? admissionSearch
                            : selectedAdmission
                              ? `${selectedAdmission.name}${selectedAdmission.patient_name ? ` – ${selectedAdmission.patient_name}` : ''}`
                              : admissionNo
                        }
                        onChange={(e) => {
                          setAdmissionSearch(e.target.value)
                          if (!admissionOpen) setAdmissionOpen(true)
                        }}
                        onFocus={() => setAdmissionOpen(true)}
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        placeholder="Search admission..."
                      />
                      {admissionOpen && (
                        <div className="absolute z-10 mt-1 w-full max-w-md rounded-md border border-slate-200 bg-white shadow-lg max-h-48 overflow-y-auto">
                          {admissions.length === 0 ? (
                            <div className="px-3 py-2 text-sm text-slate-500">No admissions found.</div>
                          ) : (
                            admissions.map((a) => (
                              <button
                                key={a.name}
                                type="button"
                                className="block w-full text-left px-3 py-2 text-sm hover:bg-slate-50 border-b border-slate-100 last:border-0"
                                onClick={() => {
                                  setAdmissionNo(a.name)
                                  setAdmissionSearch('')
                                  setAdmissionOpen(false)
                                }}
                              >
                                {a.name}
                                {a.patient_name ? ` – ${a.patient_name}` : ''}
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Service Request (optional)</label>
                  <select
                    value={serviceRequest}
                    onChange={(e) => setServiceRequest(e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="">None</option>
                    {serviceRequests.map((sr) => (
                      <option key={sr.name} value={sr.name}>
                        {sr.template_name || sr.name}
                      </option>
                    ))}
                  </select>
                  {!serviceRequest && (
                    <p className="text-xs text-amber-700 mt-1">Add at least one item in the Items tab.</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Type</label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    {TYPE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div ref={costCenterDropdownRef} className="relative">
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Cost Center <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={
                      costCenterOpen
                        ? costCenterSearch
                        : costCenter
                          ? costCenters.find((c) => c.name === costCenter)?.label ?? costCenter
                          : ''
                    }
                    onChange={(e) => {
                      setCostCenterSearch(e.target.value)
                      if (!costCenterOpen) setCostCenterOpen(true)
                    }}
                    onFocus={() => setCostCenterOpen(true)}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="Search cost center..."
                  />
                  {costCenterOpen && (
                    <div className="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg max-h-48 overflow-y-auto">
                      {costCenters.length === 0 ? (
                        <div className="px-3 py-2 text-sm text-slate-500">No cost centers found.</div>
                      ) : (
                        costCenters.map((c) => (
                          <button
                            key={c.name}
                            type="button"
                            className="block w-full text-left px-3 py-2 text-sm hover:bg-slate-50 border-b border-slate-100 last:border-0"
                            onClick={() => {
                              setCostCenter(c.name)
                              setCostCenterSearch('')
                              setCostCenterOpen(false)
                            }}
                          >
                            {c.label || c.name}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {tab === 'items' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-slate-600">
                    {serviceRequest
                      ? 'Optionally add service items (or save and edit in the form).'
                      : 'Add at least one item and price when no Service Request is linked.'}
                  </p>
                  <button
                    type="button"
                    onClick={addItemRow}
                    className="text-sm font-medium text-primary hover:underline"
                  >
                    + Add row
                  </button>
                </div>

                {items.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-slate-500 text-sm">
                    No items. Click &quot;+ Add row&quot; to add an item and amount.
                  </div>
                ) : (
                  <div className="overflow-x-auto border border-slate-200 rounded-lg">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium text-slate-600">Item</th>
                          <th className="px-3 py-2 text-left font-medium text-slate-600 w-28">Amount</th>
                          <th className="px-3 py-2 text-left font-medium text-slate-600">Note</th>
                          <th className="w-10" />
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((row) => (
                          <ItemRowEditor
                            key={row.id}
                            row={row}
                            onUpdate={(field, value) => updateItemRow(row.id, field, value)}
                            onRemove={() => removeItemRow(row.id)}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="px-4 py-3 border-t border-slate-200 flex justify-end gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-md hover:bg-slate-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={
                submitting ||
                !admissionNo.trim() ||
                !costCenter.trim() ||
                (!serviceRequest && items.filter((r) => r.service_code.trim() && r.amount.trim()).length === 0) ||
                !isIPMode
              }
              className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50"
            >
              {submitting ? 'Creating…' : 'Create IP Service'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

interface ItemRowEditorProps {
  row: ItemRow
  onUpdate: (field: keyof ItemRow, value: string) => void
  onRemove: () => void
}

function ItemRowEditor({ row, onUpdate, onRemove }: ItemRowEditorProps) {
  const [itemSearch, setItemSearch] = useState('')
  const [itemOptions, setItemOptions] = useState<LinkFieldOption[]>([])
  const [itemOpen, setItemOpen] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null)

  useEffect(() => {
    if (!itemOpen) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      fetchItems(itemSearch || undefined).then(setItemOptions)
    }, itemSearch.trim() === '' ? 0 : 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [itemOpen, itemSearch])

  return (
    <tr className="border-b border-slate-100 last:border-0">
      <td className="px-3 py-2">
        <div className="relative min-w-[180px]">
          <input
            type="text"
            value={itemOpen ? itemSearch : row.item_label || row.service_code}
            onChange={(e) => {
              setItemSearch(e.target.value)
              if (!itemOpen) setItemOpen(true)
            }}
            onFocus={() => setItemOpen(true)}
            onBlur={() => setTimeout(() => setItemOpen(false), 200)}
            className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="Search item..."
          />
          {itemOpen && (
            <div className="absolute z-20 mt-0.5 left-0 right-0 rounded border border-slate-200 bg-white shadow-lg max-h-40 overflow-y-auto">
              {itemOptions.map((opt) => (
                <button
                  key={opt.name}
                  type="button"
                  className="block w-full text-left px-2 py-1.5 text-sm hover:bg-slate-50"
                  onMouseDown={() => {
                    onUpdate('service_code', opt.name)
                    onUpdate('item_label', opt.label || opt.name)
                    setItemSearch('')
                    setItemOpen(false)
                  }}
                >
                  {opt.label || opt.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </td>
      <td className="px-3 py-2">
        <input
          type="number"
          min={0}
          step={0.01}
          value={row.amount}
          onChange={(e) => onUpdate('amount', e.target.value)}
          className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          placeholder="0"
        />
      </td>
      <td className="px-3 py-2">
        <input
          type="text"
          value={row.note}
          onChange={(e) => onUpdate('note', e.target.value)}
          className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          placeholder="Note"
        />
      </td>
      <td className="px-1 py-2">
        <button
          type="button"
          onClick={onRemove}
          className="p-1.5 text-slate-400 hover:text-red-600 rounded"
          aria-label="Remove row"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </td>
    </tr>
  )
}
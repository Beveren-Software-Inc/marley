import { useEffect, useRef, useState } from 'react'
import { ClipboardList } from 'lucide-react'
import {
  CM_BTN_OUTLINE_CANCEL,
  CM_BTN_OUTLINE_SAVE,
  CREATE_MODAL_BODY_GRADIENT,
  CREATE_MODAL_OVERLAY,
  CreateModalFooter,
  CreateModalHeader,
  MODAL_FIELD_CLASS,
  MODAL_LABEL_CLASS,
  MODAL_SECTION_CLASS,
  MODAL_SECTION_TITLE_CLASS,
  createModalShellClass,
} from '../ui/CreateModalChrome'
import {
  linkComboboxDropdownClassShort,
  linkComboboxInputClass,
  linkComboboxOptionClass,
} from '../ui/linkComboboxStyles'
import {
  fetchPatientVisit,
  fetchPatientVisitTypes,
  fetchPatientVisitChargeEditor,
  updatePatientVisit,
  updatePatientVisitCharge,
  type PatientVisit,
  type PatientVisitTypeOption,
  type PatientVisitChargeAvailableService,
} from '../../services/patientVisits'
import { fetchHealthcarePractitioners, fetchCostCenters, type LinkFieldOption } from '../../services/common'
import { useCareContext } from '../../providers/CareContextProvider'
import { useAuth } from '../../providers/AuthProvider'
import { isDoctorRole, isAdmin } from '../../config/permissions'
import { useBlockIfEditingLocked } from '../../hooks/useBlockIfEditingLocked'
import { useRejectEditModeWhenLocked } from '../../hooks/useRejectEditModeWhenLocked'
import { useFormatMoney } from '../../hooks/useFormatMoney'
import { toast } from '../../hooks/useToast'
import { DateFilterInput } from '../ui/DateFilterInput'

interface EditChargeRow {
  item_code: string
  item_name: string
  rate: number
  qty: number
  discount: number
}

interface EditPatientVisitModalProps {
  visitName: string
  onClose: () => void
  onSuccess: () => void
}

function normalizeTime(value?: string | null): string {
  if (!value) return ''
  const parts = value.split(':')
  if (parts.length >= 2) return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}`
  return value
}

export const EditPatientVisitModal = ({
  visitName,
  onClose,
  onSuccess,
}: EditPatientVisitModalProps) => {
  useRejectEditModeWhenLocked(true, onClose)
  const blockIfEditingLocked = useBlockIfEditingLocked()
  const { costCenterCompany } = useCareContext()
  const { user } = useAuth()
  const authRoles = user?.roles && user.roles.length > 0 ? user.roles : user?.role ? [user.role] : []
  const canEditPricing = isDoctorRole(authRoles) || isAdmin(authRoles)
  // Visit price & discount (doctor) — % and amount compute/validate each other.
  const [visitPrice, setVisitPrice] = useState('')
  const [discountPct, setDiscountPct] = useState('')
  const [discountAmt, setDiscountAmt] = useState('')
  const applyPct = (v: string) => {
    setDiscountPct(v)
    const p = parseFloat(visitPrice) || 0
    const pct = Math.min(100, Math.max(0, parseFloat(v) || 0))
    setDiscountAmt(p && v !== '' ? ((p * pct) / 100).toFixed(3) : v === '' ? '' : discountAmt)
  }
  const applyAmt = (v: string) => {
    setDiscountAmt(v)
    const p = parseFloat(visitPrice) || 0
    const amt = Math.max(0, parseFloat(v) || 0)
    setDiscountPct(p && v !== '' ? Math.min(100, (amt / p) * 100).toFixed(2) : v === '' ? '' : discountPct)
  }

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [visit, setVisit] = useState<PatientVisit | null>(null)

  const [practitioner, setPractitioner] = useState('')
  const [practQuery, setPractQuery] = useState('')
  const [practOptions, setPractOptions] = useState<LinkFieldOption[]>([])
  const [practOpen, setPractOpen] = useState(false)

  const [visitType, setVisitType] = useState('')
  const [visitTypeQuery, setVisitTypeQuery] = useState('')
  const [visitTypeOptions, setVisitTypeOptions] = useState<PatientVisitTypeOption[]>([])
  const [visitTypeOpen, setVisitTypeOpen] = useState(false)

  const [costCenter, setCostCenter] = useState('')
  const [costCenterQuery, setCostCenterQuery] = useState('')
  const [costCenterOptions, setCostCenterOptions] = useState<LinkFieldOption[]>([])
  const [costCenterOpen, setCostCenterOpen] = useState(false)

  const [encounterDate, setEncounterDate] = useState('')
  const [encounterTime, setEncounterTime] = useState('')
  const [encounterComment, setEncounterComment] = useState('')

  const formatMoney = useFormatMoney()
  const [chargeRows, setChargeRows] = useState<EditChargeRow[]>([])
  const [chargeEditable, setChargeEditable] = useState(true)
  const [chargeLockedReason, setChargeLockedReason] = useState<string | null>(null)
  const [chargeNoCharges, setChargeNoCharges] = useState(false)
  const [availableServices, setAvailableServices] = useState<PatientVisitChargeAvailableService[]>([])
  const [chargeLoaded, setChargeLoaded] = useState(false)
  const [chargeDirty, setChargeDirty] = useState(false)
  const [addServiceOpen, setAddServiceOpen] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchPatientVisit(visitName)
      .then((data) => {
        if (cancelled) return
        setVisit(data)
        setPractitioner(data.practitioner || '')
        setPractQuery(data.practitioner_name || data.practitioner || '')
        setVisitType(data.visit_type || '')
        setVisitTypeQuery(data.visit_type || '')
        setCostCenter(data.cost_center || '')
        setCostCenterQuery(data.cost_center || '')
        setEncounterDate(data.encounter_date || '')
        setEncounterTime(normalizeTime(data.encounter_time))
        setEncounterComment(data.encounter_comment || '')
        setVisitPrice((data as any).visit_price ? String((data as any).visit_price) : '')
        setDiscountPct((data as any).discount_percentage ? String((data as any).discount_percentage) : '')
        setDiscountAmt((data as any).discount_amount ? String((data as any).discount_amount) : '')
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load visit')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [visitName])

  useEffect(() => {
    let cancelled = false
    setChargeLoaded(false)
    fetchPatientVisitChargeEditor(visitName)
      .then((data) => {
        if (cancelled) return
        setChargeEditable(data.editable)
        setChargeLockedReason(data.locked_reason || null)
        setChargeNoCharges(data.no_charges)
        setAvailableServices(data.available_services || [])
        setChargeRows(
          (data.lines || []).map((l) => ({
            item_code: l.item_code,
            item_name: l.item_name || l.item_code,
            rate: l.rate || 0,
            qty: l.qty || 1,
            discount: l.discount || 0,
          })),
        )
        setChargeDirty(false)
      })
      .catch(() => {
        if (!cancelled) {
          setChargeRows([])
          setAvailableServices([])
        }
      })
      .finally(() => {
        if (!cancelled) setChargeLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [visitName])

  useEffect(() => {
    if (!practOpen && !practQuery) return
    const t = setTimeout(async () => {
      try {
        setPractOptions(await fetchHealthcarePractitioners(practQuery || undefined))
      } catch {
        setPractOptions([])
      }
    }, 300)
    return () => clearTimeout(t)
  }, [practOpen, practQuery])

  useEffect(() => {
    if (!visitTypeOpen) return
    const t = setTimeout(async () => {
      try {
        setVisitTypeOptions(await fetchPatientVisitTypes(visitTypeQuery || undefined))
      } catch {
        setVisitTypeOptions([])
      }
    }, visitTypeQuery.trim() ? 300 : 0)
    return () => clearTimeout(t)
  }, [visitTypeOpen, visitTypeQuery])

  useEffect(() => {
    if (!costCenterOpen) return
    fetchCostCenters(costCenterCompany, costCenterQuery || undefined)
      .then(setCostCenterOptions)
      .catch(() => setCostCenterOptions([]))
  }, [costCenterOpen, costCenterQuery, costCenterCompany])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setPractOpen(false)
        setVisitTypeOpen(false)
        setCostCenterOpen(false)
        setAddServiceOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const chargeRowNet = (row: EditChargeRow) =>
    Math.max(0, (row.rate || 0) - Math.max(0, Math.min(row.rate || 0, row.discount || 0)))
  const chargeTotal = chargeRows.reduce((sum, r) => sum + chargeRowNet(r), 0)

  const updateChargeRow = (idx: number, patch: Partial<EditChargeRow>) => {
    setChargeRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)))
    setChargeDirty(true)
  }
  const removeChargeRow = (idx: number) => {
    setChargeRows((prev) => prev.filter((_, i) => i !== idx))
    setChargeDirty(true)
  }
  const addChargeService = (svc: PatientVisitChargeAvailableService) => {
    setChargeRows((prev) => [
      ...prev,
      {
        item_code: svc.item_code,
        item_name: svc.item_name || svc.item_code,
        rate: svc.rate || 0,
        qty: 1,
        discount: 0,
      },
    ])
    setChargeDirty(true)
    setAddServiceOpen(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!visit) return
    setError(null)

    if (!practitioner) {
      setError('Practitioner is required')
      return
    }
    if (!encounterDate) {
      setError('Encounter date is required')
      return
    }
    if (!encounterTime) {
      setError('Encounter time is required')
      return
    }

    blockIfEditingLocked()
    setSaving(true)
    try {
      await updatePatientVisit(visit.name, {
        practitioner,
        encounter_date: encounterDate,
        encounter_time: encounterTime,
        visit_type: visitType || undefined,
        cost_center: costCenter || undefined,
        encounter_comment: encounterComment.trim() || undefined,
      })

      if (chargeEditable && chargeDirty) {
        await updatePatientVisitCharge(
          visit.name,
          chargeRows.map((r) => ({
            item_code: r.item_code,
            item_name: r.item_name,
            rate: r.rate,
            qty: r.qty || 1,
            discount: r.discount || 0,
          })),
        )
      }

      toast.success(`Visit ${visit.name} updated`)
      onSuccess()
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update visit'
      setError(msg)
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  if (loading || !visit) {
    return (
      <div className={CREATE_MODAL_OVERLAY}>
        <div className={createModalShellClass('max-w-2xl w-full')}>
          <div className="px-6 py-10 text-center text-sm text-slate-500">
            {error || 'Loading visit…'}
          </div>
        </div>
      </div>
    )
  }

  if (visit.status === 'Cancelled') {
    return (
      <div className={CREATE_MODAL_OVERLAY}>
        <div className={createModalShellClass('max-w-md w-full')}>
          <CreateModalHeader
            title="Edit Patient Visit"
            subtitle={visit.name}
            icon={<ClipboardList className="h-5 w-5 text-emerald-700" strokeWidth={2} />}
            onClose={onClose}
            alert="Cancelled visits cannot be edited."
          />
          <CreateModalFooter>
            <button type="button" onClick={onClose} className={CM_BTN_OUTLINE_CANCEL}>
              Close
            </button>
          </CreateModalFooter>
        </div>
      </div>
    )
  }

  return (
    <div className={CREATE_MODAL_OVERLAY}>
      <div ref={containerRef} className={createModalShellClass('max-w-2xl w-full max-h-[90vh]')}>
        <CreateModalHeader
          title="Edit Patient Visit"
          subtitle={`${visit.name} · ${visit.patient_name || visit.patient}`}
          icon={<ClipboardList className="h-5 w-5 text-emerald-700" strokeWidth={2} />}
          onClose={onClose}
          alert={error}
        />

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className={`${CREATE_MODAL_BODY_GRADIENT} px-5 py-5 sm:px-6 space-y-5 overflow-y-auto`}>
            <section className={MODAL_SECTION_CLASS}>
              <h3 className={MODAL_SECTION_TITLE_CLASS}>Visit information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-slate-600 mb-4">
                <div>
                  <span className="font-medium text-slate-700">Patient:</span>{' '}
                  {visit.patient_name || visit.patient}
                </div>
                <div>
                  <span className="font-medium text-slate-700">Status:</span> {visit.status}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="relative md:col-span-2">
                  <label className={MODAL_LABEL_CLASS}>
                    Doctor <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={
                      practitioner
                        ? practOptions.find((p) => p.name === practitioner)?.label ||
                          practQuery ||
                          practitioner
                        : practQuery
                    }
                    onChange={(e) => {
                      setPractQuery(e.target.value)
                      setPractOpen(true)
                      if (practitioner) setPractitioner('')
                    }}
                    onFocus={() => setPractOpen(true)}
                    placeholder="Search doctor..."
                    className={linkComboboxInputClass}
                    required
                  />
                  {practOpen && practOptions.length > 0 && (
                    <div className={linkComboboxDropdownClassShort}>
                      {practOptions.map((opt) => (
                        <button
                          key={opt.name}
                          type="button"
                          className={linkComboboxOptionClass}
                          onClick={() => {
                            setPractitioner(opt.name)
                            setPractQuery(opt.label)
                            setPractOpen(false)
                          }}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="relative">
                  <label className={MODAL_LABEL_CLASS}>Visit Type</label>
                  <input
                    type="text"
                    value={
                      visitType
                        ? visitTypeOptions.find((v) => v.name === visitType)?.visit_type ||
                          visitTypeQuery ||
                          visitType
                        : visitTypeQuery
                    }
                    onChange={(e) => {
                      setVisitTypeQuery(e.target.value)
                      setVisitTypeOpen(true)
                      if (visitType) setVisitType('')
                    }}
                    onFocus={() => setVisitTypeOpen(true)}
                    placeholder="Search visit type..."
                    className={linkComboboxInputClass}
                  />
                  {visitTypeOpen && visitTypeOptions.length > 0 && (
                    <div className={linkComboboxDropdownClassShort}>
                      {visitTypeOptions.map((opt) => (
                        <button
                          key={opt.name}
                          type="button"
                          className={linkComboboxOptionClass}
                          onClick={() => {
                            setVisitType(opt.name)
                            setVisitTypeQuery(opt.visit_type || opt.name)
                            setVisitTypeOpen(false)
                          }}
                        >
                          {opt.visit_type || opt.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="relative">
                  <label className={MODAL_LABEL_CLASS}>Branch</label>
                  <input
                    type="text"
                    value={
                      costCenter
                        ? costCenterOptions.find((c) => c.name === costCenter)?.label ||
                          costCenterQuery ||
                          costCenter
                        : costCenterQuery
                    }
                    onChange={(e) => {
                      setCostCenterQuery(e.target.value)
                      setCostCenterOpen(true)
                      setCostCenter('')
                    }}
                    onFocus={() => setCostCenterOpen(true)}
                    placeholder="Search branch..."
                    className={linkComboboxInputClass}
                  />
                  {costCenterOpen && costCenterOptions.length > 0 && (
                    <div className={linkComboboxDropdownClassShort}>
                      {costCenterOptions.map((opt) => (
                        <button
                          key={opt.name}
                          type="button"
                          className={linkComboboxOptionClass}
                          onClick={() => {
                            setCostCenter(opt.name)
                            setCostCenterQuery(opt.label || opt.name)
                            setCostCenterOpen(false)
                          }}
                        >
                          {opt.label || opt.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <label className={MODAL_LABEL_CLASS}>
                    Encounter Date <span className="text-red-500">*</span>
                  </label>
                  <DateFilterInput
                    value={encounterDate}
                    onChange={(e) => setEncounterDate(e.target.value)}
                    className={MODAL_FIELD_CLASS}
                    required
                  />
                </div>

                <div>
                  <label className={MODAL_LABEL_CLASS}>
                    Encounter Time <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="time"
                    value={encounterTime}
                    onChange={(e) => setEncounterTime(e.target.value)}
                    className={MODAL_FIELD_CLASS}
                    required
                  />
                </div>

                {canEditPricing && (
                  <div className="md:col-span-2 grid grid-cols-1 gap-3 rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 sm:grid-cols-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Visit Price</label>
                      <input
                        type="number"
                        min="0"
                        step="0.001"
                        value={visitPrice}
                        onChange={(e) => setVisitPrice(e.target.value)}
                        placeholder="Configured rate"
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Discount (%)</label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={discountPct}
                        onChange={(e) => applyPct(e.target.value)}
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Discount Amount</label>
                      <input
                        type="number"
                        min="0"
                        step="0.001"
                        value={discountAmt}
                        onChange={(e) => applyAmt(e.target.value)}
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                  </div>
                )}
                <div className="md:col-span-2">
                  <label className={MODAL_LABEL_CLASS}>Review Details</label>
                  <textarea
                    value={encounterComment}
                    onChange={(e) => setEncounterComment(e.target.value)}
                    rows={4}
                    placeholder="Encounter comment / review details..."
                    className={`${MODAL_FIELD_CLASS} resize-y min-h-[96px]`}
                  />
                </div>
              </div>
            </section>

            {chargeLoaded && !chargeNoCharges && (chargeRows.length > 0 || availableServices.length > 0) && (
              <section className={MODAL_SECTION_CLASS}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className={MODAL_SECTION_TITLE_CLASS}>Services &amp; discounts</h3>
                  <span className="text-xs text-slate-500">
                    Total{' '}
                    <span className="font-semibold text-slate-800">{formatMoney(chargeTotal)}</span>
                  </span>
                </div>

                {!chargeEditable && (
                  <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                    {chargeLockedReason === 'invoiced'
                      ? 'This visit charge has already been invoiced, so services can no longer be changed.'
                      : 'This visit charge can no longer be edited.'}
                  </div>
                )}

                <div className="space-y-2">
                  {chargeRows.length === 0 && (
                    <p className="text-xs text-slate-500">No services on this visit charge.</p>
                  )}
                  {chargeRows.map((row, idx) => {
                    const net = chargeRowNet(row)
                    const discounted = net < (row.rate || 0)
                    return (
                      <div
                        key={`${row.item_code}-${idx}`}
                        className="rounded-md border border-slate-200 bg-white px-2.5 py-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium text-slate-800 truncate">
                              {row.item_name}
                            </div>
                            {!chargeEditable && (
                              <div className="mt-0.5 text-xs text-slate-500">
                                <span className={discounted ? 'line-through' : 'font-semibold text-slate-700'}>
                                  {formatMoney(row.rate || 0)}
                                </span>
                                {discounted && (
                                  <span className="ml-1 font-semibold text-slate-800">{formatMoney(net)}</span>
                                )}
                              </div>
                            )}
                          </div>
                          {chargeEditable && (
                            <button
                              type="button"
                              className="shrink-0 text-slate-400 hover:text-red-500 leading-none"
                              onClick={() => removeChargeRow(idx)}
                              title="Remove service"
                              aria-label="Remove service"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          )}
                        </div>
                        {chargeEditable && (
                          <div className="mt-2 flex flex-wrap items-center gap-3">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs text-slate-500">Price</span>
                              <input
                                type="number"
                                min={0}
                                step="any"
                                className="w-24 rounded border border-slate-300 px-2 py-1 text-xs focus:border-primary focus:ring-primary"
                                value={row.rate || ''}
                                placeholder="0"
                                onChange={(e) =>
                                  updateChargeRow(idx, { rate: parseFloat(e.target.value) || 0 })
                                }
                              />
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs text-slate-500">Discount</span>
                              <input
                                type="number"
                                min={0}
                                max={row.rate || undefined}
                                step="any"
                                className="w-24 rounded border border-slate-300 px-2 py-1 text-xs focus:border-primary focus:ring-primary"
                                value={row.discount || ''}
                                placeholder="0"
                                onChange={(e) =>
                                  updateChargeRow(idx, { discount: parseFloat(e.target.value) || 0 })
                                }
                              />
                            </div>
                            {discounted && (
                              <div className="text-xs text-slate-600">
                                Net: <span className="font-semibold">{formatMoney(net)}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                {chargeEditable && availableServices.some(
                  (s) => !chargeRows.find((r) => r.item_code === s.item_code),
                ) && (
                  <div className="relative mt-3">
                    <button
                      type="button"
                      onClick={() => setAddServiceOpen((o) => !o)}
                      className="text-xs font-medium text-primary hover:text-primary/80"
                    >
                      + Add service
                    </button>
                    {addServiceOpen && (
                      <div className="absolute z-10 mt-1 w-64 rounded-md border border-slate-200 bg-white shadow-lg max-h-48 overflow-auto">
                        {availableServices
                          .filter((s) => !chargeRows.find((r) => r.item_code === s.item_code))
                          .map((svc) => (
                            <button
                              key={svc.item_code}
                              type="button"
                              className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50"
                              onClick={() => addChargeService(svc)}
                            >
                              <div className="font-medium">{svc.item_name || svc.item_code}</div>
                              <div className="text-xs text-slate-500">{formatMoney(svc.rate || 0)}</div>
                            </button>
                          ))}
                      </div>
                    )}
                  </div>
                )}
              </section>
            )}
          </div>

          <CreateModalFooter>
            <button type="button" onClick={onClose} disabled={saving} className={CM_BTN_OUTLINE_CANCEL}>
              Cancel
            </button>
            <button type="submit" disabled={saving} className={CM_BTN_OUTLINE_SAVE}>
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </CreateModalFooter>
        </form>
      </div>
    </div>
  )
}

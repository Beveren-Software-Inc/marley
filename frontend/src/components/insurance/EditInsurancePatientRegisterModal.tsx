import { useState, useCallback, useEffect } from 'react'
import { Pencil } from 'lucide-react'
import {
  CM_BTN_CANCEL,
  CM_BTN_PRIMARY,
  CREATE_MODAL_BODY_GRADIENT,
  CREATE_MODAL_OVERLAY,
  CreateModalFooter,
  CreateModalHeader,
  MODAL_FIELD_CLASS,
  MODAL_LABEL_CLASS,
  MODAL_SECTION_CLASS,
  MODAL_SECTION_TITLE_CLASS,
  MODAL_SELECT_CLASS,
  createModalShellClass,
} from '../ui/CreateModalChrome'
import {
  fetchHealthcareInsurance,
  updateInsurancePatientRegister,
  type InsurancePatientRegisterRow,
  type LinkFieldOption,
} from '../../services/common'
import { toast } from '../../hooks/useToast'
import { useRejectEditModeWhenLocked } from '../../hooks/useRejectEditModeWhenLocked'
import { useBlockIfEditingLocked } from '../../hooks/useBlockIfEditingLocked'
import {
  linkComboboxDropdownClass,
  linkComboboxInputWithClearClass,
  linkComboboxOptionClassCompact,
} from '../ui/linkComboboxStyles'
import { DateFilterInput } from '../ui/DateFilterInput'

const STATUS_OPTIONS = ['Unused', 'Active', 'Exhausted', 'Expired', 'Cancelled']

function toDateInputValue(value?: string | null): string {
  if (!value) return ''
  return value.slice(0, 10)
}

interface EditInsurancePatientRegisterModalProps {
  register: InsurancePatientRegisterRow
  onClose: () => void
  onSuccess?: (record: InsurancePatientRegisterRow) => void
}

export const EditInsurancePatientRegisterModal = ({
  register,
  onClose,
  onSuccess,
}: EditInsurancePatientRegisterModalProps) => {
  const blockIfEditingLocked = useBlockIfEditingLocked()
  useRejectEditModeWhenLocked(true, onClose)
  const [fullName, setFullName] = useState(register.full_name || '')
  const [nationalId, setNationalId] = useState(register.national_id_cpr_no || '')
  const [postingDate, setPostingDate] = useState(toDateInputValue(register.posting_date))
  const [status, setStatus] = useState(register.status || 'Unused')
  const [approvalId, setApprovalId] = useState(register.approval_id || '')
  const [approvalValidityDays, setApprovalValidityDays] = useState(
    register.approval_validitydays != null ? String(register.approval_validitydays) : ''
  )
  const [noOfVisits, setNoOfVisits] = useState(register.no_of_visits || '')

  const [insuranceOpts, setInsuranceOpts] = useState<LinkFieldOption[]>([])
  const [insuranceOpen, setInsuranceOpen] = useState(false)
  const [insuranceQuery, setInsuranceQuery] = useState(register.insurance_provider || '')
  const [selectedInsurance, setSelectedInsurance] = useState<LinkFieldOption | null>(
    register.insurance_provider
      ? { name: register.insurance_provider, label: register.insurance_provider }
      : null
  )

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadInsurance = useCallback(async (q?: string) => {
    const opts = await fetchHealthcareInsurance(q)
    setInsuranceOpts(opts)
  }, [])

  useEffect(() => {
    void loadInsurance()
  }, [loadInsurance])

  const closeDropdowns = () => setInsuranceOpen(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      blockIfEditingLocked()
    } catch {
      return
    }
    if (!fullName.trim()) {
      setError('Full Name is required')
      return
    }
    if (!selectedInsurance) {
      setError('Insurance Provider is required')
      return
    }

    try {
      setSaving(true)
      setError(null)
      const updated = await updateInsurancePatientRegister({
        name: register.name,
        full_name: fullName.trim(),
        national_id_cpr_no: nationalId.trim() || null,
        posting_date: postingDate || null,
        status,
        insurance_provider: selectedInsurance.name,
        approval_id: approvalId.trim() || null,
        approval_validitydays: approvalValidityDays ? parseInt(approvalValidityDays, 10) : null,
        no_of_visits: noOfVisits.trim() || null,
      })
      toast.success(`Register ${register.name} updated`, 3000)
      onSuccess?.(updated)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update record')
    } finally {
      setSaving(false)
    }
  }

  const visitsUsed = register.no_of_patient_visit ?? 0

  return (
    <div
      className={CREATE_MODAL_OVERLAY}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className={createModalShellClass('w-full max-w-4xl flex flex-col max-h-[94vh] min-h-[min(560px,90vh)]')}
        onClick={(e) => {
          e.stopPropagation()
          closeDropdowns()
        }}
      >
        <CreateModalHeader
          title="Edit Insurance Patient Register"
          subtitle={register.name}
          icon={<Pencil className="h-5 w-5 text-emerald-700" strokeWidth={2} />}
          onClose={onClose}
          alert={error}
        />

        <form
          onSubmit={handleSubmit}
          className={`${CREATE_MODAL_BODY_GRADIENT} flex flex-col flex-1 min-h-0`}
        >
          <div
            className="flex-1 overflow-y-auto px-5 py-5 space-y-5 sm:px-6"
            style={{ scrollbarWidth: 'thin' }}
          >
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <div className={`${MODAL_SECTION_CLASS} space-y-3`}>
                <h3 className={MODAL_SECTION_TITLE_CLASS}>Patient Information</h3>

                <div>
                  <label className={MODAL_LABEL_CLASS}>Register No</label>
                  <input
                    type="text"
                    value={register.name}
                    readOnly
                    className={`${MODAL_FIELD_CLASS} bg-slate-50 text-slate-600`}
                  />
                </div>

                <div>
                  <label className={MODAL_LABEL_CLASS}>
                    Full Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className={MODAL_FIELD_CLASS}
                  />
                </div>

                <div>
                  <label className={MODAL_LABEL_CLASS}>National ID / CPR No</label>
                  <input
                    type="text"
                    value={nationalId}
                    onChange={(e) => setNationalId(e.target.value)}
                    className={MODAL_FIELD_CLASS}
                  />
                </div>

                <div>
                  <label className={MODAL_LABEL_CLASS}>Linked Patient</label>
                  <input
                    type="text"
                    value={register.patient || 'Not linked'}
                    readOnly
                    className={`${MODAL_FIELD_CLASS} bg-slate-50 text-slate-600`}
                  />
                </div>

                <div>
                  <label className={MODAL_LABEL_CLASS}>Posting Date</label>
                  <DateFilterInput
                    value={postingDate}
                    onChange={(e) => setPostingDate(e.target.value)}
                    className={MODAL_FIELD_CLASS}
                  />
                </div>
              </div>

              <div className={`${MODAL_SECTION_CLASS} space-y-3`}>
                <h3 className={MODAL_SECTION_TITLE_CLASS}>Insurance Details</h3>

                <div onClick={(e) => e.stopPropagation()}>
                  <label className={MODAL_LABEL_CLASS}>
                    Insurance Provider <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={selectedInsurance ? selectedInsurance.label || selectedInsurance.name : insuranceQuery}
                      onChange={(e) => {
                        setInsuranceQuery(e.target.value)
                        setSelectedInsurance(null)
                        setInsuranceOpen(true)
                        void loadInsurance(e.target.value)
                      }}
                      onFocus={() => {
                        setInsuranceOpen(true)
                        void loadInsurance()
                      }}
                      placeholder="Search insurance provider…"
                      className={`${linkComboboxInputWithClearClass} pr-7`}
                    />
                    {(selectedInsurance || insuranceQuery) && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedInsurance(null)
                          setInsuranceQuery('')
                        }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
                      >
                        ✕
                      </button>
                    )}
                    {insuranceOpen && insuranceOpts.length > 0 && (
                      <div className={linkComboboxDropdownClass}>
                        {insuranceOpts.map((o) => (
                          <button
                            key={o.name}
                            type="button"
                            onClick={() => {
                              setSelectedInsurance(o)
                              setInsuranceQuery(o.label || o.name)
                              setInsuranceOpen(false)
                            }}
                            className={linkComboboxOptionClassCompact}
                          >
                            {o.label || o.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={MODAL_LABEL_CLASS}>Approval ID</label>
                    <input
                      type="text"
                      value={approvalId}
                      onChange={(e) => setApprovalId(e.target.value)}
                      placeholder="Approval reference"
                      className={MODAL_FIELD_CLASS}
                    />
                  </div>
                  <div>
                    <label className={MODAL_LABEL_CLASS}>Approval Validity (Days)</label>
                    <input
                      type="number"
                      value={approvalValidityDays}
                      onChange={(e) => setApprovalValidityDays(e.target.value)}
                      placeholder="e.g. 30"
                      min="0"
                      className={MODAL_FIELD_CLASS}
                    />
                  </div>
                  <div>
                    <label className={MODAL_LABEL_CLASS}>No. of Visits</label>
                    <input
                      type="text"
                      value={noOfVisits}
                      onChange={(e) => setNoOfVisits(e.target.value)}
                      placeholder="e.g. 10"
                      className={MODAL_FIELD_CLASS}
                    />
                  </div>
                  <div>
                    <label className={MODAL_LABEL_CLASS}>Visits Used</label>
                    <input
                      type="text"
                      value={String(visitsUsed)}
                      readOnly
                      className={`${MODAL_FIELD_CLASS} bg-slate-50 text-slate-600`}
                    />
                  </div>
                  <div className="col-span-2">
                    <label className={MODAL_LABEL_CLASS}>Status</label>
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value)}
                      className={MODAL_SELECT_CLASS}
                    >
                      {STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <CreateModalFooter>
            <button type="button" onClick={onClose} className={CM_BTN_CANCEL}>
              Cancel
            </button>
            <button type="submit" disabled={saving} className={CM_BTN_PRIMARY}>
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </CreateModalFooter>
        </form>
      </div>
    </div>
  )
}

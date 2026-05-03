import { useState, useCallback } from 'react'
import {
  CM_BTN_CANCEL,
  CM_BTN_PRIMARY,
  CREATE_MODAL_OVERLAY,
  createModalShellClass,
} from '../ui/CreateModalChrome'
import { apiRequest } from '../../services/apiClient'
import { fetchHealthcareInsurance, type LinkFieldOption } from '../../services/common'

const STATUS_OPTIONS = ['Unused', 'Active', 'Exhausted', 'Expired', 'Cancelled']

interface CreateInsurancePatientRegisterModalProps {
  onClose: () => void
  onSuccess?: (record: { name: string; full_name: string; insurance_provider: string; national_id_cpr_no: string }) => void
}

export const CreateInsurancePatientRegisterModal = ({
  onClose,
  onSuccess,
}: CreateInsurancePatientRegisterModalProps) => {
  const [fullName, setFullName] = useState('')
  const [nationalId, setNationalId] = useState('')
  const [postingDate, setPostingDate] = useState(new Date().toISOString().split('T')[0])
  const [status, setStatus] = useState('Unused')
  const [approvalId, setApprovalId] = useState('')
  const [approvalValidityDays, setApprovalValidityDays] = useState('')
  const [noOfVisits, setNoOfVisits] = useState('')

  const [insuranceOpts, setInsuranceOpts] = useState<LinkFieldOption[]>([])
  const [insuranceOpen, setInsuranceOpen] = useState(false)
  const [insuranceQuery, setInsuranceQuery] = useState('')
  const [selectedInsurance, setSelectedInsurance] = useState<LinkFieldOption | null>(null)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadInsurance = useCallback(async (q?: string) => {
    const opts = await fetchHealthcareInsurance(q)
    setInsuranceOpts(opts)
  }, [])

  const closeDropdowns = () => setInsuranceOpen(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!fullName.trim()) { setError('Full Name is required'); return }
    if (!selectedInsurance) { setError('Insurance Provider is required'); return }

    try {
      setSaving(true)
      setError(null)
      const created = await apiRequest<{ name: string; full_name: string; insurance_provider: string; national_id_cpr_no: string }>(
        '/api/resource/Insurance%20Patient%20Register',
        {
          method: 'POST',
          body: JSON.stringify({
            full_name: fullName.trim(),
            national_id_cpr_no: nationalId.trim() || null,
            posting_date: postingDate || null,
            status,
            insurance_provider: selectedInsurance.name,
            approval_id: approvalId.trim() || null,
            approval_validitydays: approvalValidityDays ? parseInt(approvalValidityDays) : null,
            no_of_visits: noOfVisits.trim() || null,
          }),
        }
      )
      onSuccess?.(created)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create record')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className={CREATE_MODAL_OVERLAY}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className={createModalShellClass('w-full max-w-lg flex flex-col h-[85vh]')}
        onClick={e => { e.stopPropagation(); closeDropdowns() }}
      >
        {/* Header */}
        <div className="relative shrink-0 border-b border-emerald-100/60 bg-gradient-to-r from-emerald-100 via-teal-50 to-sky-100 px-6 py-4 flex flex-shrink-0 items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-emerald-950">New Insurance Patient Register</h2>
            <p className="text-xs text-slate-500 mt-0.5">Register a patient's insurance for tracking visits and approvals</p>
          </div>
          <button onClick={onClose} className="shrink-0 rounded-lg p-2 text-emerald-800/70 transition hover:bg-emerald-200/50 hover:text-emerald-950">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4" style={{ scrollbarWidth: 'thin' }}>

            {/* Patient Info */}
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-4 space-y-3">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Patient Information</h3>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text" value={fullName} onChange={e => setFullName(e.target.value)}
                  placeholder="e.g. John Michael Smith"
                  className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">National ID / CPR No</label>
                <input
                  type="text" value={nationalId} onChange={e => setNationalId(e.target.value)}
                  placeholder="e.g. 880101-1234"
                  className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>

            {/* Insurance Details */}
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-4 space-y-3">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Insurance Details</h3>

              {/* Insurance Provider combobox */}
              <div onClick={e => e.stopPropagation()}>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Insurance Provider <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={insuranceQuery}
                    onChange={e => { setInsuranceQuery(e.target.value); setSelectedInsurance(null); setInsuranceOpen(true); loadInsurance(e.target.value) }}
                    onFocus={() => { setInsuranceOpen(true); loadInsurance() }}
                    placeholder="Search insurance provider…"
                    className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary pr-7"
                  />
                  {insuranceQuery && (
                    <button type="button" onClick={() => { setSelectedInsurance(null); setInsuranceQuery('') }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs">✕</button>
                  )}
                  {insuranceOpen && insuranceOpts.length > 0 && (
                    <div className="absolute z-20 w-full mt-1 bg-white border border-slate-300 rounded shadow-lg max-h-44 overflow-y-auto">
                      {insuranceOpts.map(o => (
                        <button key={o.name} type="button"
                          onClick={() => { setSelectedInsurance(o); setInsuranceQuery(o.label || o.name); setInsuranceOpen(false) }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100">
                          <div className="font-medium">{o.label || o.name}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Approval ID</label>
                  <input type="text" value={approvalId} onChange={e => setApprovalId(e.target.value)}
                    placeholder="Approval reference"
                    className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Approval Validity (Days)</label>
                  <input type="number" value={approvalValidityDays} onChange={e => setApprovalValidityDays(e.target.value)}
                    placeholder="e.g. 30" min="0"
                    className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">No. of Visits</label>
                  <input type="text" value={noOfVisits} onChange={e => setNoOfVisits(e.target.value)}
                    placeholder="e.g. 10"
                    className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Status</label>
                  <select value={status} onChange={e => setStatus(e.target.value)}
                    className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white">
                    {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* Posting Date */}
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Posting Date</label>
              <input type="date" value={postingDate} onChange={e => setPostingDate(e.target.value)}
                className="rounded border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
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
                {saving ? 'Creating…' : 'Create Register'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { toast } from '../../hooks/useToast'
import { DateFilterInput } from '../ui/DateFilterInput'
import { fetchMedicalSupervisionTemplates } from '../../services/inpatientRecords'
import {
  activateMedicalSupervision,
  createMedicalSupervision,
  fetchAdmissionMedicalSupervision,
  generateMedicalSupervisionCharges,
  stopMedicalSupervision,
  type MedicalSupervisionStatus,
} from '../../services/medicalSupervision'

interface ModifyMedicalSupervisionModalProps {
  admission: string
  patientName?: string
  onClose: () => void
  onSaved?: () => void
}

type MsTemplate = {
  name: string
  service_name?: string
  item_code?: string
  rate: number
  default_medical_supervision?: number
}

function todayIso() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function ModifyMedicalSupervisionModal({
  admission,
  patientName,
  onClose,
  onSaved,
}: ModifyMedicalSupervisionModalProps) {
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<MedicalSupervisionStatus | null>(null)
  const [templates, setTemplates] = useState<MsTemplate[]>([])
  const [template, setTemplate] = useState('')
  const [amount, setAmount] = useState('')
  const [fromDate, setFromDate] = useState(todayIso())
  const [toDate, setToDate] = useState(todayIso())
  const [days, setDays] = useState('1')
  const [mode, setMode] = useState<'range' | 'days'>('days')

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.name === template) || null,
    [templates, template],
  )

  const load = async () => {
    setLoading(true)
    try {
      const [st, tpls] = await Promise.all([
        fetchAdmissionMedicalSupervision(admission),
        fetchMedicalSupervisionTemplates(),
      ])
      setStatus(st)
      setTemplates(tpls)
      const def =
        tpls.find((t) => t.name === st.active_template) ||
        tpls.find((t) => t.name === st.med_supr_service_code) ||
        tpls.find((t) => Number(t.default_medical_supervision) === 1) ||
        tpls[0]
      if (def) {
        setTemplate(def.name)
        setAmount(String(st.active_amount ?? def.rate ?? 0))
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load Medical Supervision')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admission])

  useEffect(() => {
    if (!selectedTemplate) return
    if (status?.active_template === selectedTemplate.name && status.active_amount != null) return
    setAmount(String(selectedTemplate.rate ?? 0))
  }, [selectedTemplate?.name]) // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (action: () => Promise<MedicalSupervisionStatus>, okFallback: string) => {
    setBusy(true)
    try {
      const result = await action()
      setStatus(result)
      toast.success(result.message || okFallback)
      onSaved?.()
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Action failed')
    } finally {
      setBusy(false)
    }
  }

  const amountNum = amount === '' ? undefined : Math.max(0, parseFloat(amount) || 0)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl max-h-[90vh] flex flex-col">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Modify Medical Supervision</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              {patientName || admission}
              {status?.continuous_active ? (
                <span className="ml-2 inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
                  Continuous active
                </span>
              ) : (
                <span className="ml-2 inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                  Not continuous
                </span>
              )}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4 space-y-4 flex-1">
          {loading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : (
            <>
              {status?.active_service_request && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  <div>
                    Active SR:{' '}
                    <span className="font-medium">{status.active_service_request}</span>
                  </div>
                  {status.active_template && (
                    <div className="text-xs text-slate-500 mt-0.5">
                      Service: {status.active_template}
                      {status.active_amount != null
                        ? ` · ${Number(status.active_amount).toLocaleString()} BHD`
                        : ''}
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Medical Supervision Service
                </label>
                <select
                  value={template}
                  onChange={(e) => setTemplate(e.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                >
                  <option value="">Select service…</option>
                  {templates.map((t) => (
                    <option key={t.name} value={t.name}>
                      {(t.item_code || t.name)
                        + (t.service_name ? ` — ${t.service_name}` : '')
                        + (Number(t.default_medical_supervision) === 1 ? ' (default)' : '')}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Amount (IP)</label>
                <div className="relative max-w-[12rem]">
                  <input
                    type="number"
                    min="0"
                    step="0.001"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 pr-12 text-sm"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-slate-400">
                    BHD
                  </span>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 p-3 space-y-3">
                <p className="text-sm font-medium text-slate-800">Generate charges</p>
                <div className="flex gap-3 text-sm">
                  <label className="inline-flex items-center gap-1.5">
                    <input
                      type="radio"
                      checked={mode === 'days'}
                      onChange={() => setMode('days')}
                    />
                    Last N days
                  </label>
                  <label className="inline-flex items-center gap-1.5">
                    <input
                      type="radio"
                      checked={mode === 'range'}
                      onChange={() => setMode('range')}
                    />
                    Date range
                  </label>
                </div>
                {mode === 'days' ? (
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">Days (ending today)</label>
                    <input
                      type="number"
                      min="1"
                      value={days}
                      onChange={(e) => setDays(e.target.value)}
                      className="w-28 rounded-md border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-slate-600 mb-1">From</label>
                      <DateFilterInput
                        value={fromDate}
                        onChange={(e) => setFromDate(e.target.value)}
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-600 mb-1">To</label>
                      <DateFilterInput
                        value={toDate}
                        onChange={(e) => setToDate(e.target.value)}
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      />
                    </div>
                  </div>
                )}
              </div>

              <p className="text-xs text-slate-500">
                Continuous Medical Supervision stays on until you stop it. The nightly job bills each
                day while the Service Request flag <code>is_continous_medical_supervision</code> is
                ticked.
              </p>
            </>
          )}
        </div>

        <div className="border-t border-slate-200 px-5 py-4 flex flex-wrap gap-2 justify-end bg-white">
          <button
            type="button"
            disabled={busy || loading || !template}
            onClick={() =>
              void run(
                () =>
                  createMedicalSupervision({
                    admission,
                    template,
                    amount: amountNum,
                    continuous: true,
                    billToday: true,
                  }),
                'Medical Supervision created',
              )
            }
            className="px-3 py-2 text-sm font-medium rounded-md border border-slate-300 text-slate-800 hover:bg-slate-50 disabled:opacity-50"
          >
            Create
          </button>
          <button
            type="button"
            disabled={busy || loading}
            onClick={() =>
              void run(
                () =>
                  activateMedicalSupervision({
                    admission,
                    template: template || undefined,
                    amount: amountNum,
                  }),
                'Medical Supervision activated',
              )
            }
            className="px-3 py-2 text-sm font-medium rounded-md border border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100 disabled:opacity-50"
          >
            Activate
          </button>
          <button
            type="button"
            disabled={busy || loading || !status?.continuous_active}
            onClick={() =>
              void run(() => stopMedicalSupervision({ admission }), 'Medical Supervision stopped')
            }
            className="px-3 py-2 text-sm font-medium rounded-md border border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 disabled:opacity-50"
          >
            Stop
          </button>
          <button
            type="button"
            disabled={busy || loading || !template}
            onClick={() =>
              void run(
                () =>
                  generateMedicalSupervisionCharges({
                    admission,
                    template,
                    amount: amountNum,
                    ...(mode === 'days'
                      ? { days: Math.max(1, parseInt(days, 10) || 1) }
                      : { fromDate, toDate }),
                  }),
                'Charges generated',
              )
            }
            className="px-3 py-2 text-sm font-medium rounded-md bg-primary text-white hover:bg-primary/90 disabled:opacity-50"
          >
            Generate for days
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 text-sm font-medium rounded-md text-slate-600 hover:bg-slate-100"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

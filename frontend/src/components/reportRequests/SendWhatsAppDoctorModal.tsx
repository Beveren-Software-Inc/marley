import { useCallback, useEffect, useRef, useState } from 'react'
import {
  CM_BTN_CANCEL,
  CM_BTN_PRIMARY,
  CREATE_MODAL_OVERLAY,
  createModalShellClass,
} from '../ui/CreateModalChrome'
import {
  getReportRequestWhatsAppPreview,
  sendReportRequestDoctorWhatsApp,
  type ReportRequestRow,
  type ReportRequestWhatsAppPreview,
  type ReportRequestWhatsAppTemplateOption,
} from '../../services/reportRequests'
import { fetchDoctorPractitioners, type LinkFieldOption } from '../../services/common'
import { toast } from '../../hooks/useToast'

interface SendWhatsAppDoctorModalProps {
  reportRequest: ReportRequestRow
  onClose: () => void
  onSuccess?: () => void
}

/**
 * Reception → doctor WhatsApp notification for a Report Request (medical request).
 * The number is resolved from the Healthcare Practitioner record and can be edited
 * before sending.
 */
export function SendWhatsAppDoctorModal({
  reportRequest,
  onClose,
  onSuccess,
}: SendWhatsAppDoctorModalProps) {
  const [doctors, setDoctors] = useState<LinkFieldOption[]>([])
  const [doctorsLoading, setDoctorsLoading] = useState(false)
  const [doctor, setDoctor] = useState('')
  const [doctorName, setDoctorName] = useState('')
  const [doctorQuery, setDoctorQuery] = useState('')
  const [doctorOpen, setDoctorOpen] = useState(false)
  const doctorDropRef = useRef<HTMLUListElement>(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [phone, setPhone] = useState('')
  const [countryHint, setCountryHint] = useState('')
  const [countryIsd, setCountryIsd] = useState('')
  const [templates, setTemplates] = useState<ReportRequestWhatsAppTemplateOption[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState<string>('')
  const [preview, setPreview] = useState<ReportRequestWhatsAppPreview['preview']>(null)
  const [parameters, setParameters] = useState<string[]>([])
  /** Once reception edits the number we stop overwriting it with the resolved one. */
  const phoneEditedRef = useRef(false)

  const patientName = reportRequest.patient_name || reportRequest.patient || reportRequest.name

  // Debounced practitioner search (mirrors CreatePatientReferralModal).
  useEffect(() => {
    if (!doctorOpen) return
    let cancelled = false
    const query = doctorQuery.trim()
    const timer = setTimeout(
      () => {
        setDoctorsLoading(true)
        fetchDoctorPractitioners(query || undefined)
          .then((opts) => {
            if (!cancelled) setDoctors(opts || [])
          })
          .catch(() => {
            if (!cancelled) setDoctors([])
          })
          .finally(() => {
            if (!cancelled) setDoctorsLoading(false)
          })
      },
      query === '' ? 0 : 300,
    )
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [doctorQuery, doctorOpen])

  const applyPreview = useCallback((data: ReportRequestWhatsAppPreview) => {
    setTemplates(data.templates || [])
    setDoctorName(data.doctor_name || '')
    setSelectedTemplate(data.selected_template || '')
    setPreview(data.preview)
    setParameters(data.parameters || [])
    if (!phoneEditedRef.current) {
      setPhone(data.phone_number || '')
    }
    if (data.country && data.country_isd) {
      setCountryHint(`${data.country} (+${data.country_isd})`)
      setCountryIsd(data.country_isd)
    } else if (data.country_isd) {
      setCountryHint(`+${data.country_isd}`)
      setCountryIsd(data.country_isd)
    } else {
      setCountryHint('')
      setCountryIsd('')
    }
  }, [])

  const loadPreview = useCallback(
    async (doctorValue: string, templateName?: string) => {
      setLoading(true)
      setError(null)
      try {
        const data = await getReportRequestWhatsAppPreview(reportRequest.name, {
          doctor: doctorValue || undefined,
          templateName,
        })
        applyPreview(data)
        // Auto-fill the message when the mapping exposes a single template.
        if (!templateName && !data.selected_template && data.templates.length === 1) {
          const only = data.templates[0].name
          const filled = await getReportRequestWhatsAppPreview(reportRequest.name, {
            doctor: doctorValue || undefined,
            templateName: only,
          })
          applyPreview(filled)
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to load WhatsApp preview'
        setError(msg)
      } finally {
        setLoading(false)
      }
    },
    [reportRequest.name, applyPreview],
  )

  // Load template list + branch country on open (no doctor selected yet).
  useEffect(() => {
    void loadPreview('')
  }, [loadPreview])

  const handleDoctorChange = async (value: string) => {
    setDoctor(value)
    phoneEditedRef.current = false
    if (!value) {
      setDoctorName('')
      setPhone('')
      setPreview(null)
      setParameters([])
      return
    }
    await loadPreview(value)
  }

  const handleTemplateChange = async (value: string) => {
    setSelectedTemplate(value)
    if (!value) {
      setPreview(null)
      setParameters([])
      return
    }
    await loadPreview(doctor, value)
  }

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedPhone = phone.trim()
    if (!doctor) {
      setError('Select the doctor to notify')
      return
    }
    if (!trimmedPhone) {
      setError("Enter the doctor's WhatsApp number")
      return
    }
    if (templates.length === 0) {
      setError('No approved WhatsApp template mapped for report requests')
      return
    }
    if (templates.length > 1 && !selectedTemplate) {
      setError('Select a template to send')
      return
    }

    const templateToSend = selectedTemplate || templates[0]?.name
    setSending(true)
    setError(null)
    try {
      await sendReportRequestDoctorWhatsApp(reportRequest.name, {
        doctor,
        phone_number: trimmedPhone,
        template_name: templateToSend,
        template_parameters: parameters,
      })
      toast.success(`WhatsApp sent to ${doctorName || 'doctor'}`)
      onSuccess?.()
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to send WhatsApp'
      setError(msg)
      toast.error(msg)
    } finally {
      setSending(false)
    }
  }

  const canSend =
    !sending &&
    Boolean(doctor) &&
    Boolean(phone.trim()) &&
    templates.length > 0 &&
    (templates.length === 1 || Boolean(selectedTemplate)) &&
    Boolean(preview)

  return (
    <div className={CREATE_MODAL_OVERLAY} role="dialog" aria-modal="true">
      <div className={createModalShellClass('max-w-lg w-full')}>
        <div className="p-6 border-b border-slate-200 bg-gradient-to-r from-emerald-50 via-white to-teal-50">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Notify Doctor</h2>
              <p className="mt-1 text-sm text-slate-600">
                {patientName}
                {reportRequest.request_date
                  ? ` · ${new Date(reportRequest.request_date).toLocaleDateString('en-GB')}`
                  : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>

        <form onSubmit={handleSend} className="p-6 space-y-4">
          <div className="relative">
            <label className="block text-sm font-medium text-slate-700 mb-1">Doctor</label>
            <input
              type="text"
              value={doctorQuery}
              onChange={(e) => {
                setDoctorQuery(e.target.value)
                void handleDoctorChange('')
                setDoctorOpen(true)
              }}
              onFocus={() => setDoctorOpen(true)}
              onBlur={() => setTimeout(() => setDoctorOpen(false), 150)}
              placeholder={doctorsLoading ? 'Searching…' : 'Search doctor by name…'}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              autoFocus
            />
            {doctorOpen && doctors.length > 0 && (
              <ul
                ref={doctorDropRef}
                className="absolute z-30 left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-md shadow-lg max-h-48 overflow-y-auto text-sm"
              >
                {doctors.map((d) => (
                  <li
                    key={d.name}
                    className="px-3 py-2 hover:bg-slate-50 cursor-pointer"
                    onMouseDown={() => {
                      setDoctorQuery(d.practitioner_name || d.label || d.name)
                      setDoctorOpen(false)
                      void handleDoctorChange(d.name)
                    }}
                  >
                    <span className="font-medium">{d.practitioner_name || d.label || d.name}</span>
                    <span className="ml-1 text-xs text-slate-400">{d.name}</span>
                  </li>
                ))}
              </ul>
            )}
            {doctorOpen && !doctorsLoading && doctors.length === 0 && doctorQuery.trim() !== '' && (
              <ul className="absolute z-30 left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-md shadow-lg px-3 py-2 text-sm text-slate-500">
                No doctor matches “{doctorQuery.trim()}”.
              </ul>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Doctor number</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => {
                phoneEditedRef.current = true
                setPhone(e.target.value)
              }}
              placeholder="e.g. 973xxxxxxxx"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <p className="mt-1 text-xs text-slate-500">
              {countryIsd
                ? `Defaults to the doctor's registered mobile with ${countryHint}. Numbers without a country code get +${countryIsd} prefixed; numbers that already carry a country code (e.g. +973… or 973…) are sent as-is.`
                : "Defaults to the doctor's registered mobile. You can edit before sending; include the country code with + if it is not the company default."}
            </p>
          </div>

          {loading && (
            <div className="py-2 text-center text-sm text-slate-500">Loading message preview…</div>
          )}

          {!loading && templates.length > 1 && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Template</label>
              <select
                value={selectedTemplate}
                onChange={(e) => void handleTemplateChange(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
              >
                <option value="">Select a template…</option>
                {templates.map((t) => (
                  <option key={t.name} value={t.name}>
                    {t.purpose ? `${t.template_name} (${t.purpose})` : t.template_name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {!loading && templates.length === 1 && (
            <div className="text-xs text-slate-500">
              Template:{' '}
              <span className="font-medium text-slate-700">{templates[0].template_name}</span>
              {templates[0].purpose ? ` · ${templates[0].purpose}` : ''}
            </div>
          )}

          {!loading && templates.length === 0 && (
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
              No approved WhatsApp template is available for the medical request template. Add one in
              Digital Connect Whatsap Settings and try again.
            </p>
          )}

          {!doctor && templates.length > 0 && (
            <p className="text-sm text-slate-500">
              Select a doctor to see the message that will be sent.
            </p>
          )}

          {preview && doctor && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Message preview
              </label>
              <div className="rounded-xl border border-emerald-200/80 bg-[#e7ffdb] p-4 shadow-sm">
                {preview.header ? (
                  <div className="mb-2 text-sm font-semibold text-slate-900">{preview.header}</div>
                ) : null}
                <p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">
                  {preview.body}
                </p>
                {preview.footer ? (
                  <div className="mt-3 border-t border-emerald-900/10 pt-2 text-xs text-slate-500">
                    {preview.footer}
                  </div>
                ) : null}
              </div>
            </div>
          )}

          {!loading && templates.length > 1 && !selectedTemplate && (
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
              Select a template to see the message that will be sent.
            </p>
          )}

          {error && (
            <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className={CM_BTN_CANCEL} disabled={sending}>
              Cancel
            </button>
            <button type="submit" className={CM_BTN_PRIMARY} disabled={!canSend}>
              {sending ? 'Sending…' : 'Send WhatsApp'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}


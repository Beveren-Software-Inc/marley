import { useCallback, useEffect, useState } from 'react'
import {
  CM_BTN_CANCEL,
  CM_BTN_PRIMARY,
  CREATE_MODAL_OVERLAY,
  createModalShellClass,
} from '../ui/CreateModalChrome'
import {
  getLongActingMedicineWhatsAppPreview,
  sendLongActingMedicineReminder,
  type LongActingWhatsAppPreview,
  type LongActingWhatsAppTemplateOption,
} from '../../services/longActingMedicine'
import { toast } from '../../hooks/useToast'

interface SendWhatsAppLongActingModalProps {
  name: string
  patientName?: string
  onClose: () => void
  onSuccess?: () => void
}

export function SendWhatsAppLongActingModal({
  name,
  patientName: initialPatientName,
  onClose,
  onSuccess,
}: SendWhatsAppLongActingModalProps) {
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [phone, setPhone] = useState('')
  const [countryHint, setCountryHint] = useState('')
  const [countryIsd, setCountryIsd] = useState('')
  const [templates, setTemplates] = useState<LongActingWhatsAppTemplateOption[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState<string>('')
  const [preview, setPreview] = useState<LongActingWhatsAppPreview['preview']>(null)
  const [parameters, setParameters] = useState<string[]>([])
  const [patientName, setPatientName] = useState(initialPatientName || '')

  const applyPreview = useCallback((data: LongActingWhatsAppPreview) => {
    setTemplates(data.templates || [])
    setPhone(data.phone_number || '')
    setPatientName(data.patient_name || initialPatientName || '')
    setSelectedTemplate(data.selected_template || '')
    setPreview(data.preview)
    setParameters(data.parameters || [])
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
  }, [initialPatientName])

  const loadPreview = useCallback(
    async (templateName?: string) => {
      setLoading(true)
      setError(null)
      try {
        const data = await getLongActingMedicineWhatsAppPreview(name, templateName)
        applyPreview(data)
        if (!templateName && !data.selected_template && data.templates.length === 1) {
          const only = data.templates[0].name
          const filled = await getLongActingMedicineWhatsAppPreview(name, only)
          applyPreview(filled)
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to load WhatsApp preview'
        setError(msg)
      } finally {
        setLoading(false)
      }
    },
    [name, applyPreview]
  )

  useEffect(() => {
    void loadPreview()
  }, [loadPreview])

  const handleTemplateChange = async (value: string) => {
    setSelectedTemplate(value)
    if (!value) {
      setPreview(null)
      setParameters([])
      return
    }
    setLoading(true)
    setError(null)
    try {
      const data = await getLongActingMedicineWhatsAppPreview(name, value)
      applyPreview(data)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load template preview'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedPhone = phone.trim()
    if (!trimmedPhone) {
      setError('Enter the patient WhatsApp number')
      return
    }
    if (templates.length > 1 && !selectedTemplate) {
      setError('Select a template to send')
      return
    }
    if (templates.length === 0) {
      setError('No approved WhatsApp template mapped for long acting medicine')
      return
    }

    const templateToSend = selectedTemplate || templates[0]?.name
    setSending(true)
    setError(null)
    try {
      await sendLongActingMedicineReminder(name, 'whatsapp', {
        phone_number: trimmedPhone,
        template_name: templateToSend,
        template_parameters: parameters,
      })
      toast.success(`WhatsApp sent to ${patientName || 'patient'}`)
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
    !loading &&
    !sending &&
    Boolean(phone.trim()) &&
    (templates.length === 1 || Boolean(selectedTemplate)) &&
    Boolean(preview)

  return (
    <div className={CREATE_MODAL_OVERLAY} role="dialog" aria-modal="true">
      <div className={createModalShellClass('max-w-lg w-full')}>
        <div className="p-6 border-b border-slate-200 bg-gradient-to-r from-emerald-50 via-white to-teal-50">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Send WhatsApp</h2>
              <p className="mt-1 text-sm text-slate-600">{patientName || 'Long acting medicine reminder'}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <form onSubmit={handleSend} className="p-6 space-y-4">
          {loading && !preview ? (
            <div className="py-8 text-center text-sm text-slate-500">Loading message preview…</div>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Patient number
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="e.g. 973xxxxxxxx"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  autoFocus
                />
                <p className="mt-1 text-xs text-slate-500">
                  {countryIsd
                    ? `Defaults to the patient number with ${countryHint}. Local numbers like 07… become ${countryIsd}…. If you enter another country code (+254… or 254…), it is sent as-is — not combined with ${countryIsd}.`
                    : 'Patient mobile first. You can edit before sending. Include country code with + if it is not the company default.'}
                </p>
              </div>

              {templates.length > 1 && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Template
                  </label>
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

              {templates.length === 1 && (
                <div className="text-xs text-slate-500">
                  Template:{' '}
                  <span className="font-medium text-slate-700">
                    {templates[0].template_name}
                  </span>
                  {templates[0].purpose ? ` · ${templates[0].purpose}` : ''}
                </div>
              )}

              {preview && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Message preview
                  </label>
                  <div className="rounded-xl border border-emerald-200/80 bg-[#e7ffdb] p-4 shadow-sm">
                    {preview.header ? (
                      <div className="mb-2 text-sm font-semibold text-slate-900">
                        {preview.header}
                      </div>
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
            </>
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

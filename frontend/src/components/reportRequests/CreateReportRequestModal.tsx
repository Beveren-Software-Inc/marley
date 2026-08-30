import { useEffect, useState } from 'react'
import {
  CM_BTN_CANCEL,
  CM_BTN_PRIMARY,
  CREATE_MODAL_BODY_GRADIENT,
  CREATE_MODAL_OVERLAY,
  CreateModalFooter,
  CreateModalHeader,
  createModalShellClass,
  MODAL_FIELD_CLASS,
} from '../ui/CreateModalChrome'
import { fetchPatientDisplayName, searchPatients, type PatientListItem } from '../../services/patients'
import { uploadPatientFile } from '../../services/patients'
import { createReportRequest } from '../../services/reportRequests'
import { toast } from '../../hooks/useToast'
import { FileText } from 'lucide-react'
import { useCareContext } from '../../providers/CareContextProvider'
import { DateFilterInput } from '../ui/DateFilterInput'

export function CreateReportRequestModal({
  onClose,
  onSuccess,
  initialPatient,
}: {
  onClose: () => void
  onSuccess?: () => void
  initialPatient?: string
}) {
  const { selectedPatient, userCostCenter } = useCareContext()
  const [patient, setPatient] = useState(initialPatient || selectedPatient || '')
  const [patientQuery, setPatientQuery] = useState('')
  const [patientOptions, setPatientOptions] = useState<PatientListItem[]>([])
  const [patientOpen, setPatientOpen] = useState(false)
  const [requestDate, setRequestDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [urgency, setUrgency] = useState<'Non-Urgent' | 'Urgent'>('Non-Urgent')
  const [recipient, setRecipient] = useState('')
  const [remarks, setRemarks] = useState('')
  const [signedUrl, setSignedUrl] = useState('')
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const id = initialPatient || selectedPatient
    if (!id) return
    setPatient(id)
    let cancelled = false
    fetchPatientDisplayName(id)
      .then((d) => {
        if (!cancelled) setPatientQuery(`${d.file_number || d.name} — ${d.patient_name}`)
      })
      .catch(() => {
        if (!cancelled) setPatientQuery(id)
      })
    return () => {
      cancelled = true
    }
  }, [initialPatient, selectedPatient])

  useEffect(() => {
    if (!patientOpen) return
    let cancelled = false
    const q = patientQuery.trim()
    const run = q ? searchPatients(q, 20) : Promise.resolve([] as PatientListItem[])
    run.then((rows) => {
      if (!cancelled) setPatientOptions(rows)
    }).catch(() => {
      if (!cancelled) setPatientOptions([])
    })
    return () => {
      cancelled = true
    }
  }, [patientOpen, patientQuery])

  const handleFile = async (file: File | null) => {
    if (!file) return
    setUploading(true)
    try {
      const url = await uploadPatientFile(file)
      setSignedUrl(url)
      toast.success('Signed request uploaded')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!patient) {
      toast.error('Select a patient')
      return
    }
    if (!recipient.trim()) {
      toast.error('Enter the intended recipient')
      return
    }
    setSaving(true)
    try {
      await createReportRequest({
        patient,
        request_date: requestDate,
        urgency,
        recipient: recipient.trim(),
        remarks: remarks.trim() || undefined,
        signed_request: signedUrl || undefined,
        cost_center: userCostCenter || undefined,
      })
      toast.success('Report request created')
      onSuccess?.()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create request')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={CREATE_MODAL_OVERLAY} onClick={onClose}>
      <div className={createModalShellClass('max-w-lg')} onClick={(e) => e.stopPropagation()}>
        <CreateModalHeader
          title="New Report Request"
          subtitle="After the patient signs the paper request, upload the scan and send it to the doctor."
          icon={<FileText className="h-5 w-5 text-emerald-800" />}
          onClose={onClose}
        />
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className={`${CREATE_MODAL_BODY_GRADIENT} space-y-3 px-5 py-4`}>
            <div className="relative">
              <label className="mb-0.5 block text-xs font-medium text-slate-600">Patient</label>
              <input
                className={MODAL_FIELD_CLASS}
                value={patientQuery || patient}
                onChange={(e) => {
                  setPatientQuery(e.target.value)
                  setPatient('')
                  setPatientOpen(true)
                }}
                onFocus={() => setPatientOpen(true)}
                placeholder="Search patient…"
              />
              {patientOpen && patientOptions.length > 0 && (
                <div className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-md border border-slate-200 bg-white shadow-lg">
                  {patientOptions.map((p) => (
                    <button
                      key={p.name}
                      type="button"
                      className="block w-full px-3 py-2 text-left text-sm hover:bg-emerald-50"
                      onClick={() => {
                        setPatient(p.name)
                        setPatientQuery(`${p.file_number || p.name} — ${p.patient_name}`)
                        setPatientOpen(false)
                      }}
                    >
                      {p.patient_name} <span className="text-slate-400">({p.file_number || p.name})</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-0.5 block text-xs font-medium text-slate-600">Date of request</label>
                <DateFilterInput
                  className={MODAL_FIELD_CLASS}
                  value={requestDate}
                  onChange={(e) => setRequestDate(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-0.5 block text-xs font-medium text-slate-600">Urgency</label>
                <select
                  className={MODAL_FIELD_CLASS}
                  value={urgency}
                  onChange={(e) => setUrgency(e.target.value as 'Non-Urgent' | 'Urgent')}
                >
                  <option value="Non-Urgent">Non-Urgent</option>
                  <option value="Urgent">Urgent</option>
                </select>
              </div>
            </div>
            <div>
              <label className="mb-0.5 block text-xs font-medium text-slate-600">Intended recipient</label>
              <input
                className={MODAL_FIELD_CLASS}
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder="Who should receive the report"
              />
            </div>
            <div>
              <label className="mb-0.5 block text-xs font-medium text-slate-600">Signed request (soft copy)</label>
              <input
                type="file"
                disabled={uploading}
                className="w-full text-sm file:mr-2 file:rounded file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-white"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) handleFile(f)
                  e.target.value = ''
                }}
              />
              {signedUrl ? <p className="mt-1 truncate text-xs text-emerald-700">{signedUrl}</p> : null}
            </div>
            <div>
              <label className="mb-0.5 block text-xs font-medium text-slate-600">Remarks</label>
              <textarea
                rows={2}
                className={MODAL_FIELD_CLASS}
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
              />
            </div>
          </div>
          <CreateModalFooter>
            <button type="button" className={CM_BTN_CANCEL} onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className={CM_BTN_PRIMARY} disabled={saving || uploading}>
              {saving ? 'Saving…' : 'Create request'}
            </button>
          </CreateModalFooter>
        </form>
      </div>
    </div>
  )
}

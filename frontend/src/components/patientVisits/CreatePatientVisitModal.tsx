import { useState, useEffect, useRef, useCallback } from 'react'
import {
  CM_BTN_CANCEL,
  CM_BTN_PRIMARY,
  CREATE_MODAL_OVERLAY,
  createModalShellClass,
} from '../ui/CreateModalChrome'
import { searchPatients, fetchPatients, type PatientListItem, uploadPatientFile, type PatientDocumentRow } from '../../services/patients'
import {
  checkCanCreatePatientVisit,
  fetchPatientVisitTypes,
  type OpenPatientVisitRow,
  type PatientVisitTypeOption,
  createPatientVisit,
} from '../../services/patientVisits'
import { 
  fetchHealthcarePractitioners,
  fetchDocumentTypes,
  getCurrentUserPractitioner,
  type LinkFieldOption 
} from '../../services/common'
import { CreatePatientModal } from '../patients/CreatePatientModal'
import { CreatePractitionerModal } from '../practitioners/CreatePractitionerModal'
import { toast } from '../../hooks/useToast'
import { PenLine } from 'lucide-react'

interface SignaturePadProps {
  onSave: (file: File) => void
  onClear?: () => void
  existingUrl?: string
  uploading?: boolean
}

const SignaturePad = ({ onSave, onClear, existingUrl, uploading }: SignaturePadProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const isDrawing = useRef(false)
  const [hasStrokes, setHasStrokes] = useState(false)
  const [mode, setMode] = useState<'idle' | 'drawing' | 'done'>(existingUrl ? 'done' : 'idle')

  const initCtx = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.strokeStyle = '#1e293b'
    ctx.lineWidth = 2.2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    return ctx
  }, [])

  const getPos = (e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    if ('touches' in e) {
      const t = e.touches[0]
      return {
        x: (t.clientX - rect.left) * scaleX,
        y: (t.clientY - rect.top) * scaleY,
      }
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    }
  }

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    if (uploading) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = initCtx()
    if (!ctx) return
    e.preventDefault()
    const { x, y } = getPos(e, canvas)
    ctx.beginPath()
    ctx.moveTo(x, y)
    isDrawing.current = true
    setHasStrokes(true)
    setMode('drawing')
  }

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing.current || uploading) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = initCtx()
    if (!ctx) return
    e.preventDefault()
    const { x, y } = getPos(e, canvas)
    ctx.lineTo(x, y)
    ctx.stroke()
  }

  const stopDrawing = () => {
    if (!isDrawing.current) return
    isDrawing.current = false
    setMode('done')
  }

  const handleClear = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasStrokes(false)
    setMode('idle')
    onClear?.()
  }

  const handleSave = () => {
    const canvas = canvasRef.current
    if (!canvas || !hasStrokes || uploading) return
    canvas.toBlob((blob) => {
      if (!blob) return
      const file = new File([blob], `signature_${Date.now()}.png`, { type: 'image/png' })
      onSave(file)
    }, 'image/png')
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        className={`border rounded-md overflow-hidden bg-white ${
          uploading ? 'opacity-60 pointer-events-none' : ''
        }`}
      >
        <canvas
          ref={canvasRef}
          width={600}
          height={160}
          className="w-full h-40 touch-none bg-slate-50"
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
        />
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          <PenLine className="w-3.5 h-3.5" />
          <span>
            {mode === 'idle' && 'Draw your signature above'}
            {mode === 'drawing' && 'Release to finish, then Save'}
            {mode === 'done' && 'Signature captured. You can re-draw if needed.'}
          </span>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleClear}
            className="px-2 py-1 text-xs rounded border border-slate-300 text-slate-600 hover:bg-slate-50"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!hasStrokes || uploading}
            className="px-2 py-1 text-xs rounded bg-primary text-white disabled:opacity-40"
          >
            Save Signature
          </button>
        </div>
      </div>
    </div>
  )
}

interface CreatePatientVisitModalProps {
  onClose: () => void
  onSuccess: (visitName: string) => void
  /** Pre-fill patient (e.g. from IOP enrollment). */
  initialPatient?: string
  /** Link new visit to this IOP Enrollment. */
  initialIOPEnrollment?: string
  /** Link new visit to this Patient Appointment. */
  initialAppointment?: string
  /** Pre-fill practitioner from appointment. */
  initialPractitioner?: string
}

export const CreatePatientVisitModal = ({
  onClose,
  onSuccess,
  initialPatient,
  initialIOPEnrollment,
  initialAppointment,
  initialPractitioner,
}: CreatePatientVisitModalProps) => {
  const [patientQuery, setPatientQuery] = useState(initialPatient || '')
  const [selectedPatient, setSelectedPatient] = useState<PatientListItem | null>(null)
  const [patients, setPatients] = useState<PatientListItem[]>([])
  const [patientOpen, setPatientOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [openVisits, setOpenVisits] = useState<OpenPatientVisitRow[]>([])
  const [openVisitCheckLoading, setOpenVisitCheckLoading] = useState(false)
  const createBlocked = openVisits.length > 0
  const openVisitBlockMessage = createBlocked
    ? `This patient already has an open visit. Complete it, mark External Referral, or cancel it before creating a new one.`
    : null
  const [showCreatePatient, setShowCreatePatient] = useState(false)
  const [showCreatePractitioner, setShowCreatePractitioner] = useState(false)

  // Link field options
  const [practitioners, setPractitioners] = useState<LinkFieldOption[]>([])
  const [practOpen, setPractOpen] = useState(false)
  const [practQuery, setPractQuery] = useState('')

  // Visit type searchable dropdown state
  const [visitTypeOptions, setVisitTypeOptions] = useState<PatientVisitTypeOption[]>([])
  const [visitTypeOpen, setVisitTypeOpen] = useState(false)
  const [visitTypeQuery, setVisitTypeQuery] = useState('')

  const [formData, setFormData] = useState({
    practitioner: initialPractitioner || '',
    encounter_date: new Date().toISOString().split('T')[0],
    encounter_time: new Date().toTimeString().slice(0, 5),
    visit_type: initialIOPEnrollment ? 'IOP' : '',
    appointment: initialAppointment || '',
  })
  const [activeTab, setActiveTab] = useState<'details' | 'documents'>('details')

  const [documentTypes, setDocumentTypes] = useState<{ name: string; document_name?: string }[]>([])
  const [documents, setDocuments] = useState<PatientDocumentRow[]>([])
  const [documentUploading, setDocumentUploading] = useState<number | null>(null)
  const [signatureUploading, setSignatureUploading] = useState<number | null>(null)

  // When opening from IOP enrollment, default visit type to IOP
  useEffect(() => {
    if (initialIOPEnrollment) {
      setFormData((prev) => (prev.visit_type === '' ? { ...prev, visit_type: 'IOP' } : prev))
      setVisitTypeQuery('IOP')
    }
  }, [initialIOPEnrollment])

  // Load initial options (practitioners + visit types) and auto-fill current user's practitioner
  useEffect(() => {
    const loadOptions = async () => {
      try {
        const [practs, visitTypes, docTypes, currentPract] = await Promise.all([
          fetchHealthcarePractitioners(),
          fetchPatientVisitTypes(),
          fetchDocumentTypes(),
          getCurrentUserPractitioner(),
        ])
        setPractitioners(practs)
        setVisitTypeOptions(visitTypes)
        setDocumentTypes(docTypes)
        if (currentPract && !initialPractitioner) {
          setFormData((prev) => (prev.practitioner === '' ? { ...prev, practitioner: currentPract } : prev))
        }
        if (initialPractitioner) {
          setPractQuery(initialPractitioner)
        }
      } catch (err) {
        console.error('Failed to load options:', err)
      }
    }
    loadOptions()
  }, [initialPractitioner])

  const addDocumentRow = () => {
    setDocuments((prev) => [...prev, { file_name: '', document_type: '', transaction_no: '', upload_remarks: '' }])
  }
  const removeDocumentRow = (idx: number) => {
    setDocuments((prev) => prev.filter((_, i) => i !== idx))
  }
  const updateDocumentRow = (idx: number, field: keyof PatientDocumentRow, value: string) => {
    setDocuments((prev) => {
      const next = [...prev]
      next[idx] = { ...next[idx], [field]: value }
      return next
    })
  }

  const handleDocumentFile = async (idx: number, file: File | null) => {
    if (!file) return
    setDocumentUploading(idx)
    try {
      const file_url = await uploadPatientFile(file)
      if (!file_url) throw new Error('No URL returned from upload')
      setDocuments((prev) => {
        const next = [...prev]
        next[idx] = {
          ...next[idx],
          document: file_url,
          file_name: next[idx].file_name?.trim() || file.name,
        }
        return next
      })
      toast.success('File uploaded')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'File upload failed')
    } finally {
      setDocumentUploading(null)
    }
  }

  const handleSignatureFile = async (idx: number, file: File) => {
    setSignatureUploading(idx)
    try {
      const file_url = await uploadPatientFile(file)
      if (!file_url) throw new Error('No URL returned from signature upload')
      setDocuments((prev) => {
        const next = [...prev]
        next[idx] = {
          ...next[idx],
          document: file_url,
          file_name: next[idx].file_name?.trim() || `Signature ${idx + 1}`,
        }
        return next
      })
      toast.success('Signature saved')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Signature upload failed')
    } finally {
      setSignatureUploading(null)
    }
  }

  // Pre-fill patient when initialPatient (e.g. from IOP enrollment) is provided
  useEffect(() => {
    if (!initialPatient) return
    fetchPatients(1, 0, initialPatient).then((list) => {
      if (list.length > 0) {
        const p = list[0]
        setSelectedPatient(p)
        setPatientQuery((p as { patient_name?: string }).patient_name || p.name)
      } else {
        setPatientQuery(initialPatient)
      }
    }).catch(() => setPatientQuery(initialPatient))
  }, [initialPatient])

  useEffect(() => {
    const patientId = selectedPatient?.name
    if (!patientId) {
      setOpenVisits([])
      return
    }
    let cancelled = false
    setOpenVisitCheckLoading(true)
    checkCanCreatePatientVisit(patientId)
      .then((result) => {
        if (cancelled) return
        setOpenVisits(result.allowed ? [] : result.open_visits || [])
      })
      .catch(() => {
        if (!cancelled) setOpenVisits([])
      })
      .finally(() => {
        if (!cancelled) setOpenVisitCheckLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [selectedPatient?.name])

  // Search/fetch patients
  useEffect(() => {
    if (!patientOpen) return

    const search = async () => {
      setLoading(true)
      try {
        let results: PatientListItem[] = []
        if (patientQuery.trim() === '') {
          results = await fetchPatients(20, 0)
        } else {
          results = await searchPatients(patientQuery, 20)
        }
        setPatients(results)
      } catch (err) {
        console.error('Failed to fetch/search patients:', err)
        setPatients([])
      } finally {
        setLoading(false)
      }
    }

    const timeoutId = setTimeout(() => {
      search()
    }, patientQuery.trim() === '' ? 0 : 300)

    return () => clearTimeout(timeoutId)
  }, [patientQuery, patientOpen])

  // Search practitioners
  useEffect(() => {
    if (practOpen || practQuery) {
      const search = async () => {
        try {
          const results = await fetchHealthcarePractitioners(practQuery || undefined)
          setPractitioners(results)
        } catch (err) {
          console.error('Failed to search practitioners:', err)
        }
      }
      const timeoutId = setTimeout(search, 300)
      return () => clearTimeout(timeoutId)
    }
  }, [practQuery, practOpen])

  // Search visit types
  useEffect(() => {
    if (!visitTypeOpen) return
    const search = async () => {
      try {
        const results = await fetchPatientVisitTypes(visitTypeQuery || undefined)
        setVisitTypeOptions(results)
      } catch (err) {
        console.error('Failed to search visit types:', err)
      }
    }
    const timeoutId = setTimeout(search, visitTypeQuery.trim() === '' ? 0 : 300)
    return () => clearTimeout(timeoutId)
  }, [visitTypeQuery, visitTypeOpen])

  // const handleSubmit = async (e: React.FormEvent) => {
  //   e.preventDefault()
  //   setError(null)

  //   if (!selectedPatient) {
  //     setError('Please select a patient')
  //     setActiveTab('details')
  //     return
  //   }

  //   if (!formData.practitioner) {
  //     setError('Please select a practitioner')
  //     setActiveTab('details')
  //     return
  //   }

  //   try {
  //     setSubmitting(true)

  //     const patientDocuments = documents
  //       .filter(r => (r.file_name || '').trim() || (r.document || '').trim())
  //       .map(r => ({
  //         file_name: (r.document_type || '').trim() || undefined,
  //         document_type: (r.document_type || '').trim() || undefined,
  //         transaction_no: (r.transaction_no || '').trim() || undefined,
  //         upload_remarks: (r.upload_remarks || '').trim() || undefined,
  //         document: (r.document || '').trim() || undefined,
  //       }))

  //     const { ensureCSRF } = await import('../../services/apiClient')
  //     const csrf = await ensureCSRF()
  //     const response = await fetch('/api/resource/Patient Visit', {
  //       method: 'POST',
  //       credentials: 'include',
  //       headers: {
  //         'Content-Type': 'application/json',
  //         'Accept': 'application/json',
  //         ...(csrf ? { 'X-Frappe-CSRF-Token': csrf } : {})
  //       },
  //       body: JSON.stringify({
  //         patient: selectedPatient.name,
  //         practitioner: formData.practitioner,
  //         encounter_date: formData.encounter_date,
  //         encounter_time: formData.encounter_time,
  //         visit_type: formData.visit_type,
  //         appointment: formData.appointment || undefined,
  //         iop_enrollment: initialIOPEnrollment || undefined,
  //         status: 'Open',
  //         // Patient Upload Document child rows on Patient Visit
  //         documents: patientDocuments.length > 0 ? patientDocuments : undefined,
  //       })
  //     })

  //     const resData = await response.json()

  //     if (resData.data && resData.data.name) {
  //       onSuccess(resData.data.name)
  //     } else if (resData.exc) {
  //       throw new Error(resData.exc || 'Failed to create patient visit')
  //     } else {
  //       throw new Error('Visit created but no name returned')
  //     }
  //   } catch (err) {
  //     setError(err instanceof Error ? err.message : 'Failed to create patient visit')
  //   } finally {
  //     setSubmitting(false)
  //   }
  // }


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!selectedPatient) {
      setError('Please select a patient')
      return
    }

    if (createBlocked) {
      setError(openVisitBlockMessage)
      return
    }

    if (!formData.practitioner) {
      setError('Please select a practitioner')
      return
    }

    try {
      setSubmitting(true)
      const createdVisit = await createPatientVisit({
        patient: selectedPatient.name,
        practitioner: formData.practitioner,
        encounter_date: formData.encounter_date,
        encounter_time: formData.encounter_time,
        visit_type: formData.visit_type,
        appointment: formData.appointment || undefined,
        status: 'Open'
      })

      if (createdVisit?.name) {
        onSuccess(createdVisit.name)
      } else {
        throw new Error('Visit created but no name returned')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create patient visit')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={CREATE_MODAL_OVERLAY}>
      <div className={createModalShellClass('max-w-2xl w-full max-h-[90vh]')}>
        <div className="p-6 border-b border-slate-200 shrink-0">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold tracking-tight text-emerald-950">Create New Patient Visit</h2>
            <button
              onClick={onClose}
              className="shrink-0 rounded-lg p-2 text-emerald-800/70 transition hover:bg-emerald-200/50 hover:text-emerald-950"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="flex mt-4 border-b border-slate-200 -mb-6">
            {[
              { id: 'details' as const, label: 'Visit Details' },
              { id: 'documents' as const, label: 'Documents', badge: documents.length || undefined },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-2 text-sm border-b-2 -mb-px transition-colors ${
                  activeTab === tab.id
                    ? 'border-primary text-primary font-semibold'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                } flex items-center gap-1`}
              >
                {tab.label}
                {tab.badge ? (
                  <span className="inline-flex items-center justify-center rounded-full bg-slate-100 px-1.5 text-[11px] font-medium text-slate-700">
                    {tab.badge}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </div>

        {(openVisitCheckLoading || createBlocked) && (
          <div
            className={`shrink-0 px-6 py-3 border-b ${
              createBlocked ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200'
            }`}
            role="alert"
          >
            {openVisitCheckLoading ? (
              <p className="text-sm text-slate-600">Checking for open visits…</p>
            ) : (
              <>
                <p className="text-sm font-medium text-amber-900">{openVisitBlockMessage}</p>
                <ul className="mt-2 space-y-1 text-xs text-amber-800">
                  {openVisits.map((v) => (
                    <li key={v.name}>
                      <span className="font-semibold">{v.name}</span>
                      {v.status ? ` — ${v.status}` : ''}
                      {v.encounter_date ? ` (${v.encounter_date})` : ''}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}

        {error && !createBlocked && (
          <div className="shrink-0 px-6 py-3 bg-red-50 border-b border-red-200" role="alert">
            <p className="text-sm font-medium text-red-800">{error}</p>
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="px-6 pt-8 pb-4 space-y-4 overflow-y-auto"
          onClick={(e) => {
          const target = e.target as HTMLElement
          if (target.tagName !== 'INPUT' && !target.closest('.absolute')) {
            setPatientOpen(false)
            setPractOpen(false)
            setVisitTypeOpen(false)
          }
        }}>
          {activeTab === 'details' && (
            <>
          {/* Patient Selection */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Patient <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type="text"
                value={selectedPatient ? (selectedPatient.patient_name || selectedPatient.name) : patientQuery}
                onChange={(e) => {
                  const val = e.target.value
                  if (selectedPatient) {
                    setSelectedPatient(null)
                  }
                  setPatientQuery(val)
                  setPatientOpen(true)
                }}
                onFocus={() => setPatientOpen(true)}
                placeholder="Search patient..."
                className="w-full rounded-md border border-slate-300 pr-16 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                {selectedPatient && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedPatient(null)
                      setPatientQuery('')
                    }}
                    className="text-slate-400 hover:text-slate-600"
                    title="Clear patient"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowCreatePatient(true)}
                  className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center text-xs hover:bg-primary/90"
                  title="Add Patient"
                >
                  +
                </button>
              </div>
              {patientOpen && (
                <div className="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg max-h-48 overflow-auto">
                  {loading ? (
                    <div className="px-3 py-2 text-xs text-slate-500">Loading patients...</div>
                  ) : patients.length > 0 ? (
                    patients.map((patient) => (
                      <button
                        key={patient.name}
                        type="button"
                        className="w-full text-left px-[11px] py-2 text-sm hover:bg-blue-50"
                        onClick={() => {
                          setSelectedPatient(patient)
                          setPatientQuery(patient.patient_name || patient.name)
                          setPatientOpen(false)
                        }}
                      >
                        <div className="font-medium">{patient.patient_name || patient.name}</div>
                        <div className="text-xs text-slate-500 flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                          {patient.file_number && <span>File: {patient.file_number}</span>}
                          {patient.id_number && <span>ID: {patient.id_number}</span>}
                          {patient.mobile && <span>{patient.mobile}</span>}
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className="px-3 py-2 text-xs text-slate-500">
                      {patientQuery ? 'No patients match your search.' : 'No patients found.'}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Practitioner */}
            <div className="relative">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Practitioner <span className="text-red-500">*</span>
              </label>
              <div className="relative flex items-center">
                <input
                  type="text"
                  value={formData.practitioner ? practitioners.find(p => p.name === formData.practitioner)?.label || formData.practitioner : practQuery}
                  onChange={(e) => {
                    setPractQuery(e.target.value)
                    setPractOpen(true)
                    if (formData.practitioner) {
                      setFormData({ ...formData, practitioner: '' })
                    }
                  }}
                  onFocus={() => setPractOpen(true)}
                  placeholder="Search Healthcare Practitioner..."
                  className="w-full rounded-md border border-slate-300 px-3 py-2 pr-14 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
                <div className="absolute right-2 flex items-center gap-1">
                  {formData.practitioner && (
                    <button
                      type="button"
                      onClick={() => {
                        setFormData({ ...formData, practitioner: '' })
                        setPractQuery('')
                      }}
                      className="text-slate-400 hover:text-slate-600"
                      title="Clear practitioner"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setShowCreatePractitioner(true)
                    }}
                    className="p-1 text-primary hover:text-primary/80 rounded"
                    title="Create New Practitioner"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </button>
                </div>
                {practOpen && (
                  <div className="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg max-h-48 overflow-auto top-full">
                    {practitioners.length > 0 ? (
                      practitioners.map((pract) => (
                        <button
                          key={pract.name}
                          type="button"
                          className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50"
                          onClick={() => {
                            setFormData({ ...formData, practitioner: pract.name })
                            setPractQuery(pract.label)
                            setPractOpen(false)
                          }}
                        >
                          <div className="font-medium">{pract.label}</div>
                          <div className="text-xs text-slate-500">
                            {[pract.name, pract.department].filter(Boolean).join(' · ')}
                          </div>
                        </button>
                      ))
                    ) : (
                      <div className="px-3 py-2 text-xs text-slate-500">No practitioners found</div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Visit Type (ECG, ECT, IOP, follow-up, lab visit, etc.) */}
            <div className="relative">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Visit Type
              </label>
              <input
                type="text"
                value={formData.visit_type
                  ? (visitTypeOptions.find(v => v.name === formData.visit_type)?.visit_type || formData.visit_type)
                  : visitTypeQuery}
                onChange={(e) => {
                  setVisitTypeQuery(e.target.value)
                  setVisitTypeOpen(true)
                  if (formData.visit_type) {
                    setFormData({ ...formData, visit_type: '' })
                  }
                }}
                onFocus={() => setVisitTypeOpen(true)}
                placeholder="Search visit type..."
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              />
              {formData.visit_type && (
                <button
                  type="button"
                  onClick={() => {
                    setFormData({ ...formData, visit_type: '' })
                    setVisitTypeQuery('')
                  }}
                  className="absolute right-2 top-[calc(50%+10px)] -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  title="Clear"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
              {visitTypeOpen && (
                <div className="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg max-h-48 overflow-auto">
                  {visitTypeOptions.length > 0 ? (
                    visitTypeOptions.map((vt) => (
                      <button
                        key={vt.name}
                        type="button"
                        className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50"
                        onClick={() => {
                          setFormData({ ...formData, visit_type: vt.name })
                          setVisitTypeQuery(vt.visit_type || vt.name)
                          setVisitTypeOpen(false)
                        }}
                      >
                        {vt.visit_type || vt.name}
                      </button>
                    ))
                  ) : (
                    <div className="px-3 py-2 text-xs text-slate-500">
                      {visitTypeQuery ? 'No visit types match your search.' : 'No visit types found.'}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Encounter Date */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Encounter Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={formData.encounter_date}
                onChange={(e) => setFormData({ ...formData, encounter_date: e.target.value })}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                required
              />
            </div>

            {/* Encounter Time */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Encounter Time <span className="text-red-500">*</span>
              </label>
              <input
                type="time"
                value={formData.encounter_time}
                onChange={(e) => setFormData({ ...formData, encounter_time: e.target.value })}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                required
              />
            </div>
          </div>

          </>
          )}

          {activeTab === 'documents' && (
            <div className="space-y-4">
              <p className="text-sm text-slate-500">
                Attach reports or other files related to this visit. You can upload a file{' '}
                <em>or</em> draw a digital signature.
              </p>
              <div className="space-y-4">
                {documents.length === 0 && (
                  <div className="text-center py-8 rounded-lg border-2 border-dashed border-slate-200 text-slate-400 text-sm">
                    No documents added yet. Click below to add one.
                  </div>
                )}

                {documents.map((row, idx) => (
                  <div key={idx} className="rounded-lg border border-slate-200 bg-slate-50/50 overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200 bg-white">
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                        Document #{idx + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeDocumentRow(idx)}
                        className="p-1 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                        title="Remove row"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
                      <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-0.5">File Name</label>
                          <input
                            value={row.file_name || ''}
                            onChange={(e) => updateDocumentRow(idx, 'file_name', e.target.value)}
                            placeholder="File name"
                            className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-0.5">Document Type</label>
                          <select
                            value={row.document_type || ''}
                            onChange={(e) => updateDocumentRow(idx, 'document_type', e.target.value)}
                            className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                          >
                            <option value="">Select type</option>
                            {documentTypes.map((dt) => (
                              <option key={dt.name} value={dt.name}>
                                {dt.document_name || dt.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-0.5">Transaction No</label>
                          <input
                            value={row.transaction_no || ''}
                            onChange={(e) => updateDocumentRow(idx, 'transaction_no', e.target.value)}
                            placeholder="Transaction number"
                            className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-0.5">Upload Remarks</label>
                          <input
                            value={row.upload_remarks || ''}
                            onChange={(e) => updateDocumentRow(idx, 'upload_remarks', e.target.value)}
                            placeholder="Remarks"
                            className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-xs font-medium text-slate-600 mb-0.5">
                            File Attachment
                            <span className="ml-1 font-normal text-slate-400">(photo, PDF, etc.)</span>
                          </label>
                          <input
                            type="file"
                            disabled={documentUploading === idx}
                            onChange={(e) => {
                              const f = e.target.files?.[0]
                              if (f) handleDocumentFile(idx, f)
                              e.target.value = ''
                            }}
                            className="w-full text-sm file:mr-2 file:rounded file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-white file:text-sm"
                          />
                          {documentUploading === idx && (
                            <span className="text-xs text-slate-500 mt-0.5 block">Uploading...</span>
                          )}
                          {row.document && documentUploading !== idx && signatureUploading !== idx && (
                            <span
                              className="text-xs text-green-600 mt-0.5 block truncate"
                              title={row.document}
                            >
                              ✓ File attached
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="p-4 flex flex-col gap-2">
                        <div className="flex items-center gap-1.5 mb-1">
                          <PenLine className="w-3.5 h-3.5 text-slate-400" />
                          <span className="text-xs font-medium text-slate-600">Digital Signature</span>
                          <span className="text-xs text-slate-400 ml-1">— draw &amp; save as file</span>
                        </div>
                        <div className="flex-1">
                          <SignaturePad
                            onSave={(file) => handleSignatureFile(idx, file)}
                            existingUrl={row.document?.includes('signature_') ? row.document : undefined}
                            uploading={signatureUploading === idx}
                          />
                        </div>
                        {signatureUploading === idx && (
                          <p className="text-xs text-slate-500 text-center">Uploading signature...</p>
                        )}
                        <p className="text-xs text-slate-400 leading-relaxed">
                          Draw your signature above, then tap <strong>Save Signature</strong> — stored as a PNG
                          attached to this row.
                        </p>
                      </div>
                    </div>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={addDocumentRow}
                  className="flex items-center gap-1.5 text-sm text-primary font-medium hover:underline"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add document
                </button>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className={CM_BTN_CANCEL}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || createBlocked || openVisitCheckLoading}
              className={CM_BTN_PRIMARY}
              title={createBlocked ? openVisitBlockMessage ?? undefined : undefined}
            >
              {submitting ? 'Creating...' : 'Create Visit'}
            </button>
          </div>
        </form>
      </div>
      {showCreatePatient && (
        <CreatePatientModal
          onClose={() => setShowCreatePatient(false)}
          onSuccess={(patientName) => {
            const newPatient: PatientListItem = { name: patientName, patient_name: patientName }
            setSelectedPatient(newPatient)
            setPatientQuery(newPatient.patient_name)
            setPatientOpen(false)
            setShowCreatePatient(false)
          }}
        />
      )}
      {showCreatePractitioner && (
        <CreatePractitionerModal
          onClose={() => setShowCreatePractitioner(false)}
          onSuccess={(practitionerName) => {
            setFormData({ ...formData, practitioner: practitionerName })
            const newPract = practitioners.find(p => p.name === practitionerName)
            if (newPract) {
              setPractQuery(newPract.label)
            } else {
              // Refresh practitioners list to get the new one
              fetchHealthcarePractitioners().then(setPractitioners).catch(console.error)
              setPractQuery(practitionerName)
            }
            setPractOpen(false)
            setShowCreatePractitioner(false)
          }}
        />
      )}
    </div>
  )
}


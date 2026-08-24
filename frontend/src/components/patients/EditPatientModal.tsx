import { useState, useEffect, useRef, useCallback } from 'react'
import {
  fetchPatientDoc,
  fetchPatientAddress,
  updatePatientDoc,
  savePatientAddress,
  uploadPatientFile,
  type PatientDocumentRow,
  type UpdatePatientData
} from '../../services/patients'
import {
  fetchLeadSources,
  fetchNationalities,
  fetchCountries,
  fetchSalutations,
  fetchHealthcareInsurance,
  fetchInsurancePatientRegisters,
  fetchDocumentTypes,
  fetchPatientCategories,
  type LinkFieldOption,
  type InsurancePatientRegisterRow
} from '../../services/common'
import { CreateLeadSourceModal } from './CreateLeadSourceModal'
import { CreateNationalityModal } from './CreateNationalityModal'
import { PatientDobAgeHint } from './PatientDobAgeHint'
import { DocumentTypeSelect } from '../ui/DocumentTypeSelect'
import { PatientDocumentAttachmentPreview, printImagesInPlace } from '../ui/PatientDocumentAttachmentPreview'
import { toast } from '../../hooks/useToast'
import { useBlockIfEditingLocked } from '../../hooks/useBlockIfEditingLocked'
import { useRejectEditModeWhenLocked } from '../../hooks/useRejectEditModeWhenLocked'
import { PenLine, Trash2, Check, X, Upload, Download, Printer, RefreshCw, Loader2, Ban } from 'lucide-react'
import { useAuth } from '../../providers/AuthProvider'
import { useCareContext } from '../../providers/CareContextProvider'
import { canManagePatientBlacklist } from '../../config/permissions'
import { BlacklistPatientModal } from './BlacklistPatientModal'

// ─── Signature Pad Component (same as CreatePatientModal) ───────────────────

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
      return { x: (t.clientX - rect.left) * scaleX, y: (t.clientY - rect.top) * scaleY }
    }
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY }
  }

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = initCtx()
    if (!ctx) return
    isDrawing.current = true
    const pos = getPos(e, canvas)
    ctx.beginPath()
    ctx.moveTo(pos.x, pos.y)
  }

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    if (!isDrawing.current) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = initCtx()
    if (!ctx) return
    const pos = getPos(e, canvas)
    ctx.lineTo(pos.x, pos.y)
    ctx.stroke()
    setHasStrokes(true)
  }

  const endDraw = () => { isDrawing.current = false }

  const clearCanvas = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasStrokes(false)
    onClear?.()
  }

  const saveSignature = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.toBlob((blob) => {
      if (!blob) return
      const file = new File([blob], `signature_${Date.now()}.png`, { type: 'image/png' })
      onSave(file)
      setMode('done')
    }, 'image/png')
  }

  useEffect(() => {
    if (mode !== 'drawing') return
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * window.devicePixelRatio
    canvas.height = rect.height * window.devicePixelRatio
    const ctx = canvas.getContext('2d')
    if (ctx) ctx.scale(window.devicePixelRatio, window.devicePixelRatio)
    setHasStrokes(false)
  }, [mode])

  if (mode === 'idle') {
    return (
      <button
        type="button"
        onClick={() => setMode('drawing')}
        className="w-full h-full min-h-[96px] flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-200 text-slate-400 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50/50 transition-all group"
      >
        <PenLine className="w-5 h-5 group-hover:scale-110 transition-transform" />
        <span className="text-xs font-medium">Add Signature</span>
      </button>
    )
  }

  if (mode === 'done' && existingUrl) {
    return (
      <div className="w-full h-full min-h-[96px] flex flex-col items-center justify-center gap-2 rounded-lg border border-green-200 bg-green-50 p-2">
        <img src={existingUrl} alt="Signature" className="max-h-16 object-contain" />
        <button
          type="button"
          onClick={() => { setMode('drawing'); clearCanvas() }}
          className="text-xs text-slate-500 hover:text-red-500 flex items-center gap-1 transition-colors"
        >
          <Trash2 className="w-3 h-3" /> Re-sign
        </button>
      </div>
    )
  }

  return (
    <div className="w-full rounded-lg border border-slate-300 bg-white overflow-hidden flex flex-col">
      <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-slate-100 bg-slate-50">
        <span className="text-xs font-medium text-slate-500 flex items-center gap-1">
          <PenLine className="w-3 h-3" /> Draw signature
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={clearCanvas}
            disabled={!hasStrokes}
            className="text-xs text-slate-400 hover:text-red-500 disabled:opacity-30 flex items-center gap-0.5 transition-colors px-1.5 py-0.5 rounded hover:bg-red-50"
          >
            <Trash2 className="w-3 h-3" /> Clear
          </button>
          <button
            type="button"
            onClick={() => { setMode('idle'); clearCanvas() }}
            className="text-xs text-slate-400 hover:text-slate-600 px-1.5 py-0.5 rounded hover:bg-slate-100 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>

      <div className="relative" style={{ touchAction: 'none' }}>
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height: '96px', display: 'block', cursor: 'crosshair' }}
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
        />
        {!hasStrokes && (
          <span className="absolute inset-0 flex items-center justify-center text-xs text-slate-300 pointer-events-none select-none">
            Sign here
          </span>
        )}
      </div>

      <div className="px-2.5 py-2 border-t border-slate-100 flex justify-end">
        <button
          type="button"
          onClick={saveSignature}
          disabled={!hasStrokes || uploading}
          className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {uploading ? (
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              Saving…
            </span>
          ) : (
            <>
              <Check className="w-3 h-3" /> Save Signature
            </>
          )}
        </button>
      </div>
    </div>
  )
}

// ─── Main Modal ──────────────────────────────────────────────────────────────

interface EditPatientModalProps {
  patientName: string
  onClose: () => void
  onSuccess?: () => void
}

type Tab = 'details' | 'relations' | 'insurance' | 'documents' | 'cpr'


const PATIENT_RELATION_OPTIONS = ['Father', 'Mother', 'Spouse', 'Siblings', 'Family', 'Other'] as const

// Native selects keep their browser look unless appearance is reset — match them to text inputs
// and draw our own chevron so both field types render identically.
const SELECT_CHEVRON_STYLE: React.CSSProperties = {
  backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'/%3e%3c/svg%3e")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 0.5rem center',
  backgroundSize: '1rem',
}

export const EditPatientModal = ({ patientName, onClose, onSuccess }: EditPatientModalProps) => {
  const { user } = useAuth()
  const { userRole } = useCareContext()
  const blockIfEditingLocked = useBlockIfEditingLocked()
  useRejectEditModeWhenLocked(true, onClose)
  const [activeTab, setActiveTab] = useState<Tab>('details')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [blacklistOpen, setBlacklistOpen] = useState(false)
  const canBlacklist = canManagePatientBlacklist(
    userRole?.length
      ? userRole
      : user?.roles?.length
        ? user.roles
        : ([user?.role, user?.role_profile_name].filter(Boolean) as string[]),
  )

  // Form data state
  const [formData, setFormData] = useState({
    patient_name: '',
    title: '',
    file_no: '',
    sex: '',
    dob: '',
    blood_group: '',
    mobile: '',
    mobile_no_owner: '',
    alternative_mobile_no_1: '',
    alternative_mobile_no_2: '',
    phone: '',
    email: '',
    id_number: '',
    nationality: '',
    category: '',
    source: '',
    marital_status: '',
    is_black_list: false,
    blacklist_reason: '',
    remarks: '',
    address_line1: '',
    address_line2: '',
    city: '',
    state: '',
    country: '',
    pincode: '',
    job_title: '',
    job_company: '',
    has_insurance: false,
    insurance: '',
    insurance_type: '',
    insurance_company_no: '',
    insurance_policy: '',
    ref_no: '',
    insurance_register: '',
  })

  // Relations state
  const [relations, setRelations] = useState<{
    full_name: string
    relation: string
    mobile_no: string
    email: string
    description?: string
    is_next_of_kin: boolean
  }[]>([])

  // Documents state
  const [documents, setDocuments] = useState<PatientDocumentRow[]>([])
  const [documentTypes, setDocumentTypes] = useState<{ name: string; document_name?: string }[]>([])
  const [documentUploading, setDocumentUploading] = useState<number | null>(null)
  const [signatureUploading, setSignatureUploading] = useState<number | null>(null)
  const [cprPhoto, setCprPhoto] = useState('')
  const [cprPhotoBack, setCprPhotoBack] = useState('')
  const [cprUploading, setCprUploading] = useState<'front' | 'back' | null>(null)

  // Dropdown states
  const [sourceOptions, setSourceOptions] = useState<LinkFieldOption[]>([])
  const [sourceOpen, setSourceOpen] = useState(false)
  const [sourceQuery, setSourceQuery] = useState('')
  const [selectedSource, setSelectedSource] = useState<LinkFieldOption | null>(null)
  const [showCreateSource, setShowCreateSource] = useState(false)

  const [nationalityOptions, setNationalityOptions] = useState<LinkFieldOption[]>([])
  const [nationalityOpen, setNationalityOpen] = useState(false)
  const [nationalityQuery, setNationalityQuery] = useState('')
  const [selectedNationality, setSelectedNationality] = useState<LinkFieldOption | null>(null)
  const [showCreateNationality, setShowCreateNationality] = useState(false)

  const [categoryOptions, setCategoryOptions] = useState<LinkFieldOption[]>([])

  const [salutationOptions, setSalutationOptions] = useState<LinkFieldOption[]>([])
  const [salutationOpen, setSalutationOpen] = useState(false)
  const [salutationQuery, setSalutationQuery] = useState('')
  const [selectedSalutation, setSelectedSalutation] = useState<LinkFieldOption | null>(null)

  const [insuranceOptions, setInsuranceOptions] = useState<LinkFieldOption[]>([])
  const [insuranceOpen, setInsuranceOpen] = useState(false)
  const [insuranceQuery, setInsuranceQuery] = useState('')
  const [selectedInsurance, setSelectedInsurance] = useState<LinkFieldOption | null>(null)

  const [iprOptions, setIprOptions] = useState<InsurancePatientRegisterRow[]>([])
  const [iprOpen, setIprOpen] = useState(false)
  const [iprQuery, setIprQuery] = useState('')
  const [selectedIpr, setSelectedIpr] = useState<{ name: string; label: string } | null>(null)

  const [countries, setCountries] = useState<{ name: string }[]>([])

  const [hasInsuranceChoice, setHasInsuranceChoice] = useState<'Yes' | 'No' | ''>('')

  // Load patient data
  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const [patient, sources, nationalities, countryList, salutations, docTypes, categories, addressInfo] = await Promise.all([
          fetchPatientDoc(patientName),
          fetchLeadSources(),
          fetchNationalities(),
          fetchCountries(),
          fetchSalutations(),
          fetchDocumentTypes(),
          fetchPatientCategories(),
          fetchPatientAddress(patientName),
        ])

        setSourceOptions(sources)
        setNationalityOptions(nationalities)
        setCountries(countryList)
        setSalutationOptions(salutations)
        setDocumentTypes(docTypes)
        setCategoryOptions(categories)

        // Build full name (prefer stored parts, fall back to patient_name)
        const fullName =
          [patient.first_name, patient.middle_name, patient.last_name].filter(Boolean).join(' ') ||
          patient.patient_name ||
          ''

        setFormData({
          patient_name: fullName,
          title: patient.title ?? '',
          file_no: patient.file_no ?? '',
          sex: patient.sex ?? '',
          dob: patient.dob ? String(patient.dob).slice(0, 10) : '',
          blood_group: patient.blood_group ?? '',
          mobile: patient.mobile ?? '',
          mobile_no_owner: patient.mobile_no_owner ?? '',
          alternative_mobile_no_1: patient.alternative_mobile_no_1 ?? '',
          alternative_mobile_no_2: patient.alternative_mobile_no_2 ?? '',
          phone: patient.phone ?? '',
          email: patient.email ?? '',
          id_number: patient.id_number ?? '',
          nationality: patient.nationality ?? '',
          category: patient.category ?? '',
          source: patient.source ?? '',
          marital_status: patient.marital_status ?? '',
          is_black_list: !!(patient.is_black_list && patient.is_black_list !== 0),
          blacklist_reason: patient.blacklist_reason ?? '',
          remarks: patient.remarks ?? '',
          address_line1: addressInfo.address_line1 ?? patient.address ?? '',
          address_line2: addressInfo.address_line2 ?? '',
          city: addressInfo.city ?? patient.city ?? '',
          state: addressInfo.state ?? '',
          country: addressInfo.country ?? patient.country ?? '',
          pincode: addressInfo.pincode ?? '',
          job_title: patient.job_title ?? '',
          job_company: patient.job_company ?? '',
          has_insurance: patient.has_insurance === 1,
          insurance: patient.insurance ?? '',
          insurance_type: patient.insurance_type ?? '',
          insurance_company_no: patient.insurance_company_no ?? '',
          insurance_policy: patient.insurance_policy ?? '',
          ref_no: patient.ref_no ?? '',
          insurance_register: patient.insurance_register ?? '',
        })

        setHasInsuranceChoice(patient.has_insurance === 1 ? 'Yes' : 'No')

        // Load relations
        if (patient.patient_relation && Array.isArray(patient.patient_relation)) {
          setRelations(patient.patient_relation.map((r: any) => ({
            full_name: r.full_name || '',
            relation: r.relation || '',
            mobile_no: r.mobile_no || '',
            email: r.email || '',
            description: r.description || '',
            is_next_of_kin: r.is_next_of_kin === 1
          })))
        }

        // Load documents
        if (patient.patient_document && Array.isArray(patient.patient_document)) {
          setDocuments(patient.patient_document.map((d: any) => ({
            file_name: d.file_name || '',
            document_type: d.document_type || '',
            transaction_no: d.transaction_no || '',
            upload_remarks: d.upload_remarks || '',
            document: d.document || ''
          })))
        }

        setCprPhoto(patient.cpr_photo || '')
        setCprPhotoBack(patient.cpr_photo_back || '')

        // Set selected dropdown values. Fall back to the stored value itself when it isn't in
        // the initial (unsearched) option page, so required fields don't render blank.
        const src = sources.find((s) => s.name === patient.source)
        if (src) setSelectedSource(src)
        else if (patient.source) setSelectedSource({ name: patient.source, label: patient.source })

        const nat = nationalities.find((n) => n.name === patient.nationality)
        if (nat) setSelectedNationality(nat)
        else if (patient.nationality) setSelectedNationality({ name: patient.nationality, label: patient.nationality })

        const sal = salutations.find((s) => s.name === patient.title)
        if (sal) setSelectedSalutation(sal)
        else if (patient.title) setSelectedSalutation({ name: patient.title, label: patient.title })

        if (patient.insurance) {
          setSelectedInsurance({ name: patient.insurance, label: patient.insurance })
          setInsuranceQuery(patient.insurance)
        }

        if (patient.insurance_register) {
          setSelectedIpr({ name: patient.insurance_register, label: patient.insurance_register })
          setIprQuery(patient.insurance_register)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load patient')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [patientName])

  const handleChange = (field: string, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  // Document handlers
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

  const handleCprFile = async (side: 'front' | 'back', file: File | null) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error('CPR must be an image file')
      return
    }
    setCprUploading(side)
    try {
      const file_url = await uploadPatientFile(file)
      if (!file_url) throw new Error('No URL returned from upload')
      if (side === 'front') setCprPhoto(file_url)
      else setCprPhotoBack(file_url)
      toast.success(side === 'front' ? 'CPR front image attached' : 'CPR back image attached')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'CPR upload failed')
    } finally {
      setCprUploading(null)
    }
  }

  // Relation handlers
  const addRelationRow = () => {
    setRelations((prev) => [...prev, { full_name: '', relation: '', mobile_no: '', email: '', is_next_of_kin: false }])
  }

  const removeRelationRow = (idx: number) => {
    setRelations((prev) => prev.filter((_, i) => i !== idx))
  }

  const updateRelationRow = (
    idx: number,
    field: 'full_name' | 'relation' | 'mobile_no' | 'email' | 'description' | 'is_next_of_kin',
    value: string | boolean
  ) => {
    setRelations((prev) => {
      const next = [...prev]
      next[idx] = { ...next[idx], [field]: value }
      return next
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      blockIfEditingLocked()
    } catch {
      return
    }

    if (!formData.patient_name || !formData.sex) {
      setError('Full Name and Gender are required')
      setActiveTab('details')
      return
    }
    if (!formData.mobile && !formData.phone) {
      setError('At least one Contact No. (Mobile or Phone) is required')
      setActiveTab('details')
      return
    }
    if (!formData.address_line1) {
      setError('Address (Line 1) is required')
      setActiveTab('details')
      return
    }
    if (!formData.file_no) {
      setError('File No is required')
      setActiveTab('details')
      return
    }
    if (!formData.source) {
      setError('Patient Referral or Source is required')
      setActiveTab('details')
      return
    }
    if (!hasInsuranceChoice) {
      setError('Please select Yes or No for Has Insurance')
      setActiveTab('insurance')
      return
    }

    try {
      setSubmitting(true)

      // Preserve a middle name: first token = first name, last token = last name,
      // anything in between = middle name (instead of wiping middle and folding it into last).
      const nameParts = formData.patient_name.trim().split(/\s+/)
      const firstName = nameParts[0] || ''
      const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : ''
      const middleName = nameParts.length > 2 ? nameParts.slice(1, -1).join(' ') : ''

      const patientPayload: UpdatePatientData = {
        title: formData.title || undefined,
        patient_name: formData.patient_name.trim(),
        first_name: firstName,
        middle_name: middleName || undefined,
        last_name: lastName || undefined,
        sex: formData.sex,
        dob: formData.dob || undefined,
        blood_group: formData.blood_group || undefined,
        mobile: formData.mobile || undefined,
        mobile_no_owner: formData.mobile_no_owner || undefined,
        alternative_mobile_no_1: formData.alternative_mobile_no_1 || undefined,
        alternative_mobile_no_2: formData.alternative_mobile_no_2 || undefined,
        phone: formData.phone || undefined,
        email: formData.email || undefined,
        id_number: formData.id_number || undefined,
        nationality: formData.nationality || undefined,
        category: formData.category,
        source: formData.source,
        marital_status: formData.marital_status || undefined,
        is_black_list: formData.is_black_list ? 1 : 0,
        blacklist_reason: formData.is_black_list ? formData.blacklist_reason || undefined : undefined,
        remarks: formData.remarks || undefined,
        job_title: formData.job_title || undefined,
        job_company: formData.job_company || undefined,
        file_no: formData.file_no,
        has_insurance: hasInsuranceChoice === 'Yes' ? 1 : 0,
        // When Has Insurance is "No", clear the insurer/policy fields instead of sending stale values.
        insurance: hasInsuranceChoice === 'Yes' ? (formData.insurance || undefined) : undefined,
        insurance_type: hasInsuranceChoice === 'Yes' ? (formData.insurance_type || undefined) : undefined,
        insurance_company_no: hasInsuranceChoice === 'Yes' ? (formData.insurance_company_no || undefined) : undefined,
        insurance_policy: hasInsuranceChoice === 'Yes' ? (formData.insurance_policy || undefined) : undefined,
        ref_no: hasInsuranceChoice === 'Yes' ? (formData.ref_no || undefined) : undefined,
        insurance_register: hasInsuranceChoice === 'Yes' ? (formData.insurance_register || undefined) : undefined,
        patient_relation: relations
          .filter((r) => (r.full_name || r.relation || r.mobile_no || r.email || '').trim())
          .map((r) => ({
            full_name: (r.full_name || '').trim() || undefined,
            relation: (r.relation || '').trim() || undefined,
            mobile_no: (r.mobile_no || '').trim() || undefined,
            email: (r.email || '').trim() || undefined,
            description: (r.description || '').trim() || undefined,
            is_next_of_kin: r.is_next_of_kin ? 1 : 0,
          })),
        patient_document: documents
          .filter((r) => (r.file_name || '').trim() || (r.document || '').trim())
          .map((r) => ({
            file_name: (r.file_name || '').trim() || undefined,
            document_type: (r.document_type || '').trim() || undefined,
            transaction_no: (r.transaction_no || '').trim() || undefined,
            upload_remarks: (r.upload_remarks || '').trim() || undefined,
            document: (r.document || '').trim() || undefined,
          })),
        cpr_photo: cprPhoto || null,
        cpr_photo_back: cprPhotoBack || null,
      }

      const result = await updatePatientDoc(patientName, patientPayload)

      if (formData.address_line1.trim()) {
        await savePatientAddress(patientName, {
          address_line1: formData.address_line1,
          address_line2: formData.address_line2 || undefined,
          city: formData.city,
          state: formData.state || undefined,
          country: formData.country || undefined,
          pincode: formData.pincode || undefined,
        })
      }

      toast.success(result?.message?.trim() || 'Patient updated successfully')
      onSuccess?.()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update patient')
      toast.error(err instanceof Error ? err.message : 'Failed to update patient')
    } finally {
      setSubmitting(false)
    }
  }

  // Dropdown search effects
  useEffect(() => {
    if (!sourceOpen) return
    const t = setTimeout(() => {
      fetchLeadSources(sourceQuery).then(setSourceOptions).catch(() => setSourceOptions([]))
    }, sourceQuery.trim() === '' ? 0 : 300)
    return () => clearTimeout(t)
  }, [sourceQuery, sourceOpen])

  useEffect(() => {
    if (!nationalityOpen) return
    const t = setTimeout(() => {
      fetchNationalities(nationalityQuery).then(setNationalityOptions).catch(() => setNationalityOptions([]))
    }, nationalityQuery.trim() === '' ? 0 : 300)
    return () => clearTimeout(t)
  }, [nationalityQuery, nationalityOpen])

  useEffect(() => {
    if (!salutationOpen) return
    const t = setTimeout(() => {
      fetchSalutations(salutationQuery).then(setSalutationOptions).catch(() => setSalutationOptions([]))
    }, salutationQuery.trim() === '' ? 0 : 300)
    return () => clearTimeout(t)
  }, [salutationQuery, salutationOpen])

  useEffect(() => {
    if (!insuranceOpen) return
    const t = setTimeout(() => {
      fetchHealthcareInsurance(insuranceQuery).then(setInsuranceOptions).catch(() => setInsuranceOptions([]))
    }, 300)
    return () => clearTimeout(t)
  }, [insuranceQuery, insuranceOpen])

  useEffect(() => {
    if (!iprOpen) return
    const t = setTimeout(() => {
      fetchInsurancePatientRegisters(iprQuery || undefined).then(setIprOptions).catch(() => setIprOptions([]))
    }, 300)
    return () => clearTimeout(t)
  }, [iprQuery, iprOpen])

  const handleSourceSelect = (source: LinkFieldOption) => {
    setSelectedSource(source)
    setFormData((prev) => ({ ...prev, source: source.name }))
    setSourceOpen(false)
    setSourceQuery('')
  }

  const handleNationalitySelect = (nat: LinkFieldOption) => {
    setSelectedNationality(nat)
    setFormData((prev) => ({ ...prev, nationality: nat.name }))
    setNationalityOpen(false)
    setNationalityQuery('')
  }

  const handleSalutationSelect = (sal: LinkFieldOption) => {
    setSelectedSalutation(sal)
    setFormData((prev) => ({ ...prev, title: sal.name }))
    setSalutationOpen(false)
    setSalutationQuery('')
  }

  const handleInsuranceSelect = (ins: any) => {
    setSelectedInsurance(ins)
    setFormData(prev => ({
      ...prev,
      insurance: ins.name,
      insurance_type: ins.insurance_type,
      insurance_company_no: ins.insurance_company,
      insurance_policy: ins.policy_no,
    }))
    setInsuranceOpen(false)
    setInsuranceQuery('')
  }

  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: 'details', label: 'Patient Details' },
    { id: 'relations', label: 'Next of Kin', badge: relations.length || undefined },
    { id: 'insurance', label: 'Insurance' },
    { id: 'documents', label: 'Documents', badge: documents.length || undefined },
    { id: 'cpr', label: 'Attach CPR', badge: (cprPhoto ? 1 : 0) + (cprPhotoBack ? 1 : 0) || undefined },
  ]

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8 text-slate-600">Loading patient...</div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-slate-200 shrink-0">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-slate-900">Edit Patient</h2>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex mt-4 border-b border-slate-200 -mb-6">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-5 py-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
                  activeTab === tab.id
                    ? 'border-blue-600 text-blue-700'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                {tab.label}
                {tab.badge !== undefined && (
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                    activeTab === tab.id ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {tab.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div
            className="shrink-0 px-6 py-3 bg-red-50 border-b border-red-200"
            role="alert"
          >
            <p className="text-sm font-medium text-red-800">{error}</p>
          </div>
        )}

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          className="flex flex-col flex-1 min-h-0"
          onClick={(e) => {
            const target = e.target as HTMLElement
            if (target.tagName !== 'INPUT' && target.tagName !== 'SELECT' && !target.closest('.absolute')) {
              setSourceOpen(false)
              setNationalityOpen(false)
              setSalutationOpen(false)
              setInsuranceOpen(false)
              setIprOpen(false)
            }
          }}
        >
          {/* All field labels and placeholders render uppercase via text-transform */}
          <div className="overflow-y-auto p-6 space-y-4 text-slate-900 [&_label]:uppercase [&_input::placeholder]:uppercase [&_textarea::placeholder]:uppercase" style={{ height: "520px" }}>
            {/* ── TAB: Patient Details ── */}
            {activeTab === 'details' && (
              <>
                {/* Blacklist — pinned top-right for doctors and reception */}
                <div className="flex justify-end">
                  {canBlacklist ? (
                    <button
                      type="button"
                      onClick={() => setBlacklistOpen(true)}
                      className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-semibold ${
                        formData.is_black_list
                          ? 'border-red-300 bg-red-50 text-red-800 hover:bg-red-100'
                          : 'border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <Ban className="h-4 w-4" />
                      Blacklist
                    </button>
                  ) : formData.is_black_list ? (
                    <span className="inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-semibold text-red-800">
                      <Ban className="h-4 w-4" />
                      Blacklisted
                    </span>
                  ) : null}
                </div>
                {formData.is_black_list && formData.blacklist_reason ? (
                  <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                    {formData.blacklist_reason}
                  </div>
                ) : null}

                {/* Basic details */}
                <div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Title</label>
                      <div className="relative">
                        <input
                          type="text"
                          value={selectedSalutation ? selectedSalutation.label : salutationQuery}
                          onChange={(e) => { setSalutationQuery(e.target.value); setSalutationOpen(true) }}
                          onFocus={() => setSalutationOpen(true)}
                          placeholder="Search title..."
                          className="w-full rounded-md border border-slate-300 bg-white text-slate-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                        {salutationOpen && salutationOptions.length > 0 && (
                          <div className="absolute z-10 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-60 overflow-y-auto top-full">
                            {salutationOptions.map((sal) => (
                              <button key={sal.name} type="button" onClick={() => handleSalutationSelect(sal)} className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100">
                                {sal.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        File No <span className="text-red-500">*</span>
                      </label>
                      <input type="text" value={formData.file_no} onChange={(e) => handleChange('file_no', e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" required />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Full Name <span className="text-red-500">*</span>
                      </label>
                      <input type="text" value={formData.patient_name} onChange={(e) => handleChange('patient_name', e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" required />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Gender <span className="text-red-500">*</span>
                      </label>
                      <select value={formData.sex} onChange={(e) => handleChange('sex', e.target.value)} className="w-full appearance-none rounded-md border border-slate-300 px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white" style={SELECT_CHEVRON_STYLE} required>
                        <option value="">SELECT GENDER</option>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Date of Birth</label>
                      <input type="date" value={formData.dob} onChange={(e) => handleChange('dob', e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                      <PatientDobAgeHint dob={formData.dob} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Blood Group</label>
                      <select value={formData.blood_group} onChange={(e) => handleChange('blood_group', e.target.value)} className="w-full appearance-none rounded-md border border-slate-300 px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white" style={SELECT_CHEVRON_STYLE}>
                        <option value="">SELECT BLOOD GROUP</option>
                        <option value="A Positive">A Positive</option>
                        <option value="A Negative">A Negative</option>
                        <option value="AB Positive">AB Positive</option>
                        <option value="AB Negative">AB Negative</option>
                        <option value="B Positive">B Positive</option>
                        <option value="B Negative">B Negative</option>
                        <option value="O Positive">O Positive</option>
                        <option value="O Negative">O Negative</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Contact */}
                <div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Mobile <span className="text-red-500">*</span>
                      </label>
                      <input type="tel" value={formData.mobile} onChange={(e) => handleChange('mobile', e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Mobile Number Owner</label>
                      <input type="text" value={formData.mobile_no_owner} onChange={(e) => handleChange('mobile_no_owner', e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
                      <input type="tel" value={formData.phone} onChange={(e) => handleChange('phone', e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                      <input type="email" value={formData.email} onChange={(e) => handleChange('email', e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Alternate Mobile 1</label>
                      <input type="tel" value={formData.alternative_mobile_no_1} onChange={(e) => handleChange('alternative_mobile_no_1', e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Alternate Mobile 2</label>
                      <input type="tel" value={formData.alternative_mobile_no_2} onChange={(e) => handleChange('alternative_mobile_no_2', e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                    </div>
                  </div>
                </div>

                {/* Identification */}
                <div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">CPR / ID / Passport No.</label>
                      <input type="text" value={formData.id_number} onChange={(e) => handleChange('id_number', e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Nationality</label>
                      <div className="relative flex items-center">
                        <input
                          type="text"
                          value={selectedNationality ? selectedNationality.label : nationalityQuery}
                          onChange={(e) => { setNationalityQuery(e.target.value); setNationalityOpen(true) }}
                          onFocus={() => setNationalityOpen(true)}
                          placeholder="Search nationality..."
                          className="w-full rounded-md border border-slate-300 px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                        <button type="button" onClick={() => setShowCreateNationality(true)} className="absolute right-2 p-1 text-primary hover:text-primary/80 rounded">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                        </button>
                        {nationalityOpen && nationalityOptions.length > 0 && (
                          <div className="absolute z-10 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-60 overflow-y-auto top-full">
                            {nationalityOptions.map((nat) => (
                              <button key={nat.name} type="button" onClick={() => handleNationalitySelect(nat)} className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100">
                                {nat.label} {nat.country && <span className="text-xs text-slate-500">({nat.country})</span>}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
                      <select
                        value={formData.category}
                        onChange={(e) => handleChange('category', e.target.value)}
                        className="w-full appearance-none rounded-md border border-slate-300 px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                        style={SELECT_CHEVRON_STYLE}
                      >
                        <option value="">SELECT CATEGORY</option>
                        {/* Keep a stored value visible even if its Patient Category record is missing from the list */}
                        {formData.category && !categoryOptions.some((c) => c.name === formData.category) && (
                          <option value={formData.category}>{formData.category}</option>
                        )}
                        {categoryOptions.map((cat) => (
                          <option key={cat.name} value={cat.name}>{cat.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Patient Referral or Source <span className="text-red-500">*</span>
                      </label>
                      <div className="relative flex items-center">
                        <input
                          type="text"
                          value={selectedSource ? selectedSource.label : sourceQuery}
                          onChange={(e) => { setSourceQuery(e.target.value); setSourceOpen(true) }}
                          onFocus={() => setSourceOpen(true)}
                          placeholder="Search source..."
                          className="w-full rounded-md border border-slate-300 px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                          required
                        />
                        <button type="button" onClick={() => setShowCreateSource(true)} className="absolute right-2 p-1 text-primary hover:text-primary/80 rounded">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                        </button>
                        {sourceOpen && sourceOptions.length > 0 && (
                          <div className="absolute z-10 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-60 overflow-y-auto top-full">
                            {sourceOptions.map((source) => (
                              <button key={source.name} type="button" onClick={() => handleSourceSelect(source)} className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100">
                                {source.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Marital Status</label>
                      <select value={formData.marital_status} onChange={(e) => handleChange('marital_status', e.target.value)} className="w-full appearance-none rounded-md border border-slate-300 px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white" style={SELECT_CHEVRON_STYLE}>
                        <option value="">SELECT MARITAL STATUS</option>
                        <option value="Single">Single</option>
                        <option value="Married">Married</option>
                        <option value="Divorced">Divorced</option>
                        <option value="Widow">Widow</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Job details — company first, then designation */}
                <div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Job Company</label>
                      <input type="text" value={formData.job_company} onChange={(e) => handleChange('job_company', e.target.value)} placeholder="Company / Organization" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Designation</label>
                      <input type="text" value={formData.job_title} onChange={(e) => handleChange('job_title', e.target.value)} placeholder="e.g. Nurse, Engineer, Teacher" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                    </div>
                  </div>
                </div>

                {/* Address */}
                <div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Address Line 1 <span className="text-red-500">*</span>
                      </label>
                      <input type="text" value={formData.address_line1} onChange={(e) => handleChange('address_line1', e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" required />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-slate-700 mb-1">Address Line 2</label>
                      <input type="text" value={formData.address_line2} onChange={(e) => handleChange('address_line2', e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">City</label>
                      <input type="text" value={formData.city} onChange={(e) => handleChange('city', e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">State</label>
                      <input type="text" value={formData.state} onChange={(e) => handleChange('state', e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Country</label>
                      <select value={formData.country} onChange={(e) => handleChange('country', e.target.value)} className="w-full appearance-none rounded-md border border-slate-300 px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white" style={SELECT_CHEVRON_STYLE}>
                        <option value="">SELECT COUNTRY</option>
                        {countries.map((c) => (
                          <option key={c.name} value={c.name}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Postal Code</label>
                      <input type="text" value={formData.pincode} onChange={(e) => handleChange('pincode', e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                    </div>
                  </div>
                </div>

                {/* Remarks */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Other Informations / Remarks</label>
                  <textarea value={formData.remarks} onChange={(e) => handleChange('remarks', e.target.value)} rows={2} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
              </>
            )}

            {/* ── TAB: Insurance ── */}
            {activeTab === 'insurance' && (
              <div className="space-y-5">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-sm font-medium text-slate-700">
                    Has Insurance <span className="text-red-500">*</span>
                  </span>
                  <label className="inline-flex items-center gap-1.5 text-sm text-slate-700">
                    <input
                      type="radio"
                      className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                      checked={hasInsuranceChoice === 'Yes'}
                      onChange={() => {
                        setHasInsuranceChoice('Yes')
                        handleChange('has_insurance', true)
                      }}
                    />
                    Yes
                  </label>
                  <label className="inline-flex items-center gap-1.5 text-sm text-slate-700">
                    <input
                      type="radio"
                      className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                      checked={hasInsuranceChoice === 'No'}
                      onChange={() => {
                        setHasInsuranceChoice('No')
                        handleChange('has_insurance', false)
                      }}
                    />
                    No
                  </label>
                </div>
                {hasInsuranceChoice === 'Yes' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2 flex flex-col gap-1">
                      <label className="text-xs font-medium text-slate-600">Insurance</label>
                      <div className="relative">
                        <input type="text"
                          value={selectedInsurance ? selectedInsurance.label : insuranceQuery}
                          onChange={(e) => { setInsuranceQuery(e.target.value); setInsuranceOpen(true) }}
                          onFocus={() => setInsuranceOpen(true)}
                          placeholder="Search Healthcare Insurance..."
                          className="w-full rounded-md border border-slate-300 bg-white text-slate-900 px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none" />
                        {insuranceOpen && insuranceOptions.length > 0 && (
                          <div className="absolute z-10 w-full bg-white text-slate-900 border border-slate-200 rounded-md shadow max-h-60 overflow-y-auto">
                            {insuranceOptions.map((ins) => (
                              <button key={ins.name} type="button" onClick={() => handleInsuranceSelect(ins)} className="w-full text-left px-3 py-2 text-sm text-slate-900 hover:bg-slate-100">
                                {ins.name}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-medium text-slate-600">Insurance Type</label>
                      <input value={formData.insurance_type || ''} readOnly className="w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700 cursor-default focus:outline-none" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-medium text-slate-600">Insurance Company No</label>
                      <input value={formData.insurance_company_no || ''} readOnly className="w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700 cursor-default focus:outline-none" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-medium text-slate-600">Policy No</label>
                      <input value={formData.insurance_policy || ''} readOnly className="w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700 cursor-default focus:outline-none" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-medium text-slate-600">Reference No</label>
                      <input value={formData.ref_no || ''} onChange={(e) => handleChange('ref_no', e.target.value)} className="w-full rounded-md border border-slate-300 bg-white text-slate-900 px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none" />
                    </div>
                    <div className="md:col-span-2 flex flex-col gap-1">
                      <label className="text-xs font-medium text-slate-600">Insurance Patient Register</label>
                      <div className="relative">
                        <input
                          type="text"
                          value={selectedIpr ? selectedIpr.label : iprQuery}
                          onChange={(e) => { setIprQuery(e.target.value); setIprOpen(true) }}
                          onFocus={() => setIprOpen(true)}
                          placeholder="Search insurance register..."
                          className="w-full rounded-md border border-slate-300 bg-white text-slate-900 px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
                        />
                        {selectedIpr && (
                          <button
                            type="button"
                            onClick={() => { setSelectedIpr(null); setIprQuery(''); handleChange('insurance_register', '') }}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                        {iprOpen && iprOptions.length > 0 && (
                          <div className="absolute z-10 w-full bg-white text-slate-900 border border-slate-200 rounded-md shadow max-h-60 overflow-y-auto">
                            {iprOptions.map((reg) => (
                              <button
                                key={reg.name}
                                type="button"
                                onClick={() => {
                                  setSelectedIpr({ name: reg.name, label: reg.name })
                                  handleChange('insurance_register', reg.name)
                                  setIprOpen(false)
                                  setIprQuery('')
                                }}
                                className="w-full text-left px-3 py-2 text-sm text-slate-900 hover:bg-slate-100"
                              >
                                <span className="font-medium">{reg.name}</span>
                                {reg.full_name && <span className="ml-2 text-slate-500 text-xs">— {reg.full_name}</span>}
                                <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${reg.status === 'Active' ? 'bg-green-100 text-green-700' : reg.status === 'Unused' ? 'bg-slate-100 text-slate-500' : 'bg-red-100 text-red-600'}`}>
                                  {reg.status || 'Unused'}
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── TAB: Next of Kin ── */}
            {activeTab === 'relations' && (
              <div>
                <div className="space-y-3">
                  {relations.length === 0 && (
                    <div className="text-center py-10 rounded-lg border-2 border-dashed border-slate-200 text-slate-400 text-sm">
                      NO RELATIVE ADDED
                    </div>
                  )}
                  {relations.map((row, idx) => (
                    <div key={idx} className="rounded-lg border border-slate-200 p-4 bg-slate-50/50 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Relation #{idx + 1}</span>
                        <button type="button" onClick={() => removeRelationRow(idx)} className="p-1 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors" title="Remove">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-0.5">Full Name</label>
                          <input type="text" value={row.full_name || ''} onChange={(e) => updateRelationRow(idx, 'full_name', e.target.value)} placeholder="Full name" className="w-full rounded border border-slate-300 bg-white text-slate-900 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-0.5">Relation</label>
                          <select value={row.relation || ''} onChange={(e) => updateRelationRow(idx, 'relation', e.target.value)} className="w-full appearance-none rounded border border-slate-300 bg-white text-slate-900 px-2 py-1.5 pr-7 text-sm focus:outline-none focus:ring-2 focus:ring-primary" style={SELECT_CHEVRON_STYLE}>
                            <option value="">SELECT RELATION</option>
                            {PATIENT_RELATION_OPTIONS.map((opt) => (<option key={opt} value={opt}>{opt}</option>))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-0.5">Mobile No</label>
                          <input type="tel" value={row.mobile_no || ''} onChange={(e) => updateRelationRow(idx, 'mobile_no', e.target.value)} placeholder="Mobile number" className="w-full rounded border border-slate-300 bg-white text-slate-900 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-0.5">Email</label>
                          <input type="email" value={row.email || ''} onChange={(e) => updateRelationRow(idx, 'email', e.target.value)} placeholder="Email address" className="w-full rounded border border-slate-300 bg-white text-slate-900 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                        </div>
                        <div className="md:col-span-2">
                          <label className="block text-xs font-medium text-slate-600 mb-0.5">Note</label>
                          <input type="text" value={row.description || ''} onChange={(e) => updateRelationRow(idx, 'description', e.target.value)} placeholder="Additional note (optional)" className="w-full rounded border border-slate-300 bg-white text-slate-900 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                        </div>
                        <div className="md:col-span-2">
                          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none">
                            <input type="checkbox" checked={!!row.is_next_of_kin} onChange={(e) => updateRelationRow(idx, 'is_next_of_kin', e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary" />
                            Mark as Next of Kin
                          </label>
                        </div>
                      </div>
                    </div>
                  ))}
                  <button type="button" onClick={addRelationRow} className="flex items-center gap-1.5 text-sm text-primary font-medium hover:underline">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                    Add Next of Kin
                  </button>
                </div>
              </div>
            )}

            {/* ── TAB: Documents ── */}
            {activeTab === 'documents' && (
              <div>
                <div className="space-y-4">
                  {documents.length === 0 && (
                    <div className="text-center py-10 rounded-lg border-2 border-dashed border-slate-200 text-slate-400 text-sm font-medium tracking-wide">
                      NO DOCUMENT ADDED
                    </div>
                  )}

                  {documents.map((row, idx) => (
                    <div key={idx} className="rounded-lg border border-slate-200 bg-slate-50/50 overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200 bg-white">
                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Document #{idx + 1}</span>
                        <button type="button" onClick={() => removeDocumentRow(idx)} className="p-1 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors" title="Remove row">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>

                      <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
                        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-0.5">File Name</label>
                            <input value={row.file_name} onChange={(e) => updateDocumentRow(idx, 'file_name', e.target.value)} placeholder="File name" className="w-full rounded border border-slate-300 bg-white text-slate-900 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-0.5">Document Type</label>
                            <DocumentTypeSelect
                              value={row.document_type || ''}
                              onChange={(v) => updateDocumentRow(idx, 'document_type', v)}
                              types={documentTypes}
                              onTypesUpdated={setDocumentTypes}
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-0.5">Transaction No</label>
                            <input value={row.transaction_no || ''} onChange={(e) => updateDocumentRow(idx, 'transaction_no', e.target.value)} placeholder="Transaction number" className="w-full rounded border border-slate-300 bg-white text-slate-900 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-0.5">Upload Remarks</label>
                            <input value={row.upload_remarks || ''} onChange={(e) => updateDocumentRow(idx, 'upload_remarks', e.target.value)} placeholder="Remarks" className="w-full rounded border border-slate-300 bg-white text-slate-900 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                          </div>
                          <div className="sm:col-span-2">
                            <label
                              className={`inline-flex items-center gap-2 h-8 px-3 rounded text-xs font-semibold cursor-pointer transition-colors ${
                                documentUploading === idx
                                  ? 'bg-slate-200 text-slate-500'
                                  : 'bg-primary text-white hover:bg-primary/90'
                              }`}
                            >
                              <Upload className="w-3.5 h-3.5" />
                              {documentUploading === idx ? 'UPLOADING…' : 'UPLOAD FILE'}
                              <input type="file" disabled={documentUploading === idx} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleDocumentFile(idx, f); e.target.value = '' }} className="hidden" />
                            </label>
                            {row.document && documentUploading !== idx && signatureUploading !== idx && (
                              <PatientDocumentAttachmentPreview
                                url={row.document}
                                fileName={row.file_name}
                                compact
                              />
                            )}
                          </div>
                        </div>

                        <div className="p-4 flex flex-col gap-2">
                          <div className="flex items-center gap-1.5 mb-1">
                            <PenLine className="w-3.5 h-3.5 text-slate-400" />
                            <span className="text-xs font-medium text-slate-600 uppercase">Digital Signature</span>
                          </div>
                          <div className="flex-1">
                            <SignaturePad
                              onSave={(file) => handleSignatureFile(idx, file)}
                              existingUrl={row.document?.includes('signature_') ? row.document : undefined}
                              uploading={signatureUploading === idx}
                            />
                          </div>
                          {signatureUploading === idx && (<p className="text-xs text-slate-500 text-center">Uploading signature...</p>)}
                        </div>
                      </div>
                    </div>
                  ))}

                  <button type="button" onClick={addDocumentRow} className="flex items-center gap-1.5 text-sm text-primary font-medium hover:underline">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                    Add document
                  </button>
                </div>
              </div>
            )}

            {/* ── TAB: Attach CPR front & back ── */}
            {activeTab === 'cpr' && (
              <div>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-sm font-bold uppercase tracking-widest text-slate-800">UPLOAD CPR</h3>
                  {(cprPhoto || cprPhotoBack) && (
                    <button
                      type="button"
                      onClick={() => {
                        const images = [
                          cprPhoto
                            ? { url: cprPhoto, label: 'CPR Front' }
                            : null,
                          cprPhotoBack
                            ? { url: cprPhotoBack, label: 'CPR Back' }
                            : null,
                        ].filter(Boolean) as Array<{ url: string; label: string }>
                        printImagesInPlace(images, 'CPR')
                      }}
                      className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      title="Print CPR front and back on one page"
                    >
                      <Printer className="w-4 h-4" />
                      Print CPR
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {([
                    { side: 'front' as const, label: 'CPR FRONT SIDE IMAGE', buttonLabel: 'UPLOAD FRONT SIDE IMAGE', value: cprPhoto, setValue: setCprPhoto },
                    { side: 'back' as const, label: 'CPR BACK SIDE IMAGE', buttonLabel: 'UPLOAD BACK SIDE IMAGE', value: cprPhotoBack, setValue: setCprPhotoBack },
                  ]).map(({ side, label, buttonLabel, value, setValue }) => (
                    <div key={side} className="space-y-3">
                      <div className="flex items-center gap-3">
                        <label
                          className={`inline-flex items-center gap-2 h-9 px-3 rounded-md text-xs font-semibold cursor-pointer transition-colors ${
                            cprUploading === side
                              ? 'bg-slate-200 text-slate-500'
                              : 'bg-primary text-white hover:bg-primary/90'
                          }`}
                          title={cprUploading === side ? 'Uploading…' : value ? `Replace ${label}` : buttonLabel}
                        >
                          {cprUploading === side ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : value ? (
                            <RefreshCw className="w-4 h-4" />
                          ) : (
                            <Upload className="w-4 h-4" />
                          )}
                          {cprUploading === side ? 'UPLOADING…' : buttonLabel}
                          <input
                            type="file"
                            accept="image/*"
                            disabled={cprUploading !== null}
                            onChange={(e) => {
                              const f = e.target.files?.[0]
                              if (f) handleCprFile(side, f)
                              e.target.value = ''
                            }}
                            className="hidden"
                          />
                        </label>
                        {value && (
                          <>
                            <a
                              href={value}
                              download
                              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                              title={`Download ${label}`}
                            >
                              <Download className="w-4 h-4" />
                            </a>
                            <button
                              type="button"
                              onClick={() => setValue('')}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-300 bg-white text-red-500 hover:bg-red-50"
                              title={`Remove ${label}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                      {value ? (
                        <a href={value} target="_blank" rel="noreferrer" title="Click to open full size" className="block rounded-lg border border-slate-200 bg-white p-2 hover:ring-2 hover:ring-primary/40">
                          <img src={value} alt={label} className="mx-auto max-h-56 object-contain" />
                        </a>
                      ) : (
                        <div className="rounded-lg border-2 border-dashed border-slate-200 p-8 text-center text-sm font-medium tracking-wide text-slate-400">
                          {label}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="shrink-0 border-t border-slate-200 px-6 py-4 flex items-center justify-between bg-white rounded-b-lg">
            <div className="flex gap-2">
              {activeTab !== 'details' && (
                <button
                  type="button"
                  onClick={() =>
                    setActiveTab(
                      activeTab === 'cpr'
                        ? 'documents'
                        : activeTab === 'documents'
                          ? 'relations'
                          : activeTab === 'insurance'
                            ? 'relations'
                            : 'details'
                    )
                  }
                  className="px-3 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 flex items-center gap-1"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                  Back
                </button>
              )}
              {activeTab !== 'cpr' && (
                <button
                  type="button"
                  onClick={() =>
                    setActiveTab(
                      activeTab === 'details'
                        ? 'relations'
                        : activeTab === 'documents'
                          ? 'cpr'
                          : 'documents'
                    )
                  }
                  className="px-3 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 flex items-center gap-1"
                >
                  Next
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                </button>
              )}
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50">
                Cancel
              </button>
              <button type="submit" disabled={submitting} className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50">
                {submitting ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </form>
      </div>

      {showCreateSource && (
        <CreateLeadSourceModal
          onClose={() => setShowCreateSource(false)}
          onSuccess={(created) => {
            const option: LinkFieldOption = { name: created.name, label: created.source }
            setSourceOptions((prev) => [option, ...prev])
            setSelectedSource(option)
            setFormData((prev) => ({ ...prev, source: created.name }))
            setSourceQuery('')
            setSourceOpen(false)
            setShowCreateSource(false)
          }}
        />
      )}

      {showCreateNationality && (
        <CreateNationalityModal
          onClose={() => setShowCreateNationality(false)}
          onSuccess={(created) => {
            const option: LinkFieldOption = { name: created.name, label: created.nationality, country: created.country }
            setNationalityOptions((prev) => [option, ...prev])
            setSelectedNationality(option)
            setFormData((prev) => ({ ...prev, nationality: created.name }))
            setNationalityQuery('')
            setNationalityOpen(false)
            setShowCreateNationality(false)
          }}
        />
      )}

      <BlacklistPatientModal
        open={blacklistOpen}
        patientName={patientName}
        patientLabel={formData.patient_name}
        initialBlacklisted={formData.is_black_list}
        initialReason={formData.blacklist_reason}
        onClose={() => setBlacklistOpen(false)}
        onSaved={(nextFlag, nextReason) => {
          setFormData((prev) => ({
            ...prev,
            is_black_list: nextFlag,
            blacklist_reason: nextReason || '',
          }))
        }}
      />
    </div>
  )
}
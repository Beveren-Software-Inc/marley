import { useState, useEffect } from 'react'
import { createPatient, uploadPatientFile, type PatientDocumentRow } from '../../services/patients'
import { fetchLeadSources, fetchNationalities, fetchCountries, fetchDocumentTypes, type LinkFieldOption } from '../../services/common'
import { CreateLeadSourceModal } from './CreateLeadSourceModal'
import { CreateNationalityModal } from './CreateNationalityModal'
import { toast } from '../../hooks/useToast'

interface CreatePatientModalProps {
  onClose: () => void
  onSuccess?: (patientName: string) => void
}

export const CreatePatientModal = ({ onClose, onSuccess }: CreatePatientModalProps) => {
  const [formData, setFormData] = useState({
    first_name: '',
    title: '',
    file_no: '',
    middle_name: '',
    last_name: '',
    sex: '',
    dob: '',
    blood_group: '',
    mobile: '',
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
    remarks: '',
    address_line1: '',
    address_line2: '',
    city: '',
    state: '',
    country: '',
    pincode: ''
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Source dropdown state
  const [sourceOptions, setSourceOptions] = useState<LinkFieldOption[]>([])
  const [sourceOpen, setSourceOpen] = useState(false)
  const [sourceQuery, setSourceQuery] = useState('')
  const [selectedSource, setSelectedSource] = useState<LinkFieldOption | null>(null)
  const [showCreateSource, setShowCreateSource] = useState(false)

  // Nationality dropdown state
  const [nationalityOptions, setNationalityOptions] = useState<LinkFieldOption[]>([])
  const [nationalityOpen, setNationalityOpen] = useState(false)
  const [nationalityQuery, setNationalityQuery] = useState('')
  const [selectedNationality, setSelectedNationality] = useState<LinkFieldOption | null>(null)
  const [showCreateNationality, setShowCreateNationality] = useState(false)
  const [countries, setCountries] = useState<{ name: string }[]>([])
  const [documentTypes, setDocumentTypes] = useState<{ name: string; document_name?: string }[]>([])
  const [documents, setDocuments] = useState<PatientDocumentRow[]>([])
  const [documentUploading, setDocumentUploading] = useState<number | null>(null)

  // Next of Kin / Patient Relation (relation, mobile_no, email)
  const PATIENT_RELATION_OPTIONS = ['Father', 'Mother', 'Spouse', 'Siblings', 'Family', 'Other'] as const
  const [relations, setRelations] = useState<{ relation: string; mobile_no: string; email: string; description?: string }[]>([])

  const addRelationRow = () => {
    setRelations((prev) => [...prev, { relation: '', mobile_no: '', email: '' }])
  }
  const removeRelationRow = (idx: number) => {
    setRelations((prev) => prev.filter((_, i) => i !== idx))
  }
  const updateRelationRow = (idx: number, field: 'relation' | 'mobile_no' | 'email' | 'description', value: string) => {
    setRelations((prev) => {
      const next = [...prev]
      next[idx] = { ...next[idx], [field]: value }
      return next
    })
  }

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

  // FIX: upload — capture idx in closure before async call, reset on any outcome
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.first_name || !formData.sex) {
      setError('First Name and Gender are required')
      return
    }
    if (!formData.mobile && !formData.phone) {
      setError('At least one Contact No. (Mobile or Phone) is required')
      return
    }
    if (!formData.address_line1 || !formData.city) {
      setError('Address (Line 1 and City) is required')
      return
    }
    if (!formData.source) {
      setError('Patient Referral or Source is required')
      return
    }
    if (!formData.category) {
      setError('Patient type is required')
      return
    }

    try {
      setLoading(true)
      setError(null)

      const payload = {
        ...formData,
        is_black_list: formData.is_black_list,
        remarks: formData.remarks || undefined,
        patient_relation: relations
          .filter((r) => (r.relation || r.mobile_no || r.email || '').trim())
          .map((r) => ({
            relation: (r.relation || '').trim() || undefined,
            mobile_no: (r.mobile_no || '').trim() || undefined,
            email: (r.email || '').trim() || undefined,
            description: (r.description || '').trim() || undefined,
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
      }
      const patient = await createPatient(payload)
      const successMsg = patient.server_message || 'Patient created'
      toast.success(successMsg)
      if (onSuccess) {
        onSuccess(patient.name || patient.patient_name || '')
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create patient')
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (field: string, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  // Load initial options (source + nationalities + countries)
  useEffect(() => {
    const loadOptions = async () => {
      try {
        const [sources, nationalities, countryList, docTypes] = await Promise.all([
          fetchLeadSources(),
          fetchNationalities(),
          fetchCountries(),
          fetchDocumentTypes(),
        ])
        setSourceOptions(sources)
        setNationalityOptions(nationalities)
        setCountries(countryList)
        setDocumentTypes(docTypes)
      } catch (err) {
        console.error('Failed to load options:', err)
      }
    }
    loadOptions()
  }, [])

  // Search sources
  useEffect(() => {
    if (!sourceOpen) return

    const search = async () => {
      try {
        const results = await fetchLeadSources(sourceQuery)
        setSourceOptions(results)
      } catch (err) {
        console.error('Failed to search sources:', err)
        setSourceOptions([])
      }
    }

    const timeoutId = setTimeout(() => {
      search()
    }, sourceQuery.trim() === '' ? 0 : 300)

    return () => clearTimeout(timeoutId)
  }, [sourceQuery, sourceOpen])

  const handleSourceSelect = (source: LinkFieldOption) => {
    setSelectedSource(source)
    setFormData(prev => ({ ...prev, source: source.name }))
    setSourceOpen(false)
    setSourceQuery('')
  }

  // Search nationalities
  useEffect(() => {
    if (!nationalityOpen) return

    const search = async () => {
      try {
        const results = await fetchNationalities(nationalityQuery)
        setNationalityOptions(results)
      } catch (err) {
        console.error('Failed to search nationalities:', err)
        setNationalityOptions([])
      }
    }

    const timeoutId = setTimeout(() => {
      search()
    }, nationalityQuery.trim() === '' ? 0 : 300)

    return () => clearTimeout(timeoutId)
  }, [nationalityQuery, nationalityOpen])

  const handleNationalitySelect = (nat: LinkFieldOption) => {
    setSelectedNationality(nat)
    setFormData((prev) => ({ ...prev, nationality: nat.name }))
    setNationalityOpen(false)
    setNationalityQuery('')
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-slate-200">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-slate-900">Create New Patient</h2>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="p-6 space-y-4"
          onClick={(e) => {
            // Close dropdowns when clicking outside inputs
            const target = e.target as HTMLElement
            if (target.tagName !== 'INPUT' && target.tagName !== 'SELECT' && !target.closest('.absolute')) {
              setSourceOpen(false)
              setNationalityOpen(false)
            }
          }}
        >
          {/* Basic Information */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-widest text-blue-600 mb-3 mt-2">Basic Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Title
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => handleChange('title', e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  required
                />
              </div>
               <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  File No <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.file_no}
                  onChange={(e) => handleChange('file_no', e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  First Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.first_name}
                  onChange={(e) => handleChange('first_name', e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Middle Name
                </label>
                <input
                  type="text"
                  value={formData.middle_name}
                  onChange={(e) => handleChange('middle_name', e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Last Name
                </label>
                <input
                  type="text"
                  value={formData.last_name}
                  onChange={(e) => handleChange('last_name', e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Gender <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.sex}
                  onChange={(e) => handleChange('sex', e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  required
                >
                  <option value="">Select Gender</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Date of Birth
                </label>
                <input
                  type="date"
                  value={formData.dob}
                  onChange={(e) => handleChange('dob', e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Blood Group
                </label>
                <select
                  value={formData.blood_group}
                  onChange={(e) => handleChange('blood_group', e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">Select Blood Group</option>
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

          {/* Contact Information */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-widest text-blue-600 mb-3 mt-2">Contact Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Mobile <span className="text-red-500">*</span>
                </label>
                <input
                  type="tel"
                  value={formData.mobile}
                  onChange={(e) => handleChange('mobile', e.target.value)}
                  required
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Phone
                </label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => handleChange('phone', e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
                <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Alternative Mobile No
                </label>
                <input
                  type="tel"
                  value={formData.alternative_mobile_no_1}
                  onChange={(e) => handleChange('alternative_mobile_no_1', e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
                <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Alternative Mobile No 2
                </label>
                <input
                  type="tel"
                  value={formData.alternative_mobile_no_2}
                  onChange={(e) => handleChange('alternative_mobile_no_2', e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleChange('email', e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>
          </div>

          {/* Identification */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-widest text-blue-600 mb-3 mt-2">Identification</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  CPR / ID / Passport No.
                </label>
                <input
                  type="text"
                  value={formData.id_number}
                  onChange={(e) => handleChange('id_number', e.target.value)}
                  placeholder="CPR / ID / Passport (unlimited digits)"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Nationality
                </label>
                <div className="relative flex items-center">
                  <input
                    type="text"
                    value={selectedNationality ? selectedNationality.label : nationalityQuery}
                    onChange={(e) => {
                      setNationalityQuery(e.target.value)
                      setNationalityOpen(true)
                    }}
                    onFocus={() => setNationalityOpen(true)}
                    placeholder="Search nationality..."
                    className="w-full rounded-md border border-slate-300 px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setShowCreateNationality(true)
                    }}
                    className="absolute right-2 p-1 text-primary hover:text-primary/80 rounded"
                    title="Create New Nationality"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </button>
                  {nationalityOpen && nationalityOptions.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-60 overflow-y-auto top-full">
                      {nationalityOptions.map((nat) => (
                        <button
                          key={nat.name}
                          type="button"
                          onClick={() => handleNationalitySelect(nat)}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 focus:bg-slate-100 focus:outline-none"
                        >
                          <div className="font-medium">{nat.label}</div>
                          {nat.country && (
                            <div className="text-xs text-slate-500">{nat.country}</div>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Patient type <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.category}
                  onChange={(e) => handleChange('category', e.target.value)}
                  required
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">Select Patient type</option>
                  <option value="Royal">Royal</option>
                  <option value="American Navy">American Navy</option>
                  <option value="Regular">Regular</option>
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
                    onChange={(e) => {
                      setSourceQuery(e.target.value)
                      setSourceOpen(true)
                    }}
                    onFocus={() => setSourceOpen(true)}
                    placeholder="Search source..."
                    className="w-full rounded-md border border-slate-300 px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    required
                  />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setShowCreateSource(true)
                    }}
                    className="absolute right-2 p-1 text-primary hover:text-primary/80 rounded"
                    title="Create New Source"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </button>
                  {sourceOpen && sourceOptions.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-60 overflow-y-auto top-full">
                      {sourceOptions.map((source) => (
                        <button
                          key={source.name}
                          type="button"
                          onClick={() => handleSourceSelect(source)}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 focus:bg-slate-100 focus:outline-none"
                        >
                          {source.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Marital Status <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.marital_status}
                  onChange={(e) => handleChange('marital_status', e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  required
                >
                  <option value="">Select Marital Status</option>
                  <option value="Single">Single</option>
                  <option value="Married">Married</option>
                  <option value="Divorced">Divorced</option>
                  <option value="Widow">Widow</option>
                </select>
              </div>
            </div>
          </div>

          {/* Address */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-widest text-blue-600 mb-3 mt-2">Address</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Address Line 1 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.address_line1}
                  onChange={(e) => handleChange('address_line1', e.target.value)}
                  placeholder="Street address, P.O. box, company name"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  required
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Address Line 2
                </label>
                <input
                  type="text"
                  value={formData.address_line2}
                  onChange={(e) => handleChange('address_line2', e.target.value)}
                  placeholder="Apartment, suite, unit, building, floor, etc."
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  City <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.city}
                  onChange={(e) => handleChange('city', e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  State/Province
                </label>
                <input
                  type="text"
                  value={formData.state}
                  onChange={(e) => handleChange('state', e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Country
                </label>
                <select
                  value={formData.country}
                  onChange={(e) => handleChange('country', e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                >
                  <option value="">Select country</option>
                  {countries.map((c) => (
                    <option key={c.name} value={c.name}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Pincode/ZIP
                </label>
                <input
                  type="text"
                  value={formData.pincode}
                  onChange={(e) => handleChange('pincode', e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>
          </div>

          {/* Other Information */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-widest text-blue-600 mb-3 mt-2">Other Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is_black_list"
                  checked={formData.is_black_list}
                  onChange={(e) => handleChange('is_black_list', e.target.checked)}
                  className="rounded border-slate-300 text-primary focus:ring-primary"
                />
                <label htmlFor="is_black_list" className="text-sm font-medium text-slate-700">
                  Is Black List?
                </label>
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Any Other Information / Remarks
                </label>
                <textarea
                  value={formData.remarks}
                  onChange={(e) => handleChange('remarks', e.target.value)}
                  rows={2}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>
          </div>

          {/* Next of Kin and relatives (Patient Relation) — before Documents */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-widest text-blue-600 mb-3 mt-2">Next of Kin and relatives</h3>
            <div className="space-y-3">
              {relations.map((row, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end rounded border border-slate-200 p-3 bg-slate-50/50"
                >
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-slate-600 mb-0.5">Relation</label>
                    <select
                      value={row.relation || ''}
                      onChange={(e) => updateRelationRow(idx, 'relation', e.target.value)}
                      className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm bg-white"
                    >
                      <option value="">Select</option>
                      {PATIENT_RELATION_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  </div>
                  <div className="md:col-span-3">
                    <label className="block text-xs font-medium text-slate-600 mb-0.5">Mobile no</label>
                    <input
                      type="text"
                      value={row.mobile_no || ''}
                      onChange={(e) => updateRelationRow(idx, 'mobile_no', e.target.value)}
                      placeholder="Mobile no"
                      className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                    />
                  </div>
                  <div className="md:col-span-3">
                    <label className="block text-xs font-medium text-slate-600 mb-0.5">Email</label>
                    <input
                      type="email"
                      value={row.email || ''}
                      onChange={(e) => updateRelationRow(idx, 'email', e.target.value)}
                      placeholder="Email"
                      className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                    />
                  </div>
                  <div className="md:col-span-3 flex gap-2 items-end">
                    <button
                      type="button"
                      onClick={() => removeRelationRow(idx)}
                      className="p-1.5 rounded border border-slate-300 text-slate-600 hover:bg-slate-100 text-sm"
                      title="Remove"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={addRelationRow}
                className="text-sm text-primary font-medium hover:underline"
              >
                + Add Next of Kin / relative
              </button>
            </div>
          </div>

          {/* Patient Documents */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-widest text-blue-600 mb-3 mt-2">Patient Documents</h3>
            <div className="space-y-3">
              {documents.map((row, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end rounded border border-slate-200 p-3 bg-slate-50/50"
                >
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-slate-600 mb-0.5">File name</label>
                    <input
                      value={row.file_name}
                      onChange={(e) => updateDocumentRow(idx, 'file_name', e.target.value)}
                      placeholder="File name"
                      className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-slate-600 mb-0.5">Document type</label>
                    <select
                      value={row.document_type || ''}
                      onChange={(e) => updateDocumentRow(idx, 'document_type', e.target.value)}
                      className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm bg-white"
                    >
                      <option value="">Select type</option>
                      {documentTypes.map((dt) => (
                        <option key={dt.name} value={dt.name}>{dt.document_name || dt.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-slate-600 mb-0.5">Transaction no</label>
                    <input
                      value={row.transaction_no || ''}
                      onChange={(e) => updateDocumentRow(idx, 'transaction_no', e.target.value)}
                      placeholder="Transaction no"
                      className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-slate-600 mb-0.5">Upload remarks</label>
                    <input
                      value={row.upload_remarks || ''}
                      onChange={(e) => updateDocumentRow(idx, 'upload_remarks', e.target.value)}
                      placeholder="Remarks"
                      className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                    />
                  </div>
                  <div className="md:col-span-3 flex gap-2 items-end">
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-slate-600 mb-0.5">Attachment</label>
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
                        <span className="text-xs text-slate-500">Uploading...</span>
                      )}
                      {row.document && documentUploading !== idx && (
                        <span className="text-xs text-green-600 block truncate" title={row.document}>
                          ✓ Attached
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeDocumentRow(idx)}
                      className="p-1.5 rounded border border-slate-300 text-slate-600 hover:bg-slate-100 text-sm"
                      title="Remove row"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={addDocumentRow}
                className="text-sm text-primary font-medium hover:underline"
              >
                + Add document
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create Patient'}
            </button>
          </div>
        </form>
      </div>
      {showCreateSource && (
        <CreateLeadSourceModal
          onClose={() => setShowCreateSource(false)}
          onSuccess={(created) => {
            const option: LinkFieldOption = {
              name: created.name,
              label: created.source_name,
            }
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
            const option: LinkFieldOption = {
              name: created.name,
              label: created.nationality,
              country: created.country,
            }
            setNationalityOptions((prev) => [option, ...prev])
            setSelectedNationality(option)
            setFormData((prev) => ({ ...prev, nationality: created.name }))
            setNationalityQuery('')
            setNationalityOpen(false)
            setShowCreateNationality(false)
          }}
        />
      )}
    </div>
  )
}
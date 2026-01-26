import { useState, useEffect } from 'react'
import { createPatient } from '../../services/patients'
import { fetchLeadSources, fetchNationalities, type LinkFieldOption } from '../../services/common'
import { CreateLeadSourceModal } from './CreateLeadSourceModal'
import { CreateNationalityModal } from './CreateNationalityModal'

interface CreatePatientModalProps {
  onClose: () => void
  onSuccess?: (patientName: string) => void
}

export const CreatePatientModal = ({ onClose, onSuccess }: CreatePatientModalProps) => {
  const [formData, setFormData] = useState({
    first_name: '',
    middle_name: '',
    last_name: '',
    sex: '',
    dob: '',
    blood_group: '',
    mobile: '',
    phone: '',
    email: '',
    id_number: '',
    nationality: '',
    category: '',
    source: '',
    marital_status: ''
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.first_name || !formData.sex || !formData.source || !formData.marital_status) {
      setError('First Name, Gender, Source, and Marital Status are required')
      return
    }

    try {
      setLoading(true)
      setError(null)

      const patient = await createPatient(formData)
      
      if (onSuccess) {
        onSuccess(patient.name || patient.patient_name)
      }
      
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create patient')
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  // Load initial options (source + nationalities)
  useEffect(() => {
    const loadOptions = async () => {
      try {
        const [sources, nationalities] = await Promise.all([
          fetchLeadSources(),
          fetchNationalities(),
        ])
        setSourceOptions(sources)
        setNationalityOptions(nationalities)
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
            if (target.tagName !== 'INPUT' && !target.closest('.absolute')) {
              setSourceOpen(false)
              setNationalityOpen(false)
            }
          }}
        >
          {/* Basic Information */}
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Basic Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Contact Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Mobile
                </label>
                <input
                  type="tel"
                  value={formData.mobile}
                  onChange={(e) => handleChange('mobile', e.target.value)}
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
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Identification</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  ID Number
                </label>
                <input
                  type="text"
                  value={formData.id_number}
                  onChange={(e) => handleChange('id_number', e.target.value)}
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
                  Category
                </label>
                <select
                  value={formData.category}
                  onChange={(e) => handleChange('category', e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">Select Category</option>
                  <option value="Royal">Royal</option>
                  <option value="American Navy">American Navy</option>
                  <option value="Regular">Regular</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Source <span className="text-red-500">*</span>
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


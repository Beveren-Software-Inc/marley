import { useState, useEffect } from 'react'
import {
  fetchPatientDoc,
  fetchAddressDoc,
  updatePatientDoc,
  updateAddressDoc,
  type UpdatePatientData
} from '../../services/patients'
import { fetchLeadSources, fetchNationalities, fetchCountries, type LinkFieldOption } from '../../services/common'
import { CreateLeadSourceModal } from './CreateLeadSourceModal'
import { CreateNationalityModal } from './CreateNationalityModal'
import { toast } from '../../hooks/useToast'
import { X } from 'lucide-react'

interface EditPatientModalProps {
  patientName: string
  onClose: () => void
  onSuccess?: () => void
}

const emptyForm = {
  first_name: '',
  file_no: '',
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
  marital_status: '',
  is_black_list: false,
  remarks: '',
  address_line1: '',
  address_line2: '',
  city: '',
  state: '',
  country: '',
  pincode: ''
}

export const EditPatientModal = ({ patientName, onClose, onSuccess }: EditPatientModalProps) => {
  const [formData, setFormData] = useState(emptyForm)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [primaryAddressName, setPrimaryAddressName] = useState<string | null>(null)

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
  const [countries, setCountries] = useState<{ name: string }[]>([])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const [patient, sources, nationalities, countryList] = await Promise.all([
          fetchPatientDoc(patientName),
          fetchLeadSources(),
          fetchNationalities(),
          fetchCountries()
        ])
        setSourceOptions(sources)
        setNationalityOptions(nationalities)
        setCountries(countryList)

        setFormData({
          first_name: patient.first_name ?? '',
          file_no: patient.file_no ?? '',
          middle_name: patient.middle_name ?? '',
          last_name: patient.last_name ?? '',
          sex: patient.sex ?? '',
          dob: patient.dob ? String(patient.dob).slice(0, 10) : '',
          blood_group: patient.blood_group ?? '',
          mobile: patient.mobile ?? '',
          phone: patient.phone ?? '',
          email: patient.email ?? '',
          id_number: patient.id_number ?? '',
          nationality: patient.nationality ?? '',
          category: patient.category ?? '',
          source: patient.source ?? '',
          marital_status: patient.marital_status ?? '',
          is_black_list: !!(patient.is_black_list && patient.is_black_list !== 0),
          remarks: patient.remarks ?? '',
          address_line1: '',
          address_line2: '',
          city: '',
          state: '',
          country: '',
          pincode: ''
        })
        const src = sources.find((s) => s.name === patient.source)
        if (src) setSelectedSource(src)
        const nat = nationalities.find((n) => n.name === patient.nationality)
        if (nat) setSelectedNationality(nat)

        if (patient.patient_primary_address) {
          setPrimaryAddressName(patient.patient_primary_address)
          const addr = await fetchAddressDoc(patient.patient_primary_address)
          if (addr) {
            setFormData((prev) => ({
              ...prev,
              address_line1: addr.address_line1 ?? '',
              address_line2: addr.address_line2 ?? '',
              city: addr.city ?? '',
              state: addr.state ?? '',
              country: addr.country ?? '',
              pincode: addr.pincode ?? ''
            }))
          }
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
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
    if (!formData.source || !formData.category) {
      setError('Patient Referral/Source and Patient type are required')
      return
    }
    try {
      setSubmitting(true)
      const patientPayload: UpdatePatientData = {
        first_name: formData.first_name,
        middle_name: formData.middle_name || undefined,
        last_name: formData.last_name || undefined,
        sex: formData.sex,
        dob: formData.dob || undefined,
        blood_group: formData.blood_group || undefined,
        mobile: formData.mobile || undefined,
        phone: formData.phone || undefined,
        email: formData.email || undefined,
        id_number: formData.id_number || undefined,
        nationality: formData.nationality || undefined,
        category: formData.category,
        source: formData.source,
        marital_status: formData.marital_status || undefined,
        is_black_list: formData.is_black_list ? 1 : 0,
        remarks: formData.remarks || undefined
      }
      const result = await updatePatientDoc(patientName, patientPayload)
      if (primaryAddressName) {
        await updateAddressDoc(primaryAddressName, {
          address_line1: formData.address_line1,
          address_line2: formData.address_line2 || undefined,
          city: formData.city,
          state: formData.state || undefined,
          country: formData.country || undefined,
          pincode: formData.pincode || undefined
        })
      }
      toast.success(result?.message?.trim() || 'Patient updated')
      onSuccess?.()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update patient')
      toast.error(err instanceof Error ? err.message : 'Failed to update patient')
    } finally {
      setSubmitting(false)
    }
  }

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

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8 text-slate-600">Loading patient…</div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-slate-900">Edit Patient</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form
          onSubmit={handleSubmit}
          className="p-6 space-y-4"
          onClick={(e) => {
            const target = e.target as HTMLElement
            if (target.tagName !== 'INPUT' && target.tagName !== 'SELECT' && !target.closest('.absolute')) {
              setSourceOpen(false)
              setNationalityOpen(false)
            }
          }}
        >
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-800">{error}</div>
          )}

          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Basic Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">First Name <span className="text-red-500">*</span></label>
                <input type="text" value={formData.first_name} onChange={(e) => handleChange('first_name', e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Middle Name</label>
                <input type="text" value={formData.middle_name} onChange={(e) => handleChange('middle_name', e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Last Name</label>
                <input type="text" value={formData.last_name} onChange={(e) => handleChange('last_name', e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Gender <span className="text-red-500">*</span></label>
                <select value={formData.sex} onChange={(e) => handleChange('sex', e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white" required>
                  <option value="">Select Gender</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Date of Birth</label>
                <input type="date" value={formData.dob} onChange={(e) => handleChange('dob', e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Blood Group</label>
                <select value={formData.blood_group} onChange={(e) => handleChange('blood_group', e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white">
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

          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Contact Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Mobile <span className="text-red-500">*</span></label>
                <input type="tel" value={formData.mobile} onChange={(e) => handleChange('mobile', e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
                <input type="tel" value={formData.phone} onChange={(e) => handleChange('phone', e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                <input type="email" value={formData.email} onChange={(e) => handleChange('email', e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Identification</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                <label className="block text-sm font-medium text-slate-700 mb-1">Patient type <span className="text-red-500">*</span></label>
                <select value={formData.category} onChange={(e) => handleChange('category', e.target.value)} required className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white">
                  <option value="">Select Patient type</option>
                  <option value="Royal">Royal</option>
                  <option value="American Navy">American Navy</option>
                  <option value="Regular">Regular</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Patient Referral or Source <span className="text-red-500">*</span></label>
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
                <select value={formData.marital_status} onChange={(e) => handleChange('marital_status', e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white">
                  <option value="">Select Marital Status</option>
                  <option value="Single">Single</option>
                  <option value="Married">Married</option>
                  <option value="Divorced">Divorced</option>
                  <option value="Widow">Widow</option>
                </select>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Address</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">Address Line 1 <span className="text-red-500">*</span></label>
                <input type="text" value={formData.address_line1} onChange={(e) => handleChange('address_line1', e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" required />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">Address Line 2</label>
                <input type="text" value={formData.address_line2} onChange={(e) => handleChange('address_line2', e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">City <span className="text-red-500">*</span></label>
                <input type="text" value={formData.city} onChange={(e) => handleChange('city', e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">State/Province</label>
                <input type="text" value={formData.state} onChange={(e) => handleChange('state', e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Country</label>
                <select value={formData.country} onChange={(e) => handleChange('country', e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white">
                  <option value="">Select country</option>
                  {countries.map((c) => (
                    <option key={c.name} value={c.name}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Pincode/ZIP</label>
                <input type="text" value={formData.pincode} onChange={(e) => handleChange('pincode', e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Other</h3>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="edit_is_black_list" checked={formData.is_black_list} onChange={(e) => handleChange('is_black_list', e.target.checked)} className="rounded border-slate-300 text-primary focus:ring-primary" />
              <label htmlFor="edit_is_black_list" className="text-sm font-medium text-slate-700">Is Black List?</label>
            </div>
            <div className="mt-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Remarks</label>
              <textarea value={formData.remarks} onChange={(e) => handleChange('remarks', e.target.value)} rows={2} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50">
              Cancel
            </button>
            <button type="submit" disabled={submitting} className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50">
              {submitting ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
      {showCreateSource && (
        <CreateLeadSourceModal
          onClose={() => setShowCreateSource(false)}
          onSuccess={(created) => {
            const option: LinkFieldOption = { name: created.name, label: created.source_name }
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
    </div>
  )
}

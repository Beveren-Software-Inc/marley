import { useState } from 'react'
import { apiRequest } from '../../services/apiClient'
import { fetchMedicalDepartments, type LinkFieldOption } from '../../services/common'

interface CreateLabTestTemplateModalProps {
  onClose: () => void
  onSuccess?: (created: { name: string; lab_test_name: string; department?: string }) => void
}

export const CreateLabTestTemplateModal = ({ onClose, onSuccess }: CreateLabTestTemplateModalProps) => {
  const [name, setName] = useState('')
  const [departmentOptions, setDepartmentOptions] = useState<LinkFieldOption[]>([])
  const [departmentOpen, setDepartmentOpen] = useState(false)
  const [departmentQuery, setDepartmentQuery] = useState('')
  const [selectedDepartment, setSelectedDepartment] = useState<LinkFieldOption | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load and search departments
  const loadDepartments = async (search?: string) => {
    try {
      const depts = await fetchMedicalDepartments(search)
      setDepartmentOptions(depts)
    } catch (err) {
      console.error('Failed to load departments:', err)
      setDepartmentOptions([])
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!name.trim()) {
      setError('Lab Test Template name is required')
      return
    }

    try {
      setLoading(true)
      setError(null)

      const created = await apiRequest<{
        name: string
        lab_test_name: string
        department?: string
      }>('/api/resource/Lab%20Test%20Template', {
        method: 'POST',
        body: JSON.stringify({
          lab_test_name: name.trim(),
          department: selectedDepartment?.name,
        }),
      })

      if (onSuccess) {
        onSuccess(created)
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create lab test template')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-slate-200">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-slate-900">Create Lab Test Template</h2>
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
            const target = e.target as HTMLElement
            if (target.tagName !== 'INPUT' && !target.closest('.absolute')) {
              setDepartmentOpen(false)
            }
          }}
        >
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Template Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="e.g. CBC, LFT, KFT"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Department
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={selectedDepartment ? selectedDepartment.label : departmentQuery}
                  onChange={(e) => {
                    const value = e.target.value
                    setDepartmentQuery(value)
                    setDepartmentOpen(true)
                    loadDepartments(value || undefined)
                  }}
                  onFocus={() => {
                    setDepartmentOpen(true)
                    loadDepartments()
                  }}
                  placeholder="Search department..."
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
                {departmentOpen && departmentOptions.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
                    {departmentOptions.map((dept) => (
                      <button
                        key={dept.name}
                        type="button"
                        onClick={() => {
                          setSelectedDepartment(dept)
                          setDepartmentQuery(dept.label)
                          setDepartmentOpen(false)
                        }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 focus:bg-slate-100 focus:outline-none"
                      >
                        {dept.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
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
              {loading ? 'Creating...' : 'Create Template'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}


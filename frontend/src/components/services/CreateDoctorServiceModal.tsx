import { useState, useEffect } from 'react'
import { toast } from '../../hooks/useToast'
import { X } from 'lucide-react'
import { fetchItems, type LinkFieldOption } from '../../services/common'

interface CreateDoctorServiceModalProps {
  onClose: () => void
  onSuccess?: () => void
  patient?: string
}

export const CreateDoctorServiceModal = ({ onClose, onSuccess, patient }: CreateDoctorServiceModalProps) => {
  const [formData, setFormData] = useState({
    code: '',
    service_name: '',
    amount: '',
    additional_amount: '',
    discount: '',
    net_amount: ''
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Item dropdown state
  const [itemOptions, setItemOptions] = useState<LinkFieldOption[]>([])
  const [itemOpen, setItemOpen] = useState(false)
  const [itemQuery, setItemQuery] = useState('')
  const [selectedItem, setSelectedItem] = useState<LinkFieldOption | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.code) {
      setError('Code is required')
      return
    }

    if (!formData.service_name) {
      setError('Service Name is required')
      return
    }

    if (!formData.amount) {
      setError('Amount is required')
      return
    }

    try {
      setLoading(true)
      setError(null)

      // Calculate net amount if not provided
      const amount = parseFloat(formData.amount) || 0
      const additionalAmount = parseFloat(formData.additional_amount) || 0
      const discount = parseFloat(formData.discount) || 0
      const netAmount = formData.net_amount 
        ? parseFloat(formData.net_amount) 
        : (amount + additionalAmount - discount)

      // TODO: Wire this to actual backend API when available
      // For now, just show success message
      await new Promise(resolve => setTimeout(resolve, 500))
      
      toast.success('Doctor service detail added successfully')
      
      if (onSuccess) {
        onSuccess()
      }
      
      onClose()
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to add service detail'
      setError(errorMessage)
      toast.error(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (field: string, value: string) => {
    setFormData(prev => {
      const updated = { ...prev, [field]: value }
      
      // Auto-calculate net amount when amount, additional_amount, or discount changes
      if (field === 'amount' || field === 'additional_amount' || field === 'discount') {
        const amount = parseFloat(updated.amount) || 0
        const additionalAmount = parseFloat(updated.additional_amount) || 0
        const discount = parseFloat(updated.discount) || 0
        updated.net_amount = (amount + additionalAmount - discount).toFixed(2)
      }
      
      return updated
    })
  }

  // Load initial item options
  useEffect(() => {
    const loadOptions = async () => {
      try {
        const items = await fetchItems()
        setItemOptions(items)
      } catch (err) {
        console.error('Failed to load items:', err)
      }
    }
    loadOptions()
  }, [])

  // Search items
  useEffect(() => {
    if (!itemOpen) return

    const search = async () => {
      try {
        const results = await fetchItems(itemQuery)
        setItemOptions(results)
      } catch (err) {
        console.error('Failed to search items:', err)
        setItemOptions([])
      }
    }

    const timeoutId = setTimeout(() => {
      search()
    }, itemQuery.trim() === '' ? 0 : 300)

    return () => clearTimeout(timeoutId)
  }, [itemQuery, itemOpen])

  const handleItemSelect = (item: LinkFieldOption) => {
    setSelectedItem(item)
    setFormData(prev => ({ ...prev, service_name: item.name }))
    setItemQuery(item.label)
    setItemOpen(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-slate-900">Add Doctor Service Detail</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4" onClick={(e) => {
          // Close dropdown when clicking outside input
          const target = e.target as HTMLElement
          if (target.tagName !== 'INPUT' && !target.closest('.absolute')) {
            setItemOpen(false)
          }
        }}>
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Code <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.code}
                onChange={(e) => handleChange('code', e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                required
              />
            </div>

            <div className="md:col-span-1">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Service Name <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={itemQuery}
                  onChange={(e) => {
                    setItemQuery(e.target.value)
                    setItemOpen(true)
                  }}
                  onFocus={() => setItemOpen(true)}
                  placeholder="Search item..."
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  required
                />
                {itemOpen && itemOptions.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
                    {itemOptions.map((item) => (
                      <button
                        key={item.name}
                        type="button"
                        onClick={() => handleItemSelect(item)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 focus:bg-slate-100 focus:outline-none"
                      >
                        <div className="font-medium">{item.label}</div>
                        {item.item_code && item.item_code !== item.label && (
                          <div className="text-xs text-slate-500">Code: {item.item_code}</div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Amount <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.amount}
                onChange={(e) => handleChange('amount', e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Additional Amount
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.additional_amount}
                onChange={(e) => handleChange('additional_amount', e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Discount
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.discount}
                onChange={(e) => handleChange('discount', e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Net Amount
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.net_amount}
                onChange={(e) => handleChange('net_amount', e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-slate-50"
                readOnly
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
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
              {loading ? 'Adding...' : 'Add Service'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}


// tabs/MaterialRequestTab.tsx
import { useState, useEffect } from 'react'
import { useCareContext } from '../../providers/CareContextProvider'
import { createMaterialRequest, fetchMaterialRequests, fetchInventoryItems, type MaterialRequest, type MaterialRequestItem } from '../../services/nursingInventory'
import { toast } from '../../hooks/useToast'
import { Plus, Trash2, Send, Eye, CheckCircle, XCircle, Package } from 'lucide-react'

interface MaterialRequestTabProps {
  onSuccess: () => void
  refreshKey?: number
  costCenter?: string
  isFullAccess?: boolean
}

export const MaterialRequestTab = ({ onSuccess, refreshKey: _refreshKey, costCenter: _costCenter, isFullAccess: _isFullAccess }: MaterialRequestTabProps) => {
  const { userCostCenter, user } = useCareContext()
  const effectiveCostCenter = _costCenter || userCostCenter
  const [requests, setRequests] = useState<MaterialRequest[]>([])
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [selectedRequest, setSelectedRequest] = useState<MaterialRequest | null>(null)
  
  // Form state
  const [items, setItems] = useState<MaterialRequestItem[]>([{ item_code: '', item_name: '', quantity: 1, uom: '', notes: '' }])
  const [notes, setNotes] = useState('')
  const [itemSearch, setItemSearch] = useState<{ [key: number]: string }>({})
  const [itemOptions, setItemOptions] = useState<{ [key: number]: any[] }>({})

  useEffect(() => {
    if (effectiveCostCenter) {
      loadRequests()
    }
  }, [effectiveCostCenter, _refreshKey])

  const loadRequests = async () => {
    if (!effectiveCostCenter) return
    setLoading(true)
    try {
      const data = await fetchMaterialRequests(effectiveCostCenter)
      setRequests(data)
    } catch (error) {
      console.error('Failed to load requests:', error)
    } finally {
      setLoading(false)
    }
  }

  const searchItems = async (index: number, search: string) => {
    if (!search.trim()) {
      setItemOptions(prev => ({ ...prev, [index]: [] }))
      return
    }
    const results = await fetchInventoryItems(search)
    setItemOptions(prev => ({ ...prev, [index]: results }))
  }

  const selectItem = (index: number, item: any) => {
    const updatedItems = [...items]
    updatedItems[index] = {
      ...updatedItems[index],
      item_code: item.code,
      item_name: item.name,
      uom: item.uom,
      quantity: 1
    }
    setItems(updatedItems)
    setItemSearch(prev => ({ ...prev, [index]: '' }))
    setItemOptions(prev => ({ ...prev, [index]: [] }))
  }

  const addItem = () => {
    setItems([...items, { item_code: '', item_name: '', quantity: 1, uom: '', notes: '' }])
  }

  const removeItem = (index: number) => {
    if (items.length === 1) {
      toast.error('At least one item is required')
      return
    }
    setItems(items.filter((_, i) => i !== index))
  }

  const updateItem = (index: number, field: keyof MaterialRequestItem, value: any) => {
    const updatedItems = [...items]
    updatedItems[index] = { ...updatedItems[index], [field]: value }
    setItems(updatedItems)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!effectiveCostCenter) {
      toast.error('No cost center assigned')
      return
    }

    const validItems = items.filter(item => item.item_code && item.quantity > 0)
    if (validItems.length === 0) {
      toast.error('Please add at least one valid item')
      return
    }

    setSubmitting(true)
    try {
      await createMaterialRequest({
        cost_center: effectiveCostCenter,
        request_date: new Date().toISOString().split('T')[0],
        status: 'Submitted',
        items: validItems,
        requested_by: user?.name || '',
        notes: notes || undefined
      })
      toast.success('Material request created successfully')
      setShowForm(false)
      resetForm()
      loadRequests()
      onSuccess()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create request')
    } finally {
      setSubmitting(false)
    }
  }

  const resetForm = () => {
    setItems([{ item_code: '', item_name: '', quantity: 1, uom: '', notes: '' }])
    setNotes('')
    setItemSearch({})
    setItemOptions({})
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Submitted': return 'bg-blue-100 text-blue-800'
      case 'Approved': return 'bg-green-100 text-green-800'
      case 'Rejected': return 'bg-red-100 text-red-800'
      case 'Issued': return 'bg-purple-100 text-purple-800'
      default: return 'bg-slate-100 text-slate-800'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'Approved': return <CheckCircle className="w-4 h-4" />
      case 'Rejected': return <XCircle className="w-4 h-4" />
      default: return <Package className="w-4 h-4" />
    }
  }

  return (
    <div className="space-y-6">
      {/* Header Actions */}
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold text-slate-900">Material Requests</h2>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90 transition text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            New Request
          </button>
        )}
      </div>

      {/* Create Request Form */}
      {showForm && (
        <div className="bg-white rounded-lg border border-slate-200 p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-md font-semibold text-slate-900">Create Material Request</h3>
            <button
              onClick={() => {
                setShowForm(false)
                resetForm()
              }}
              className="text-slate-400 hover:text-slate-600"
            >
              <XCircle className="w-5 h-5" />
            </button>
          </div>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <label className="text-sm font-medium text-slate-700">Items</label>
                <button
                  type="button"
                  onClick={addItem}
                  className="text-sm text-primary hover:text-primary/80 inline-flex items-center gap-1"
                >
                  <Plus className="w-4 h-4" />
                  Add Item
                </button>
              </div>
              
              {items.map((item, idx) => (
                <div key={idx} className="flex gap-3 items-start p-3 bg-slate-50 rounded-lg">
                  <div className="flex-1">
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Search item..."
                        value={itemSearch[idx] || item.item_name}
                        onChange={(e) => {
                          setItemSearch(prev => ({ ...prev, [idx]: e.target.value }))
                          searchItems(idx, e.target.value)
                        }}
                        className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                      {itemOptions[idx] && itemOptions[idx].length > 0 && (
                        <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-md shadow-lg max-h-48 overflow-auto">
                          {itemOptions[idx].map(opt => (
                            <button
                              key={opt.code}
                              type="button"
                              onClick={() => selectItem(idx, opt)}
                              className="block w-full text-left px-3 py-2 text-sm hover:bg-slate-50"
                            >
                              <div className="font-medium">{opt.name}</div>
                              <div className="text-xs text-slate-500">Code: {opt.code} | UOM: {opt.uom}</div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="w-24">
                    <input
                      type="number"
                      min="1"
                      value={item.quantity}
                      onChange={(e) => updateItem(idx, 'quantity', parseInt(e.target.value) || 0)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  
                  <div className="flex-1">
                    <input
                      type="text"
                      placeholder="Notes (optional)"
                      value={item.notes || ''}
                      onChange={(e) => updateItem(idx, 'notes', e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  
                  <button
                    type="button"
                    onClick={() => removeItem(idx)}
                    className="p-2 text-red-500 hover:text-red-700"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">General Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="Any additional information..."
              />
            </div>
            
            <div className="flex justify-end gap-3 pt-4">
              <button
                type="button"
                onClick={() => {
                  setShowForm(false)
                  resetForm()
                }}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
                {submitting ? 'Submitting...' : 'Submit Request'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Requests List */}
      {!showForm && (
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          {loading ? (
            <div className="p-8 text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : requests.length === 0 ? (
            <div className="p-8 text-center">
              <Package className="w-12 h-12 text-slate-400 mx-auto mb-3" />
              <p className="text-slate-500">No material requests found</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {requests.map((request) => (
                <div key={request.name} className="p-4 hover:bg-slate-50 transition">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-900">{request.name}</span>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(request.status)}`}>
                          {getStatusIcon(request.status)}
                          {request.status}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        Requested on: {request.request_date} | Items: {request.items.length}
                      </div>
                    </div>
                    <button
                      onClick={() => setSelectedRequest(request)}
                      className="text-primary hover:text-primary/80 text-sm inline-flex items-center gap-1"
                    >
                      <Eye className="w-4 h-4" />
                      View Details
                    </button>
                  </div>
                  
                  {request.items.length > 0 && (
                    <div className="mt-2 text-sm text-slate-600">
                      {request.items.slice(0, 2).map((item, idx) => (
                        <div key={idx} className="flex justify-between text-xs">
                          <span>{item.item_name}</span>
                          <span>Qty: {item.quantity} {item.uom}</span>
                        </div>
                      ))}
                      {request.items.length > 2 && (
                        <div className="text-xs text-slate-400 mt-1">+{request.items.length - 2} more items</div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* View Request Modal */}
      {selectedRequest && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-slate-900">Request Details</h3>
              <button onClick={() => setSelectedRequest(null)} className="text-slate-400 hover:text-slate-600">
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-slate-500">Request ID</label>
                    <p className="text-sm font-medium">{selectedRequest.name}</p>
                  </div>
                  <div>
                    <label className="text-xs text-slate-500">Status</label>
                    <p className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(selectedRequest.status)}`}>
                      {getStatusIcon(selectedRequest.status)}
                      {selectedRequest.status}
                    </p>
                  </div>
                  <div>
                    <label className="text-xs text-slate-500">Request Date</label>
                    <p className="text-sm">{selectedRequest.request_date}</p>
                  </div>
                  <div>
                    <label className="text-xs text-slate-500">Requested By</label>
                    <p className="text-sm">{selectedRequest.requested_by}</p>
                  </div>
                </div>
                
                <div>
                  <label className="text-xs text-slate-500 mb-2 block">Items</label>
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-3 py-2 text-left">Item</th>
                          <th className="px-3 py-2 text-right">Quantity</th>
                          <th className="px-3 py-2 text-left">UOM</th>
                          <th className="px-3 py-2 text-left">Notes</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {selectedRequest.items.map((item, idx) => (
                          <tr key={idx}>
                            <td className="px-3 py-2">{item.item_name}</td>
                            <td className="px-3 py-2 text-right">{item.quantity}</td>
                            <td className="px-3 py-2">{item.uom}</td>
                            <td className="px-3 py-2 text-slate-500">{item.notes || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                
                {selectedRequest.notes && (
                  <div>
                    <label className="text-xs text-slate-500">Notes</label>
                    <p className="text-sm mt-1">{selectedRequest.notes}</p>
                  </div>
                )}
                
                {selectedRequest.approved_by && (
                  <div>
                    <label className="text-xs text-slate-500">Approved By</label>
                    <p className="text-sm">{selectedRequest.approved_by}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
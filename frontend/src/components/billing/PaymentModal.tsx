// components/billing/PaymentModal.tsx
import { useState, useEffect } from 'react'
import { X, CreditCard, AlertCircle, Loader2, Building2, MapPin, Briefcase } from 'lucide-react'
import { toast } from '../../hooks/useToast'
import { createPaymentEntry } from '../../services/serviceOrders'
import { fetchCompanies, fetchCostCenters,fetchDepartments, type LinkFieldOption } from '../../services/common'

interface PaymentModalProps {
  isOpen: boolean
  onClose: () => void
  invoiceName: string
  customerName: string
  outstandingAmount: number
  defaultCompany?: string
  defaultCostCenter?: string
  defaultDepartment?: string
  onPaymentSuccess: () => void
}

interface Company {
  name: string
  company_name: string
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(amount)
}

export const PaymentModal = ({ 
  isOpen, 
  onClose, 
  invoiceName, 
  customerName, 
  outstandingAmount,
  defaultCompany,
  defaultCostCenter,
  defaultDepartment,
  onPaymentSuccess 
}: PaymentModalProps) => {
  const [paymentAmount, setPaymentAmount] = useState(outstandingAmount)
  const [paymentMode, setPaymentMode] = useState('Cash')
  const [costCenter, setCostCenter] = useState(defaultCostCenter || '')
  const [company, setCompany] = useState(defaultCompany || '')
  const [department, setDepartment] = useState(defaultDepartment || '')
  const [referenceNumber, setReferenceNumber] = useState('')
  const [loading, setLoading] = useState(false)
  
  // Company state
  const [companies, setCompanies] = useState<Company[]>([])
  const [isSingleCompany, setIsSingleCompany] = useState(false)
  const [companyOpen, setCompanyOpen] = useState(false)
  const [companyQuery, setCompanyQuery] = useState('')
  
  // Cost center state
  const [costCenters, setCostCenters] = useState<LinkFieldOption[]>([])
  const [costCenterOpen, setCostCenterOpen] = useState(false)
  const [costCenterQuery, setCostCenterQuery] = useState('')
  
  // Department state - no company filter needed
  const [departments, setDepartments] = useState<LinkFieldOption[]>([])
  const [departmentOpen, setDepartmentOpen] = useState(false)
  const [departmentQuery, setDepartmentQuery] = useState('')

  // Load companies on mount
  useEffect(() => {
    if (!isOpen) return
    
    const loadCompanies = async () => {
      try {
        const list = await fetchCompanies()
        const mapped: Company[] = list.map(c => ({ name: c.name, company_name: c.label }))
        setCompanies(mapped)

        if (mapped.length === 1) {
          setIsSingleCompany(true)
          if (!defaultCompany) {
            setCompany(mapped[0].name)
            setCompanyQuery(mapped[0].company_name)
          }
        } else if (defaultCompany) {
          const defaultComp = mapped.find(c => c.name === defaultCompany)
          if (defaultComp) {
            setCompanyQuery(defaultComp.company_name)
          }
        }
      } catch (err) {
        console.error('Failed to load companies:', err)
      }
    }
    loadCompanies()
  }, [isOpen, defaultCompany])

  // Load cost centers filtered by selected company
  const loadCostCenters = async (companyName?: string, query?: string) => {
    try {
      const list = await fetchCostCenters(companyName, query)
      setCostCenters(list)
    } catch (err) {
      console.error('Failed to load cost centers:', err)
    }
  }

  // Load departments - no company filter needed
  const loadDepartments = async (query?: string) => {
    try {
      const list = await fetchDepartments(query)
      setDepartments(list)
    } catch (err) {
      console.error('Failed to load departments:', err)
    }
  }

  // Re-fetch cost centers when company changes or search query changes
  useEffect(() => {
    if (!isOpen) return
    if (!company && !isSingleCompany) return
    
    const timeoutId = setTimeout(() => {
      loadCostCenters(company || undefined, costCenterQuery || undefined)
    }, 300)
    return () => clearTimeout(timeoutId)
  }, [company, costCenterQuery, costCenterOpen, isOpen])

  // Re-fetch departments when search query changes - no company dependency
  useEffect(() => {
    if (!isOpen) return
    
    const timeoutId = setTimeout(() => {
      loadDepartments(departmentQuery || undefined)
    }, 300)
    return () => clearTimeout(timeoutId)
  }, [departmentQuery, departmentOpen, isOpen])

  // Set initial department if provided
  useEffect(() => {
    if (defaultDepartment && !department) {
      setDepartment(defaultDepartment)
      setDepartmentQuery(defaultDepartment)
    }
  }, [defaultDepartment, department])

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (paymentAmount <= 0) {
      toast.error('Please enter a valid payment amount')
      return
    }
    
    if (paymentAmount > outstandingAmount) {
      toast.error(`Payment amount cannot exceed outstanding amount of ${formatCurrency(outstandingAmount)}`)
      return
    }

    if (!company && !isSingleCompany) {
      toast.error('Please select a company')
      return
    }

    if (!costCenter) {
      toast.error('Please select a cost center')
      return
    }

    if (!department) {
      toast.error('Please select a department')
      return
    }

    try {
      setLoading(true)
      const result = await createPaymentEntry(
        invoiceName,
        paymentAmount,
        paymentMode,
        costCenter,
        department,
        referenceNumber
      )
      
      if (result.success) {
        toast.success(result.message)
        onPaymentSuccess()
        onClose()
        // Reset form
        setPaymentAmount(outstandingAmount)
        setPaymentMode('Cash')
        setCostCenter('')
        if (!isSingleCompany && !defaultCompany) {
          setCompany('')
          setCompanyQuery('')
        }
        setDepartment('')
        setDepartmentQuery('')
        setCostCenterQuery('')
        setReferenceNumber('')
      } else {
        toast.error(result.message || 'Failed to process payment')
      }
    } catch (error) {
      console.error('Error processing payment:', error)
      toast.error('Failed to process payment')
    } finally {
      setLoading(false)
    }
  }

  const paymentModes = ['Cash', 'Bank Transfer', 'M-Pesa', 'Cheque', 'Card']

  const closeAllDropdowns = () => {
    setCompanyOpen(false)
    setCostCenterOpen(false)
    setDepartmentOpen(false)
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="fixed inset-0 bg-black bg-opacity-50 transition-opacity" onClick={onClose} />
        
        <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full transform transition-all max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="sticky top-0 bg-white z-10 flex items-center justify-between p-6 border-b border-slate-200">
            <div className="flex items-center gap-3">
              <CreditCard className="w-6 h-6 text-primary" />
              <div>
                <h2 className="text-xl font-semibold text-slate-900">Record Payment</h2>
                <p className="text-sm text-slate-500 mt-1">Invoice: {invoiceName}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-slate-500" />
            </button>
          </div>

          {/* Content */}
          <form onSubmit={handleSubmit} className="p-6 space-y-4" onClick={(e) => {
            const target = e.target as HTMLElement
            if (target.tagName !== 'INPUT' && !target.closest('.absolute')) {
              closeAllDropdowns()
            }
          }}>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Customer
              </label>
              <input
                type="text"
                value={customerName}
                disabled
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-slate-50 text-slate-600"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Outstanding Amount
              </label>
              <input
                type="text"
                value={formatCurrency(outstandingAmount)}
                disabled
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-slate-50 text-slate-600"
              />
            </div>

            {/* Company Selection - only shown when multiple companies exist */}
            {!isSingleCompany && (
              <div className="relative">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Company <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={company ? (companies.find(c => c.name === company)?.company_name ?? company) : companyQuery}
                    onChange={(e) => {
                      setCompany('')
                      setCompanyQuery(e.target.value)
                      setCompanyOpen(true)
                      setCostCenter('')
                      setCostCenterQuery('')
                    }}
                    onFocus={() => setCompanyOpen(true)}
                    placeholder="Select Company..."
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 pl-9 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    required
                  />
                  <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  {companyOpen && (
                    <div className="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg max-h-48 overflow-auto">
                      {companies.filter(c =>
                        !companyQuery || c.company_name.toLowerCase().includes(companyQuery.toLowerCase())
                      ).length > 0 ? (
                        companies
                          .filter(c => !companyQuery || c.company_name.toLowerCase().includes(companyQuery.toLowerCase()))
                          .map((comp) => (
                            <button
                              key={comp.name}
                              type="button"
                              className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50"
                              onClick={() => {
                                setCompany(comp.name)
                                setCompanyQuery(comp.company_name)
                                setCompanyOpen(false)
                                setCostCenter('')
                                setCostCenterQuery('')
                              }}
                            >
                              {comp.company_name}
                            </button>
                          ))
                      ) : (
                        <div className="px-3 py-2 text-xs text-slate-500">No companies found</div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Cost Center Selection */}
            <div className="relative">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Cost Center <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={costCenter ? (costCenters.find(c => c.name === costCenter)?.label ?? costCenter) : costCenterQuery}
                  onChange={(e) => {
                    setCostCenter('')
                    setCostCenterQuery(e.target.value)
                    setCostCenterOpen(true)
                  }}
                  onFocus={() => setCostCenterOpen(true)}
                  placeholder={!company && !isSingleCompany ? 'Select a company first...' : 'Search Cost Center...'}
                  disabled={!company && !isSingleCompany}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 pl-9 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed"
                  required
                />
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                {costCenterOpen && (company || isSingleCompany) && (
                  <div className="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg max-h-48 overflow-auto">
                    {costCenters.length > 0 ? (
                      costCenters.map((cc) => (
                        <button
                          key={cc.name}
                          type="button"
                          className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50"
                          onClick={() => {
                            setCostCenter(cc.name)
                            setCostCenterQuery(cc.label)
                            setCostCenterOpen(false)
                          }}
                        >
                          {cc.label}
                        </button>
                      ))
                    ) : (
                      <div className="px-3 py-2 text-xs text-slate-500">No cost centers found</div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Department Selection - No company dependency */}
            <div className="relative">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Department <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={department ? (departments.find(d => d.name === department)?.label ?? department) : departmentQuery}
                  onChange={(e) => {
                    setDepartment('')
                    setDepartmentQuery(e.target.value)
                    setDepartmentOpen(true)
                  }}
                  onFocus={() => setDepartmentOpen(true)}
                  placeholder="Search Department..."
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 pl-9 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  required
                />
                <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                {departmentOpen && (
                  <div className="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg max-h-48 overflow-auto">
                    {departments.length > 0 ? (
                      departments.map((dept) => (
                        <button
                          key={dept.name}
                          type="button"
                          className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50"
                          onClick={() => {
                            setDepartment(dept.name)
                            setDepartmentQuery(dept.label)
                            setDepartmentOpen(false)
                          }}
                        >
                          {dept.label}
                        </button>
                      ))
                    ) : (
                      <div className="px-3 py-2 text-xs text-slate-500">No departments found</div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Payment Amount <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                step="0.01"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(parseFloat(e.target.value))}
                required
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Payment Mode <span className="text-red-500">*</span>
              </label>
              <select
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value)}
                required
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              >
                {paymentModes.map(mode => (
                  <option key={mode} value={mode}>{mode}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Reference Number (Optional)
              </label>
              <input
                type="text"
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
                placeholder="Cheque/Transaction number"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>

            {paymentAmount > outstandingAmount && (
              <div className="flex items-center gap-2 p-3 bg-red-50 rounded-lg text-red-700 text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>Payment amount exceeds outstanding amount</span>
              </div>
            )}

            {/* Footer */}
            <div className="flex gap-3 pt-4 sticky bottom-0 bg-white py-4 border-t border-slate-200 mt-4">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || paymentAmount <= 0 || paymentAmount > outstandingAmount || (!company && !isSingleCompany) || !costCenter || !department}
                className="flex-1 bg-primary text-white py-2 rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  'Record Payment'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
// components/billing/PaymentModal.tsx
import { useState, useEffect } from 'react'
import { CreditCard, AlertCircle, Loader2, Building2, MapPin, Briefcase } from 'lucide-react'
import { toast } from '../../hooks/useToast'
import { createPaymentEntry } from '../../services/serviceOrders'
import { fetchCompanies, fetchCostCenters, fetchDepartments, type LinkFieldOption } from '../../services/common'
import { useFormatMoney, useMoneyInputConfig } from '../../hooks/useFormatMoney'
import {
  CreateModalHeader,
  CREATE_MODAL_BODY_GRADIENT,
  CREATE_MODAL_FOOTER_STICKY,
  CM_BTN_CANCEL,
  CM_BTN_PRIMARY,
} from '../ui/CreateModalChrome'

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

export const PaymentModal = ({
  isOpen,
  onClose,
  invoiceName,
  customerName,
  outstandingAmount,
  defaultCompany,
  defaultCostCenter,
  defaultDepartment,
  onPaymentSuccess,
}: PaymentModalProps) => {
  const [paymentAmount, setPaymentAmount] = useState(outstandingAmount)
  const [paymentMode, setPaymentMode] = useState('Cash')
  const [costCenter, setCostCenter] = useState(defaultCostCenter || '')
  const [company, setCompany] = useState(defaultCompany || '')
  const [department, setDepartment] = useState(defaultDepartment || '')
  const [referenceNumber, setReferenceNumber] = useState('')
  const [loading, setLoading] = useState(false)

  const [companies, setCompanies] = useState<Company[]>([])
  const [isSingleCompany, setIsSingleCompany] = useState(false)
  const [companyOpen, setCompanyOpen] = useState(false)
  const [companyQuery, setCompanyQuery] = useState('')

  const [costCenters, setCostCenters] = useState<LinkFieldOption[]>([])
  const [costCenterOpen, setCostCenterOpen] = useState(false)
  const [costCenterQuery, setCostCenterQuery] = useState('')

  const [departments, setDepartments] = useState<LinkFieldOption[]>([])
  const [departmentOpen, setDepartmentOpen] = useState(false)
  const [departmentQuery, setDepartmentQuery] = useState('')

  const formatCurrency = useFormatMoney(company || defaultCompany || null)
  const moneyInput = useMoneyInputConfig(company || defaultCompany || null)

  useEffect(() => {
    if (!isOpen) return

    const loadCompanies = async () => {
      try {
        const list = await fetchCompanies()
        const mapped: Company[] = list.map((c) => ({ name: c.name, company_name: c.label }))
        setCompanies(mapped)

        if (mapped.length === 1) {
          setIsSingleCompany(true)
          if (!defaultCompany) {
            setCompany(mapped[0].name)
            setCompanyQuery(mapped[0].company_name)
          }
        } else if (defaultCompany) {
          const defaultComp = mapped.find((c) => c.name === defaultCompany)
          if (defaultComp) {
            setCompanyQuery(defaultComp.company_name)
          }
        }
      } catch (err) {
        console.error('Failed to load companies:', err)
      }
    }
    void loadCompanies()
  }, [isOpen, defaultCompany])

  const loadCostCenters = async (companyName?: string, query?: string) => {
    try {
      const list = await fetchCostCenters(companyName, query)
      setCostCenters(list)
    } catch (err) {
      console.error('Failed to load cost centers:', err)
    }
  }

  const loadDepartments = async (query?: string) => {
    try {
      const list = await fetchDepartments(query)
      setDepartments(list)
    } catch (err) {
      console.error('Failed to load departments:', err)
    }
  }

  useEffect(() => {
    if (!isOpen) return
    if (!company && !isSingleCompany) return

    const timeoutId = setTimeout(() => {
      void loadCostCenters(company || undefined, costCenterQuery || undefined)
    }, 300)
    return () => clearTimeout(timeoutId)
  }, [company, costCenterQuery, costCenterOpen, isOpen, isSingleCompany])

  useEffect(() => {
    if (!isOpen) return

    const timeoutId = setTimeout(() => {
      void loadDepartments(departmentQuery || undefined)
    }, 300)
    return () => clearTimeout(timeoutId)
  }, [departmentQuery, departmentOpen, isOpen])

  // When modal opens or defaults change, sync from invoice
  useEffect(() => {
    if (!isOpen) return
    setPaymentAmount(outstandingAmount)
    if (defaultCompany) {
      setCompany(defaultCompany)
    }
    if (defaultCostCenter) {
      setCostCenter(defaultCostCenter)
      setCostCenterQuery('')
    } else {
      setCostCenter('')
      setCostCenterQuery('')
    }
    if (defaultDepartment) {
      setDepartment(defaultDepartment)
      setDepartmentQuery(defaultDepartment)
    } else {
      setDepartment('')
      setDepartmentQuery('')
    }
  }, [isOpen, outstandingAmount, defaultCompany, defaultCostCenter, defaultDepartment])

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (paymentAmount <= 0) {
      toast.error('Please enter a valid payment amount')
      return
    }

    if (paymentAmount > outstandingAmount) {
      toast.error(
        `Payment amount cannot exceed outstanding amount of ${formatCurrency(outstandingAmount)}`
      )
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

  const fieldClass =
    'w-full rounded-lg border border-emerald-200/70 bg-white/90 px-3 py-2 text-sm text-emerald-950 shadow-sm placeholder:text-emerald-800/40 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/30'

  return (
    <div className="fixed inset-0 z-[100] flex justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-emerald-950/25 backdrop-blur-[2px]"
        aria-label="Close"
        onClick={onClose}
      />

      <div
        className="relative flex h-full w-full max-w-md flex-col border-l border-emerald-200/80 bg-white shadow-2xl shadow-emerald-900/15 ring-1 ring-emerald-100/90"
        role="dialog"
        aria-modal="true"
        aria-labelledby="payment-modal-title"
      >
        <CreateModalHeader
          title={<span id="payment-modal-title">Record payment</span>}
          subtitle={
            <span className="font-mono text-xs text-emerald-900/70">
              {invoiceName} · {customerName}
            </span>
          }
          icon={<CreditCard className="h-5 w-5 text-emerald-700" strokeWidth={2} />}
          onClose={onClose}
        />

        <form
          onSubmit={handleSubmit}
          className="flex min-h-0 flex-1 flex-col"
          onClick={(e) => {
            const target = e.target as HTMLElement
            if (target.tagName !== 'INPUT' && !target.closest('.absolute')) {
              closeAllDropdowns()
            }
          }}
        >
          <div className={`${CREATE_MODAL_BODY_GRADIENT} min-h-0 flex-1 overflow-y-auto px-5 py-4`}>
            <div className="space-y-4 pb-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-emerald-900/90">Customer</label>
                <input
                  type="text"
                  value={customerName}
                  disabled
                  className={`${fieldClass} cursor-not-allowed bg-emerald-50/50 text-emerald-800/80`}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-emerald-900/90">Outstanding</label>
                <input
                  type="text"
                  value={formatCurrency(outstandingAmount)}
                  disabled
                  className={`${fieldClass} cursor-not-allowed bg-emerald-50/50 text-emerald-800/80`}
                />
              </div>

              {!isSingleCompany && (
                <div className="relative">
                  <label className="mb-1 block text-sm font-medium text-emerald-900/90">
                    Company <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={
                        company
                          ? (companies.find((c) => c.name === company)?.company_name ?? company)
                          : companyQuery
                      }
                      onChange={(e) => {
                        setCompany('')
                        setCompanyQuery(e.target.value)
                        setCompanyOpen(true)
                        setCostCenter('')
                        setCostCenterQuery('')
                      }}
                      onFocus={() => setCompanyOpen(true)}
                      placeholder="Select company…"
                      className={`${fieldClass} pl-9`}
                      required
                    />
                    <Building2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-600/60" />
                    {companyOpen && (
                      <div className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-md border border-emerald-200 bg-white shadow-lg">
                        {companies.filter(
                          (c) =>
                            !companyQuery ||
                            c.company_name.toLowerCase().includes(companyQuery.toLowerCase())
                        ).length > 0 ? (
                          companies
                            .filter(
                              (c) =>
                                !companyQuery ||
                                c.company_name.toLowerCase().includes(companyQuery.toLowerCase())
                            )
                            .map((comp) => (
                              <button
                                key={comp.name}
                                type="button"
                                className="w-full px-3 py-2 text-left text-sm text-emerald-950 hover:bg-emerald-50"
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
                          <div className="px-3 py-2 text-xs text-emerald-800/60">No companies found</div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="relative">
                <label className="mb-1 block text-sm font-medium text-emerald-900/90">
                  Cost center <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={
                      costCenter
                        ? (costCenters.find((c) => c.name === costCenter)?.label ?? costCenter)
                        : costCenterQuery
                    }
                    onChange={(e) => {
                      setCostCenter('')
                      setCostCenterQuery(e.target.value)
                      setCostCenterOpen(true)
                    }}
                    onFocus={() => setCostCenterOpen(true)}
                    placeholder={!company && !isSingleCompany ? 'Select a company first…' : 'Search cost center…'}
                    disabled={!company && !isSingleCompany}
                    className={`${fieldClass} pl-9 disabled:cursor-not-allowed disabled:bg-emerald-50/40 disabled:text-emerald-800/50`}
                    required
                  />
                  <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-600/60" />
                  {costCenterOpen && (company || isSingleCompany) && (
                    <div className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-md border border-emerald-200 bg-white shadow-lg">
                      {costCenters.length > 0 ? (
                        costCenters.map((cc) => (
                          <button
                            key={cc.name}
                            type="button"
                            className="w-full px-3 py-2 text-left text-sm text-emerald-950 hover:bg-emerald-50"
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
                        <div className="px-3 py-2 text-xs text-emerald-800/60">No cost centers found</div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="relative">
                <label className="mb-1 block text-sm font-medium text-emerald-900/90">
                  Department <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={
                      department
                        ? (departments.find((d) => d.name === department)?.label ?? department)
                        : departmentQuery
                    }
                    onChange={(e) => {
                      setDepartment('')
                      setDepartmentQuery(e.target.value)
                      setDepartmentOpen(true)
                    }}
                    onFocus={() => setDepartmentOpen(true)}
                    placeholder="Search department…"
                    className={`${fieldClass} pl-9`}
                    required
                  />
                  <Briefcase className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-600/60" />
                  {departmentOpen && (
                    <div className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-md border border-emerald-200 bg-white shadow-lg">
                      {departments.length > 0 ? (
                        departments.map((dept) => (
                          <button
                            key={dept.name}
                            type="button"
                            className="w-full px-3 py-2 text-left text-sm text-emerald-950 hover:bg-emerald-50"
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
                        <div className="px-3 py-2 text-xs text-emerald-800/60">No departments found</div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-emerald-900/90">
                  Payment amount <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min={moneyInput.min}
                  step={moneyInput.step}
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(parseFloat(e.target.value))}
                  placeholder={moneyInput.placeholder}
                  required
                  className={fieldClass}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-emerald-900/90">
                  Payment mode <span className="text-red-500">*</span>
                </label>
                <select
                  value={paymentMode}
                  onChange={(e) => setPaymentMode(e.target.value)}
                  required
                  className={fieldClass}
                >
                  {paymentModes.map((mode) => (
                    <option key={mode} value={mode}>
                      {mode}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-emerald-900/90">
                  Reference number <span className="text-emerald-700/50">(optional)</span>
                </label>
                <input
                  type="text"
                  value={referenceNumber}
                  onChange={(e) => setReferenceNumber(e.target.value)}
                  placeholder="Cheque / transaction number"
                  className={fieldClass}
                />
              </div>

              {paymentAmount > outstandingAmount && (
                <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50/90 p-3 text-sm text-red-800">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>Payment amount exceeds outstanding amount</span>
                </div>
              )}
            </div>
          </div>

          <div
            className={`${CREATE_MODAL_FOOTER_STICKY} shrink-0 justify-end border-t border-emerald-200/90 shadow-[0_-4px_12px_-2px_rgba(16,185,129,0.12)]`}
          >
            <button type="button" onClick={onClose} className={CM_BTN_CANCEL}>
              Cancel
            </button>
            <button
              type="submit"
              disabled={
                loading ||
                paymentAmount <= 0 ||
                paymentAmount > outstandingAmount ||
                (!company && !isSingleCompany) ||
                !costCenter ||
                !department
              }
              className={CM_BTN_PRIMARY}
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Processing…
                </span>
              ) : (
                'Record payment'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// components/billing/BillingDashboard.tsx
import { useState, useEffect } from 'react'

import { 
  fetchServiceOrders, 
  fetchServiceInvoices,
  fetchServiceOrderSummary,
  fetchInvoiceSummary,
  fetchInpatientBalances,
  fetchOutpatientBalances,
  getInvoicesByReference,
  getInvoiceDetails,
  fetchRelatedSalesOrders,
  createAdditionalCollectionInvoice,
  createInternalEmployeeInvoice,
  type BillingInvoiceItemInput,
  type RelatedSalesOrder,
  type ServiceOrder,
  type ServiceInvoice,
  type OrderSummary,
  type InvoiceSummary,
  type InpatientBalance,
  type OutpatientBalance,
} from '../../services/serviceOrders'
import { fetchCompanies, fetchCostCenters, fetchEmployees } from '../../services/common'
import { useCareContext } from '../../providers/CareContextProvider'
import { 
  Receipt, 
  CreditCard, 
  Clock, 
  AlertCircle,
  CheckCircle,
  TrendingUp,
  Package,
  ChevronRight,
  LayoutDashboard,
  ListOrdered,
  FileText as FileIcon,
  Users,
  User,
  Filter,
  Loader2
} from 'lucide-react'
import { toast } from '../../hooks/useToast'

import { ServiceOrdersList } from './ServiceOrdersList'
import { ServiceInvoicesList } from './ServiceInvoicesList'
import { InvoiceItemsModal } from './InvoiceItemsModal'
import { PaymentModal } from './PaymentModal'

type DashboardView = 'overview' | 'orders' | 'invoices' | 'inpatient' | 'outpatient' | 'unpaid' | 'paid'

// Helper function for currency formatting
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(amount)
}

// Navigation Button Component
const NavButton = ({ 
  icon: Icon, 
  label, 
  isActive, 
  onClick,
  count 
}: { 
  icon: any
  label: string
  isActive: boolean
  onClick: () => void
  count?: number
}) => (
  <button
    onClick={onClick}
    className={`flex items-center justify-center gap-2 px-4 py-2 rounded-lg transition-all ${
      isActive 
        ? 'bg-primary text-white shadow-md' 
        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
    }`}
  >
    <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-primary'}`} />
    <span className="text-sm font-medium">{label}</span>
    {count !== undefined && count > 0 && (
      <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${
        isActive ? 'bg-white/20 text-white' : 'bg-white text-primary'
      }`}>
        {count}
      </span>
    )}
  </button>
)

// Filter Button Component
const FilterButton = ({ label, active, onClick, color }: { label: string; active: boolean; onClick: () => void; color: string }) => (
  <button
    onClick={onClick}
    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
      active 
        ? `${color} text-white shadow-sm` 
        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
    }`}
  >
    {label}
  </button>
)

interface BillingDashboardProps {
  patient?: string
  admission?: string
  visit?: string
}

export const BillingDashboard = ({ patient, admission, visit }: BillingDashboardProps) => {
  const { mode, activeAdmission, activeVisit, selectedPatient } = useCareContext()
  
  // Load saved view from localStorage
  const getSavedView = (): DashboardView => {
    const saved = localStorage.getItem('billingDashboardView')
    if (saved === 'overview' || saved === 'orders' || saved === 'invoices' || saved === 'inpatient' || saved === 'outpatient' || saved === 'unpaid' || saved === 'paid') {
      return saved as DashboardView
    }
    return 'overview'
  }

  const [currentView, setCurrentView] = useState<DashboardView>(getSavedView)
  const [orderSummary, setOrderSummary] = useState<OrderSummary | null>(null)
  const [invoiceSummary, setInvoiceSummary] = useState<InvoiceSummary | null>(null)
  const [inpatientBalances, setInpatientBalances] = useState<InpatientBalance[]>([])
  const [filteredInpatient, setFilteredInpatient] = useState<InpatientBalance[]>([])
  const [outpatientBalances, setOutpatientBalances] = useState<OutpatientBalance[]>([])
  const [filteredOutpatient, setFilteredOutpatient] = useState<OutpatientBalance[]>([])
  const [loading, setLoading] = useState(true)
  const [recentOrders, setRecentOrders] = useState<ServiceOrder[]>([])
  const [recentInvoices, setRecentInvoices] = useState<ServiceInvoice[]>([])
  const [inpatientFilter, setInpatientFilter] = useState<'all' | 'paid' | 'unpaid' | 'partial' | 'overdue'>('all')
  const [outpatientFilter, setOutpatientFilter] = useState<'all' | 'paid' | 'unpaid' | 'partial' | 'overdue'>('all')
  
  // Modal states
  const [selectedInvoice, setSelectedInvoice] = useState<string | null>(null)
  const [showInvoiceItems, setShowInvoiceItems] = useState(false)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [selectedPaymentInvoice, setSelectedPaymentInvoice] = useState<{
    name: string
    customer_name: string
    outstanding_amount: number
    company?: string
    cost_center?: string
    department?:string
  } | null>(null)
  const [loadingInvoices, setLoadingInvoices] = useState<string | null>(null)
  const [showAdditionalModal, setShowAdditionalModal] = useState(false)
  const [showInternalModal, setShowInternalModal] = useState(false)
  const [companies, setCompanies] = useState<Array<{ name: string; label: string }>>([])
  const [costCenters, setCostCenters] = useState<Array<{ name: string; label: string }>>([])
  const [employeeOptions, setEmployeeOptions] = useState<Array<{ name: string; label: string }>>([])
  const [relatedOrders, setRelatedOrders] = useState<RelatedSalesOrder[]>([])
  const [selectedOrders, setSelectedOrders] = useState<string[]>([])
  const [additionalLoadingOrders, setAdditionalLoadingOrders] = useState(false)
  const [additionalSaving, setAdditionalSaving] = useState(false)
  const [internalSaving, setInternalSaving] = useState(false)
  const [additionalForm, setAdditionalForm] = useState({
    reference_type: 'Patient Visit',
    reference_name: '',
    patient: '',
    customer: '',
    company: '',
    created_at_cost_center: '',
    posting_date: '',
    due_date: '',
  })
  const [internalForm, setInternalForm] = useState({
    employee_name: '',
    company: '',
    created_at_cost_center: '',
    posting_date: '',
    due_date: '',
  })
  const [additionalItems, setAdditionalItems] = useState<BillingInvoiceItemInput[]>([
    { item_code: '', item_name: '', description: '', qty: 1, rate: 0 },
  ])
  const [internalItems, setInternalItems] = useState<BillingInvoiceItemInput[]>([
    { item_code: '', item_name: '', description: '', qty: 1, rate: 0 },
  ])
  
  const effectivePatient = patient ?? selectedPatient
  const effectiveReferenceType = mode === 'IP' ? 'Inpatient Admission' : 'Patient Visit'
  const effectiveReferenceName = mode === 'IP' ? (admission ?? activeAdmission) : (visit ?? activeVisit)

  // Save view to localStorage
  const handleViewChange = (view: DashboardView) => {
    setCurrentView(view)
    localStorage.setItem('billingDashboardView', view)
  }

  // Handle view services - get actual invoices for the reference
  const handleViewServices = async (referenceId: string, patientName: string, referenceType: string) => {
    try {
      setLoadingInvoices(referenceId)
      const invoices = await getInvoicesByReference(referenceId, referenceType)
      console.log(patientName)
      if (invoices.length === 0) {
        toast.error('No invoices found for this admission/visit')
        return
      }
      
      setSelectedInvoice(invoices[0].name)
      setShowInvoiceItems(true)
    } catch (error) {
      console.error('Error loading invoices:', error)
      toast.error('Failed to load invoice details')
    } finally {
      setLoadingInvoices(null)
    }
  }

  // Handle make payment - fetch invoice details for company and cost center
// Replace the handleMakePayment function with this:
const handleMakePayment = async (referenceId: string, customerName: string, outstandingAmount: number, referenceType: string) => {
  try {
    setLoadingInvoices(referenceId)
    // First, get the actual invoices for this reference
    const invoices = await getInvoicesByReference(referenceId, referenceType)
    
    if (!invoices || invoices.length === 0) {
      toast.error('No invoices found for this admission/visit')
      return
    }
    
    // Use the first invoice's name
    const invoiceName = invoices[0].name
    
    // Fetch invoice details to get company and cost center
    const invoiceDetails = await getInvoiceDetails(invoiceName)
    
    setSelectedPaymentInvoice({
      name: invoiceName,  // Now this is the actual invoice name, not the admission ID
      customer_name: customerName,
      outstanding_amount: outstandingAmount,
      company: invoiceDetails?.company || '',
      cost_center: invoiceDetails?.cost_center || '',
      department:invoiceDetails?.department || '',
    })
    setShowPaymentModal(true)
  } catch (error) {
    console.error('Error fetching invoice details:', error)
    toast.error('Failed to load invoice details for payment')
  } finally {
    setLoadingInvoices(null)
  }
}

  const handlePaymentSuccess = () => {
    if (currentView === 'inpatient') {
      loadInpatientBalances()
    } else if (currentView === 'outpatient') {
      loadOutpatientBalances()
    } else {
      loadDashboardData()
    }
  }

  useEffect(() => {
    setAdditionalForm((prev) => ({ ...prev, patient: effectivePatient || prev.patient }))
  }, [effectivePatient])

  useEffect(() => {
    ;(async () => {
      const [companyData, employeesData] = await Promise.all([fetchCompanies(), fetchEmployees()])
      setCompanies(companyData)
      setEmployeeOptions(employeesData.map((emp) => ({ name: emp.name, label: emp.label || emp.name })))
    })().catch((error) => {
      console.error(error)
      toast.error('Failed to load billing references')
    })
  }, [])

  useEffect(() => {
    const selectedCompany = additionalForm.company || internalForm.company
    if (!selectedCompany) return
    fetchCostCenters(selectedCompany)
      .then(setCostCenters)
      .catch(() => toast.error('Failed to load cost centers'))
  }, [additionalForm.company, internalForm.company])

  const loadRelatedOrders = async () => {
    if (!additionalForm.reference_name) {
      toast.error('Enter a patient visit or admission number')
      return
    }
    try {
      setAdditionalLoadingOrders(true)
      const rows = await fetchRelatedSalesOrders(
        additionalForm.reference_type as 'Patient Visit' | 'Inpatient Admission',
        additionalForm.reference_name
      )
      setRelatedOrders(rows)
      setSelectedOrders(rows.map((r) => r.name))
      if (!additionalForm.company && rows[0]?.company) {
        setAdditionalForm((prev) => ({ ...prev, company: rows[0].company || '' }))
      }
      if (!additionalForm.customer && rows[0]?.customer) {
        setAdditionalForm((prev) => ({ ...prev, customer: rows[0].customer || '' }))
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to fetch sales orders')
    } finally {
      setAdditionalLoadingOrders(false)
    }
  }

  const addItemRow = (setter: (update: (prev: BillingInvoiceItemInput[]) => BillingInvoiceItemInput[]) => void) => {
    setter((prev) => [...prev, { item_code: '', item_name: '', description: '', qty: 1, rate: 0 }])
  }

  const handleCreateAdditionalInvoice = async () => {
    try {
      setAdditionalSaving(true)
      const created = await createAdditionalCollectionInvoice({
        ...additionalForm,
        sales_orders: selectedOrders,
        additional_items: additionalItems,
      })
      toast.success(`Invoice ${created.name} created`)
      setShowAdditionalModal(false)
      loadDashboardData()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create additional invoice')
    } finally {
      setAdditionalSaving(false)
    }
  }

  const handleCreateInternalInvoice = async () => {
    try {
      setInternalSaving(true)
      const created = await createInternalEmployeeInvoice({
        ...internalForm,
        items: internalItems,
      })
      toast.success(`Internal invoice ${created.name} created`)
      setShowInternalModal(false)
      loadDashboardData()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create internal invoice')
    } finally {
      setInternalSaving(false)
    }
  }

  const loadDashboardData = async () => {
    if (!effectivePatient && !effectiveReferenceName) {
      setOrderSummary(null)
      setInvoiceSummary(null)
      setRecentOrders([])
      setRecentInvoices([])
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      const [ordersSummary, invSummary, recentOrdersData, recentInvoicesData] = await Promise.all([
        fetchServiceOrderSummary(effectiveReferenceType, effectiveReferenceName, effectivePatient),
        fetchInvoiceSummary(effectiveReferenceType, effectiveReferenceName, effectivePatient),
        fetchServiceOrders(effectiveReferenceType, effectiveReferenceName, effectivePatient, undefined),
        fetchServiceInvoices(effectiveReferenceType, effectiveReferenceName, effectivePatient, undefined)
      ])
      
      setOrderSummary(ordersSummary)
      setInvoiceSummary(invSummary)
      setRecentOrders(recentOrdersData)
      setRecentInvoices(recentInvoicesData)
    } catch (error) {
      console.error('Failed to load dashboard data:', error)
      toast.error('Failed to load dashboard data')
    } finally {
      setLoading(false)
    }
  }

  const loadInpatientBalances = async () => {
    try {
      setLoading(true)
      const balances = await fetchInpatientBalances(effectivePatient)
      setInpatientBalances(balances)
      setFilteredInpatient(balances)
    } catch (error) {
      console.error('Failed to load inpatient balances:', error)
      toast.error('Failed to load inpatient balances')
    } finally {
      setLoading(false)
    }
  }

  const loadOutpatientBalances = async () => {
    try {
      setLoading(true)
      const balances = await fetchOutpatientBalances(effectivePatient)
      setOutpatientBalances(balances)
      setFilteredOutpatient(balances)
    } catch (error) {
      console.error('Failed to load outpatient balances:', error)
      toast.error('Failed to load outpatient balances')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (currentView === 'inpatient') {
      loadInpatientBalances()
    } else if (currentView === 'outpatient') {
      loadOutpatientBalances()
    } else {
      loadDashboardData()
    }
  }, [currentView, effectivePatient, effectiveReferenceName])

  // Filter inpatient balances
  useEffect(() => {
    if (inpatientFilter === 'all') {
      setFilteredInpatient(inpatientBalances)
    } else {
      const filtered = inpatientBalances.filter(balance => {
        if (inpatientFilter === 'paid') return balance.outstanding_amount === 0 && balance.total_paid > 0
        if (inpatientFilter === 'unpaid') return balance.outstanding_amount === balance.total_amount && balance.total_amount > 0
        if (inpatientFilter === 'partial') return balance.outstanding_amount > 0 && balance.outstanding_amount < balance.total_amount
        if (inpatientFilter === 'overdue') return balance.days_overdue > 0
        return true
      })
      setFilteredInpatient(filtered)
    }
  }, [inpatientFilter, inpatientBalances])

  // Filter outpatient balances
  useEffect(() => {
    if (outpatientFilter === 'all') {
      setFilteredOutpatient(outpatientBalances)
    } else {
      const filtered = outpatientBalances.filter(balance => {
        if (outpatientFilter === 'paid') return balance.outstanding_amount === 0 && balance.total_paid > 0
        if (outpatientFilter === 'unpaid') return balance.outstanding_amount === balance.total_amount && balance.total_amount > 0
        if (outpatientFilter === 'partial') return balance.outstanding_amount > 0 && balance.outstanding_amount < balance.total_amount
        if (outpatientFilter === 'overdue') return balance.days_overdue > 0
        return true
      })
      setFilteredOutpatient(filtered)
    }
  }, [outpatientFilter, outpatientBalances])

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Paid': return 'text-green-600 bg-green-50'
      case 'Unpaid': return 'text-yellow-600 bg-yellow-50'
      case 'Overdue': return 'text-red-600 bg-red-50'
      case 'Partially Paid': return 'text-blue-600 bg-blue-50'
      default: return 'text-gray-600 bg-gray-50'
    }
  }

  const getBalanceStatusColor = (balance: InpatientBalance | OutpatientBalance) => {
    if (balance.outstanding_amount === 0 && balance.total_paid > 0) {
      return { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', badge: 'bg-green-100 text-green-800', label: 'Paid in Full' }
    }
    if (balance.days_overdue > 0) {
      return { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', badge: 'bg-red-100 text-red-800', label: `Overdue (${balance.days_overdue} days)` }
    }
    if (balance.outstanding_amount > 0 && balance.outstanding_amount < balance.total_amount) {
      return { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-700', badge: 'bg-yellow-100 text-yellow-800', label: 'Partially Paid' }
    }
    if (balance.outstanding_amount === balance.total_amount && balance.total_amount > 0) {
      return { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', badge: 'bg-orange-100 text-orange-800', label: 'Unpaid' }
    }
    return { bg: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-700', badge: 'bg-slate-100 text-slate-800', label: 'No Charges' }
  }

  // StatCard component
  const StatCard = ({ 
    title, 
    value, 
    subValue, 
    icon: Icon, 
    color, 
    onClick 
  }: { 
    title: string
    value: string | number
    subValue?: string
    icon: any
    color: string
    onClick?: () => void
  }) => (
    <div 
      onClick={onClick}
      className={`bg-white rounded-xl border border-slate-200 p-5 shadow-sm transition-all ${
        onClick ? 'cursor-pointer hover:shadow-md hover:border-primary/30' : ''
      }`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-slate-500 mb-1">{title}</p>
          <p className="text-2xl font-bold text-slate-900">{value}</p>
          {subValue && <p className="text-xs text-slate-400 mt-1">{subValue}</p>}
        </div>
        <div className={`p-3 rounded-xl ${color}`}>
          <Icon className="w-6 h-6" />
        </div>
      </div>
    </div>
  )

  // QuickActionCard component
  const QuickActionCard = ({ 
    title, 
    count, 
    amount, 
    icon: Icon, 
    color, 
    onClick 
  }: { 
    title: string
    count: number
    amount: number
    icon: any
    color: string
    onClick: () => void
  }) => (
    <div 
      onClick={onClick}
      className="bg-white rounded-xl border border-slate-200 p-4 cursor-pointer hover:shadow-md hover:border-primary/30 transition-all group"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${color}`}>
            <Icon className="w-5 h-5" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-700">{title}</p>
            <p className="text-xs text-slate-400">{count} items</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold text-slate-900">{formatCurrency(amount)}</p>
          <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-primary transition-colors ml-auto" />
        </div>
      </div>
    </div>
  )

  // Navigation Row
  const NavigationRow = () => {
    const totalOrders = orderSummary?.total_orders || 0
    const totalInvoices = invoiceSummary?.total_invoices || 0

    return (
      <div className="flex gap-3 mb-6 flex-wrap">
        <NavButton
          icon={LayoutDashboard}
          label="Overview"
          isActive={currentView === 'overview'}
          onClick={() => handleViewChange('overview')}
        />
        <NavButton
          icon={ListOrdered}
          label="Services"
          isActive={currentView === 'orders'}
          onClick={() => handleViewChange('orders')}
          count={totalOrders}
        />
        <NavButton
          icon={FileIcon}
          label="Invoices"
          isActive={currentView === 'invoices'}
          onClick={() => handleViewChange('invoices')}
          count={totalInvoices}
        />
        <NavButton
          icon={Users}
          label="All IP"
          isActive={currentView === 'inpatient'}
          onClick={() => handleViewChange('inpatient')}
          count={inpatientBalances.length}
        />
        <NavButton
          icon={User}
          label="All OP"
          isActive={currentView === 'outpatient'}
          onClick={() => handleViewChange('outpatient')}
          count={outpatientBalances.length}
        />
      </div>
    )
  }

  // FIX: Shared modals rendered regardless of current view
  const SharedModals = () => (
    <>
      <InvoiceItemsModal
        isOpen={showInvoiceItems}
        onClose={() => {
          setShowInvoiceItems(false)
          setSelectedInvoice(null)
        }}
        invoiceName={selectedInvoice || ''}
        onMakePayment={(invoiceName) => {
          // Find the invoice details from current balances
          let invoiceDetails = null
          if (currentView === 'inpatient') {
            const balance = inpatientBalances.find(b => b.admission_id === invoiceName)
            if (balance) {
              invoiceDetails = {
                name: invoiceName,
                customer_name: balance.patient_name,
                outstanding_amount: balance.outstanding_amount
              }
            }
          } else if (currentView === 'outpatient') {
            const balance = outpatientBalances.find(b => b.visit_id === invoiceName)
            if (balance) {
              invoiceDetails = {
                name: invoiceName,
                customer_name: balance.patient_name,
                outstanding_amount: balance.outstanding_amount
              }
            }
          }
          
          if (invoiceDetails) {
            setShowInvoiceItems(false)
            setSelectedPaymentInvoice(invoiceDetails)
            setShowPaymentModal(true)
          }
        }}
      />

      <PaymentModal
        isOpen={showPaymentModal}
        onClose={() => {
          setShowPaymentModal(false)
          setSelectedPaymentInvoice(null)
        }}
        invoiceName={selectedPaymentInvoice?.name || ''}
        customerName={selectedPaymentInvoice?.customer_name || ''}
        outstandingAmount={selectedPaymentInvoice?.outstanding_amount || 0}
        defaultCompany={selectedPaymentInvoice?.company}
        defaultCostCenter={selectedPaymentInvoice?.cost_center}
        defaultDepartment={selectedPaymentInvoice?.department}
        onPaymentSuccess={handlePaymentSuccess}
      />
    </>
  )

  const BillingItemsEditor = ({
    items,
    onChange,
    defaultCostCenter,
  }: {
    items: BillingInvoiceItemInput[]
    onChange: (items: BillingInvoiceItemInput[]) => void
    defaultCostCenter: string
  }) => (
    <div className="space-y-2">
      {items.map((item, idx) => (
        <div key={idx} className="grid grid-cols-1 md:grid-cols-6 gap-2">
          <input
            className="border rounded px-2 py-1 text-sm"
            placeholder="Item Code"
            value={item.item_code}
            onChange={(e) => onChange(items.map((r, i) => (i === idx ? { ...r, item_code: e.target.value } : r)))}
          />
          <input
            className="border rounded px-2 py-1 text-sm"
            placeholder="Item Name"
            value={item.item_name || ''}
            onChange={(e) => onChange(items.map((r, i) => (i === idx ? { ...r, item_name: e.target.value } : r)))}
          />
          <input
            className="border rounded px-2 py-1 text-sm"
            placeholder="Qty"
            type="number"
            min="0"
            value={item.qty}
            onChange={(e) => onChange(items.map((r, i) => (i === idx ? { ...r, qty: Number(e.target.value || 0) } : r)))}
          />
          <input
            className="border rounded px-2 py-1 text-sm"
            placeholder="Rate"
            type="number"
            min="0"
            value={item.rate}
            onChange={(e) => onChange(items.map((r, i) => (i === idx ? { ...r, rate: Number(e.target.value || 0) } : r)))}
          />
          <input
            className="border rounded px-2 py-1 text-sm"
            placeholder="Cost Center"
            value={item.cost_center || defaultCostCenter}
            onChange={(e) => onChange(items.map((r, i) => (i === idx ? { ...r, cost_center: e.target.value } : r)))}
          />
          <button
            className="text-xs text-red-600 border border-red-200 rounded px-2 py-1"
            onClick={() => onChange(items.filter((_, i) => i !== idx))}
            type="button"
          >
            Remove
          </button>
        </div>
      ))}
    </div>
  )

  if (loading && (currentView === 'inpatient' || currentView === 'outpatient')) {
    return (
      <div className="space-y-4">
        <NavigationRow />
        <div className="flex items-center justify-center h-96">
          <div className="text-slate-500">Loading balances...</div>
        </div>
        <SharedModals />
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-slate-500">Loading dashboard...</div>
        <SharedModals />
      </div>
    )
  }

  // Orders View
  if (currentView === 'orders') {
    return (
      <div className="space-y-4">
        <NavigationRow />
        <ServiceOrdersList 
          patient={effectivePatient}
          admission={effectiveReferenceName}
          visit={effectiveReferenceType === 'Patient Visit' ? effectiveReferenceName : undefined}
        />
        <SharedModals />
      </div>
    )
  }

  // Invoices View
  if (currentView === 'invoices') {
    return (
      <div className="space-y-4">
        <NavigationRow />
        <ServiceInvoicesList 
          patient={effectivePatient}
          admission={effectiveReferenceName}
          visit={effectiveReferenceType === 'Patient Visit' ? effectiveReferenceName : undefined}
        />
        <SharedModals />
      </div>
    )
  }

  // Unpaid View
  if (currentView === 'unpaid') {
    return (
      <div className="space-y-4">
        <button
          onClick={() => handleViewChange('overview')}
          className="flex items-center gap-2 text-sm text-primary hover:underline mb-4"
        >
          ← Back to Dashboard
        </button>
        <ServiceInvoicesList 
          patient={effectivePatient}
          admission={effectiveReferenceName}
          visit={effectiveReferenceType === 'Patient Visit' ? effectiveReferenceName : undefined}
          statusFilter="Unpaid,Overdue"
        />
        <SharedModals />
      </div>
    )
  }

  // Paid View
  if (currentView === 'paid') {
    return (
      <div className="space-y-4">
        <button
          onClick={() => handleViewChange('overview')}
          className="flex items-center gap-2 text-sm text-primary hover:underline mb-4"
        >
          ← Back to Dashboard
        </button>
        <ServiceInvoicesList 
          patient={effectivePatient}
          admission={effectiveReferenceName}
          visit={effectiveReferenceType === 'Patient Visit' ? effectiveReferenceName : undefined}
          statusFilter="Paid"
        />
        <SharedModals />
      </div>
    )
  }

  // Inpatient Balances View
  if (currentView === 'inpatient') {
    const totalOutstanding = inpatientBalances.reduce((sum, b) => sum + b.outstanding_amount, 0)
    const totalOverdue = inpatientBalances.filter(b => b.days_overdue > 0).reduce((sum, b) => sum + b.outstanding_amount, 0)
    const totalPaid = inpatientBalances.reduce((sum, b) => sum + b.total_paid, 0)

    return (
      <div className="space-y-6">
        <NavigationRow />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard
            title="Total Outstanding"
            value={formatCurrency(totalOutstanding)}
            subValue={`Across ${inpatientBalances.length} admissions`}
            icon={AlertCircle}
            color="bg-red-50 text-red-600"
          />
          <StatCard
            title="Overdue Amount"
            value={formatCurrency(totalOverdue)}
            subValue={`${inpatientBalances.filter(b => b.days_overdue > 0).length} overdue`}
            icon={Clock}
            color="bg-orange-50 text-orange-600"
          />
          <StatCard
            title="Total Paid"
            value={formatCurrency(totalPaid)}
            subValue="Across all admissions"
            icon={CheckCircle}
            color="bg-green-50 text-green-600"
          />
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <Filter className="w-4 h-4 text-slate-400" />
          <span className="text-sm text-slate-600 mr-2">Filter:</span>
          <FilterButton label="All" active={inpatientFilter === 'all'} onClick={() => setInpatientFilter('all')} color="bg-slate-600" />
          <FilterButton label="Unpaid" active={inpatientFilter === 'unpaid'} onClick={() => setInpatientFilter('unpaid')} color="bg-orange-600" />
          <FilterButton label="Partial" active={inpatientFilter === 'partial'} onClick={() => setInpatientFilter('partial')} color="bg-yellow-600" />
          <FilterButton label="Paid" active={inpatientFilter === 'paid'} onClick={() => setInpatientFilter('paid')} color="bg-green-600" />
          <FilterButton label="Overdue" active={inpatientFilter === 'overdue'} onClick={() => setInpatientFilter('overdue')} color="bg-red-600" />
        </div>

        {filteredInpatient.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
            <Users className="w-12 h-12 text-slate-400 mx-auto mb-3 opacity-30" />
            <p className="text-slate-500">No inpatient balances found</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredInpatient.map((balance) => {
              const status = getBalanceStatusColor(balance)
              const percentagePaid = balance.total_amount > 0 ? (balance.total_paid / balance.total_amount) * 100 : 0
              const isLoading = loadingInvoices === balance.admission_id
              
              return (
                <div key={balance.admission_id} className={`bg-white rounded-xl border ${status.border} p-5 hover:shadow-md transition-all`}>
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <div className={`w-2 h-2 rounded-full ${status.badge.replace('bg-', 'bg-')}`} />
                        <h3 className="font-semibold text-slate-900">{balance.patient_name}</h3>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${status.badge}`}>{status.label}</span>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <div><p className="text-xs text-slate-400">Admission ID</p><p className="text-slate-700 font-mono text-xs">{balance.admission_id}</p></div>
                        <div><p className="text-xs text-slate-400">Admission Date</p><p className="text-slate-700">{balance.admission_date}</p></div>
                        <div><p className="text-xs text-slate-400">Cost Center</p><p className="text-slate-700">{balance.cost_center || '-'}</p></div>
                        {balance.days_overdue > 0 && <div><p className="text-xs text-slate-400">Days Overdue</p><p className="text-red-600 font-medium">{balance.days_overdue} days</p></div>}
                      </div>
                    </div>
                    <div className="text-right min-w-[180px]">
                      <p className="text-xs text-slate-400">Total Charges</p>
                      <p className="text-lg font-bold text-slate-900">{formatCurrency(balance.total_amount)}</p>
                      <div className="mt-1">
                        <p className="text-xs text-green-600">Paid: {formatCurrency(balance.total_paid)}</p>
                        <p className={`text-xs font-medium ${balance.outstanding_amount > 0 ? 'text-red-600' : 'text-green-600'}`}>
                          Outstanding: {formatCurrency(balance.outstanding_amount)}
                        </p>
                      </div>
                    </div>
                  </div>
                  {balance.total_amount > 0 && (
                    <div className="mt-4">
                      <div className="flex justify-between text-xs text-slate-500 mb-1">
                        <span>Payment Progress</span>
                        <span>{percentagePaid.toFixed(1)}% paid</span>
                      </div>
                      <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                        <div
                          className={`h-2 rounded-full transition-all duration-500 ${percentagePaid === 100 ? 'bg-green-500' : balance.days_overdue > 0 ? 'bg-red-500' : 'bg-primary'}`}
                          style={{ width: `${percentagePaid}%` }}
                        />
                      </div>
                    </div>
                  )}
                  <div className="flex gap-2 mt-4 pt-3 border-t border-slate-100">
                    <button 
                      onClick={() => handleViewServices(balance.admission_id, balance.patient_name, 'Inpatient Admission')}
                      disabled={isLoading}
                      className="text-xs text-primary hover:underline flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                      title="View all invoices and services for this admission"
                    >
                      {isLoading ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Receipt className="w-3 h-3" />
                      )}
                      View Services
                    </button>
                    {balance.outstanding_amount > 0 && (
  <button 
    onClick={() => handleMakePayment(balance.admission_id, balance.patient_name, balance.outstanding_amount, 'Inpatient Admission')}
    className="text-xs text-green-600 hover:underline flex items-center gap-1"
    title={`Pay outstanding amount of ${formatCurrency(balance.outstanding_amount)}`}
  >
    <CreditCard className="w-3 h-3" /> Make Payment
  </button>
)}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <SharedModals />
      </div>
    )
  }

  // Outpatient Balances View
  if (currentView === 'outpatient') {
    const totalOutstanding = outpatientBalances.reduce((sum, b) => sum + b.outstanding_amount, 0)
    const totalOverdue = outpatientBalances.filter(b => b.days_overdue > 0).reduce((sum, b) => sum + b.outstanding_amount, 0)
    const totalPaid = outpatientBalances.reduce((sum, b) => sum + b.total_paid, 0)

    return (
      <div className="space-y-6">
        <NavigationRow />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard title="Total Outstanding" value={formatCurrency(totalOutstanding)} subValue={`Across ${outpatientBalances.length} visits`} icon={AlertCircle} color="bg-red-50 text-red-600" />
          <StatCard title="Overdue Amount" value={formatCurrency(totalOverdue)} subValue={`${outpatientBalances.filter(b => b.days_overdue > 0).length} overdue`} icon={Clock} color="bg-orange-50 text-orange-600" />
          <StatCard title="Total Paid" value={formatCurrency(totalPaid)} subValue="Across all visits" icon={CheckCircle} color="bg-green-50 text-green-600" />
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <Filter className="w-4 h-4 text-slate-400" />
          <span className="text-sm text-slate-600 mr-2">Filter:</span>
          <FilterButton label="All" active={outpatientFilter === 'all'} onClick={() => setOutpatientFilter('all')} color="bg-slate-600" />
          <FilterButton label="Unpaid" active={outpatientFilter === 'unpaid'} onClick={() => setOutpatientFilter('unpaid')} color="bg-orange-600" />
          <FilterButton label="Partial" active={outpatientFilter === 'partial'} onClick={() => setOutpatientFilter('partial')} color="bg-yellow-600" />
          <FilterButton label="Paid" active={outpatientFilter === 'paid'} onClick={() => setOutpatientFilter('paid')} color="bg-green-600" />
          <FilterButton label="Overdue" active={outpatientFilter === 'overdue'} onClick={() => setOutpatientFilter('overdue')} color="bg-red-600" />
        </div>

        {filteredOutpatient.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
            <User className="w-12 h-12 text-slate-400 mx-auto mb-3 opacity-30" />
            <p className="text-slate-500">No outpatient balances found</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredOutpatient.map((balance) => {
              const status = getBalanceStatusColor(balance)
              const percentagePaid = balance.total_amount > 0 ? (balance.total_paid / balance.total_amount) * 100 : 0
              const isLoading = loadingInvoices === balance.visit_id
              
              return (
                <div key={balance.visit_id} className={`bg-white rounded-xl border ${status.border} p-5 hover:shadow-md transition-all`}>
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <div className={`w-2 h-2 rounded-full ${status.badge.replace('bg-', 'bg-')}`} />
                        <h3 className="font-semibold text-slate-900">{balance.patient_name}</h3>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${status.badge}`}>{status.label}</span>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <div><p className="text-xs text-slate-400">Visit ID</p><p className="text-slate-700 font-mono text-xs">{balance.visit_id}</p></div>
                        <div><p className="text-xs text-slate-400">Visit Date</p><p className="text-slate-700">{balance.visit_date}</p></div>
                        <div><p className="text-xs text-slate-400">Practitioner</p><p className="text-slate-700">{balance.practitioner || '-'}</p></div>
                        {balance.days_overdue > 0 && <div><p className="text-xs text-slate-400">Days Overdue</p><p className="text-red-600 font-medium">{balance.days_overdue} days</p></div>}
                      </div>
                    </div>
                    <div className="text-right min-w-[180px]">
                      <p className="text-xs text-slate-400">Total Charges</p>
                      <p className="text-lg font-bold text-slate-900">{formatCurrency(balance.total_amount)}</p>
                      <div className="mt-1">
                        <p className="text-xs text-green-600">Paid: {formatCurrency(balance.total_paid)}</p>
                        <p className={`text-xs font-medium ${balance.outstanding_amount > 0 ? 'text-red-600' : 'text-green-600'}`}>
                          Outstanding: {formatCurrency(balance.outstanding_amount)}
                        </p>
                      </div>
                    </div>
                  </div>
                  {balance.total_amount > 0 && (
                    <div className="mt-4">
                      <div className="flex justify-between text-xs text-slate-500 mb-1">
                        <span>Payment Progress</span>
                        <span>{percentagePaid.toFixed(1)}% paid</span>
                      </div>
                      <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                        <div
                          className={`h-2 rounded-full transition-all duration-500 ${percentagePaid === 100 ? 'bg-green-500' : balance.days_overdue > 0 ? 'bg-red-500' : 'bg-primary'}`}
                          style={{ width: `${percentagePaid}%` }}
                        />
                      </div>
                    </div>
                  )}
                  <div className="flex gap-2 mt-4 pt-3 border-t border-slate-100">
                    <button 
                      onClick={() => handleViewServices(balance.visit_id, balance.patient_name, 'Patient Visit')}
                      disabled={isLoading}
                      className="text-xs text-primary hover:underline flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                      title="View all invoices and services for this visit"
                    >
                      {isLoading ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Receipt className="w-3 h-3" />
                      )}
                      View Services
                    </button>
                    {balance.outstanding_amount > 0 && (
  <button 
    onClick={() => handleMakePayment(balance.visit_id, balance.patient_name, balance.outstanding_amount, 'Patient Visit')}
    className="text-xs text-green-600 hover:underline flex items-center gap-1"
    title={`Pay outstanding amount of ${formatCurrency(balance.outstanding_amount)}`}
  >
    <CreditCard className="w-3 h-3" /> Make Payment
  </button>
)}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <SharedModals />
      </div>
    )
  }

  // Overview Dashboard
  return (
    <div className="space-y-6">
      <NavigationRow />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        <StatCard title="Total Orders" value={orderSummary?.total_orders || 0} subValue={`${formatCurrency(orderSummary?.total_amount || 0)} total value`} icon={Package} color="bg-blue-50 text-blue-600" onClick={() => handleViewChange('orders')} />
        <StatCard title="Total Invoices" value={invoiceSummary?.total_invoices || 0} subValue={`${formatCurrency(invoiceSummary?.total_amount || 0)} total value`} icon={Receipt} color="bg-purple-50 text-purple-600" onClick={() => handleViewChange('invoices')} />
        <StatCard title="Paid Amount" value={formatCurrency(invoiceSummary?.total_paid || 0)} subValue={`${invoiceSummary?.paid.count || 0} invoices paid`} icon={CheckCircle} color="bg-green-50 text-green-600" onClick={() => handleViewChange('paid')} />
        <StatCard title="Outstanding" value={formatCurrency(invoiceSummary?.total_outstanding || 0)} subValue={`${(invoiceSummary?.unpaid.count || 0) + (invoiceSummary?.overdue.count || 0)} invoices pending`} icon={AlertCircle} color="bg-red-50 text-red-600" onClick={() => handleViewChange('unpaid')} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-md font-semibold text-slate-800 mb-4 flex items-center gap-2"><Package className="w-4 h-4 text-primary" /> Order Summary</h3>
          <div className="space-y-3">
            <QuickActionCard title="Not Invoiced" count={orderSummary?.not_invoiced.count || 0} amount={orderSummary?.not_invoiced.amount || 0} icon={Clock} color="bg-yellow-50 text-yellow-600" onClick={() => handleViewChange('orders')} />
            <QuickActionCard title="Invoiced (Paid)" count={orderSummary?.invoiced.count || 0} amount={orderSummary?.invoiced.amount || 0} icon={CheckCircle} color="bg-green-50 text-green-600" onClick={() => handleViewChange('paid')} />
            <QuickActionCard title="Partially Invoiced" count={orderSummary?.partially_invoiced.count || 0} amount={orderSummary?.partially_invoiced.amount || 0} icon={AlertCircle} color="bg-orange-50 text-orange-600" onClick={() => handleViewChange('invoices')} />
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-md font-semibold text-slate-800 mb-4 flex items-center gap-2"><Receipt className="w-4 h-4 text-primary" /> Invoice Summary</h3>
          <div className="space-y-3">
            <QuickActionCard title="Paid Invoices" count={invoiceSummary?.paid.count || 0} amount={invoiceSummary?.paid.amount || 0} icon={CheckCircle} color="bg-green-50 text-green-600" onClick={() => handleViewChange('paid')} />
            <QuickActionCard title="Unpaid/Overdue" count={(invoiceSummary?.unpaid.count || 0) + (invoiceSummary?.overdue.count || 0)} amount={(invoiceSummary?.unpaid.amount || 0) + (invoiceSummary?.overdue.amount || 0)} icon={AlertCircle} color="bg-red-50 text-red-600" onClick={() => handleViewChange('unpaid')} />
            <QuickActionCard title="Partially Paid" count={invoiceSummary?.partially_paid.count || 0} amount={invoiceSummary?.partially_paid.amount || 0} icon={TrendingUp} color="bg-blue-50 text-blue-600" onClick={() => handleViewChange('invoices')} />
          </div>
        </div>
      </div>

      {/* Quick Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="bg-gradient-to-r from-primary/5 to-primary/10 rounded-xl border border-primary/20 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-800 flex items-center gap-2"><Users className="w-4 h-4 text-primary" /> Inpatient Balances</h3>
            <button onClick={() => handleViewChange('inpatient')} className="text-sm text-primary hover:underline flex items-center gap-1">View All <ChevronRight className="w-4 h-4" /></button>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white rounded-lg p-3 text-center"><p className="text-2xl font-bold text-red-600">{formatCurrency(inpatientBalances.reduce((sum, b) => sum + b.outstanding_amount, 0))}</p><p className="text-xs text-slate-500">Outstanding</p></div>
            <div className="bg-white rounded-lg p-3 text-center"><p className="text-2xl font-bold text-orange-600">{formatCurrency(inpatientBalances.filter(b => b.days_overdue > 0).reduce((sum, b) => sum + b.outstanding_amount, 0))}</p><p className="text-xs text-slate-500">Overdue</p></div>
            <div className="bg-white rounded-lg p-3 text-center"><p className="text-2xl font-bold text-green-600">{inpatientBalances.filter(b => b.outstanding_amount === 0 && b.total_paid > 0).length}</p><p className="text-xs text-slate-500">Fully Paid</p></div>
          </div>
        </div>

        <div className="bg-gradient-to-r from-primary/5 to-primary/10 rounded-xl border border-primary/20 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-800 flex items-center gap-2"><User className="w-4 h-4 text-primary" /> Outpatient Balances</h3>
            <button onClick={() => handleViewChange('outpatient')} className="text-sm text-primary hover:underline flex items-center gap-1">View All <ChevronRight className="w-4 h-4" /></button>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white rounded-lg p-3 text-center"><p className="text-2xl font-bold text-red-600">{formatCurrency(outpatientBalances.reduce((sum, b) => sum + b.outstanding_amount, 0))}</p><p className="text-xs text-slate-500">Outstanding</p></div>
            <div className="bg-white rounded-lg p-3 text-center"><p className="text-2xl font-bold text-orange-600">{formatCurrency(outpatientBalances.filter(b => b.days_overdue > 0).reduce((sum, b) => sum + b.outstanding_amount, 0))}</p><p className="text-xs text-slate-500">Overdue</p></div>
            <div className="bg-white rounded-lg p-3 text-center"><p className="text-2xl font-bold text-green-600">{outpatientBalances.filter(b => b.outstanding_amount === 0 && b.total_paid > 0).length}</p><p className="text-xs text-slate-500">Fully Paid</p></div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200"><h3 className="font-semibold text-slate-800">Recent Orders</h3><button onClick={() => handleViewChange('orders')} className="text-xs text-primary hover:underline">View All →</button></div>
          {recentOrders.length === 0 ? <div className="p-8 text-center text-slate-400"><Package className="w-10 h-10 mx-auto mb-2 opacity-30" /><p className="text-sm">No recent orders</p></div> : (
            <div className="divide-y divide-slate-100">{recentOrders.map((order) => (<div key={order.name} className="px-5 py-3 hover:bg-slate-50"><div className="flex items-center justify-between"><div><p className="text-sm font-medium text-primary">{order.name}</p><p className="text-xs text-slate-400">{order.transaction_date}</p></div><div className="text-right"><p className="text-sm font-semibold text-slate-900">{formatCurrency(order.grand_total)}</p><p className="text-xs text-slate-500">{order.custom_base_reference_name || order.custom_base_reference}</p></div></div></div>))}</div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200"><h3 className="font-semibold text-slate-800">Recent Invoices</h3><button onClick={() => handleViewChange('invoices')} className="text-xs text-primary hover:underline">View All →</button></div>
          {recentInvoices.length === 0 ? <div className="p-8 text-center text-slate-400"><Receipt className="w-10 h-10 mx-auto mb-2 opacity-30" /><p className="text-sm">No recent invoices</p></div> : (
            <div className="divide-y divide-slate-100">{recentInvoices.map((invoice) => (<div key={invoice.name} className="px-5 py-3 hover:bg-slate-50"><div className="flex items-center justify-between"><div><p className="text-sm font-medium text-primary">{invoice.name}</p><p className="text-xs text-slate-400">{invoice.posting_date}</p></div><div className="text-right"><p className="text-sm font-semibold text-slate-900">{formatCurrency(invoice.grand_total)}</p><span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(invoice.status)}`}>{invoice.status}</span></div></div></div>))}</div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="font-semibold text-slate-800 mb-4">Payment Summary</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-green-50 rounded-lg p-4 text-center"><CreditCard className="w-6 h-6 text-green-600 mx-auto mb-2" /><p className="text-2xl font-bold text-green-600">{formatCurrency(invoiceSummary?.total_paid || 0)}</p><p className="text-xs text-green-700">Total Paid</p><p className="text-xs text-green-600 mt-1">{invoiceSummary?.paid.count || 0} invoices</p></div>
          <div className="bg-yellow-50 rounded-lg p-4 text-center"><Clock className="w-6 h-6 text-yellow-600 mx-auto mb-2" /><p className="text-2xl font-bold text-yellow-600">{formatCurrency(invoiceSummary?.unpaid.amount || 0)}</p><p className="text-xs text-yellow-700">Unpaid</p><p className="text-xs text-yellow-600 mt-1">{invoiceSummary?.unpaid.count || 0} invoices</p></div>
          <div className="bg-red-50 rounded-lg p-4 text-center"><AlertCircle className="w-6 h-6 text-red-600 mx-auto mb-2" /><p className="text-2xl font-bold text-red-600">{formatCurrency(invoiceSummary?.overdue.amount || 0)}</p><p className="text-xs text-red-700">Overdue</p><p className="text-xs text-red-600 mt-1">{invoiceSummary?.overdue.count || 0} invoices</p></div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="font-semibold text-slate-800 mb-4">Additional</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button
            type="button"
            onClick={() => setShowAdditionalModal(true)}
            className="border border-primary/30 rounded-lg p-4 text-left hover:bg-primary/5"
          >
            <p className="font-medium text-slate-900">Additional Collection Invoice</p>
            <p className="text-sm text-slate-600 mt-1">Collect payment at this cost center for treatment done elsewhere.</p>
          </button>
          <button
            type="button"
            onClick={() => setShowInternalModal(true)}
            className="border border-primary/30 rounded-lg p-4 text-left hover:bg-primary/5"
          >
            <p className="font-medium text-slate-900">Internal Employee Invoice</p>
            <p className="text-sm text-slate-600 mt-1">Invoice employee medicine/service usage and mark as internal.</p>
          </button>
        </div>
      </div>

      {showAdditionalModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-5xl max-h-[90vh] overflow-auto p-5 space-y-4">
            <h3 className="text-lg font-semibold">Create Additional Collection Invoice</h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <select className="border rounded px-2 py-2 text-sm" value={additionalForm.reference_type} onChange={(e) => setAdditionalForm((p) => ({ ...p, reference_type: e.target.value }))}>
                <option value="Patient Visit">Patient Visit</option>
                <option value="Inpatient Admission">Inpatient Admission</option>
              </select>
              <input className="border rounded px-2 py-2 text-sm" placeholder="Visit/Admission ID" value={additionalForm.reference_name} onChange={(e) => setAdditionalForm((p) => ({ ...p, reference_name: e.target.value }))} />
              <button type="button" onClick={loadRelatedOrders} className="px-3 py-2 bg-slate-100 rounded text-sm">{additionalLoadingOrders ? 'Loading...' : 'Fetch Related Sales Orders'}</button>
              <input className="border rounded px-2 py-2 text-sm" placeholder="Patient (optional)" value={additionalForm.patient} onChange={(e) => setAdditionalForm((p) => ({ ...p, patient: e.target.value }))} />
              <input className="border rounded px-2 py-2 text-sm" placeholder="Customer" value={additionalForm.customer} onChange={(e) => setAdditionalForm((p) => ({ ...p, customer: e.target.value }))} />
              <select className="border rounded px-2 py-2 text-sm" value={additionalForm.company} onChange={(e) => setAdditionalForm((p) => ({ ...p, company: e.target.value }))}>
                <option value="">Select Company</option>
                {companies.map((c) => <option key={c.name} value={c.name}>{c.label}</option>)}
              </select>
              <select className="border rounded px-2 py-2 text-sm" value={additionalForm.created_at_cost_center} onChange={(e) => setAdditionalForm((p) => ({ ...p, created_at_cost_center: e.target.value }))}>
                <option value="">Collection Cost Center</option>
                {costCenters.map((c) => <option key={c.name} value={c.name}>{c.label}</option>)}
              </select>
              <input type="date" className="border rounded px-2 py-2 text-sm" value={additionalForm.posting_date} onChange={(e) => setAdditionalForm((p) => ({ ...p, posting_date: e.target.value }))} />
            </div>

            <div className="border rounded p-3">
              <p className="text-sm font-medium mb-2">Related Sales Orders</p>
              {relatedOrders.length === 0 ? <p className="text-sm text-slate-500">No loaded sales orders.</p> : (
                <div className="space-y-2">
                  {relatedOrders.map((so) => (
                    <label key={so.name} className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <input type="checkbox" checked={selectedOrders.includes(so.name)} onChange={(e) => {
                          setSelectedOrders((prev) => e.target.checked ? [...prev, so.name] : prev.filter((x) => x !== so.name))
                        }} />
                        {so.name} ({so.status})
                      </span>
                      <span>{formatCurrency(so.grand_total)}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="border rounded p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium">Manual Items</p>
                <button type="button" className="text-xs text-primary" onClick={() => addItemRow(setAdditionalItems)}>+ Add Item</button>
              </div>
              <BillingItemsEditor items={additionalItems} onChange={setAdditionalItems} defaultCostCenter={additionalForm.created_at_cost_center} />
            </div>

            <div className="flex justify-end gap-2">
              <button type="button" className="px-3 py-2 rounded border" onClick={() => setShowAdditionalModal(false)}>Cancel</button>
              <button type="button" className="px-3 py-2 rounded bg-primary text-white" onClick={handleCreateAdditionalInvoice} disabled={additionalSaving}>
                {additionalSaving ? 'Creating...' : 'Create Invoice'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showInternalModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-4xl max-h-[90vh] overflow-auto p-5 space-y-4">
            <h3 className="text-lg font-semibold">Create Internal Employee Invoice</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <input list="employee-options" className="border rounded px-2 py-2 text-sm" placeholder="Employee Name" value={internalForm.employee_name} onChange={(e) => setInternalForm((p) => ({ ...p, employee_name: e.target.value }))} />
              <datalist id="employee-options">
                {employeeOptions.map((emp) => <option key={emp.name} value={emp.label} />)}
              </datalist>
              <select className="border rounded px-2 py-2 text-sm" value={internalForm.company} onChange={(e) => setInternalForm((p) => ({ ...p, company: e.target.value }))}>
                <option value="">Select Company</option>
                {companies.map((c) => <option key={c.name} value={c.name}>{c.label}</option>)}
              </select>
              <select className="border rounded px-2 py-2 text-sm" value={internalForm.created_at_cost_center} onChange={(e) => setInternalForm((p) => ({ ...p, created_at_cost_center: e.target.value }))}>
                <option value="">Collection Cost Center</option>
                {costCenters.map((c) => <option key={c.name} value={c.name}>{c.label}</option>)}
              </select>
            </div>
            <div className="border rounded p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium">Items (drugs/services)</p>
                <button type="button" className="text-xs text-primary" onClick={() => addItemRow(setInternalItems)}>+ Add Item</button>
              </div>
              <BillingItemsEditor items={internalItems} onChange={setInternalItems} defaultCostCenter={internalForm.created_at_cost_center} />
            </div>
            <div className="text-xs text-slate-500">This flow automatically sets <strong>custom_internal_employee</strong> on the invoice.</div>
            <div className="flex justify-end gap-2">
              <button type="button" className="px-3 py-2 rounded border" onClick={() => setShowInternalModal(false)}>Cancel</button>
              <button type="button" className="px-3 py-2 rounded bg-primary text-white" onClick={handleCreateInternalInvoice} disabled={internalSaving}>
                {internalSaving ? 'Creating...' : 'Create Internal Invoice'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modals - always present in Overview too */}
      <SharedModals />
    </div>
  )
}
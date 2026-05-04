// components/billing/BillingDashboard.tsx
import { useState, useEffect } from 'react'

import { 
  fetchServiceOrders, 
  fetchServiceInvoices,
  fetchServiceOrderSummary,
  fetchInvoiceSummary,
  fetchInpatientBalances,
  fetchOutpatientBalances,
  fetchBillingCostCenterScope,
  fetchPatientBillingCostCenterBreakdown,
  getInvoicesByReference,
  getInvoiceDetails,
  type ServiceOrder,
  type ServiceInvoice,
  type OrderSummary,
  type InvoiceSummary,
  type InpatientBalance,
  type OutpatientBalance,
  type PatientBillingCcRow,
} from '../../services/serviceOrders'
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
import { useFormatMoney } from '../../hooks/useFormatMoney'

import { ServiceOrdersList } from './ServiceOrdersList'
import { ServiceInvoicesList } from './ServiceInvoicesList'
import { PaymentModal } from './PaymentModal'
import { SpecialtySalesInvoiceSlideOver } from './SpecialtySalesInvoiceSlideOver'
import { PrintFormatDropdown } from '../ui/PrintFormatDropdown'

type DashboardView = 'overview' | 'orders' | 'invoices' | 'inpatient' | 'outpatient' | 'unpaid' | 'paid'

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
  const formatCurrency = useFormatMoney()

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
  const [salesInvoiceDetailName, setSalesInvoiceDetailName] = useState<string | null>(null)
  const [invoiceListRefreshKey, setInvoiceListRefreshKey] = useState(0)
  const [billingCcRestricted, setBillingCcRestricted] = useState<boolean | null>(null)
  const [ccBreakdown, setCcBreakdown] = useState<PatientBillingCcRow[]>([])

  const effectivePatient = patient ?? selectedPatient
  const effectiveReferenceType = mode === 'IP' ? 'Inpatient Admission' : 'Patient Visit'
  const effectiveReferenceName = mode === 'IP' ? (admission ?? activeAdmission) : (visit ?? activeVisit)

  // Save view to localStorage
  const handleViewChange = (view: DashboardView) => {
    setCurrentView(view)
    localStorage.setItem('billingDashboardView', view)
  }

  /** Open the Sales Invoice slide-over (latest known invoice or first match for this visit/admission). */
  const openInvoiceForHealthcareReference = async (
    referenceId: string,
    referenceType: 'Inpatient Admission' | 'Patient Visit',
    preferredInvoiceName?: string | null
  ) => {
    try {
      setLoadingInvoices(referenceId)
      if (preferredInvoiceName) {
        setSalesInvoiceDetailName(preferredInvoiceName)
        return
      }
      const invoices = await getInvoicesByReference(
        referenceId,
        referenceType,
        effectivePatient || undefined
      )
      if (invoices.length === 0) {
        toast.error('No invoices found for this admission/visit')
        return
      }
      setSalesInvoiceDetailName(invoices[0].name)
    } catch (error) {
      console.error('Error loading invoices:', error)
      toast.error('Failed to open invoice')
    } finally {
      setLoadingInvoices(null)
    }
  }

  // Handle make payment - fetch invoice details for company and cost center
const handleMakePayment = async (
  referenceId: string,
  customerName: string,
  outstandingAmount: number,
  referenceType: string,
  /** Restrict invoice lookup to this patient (row’s patient); avoids empty results when context patient differs. */
  patientIdForInvoices?: string
) => {
  try {
    setLoadingInvoices(referenceId)
    const invoices = await getInvoicesByReference(
      referenceId,
      referenceType,
      patientIdForInvoices || undefined
    )
    
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
    toast.error(
      error instanceof Error ? error.message : 'Failed to load invoice details for payment'
    )
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

  const notifyInvoiceDataChanged = () => {
    setInvoiceListRefreshKey((k) => k + 1)
    handlePaymentSuccess()
  }

  const loadDashboardData = async () => {
    if (!effectivePatient && !effectiveReferenceName) {
      setOrderSummary(null)
      setInvoiceSummary(null)
      setRecentOrders([])
      setRecentInvoices([])
      setBillingCcRestricted(null)
      setCcBreakdown([])
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      const [ordersSummary, invSummary, recentOrdersData, recentInvoicesData] = await Promise.all([
        fetchServiceOrderSummary(effectiveReferenceType, effectiveReferenceName, effectivePatient),
        fetchInvoiceSummary(effectiveReferenceType, effectiveReferenceName, effectivePatient),
        fetchServiceOrders(effectiveReferenceType, effectiveReferenceName, effectivePatient, undefined),
        fetchServiceInvoices(effectiveReferenceType, effectiveReferenceName, effectivePatient, undefined),
      ])

      setOrderSummary(ordersSummary)
      setInvoiceSummary(invSummary)
      setRecentOrders(recentOrdersData)
      setRecentInvoices(recentInvoicesData)

      try {
        const [ccScope, ccBreakdownRes] = await Promise.all([
          fetchBillingCostCenterScope(),
          fetchPatientBillingCostCenterBreakdown(
            effectiveReferenceType,
            effectiveReferenceName,
            effectivePatient
          ),
        ])
        setBillingCcRestricted(!!ccScope.restricted)
        setCcBreakdown(ccBreakdownRes.restricted ? [] : ccBreakdownRes.rows || [])
      } catch {
        setBillingCcRestricted(null)
        setCcBreakdown([])
      }
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
          label="Medication/Services/LabTest"
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
        onPaymentSuccess={() => {
          setInvoiceListRefreshKey((k) => k + 1)
          handlePaymentSuccess()
        }}
      />

      <SpecialtySalesInvoiceSlideOver
        invoiceName={salesInvoiceDetailName}
        onClose={() => setSalesInvoiceDetailName(null)}
        onUpdated={notifyInvoiceDataChanged}
      />
    </>
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
          onOpenInvoiceDetail={(name) => setSalesInvoiceDetailName(name)}
          invoiceRefreshKey={invoiceListRefreshKey}
          onAfterInvoiceMutation={notifyInvoiceDataChanged}
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
          onOpenInvoiceDetail={(name) => setSalesInvoiceDetailName(name)}
          invoiceRefreshKey={invoiceListRefreshKey}
          onAfterInvoiceMutation={notifyInvoiceDataChanged}
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
          onOpenInvoiceDetail={(name) => setSalesInvoiceDetailName(name)}
          invoiceRefreshKey={invoiceListRefreshKey}
          onAfterInvoiceMutation={notifyInvoiceDataChanged}
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
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
                        <div><p className="text-xs text-slate-400">Admission ID</p><p className="text-slate-700 font-mono text-xs">{balance.admission_id}</p></div>
                        <div><p className="text-xs text-slate-400">Admission Date</p><p className="text-slate-700">{balance.admission_date}</p></div>
                        <div><p className="text-xs text-slate-400">Cost Center</p><p className="text-slate-700">{balance.cost_center || '—'}</p></div>
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
                  <div className="flex flex-wrap items-center gap-2 mt-4 pt-3 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() =>
                        void openInvoiceForHealthcareReference(
                          balance.admission_id,
                          'Inpatient Admission',
                          balance.latest_invoice_name
                        )
                      }
                      disabled={isLoading}
                      className="text-xs text-primary hover:underline flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Open invoice details (slide-over)"
                    >
                      {isLoading ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Receipt className="w-3 h-3" />
                      )}
                      View invoice
                    </button>
                    {balance.latest_invoice_name ? (
                      <PrintFormatDropdown
                        doctype="Sales Invoice"
                        docName={balance.latest_invoice_name}
                        noLetterhead={0}
                        triggerPrint={1}
                        className="inline-flex items-center justify-center rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                      />
                    ) : null}
                    {balance.outstanding_amount > 0 && (
  <button 
    onClick={() =>
      handleMakePayment(
        balance.admission_id,
        balance.patient_name,
        balance.outstanding_amount,
        'Inpatient Admission',
        balance.patient_id
      )
    }
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
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
                        <div><p className="text-xs text-slate-400">Visit ID</p><p className="text-slate-700 font-mono text-xs">{balance.visit_id}</p></div>
                        <div><p className="text-xs text-slate-400">Visit Date</p><p className="text-slate-700">{balance.visit_date}</p></div>
                        <div><p className="text-xs text-slate-400">Practitioner</p><p className="text-slate-700">{balance.practitioner || '—'}</p></div>
                        <div><p className="text-xs text-slate-400">Cost Center</p><p className="text-slate-700">{balance.cost_center || '—'}</p></div>
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
                  <div className="flex flex-wrap items-center gap-2 mt-4 pt-3 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() =>
                        void openInvoiceForHealthcareReference(
                          balance.visit_id,
                          'Patient Visit',
                          balance.latest_invoice_name
                        )
                      }
                      disabled={isLoading}
                      className="text-xs text-primary hover:underline flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Open invoice details (slide-over)"
                    >
                      {isLoading ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Receipt className="w-3 h-3" />
                      )}
                      View invoice
                    </button>
                    {balance.latest_invoice_name ? (
                      <PrintFormatDropdown
                        doctype="Sales Invoice"
                        docName={balance.latest_invoice_name}
                        noLetterhead={0}
                        triggerPrint={1}
                        className="inline-flex items-center justify-center rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                      />
                    ) : null}
                    {balance.outstanding_amount > 0 && (
  <button 
    onClick={() =>
      handleMakePayment(
        balance.visit_id,
        balance.patient_name,
        balance.outstanding_amount,
        'Patient Visit',
        balance.patient_id
      )
    }
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
  const showCcBreakdown =
    !!(effectivePatient || effectiveReferenceName) &&
    billingCcRestricted === false &&
    ccBreakdown.length > 0

  return (
    <div className="space-y-6">
      <NavigationRow />

      {billingCcRestricted === true && (effectivePatient || effectiveReferenceName) && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Billing lists and totals are limited to your assigned cost center (Settings → Cost Center Filter). To see all
          branches, clear that filter or ask an administrator.
        </div>
      )}

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

      {showCcBreakdown && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200">
            <h3 className="font-semibold text-slate-800">Charges by Branch</h3>
            <p className="text-xs text-slate-500 mt-1">
              For the selected patient{effectiveReferenceName ? ` · ${effectiveReferenceType}: ${effectiveReferenceName}` : ''}. Shown when your account is not restricted to a single cost center.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-600 uppercase">Branch</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-600 uppercase">Service orders</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-600 uppercase">Orders amount</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-600 uppercase">Invoices</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-600 uppercase">Invoiced total</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-600 uppercase">Outstanding</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ccBreakdown.map((row) => (
                  <tr key={row.cost_center || '__none__'} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 text-slate-800 font-medium">{row.cost_center_name}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">{row.sales_orders}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">{formatCurrency(row.orders_amount)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">{row.invoices}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">{formatCurrency(row.invoices_grand_total)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-medium text-slate-900">{formatCurrency(row.outstanding)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

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
            <div className="divide-y divide-slate-100">
              {recentOrders.map((order) => (
                <div key={order.name} className="px-5 py-3 hover:bg-slate-50">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-primary">{order.name}</p>
                      <p className="text-xs text-slate-400">{order.transaction_date}</p>
                      {(order.cost_center_name || order.cost_center) && (
                        <p
                          className="text-[11px] text-slate-500 mt-0.5 truncate"
                          title={order.cost_center_name || order.cost_center || undefined}
                        >
                          CC: {order.cost_center_name || order.cost_center}
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold text-slate-900">{formatCurrency(order.grand_total)}</p>
                      <p className="text-xs text-slate-500 truncate max-w-[140px] ml-auto">
                        {order.custom_base_reference_name || order.custom_base_reference}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200"><h3 className="font-semibold text-slate-800">Recent Invoices</h3><button onClick={() => handleViewChange('invoices')} className="text-xs text-primary hover:underline">View All →</button></div>
          {recentInvoices.length === 0 ? <div className="p-8 text-center text-slate-400"><Receipt className="w-10 h-10 mx-auto mb-2 opacity-30" /><p className="text-sm">No recent invoices</p></div> : (
            <div className="divide-y divide-slate-100">
              {recentInvoices.map((invoice) => (
                <div key={invoice.name} className="px-5 py-3 hover:bg-slate-50">
                  <div className="flex items-center justify-between">
                    <div>
                      <button
                        type="button"
                        onClick={() => setSalesInvoiceDetailName(invoice.name)}
                        className="font-mono text-[11px] font-medium text-primary hover:underline text-left"
                      >
                        {invoice.name}
                      </button>
                      <p className="text-xs text-slate-400">{invoice.posting_date}</p>
                      {(invoice.cost_center_name || invoice.cost_center || invoice.custom_created_at) && (
                        <p className="text-[11px] text-slate-500 mt-0.5 truncate" title={invoice.cost_center_name || invoice.cost_center || invoice.custom_created_at || ''}>
                          CC: {invoice.cost_center_name || invoice.cost_center || invoice.custom_created_at}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-slate-900">{formatCurrency(invoice.grand_total)}</p>
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(invoice.status)}`}>
                        {invoice.status}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
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

      <SharedModals />
    </div>
  )
}
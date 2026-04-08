// components/billing/BillingDashboard.tsx
import { useState, useEffect } from 'react'

import { 
  fetchServiceOrders, 
  fetchServiceInvoices,
  fetchServiceOrderSummary,
  fetchInvoiceSummary,
  type ServiceOrder,
  type ServiceInvoice,
  type OrderSummary,
  type InvoiceSummary
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
  FileText as FileIcon
} from 'lucide-react'
import { toast } from '../../hooks/useToast'

import { ServiceOrdersList } from './ServiceOrdersList'
import { ServiceInvoicesList } from './ServiceInvoicesList'

type DashboardView = 'overview' | 'orders' | 'invoices' | 'unpaid' | 'paid'

// Helper function for currency formatting
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(amount)
}

// Navigation Button Component - Smaller and unique
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

interface BillingDashboardProps {
  patient?: string
  admission?: string
  visit?: string
}

export const BillingDashboard = ({ patient, admission, visit }: BillingDashboardProps) => {
  const { mode, activeAdmission, activeVisit, selectedPatient } = useCareContext()
  
  // Load saved view from localStorage on initial render
  const getSavedView = (): DashboardView => {
    const saved = localStorage.getItem('billingDashboardView')
    if (saved === 'overview' || saved === 'orders' || saved === 'invoices' || saved === 'unpaid' || saved === 'paid') {
      return saved as DashboardView
    }
    return 'overview'
  }

  const [currentView, setCurrentView] = useState<DashboardView>(getSavedView)
  const [orderSummary, setOrderSummary] = useState<OrderSummary | null>(null)
  const [invoiceSummary, setInvoiceSummary] = useState<InvoiceSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [recentOrders, setRecentOrders] = useState<ServiceOrder[]>([])
  const [recentInvoices, setRecentInvoices] = useState<ServiceInvoice[]>([])

  const effectivePatient = patient ?? selectedPatient
  const effectiveReferenceType = mode === 'IP' ? 'Inpatient Admission' : 'Patient Visit'
  const effectiveReferenceName = mode === 'IP' ? (admission ?? activeAdmission) : (visit ?? activeVisit)

  // Save view to localStorage whenever it changes
  const handleViewChange = (view: DashboardView) => {
    setCurrentView(view)
    localStorage.setItem('billingDashboardView', view)
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

  useEffect(() => {
    loadDashboardData()
  }, [effectivePatient, effectiveReferenceName])

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Paid': return 'text-green-600 bg-green-50'
      case 'Unpaid': return 'text-yellow-600 bg-yellow-50'
      case 'Overdue': return 'text-red-600 bg-red-50'
      case 'Partially Paid': return 'text-blue-600 bg-blue-50'
      default: return 'text-gray-600 bg-gray-50'
    }
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

  // Main Navigation Row - Smaller buttons
  const NavigationRow = () => {
    const totalOrders = orderSummary?.total_orders || 0
    const totalInvoices = invoiceSummary?.total_invoices || 0

    return (
      <div className="flex gap-3 mb-6">
        <NavButton
          icon={LayoutDashboard}
          label="All"
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
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-slate-500">Loading dashboard...</div>
      </div>
    )
  }

  // Different views
  if (currentView === 'orders') {
    return (
      <div className="space-y-4">
        <NavigationRow />
        <ServiceOrdersList 
          patient={effectivePatient}
          admission={effectiveReferenceName}
          visit={effectiveReferenceType === 'Patient Visit' ? effectiveReferenceName : undefined}
        />
      </div>
    )
  }

  if (currentView === 'invoices') {
    return (
      <div className="space-y-4">
        <NavigationRow />
        <ServiceInvoicesList 
          patient={effectivePatient}
          admission={effectiveReferenceName}
          visit={effectiveReferenceType === 'Patient Visit' ? effectiveReferenceName : undefined}
        />
      </div>
    )
  }

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
      </div>
    )
  }

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
      </div>
    )
  }

  // Overview Dashboard
  return (
    <div className="space-y-6">
      {/* Navigation Row - Small Buttons */}
      <NavigationRow />

      {/* Main Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        <StatCard
          title="Total Orders"
          value={orderSummary?.total_orders || 0}
          subValue={`${formatCurrency(orderSummary?.total_amount || 0)} total value`}
          icon={Package}
          color="bg-blue-50 text-blue-600"
          onClick={() => handleViewChange('orders')}
        />
        <StatCard
          title="Total Invoices"
          value={invoiceSummary?.total_invoices || 0}
          subValue={`${formatCurrency(invoiceSummary?.total_amount || 0)} total value`}
          icon={Receipt}
          color="bg-purple-50 text-purple-600"
          onClick={() => handleViewChange('invoices')}
        />
        <StatCard
          title="Paid Amount"
          value={formatCurrency(invoiceSummary?.total_paid || 0)}
          subValue={`${invoiceSummary?.paid.count || 0} invoices paid`}
          icon={CheckCircle}
          color="bg-green-50 text-green-600"
          onClick={() => handleViewChange('paid')}
        />
        <StatCard
          title="Outstanding"
          value={formatCurrency(invoiceSummary?.total_outstanding || 0)}
          subValue={`${(invoiceSummary?.unpaid.count || 0) + (invoiceSummary?.overdue.count || 0)} invoices pending`}
          icon={AlertCircle}
          color="bg-red-50 text-red-600"
          onClick={() => handleViewChange('unpaid')}
        />
      </div>

      {/* Quick Actions Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-md font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <Package className="w-4 h-4 text-primary" />
            Order Summary
          </h3>
          <div className="space-y-3">
            <QuickActionCard
              title="Not Invoiced"
              count={orderSummary?.not_invoiced.count || 0}
              amount={orderSummary?.not_invoiced.amount || 0}
              icon={Clock}
              color="bg-yellow-50 text-yellow-600"
              onClick={() => handleViewChange('orders')}
            />
            <QuickActionCard
              title="Invoiced (Paid)"
              count={orderSummary?.invoiced.count || 0}
              amount={orderSummary?.invoiced.amount || 0}
              icon={CheckCircle}
              color="bg-green-50 text-green-600"
              onClick={() => handleViewChange('paid')}
            />
            <QuickActionCard
              title="Partially Invoiced"
              count={orderSummary?.partially_invoiced.count || 0}
              amount={orderSummary?.partially_invoiced.amount || 0}
              icon={AlertCircle}
              color="bg-orange-50 text-orange-600"
              onClick={() => handleViewChange('invoices')}
            />
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-md font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <Receipt className="w-4 h-4 text-primary" />
            Invoice Summary
          </h3>
          <div className="space-y-3">
            <QuickActionCard
              title="Paid Invoices"
              count={invoiceSummary?.paid.count || 0}
              amount={invoiceSummary?.paid.amount || 0}
              icon={CheckCircle}
              color="bg-green-50 text-green-600"
              onClick={() => handleViewChange('paid')}
            />
            <QuickActionCard
              title="Unpaid/Overdue"
              count={(invoiceSummary?.unpaid.count || 0) + (invoiceSummary?.overdue.count || 0)}
              amount={(invoiceSummary?.unpaid.amount || 0) + (invoiceSummary?.overdue.amount || 0)}
              icon={AlertCircle}
              color="bg-red-50 text-red-600"
              onClick={() => handleViewChange('unpaid')}
            />
            <QuickActionCard
              title="Partially Paid"
              count={invoiceSummary?.partially_paid.count || 0}
              amount={invoiceSummary?.partially_paid.amount || 0}
              icon={TrendingUp}
              color="bg-blue-50 text-blue-600"
              onClick={() => handleViewChange('invoices')}
            />
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Recent Orders */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
            <h3 className="font-semibold text-slate-800">Recent Orders</h3>
            <button
              onClick={() => handleViewChange('orders')}
              className="text-xs text-primary hover:underline"
            >
              View All →
            </button>
          </div>
          {recentOrders.length === 0 ? (
            <div className="p-8 text-center text-slate-400">
              <Package className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No recent orders</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {recentOrders.map((order) => (
                <div key={order.name} className="px-5 py-3 hover:bg-slate-50">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-primary">{order.name}</p>
                      <p className="text-xs text-slate-400">{order.transaction_date}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-slate-900">{formatCurrency(order.grand_total)}</p>
                      <p className="text-xs text-slate-500">{order.custom_base_reference_name || order.custom_base_reference}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Invoices */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
            <h3 className="font-semibold text-slate-800">Recent Invoices</h3>
            <button
              onClick={() => handleViewChange('invoices')}
              className="text-xs text-primary hover:underline"
            >
              View All →
            </button>
          </div>
          {recentInvoices.length === 0 ? (
            <div className="p-8 text-center text-slate-400">
              <Receipt className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No recent invoices</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {recentInvoices.map((invoice) => (
                <div key={invoice.name} className="px-5 py-3 hover:bg-slate-50">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-primary">{invoice.name}</p>
                      <p className="text-xs text-slate-400">{invoice.posting_date}</p>
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

      {/* Payment Summary Chart Section */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="font-semibold text-slate-800 mb-4">Payment Summary</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-green-50 rounded-lg p-4 text-center">
            <CreditCard className="w-6 h-6 text-green-600 mx-auto mb-2" />
            <p className="text-2xl font-bold text-green-600">{formatCurrency(invoiceSummary?.total_paid || 0)}</p>
            <p className="text-xs text-green-700">Total Paid</p>
            <p className="text-xs text-green-600 mt-1">{invoiceSummary?.paid.count || 0} invoices</p>
          </div>
          <div className="bg-yellow-50 rounded-lg p-4 text-center">
            <Clock className="w-6 h-6 text-yellow-600 mx-auto mb-2" />
            <p className="text-2xl font-bold text-yellow-600">{formatCurrency(invoiceSummary?.unpaid.amount || 0)}</p>
            <p className="text-xs text-yellow-700">Unpaid</p>
            <p className="text-xs text-yellow-600 mt-1">{invoiceSummary?.unpaid.count || 0} invoices</p>
          </div>
          <div className="bg-red-50 rounded-lg p-4 text-center">
            <AlertCircle className="w-6 h-6 text-red-600 mx-auto mb-2" />
            <p className="text-2xl font-bold text-red-600">{formatCurrency(invoiceSummary?.overdue.amount || 0)}</p>
            <p className="text-xs text-red-700">Overdue</p>
            <p className="text-xs text-red-600 mt-1">{invoiceSummary?.overdue.count || 0} invoices</p>
          </div>
        </div>
      </div>
    </div>
  )
}
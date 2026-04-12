// NursingInventoryDashboard.tsx
import { useState, useEffect } from 'react'
import { useCareContext } from '../../providers/CareContextProvider'
import { StockLedgerTab } from './tabs/StockLedgerTab'
import { MaterialRequestTab } from './tabs/MaterialRequestTab'
import { StockReconciliationTab } from './tabs/StockReconciliationTab'
import { MaterialReceiptTab } from './tabs/MaterialReceiptTab'
import { toast } from '../../hooks/useToast'

interface NursingInventoryDashboardProps {
  initialTab?: 'stock-ledger' | 'material-request' | 'stock-reconciliation' | 'material-receipt'
}

type TabId = 'stock-ledger' | 'material-request' | 'stock-reconciliation' | 'material-receipt'

interface TabConfig {
  id: TabId
  label: string
  icon: React.ReactNode
}

export const NursingInventoryDashboard = ({ initialTab = 'stock-ledger' }: NursingInventoryDashboardProps) => {
  const { userCostCenter, userRole } = useCareContext()
  const [activeTab, setActiveTab] = useState<TabId>(initialTab)
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  const tabs: TabConfig[] = [
    {
      id: 'stock-ledger',
      label: 'Stock Ledger',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      )
    },
    {
      id: 'material-request',
      label: 'Material Request',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
      )
    },
    {
      id: 'stock-reconciliation',
      label: 'Stock Reconciliation',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
        </svg>
      )
    },
    {
      id: 'material-receipt',
      label: 'Material Receipt',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
      )
    }
  ]

  const refresh = () => setRefreshTrigger(prev => prev + 1)

  const renderTabContent = () => {
    switch (activeTab) {
      case 'stock-ledger':
        return <StockLedgerTab refreshTrigger={refreshTrigger} />
      case 'material-request':
        return <MaterialRequestTab onSuccess={refresh} />
      case 'stock-reconciliation':
        return <StockReconciliationTab onSuccess={refresh} />
      case 'material-receipt':
        return <MaterialReceiptTab onSuccess={refresh} />
      default:
        return null
    }
  }

  return (
    <div className="h-full flex flex-col bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Nursing Inventory</h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage stock, requests, and receipts for cost center: 
            <span className="font-medium text-slate-700 ml-1">
              {userCostCenter || 'Not assigned'}
            </span>
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-slate-200 px-6 flex-shrink-0">
        <div className="flex space-x-6">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                flex items-center gap-2 px-1 py-3 border-b-2 text-sm font-medium transition-colors
                ${activeTab === tab.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
                }
              `}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {renderTabContent()}
      </div>
    </div>
  )
}
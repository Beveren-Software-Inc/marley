// NursingInventoryDashboard.tsx
import { useState, useEffect } from 'react'
import { useCareContext } from '../../providers/CareContextProvider'
import { StockLedgerTab } from './StockLedgerTab'
import { MaterialRequestTab } from './MaterialRequestTab'
import { StockReconciliationTab } from './StockReconciliationTab'
import { MaterialReceiptTab } from './MaterialReceiptTab'
import { StockTransferTab } from './StockTransferTab'
import { CreateMaterialRequestModal } from './CreateMaterialRequest'
import { CreateStockReconciliationModal } from './CreateStockReconciliation'
import { CreateMaterialReceiptModal } from './CreateMaterialReceipt'
import { CreateStockTransferModal } from './CreateStockTransfer'
import { getAllCostCenters } from '../../services/nursingInventory'
import {
  MiniWarehouseInventoryProvider,
  type WarehouseContext,
  useMiniWarehouseContext,
} from './MiniWarehouseInventoryContext'

type InventoryTab =
  | 'all'
  | 'stock-ledger'
  | 'material-request'
  | 'stock-reconciliation'
  | 'material-receipt'
  | 'stock-transfer'

interface CardDef {
  id: InventoryTab
  title: string
  desc: string
  color: string
  dot: string
  onAdd?: () => void
}

export function NursingInventoryDashboard({
  warehouseContext = 'nurse',
}: {
  warehouseContext?: WarehouseContext
}) {
  return (
    <MiniWarehouseInventoryProvider value={warehouseContext}>
      <NursingInventoryDashboardInner />
    </MiniWarehouseInventoryProvider>
  )
}

function NursingInventoryDashboardInner() {
  const warehouseContext = useMiniWarehouseContext()
  const moduleLabel = warehouseContext === 'laboratory' ? 'Laboratory' : 'Nursing'
  const { userCostCenter, userRole } = useCareContext()
  const [activeTab, setActiveTab] = useState<InventoryTab>('stock-ledger')
  const [availableCostCenters, setAvailableCostCenters] = useState<{ name: string; label: string }[]>([])
  const [selectedCostCenter, setSelectedCostCenter] = useState('')
  const [loadingCostCenters, setLoadingCostCenters] = useState(false)

  // Check if user has full access (System Manager, Administrator, or no branch restriction)
  const hasFullAccess = () => {
    const roles = userRole || []
    const fullAccessRoles = ['System Manager', 'Administrator', 'Accounts Manager', 'Stock Manager']
    return roles.some((role: string) => fullAccessRoles.includes(role)) || !userCostCenter
  }

  const isFullAccess = hasFullAccess()

  // Modal states
  const [showMaterialRequestModal, setShowMaterialRequestModal] = useState(false)
  const [showStockReconciliationModal, setShowStockReconciliationModal] = useState(false)
  const [showMaterialReceiptModal, setShowMaterialReceiptModal] = useState(false)
  const [showStockTransferModal, setShowStockTransferModal] = useState(false)
  
  // Refresh keys
  const [materialRequestRefreshKey, setMaterialRequestRefreshKey] = useState(0)
  const [stockReconciliationRefreshKey, setStockReconciliationRefreshKey] = useState(0)
  const [materialReceiptRefreshKey, setMaterialReceiptRefreshKey] = useState(0)
  const [stockTransferRefreshKey, setStockTransferRefreshKey] = useState(0)

  // Load all branches for users with full access
  useEffect(() => {
    if (isFullAccess && !userCostCenter) {
      loadAllCostCenters()
    }
  }, [isFullAccess, userCostCenter, warehouseContext])

  const loadAllCostCenters = async () => {
    setLoadingCostCenters(true)
    try {
      const costCenters = await getAllCostCenters(warehouseContext)
      setAvailableCostCenters(costCenters)
      if (costCenters.length > 0 && !selectedCostCenter) {
        setSelectedCostCenter(costCenters[0].name)
      }
    } catch (error) {
      console.error('Failed to load branches:', error)
    } finally {
      setLoadingCostCenters(false)
    }
  }

  // Get the effective branch (selected one for full access, or user's assigned one)
  const effectiveCostCenter = isFullAccess ? selectedCostCenter : userCostCenter

  const CARDS: CardDef[] = [
    { 
      id: 'stock-ledger', 
      title: 'Stock Ledger', 
      desc: 'Current inventory levels & stock value', 
      color: 'bg-emerald-50 text-emerald-700 border-emerald-200', 
      dot: 'bg-emerald-500'
    },
    { 
      id: 'material-request', 
      title: 'Material Request', 
      desc: 'Request materials from stores', 
      color: 'bg-blue-50 text-blue-700 border-blue-200', 
      dot: 'bg-blue-500',
      onAdd: () => setShowMaterialRequestModal(true)
    },
    { 
      id: 'stock-reconciliation', 
      title: 'Stock Reconciliation', 
      desc: 'Physical count & stock adjustment', 
      color: 'bg-amber-50 text-amber-700 border-amber-200', 
      dot: 'bg-amber-500',
      onAdd: () => setShowStockReconciliationModal(true)
    },
    { 
      id: 'material-receipt', 
      title: 'Material Receipt', 
      desc: 'Receive materials from suppliers', 
      color: 'bg-purple-50 text-purple-700 border-purple-200', 
      dot: 'bg-purple-500',
      onAdd: () => setShowMaterialReceiptModal(true)
    },
    { 
      id: 'stock-transfer', 
      title: 'Stock Transfer', 
      desc: 'Move stock to another warehouse', 
      color: 'bg-rose-50 text-rose-700 border-rose-200', 
      dot: 'bg-rose-500',
      onAdd: () => setShowStockTransferModal(true)
    },
  ]

  const activeCard = CARDS.find(c => c.id === activeTab)!

  const sectionContent = (id: InventoryTab) => {
    switch (id) {
      case 'stock-ledger':
        return <StockLedgerTab costCenter={effectiveCostCenter} isFullAccess={isFullAccess} />
      case 'material-request':
        return <MaterialRequestTab onSuccess={() => setMaterialRequestRefreshKey(prev => prev + 1)} refreshKey={materialRequestRefreshKey} costCenter={effectiveCostCenter} isFullAccess={isFullAccess} />
      case 'stock-reconciliation':
        return <StockReconciliationTab onSuccess={() => setStockReconciliationRefreshKey(prev => prev + 1)} refreshKey={stockReconciliationRefreshKey} costCenter={effectiveCostCenter} isFullAccess={isFullAccess} />
      case 'material-receipt':
        return <MaterialReceiptTab onSuccess={() => setMaterialReceiptRefreshKey(prev => prev + 1)} refreshKey={materialReceiptRefreshKey} costCenter={effectiveCostCenter} isFullAccess={isFullAccess} />
      case 'stock-transfer':
        return <StockTransferTab onSuccess={() => setStockTransferRefreshKey(prev => prev + 1)} refreshKey={stockTransferRefreshKey} costCenter={effectiveCostCenter} isFullAccess={isFullAccess} />
      default:
        return null
    }
  }

  // Show branch selector for users with full access
  const renderCostCenterSelector = () => {
    if (!isFullAccess) return null

    return (
      <div className="bg-white border border-slate-200 rounded-lg p-4 mb-4">
        <div className="flex items-center gap-4">
          <label className="text-sm font-semibold text-slate-700">Branch:</label>
          {loadingCostCenters ? (
            <div className="flex items-center gap-2">
              <div className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
              <span className="text-sm text-slate-500">Loading...</span>
            </div>
          ) : (
            <select
              value={selectedCostCenter}
              onChange={(e) => setSelectedCostCenter(e.target.value)}
              className="px-3 py-1.5 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
            >
              {availableCostCenters.map(cc => (
                <option key={cc.name} value={cc.name}>{cc.label || cc.name}</option>
              ))}
            </select>
          )}
          <span className="text-xs text-slate-400 ml-auto">
            You have full access to all branches
          </span>
        </div>
      </div>
    )
  }

  // Show warning for users with restricted access but no branch
  if (!isFullAccess && !userCostCenter) {
    return (
      <div className="space-y-4">
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-6 text-center">
          <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-amber-800 mb-2">No Branch Assigned</h3>
          <p className="text-sm text-amber-700">
            Please contact your administrator to assign a branch to your user account.
            <br />
            You need a branch to access the {moduleLabel} Inventory module.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Cost Center Selector for Full Access Users */}
      {renderCostCenterSelector()}

      {/* ── Nav cards ── */}
      <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-5 gap-1.5">
        {CARDS.map(card => {
          const isActive = activeTab === card.id
          return (
            <div key={card.id} className="relative">
              <button
                type="button"
                onClick={() => setActiveTab(card.id)}
                className={`w-full flex flex-col items-center justify-center gap-1 rounded-lg border px-1.5 py-2 text-center transition-all hover:shadow-sm ${
                  isActive 
                    ? `${card.color} shadow-sm` 
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${isActive ? card.dot : 'bg-slate-300'}`} />
                <span className="text-[10px] font-medium leading-tight sm:text-[11px]">{card.title}</span>
              </button>
              {card.onAdd && isActive && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    card.onAdd?.()
                  }}
                  className="absolute top-1 right-1 w-5 h-5 rounded-full bg-white/80 hover:bg-white text-slate-700 flex items-center justify-center text-xs font-bold transition-colors shadow-sm"
                  title={`Add ${card.title}`}
                >+</button>
              )}
            </div>
          )
        })}
      </div>

      {/* ── Content panel ── */}
      <section className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
        <div className={`flex items-center justify-between px-3 py-2 border-b border-slate-100 ${activeCard.color} border-0`}>
          <div className="flex items-center gap-2 min-w-0">
            <span className={`w-2 h-2 rounded-full shrink-0 ${activeCard.dot}`} />
            <div className="min-w-0">
              <p className="text-xs font-semibold truncate">{activeCard.title}</p>
              <p className="text-[10px] opacity-75 mt-0.5 truncate hidden sm:block">{activeCard.desc}</p>
            </div>
          </div>
          {activeCard.onAdd && (
            <button
              onClick={activeCard.onAdd}
              className="w-6 h-6 rounded-full bg-white/70 hover:bg-white text-slate-700 flex items-center justify-center text-xs font-bold transition-colors shrink-0"
              title={`Add ${activeCard.title}`}
            >+</button>
          )}
        </div>
        <div className="p-4 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 320px)', scrollbarWidth: 'thin' }}>
          {sectionContent(activeTab)}
        </div>
      </section>

      {/* ── Modals ── */}
      {showMaterialRequestModal && (
        <CreateMaterialRequestModal
          onClose={() => setShowMaterialRequestModal(false)}
          onSuccess={() => {
            setMaterialRequestRefreshKey(prev => prev + 1)
            setShowMaterialRequestModal(false)
          }}
          costCenter={effectiveCostCenter}
          isFullAccess={isFullAccess}
        />
      )}

      {showStockReconciliationModal && (
        <CreateStockReconciliationModal
          onClose={() => setShowStockReconciliationModal(false)}
          onSuccess={() => {
            setStockReconciliationRefreshKey(prev => prev + 1)
            setShowStockReconciliationModal(false)
          }}
          costCenter={effectiveCostCenter}
          isFullAccess={isFullAccess}
        />
      )}

      {showMaterialReceiptModal && (
        <CreateMaterialReceiptModal
          onClose={() => setShowMaterialReceiptModal(false)}
          onSuccess={() => {
            setMaterialReceiptRefreshKey(prev => prev + 1)
            setShowMaterialReceiptModal(false)
          }}
          costCenter={effectiveCostCenter}
          isFullAccess={isFullAccess}
        />
      )}

      {showStockTransferModal && (
        <CreateStockTransferModal
          onClose={() => setShowStockTransferModal(false)}
          onSuccess={() => {
            setStockTransferRefreshKey(prev => prev + 1)
            setShowStockTransferModal(false)
          }}
          costCenter={effectiveCostCenter}
          isFullAccess={isFullAccess}
        />
      )}
    </div>
  )
}
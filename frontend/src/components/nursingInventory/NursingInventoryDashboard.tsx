// NursingInventoryDashboard.tsx
import { useState } from 'react'
import { useCareContext } from '../../providers/CareContextProvider'
import { StockLedgerTab } from './StockLedgerTab'
import { MaterialRequestTab } from './MaterialRequestTab'
import { StockReconciliationTab } from './StockReconciliationTab'
import { MaterialReceiptTab } from './MaterialReceiptTab'
import { StockTransferTab } from './StockTransferTab'
import { MaterialIssueTab } from './MaterialIssueTab'
import { CreateMaterialRequestModal } from './CreateMaterialRequest'
import { CreateStockReconciliationModal } from './CreateStockReconciliation'
import { CreateMaterialReceiptModal } from './CreateMaterialReceipt'
import { CreateStockTransferModal } from './CreateStockTransfer'
import { CreateMaterialIssueModal } from './CreateMaterialIssue'
import {
  MiniWarehouseInventoryProvider,
  type WarehouseContext,
} from './MiniWarehouseInventoryContext'

type InventoryTab =
  | 'all'
  | 'stock-ledger'
  | 'material-request'
  | 'stock-reconciliation'
  | 'material-receipt'
  | 'stock-transfer'
  | 'material-issue'

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
  const { userCostCenter } = useCareContext()
  const [activeTab, setActiveTab] = useState<InventoryTab>('stock-ledger')

  // Modal states
  const [showMaterialRequestModal, setShowMaterialRequestModal] = useState(false)
  const [showStockReconciliationModal, setShowStockReconciliationModal] = useState(false)
  const [showMaterialReceiptModal, setShowMaterialReceiptModal] = useState(false)
  const [showStockTransferModal, setShowStockTransferModal] = useState(false)
  const [showMaterialIssueModal, setShowMaterialIssueModal] = useState(false)

  // Refresh keys
  const [materialRequestRefreshKey, setMaterialRequestRefreshKey] = useState(0)
  const [stockReconciliationRefreshKey, setStockReconciliationRefreshKey] = useState(0)
  const [materialReceiptRefreshKey, setMaterialReceiptRefreshKey] = useState(0)
  const [stockTransferRefreshKey, setStockTransferRefreshKey] = useState(0)
  const [materialIssueRefreshKey, setMaterialIssueRefreshKey] = useState(0)

  // Always follow the global navbar branch filter
  const effectiveCostCenter = userCostCenter || ''

  const CARDS: CardDef[] = [
    {
      id: 'stock-ledger',
      title: 'Stock Ledger',
      desc: 'Current inventory levels & stock value',
      color: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      dot: 'bg-emerald-500',
    },
    {
      id: 'material-request',
      title: 'Material Request',
      desc: 'Request materials from stores',
      color: 'bg-blue-50 text-blue-700 border-blue-200',
      dot: 'bg-blue-500',
      onAdd: () => setShowMaterialRequestModal(true),
    },
    {
      id: 'stock-reconciliation',
      title: 'Stock Reconciliation',
      desc: 'Physical count & stock adjustment',
      color: 'bg-amber-50 text-amber-700 border-amber-200',
      dot: 'bg-amber-500',
      onAdd: () => setShowStockReconciliationModal(true),
    },
    {
      id: 'material-receipt',
      title: 'Material Receipt',
      desc: 'Receive materials from suppliers',
      color: 'bg-purple-50 text-purple-700 border-purple-200',
      dot: 'bg-purple-500',
      onAdd: () => setShowMaterialReceiptModal(true),
    },
    {
      id: 'stock-transfer',
      title: 'Stock Transfer',
      desc: 'Move stock to another warehouse',
      color: 'bg-rose-50 text-rose-700 border-rose-200',
      dot: 'bg-rose-500',
      onAdd: () => setShowStockTransferModal(true),
    },
    {
      id: 'material-issue',
      title: 'Material Issue',
      desc: 'Issue stock out of the mini warehouse',
      color: 'bg-orange-50 text-orange-700 border-orange-200',
      dot: 'bg-orange-500',
      onAdd: () => setShowMaterialIssueModal(true),
    },
  ]

  const activeCard = CARDS.find((c) => c.id === activeTab)!

  const sectionContent = (id: InventoryTab) => {
    switch (id) {
      case 'stock-ledger':
        return <StockLedgerTab costCenter={effectiveCostCenter} />
      case 'material-request':
        return (
          <MaterialRequestTab
            onSuccess={() => setMaterialRequestRefreshKey((prev) => prev + 1)}
            refreshKey={materialRequestRefreshKey}
            costCenter={effectiveCostCenter}
          />
        )
      case 'stock-reconciliation':
        return (
          <StockReconciliationTab
            onSuccess={() => setStockReconciliationRefreshKey((prev) => prev + 1)}
            refreshKey={stockReconciliationRefreshKey}
            costCenter={effectiveCostCenter}
          />
        )
      case 'material-receipt':
        return (
          <MaterialReceiptTab
            onSuccess={() => setMaterialReceiptRefreshKey((prev) => prev + 1)}
            refreshKey={materialReceiptRefreshKey}
            costCenter={effectiveCostCenter}
          />
        )
      case 'stock-transfer':
        return (
          <StockTransferTab
            onSuccess={() => setStockTransferRefreshKey((prev) => prev + 1)}
            refreshKey={stockTransferRefreshKey}
            costCenter={effectiveCostCenter}
          />
        )
      case 'material-issue':
        return (
          <MaterialIssueTab
            onSuccess={() => setMaterialIssueRefreshKey((prev) => prev + 1)}
            refreshKey={materialIssueRefreshKey}
            costCenter={effectiveCostCenter}
          />
        )
      default:
        return null
    }
  }

  if (!effectiveCostCenter) {
    return (
      <div className="space-y-4">
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-6 text-center">
          <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-amber-800">SELECT BRANCH</h3>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* ── Nav cards ── */}
      <div className="grid grid-cols-3 sm:grid-cols-6 lg:grid-cols-6 gap-1.5">
        {CARDS.map((card) => {
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
                >
                  +
                </button>
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
            >
              +
            </button>
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
            setMaterialRequestRefreshKey((prev) => prev + 1)
            setShowMaterialRequestModal(false)
          }}
          costCenter={effectiveCostCenter}
        />
      )}

      {showStockReconciliationModal && (
        <CreateStockReconciliationModal
          onClose={() => setShowStockReconciliationModal(false)}
          onSuccess={() => {
            setStockReconciliationRefreshKey((prev) => prev + 1)
            setShowStockReconciliationModal(false)
          }}
          costCenter={effectiveCostCenter}
        />
      )}

      {showMaterialReceiptModal && (
        <CreateMaterialReceiptModal
          onClose={() => setShowMaterialReceiptModal(false)}
          onSuccess={() => {
            setMaterialReceiptRefreshKey((prev) => prev + 1)
            setShowMaterialReceiptModal(false)
          }}
          costCenter={effectiveCostCenter}
        />
      )}

      {showStockTransferModal && (
        <CreateStockTransferModal
          onClose={() => setShowStockTransferModal(false)}
          onSuccess={() => {
            setStockTransferRefreshKey((prev) => prev + 1)
            setShowStockTransferModal(false)
          }}
          costCenter={effectiveCostCenter}
        />
      )}

      {showMaterialIssueModal && (
        <CreateMaterialIssueModal
          onClose={() => setShowMaterialIssueModal(false)}
          onSuccess={() => {
            setMaterialIssueRefreshKey((prev) => prev + 1)
            setShowMaterialIssueModal(false)
          }}
          costCenter={effectiveCostCenter}
        />
      )}
    </div>
  )
}

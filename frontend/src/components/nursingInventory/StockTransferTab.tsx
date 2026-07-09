import { useEffect, useState } from 'react'
import { useCareContext } from '../../providers/CareContextProvider'
import { fetchStockTransfers, type StockTransfer } from '../../services/nursingInventory'
import { useMiniWarehouseContext } from './MiniWarehouseInventoryContext'
import { toast } from '../../hooks/useToast'
import { ArrowRightLeft, Eye } from 'lucide-react'

interface StockTransferTabProps {
  onSuccess: () => void
  refreshKey?: number
  costCenter?: string
  isFullAccess?: boolean
}

export const StockTransferTab = ({
  refreshKey,
  costCenter: propCostCenter,
}: StockTransferTabProps) => {
  const warehouseContext = useMiniWarehouseContext()
  const { userCostCenter } = useCareContext()
  const effectiveCostCenter = propCostCenter || userCostCenter
  const [transfers, setTransfers] = useState<StockTransfer[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<StockTransfer | null>(null)

  useEffect(() => {
    if (effectiveCostCenter) {
      void loadTransfers()
    }
  }, [effectiveCostCenter, refreshKey, warehouseContext])

  const loadTransfers = async () => {
    if (!effectiveCostCenter) return
    setLoading(true)
    try {
      const data = await fetchStockTransfers(effectiveCostCenter, warehouseContext)
      setTransfers(data)
    } catch (error) {
      console.error('Failed to load stock transfers:', error)
      toast.error('Failed to load stock transfers')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
          <h3 className="text-sm font-semibold text-slate-900">Transfer history</h3>
        </div>
        {loading ? (
          <div className="p-8 text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : transfers.length === 0 ? (
          <div className="p-8 text-center">
            <ArrowRightLeft className="w-12 h-12 text-slate-400 mx-auto mb-3" />
            <p className="text-slate-500">No stock transfers found</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {transfers.map((transfer) => (
              <div key={transfer.name} className="p-4 hover:bg-slate-50 transition">
                <div className="flex justify-between items-start gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900">{transfer.name}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      {transfer.transfer_date} · {transfer.from_warehouse} → {transfer.to_warehouse}
                    </p>
                    <p className="text-xs text-slate-500">
                      By {transfer.transferred_by} · {transfer.items?.length || 0} item(s)
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelected(transfer)}
                    className="text-primary hover:text-primary/80 text-sm inline-flex items-center gap-1 shrink-0"
                  >
                    <Eye className="w-4 h-4" />
                    View
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selected && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[80vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-slate-900">Transfer details</h3>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                ×
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs text-slate-500">Transfer ID</p>
                  <p className="font-medium">{selected.name}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Date</p>
                  <p>{selected.transfer_date}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">From</p>
                  <p>{selected.from_warehouse}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">To</p>
                  <p>{selected.to_warehouse}</p>
                </div>
              </div>
              {selected.notes ? (
                <div>
                  <p className="text-xs text-slate-500">Notes</p>
                  <p className="text-sm">{selected.notes}</p>
                </div>
              ) : null}
              <table className="w-full text-sm border border-slate-200 rounded-lg overflow-hidden">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left">Item</th>
                    <th className="px-3 py-2 text-right">Qty</th>
                    <th className="px-3 py-2 text-left">UOM</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(selected.items || []).map((item, idx) => (
                    <tr key={`${item.item_code}-${idx}`}>
                      <td className="px-3 py-2">{item.item_name || item.item_code}</td>
                      <td className="px-3 py-2 text-right">{item.quantity}</td>
                      <td className="px-3 py-2">{item.uom || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

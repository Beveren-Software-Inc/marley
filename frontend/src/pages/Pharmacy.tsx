import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { NavbarActions } from '../components/layout/NavbarActions'
import { ItemSearch } from '../components/pharmacy/ItemSearch'
import {
  getBatchesExpiringInDays,
  getLowStockItems,
  fetchPharmacyWarehouseContext,
  setPharmacyWarehousePreference,
  type BatchRow,
  type LowStockRow,
  type PharmacyWarehouseOption,
} from '../services/pharmacy'
import { Plus } from 'lucide-react'
import { MobileNavMenuButton } from '../components/layout/MobileNavMenuButton'
import { CreateMaterialRequestModal } from '../components/pharmacy/CreateMaterialRequestModal'
import { PharmacyDischargePage } from './PharmacyDischargePage'

const PHARM_POS_URL = '/klik_pos/pos'

const DEFAULT_EXPIRY_DAYS = 7
const DEFAULT_LOW_STOCK_THRESHOLD = 20

export const PharmacyPage = () => {
  const [searchParams] = useSearchParams()
  const screen = searchParams.get('screen')

  if (screen === 'p-discharge') {
    return <PharmacyDischargePage />
  }

  return <PharmacyStockPage />
}

function PharmacyStockPage() {
  const [expiryRows, setExpiryRows] = useState<BatchRow[]>([])
  const [lowStock, setLowStock] = useState<LowStockRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [warehouseOptions, setWarehouseOptions] = useState<PharmacyWarehouseOption[]>([])
  const [selectedWarehouse, setSelectedWarehouse] = useState('')
  const [hasPosProfiles, setHasPosProfiles] = useState(false)
  const [openPosProfile, setOpenPosProfile] = useState<string | null>(null)
  const [warehouseReady, setWarehouseReady] = useState(false)

  const [expiryDays, setExpiryDays] = useState(DEFAULT_EXPIRY_DAYS)
  const [lowStockThreshold, setLowStockThreshold] = useState(DEFAULT_LOW_STOCK_THRESHOLD)

  const [searchQuery, setSearchQuery] = useState('')
  const [showMaterialRequestModal, setShowMaterialRequestModal] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetchPharmacyWarehouseContext(true)
      .then((ctx) => {
        if (cancelled) return
        setHasPosProfiles(ctx.has_pos_profiles)
        setWarehouseOptions(ctx.warehouses || [])
        setSelectedWarehouse(ctx.selected_warehouse || '')
        setOpenPosProfile(ctx.open_pos_profile || null)
      })
      .catch(() => {
        if (!cancelled) {
          setHasPosProfiles(false)
          setWarehouseOptions([])
        }
      })
      .finally(() => {
        if (!cancelled) setWarehouseReady(true)
      })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!warehouseReady) return
    let cancelled = false
    setLoading(true)
    setError(null)
    const warehouse = selectedWarehouse || undefined
    Promise.all([
      getBatchesExpiringInDays(expiryDays, 200, warehouse),
      getLowStockItems(100, lowStockThreshold, warehouse),
    ])
      .then(([e, l]) => {
        if (!cancelled) {
          setExpiryRows(e)
          setLowStock(l)
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load pharmacy data')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [expiryDays, lowStockThreshold, selectedWarehouse, warehouseReady])

  const handleWarehouseChange = async (warehouse: string) => {
    setSelectedWarehouse(warehouse)
    if (!warehouse) return
    try {
      await setPharmacyWarehousePreference(warehouse)
    } catch {
      // Preference save failed — stock still filters by selection for this session
    }
  }

  const filteredExpiryRows = searchQuery
    ? expiryRows.filter(
        (row) =>
          row.item?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          row.item_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          row.name?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : expiryRows

  const filteredLowStock = searchQuery
    ? lowStock.filter(
        (row) =>
          row.item_code?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          row.item_name?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : lowStock

  return (
    <div className="flex flex-col min-h-0">
      <header className="sticky top-0 z-10 flex items-center gap-2 md:gap-3 bg-primary text-white px-3 md:px-4 py-2 md:py-3 border-b border-white/20 flex-shrink-0">
        <MobileNavMenuButton />
        <div className="flex-1 min-w-0">
          <ItemSearch onSearch={setSearchQuery} warehouse={selectedWarehouse || undefined} />
        </div>
        {hasPosProfiles && warehouseOptions.length > 0 && (
          <div className="hidden md:flex flex-shrink-0 max-w-[220px]">
            <select
              value={selectedWarehouse}
              onChange={(e) => handleWarehouseChange(e.target.value)}
              className="rounded-md border border-white/30 bg-white/10 text-white text-xs px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-white/50"
              title={openPosProfile ? `Open POS: ${openPosProfile}` : undefined}
            >
              {warehouseOptions.map((opt) => (
                <option key={opt.warehouse} value={opt.warehouse} className="text-slate-900">
                  {opt.warehouse}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="hidden md:flex items-center gap-3 flex-shrink-0">
          <a
            href={PHARM_POS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 rounded-md bg-white/20 hover:bg-white/30 text-white text-sm font-medium whitespace-nowrap"
          >
            Pharm POS
          </a>
          <NavbarActions placement="header" />
        </div>
        <a
          href={PHARM_POS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="md:hidden shrink-0 px-2 py-1 rounded-md bg-white/20 hover:bg-white/30 text-white text-xs font-medium whitespace-nowrap"
        >
          POS
        </a>
      </header>

      {hasPosProfiles && warehouseOptions.length > 0 && (
        <div className="md:hidden px-3 py-2 bg-slate-50 border-b border-slate-200">
          <select
            value={selectedWarehouse}
            onChange={(e) => handleWarehouseChange(e.target.value)}
            className="w-full rounded-md border border-slate-300 bg-white text-slate-800 text-xs px-2 py-1.5"
          >
            {warehouseOptions.map((opt) => (
              <option key={opt.warehouse} value={opt.warehouse}>
                {opt.warehouse}
              </option>
            ))}
          </select>
        </div>
      )}

      {selectedWarehouse && (
        <div className="px-3 md:px-4 py-2 text-xs text-slate-600 bg-slate-50 border-b border-slate-200">
          Showing stock for <span className="font-medium text-slate-800">{selectedWarehouse}</span>
          {openPosProfile ? <> · Open POS: {openPosProfile}</> : null}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4">
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12 text-slate-500">Loading...</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <StockCard
              title="Expiry"
              count={filteredExpiryRows.length}
              emptyMessage={`No batches expiring within ${expiryDays} days.`}
              headerRight={
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-600">Days:</span>
                  <input
                    type="number"
                    min={1}
                    value={expiryDays}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10)
                      if (!Number.isNaN(v) && v >= 1) setExpiryDays(v)
                    }}
                    onBlur={(e) => {
                      const v = parseInt(e.target.value, 10)
                      if (Number.isNaN(v) || v < 1) setExpiryDays(DEFAULT_EXPIRY_DAYS)
                    }}
                    className="w-14 rounded border border-slate-300 bg-white px-2 py-1 text-center text-sm text-slate-800"
                  />
                </div>
              }
            >
              <ExpiryTable rows={filteredExpiryRows} />
            </StockCard>

            <StockCard
              title="Low stock"
              count={filteredLowStock.length}
              emptyMessage="No low stock items."
              headerRight={
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-600">Threshold:</span>
                  <input
                    type="number"
                    min={0}
                    value={lowStockThreshold}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10)
                      if (!Number.isNaN(v) && v >= 0) setLowStockThreshold(v)
                    }}
                    onBlur={(e) => {
                      const v = parseInt(e.target.value, 10)
                      if (Number.isNaN(v) || v < 0) setLowStockThreshold(DEFAULT_LOW_STOCK_THRESHOLD)
                    }}
                    className="w-14 rounded border border-slate-300 bg-white px-2 py-1 text-center text-sm text-slate-800"
                  />
                </div>
              }
              onAddClick={() => setShowMaterialRequestModal(true)}
            >
              <LowStockTable rows={filteredLowStock} />
            </StockCard>
          </div>
        )}
      </div>

      {showMaterialRequestModal && (
        <CreateMaterialRequestModal
          defaultWarehouse={selectedWarehouse || undefined}
          onClose={() => setShowMaterialRequestModal(false)}
          onSuccess={() => setShowMaterialRequestModal(false)}
        />
      )}
    </div>
  )
}

function StockCard({
  title,
  count,
  emptyMessage,
  headerRight,
  onAddClick,
  children,
}: {
  title: string
  count: number
  emptyMessage: string
  headerRight?: React.ReactNode
  onAddClick?: () => void
  children: React.ReactNode
}) {
  return (
    <section className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden flex flex-col min-h-[280px]">
      <div className="px-4 py-3 bg-primary/20 border-b border-slate-100 flex items-center justify-between gap-2 flex-shrink-0">
        <h2 className="font-semibold text-slate-800 flex items-center gap-1.5">
          {title}
          <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-red-500 text-white text-xs font-medium">
            {count}
          </span>
        </h2>
        <div className="flex items-center gap-2 flex-shrink-0">
          {headerRight}
          {onAddClick && (
            <button
              type="button"
              onClick={onAddClick}
              className="p-1.5 rounded-md text-slate-600 hover:bg-primary/20 hover:text-primary transition-colors"
              title="Create Material Request"
            >
              <Plus className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>
      <div className="p-4 flex-1 overflow-y-auto min-h-0">
        {count === 0 ? (
          <p className="text-slate-500 text-sm">{emptyMessage}</p>
        ) : (
          children
        )}
      </div>
    </section>
  )
}

function ExpiryTable({ rows }: { rows: BatchRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse table-fixed">
        <thead>
          <tr className="text-left text-slate-600 border-b border-slate-200">
            <th className="py-2 pr-2 font-medium w-[30%]">Item</th>
            <th className="py-2 pr-2 font-medium w-[25%]">Batch</th>
            <th className="py-2 pr-6 font-medium text-right w-[20%]">Qty</th>
            <th className="py-2 pl-4 font-medium w-[25%]">Expiry Date</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((b) => (
            <tr key={b.name} className="border-b border-slate-100">
              <td className="py-1.5 pr-2 truncate" title={b.item_name || b.item || ''}>
                {b.item_name || b.item || '—'}
              </td>
              <td className="py-1.5 pr-2 truncate" title={b.name}>
                {b.name}
              </td>
              <td className="py-1.5 pr-6 text-right whitespace-nowrap">
                {b.batch_qty != null ? `${b.batch_qty} ${b.stock_uom || ''}` : '—'}
              </td>
              <td className="py-1.5 pl-4 text-slate-600">{b.expiry_date || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function LowStockTable({ rows }: { rows: LowStockRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse table-fixed">
        <thead>
          <tr className="text-left text-slate-600 border-b border-slate-200">
            <th className="py-2 pr-2 font-medium w-[40%]">Item</th>
            <th className="py-2 pr-6 font-medium text-right w-[20%]">Qty</th>
            <th className="py-2 pl-4 font-medium w-[40%]">Warehouse</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.item_code}-${r.warehouse || ''}`} className="border-b border-slate-100">
              <td className="py-1.5 pr-2 truncate" title={r.item_name}>
                {r.item_name}
              </td>
              <td className="py-1.5 pr-6 text-right whitespace-nowrap">{r.actual_qty}</td>
              <td className="py-1.5 pl-4 text-slate-600 truncate" title={r.warehouse || ''}>
                {r.warehouse || '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

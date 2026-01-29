import { useState, useEffect } from 'react'
import { NotificationBell } from '../components/notifications/NotificationBell'
import { UserMenu } from '../components/user/UserMenu'
import { ItemSearch } from '../components/pharmacy/ItemSearch'
import {
  getBatchesExpiringTomorrow,
  getBatchesExpiringInWeek,
  getLowStockItems,
  searchItemOrBatch,
  type BatchRow,
  type LowStockRow,
  type ItemBatchSearchRow
} from '../services/pharmacy'

const PHARM_POS_URL = '/app/klik-pos'

const CARD_MAX = 20

type FullScreenView = 'expiry-tomorrow' | 'expiry-week' | 'low-stock' | null

export const PharmacyPage = () => {
  const [tomorrow, setTomorrow] = useState<BatchRow[]>([])
  const [inWeek, setInWeek] = useState<BatchRow[]>([])
  const [lowStock, setLowStock] = useState<LowStockRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<ItemBatchSearchRow[] | null>(null)

  const [fullScreenView, setFullScreenView] = useState<FullScreenView>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    Promise.all([
      getBatchesExpiringTomorrow(),
      getBatchesExpiringInWeek(),
      getLowStockItems()
    ])
      .then(([t, w, l]) => {
        if (!cancelled) {
          setTomorrow(t)
          setInWeek(w)
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
  }, [])

  const handleItemSearch = async (query: string) => {
    setSearchResults(null)
    setSearchQuery(query)
    try {
      const data = await searchItemOrBatch(query, 200)
      setSearchResults(data)
    } catch (e) {
      setSearchResults([])
    }
  }

  const showCards = searchResults === null && fullScreenView === null
  const showSearchResults = searchResults !== null
  const showFullScreen = fullScreenView !== null

  return (
    <div className="flex flex-col min-h-0">
      <header className="sticky top-0 z-10 flex items-center gap-2 md:gap-3 bg-primary text-white pl-14 md:pl-4 pr-4 py-2 md:py-3 border-b border-white/20 flex-shrink-0">
        <div className="flex-1 min-w-0">
          <ItemSearch onSearch={handleItemSearch} />
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <a
            href={PHARM_POS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 rounded-md bg-white/20 hover:bg-white/30 text-white text-sm font-medium whitespace-nowrap"
          >
            Pharm POS
          </a>
          <UserMenu />
          <NotificationBell />
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4">
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm">
            {error}
          </div>
        )}

        {showSearchResults && (
          <>
            <div className="flex items-center justify-between gap-2 mb-4">
              <h2 className="font-semibold text-slate-800">
                Search results{searchQuery ? ` for “${searchQuery}”` : ''}
              </h2>
              <button
                type="button"
                onClick={() => setSearchResults(null)}
                className="text-sm text-primary hover:underline"
              >
                Back to cards
              </button>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse table-fixed">
                  <thead>
                    <tr className="text-left text-slate-600 border-b border-slate-200 bg-slate-50">
                      <th className="py-2 pr-2 font-medium w-[30%]">Item name</th>
                      <th className="py-2 pr-2 font-medium w-[20%]">Batch</th>
                      <th className="py-2 pr-6 font-medium text-right w-[20%]">Stock quantity</th>
                      <th className="py-2 pl-4 font-medium w-[30%]">Expiry date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {searchResults.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-6 text-center text-slate-500">
                          No items or batches found.
                        </td>
                      </tr>
                    ) : (
                      searchResults.map((row, i) => (
                        <tr key={`${row.item_code}-${row.batch || ''}-${i}`} className="border-b border-slate-100">
                          <td className="py-1.5 pr-2 truncate" title={row.item_name}>
                            {row.item_name || '—'}
                          </td>
                          <td className="py-1.5 pr-2 truncate" title={row.batch || ''}>
                            {row.batch || '—'}
                          </td>
                          <td className="py-1.5 pr-6 text-right whitespace-nowrap">
                            {row.stock_quantity != null
                              ? `${row.stock_quantity} ${row.stock_uom || ''}`.trim() || row.stock_quantity
                              : '—'}
                          </td>
                          <td className="py-1.5 pl-4 text-slate-600">{row.expiry_date || '—'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {showFullScreen && (
          <FullScreenList
            view={fullScreenView}
            tomorrow={tomorrow}
            inWeek={inWeek}
            lowStock={lowStock}
            onBack={() => setFullScreenView(null)}
          />
        )}

        {showCards && loading && (
          <div className="flex items-center justify-center py-12 text-slate-500">Loading...</div>
        )}

        {showCards && !loading && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card
              title="Expiry Tomorrow"
              count={tomorrow.length}
              emptyMessage="No batches expiring tomorrow."
              onTitleClick={() => { setSearchResults(null); setFullScreenView('expiry-tomorrow') }}
            >
              <ExpiryTable rows={tomorrow.slice(0, CARD_MAX)} />
              {tomorrow.length > CARD_MAX && (
                <p className="text-slate-500 text-xs mt-2">Showing {CARD_MAX} of {tomorrow.length}. Click title to see all.</p>
              )}
            </Card>

            <Card
              title="Expiry 1 week"
              count={inWeek.length}
              emptyMessage="No batches expiring in the next 2–7 days."
              onTitleClick={() => { setSearchResults(null); setFullScreenView('expiry-week') }}
            >
              <ExpiryTable rows={inWeek.slice(0, CARD_MAX)} />
              {inWeek.length > CARD_MAX && (
                <p className="text-slate-500 text-xs mt-2">Showing {CARD_MAX} of {inWeek.length}. Click title to see all.</p>
              )}
            </Card>

            <Card
              title="Low stock"
              count={lowStock.length}
              emptyMessage="No low stock items."
              onTitleClick={() => { setSearchResults(null); setFullScreenView('low-stock') }}
            >
              <LowStockTable rows={lowStock.slice(0, CARD_MAX)} />
              {lowStock.length > CARD_MAX && (
                <p className="text-slate-500 text-xs mt-2">Showing {CARD_MAX} of {lowStock.length}. Click title to see all (lowest first).</p>
              )}
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}

function FullScreenList({
  view,
  tomorrow,
  inWeek,
  lowStock,
  onBack
}: {
  view: FullScreenView
  tomorrow: BatchRow[]
  inWeek: BatchRow[]
  lowStock: LowStockRow[]
  onBack: () => void
}) {
  if (view === 'expiry-tomorrow') {
    return (
      <div className="flex flex-col h-full min-h-0">
        <div className="flex items-center gap-3 mb-4 flex-shrink-0">
          <button type="button" onClick={onBack} className="text-primary font-medium hover:underline">
            ← Back
          </button>
          <h2 className="font-semibold text-slate-800">Expiry Tomorrow – full list</h2>
        </div>
        <div className="flex-1 min-h-0 overflow-auto bg-white border border-slate-200 rounded-lg shadow-sm">
          <ExpiryTable rows={tomorrow} full />
        </div>
      </div>
    )
  }
  if (view === 'expiry-week') {
    return (
      <div className="flex flex-col h-full min-h-0">
        <div className="flex items-center gap-3 mb-4 flex-shrink-0">
          <button type="button" onClick={onBack} className="text-primary font-medium hover:underline">
            ← Back
          </button>
          <h2 className="font-semibold text-slate-800">Expiry 1 week – full list</h2>
        </div>
        <div className="flex-1 min-h-0 overflow-auto bg-white border border-slate-200 rounded-lg shadow-sm">
          <ExpiryTable rows={inWeek} full />
        </div>
      </div>
    )
  }
  if (view === 'low-stock') {
    return (
      <div className="flex flex-col h-full min-h-0">
        <div className="flex items-center gap-3 mb-4 flex-shrink-0">
          <button type="button" onClick={onBack} className="text-primary font-medium hover:underline">
            ← Back
          </button>
          <h2 className="font-semibold text-slate-800">Low stock – full list (lowest on top)</h2>
        </div>
        <div className="flex-1 min-h-0 overflow-auto bg-white border border-slate-200 rounded-lg shadow-sm">
          <LowStockTable rows={lowStock} full />
        </div>
      </div>
    )
  }
  return null
}

function ExpiryTable({ rows, full }: { rows: BatchRow[]; full?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className={`w-full text-sm border-collapse ${full ? '' : 'table-fixed'}`}>
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

function LowStockTable({ rows, full }: { rows: LowStockRow[]; full?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className={`w-full text-sm border-collapse ${full ? '' : 'table-fixed'}`}>
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

function Card({
  title,
  count,
  emptyMessage,
  onTitleClick,
  children
}: {
  title: string
  count: number
  emptyMessage: string
  onTitleClick?: () => void
  children: React.ReactNode
}) {
  const headerContent = (
    <>
      <h2 className="font-semibold text-slate-800">{title}</h2>
      <span className="text-sm text-slate-500 bg-slate-100 px-2 py-0.5 rounded">{count}</span>
    </>
  )

  return (
    <section className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden flex flex-col min-h-[200px]">
      {onTitleClick ? (
        <button
          type="button"
          onClick={onTitleClick}
          className="w-full px-4 py-3 bg-primary/20 border-b border-slate-100 flex items-center justify-between flex-shrink-0 text-left hover:bg-primary/30 transition-colors cursor-pointer"
        >
          {headerContent}
        </button>
      ) : (
        <div className="px-4 py-3 bg-primary/20 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
          {headerContent}
        </div>
      )}
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

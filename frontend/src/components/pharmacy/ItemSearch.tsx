import { useState, useEffect } from 'react'
import { searchItemOrBatch, type ItemBatchSearchRow } from '../../services/pharmacy'

interface ItemSearchProps {
  onSearch: (query: string) => void
  warehouse?: string
}

export const ItemSearch = ({ onSearch, warehouse }: ItemSearchProps) => {
  const [query, setQuery] = useState('')
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [suggestions, setSuggestions] = useState<ItemBatchSearchRow[]>([])
  const [loading, setLoading] = useState(false)

  // Search when dropdown is open and query changes (debounced, same as PatientSearch)
  useEffect(() => {
    if (!dropdownOpen) return

    const search = async () => {
      setLoading(true)
      try {
        if (query.trim() === '') {
          setSuggestions([])
        } else {
          const results = await searchItemOrBatch(query.trim(), 20, warehouse)
          setSuggestions(results)
        }
      } catch (error) {
        console.error('Failed to search items/batches:', error)
        setSuggestions([])
      } finally {
        setLoading(false)
      }
    }

    const timeoutId = setTimeout(() => {
      search()
    }, query.trim() === '' ? 0 : 300)

    return () => clearTimeout(timeoutId)
  }, [query, dropdownOpen, warehouse])

  const handleSelect = (itemName: string, batch?: string | null) => {
    const searchText = batch ? `${itemName} (${batch})` : itemName
    setQuery(searchText)
    setDropdownOpen(false)
    onSearch(itemName.trim() ? itemName : query.trim())
  }

  const handleSubmit = () => {
    if (query.trim()) {
      setDropdownOpen(false)
      onSearch(query.trim())
    }
  }

  const handleBlur = () => {
    setTimeout(() => setDropdownOpen(false), 200)
  }

  return (
    <div className="w-full max-w-xs md:max-w-xl">
      <div className="relative flex items-center gap-2">
        <div className="flex-1 relative">
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setDropdownOpen(true)
            }}
            onFocus={() => setDropdownOpen(true)}
            onBlur={handleBlur}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleSubmit()
              }
            }}
            placeholder="Search item or batch..."
            className="w-full rounded-md border border-primary/40 px-2 md:px-3 py-1.5 md:py-2 text-xs md:text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-white focus:border-white"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('')
                setDropdownOpen(false)
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              title="Clear"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
          {dropdownOpen && (
            <div className="absolute z-40 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg max-h-56 overflow-auto text-slate-900">
              {loading ? (
                <div className="px-3 py-2 text-xs text-slate-500">Loading...</div>
              ) : suggestions.length > 0 ? (
                suggestions.map((row, i) => (
                  <button
                    key={`${row.item_code}-${row.batch || ''}-${i}`}
                    type="button"
                    className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50"
                    onClick={() => handleSelect(row.item_name || row.item_code, row.batch)}
                  >
                    <div className="font-medium">{row.item_name || row.item_code}</div>
                    {(row.batch || row.expiry_date) && (
                      <div className="text-xs text-slate-500">
                        {[row.batch, row.expiry_date].filter(Boolean).join(' · ')}
                      </div>
                    )}
                  </button>
                ))
              ) : (
                <div className="px-3 py-2 text-xs text-slate-500">
                  {query.trim() ? 'No items or batches match your search.' : 'Type to search item or batch.'}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

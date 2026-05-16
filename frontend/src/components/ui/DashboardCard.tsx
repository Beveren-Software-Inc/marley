import { useState } from 'react'
import { CardFilterContext } from '../../contexts/CardFilterContext'

export const DashboardCard = ({
  title,
  onAdd,
  children,
  className = "",
  addButtonTitle,
  noHeightLimit = false,
  fixedHeight = false,
}: {
  title: string
  onAdd?: () => void
  children: React.ReactNode
  className?: string
  addButtonTitle?: string
  noHeightLimit?: boolean
  fixedHeight?: boolean
}) => {
  const [showFilters, setShowFilters] = useState(false)
  const resolvedAddTitle = addButtonTitle ?? `Add ${title}`

  return (
    <section className={`bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col ${fixedHeight && !noHeightLimit ? 'min-h-[400px] max-h-[400px]' : ''} ${className}`}>
      <div className="font-semibold mb-4 flex items-center justify-between flex-shrink-0">
        <span>{title}</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowFilters(prev => !prev)}
            className={`p-1 rounded-md border transition-colors ${showFilters ? 'bg-primary/10 border-primary text-primary' : 'border-slate-300 text-slate-500 hover:bg-slate-50'}`}
            title={showFilters ? 'Hide filters' : 'Show filters'}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
            </svg>
          </button>
          {onAdd && (
            <button
              onClick={onAdd}
              className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors text-sm font-bold flex-shrink-0"
              title={resolvedAddTitle}
            >
              +
            </button>
          )}
        </div>
      </div>
      {/*
        Avoid overflow-y on this wrapper: it clips native <select> menus and absolute filter dropdowns.
        Fixed-height cards rely on children using flex-1 min-h-0 overflow-auto on the table region.
      */}
      <div
        className={
          fixedHeight && !noHeightLimit
            ? 'flex flex-col flex-1 min-h-0 overflow-hidden'
            : 'overflow-x-auto overflow-visible'
        }
        style={{ scrollbarWidth: 'thin' }}
      >
        <CardFilterContext.Provider value={showFilters}>
          {children}
        </CardFilterContext.Provider>
      </div>
    </section>
  )
}

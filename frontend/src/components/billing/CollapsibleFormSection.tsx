import { useState, type ReactNode } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

interface CollapsibleFormSectionProps {
  title: string
  defaultOpen?: boolean
  children: ReactNode
  footer?: ReactNode
}

export function CollapsibleFormSection({
  title,
  defaultOpen = true,
  children,
  footer,
}: CollapsibleFormSectionProps) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 bg-slate-50 hover:bg-slate-100/80 text-left transition-colors"
      >
        <span className="text-sm font-semibold text-slate-800">{title}</span>
        {open ? <ChevronUp className="w-4 h-4 text-slate-500 shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />}
      </button>
      {open && (
        <div className="p-3 space-y-3 border-t border-slate-100">
          {children}
          {footer ? <div className="pt-1">{footer}</div> : null}
        </div>
      )}
    </div>
  )
}

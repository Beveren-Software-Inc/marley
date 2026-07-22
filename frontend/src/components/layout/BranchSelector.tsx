import { useCallback, useEffect, useRef, useState } from 'react'
import { Building2, ChevronDown } from 'lucide-react'
import { fetchBranchOptions } from '../../services/common'
import {
  getUserCostCenterPermission,
  setUserCostCenterPermission,
} from '../../services/costCenterPermission'
import { useCareContext } from '../../providers/CareContextProvider'
import { toast } from '../../hooks/useToast'

type BranchSelectorProps = {
  placement?: 'header' | 'sidebar'
}

export function BranchSelector({ placement = 'header' }: BranchSelectorProps) {
  const { refreshUserCostCenter } = useCareContext()
  const [branches, setBranches] = useState<{ name: string; label: string }[]>([])
  const [selected, setSelected] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const loadCurrent = useCallback(async () => {
    try {
      const perm = await getUserCostCenterPermission()
      setSelected(perm.cost_center || '')
    } catch {
      /* keep previous value */
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      try {
        const [perm, options] = await Promise.all([
          getUserCostCenterPermission(),
          fetchBranchOptions(),
        ])
        if (cancelled) return
        setSelected(perm.cost_center || '')
        setBranches(options.map((b) => ({ name: b.name, label: b.label || b.name })))
      } catch {
        if (!cancelled) toast.error('Failed to load branches')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const handleSelect = async (value: string) => {
    if (saving || value === selected) {
      setOpen(false)
      return
    }
    setSaving(true)
    setOpen(false)
    try {
      const result = await setUserCostCenterPermission(value)
      setSelected(result.cost_center || '')
      await refreshUserCostCenter()
      if (result.status === 'cleared') {
        toast.success('Showing all branches')
      } else {
        toast.success(`Branch set to ${result.cost_center}`)
      }
      window.location.reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to switch branch')
      await loadCurrent()
    } finally {
      setSaving(false)
    }
  }

  const isSidebar = placement === 'sidebar'
  const activeLabel =
    selected
      ? branches.find((b) => b.name === selected)?.label || selected
      : 'Select Branch'

  if (loading) {
    return (
      <div
        className={
          isSidebar
            ? 'h-9 w-full rounded-md bg-white/10 animate-pulse'
            : 'h-9 w-56 rounded-lg bg-slate-200 animate-pulse'
        }
        aria-hidden
      />
    )
  }

  if (isSidebar) {
    return (
      <div ref={ref} className="relative w-full">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          disabled={saving}
          className="flex w-full items-center gap-2 rounded-md bg-white/10 px-3 py-2 text-left text-sm text-white hover:bg-white/20 disabled:opacity-60"
          aria-label="Choose branch"
        >
          <Building2 className="h-4 w-4 shrink-0 opacity-80" />
          <span className={`flex-1 truncate ${selected ? '' : 'text-white/70'}`}>{activeLabel}</span>
          <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        {open && (
          <div className="absolute bottom-full left-0 right-0 z-[110] mb-1 max-h-52 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-xl">
            <BranchOption label="Select Branch" active={!selected} onSelect={() => void handleSelect('')} />
            {branches.map((b) => (
              <BranchOption
                key={b.name}
                label={b.label}
                active={selected === b.name}
                onSelect={() => void handleSelect(b.name)}
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div ref={ref} className="relative flex-shrink-0 w-56 mr-2">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        disabled={saving}
        className="flex w-full items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 hover:bg-slate-50 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-60"
        aria-label="Choose branch"
        title={selected ? `Branch: ${activeLabel}` : undefined}
      >
        <Building2 className="h-4 w-4 shrink-0 text-slate-500" />
        <span className={`flex-1 truncate text-left ${selected ? '' : 'text-slate-400'}`}>{saving ? 'Saving…' : activeLabel}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 opacity-90 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute top-full right-0 z-[110] mt-1 w-full max-h-60 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-xl">
          <BranchOption label="Select Branch" active={!selected} onSelect={() => void handleSelect('')} />
          {branches.map((b) => (
            <BranchOption
              key={b.name}
              label={b.label}
              active={selected === b.name}
              onSelect={() => void handleSelect(b.name)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function BranchOption({
  label,
  active,
  onSelect,
}: {
  label: string
  active: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex min-h-[2.25rem] w-full items-center px-3 py-2 text-left text-sm transition-colors ${
        active ? 'bg-primary/10 text-primary font-medium' : 'text-gray-800 hover:bg-gray-50'
      }`}
    >
      {label || ' '}
    </button>
  )
}

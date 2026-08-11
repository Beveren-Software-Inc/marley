import { useCallback, useEffect, useRef, useState } from 'react'
import { Building2, ChevronDown, Lock, LockOpen } from 'lucide-react'
import { fetchBranchOptions } from '../../services/common'
import {
  applyBranchFromIpMapper,
  getUserCostCenterPermission,
  setIpBranchOverride,
  setUserCostCenterPermission,
} from '../../services/costCenterPermission'
import { useCareContext } from '../../providers/CareContextProvider'
import { useAuth } from '../../providers/AuthProvider'
import { toast } from '../../hooks/useToast'

type BranchSelectorProps = {
  placement?: 'header' | 'sidebar'
}

export function BranchSelector({ placement = 'header' }: BranchSelectorProps) {
  const { refreshUserCostCenter } = useCareContext()
  const [branches, setBranches] = useState<{ name: string; label: string }[]>([])
  const [selected, setSelected] = useState('')
  const [loading, setLoading] = useState(true)
  const { isAuthenticated } = useAuth()
  const [saving, setSaving] = useState(false)
  const [open, setOpen] = useState(false)
  /** Network-suggested cost center when IP Mapper matched (visual lock cue only). */
  const [ipMappedCostCenter, setIpMappedCostCenter] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  const onIpHomeBranch = Boolean(ipMappedCostCenter && selected === ipMappedCostCenter)
  const ipOverrideActive = Boolean(ipMappedCostCenter && selected && selected !== ipMappedCostCenter)

  const loadCurrent = useCallback(async () => {
    try {
      const perm = await getUserCostCenterPermission()
      setSelected(perm.cost_center || '')
    } catch {
      /* keep previous value */
    }
  }, [])

  useEffect(() => {
    // These APIs 403 for guests — wait for login before loading branches.
    if (!isAuthenticated) return
    let cancelled = false
    const load = async () => {
      setLoading(true)
      try {
        const ipResult = await applyBranchFromIpMapper().catch((err) => {
          console.warn('IP Mapper apply failed:', err)
          return null
        })
        if (cancelled) return

        const mappedCc =
          (ipResult?.matched && (ipResult.ip_mapped_cost_center || ipResult.cost_center)) || ''
        setIpMappedCostCenter(mappedCc)

        // When IP just wrote the permission, reload once so CareContext / lists sync.
        if (ipResult?.matched && ipResult?.applied && mappedCc) {
          const reloadKey = `healthcare_ip_branch_reload:${mappedCc}`
          try {
            if (typeof sessionStorage !== 'undefined' && !sessionStorage.getItem(reloadKey)) {
              sessionStorage.setItem(reloadKey, '1')
              window.location.reload()
              return
            }
          } catch {
            /* ignore storage errors; fall through to in-page update */
          }
        }

        const [perm, options] = await Promise.all([
          getUserCostCenterPermission(),
          fetchBranchOptions(),
        ])
        if (cancelled) return

        setSelected(perm.cost_center || ipResult?.cost_center || '')
        setBranches(options.map((b) => ({ name: b.name, label: b.label || b.name })))

        if (ipResult?.matched) {
          await refreshUserCostCenter()
        }

        if (ipResult?.activated && !ipResult?.matched) {
          console.info(
            'IP Mapper active but no match for client IP:',
            ipResult.client_ip || '(unknown)',
            '— add this IP in Healthcare Settings → IP Mapper (use 127.0.0.1 for local bench).',
          )
        }
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
  }, [isAuthenticated, refreshUserCostCenter])

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
      // Visual lock follows the IP-mapped branch; override is session-only.
      if (ipMappedCostCenter) {
        setIpBranchOverride(Boolean(value && value !== ipMappedCostCenter))
      }
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

  const title = onIpHomeBranch
    ? 'Branch set from your network IP — click to change'
    : ipOverrideActive
      ? 'Branch manually changed — select network branch to restore lock'
      : selected
        ? `Branch: ${activeLabel}`
        : undefined

  const trailingIcon = onIpHomeBranch ? (
    <Lock className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
  ) : ipOverrideActive ? (
    <LockOpen className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
  ) : (
    <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
  )

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
          title={title}
        >
          <Building2 className="h-4 w-4 shrink-0 opacity-80" />
          <span className={`flex-1 truncate ${selected ? '' : 'text-white/70'}`}>{activeLabel}</span>
          {trailingIcon}
        </button>
        {open && (
          <div className="absolute bottom-full left-0 right-0 z-[110] mb-1 max-h-52 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-xl">
            <BranchOption label="Select Branch" active={!selected} onSelect={() => void handleSelect('')} />
            {branches.map((b) => (
              <BranchOption
                key={b.name}
                label={b.label}
                active={selected === b.name}
                ipHome={Boolean(ipMappedCostCenter && b.name === ipMappedCostCenter)}
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
        title={title}
      >
        <Building2 className="h-4 w-4 shrink-0 text-slate-500" />
        <span className={`flex-1 truncate text-left ${selected ? '' : 'text-slate-400'}`}>
          {saving ? 'Saving…' : activeLabel}
        </span>
        <span className="text-slate-500">{trailingIcon}</span>
      </button>
      {open && (
        <div className="absolute top-full right-0 z-[110] mt-1 w-full max-h-60 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-xl">
          <BranchOption label="Select Branch" active={!selected} onSelect={() => void handleSelect('')} />
          {branches.map((b) => (
            <BranchOption
              key={b.name}
              label={b.label}
              active={selected === b.name}
              ipHome={Boolean(ipMappedCostCenter && b.name === ipMappedCostCenter)}
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
  ipHome,
  onSelect,
}: {
  label: string
  active: boolean
  ipHome?: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex min-h-[2.25rem] w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
        active ? 'bg-primary/10 text-primary font-medium' : 'text-gray-800 hover:bg-gray-50'
      }`}
    >
      <span className="flex-1 truncate">{label || ' '}</span>
      {ipHome ? <Lock className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden /> : null}
    </button>
  )
}

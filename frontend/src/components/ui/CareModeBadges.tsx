import type { CareMode } from '../../providers/CareContextProvider'

export function CareModeBadges({
  mode,
  isIOPVisit = false,
  className = '',
}: {
  mode: CareMode
  isIOPVisit?: boolean
  className?: string
}) {
  if (mode === 'IP') {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 ${className}`.trim()}
      >
        IP Mode Active
      </span>
    )
  }

  if (mode === 'OP' && isIOPVisit) {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium text-violet-800 ${className}`.trim()}
      >
        IOP Mode Active
      </span>
    )
  }

  if (mode === 'OP') {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 ${className}`.trim()}
      >
        OP Mode Active
      </span>
    )
  }

  return null
}

export function careModeVisitLabel(mode: CareMode, isIOPVisit = false): string {
  if (mode === 'IP') return 'IP admission'
  if (mode === 'OP' && isIOPVisit) return 'IOP visit'
  if (mode === 'OP') return 'OP visit'
  return 'visit'
}

import { useCareModeSelection } from '../../hooks/useCareModeSelection'
import { useAppShell } from '../../contexts/AppShellContext'

/** OP / IP selection inside the mobile sidebar (not in the top header). */
export function SidebarCareModePicker() {
  const { mode, costCenterCareScope, selectOp, selectIp, clearMode } = useCareModeSelection()
  const shell = useAppShell()

  const showOp = costCenterCareScope !== 'ip_only'
  const showIp = costCenterCareScope !== 'op_only'
  if (!showOp && !showIp) return null

  const pillClass = (active: boolean) =>
    `flex-1 rounded-md px-3 py-2 text-sm font-semibold border transition-colors ${
      active
        ? 'bg-green-200 text-primary border-green-200/80 shadow-sm'
        : 'bg-white/10 text-white border-white/30 hover:bg-white/20'
    }`

  const onPick = (fn: () => void) => {
    fn()
    shell?.closeSidebar()
  }

  return (
    <div className="md:hidden border-b border-white/10 px-3 py-3 flex flex-col gap-2 flex-shrink-0">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-white/60 px-0.5">
        Care context
      </p>
      <div className="flex gap-2">
        {showOp && (
          <button type="button" onClick={() => onPick(selectOp)} className={pillClass(mode === 'OP')}>
            Outpatient (OP)
          </button>
        )}
        {showIp && (
          <button type="button" onClick={() => onPick(selectIp)} className={pillClass(mode === 'IP')}>
            Inpatient (IP)
          </button>
        )}
      </div>
      {mode && (
        <button
          type="button"
          onClick={() => onPick(clearMode)}
          className="text-xs text-white/70 hover:text-white text-left px-0.5"
        >
          Clear {mode} context
        </button>
      )}
    </div>
  )
}

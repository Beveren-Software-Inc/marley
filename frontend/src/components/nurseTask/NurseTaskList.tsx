import { useEffect, useState, useCallback } from 'react'
import { fetchNurseTasks, updateNurseTaskStatus, type NurseTask } from '../../services/nurseTask'
import { useCardFilters } from '../../contexts/CardFilterContext'
import { ClearFiltersButton } from '../ui/ClearFiltersButton'
import { toast } from '../../hooks/useToast'
import { useBlockIfEditingLocked } from '../../hooks/useBlockIfEditingLocked'
import { DateFilterInput } from '../ui/DateFilterInput'

const TASK_TYPE_ICONS: Record<string, string> = {
  'Medication Administration': '💊',
  'Vital Monitoring': '🩺',
  'Therapy Assistance': '🧠',
  'Grooming / Care': '🛁',
  'Lab Support': '🧪',
  'Documentation': '📝',
}

const STATUS_COLORS: Record<string, string> = {
  Pending: 'bg-amber-100 text-amber-800 border-amber-200',
  'In Progress': 'bg-blue-100 text-blue-800 border-blue-200',
  Completed: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  Missed: 'bg-red-100 text-red-800 border-red-200',
  Cancelled: 'bg-slate-100 text-slate-700 border-slate-200',
}

const PRIORITY_COLORS: Record<string, string> = {
  Routine: 'text-slate-400',
  Urgent: 'text-amber-600 font-semibold',
  STAT: 'text-red-600 font-bold',
}

const ALL_STATUSES = ['', 'Pending', 'In Progress', 'Completed', 'Missed', 'Cancelled']
const NEXT_STATUSES = ['Pending', 'In Progress', 'Completed', 'Missed', 'Cancelled']
const TASK_TYPES = [
  '',
  'Medication Administration',
  'Vital Monitoring',
  'Therapy Assistance',
  'Grooming / Care',
  'Lab Support',
  'Documentation',
]

const FilterToggleButton = ({
  active,
  onClick,
}: {
  active: boolean
  onClick: () => void
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`rounded-md border p-1.5 transition-colors ${
      active ? 'border-primary bg-primary/10 text-primary' : 'border-slate-300 text-slate-500 hover:bg-slate-50'
    }`}
    title={active ? 'Hide filters' : 'Show filters'}
    aria-label={active ? 'Hide filters' : 'Show filters'}
  >
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z"
      />
    </svg>
  </button>
)

// ─── Circular completion tick button ──────────────────────────────────────────
const TickButton = ({
  status,
  disabled,
  onClick,
}: {
  status: string
  disabled: boolean
  onClick: () => void
}) => {
  const isCompleted = status === 'Completed'
  const isMissed = status === 'Missed'
  const isCancelled = status === 'Cancelled'

  if (isCancelled) {
    return (
      <div className="w-7 h-7 rounded-full border-2 border-slate-300 bg-slate-100 flex items-center justify-center shrink-0" title="Cancelled">
        <svg className="w-3.5 h-3.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </div>
    )
  }

  if (isMissed) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        title="Mark as Completed"
        className="w-7 h-7 rounded-full border-2 border-red-300 bg-red-50 flex items-center justify-center shrink-0 hover:border-emerald-400 hover:bg-emerald-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed group"
      >
        <svg className="w-3.5 h-3.5 text-red-400 group-hover:text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M5.07 19H19a2 2 0 001.73-3L13.73 4a2 2 0 00-3.46 0L3.27 16A2 2 0 005.07 19z" />
        </svg>
      </button>
    )
  }

  if (isCompleted) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        title="Mark as Pending (undo)"
        className="w-7 h-7 rounded-full border-2 border-emerald-500 bg-emerald-500 flex items-center justify-center shrink-0 hover:bg-emerald-600 hover:border-emerald-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </button>
    )
  }

  // Pending or In Progress
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title="Mark as Completed"
      className="w-7 h-7 rounded-full border-2 border-slate-300 bg-white flex items-center justify-center shrink-0 hover:border-emerald-400 hover:bg-emerald-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed group"
    >
      <svg className="w-4 h-4 text-transparent group-hover:text-emerald-400 transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    </button>
  )
}

// ─── Inline status changer dropdown ───────────────────────────────────────────
const StatusDropdown = ({
  current,
  disabled,
  onChange,
}: {
  current: string
  disabled: boolean
  onChange: (s: string) => void
}) => (
  <select
    value={current}
    disabled={disabled}
    onChange={(e) => onChange(e.target.value)}
    className="rounded-md border border-slate-200 px-2 py-0.5 text-[11px] font-medium bg-white focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 cursor-pointer"
    onClick={(e) => e.stopPropagation()}
  >
    {NEXT_STATUSES.map((s) => (
      <option key={s} value={s}>{s}</option>
    ))}
  </select>
)

// ─── Props ────────────────────────────────────────────────────────────────────
interface NurseTaskListProps {
  patient?: string
  myTasks?: boolean
  allowStatusChange?: boolean
  refreshKey?: number
  onRefresh?: () => void
  title?: string
  onAdd?: () => void
  addButtonTitle?: string
}

export const NurseTaskList = ({
  patient,
  myTasks,
  allowStatusChange = false,
  refreshKey,
  onRefresh,
  title = 'Nurse Tasks',
  onAdd,
  addButtonTitle = 'New Task',
}: NurseTaskListProps) => {
  const blockIfEditingLocked = useBlockIfEditingLocked()
  const cardFilters = useCardFilters()
  const inDashboardCard = cardFilters !== undefined
  const [showFiltersInternal, setShowFiltersInternal] = useState(false)
  const showFilters = inDashboardCard ? cardFilters : showFiltersInternal

  const [tasks, setTasks] = useState<NurseTask[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [taskTypeFilter, setTaskTypeFilter] = useState<string>('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [updatingName, setUpdatingName] = useState<string | null>(null)

  const hasActiveFilters = Boolean(statusFilter || taskTypeFilter || dateFrom || dateTo)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await fetchNurseTasks({
        patient,
        status: statusFilter || undefined,
        task_type: taskTypeFilter || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        my_tasks: !!myTasks,
        limit: 100,
      })
      setTasks(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load nurse tasks')
    } finally {
      setLoading(false)
    }
  }, [patient, myTasks, statusFilter, taskTypeFilter, dateFrom, dateTo])

  useEffect(() => {
    load()
  }, [load, refreshKey])

  const clearFilters = () => {
    setStatusFilter('')
    setTaskTypeFilter('')
    setDateFrom('')
    setDateTo('')
  }

  const changeStatus = useCallback(async (task: NurseTask, newStatus: string) => {
    if (newStatus === task.status) return
    try {
      blockIfEditingLocked()
    } catch {
      return
    }
    setUpdatingName(task.name)
    try {
      await updateNurseTaskStatus(task.name, newStatus)
      toast.success(`Task marked as ${newStatus}`)
      load()
      onRefresh?.()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update status')
    } finally {
      setUpdatingName(null)
    }
  }, [load, onRefresh, blockIfEditingLocked])

  const toggleComplete = useCallback((task: NurseTask) => {
    const next = task.status === 'Completed' ? 'Pending' : 'Completed'
    changeStatus(task, next)
  }, [changeStatus])

  const formatDateTime = (dt?: string) => {
    if (!dt) return '—'
    try {
      return new Date(dt).toLocaleString('en-GB')
    } catch { return dt }
  }

  const openForm = (name: string) =>
    window.open(`/app/nurse-task/${encodeURIComponent(name)}`, '_blank')

  const completedCount = tasks.filter((t) => t.status === 'Completed').length

  return (
    <div className="flex flex-col gap-4">
      {!inDashboardCard && (
        <div className="flex flex-shrink-0 items-center justify-between gap-2">
          <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
          <div className="flex shrink-0 items-center gap-2">
            <FilterToggleButton
              active={Boolean(showFilters)}
              onClick={() => setShowFiltersInternal((prev) => !prev)}
            />
            {onAdd ? (
              <button
                type="button"
                onClick={onAdd}
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary text-lg font-bold text-white transition-colors hover:bg-primary/90"
                title={addButtonTitle}
              >
                +
              </button>
            ) : null}
          </div>
        </div>
      )}

      {showFilters ? (
        <div className="card-filter-bar flex flex-shrink-0 flex-wrap items-end gap-3 rounded-md border-b border-slate-100 bg-slate-50/80 px-1 py-2">
          <div className="flex min-w-[130px] flex-col gap-1">
            <label className="text-xs font-medium text-slate-500">From Date</label>
            <DateFilterInput
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
            />
          </div>
          <div className="flex min-w-[130px] flex-col gap-1">
            <label className="text-xs font-medium text-slate-500">To Date</label>
            <DateFilterInput
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
            />
          </div>
          <div className="flex min-w-[140px] flex-col gap-1">
            <label className="text-xs font-medium text-slate-500">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
            >
              {ALL_STATUSES.map((s) => (
                <option key={s || '__all'} value={s}>
                  {s || 'All'}
                </option>
              ))}
            </select>
          </div>
          <div className="flex min-w-[180px] flex-col gap-1">
            <label className="text-xs font-medium text-slate-500">Task type</label>
            <select
              value={taskTypeFilter}
              onChange={(e) => setTaskTypeFilter(e.target.value)}
              className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
            >
              {TASK_TYPES.map((t) => (
                <option key={t || '__all'} value={t}>
                  {t || 'All'}
                </option>
              ))}
            </select>
          </div>
          {hasActiveFilters ? <ClearFiltersButton onClick={clearFilters} /> : null}
        </div>
      ) : null}

      {!loading && !error && tasks.length > 0 ? (
        <p className="text-xs text-slate-500">
          {tasks.length} task{tasks.length !== 1 ? 's' : ''}
          {completedCount > 0 ? (
            <span className="ml-1.5 font-medium text-emerald-600">· {completedCount} done</span>
          ) : null}
        </p>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 py-6 text-sm text-slate-500">
          <svg className="h-4 w-4 animate-spin text-primary" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          Loading tasks…
        </div>
      ) : null}

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      ) : null}

      {!loading && !error && tasks.length === 0 ? (
        <div className="text-center py-10 border-2 border-dashed border-slate-200 rounded-lg text-slate-400 text-sm">
          NO NURSE TASKS FOUND.
        </div>
      ) : null}

      {!loading && !error && tasks.length > 0 ? (
        <div className="grid gap-2">
          {tasks.map((task) => {
            const icon = TASK_TYPE_ICONS[task.task_type] || '📋'
            const statusCls = STATUS_COLORS[task.status] || 'bg-slate-100 text-slate-700 border-slate-200'
            const priorityCls = PRIORITY_COLORS[task.priority || 'Routine'] || 'text-slate-400'
            const isCompleted = task.status === 'Completed'
            const isUpdating = updatingName === task.name

            return (
              <div
                key={task.name}
                className={`border rounded-lg bg-white shadow-sm p-3 flex gap-3 transition-colors ${
                  isCompleted ? 'border-emerald-200 bg-emerald-50/30' : 'border-slate-200'
                }`}
              >
                {/* ── Completion tick ── */}
                <div className="flex items-start pt-0.5 shrink-0">
                  <TickButton
                    status={task.status}
                    disabled={isUpdating}
                    onClick={() => toggleComplete(task)}
                  />
                </div>

                {/* ── Main content ── */}
                <div className="flex-1 min-w-0 space-y-1">
                  {/* Title row */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-base leading-none shrink-0">{icon}</span>
                      <span className={`text-sm font-semibold truncate ${isCompleted ? 'line-through text-slate-400' : 'text-slate-900'}`}>
                        {task.task_type}
                      </span>
                      {!!task.is_prn && (
                        <span className="inline-flex items-center rounded bg-amber-100 text-amber-700 border border-amber-200 px-1.5 py-0.5 text-[10px] font-semibold shrink-0">
                          PRN
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* Status pill / dropdown */}
                      {allowStatusChange ? (
                        <StatusDropdown
                          current={task.status}
                          disabled={isUpdating}
                          onChange={(s) => changeStatus(task, s)}
                        />
                      ) : (
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusCls}`}>
                          {task.status}
                        </span>
                      )}
                      {/* Edit / open form button */}
                      <button
                        type="button"
                        onClick={() => openForm(task.name)}
                        title="Open in Frappe"
                        className="w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* Description */}
                  {task.description && (
                    <p className={`text-xs line-clamp-2 ${isCompleted ? 'text-slate-400' : 'text-slate-600'}`}>
                      {task.description}
                    </p>
                  )}

                  {/* Meta chips */}
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
                    {!patient && task.patient_name && (
                      <span><span className="font-medium text-slate-600">Patient:</span> {task.patient_name}</span>
                    )}
                    <span>
                      <span className="font-medium text-slate-600">Scheduled:</span>{' '}
                      {formatDateTime(task.scheduled_time)}
                    </span>
                    <span>
                      <span className="font-medium text-slate-600">Nurse:</span>{' '}
                      {task.assigned_nurse_name
                        ? task.assigned_nurse_name
                        : <span className="italic text-slate-400">Not assigned</span>
                      }
                    </span>
                    {task.medication_name && (
                      <span>
                        <span className="font-medium text-slate-600">Med:</span> {task.medication_name}
                        {task.dosage ? ` · ${task.dosage}` : ''}
                        {task.route ? ` (${task.route})` : ''}
                      </span>
                    )}
                    {task.completed_time && (
                      <span className="text-emerald-600">
                        <span className="font-medium">Done:</span> {formatDateTime(task.completed_time)}
                      </span>
                    )}
                    <span className={`font-medium ${priorityCls}`}>{task.priority}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

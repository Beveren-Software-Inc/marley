import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { CM_BTN_CANCEL, CM_BTN_PRIMARY, CREATE_MODAL_OVERLAY_STACK, createModalShellClass } from './CreateModalChrome'

export interface ConfirmActionModalProps {
  open: boolean
  title: string
  subtitle?: string
  icon?: ReactNode
  tone?: 'danger' | 'warning' | 'primary'
  loading?: boolean
  confirmLabel?: string
  cancelLabel?: string
  onClose: () => void
  onConfirm: () => void
  children: ReactNode
}

export function ConfirmActionModal({
  open,
  title,
  subtitle,
  icon,
  tone = 'warning',
  loading = false,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onClose,
  onConfirm,
  children,
}: ConfirmActionModalProps) {
  if (!open) return null

  const toneClasses = {
    danger: {
      header: 'from-red-100 via-rose-50 to-orange-50 border-red-100/60',
      ring: 'border-red-200/60 ring-red-100/80 shadow-red-600/10',
      icon: 'bg-red-500/15 ring-red-400/40 text-red-700',
      title: 'text-red-950',
      subtitle: 'text-red-800/80',
      confirm:
        'rounded-lg bg-red-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-red-600/25 transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50',
    },
    warning: {
      header: 'from-amber-100 via-orange-50 to-yellow-50 border-amber-100/60',
      ring: 'border-amber-200/60 ring-amber-100/80 shadow-amber-600/10',
      icon: 'bg-amber-500/15 ring-amber-400/40 text-amber-800',
      title: 'text-amber-950',
      subtitle: 'text-amber-900/80',
      confirm:
        'rounded-lg bg-amber-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-amber-600/25 transition hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-50',
    },
    primary: {
      header: 'from-emerald-100 via-teal-50 to-sky-100 border-emerald-100/60',
      ring: 'border-emerald-200/60 ring-emerald-100/80 shadow-emerald-600/10',
      icon: 'bg-emerald-500/20 ring-emerald-400/40 text-emerald-700',
      title: 'text-emerald-950',
      subtitle: 'text-emerald-800/80',
      confirm: CM_BTN_PRIMARY + ' disabled:cursor-not-allowed disabled:opacity-50',
    },
  }[tone]

  return (
    <div className={CREATE_MODAL_OVERLAY_STACK} role="dialog" aria-modal="true" onClick={onClose}>
      <div
        className={createModalShellClass(`max-w-md overflow-hidden ${toneClasses.ring}`)}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`relative border-b bg-gradient-to-r px-5 py-4 sm:px-6 ${toneClasses.header}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              {icon ? (
                <div
                  className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ${toneClasses.icon}`}
                >
                  {icon}
                </div>
              ) : null}
              <div className="min-w-0">
                <h2 className={`text-lg font-semibold tracking-tight ${toneClasses.title}`}>{title}</h2>
                {subtitle ? <p className={`mt-1 text-sm ${toneClasses.subtitle}`}>{subtitle}</p> : null}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="shrink-0 rounded-lg p-2 text-slate-500 transition hover:bg-black/5 hover:text-slate-800 disabled:opacity-50"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="space-y-4 px-5 py-5 sm:px-6">{children}</div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/80 px-5 py-4 sm:px-6">
          <button type="button" onClick={onClose} disabled={loading} className={CM_BTN_CANCEL}>
            {cancelLabel}
          </button>
          <button type="button" onClick={onConfirm} disabled={loading} className={toneClasses.confirm}>
            {loading ? 'Please wait…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

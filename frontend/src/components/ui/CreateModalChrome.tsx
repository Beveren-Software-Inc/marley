import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

/** Backdrop — centered create / edit dialogs; scrollable on small screens */
export const CREATE_MODAL_OVERLAY =
  'fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-primary/15 p-3 sm:items-center sm:p-4 backdrop-blur-[2px]'

/** Tall tabbed create dialogs — capped height with internal scroll + pinned footer */
export const CREATE_MODAL_TABBED_SHELL =
  'max-w-2xl w-full max-h-[min(90dvh,calc(100vh-1.5rem))] overflow-hidden my-auto'

/** Scrollable body for tabbed create dialogs */
export const CREATE_MODAL_TABBED_BODY =
  'flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5 space-y-4 bg-gradient-to-b from-emerald-50/40 via-white to-teal-50/30'

/** Nested modal (e.g. confirm on top of create) */
export const CREATE_MODAL_OVERLAY_STACK =
  'fixed inset-0 z-[60] flex items-center justify-center bg-primary/15 p-4 backdrop-blur-[2px]'

/** Backdrop — detail slide-over from the right (padding on all sides so panel is not flush-left). */
export const DETAIL_PANEL_OVERLAY =
  'fixed inset-0 z-[70] flex items-stretch justify-end bg-primary/10 p-2 sm:p-3 backdrop-blur-[2px]'

/**
 * Inner card shell — emerald ring, soft shadow (Clinical Suicide Risk / Service Request style).
 * Includes `data-healthcare-modal` so global field hover/focus styles apply.
 */
export function createModalShellClass(parts: string) {
  const p = parts.trim()
  const base =
    'data-healthcare-modal flex w-full flex-col rounded-2xl border border-emerald-200/60 bg-white shadow-2xl shadow-emerald-600/10 ring-1 ring-emerald-100/80'
  return `${base} ${p}`.replace(/\s+/g, ' ').trim()
}

/** Detail slide-over shell — same chrome as create modals */
export function detailPanelShellClass(parts = 'max-w-2xl') {
  const p = parts.trim()
  return [
    'data-healthcare-modal',
    'healthcare-detail-panel-in',
    'relative z-10 flex h-full w-full flex-col overflow-hidden',
    'rounded-none border border-emerald-200/60 bg-white',
    'shadow-2xl shadow-emerald-600/10 ring-1 ring-emerald-100/80',
    'sm:rounded-l-2xl',
    p,
  ]
    .filter(Boolean)
    .join(' ')
}

/** Main scrollable form body gradient */
export const CREATE_MODAL_BODY_GRADIENT =
  'flex min-h-0 flex-1 flex-col overflow-y-auto bg-gradient-to-b from-emerald-50/40 via-white to-teal-50/30'

/** Sticky footer bar */
export const CREATE_MODAL_FOOTER_STICKY =
  'sticky bottom-0 flex shrink-0 flex-wrap gap-2 border-t border-emerald-100 bg-gradient-to-r from-white via-emerald-50/50 to-teal-50/40 px-4 py-3 backdrop-blur sm:gap-3 sm:px-6'

export const CM_BTN_CANCEL =
  'rounded-lg border border-emerald-200/80 bg-white px-4 py-2.5 text-sm font-medium text-emerald-900 shadow-sm transition hover:bg-emerald-50'

export const CM_BTN_PRIMARY =
  'rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-emerald-600/30 transition hover:from-emerald-500 hover:to-teal-500 disabled:cursor-not-allowed disabled:opacity-50'

/** Standard text field — emerald hover/focus (matches Create Prescription / link combobox) */
export const MODAL_FIELD_CLASS =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 hover:border-emerald-300/80 focus:border-emerald-400/80 focus:outline-none focus:ring-2 focus:ring-emerald-500/25 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500'

export const MODAL_FIELD_CLASS_COMPACT = `${MODAL_FIELD_CLASS} py-1.5`

export const MODAL_TEXTAREA_CLASS = `${MODAL_FIELD_CLASS} resize-y min-h-[5rem]`

export const MODAL_SELECT_CLASS = MODAL_FIELD_CLASS

export const MODAL_LABEL_CLASS = 'mb-1 block text-sm font-medium text-slate-700'

export const MODAL_LABEL_REQUIRED_CLASS = 'text-red-500'

export const MODAL_SECTION_CLASS =
  'rounded-xl border border-emerald-100/80 bg-white p-4 shadow-sm sm:p-5'

export const MODAL_SECTION_TITLE_CLASS =
  'mb-3 flex items-center gap-2 text-sm font-semibold text-emerald-950'

export const MODAL_ERROR_BOX_CLASS =
  'rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700'

/** Validation / API errors pinned under the modal title (always visible while scrolling). */
export const CREATE_MODAL_HEADER_ALERT_CLASS =
  'mt-3 rounded-lg border border-red-300/90 bg-red-50 px-3 py-2.5 text-sm font-medium leading-snug text-red-900 shadow-sm ring-1 ring-red-200/80'

export type CreateModalHeaderProps = {
  title: ReactNode
  subtitle?: ReactNode
  icon?: ReactNode
  onClose: () => void
  /** Extra actions to the left of the close button (e.g. print) */
  trailing?: ReactNode
  /** Validation or save error — shown in the fixed header, above scrollable body */
  alert?: ReactNode
  /** Tabs or other content below the title row (still inside gradient header) */
  children?: ReactNode
}

/** Tab bar row — use inside CreateModalHeader children or below it */
export const CREATE_MODAL_TAB_BAR =
  'flex shrink-0 border-b border-emerald-100/60 bg-white/60 backdrop-blur-sm'

/** Active / inactive tab button classes */
export function createModalTabButtonClass(active: boolean) {
  return `flex items-center gap-1.5 whitespace-nowrap border-b-2 px-5 py-3 text-sm font-medium transition-colors ${
    active
      ? 'border-emerald-600 text-emerald-700'
      : 'border-transparent text-slate-500 hover:border-emerald-200/80 hover:text-emerald-800'
  }`
}

/** Header row — gradient + radial accent (Clinical Suicide Risk Assessment style) */
export function CreateModalHeader({
  title,
  subtitle,
  icon,
  onClose,
  trailing,
  alert,
  children,
}: CreateModalHeaderProps) {
  return (
    <div className="relative z-10 shrink-0 border-b border-emerald-100/60 bg-gradient-to-r from-emerald-100 via-teal-50 to-sky-100">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(16,185,129,0.18),transparent_55%)]" />
      <div className="relative px-5 py-4 sm:px-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            {icon != null ? (
              <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 ring-1 ring-emerald-400/40">
                {icon}
              </div>
            ) : null}
            <div className="min-w-0">
              <h2 className="text-lg font-semibold tracking-tight text-emerald-950">{title}</h2>
              {subtitle != null ? <div className="mt-0.5 text-sm text-emerald-800/80">{subtitle}</div> : null}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {trailing}
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-lg p-2 text-emerald-800/70 transition hover:bg-emerald-200/50 hover:text-emerald-950"
              aria-label="Close"
            >
              <X className="h-5 w-5" strokeWidth={2} />
            </button>
          </div>
        </div>
        {alert != null ? (
          <div className={CREATE_MODAL_HEADER_ALERT_CLASS} role="alert" aria-live="polite">
            {alert}
          </div>
        ) : null}
        {children}
      </div>
    </div>
  )
}

export type CreateModalFooterProps = {
  hint?: ReactNode
  children: ReactNode
  className?: string
}

/** Sticky footer with cancel + green primary actions */
export function CreateModalFooter({ hint, children, className = '' }: CreateModalFooterProps) {
  return (
    <div className={`${CREATE_MODAL_FOOTER_STICKY} items-center justify-between gap-3 ${className}`.trim()}>
      {hint != null ? <div className="text-xs text-emerald-800/60">{hint}</div> : <span />}
      <div className="flex flex-wrap items-center justify-end gap-3">{children}</div>
    </div>
  )
}

export type DetailSlideOverProps = {
  title: ReactNode
  subtitle?: ReactNode
  icon?: ReactNode
  headerActions?: ReactNode
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  /** Tailwind max-width fragment, e.g. `max-w-2xl` or `max-w-md` */
  maxWidthClass?: string
}

/** Right-hand detail panel — same header/body chrome as create modals */
export function DetailSlideOver({
  title,
  subtitle,
  icon,
  headerActions,
  onClose,
  children,
  footer,
  maxWidthClass = 'max-w-2xl',
}: DetailSlideOverProps) {
  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      className={DETAIL_PANEL_OVERLAY}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className={detailPanelShellClass(maxWidthClass)}
        onClick={(e) => e.stopPropagation()}
      >
        <CreateModalHeader
          title={title}
          subtitle={subtitle}
          icon={icon}
          onClose={onClose}
          trailing={headerActions}
        />
        <div className={`${CREATE_MODAL_BODY_GRADIENT} min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6 sm:py-5`}>
          {children}
        </div>
        {footer != null ? (
          <div className={`${CREATE_MODAL_FOOTER_STICKY} justify-end`}>{footer}</div>
        ) : null}
      </div>
    </div>,
    document.body
  )
}

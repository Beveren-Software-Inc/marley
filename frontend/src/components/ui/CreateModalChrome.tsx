import type { ReactNode } from 'react'
import { X } from 'lucide-react'

/** Backdrop — matches Create Service Request */
export const CREATE_MODAL_OVERLAY =
  'fixed inset-0 z-50 flex items-center justify-center bg-primary/15 p-4 backdrop-blur-[2px]'

/** Nested modal (e.g. confirm on top of create) */
export const CREATE_MODAL_OVERLAY_STACK =
  'fixed inset-0 z-[60] flex items-center justify-center bg-primary/15 p-4 backdrop-blur-[2px]'

/**
 * Inner card shell — emerald ring, soft shadow (same as Create Service Request).
 * Pass sizing / overflow tailwind, e.g. `max-w-2xl max-h-[90vh] overflow-hidden` or `max-w-3xl h-[85vh] overflow-hidden`.
 */
export function createModalShellClass(parts: string) {
  const p = parts.trim()
  const base =
    'flex w-full flex-col rounded-2xl border border-emerald-200/60 bg-white shadow-2xl shadow-emerald-600/10 ring-1 ring-emerald-100/80'
  return `${base} ${p}`.replace(/\s+/g, ' ').trim()
}

/** Main scrollable form body gradient */
export const CREATE_MODAL_BODY_GRADIENT =
  'flex min-h-0 flex-1 flex-col overflow-y-auto bg-gradient-to-b from-emerald-50/40 via-white to-teal-50/30'

/** Sticky footer bar — merge layout: e.g. \`${CREATE_MODAL_FOOTER_STICKY} items-center justify-between\` */
export const CREATE_MODAL_FOOTER_STICKY =
  'sticky bottom-0 flex shrink-0 flex-wrap gap-2 border-t border-emerald-100 bg-gradient-to-r from-white via-emerald-50/50 to-teal-50/40 px-4 py-3 backdrop-blur sm:gap-3 sm:px-6'

export const CM_BTN_CANCEL =
  'rounded-lg border border-emerald-200/80 bg-white px-4 py-2.5 text-sm font-medium text-emerald-900 shadow-sm transition hover:bg-emerald-50'

export const CM_BTN_PRIMARY =
  'rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-emerald-600/30 transition hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50'

export type CreateModalHeaderProps = {
  title: ReactNode
  subtitle?: ReactNode
  icon?: ReactNode
  onClose: () => void
}

/** Header row — gradient + radial accent + optional icon slot (Create Service Request style) */
export function CreateModalHeader({ title, subtitle, icon, onClose }: CreateModalHeaderProps) {
  return (
    <div className="relative shrink-0 bg-gradient-to-r from-emerald-100 via-teal-50 to-sky-100 px-5 py-4 sm:px-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(16,185,129,0.18),transparent_55%)]" />
      <div className="relative flex items-start justify-between gap-3">
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
  )
}

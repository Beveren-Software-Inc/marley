import { Link } from 'react-router-dom'
import { Landmark, UsersRound } from 'lucide-react'

export type BillingSpecialtySection = 'additional' | 'internal'

function receptionHref(screen: string, patient?: string) {
  const sp = new URLSearchParams()
  sp.set('screen', screen)
  if (patient) sp.set('patient', patient)
  return `/reception?${sp.toString()}`
}

interface BillingSpecialtyNavCardsProps {
  active: BillingSpecialtySection
  patient?: string
}

/** Density aligned with BillingDashboard QuickActionCard / nav chips */
export function BillingSpecialtyNavCards({ active, patient }: BillingSpecialtyNavCardsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5">
      <Link
        to={receptionHref('billing-additional-collection', patient)}
        className={`group rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:shadow-md hover:border-primary/30 flex gap-3 items-center ${
          active === 'additional' ? 'ring-1 ring-primary border-primary/40 bg-primary/[0.04]' : ''
        }`}
      >
        <div
          className={`rounded-lg p-2 shrink-0 ${active === 'additional' ? 'bg-primary text-white' : 'bg-slate-100 text-primary group-hover:bg-primary/10'}`}
        >
          <Landmark className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-800">Additional collection</p>
          <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
            Cross–cost center receipts (<span className="font-medium text-slate-600">Created At</span> cost center).
          </p>
        </div>
      </Link>

      <Link
        to={receptionHref('billing-internal-employee', patient)}
        className={`group rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:shadow-md hover:border-primary/30 flex gap-3 items-center ${
          active === 'internal' ? 'ring-1 ring-primary border-primary/40 bg-primary/[0.04]' : ''
        }`}
      >
        <div
          className={`rounded-lg p-2 shrink-0 ${active === 'internal' ? 'bg-primary text-white' : 'bg-slate-100 text-primary group-hover:bg-primary/10'}`}
        >
          <UsersRound className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-800">Internal employee billing</p>
          <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">Staff meds/services — summary and history.</p>
        </div>
      </Link>
    </div>
  )
}

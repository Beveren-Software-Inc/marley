import { Bed, CalendarClock, NotebookPen, type LucideIcon } from 'lucide-react'
import type { TherapyNotesView } from '../../hooks/useNotesViewPreference'

type ViewButtonProps = {
  label: string
  title: string
  active: boolean
  icon: LucideIcon
  onClick: () => void
}

function ViewButton({ label, title, active, icon: Icon, onClick }: ViewButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={title}
      className={`h-6 px-2 rounded-md border flex items-center gap-1 text-[10px] font-semibold transition-colors shrink-0 ${
        active
          ? 'border-primary bg-primary/10 text-primary'
          : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
      }`}
    >
      <Icon className="w-3 h-3" />
      <span className="whitespace-nowrap">{label}</span>
    </button>
  )
}

/**
 * Header buttons that swap the card body between Therapy Notes, the patient's
 * admission cards, and the patient's OP visit cards. There is no dropdown —
 * each button replaces the listing in place.
 */
export function TherapyNotesViewToggle({
  view,
  onChange,
}: {
  view: TherapyNotesView
  onChange: (view: TherapyNotesView) => void
}) {
  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <ViewButton
        label="Notes"
        title="Show notes"
        active={view === 'notes'}
        icon={NotebookPen}
        onClick={() => onChange('notes')}
      />
      <ViewButton
        label="Admission"
        title="Show admission cards"
        active={view === 'admission'}
        icon={Bed}
        onClick={() => onChange('admission')}
      />
      <ViewButton
        label="OP Visit"
        title="Show OP visit cards"
        active={view === 'visit'}
        icon={CalendarClock}
        onClick={() => onChange('visit')}
      />
    </div>
  )
}

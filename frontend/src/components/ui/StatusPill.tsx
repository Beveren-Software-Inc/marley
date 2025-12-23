import { colors } from '@theme/colors'

const map: Record<string, string> = {
  Open: colors.warning,
  Approved: colors.success,
  Rejected: colors.danger,
  Cancelled: colors.danger,
  Ordered: colors.warning,
  Completed: colors.primary,
  'In Progress': colors.info
}

export const StatusPill = ({ label }: { label: string }) => {
  const bg = map[label] ?? colors.surface
  return (
    <span
      style={{
        background: bg,
        color: '#fff',
        padding: '4px 8px',
        borderRadius: 999,
        fontSize: 12
      }}
    >
      {label}
    </span>
  )
}



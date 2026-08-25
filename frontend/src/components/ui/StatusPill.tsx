import { colors } from '../../theme/colors'

const colorMap: Record<string, string> = {
  warning: colors.warning,
  success: colors.success,
  danger: colors.danger,
  info: colors.info,
  primary: colors.primary,
  default: '#6B7280'
}

export const StatusPill = ({
  status,
  color,
  compact = false,
}: {
  status: string
  color?: string
  compact?: boolean
}) => {
  const bg = color ? colorMap[color] || color : colorMap.default
  return (
    <span
      className={
        compact
          ? 'inline-flex max-w-full items-center truncate rounded-full px-1.5 py-0 text-[10px] font-medium text-white'
          : 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium text-white'
      }
      style={{ backgroundColor: bg }}
      title={status}
    >
      {status}
    </span>
  )
}




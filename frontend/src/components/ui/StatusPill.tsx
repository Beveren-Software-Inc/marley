import { colors } from '../../theme/colors'

const colorMap: Record<string, string> = {
  warning: colors.warning,
  success: colors.success,
  danger: colors.danger,
  info: colors.info,
  primary: colors.primary,
  default: '#6B7280'
}

export const StatusPill = ({ status, color }: { status: string; color?: string }) => {
  const bg = color ? colorMap[color] || color : colorMap.default
  return (
    <span
      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium text-white"
      style={{ backgroundColor: bg }}
    >
      {status}
    </span>
  )
}




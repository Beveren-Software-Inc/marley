import type { ReactNode } from 'react'

type Props = { roles: string[]; children: ReactNode }

// For now, allow dummy access after login without strict role enforcement.
export const RoleGuard = ({ children }: Props) => {
  return <>{children}</>
}



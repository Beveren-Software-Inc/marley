import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../providers/AuthProvider'
import { canAccessRoute, getDefaultRouteForUser, isAdmin, isCEO } from '../config/permissions'

type Props = { roles?: string[]; children: ReactNode }

export const RoleGuard = ({ children }: Props) => {
  const { isAuthenticated, loading, user } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    // Redirect to login with return path
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  // If no user data yet, wait a bit more (user might still be loading)
  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading user data...</p>
        </div>
      </div>
    )
  }

  const userRoles = user.roles && user.roles.length > 0
    ? user.roles
    : [user.role, user.role_profile_name].filter(Boolean) as string[]

  const pathname = location.pathname

  // Strict CEO-only routes (no admin bypass)
  if ((pathname === '/staff-activity-audit' || pathname === '/ip-quotation') && !isCEO(userRoles)) {
    const defaultRoute = getDefaultRouteForUser(userRoles)
    return <Navigate to={defaultRoute} replace />
  }

  if (userRoles.length === 0) {
    return <Navigate to="/login" replace />
  }

  if (isAdmin(userRoles)) {
    return <>{children}</>
  }

  const allowed = canAccessRoute(pathname, userRoles)
  if (!allowed) {
    const defaultRoute = getDefaultRouteForUser(userRoles)
    return <Navigate to={defaultRoute} replace />
  }

  return <>{children}</>
}

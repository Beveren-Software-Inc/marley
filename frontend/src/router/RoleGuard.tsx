import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../providers/AuthProvider'

type Props = { roles?: string[]; children: ReactNode }

export const RoleGuard = ({ roles, children }: Props) => {
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

  // If roles are specified, check if user has one of the required roles
  if (roles && roles.length > 0 && user) {
    const userRole = user.role?.toLowerCase() || user.role_profile_name?.toLowerCase() || ''
    const userName = user.name?.toLowerCase() || ''
    
    // Allow Administrator or System Manager to access all pages
    const isAdmin = userName === 'administrator' || userRole.includes('administrator') || userRole.includes('system manager')
    
    if (isAdmin) {
      // Admin users can access all pages
      return <>{children}</>
    }
    
    const hasRole = roles.some(role => 
      userRole === role.toLowerCase() || 
      userRole.includes(role.toLowerCase())
    )

    if (!hasRole) {
      // User doesn't have required role, redirect to their default page based on role
      let defaultRoute = '/doctor' // Default fallback
      
      if (userRole.includes('nurse')) {
        defaultRoute = '/nurse'
      } else if (userRole.includes('lab')) {
        defaultRoute = '/lab'
      } else if (userRole.includes('pharmacist') || userRole.includes('pharmacy')) {
        defaultRoute = '/pharmacy'
      } else if (userRole.includes('admin') || userRole.includes('reception')) {
        defaultRoute = '/reception'
      } else if (userRole.includes('patient')) {
        defaultRoute = '/patient'
      }
      
      return <Navigate to={defaultRoute} replace />
    }
  }

  return <>{children}</>
}

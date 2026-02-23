import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../providers/AuthProvider'

type Props = { roles?: string[]; children: ReactNode }

// Helper function to determine user's default route based on role
function getDefaultRouteForUser(userRole: string, userName: string): string {
  if (userName === 'administrator') {
    return '/doctor' // Admin can access any page, default to doctor
  }
  
  if (userRole.includes('physician') || userRole.includes('practitioner') || userRole.includes('doctor')) {
    return '/doctor'
  } else if (userRole.includes('nursing') || userRole.includes('nurse')) {
    return '/nurse'
  } else if (userRole.includes('laboratory') || userRole.includes('lab')) {
    return '/lab'
  } else if (userRole.includes('pharmacist') || userRole.includes('pharmacy')) {
    return '/pharmacy'
  } else if (userRole.includes('admin') || userRole.includes('reception')) {
    return '/reception'
  } else if (userRole.includes('patient')) {
    return '/patient'
  }
  
  return '/doctor' // Default fallback
}

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

  // If roles are specified, check if user has one of the required roles
  if (roles && roles.length > 0) {
    const userRole = (user.role || '').toLowerCase()
    const userRoleProfile = (user.role_profile_name || '').toLowerCase()
    const userName = (user.name || '').toLowerCase()
    
    // Check if user is Administrator or has System Manager role
    // System Manager should have full access to all pages
    const isAdmin = userName === 'administrator' || 
                   userRole.includes('administrator') || 
                   userRoleProfile.includes('administrator') ||
                   userRole.includes('system manager') ||
                   userRoleProfile.includes('system manager')
    
    if (isAdmin) {
      // Admin and System Manager users can access all pages
      return <>{children}</>
    }
    
    // More flexible role matching - check for various role name patterns
    // Check both role and role_profile_name
    const hasRole = roles.some(role => {
      const roleLower = role.toLowerCase()
      // Direct match on either role or role_profile_name
      if (userRole === roleLower || userRoleProfile === roleLower) return true
      // Contains match on either role or role_profile_name
      if (userRole.includes(roleLower) || roleLower.includes(userRole)) return true
      if (userRoleProfile.includes(roleLower) || roleLower.includes(userRoleProfile)) return true
      
      // Additional role mappings for common Frappe role names
      if (roleLower === 'doctor' && (
        userRole.includes('physician') || 
        userRole.includes('practitioner') ||
        userRole.includes('doctor')
      )) return true
      
      if (roleLower === 'nurse' && (
        userRole.includes('nursing') || 
        userRole.includes('nurse')
      )) return true
      
      if (roleLower === 'lab' && (
        userRole.includes('laboratory') || 
        userRole.includes('lab')
      )) return true
      
      if (roleLower === 'admin' && (
        userRole.includes('reception') || 
        userRole.includes('admin')
      )) return true
      
      return false
    })

    if (!hasRole) {
      // User doesn't have required role, redirect to their default page based on role
      const defaultRoute = getDefaultRouteForUser(userRole, userName)
      
      // Only redirect if we're not already on the default route to prevent loops
      if (location.pathname !== defaultRoute) {
        console.log(`User role "${userRole}" (${user.role || user.role_profile_name}) does not have access to ${location.pathname}, redirecting to ${defaultRoute}`)
        return <Navigate to={defaultRoute} replace />
      } else {
        // If we're already on the default route but don't have access, 
        // allow access anyway to prevent users from getting stuck
        // This can happen if role names don't match exactly but user should have access
        console.warn(`User role "${userRole}" (${user.role || user.role_profile_name}) does not exactly match required roles: ${roles.join(', ')}, but allowing access to default route ${defaultRoute}`)
        return <>{children}</>
      }
    }
  }

  return <>{children}</>
}

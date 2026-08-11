import { useState, useEffect, createContext, useContext, type ReactNode } from 'react'
import healthcareAuth from '../services/auth'
import { clearIpBranchSessionFlags, markForceIpBranchOnAuth } from '../services/costCenterPermission'

interface User {
  name: string
  email: string
  full_name: string
  role?: string
  role_profile_name?: string
  first_name?: string
  last_name?: string
  user_image?: string
  /** All Frappe role names for this user (for UI permissions). */
  roles?: string[]
}

interface AuthContextType {
  user: User | null
  login: (username: string, password: string) => Promise<{ success: boolean; message: string; user?: User }>
  logout: () => Promise<void>
  checkSession: () => Promise<boolean>
  /** Merge a partial update into the current user (e.g. after editing name/photo) and persist it. */
  updateUser: (patch: Partial<User>) => void
  loading: boolean
  isAuthenticated: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted) return

    // Initialize healthcare auth session (async)
    healthcareAuth.initializeSession().catch(error => {
      console.warn('Failed to initialize session:', error)
    })

    // First, check if there's an existing Frappe session (user already logged in via Frappe)
    const checkExistingFrappeSession = async () => {
      try {
        // Try to get the current logged-in user from Frappe
        const currentUser = await healthcareAuth.getCurrentUser()
        
        if (currentUser && typeof currentUser === 'string' && currentUser.trim()) {
          // User is already logged into Frappe, fetch their profile and authenticate automatically
          
          try {
            const userProfile = await healthcareAuth.getCurrentUserProfile()
            if (userProfile) {
              const userData = {
                name: userProfile.name || currentUser,
                email: userProfile.email || userProfile.name || currentUser,
                full_name: userProfile.full_name || `${userProfile.first_name || ''} ${userProfile.last_name || ''}`.trim() || currentUser,
                role: userProfile.role_profile_name || userProfile.role || 'User',
                role_profile_name: userProfile.role_profile_name,
                first_name: userProfile.first_name,
                last_name: userProfile.last_name,
                user_image: userProfile.user_image,
                roles: Array.isArray((userProfile as any).roles) ? (userProfile as any).roles : undefined
              }

              setUser(userData)
              localStorage.setItem('healthcare_token', 'authenticated')
              localStorage.setItem('user_data', JSON.stringify(userData))
              setLoading(false)
              return // Exit early, user is authenticated
            }
          } catch (profileError) {
            console.warn('Failed to fetch user profile from existing session:', profileError)
            // Continue to check localStorage as fallback
          }
        }
      } catch (error) {
        // No existing Frappe session, continue to check localStorage
        console.log('No existing Frappe session found, checking localStorage...')
      }

      // Fallback: Check if user is already logged in (from localStorage - from previous frontend login)
      const token = localStorage.getItem('healthcare_token')
      const userData = localStorage.getItem('user_data')

      if (token && userData) {
        try {
          const parsedUser = JSON.parse(userData)

          // First, set the user from cached data to avoid login redirect
          setUser(parsedUser)

          const refreshUserData = async () => {
            try {
              // First validate the session
              const isSessionValid = await healthcareAuth.validateSession()
              if (!isSessionValid) {
                console.warn('Session is invalid, clearing auth data')
                localStorage.removeItem('healthcare_token')
                localStorage.removeItem('user_data')
                localStorage.removeItem('healthcare_sid')
                setUser(null)
                return
              }

              const freshUserData = await healthcareAuth.getCurrentUserProfile()
              if (freshUserData) {
                const updatedUser = {
                  name: freshUserData.name || parsedUser.name,
                  email: freshUserData.email || freshUserData.name || parsedUser.email,
                  full_name: freshUserData.full_name || `${freshUserData.first_name || ''} ${freshUserData.last_name || ''}`.trim() || parsedUser.full_name,
                  role: freshUserData.role_profile_name || freshUserData.role || parsedUser.role || 'User',
                  role_profile_name: freshUserData.role_profile_name,
                  first_name: freshUserData.first_name,
                  last_name: freshUserData.last_name,
                  user_image: freshUserData.user_image,
                  roles: Array.isArray((freshUserData as any).roles) ? (freshUserData as any).roles : parsedUser.roles
                }

                setUser(updatedUser)
                localStorage.setItem('user_data', JSON.stringify(updatedUser))
              }
            } catch (error) {
              console.warn('Failed to refresh user data, using cached data:', error)
              // Don't clear the user data if refresh fails - keep using cached data
            }
          }

          // Run refresh in background without blocking authentication
          refreshUserData()
        } catch (error) {
          console.error('Error parsing user data:', error)
          localStorage.removeItem('healthcare_token')
          localStorage.removeItem('user_data')
          localStorage.removeItem('healthcare_sid')
        }
      }
      
      setLoading(false)
    }

    // Run the check
    checkExistingFrappeSession()
  }, [mounted])

  const login = async (username: string, password: string) => {
    try {
      setLoading(true)

      // Use the real healthcare auth API
      const result = await healthcareAuth.login(username, password)

      if (result.success && result.user) {
        console.log('Login successful:', result.user)
        const userData = {
          name: result.user.name || username,
          email: result.user.email || username,
          full_name: result.user.full_name || result.user.name || username,
          role: result.user.role || result.user.role_profile_name || 'User',
          role_profile_name: result.user.role_profile_name,
          first_name: result.user.first_name,
          last_name: result.user.last_name,
          user_image: result.user.user_image,
          roles: Array.isArray((result.user as any).roles) ? (result.user as any).roles : undefined
        }

        // Always pick branch from client IP on login, even if another Cost Center permission exists.
        markForceIpBranchOnAuth()
        setUser(userData)
        localStorage.setItem('healthcare_token', 'authenticated')
        localStorage.setItem('user_data', JSON.stringify(userData))

        return { success: true, message: result.message, user: userData }
      } else {
        return { success: false, message: result.message }
      }
    } catch (error) {
      console.error('Login error:', error)
      return { success: false, message: 'Login failed. Please try again.' }
    } finally {
      setLoading(false)
    }
  }

  const logout = async () => {
    try {
      // Clear user state first to prevent any re-authentication
      setUser(null)
      clearIpBranchSessionFlags()
      localStorage.removeItem('healthcare_token')
      localStorage.removeItem('user_data')
      localStorage.removeItem('healthcare_sid')
      
      // Then call the logout API
      await healthcareAuth.logout()
    } catch (error) {
      console.error('Logout error:', error)
      // Even if logout fails, ensure state is cleared
      setUser(null)
      clearIpBranchSessionFlags()
      localStorage.removeItem('healthcare_token')
      localStorage.removeItem('user_data')
      localStorage.removeItem('healthcare_sid')
    }
  }

  // Merge a partial update into the current user and persist to localStorage.
  const updateUser = (patch: Partial<User>) => {
    setUser((prev) => {
      if (!prev) return prev
      const next = { ...prev, ...patch }
      try {
        localStorage.setItem('user_data', JSON.stringify(next))
      } catch {
        /* ignore storage errors */
      }
      return next
    })
  }

  // Method to check if session is still valid
  const checkSession = async () => {
    if (!user) return false

    try {
      const isValid = await healthcareAuth.validateSession()
      if (!isValid) {
        console.log('Session expired, logging out')
        await logout()
        return false
      }
      return true
    } catch (error) {
      console.error('Session check failed:', error)
      return false
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        login,
        logout,
        checkSession,
        updateUser,
        loading,
        isAuthenticated: !!user,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}


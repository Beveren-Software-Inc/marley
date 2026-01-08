import { useState, useEffect, type FormEvent } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../providers/AuthProvider'

export const LoginPage = () => {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const { login, isAuthenticated, user } = useAuth()

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated && user) {
      // Small delay to ensure state is fully updated
      const timer = setTimeout(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const from = (location.state as any)?.from?.pathname
        if (from && from !== '/login') {
          navigate(from, { replace: true })
        } else {
          // Determine default route based on user role
          const userRole = (user.role || '').toLowerCase()
          const userRoleProfile = (user.role_profile_name || '').toLowerCase()
          const userName = (user.name || '').toLowerCase()
          let defaultRoute = '/doctor' // Default fallback
          
          console.log('Determining default route for user:', { userName, userRole, userRoleProfile, role: user.role, role_profile_name: user.role_profile_name })
          
          // Administrator and System Manager can access any page, default to doctor
          const isAdmin = userName === 'administrator' || 
                        userRole.includes('administrator') || 
                        userRoleProfile.includes('administrator') ||
                        userRole.includes('system manager') ||
                        userRoleProfile.includes('system manager')
          
          if (isAdmin) {
            defaultRoute = '/doctor'
          } else if (userRole.includes('physician') || userRole.includes('practitioner') || userRole.includes('doctor') ||
                     userRoleProfile.includes('physician') || userRoleProfile.includes('practitioner') || userRoleProfile.includes('doctor')) {
            defaultRoute = '/doctor'
          } else if (userRole.includes('nursing') || userRole.includes('nurse') ||
                     userRoleProfile.includes('nursing') || userRoleProfile.includes('nurse')) {
            defaultRoute = '/nurse'
          } else if (userRole.includes('laboratory') || userRole.includes('lab') ||
                     userRoleProfile.includes('laboratory') || userRoleProfile.includes('lab')) {
            defaultRoute = '/lab'
          } else if (userRole.includes('pharmacist') || userRole.includes('pharmacy') ||
                     userRoleProfile.includes('pharmacist') || userRoleProfile.includes('pharmacy')) {
            defaultRoute = '/pharmacy'
          } else if (userRole.includes('admin') || userRole.includes('reception') ||
                     userRoleProfile.includes('admin') || userRoleProfile.includes('reception')) {
            defaultRoute = '/reception'
          } else if (userRole.includes('patient') || userRoleProfile.includes('patient')) {
            defaultRoute = '/patient'
          }
          
          console.log('Navigating to default route:', defaultRoute)
          navigate(defaultRoute, { replace: true })
        }
      }, 100)
      
      return () => clearTimeout(timer)
    }
  }, [isAuthenticated, user, navigate, location])

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const result = await login(username, password)

      if (result.success) {
        // Wait for auth state to update, then redirect
        // The useEffect will handle the redirect when user becomes authenticated
      } else {
        // Show user-friendly error messages
        setError(getUserFriendlyErrorMessage(result.message))
      }
    } catch (err) {
      setError('An unexpected error occurred. Please try again.')
      console.error('Login error:', err)
    } finally {
      setLoading(false)
    }
  }

  const getUserFriendlyErrorMessage = (message: string): string => {
    // Handle common HTTP error codes and convert to user-friendly messages
    if (message.includes('HTTP 401') || message.includes('401')) {
      return 'Invalid username or password. Please check your credentials and try again.'
    }
    if (message.includes('HTTP 403') || message.includes('403')) {
      return 'Access denied. Please contact your administrator.'
    }
    if (message.includes('HTTP 404') || message.includes('404')) {
      return 'Login service not available. Please contact your administrator.'
    }
    if (message.includes('HTTP 500') || message.includes('500')) {
      return 'Server error. Please try again later or contact your administrator.'
    }
    if (message.includes('Network error') || message.includes('fetch')) {
      return 'Unable to connect to the server. Please check your internet connection.'
    }
    if (message.includes('timeout')) {
      return 'Connection timeout. Please try again.'
    }
    if (message.includes('Invalid credentials') || message.includes('incorrect')) {
      return 'Invalid username or password. Please check your credentials and try again.'
    }
    if (message.includes('User not found')) {
      return 'User not found. Please check your username and try again.'
    }
    if (message.includes('Account disabled')) {
      return 'Your account has been disabled. Please contact your administrator.'
    }
    if (message.includes('Too many attempts')) {
      return 'Too many login attempts. Please wait a few minutes before trying again.'
    }

    // If it's already a user-friendly message, return as is
    if (message && !message.includes('HTTP') && !message.includes('Error:')) {
      return message
    }

    // Default fallback
    return 'Login failed. Please check your credentials and try again.'
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center p-4">
      {/* Background Pattern */}
      <div className="absolute inset-0 bg-grid-pattern opacity-5"></div>

      <div className="relative z-10 w-full max-w-sm">
        {/* Login Card */}
        <div className="bg-white/95 rounded-2xl shadow-2xl p-6 backdrop-blur-sm dark:bg-gray-800/95">
          {/* Logo Section */}
          <div className="text-center mb-6">
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center shadow-lg">
                <span className="text-white font-bold text-2xl">H</span>
              </div>
            </div>
            <h1 className="text-3xl font-bold text-primary dark:text-white">Healthcare</h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Management System</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-3">
              <div className="relative">
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full px-4 py-2.5 border-2 border-primary/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all duration-200 bg-gray-50/50 dark:bg-gray-700/50 dark:text-white dark:border-gray-600"
                  placeholder="Username or Email"
                  required
                  disabled={loading}
                />
                <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                  <svg className="w-5 h-5 text-primary/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                    />
                  </svg>
                </div>
              </div>

              <div className="relative">
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-2.5 border-2 border-primary/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all duration-200 bg-gray-50/50 dark:bg-gray-700/50 dark:text-white dark:border-gray-600"
                  placeholder="Password"
                  required
                  disabled={loading}
                />
                <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                  <svg className="w-5 h-5 text-primary/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                    />
                  </svg>
                </div>
              </div>
            </div>

            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3">
                <p className="text-sm text-red-600 dark:text-red-400 font-medium text-center">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary text-white font-bold py-3 px-4 rounded-xl hover:bg-primary/90 focus:outline-none focus:ring-4 focus:ring-primary/30 transition-all duration-300 shadow-lg hover:shadow-xl disabled:bg-primary/50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <div className="flex items-center justify-center">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  <span className="ml-2">Signing In...</span>
                </div>
              ) : (
                'Sign In'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

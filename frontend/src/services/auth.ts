interface LoginResponse {
  success: boolean
  message: string
  user?: {
    name: string
    email: string
    full_name: string
    role?: string
    role_profile_name?: string
    first_name?: string
    last_name?: string
    user_image?: string
    [key: string]: unknown
  }
  sid?: string
}

interface UserProfile {
  name?: string
  email?: string
  full_name?: string
  first_name?: string
  last_name?: string
  role?: string
  role_profile_name?: string
  user_image?: string
  roles?: string[]
  [key: string]: unknown
}

class HealthcareAuth {
  private sessionId: string | null = null
  private baseUrl: string = ''

  constructor() {
    // Always use relative URLs - Vite proxy handles /api in dev, and same-origin works in production
    this.baseUrl = ''
  }

  private getHeaders(includeCSRF: boolean = true): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    }

    // Add CSRF token if available
    if (includeCSRF) {
      const csrf = (window as any).csrf_token
      if (csrf) {
        headers['X-Frappe-CSRF-Token'] = csrf
      }
    }

    // Add session cookie if available
    if (this.sessionId) {
      headers['Cookie'] = `sid=${this.sessionId}`
    }

    return headers
  }

  async login(username: string, password: string): Promise<LoginResponse> {
    try {
      // Try the standard login endpoint first
      let response = await fetch(`${this.baseUrl}/api/method/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          usr: username,
          pwd: password
        }),
        credentials: 'include'
      })

      // If 404, try alternative endpoint
      if (response.status === 404) {
        response = await fetch(`${this.baseUrl}/api/method/frappe.auth.login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify({
            usr: username,
            pwd: password
          }),
          credentials: 'include'
        })
      }

      if (!response.ok) {
        const errorText = await response.text()
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`
        
        try {
          const errorData = JSON.parse(errorText)
          if (errorData.message) {
            errorMessage = errorData.message
          } else if (errorData.exc) {
            errorMessage = errorData.exc
          }
        } catch {
          if (errorText && errorText.trim()) {
            errorMessage = errorText
          }
        }

        return {
          success: false,
          message: errorMessage
        }
      }

      const data = await response.json()

      // Check for different response formats
      if (data.message === 'Logged In' || data.message?.name || data.message?.email) {
        // Extract session ID from response headers
        const setCookieHeader = response.headers.get('set-cookie')
        if (setCookieHeader) {
          const sidMatch = setCookieHeader.match(/sid=([^;]+)/)
          if (sidMatch && sidMatch[1]) {
            this.sessionId = sidMatch[1]
            localStorage.setItem('healthcare_sid', this.sessionId)
          }
        }

        // Fetch CSRF token after successful login
        try {
          await this.fetchCSRFToken()
        } catch (csrfError) {
          console.warn('Failed to fetch CSRF token:', csrfError)
        }

        // Fetch complete user profile data
        try {
          const userProfile = await this.getCurrentUserProfile()

          if (userProfile) {
            return {
              success: true,
              message: 'Login successful',
              user: {
                name: userProfile.name || username,
                email: userProfile.email || userProfile.name || username,
                full_name: userProfile.full_name || `${userProfile.first_name || ''} ${userProfile.last_name || ''}`.trim() || username,
                role: userProfile.role_profile_name || userProfile.role || 'User',
                role_profile_name: userProfile.role_profile_name,
                first_name: userProfile.first_name,
                last_name: userProfile.last_name,
                user_image: userProfile.user_image,
                roles: Array.isArray(userProfile.roles) ? userProfile.roles : undefined
              },
              sid: this.sessionId || undefined
            }
          }
        } catch (profileError) {
          console.warn('Failed to fetch user profile, using basic data:', profileError)
        }

        // Fallback to basic user data if profile fetch fails
        let userData
        if (typeof data.message === 'string' && data.message === 'Logged In') {
          userData = {
            name: username,
            email: username,
            full_name: username,
            role: 'User'
          }
        } else if (data.message && typeof data.message === 'object') {
          userData = {
            name: data.message.name || username,
            email: data.message.email || data.message.name || username,
            full_name: data.message.full_name || data.message.name || username,
            role: data.message.role || 'User'
          }
        } else {
          userData = {
            name: username,
            email: username,
            full_name: username,
            role: 'User'
          }
        }

        return {
          success: true,
          message: 'Login successful',
          user: userData,
          sid: this.sessionId || undefined
        }
      } else {
        return {
          success: false,
          message: data.message || data.exc || 'Login failed'
        }
      }
    } catch (error) {
      console.error('Login error details:', error)

      if (error instanceof TypeError && error.message.includes('fetch')) {
        return {
          success: false,
          message: 'Network error. Please check if the server is accessible.'
        }
      }

      if (error instanceof Error) {
        if (error.message.includes('timeout')) {
          return {
            success: false,
            message: 'Connection timeout. Please try again.'
          }
        }

        if (error.message.includes('Failed to fetch')) {
          return {
            success: false,
            message: 'Unable to connect to the server. Please check your internet connection.'
          }
        }
      }

      return {
        success: false,
        message: 'An unexpected error occurred. Please try again.'
      }
    }
  }

  async logout(): Promise<void> {
    try {
      const csrf = (window as any).csrf_token
      await fetch(`${this.baseUrl}/api/method/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          ...(csrf ? { 'X-Frappe-CSRF-Token': csrf } : {})
        },
        credentials: 'include'
      })
      
      // Clear CSRF token
      if ((window as any).csrf_token) {
        delete (window as any).csrf_token
      }
    } catch (error) {
      console.error('Logout error:', error)
      // Even if logout fails, clear local state
    } finally {
      this.sessionId = null
      localStorage.removeItem('healthcare_sid')
      localStorage.removeItem('healthcare_token')
      localStorage.removeItem('user_data')
    }
  }

  async getCurrentUser(): Promise<unknown> {
    try {
      const response = await fetch(`${this.baseUrl}/api/method/frappe.auth.get_logged_user`, {
        method: 'GET',
        headers: this.getHeaders(false),
        credentials: 'include'
      })

      const data = await response.json()
      return data.message
    } catch (error) {
      console.error('Get current user error:', error)
      return null
    }
  }

  async getCurrentUserProfile(): Promise<UserProfile | null> {
    try {
      // Try to get user profile using the frappe.auth.get_logged_user method first
      const response = await fetch(`${this.baseUrl}/api/method/frappe.auth.get_logged_user`, {
        method: 'GET',
        headers: this.getHeaders(false),
        credentials: 'include'
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch logged user: ${response.status}`)
      }

      const data = await response.json()
      const username = data.message

      if (!username) {
        throw new Error('No logged user found')
      }

      // Now fetch the full User document
      const userResponse = await fetch(`${this.baseUrl}/api/resource/User/${username}`, {
        method: 'GET',
        headers: this.getHeaders(false),
        credentials: 'include'
      })

      if (!userResponse.ok) {
        throw new Error(`Failed to fetch user profile: ${userResponse.status}`)
      }

      const userData = await userResponse.json()
      const profile = userData.data as UserProfile

      // Roles for UI permissions (GET avoids CSRF vs POST frappe user.get_roles)
      try {
        const rolesRes = await fetch(`${this.baseUrl}/api/method/healthcare.api.common.get_current_user_roles`, {
          method: 'GET',
          headers: this.getHeaders(false),
          credentials: 'include'
        })
        if (rolesRes.ok) {
          const rolesData = await rolesRes.json()
          if (Array.isArray(rolesData?.message)) {
            profile.roles = rolesData.message as string[]
          }
        }
      } catch {
        // API failed (e.g. 403/404 on deployed site); fallback below will use User doc
      }

      // Fallback when roles API failed or returned no array: use User doc (roles child table or role/role_profile_name)
      if (!profile.roles || !Array.isArray(profile.roles) || profile.roles.length === 0) {
        const childRoles = (profile as any).roles
        if (Array.isArray(childRoles) && childRoles.length > 0) {
          profile.roles = childRoles.map((r: { role?: string }) => r?.role).filter((x): x is string => Boolean(x))
        } else if (profile.role || profile.role_profile_name) {
          profile.roles = [profile.role_profile_name || profile.role].filter(Boolean) as string[]
        } else {
          profile.roles = []
        }
      }

      return profile
    } catch (error) {
      console.error('Get user profile error:', error)
      throw error
    }
  }

  // Validate session by checking if user is still logged in
  async validateSession(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/method/frappe.auth.get_logged_user`, {
        method: 'GET',
        headers: this.getHeaders(false),
        credentials: 'include'
      })

      if (response.ok) {
        const data = await response.json()
        return !!data.message // Return true if we get a username
      }
      return false
    } catch (error) {
      console.error('Session validation failed:', error)
      return false
    }
  }

  // Initialize session from localStorage
  async initializeSession(): Promise<void> {
    const storedSid = localStorage.getItem('healthcare_sid')
    if (storedSid) {
      this.sessionId = storedSid
    }

    // Try to fetch CSRF token if not already available. Skip for guests (no
    // stored session) — the endpoint just 403s pre-login, and apiClient fetches
    // the token lazily after authentication anyway.
    if (storedSid && !(window as any).csrf_token) {
      try {
        await this.fetchCSRFToken()
      } catch (error) {
        console.warn('Failed to fetch CSRF token on initialization:', error)
      }
    }
  }

  // Get CSRF token - this should be available from window after login
  getCSRFToken(): string | null {
    return (window as any).csrf_token || null
  }

  // Fetch CSRF token from server
  async fetchCSRFToken(): Promise<string | null> {
    try {
      const response = await fetch(`${this.baseUrl}/api/method/frappe.sessions.get_csrf_token`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
        credentials: 'include'
      })

      if (response.ok) {
        const data = await response.json()
        const token = data.message
        if (token) {
          // Store in window for easy access
          ;(window as any).csrf_token = token
          return token
        }
      }
      return null
    } catch (error) {
      console.error('Failed to fetch CSRF token:', error)
      return null
    }
  }
}

export const healthcareAuth = new HealthcareAuth()
export default healthcareAuth


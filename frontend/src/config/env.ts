/**
 * Environment detection utilities
 * Determines if the app is running in development or production mode
 */

/**
 * Check if running in development mode
 * Uses Vite's built-in environment detection
 */
export const isDevelopment = (): boolean => {
  // In Vite, import.meta.env.DEV is true in development
  // import.meta.env.PROD is true in production
  // import.meta.env.MODE is 'development' or 'production'
  return import.meta.env.DEV || import.meta.env.MODE === 'development'
}

/**
 * Check if running in production mode
 */
export const isProduction = (): boolean => {
  return import.meta.env.PROD || import.meta.env.MODE === 'production'
}

/**
 * Get the base path for assets
 * Returns '/' for development, '/assets/healthcare/frontend/' for production
 */
export const getBasePath = (): string => {
  return isDevelopment() ? '/' : '/assets/healthcare/frontend/'
}

/**
 * Get the basename for React Router
 * Returns undefined for development, '/health' for production
 */
export const getRouterBasename = (): string | undefined => {
  return isDevelopment() ? undefined : '/health'
}






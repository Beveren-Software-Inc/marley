import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ThemeProvider } from './hooks/useTheme'
import App from './App'
import './theme/global.css'
import { getRouterBasename } from './config/env'

// Dynamically determine basename based on environment
const basename = getRouterBasename()
if (typeof window !== 'undefined') {
  (window as any).__HEALTHCARE_ROUTER_BASENAME__ = basename ?? ''
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter basename={basename}>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>
)

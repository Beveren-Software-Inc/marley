import { Suspense } from 'react'
import { AuthProvider } from './providers/AuthProvider'
import { RouterProvider } from './router/RouterProvider'
import { AppShell } from './components/layout/AppShell'
import { CareContextProvider } from './providers/CareContextProvider'

function App() {
  return (
    <AuthProvider>
      <CareContextProvider>
        <AppShell>
          <Suspense fallback={<div>Loading...</div>}>
            <RouterProvider />
          </Suspense>
        </AppShell>
      </CareContextProvider>
    </AuthProvider>
  )
}

export default App

import { Suspense } from 'react'
import { AuthProvider } from './providers/AuthProvider'
import { RouterProvider } from './router/RouterProvider'
import { AppShell } from './components/layout/AppShell'

function App() {
  return (
    <AuthProvider>
      <AppShell>
        <Suspense fallback={<div>Loading...</div>}>
          <RouterProvider />
        </Suspense>
      </AppShell>
    </AuthProvider>
  )
}

export default App

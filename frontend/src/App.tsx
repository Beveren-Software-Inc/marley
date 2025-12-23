import { Suspense } from 'react'
import { RouterProvider } from './router/RouterProvider'
import { AppShell } from './components/layout/AppShell'

function App() {
  return (
    <AppShell>
      <Suspense fallback={<div>Loading...</div>}>
        <RouterProvider />
      </Suspense>
    </AppShell>
  )
}

export default App

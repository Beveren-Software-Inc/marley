import { Suspense } from 'react'
import { AuthProvider } from './providers/AuthProvider'
import { RouterProvider } from './router/RouterProvider'
import { AppShell } from './components/layout/AppShell'
import { CareContextProvider } from './providers/CareContextProvider'
import { ReceptionistShiftProvider } from './providers/ReceptionistShiftProvider'

function App() {
  return (
    <AuthProvider>
      <CareContextProvider>
        <ReceptionistShiftProvider>
          <AppShell>
            <Suspense fallback={<div>Loading...</div>}>
              <RouterProvider />
            </Suspense>
          </AppShell>
        </ReceptionistShiftProvider>
      </CareContextProvider>
    </AuthProvider>
  )
}

export default App

import { Suspense } from 'react'
import { AuthProvider } from './providers/AuthProvider'
import { RouterProvider } from './router/RouterProvider'
import { AppShell } from './components/layout/AppShell'
import { CareContextProvider } from './providers/CareContextProvider'
import { ReceptionistShiftProvider } from './providers/ReceptionistShiftProvider'
import { NurseBriefingProvider } from './providers/NurseBriefingProvider'
import { DoctorBriefingProvider } from './providers/DoctorBriefingProvider'

function App() {
  return (
    <AuthProvider>
      <CareContextProvider>
        <NurseBriefingProvider>
          <DoctorBriefingProvider>
          <ReceptionistShiftProvider>
          <AppShell>
            <Suspense fallback={<div>Loading...</div>}>
              <RouterProvider />
            </Suspense>
          </AppShell>
          </ReceptionistShiftProvider>
          </DoctorBriefingProvider>
        </NurseBriefingProvider>
      </CareContextProvider>
    </AuthProvider>
  )
}

export default App

import { test as setup } from '@playwright/test'

const PASSWORD = 'QaTest#2026'

/** Log in inside the browser (host-resolver rule applies there) and save cookies. */
async function login(page: any, user: string, statePath: string) {
  await page.goto('/health')
  const status = await page.evaluate(
    async ({ usr, pwd }: { usr: string; pwd: string }) => {
      const body = new URLSearchParams()
      body.set('usr', usr)
      body.set('pwd', pwd)
      const r = await fetch('/api/method/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
        credentials: 'include',
      })
      return r.status
    },
    { usr: user, pwd: PASSWORD },
  )
  if (status !== 200) throw new Error(`login failed for ${user}: HTTP ${status}`)
  await page.context().storageState({ path: statePath })
}

setup('authenticate doctor', async ({ page }) => {
  await login(page, 'qa.doctor@test.local', 'e2e/.auth/doctor.json')
})

setup('authenticate nurse', async ({ page }) => {
  await login(page, 'qa.nurse@test.local', 'e2e/.auth/nurse.json')
})

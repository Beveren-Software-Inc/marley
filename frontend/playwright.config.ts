import { defineConfig } from '@playwright/test'

/**
 * E2E suite for the Marley Health portal (bench site x.local on port 8001).
 * `x.local` resolves via a Chromium host-resolver rule — no /etc/hosts entry needed.
 * QA logins: qa.doctor@test.local / qa.nurse@test.local (see e2e/auth.setup.ts).
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://x.local:8001',
    screenshot: 'only-on-failure',
    launchOptions: {
      args: ['--host-resolver-rules=MAP x.local 127.0.0.1'],
    },
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'doctor',
      testMatch: /doctor\..*\.spec\.ts/,
      dependencies: ['setup'],
      use: { storageState: 'e2e/.auth/doctor.json' },
    },
    {
      name: 'nurse',
      testMatch: /nurse\..*\.spec\.ts/,
      dependencies: ['setup'],
      use: { storageState: 'e2e/.auth/nurse.json' },
    },
  ],
})

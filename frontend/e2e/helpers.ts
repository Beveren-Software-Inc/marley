import type { Page } from '@playwright/test'

/** Dismiss the shift/doctor briefing modal(s) shown on login, if present. */
export async function dismissBriefings(page: Page) {
  for (let i = 0; i < 3; i++) {
    const overlay = page.locator('div.fixed.inset-0.z-\\[200\\]')
    try {
      await overlay.first().waitFor({ state: 'visible', timeout: 2500 })
    } catch {
      return
    }
    const close = overlay.first().getByRole('button', { name: 'Close' })
    if (await close.count()) {
      await close.first().click()
    } else {
      await page.keyboard.press('Escape')
    }
    await page.waitForTimeout(400)
  }
}

/** Expand a collapsed sidebar folder by its title (no-op if absent). */
export async function expandSidebarGroup(page: Page, title: string) {
  const sidebar = page.locator('aside').first()
  const btn = sidebar.getByRole('button', { name: title, exact: true })
  if (await btn.count()) await btn.first().click()
}

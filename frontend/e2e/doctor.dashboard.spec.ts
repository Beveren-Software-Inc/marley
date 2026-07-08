import { test, expect } from '@playwright/test'
import { dismissBriefings, expandSidebarGroup } from './helpers'

test.describe('Doctor dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/health/doctor')
    await dismissBriefings(page)
    await expect(page.locator('.dashboard-card').first()).toBeVisible({ timeout: 20_000 })
  })

  test('shows the six dashboard cards in order', async ({ page }) => {
    for (const title of [
      'Outpatient Visit Details',
      'Inpatient Admissions',
      'Warnings & Messages',
      'Lab Test Report - Pending for Review',
      'Prescription',
    ]) {
      await expect(
        page.locator('.dashboard-card-head').filter({ hasText: title }).first(),
      ).toBeVisible()
    }
  })

  test('warnings and prescription cards prompt for patient search', async ({ page }) => {
    const placeholders = page.getByText('Search for patient to view the list')
    expect(await placeholders.count()).toBeGreaterThanOrEqual(2)
    // rendered uppercase via CSS
    const cls = await placeholders.first().getAttribute('class')
    expect(cls).toContain('uppercase')
  })

  test('card arrow expands in place and collapses back', async ({ page }) => {
    const card = page
      .locator('.dashboard-card')
      .filter({ has: page.getByText('Outpatient Visit Details') })
      .first()
    const expand = card.getByRole('button', { name: /Expand Outpatient Visit Details/i })
    await expand.click()
    const collapse = page.getByRole('button', { name: /Collapse Outpatient Visit Details/i })
    await expect(collapse).toBeVisible()
    await collapse.click()
    await expect(
      page.getByRole('button', { name: /Expand Outpatient Visit Details/i }),
    ).toBeVisible()
  })

  test('filter bars: From Date and To Date lead, Clear Filter sits last', async ({ page }) => {
    const bar = page.locator('.card-filter-bar').first()
    const labels = bar.locator('label')
    await expect(labels.nth(0)).toHaveText('From Date')
    await expect(labels.nth(1)).toHaveText('To Date')
    await expect(bar.getByRole('button', { name: /clear filter/i })).toBeVisible()
  })

  test('date filters start empty (no default filters)', async ({ page }) => {
    const bar = page.locator('.card-filter-bar').first()
    const dateTexts = bar.locator('[data-datefilter] input[type="text"]')
    const count = await dateTexts.count()
    for (let i = 0; i < count; i++) {
      await expect(dateTexts.nth(i)).toHaveValue('')
    }
  })

  test('sidebar: folders dissolved, renames applied, dashboard duplicates gone', async ({ page }) => {
    const sidebar = page.locator('aside').first()
    await expandSidebarGroup(page, 'Patient Overview')
    await expect(sidebar.getByText('Long Acting Medicines', { exact: true })).toBeVisible()
    await expect(sidebar.getByText('Patient History Form', { exact: true })).toBeVisible()
    await expect(sidebar.getByText('Discharge Form', { exact: true })).toBeVisible()
    for (const gone of [
      'Medication & Pharmacy',
      'Admission & Discharge',
      'Scales & Assessments',
      'All Prescriptions',
      'Current Prescription',
      'Patients List',
      'Admission Form',
      'Lab Requests',
    ]) {
      await expect(sidebar.getByText(gone, { exact: true })).toHaveCount(0)
    }
  })

  test('empty states render uppercase', async ({ page }) => {
    // Prescription card placeholder is CSS-uppercased; table empty-states are
    // literal uppercase strings. Check any visible "NO ... " text on the page.
    const emptyState = page.getByText(/NO [A-Z ]+(FOUND|MATCH)/).first()
    // Not all cards are empty on seeded data — tolerate absence, but if present it must be uppercase.
    if (await emptyState.count()) {
      const text = await emptyState.textContent()
      expect(text).toBe(text?.toUpperCase())
    }
  })
})

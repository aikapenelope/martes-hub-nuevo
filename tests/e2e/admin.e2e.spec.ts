import { test, expect } from '@playwright/test'
import { login } from '../helpers/login'
import { seedTestUser, testUser } from '../helpers/seedUser'

test.describe('Admin Panel', () => {
  test.beforeAll(async () => {
    await seedTestUser()
  })

  test.beforeEach(async ({ page }) => {
    await login({ page, user: testUser })
  })

  test('can navigate to dashboard', async ({ page }) => {
    await page.goto('/admin')
    await expect(page).toHaveURL((url) => url.pathname === '/admin' || url.pathname === '/admin/')
    const dashboardLink = page.locator('a[href*="/admin/collections/"], a[href*="/admin/account"]').first()
    await expect(dashboardLink).toBeVisible({ timeout: 20000 })
  })

  test('can navigate to list view', async ({ page }) => {
    await page.goto('/admin/collections/users')
    await expect(page).toHaveURL(/\/admin\/collections\/users/)
    const listViewArtifact = page.locator('a[href="/admin/collections/users/create"], button:has-text("Create")').first()
    await expect(listViewArtifact).toBeVisible({ timeout: 20000 })
  })

  test('can navigate to edit view', async ({ page }) => {
    await page.goto('/admin/collections/users/create')
    await expect(page).toHaveURL(/\/admin\/collections\/users\/[a-zA-Z0-9-_]+/)
    const editViewArtifact = page.locator('#field-email, input[name="email"]').first()
    await expect(editViewArtifact).toBeVisible({ timeout: 20000 })
  })
})

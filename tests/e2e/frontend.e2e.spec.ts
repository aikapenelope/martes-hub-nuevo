import { test, expect } from '@playwright/test'

/**
 * `/` hace un redirect server-side a `/workspace`, y `getWorkspaceContext()`
 * redirige sin sesión a `/admin/login?redirect=/workspace` — esta es la
 * cadena real de la app, no el scaffold de Payload que este test verificaba
 * antes (título "Payload Blank Template" / "Welcome to your new project.",
 * contenido que ya no existe en el código).
 */
test.describe('Frontend', () => {
  test('la raíz redirige al login cuando no hay sesión', async ({ page }) => {
    await page.goto('http://localhost:3000/')

    await page.waitForURL(/\/admin\/login/)
    await expect(page.locator('#field-email')).toBeVisible()
    await expect(page.locator('#field-password')).toBeVisible()
  })
})

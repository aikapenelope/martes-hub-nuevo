import { test, expect } from '@playwright/test'
import { login } from '../helpers/login'
import { seedTestUser, testUser } from '../helpers/seedUser'

test.describe('Workspace Surface & Modern UI', () => {
  test.beforeAll(async () => {
    await seedTestUser()
  })

  test.beforeEach(async ({ page }) => {
    await login({ page, user: testUser })
  })

  test('Workspace Overview (/workspace) loads Torre de Control and KPIs', async ({ page }) => {
    await page.goto('/workspace')
    await expect(page).toHaveURL('/workspace')

    // Header validation
    const brand = page.locator('header a[href="/workspace"]').first()
    await expect(brand).toBeVisible()
    await expect(page.getByText('Martes Hub', { exact: false })).toBeVisible()

    // Command strip
    const commandStrip = page.getByRole('heading', { name: /Torre de Control Comercial/i })
    await expect(commandStrip).toBeVisible()

    // Navigation bar links with aria-current
    const overviewLink = page.locator('nav[aria-label="Navegación principal del workspace"] a[href="/workspace"]')
    await expect(overviewLink).toBeVisible()
    await expect(overviewLink).toHaveAttribute('aria-current', 'page')

    // Activity heatmap
    const heatmapHeading = page.getByRole('heading', { name: /Matriz de Actividad Comercial/i })
    await expect(heatmapHeading).toBeVisible()

    // Conversion funnel & Omnichannel feed sections
    await expect(page.getByRole('heading', { name: /Embudo de Conversión/i })).toBeVisible()
    await expect(page.getByRole('heading', { name: /Feed Omnicanal/i })).toBeVisible()
  })

  test('CRM (/workspace/crm) supports Pipeline Kanban and view modes', async ({ page }) => {
    await page.goto('/workspace/crm')
    await expect(page).toHaveURL(/\/workspace\/crm/)

    // CRM Header
    await expect(page.getByRole('heading', { name: /Relaciones que avanzan/i })).toBeVisible()

    // Navigation between Leads and Clientes
    const leadsNav = page.locator('nav[aria-label="Vista CRM"] a', { hasText: 'Leads' })
    const clientsNav = page.locator('nav[aria-label="Vista CRM"] a', { hasText: 'Clientes' })
    await expect(leadsNav).toBeVisible()
    await expect(clientsNav).toBeVisible()

    // Kanban board columns
    const kanbanSection = page.locator('section[aria-label="Pipeline de ventas Kanban"]')
    await expect(kanbanSection).toBeVisible()
    await expect(page.getByRole('heading', { name: /Nuevos \/ Sin contactar/i })).toBeVisible()
    await expect(page.getByRole('heading', { name: /En conversación/i })).toBeVisible()
    await expect(page.getByRole('heading', { name: /Calificados \/ Oportunidad/i })).toBeVisible()

    // Switch to Tabla mode
    const tableModeLink = page.locator('nav[aria-label="Modo de vista del pipeline"] a', { hasText: 'Tabla' })
    await tableModeLink.click()
    await page.waitForURL(/modo=tabla/)
    await expect(page.getByPlaceholder('Buscar nombre, correo o teléfono')).toBeVisible()

    // Switch to Clientes view
    await clientsNav.click()
    await page.waitForURL(/vista=clientes/)
    await expect(page.getByRole('heading', { name: /Relaciones que avanzan/i })).toBeVisible()
  })

  test('Tasks (/workspace/tasks) displays work dashboard and filters', async ({ page }) => {
    await page.goto('/workspace/tasks')
    await expect(page).toHaveURL(/\/workspace\/tasks/)

    // Tasks header
    await expect(page.getByRole('heading', { name: /Trabajo del equipo/i })).toBeVisible()

    // Metrics summary
    const summarySection = page.locator('section[aria-label="Resumen de tareas"]')
    await expect(summarySection).toBeVisible()
    await expect(summarySection.getByText('Pendientes', { exact: true })).toBeVisible()
    await expect(summarySection.getByText('En progreso', { exact: true })).toBeVisible()
    await expect(summarySection.getByText('Vencidas', { exact: true })).toBeVisible()
    await expect(summarySection.getByText('Completadas', { exact: true })).toBeVisible()

    // View toggles: Tablero & Lista
    const boardLink = page.locator('a', { hasText: 'Tablero' })
    const listLink = page.locator('a', { hasText: 'Lista' })
    await expect(boardLink).toBeVisible()
    await expect(listLink).toBeVisible()

    // Search input
    const searchInput = page.getByPlaceholder('Buscar tareas...')
    await expect(searchInput).toBeVisible()
  })

  test('Billing (/workspace/billing) displays financial KPIs and recent payments', async ({ page }) => {
    await page.goto('/workspace/billing')
    await expect(page).toHaveURL('/workspace/billing')

    await expect(page.getByRole('heading', { name: /Billing & Commerce/i })).toBeVisible()
    const indicators = page.locator('section[aria-label="Indicadores de cobranza"]')
    await expect(indicators).toBeVisible()
    await expect(indicators.getByText('Cobrado este mes')).toBeVisible()
    await expect(indicators.getByText('Por cobrar')).toBeVisible()
    await expect(page.getByRole('heading', { name: /Cobros recientes/i })).toBeVisible()
  })

  test('Analytics (/workspace/analytics) displays conversion and quality intelligence', async ({ page }) => {
    await page.goto('/workspace/analytics')
    await expect(page).toHaveURL('/workspace/analytics')

    await expect(page.getByRole('heading', { name: /Métricas de Conversión y Calidad/i })).toBeVisible()
    await expect(page.getByText('Conversión Lead ➔ Cliente')).toBeVisible()
    await expect(page.getByText('Satisfacción Formularios')).toBeVisible()
    await expect(page.getByRole('heading', { name: /Embudo de Conversión de Leads/i })).toBeVisible()
    await expect(page.getByRole('heading', { name: /Satisfacción y Calidad/i })).toBeVisible()
  })

  test('Hoy (/workspace/hoy) displays follow-up queue and refresh action', async ({ page }) => {
    await page.goto('/workspace/hoy')
    await expect(page).toHaveURL('/workspace/hoy')

    await expect(page.getByRole('heading', { name: 'Hoy', exact: true })).toBeVisible()
    const refreshBtn = page.getByRole('button', { name: /Refrescar/i })
    await expect(refreshBtn).toBeVisible()
  })

  test('Inbox (/workspace/inbox) displays omnichannel conversations shell', async ({ page }) => {
    await page.goto('/workspace/inbox')
    await expect(page).toHaveURL('/workspace/inbox')

    await expect(page.getByRole('heading', { name: /Unified Inbox/i })).toBeVisible()
    await expect(page.getByRole('heading', { name: /Conversaciones/i })).toBeVisible()
  })

  test('Social Hub (/workspace/social) displays editorial calendar and accounts', async ({ page }) => {
    await page.goto('/workspace/social')
    await expect(page).toHaveURL('/workspace/social')

    await expect(page.getByRole('heading', { name: /Social Hub/i })).toBeVisible()
    const socialIndicators = page.locator('section[aria-label="Indicadores sociales"]')
    await expect(socialIndicators).toBeVisible()
    await expect(page.getByRole('heading', { name: /Distribución de publicaciones/i })).toBeVisible()
    await expect(page.getByRole('heading', { name: /Cuentas vinculadas/i })).toBeVisible()
  })
})

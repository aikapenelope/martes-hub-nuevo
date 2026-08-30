import type { Page } from '@playwright/test'

export interface LoginOptions {
  page: Page
  serverURL?: string
  user: {
    email: string
    password: string
  }
}

/**
 * Logs the user into the admin panel via the login page.
 */
export async function login({
  page,
  serverURL = 'http://localhost:3000',
  user,
}: LoginOptions): Promise<void> {
  const response = await page.request.post(`${serverURL}/api/users/login`, {
    data: {
      email: user.email,
      password: user.password,
    },
  })

  if (!response.ok()) {
    throw new Error(`Failed to login: ${response.status()} ${await response.text()}`)
  }
}

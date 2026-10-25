// Signs in once through OpenCloud's identity provider and saves the session for the specs.
import { test as setup, expect } from '@playwright/test'
import { AUTH_STATE, PASSWORD, USER } from './env'

setup('sign in', async ({ page }) => {
  await page.goto('/')
  await page.fill('#oc-login-username', USER)
  await page.fill('#oc-login-password', PASSWORD)
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page).toHaveURL(/\/files\//, { timeout: 60_000 })
  await page.context().storageState({ path: AUTH_STATE })
})

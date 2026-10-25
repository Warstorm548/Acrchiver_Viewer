// Shared Playwright fixtures: a console guard on every test, viewer helpers and request rewrites
// that simulate other server settings without restarting the stack.
import { test as base, devices, expect, Download, Locator, Page } from '@playwright/test'
import { USER } from './env'

export { expect }

/** Console errors that come from OpenCloud itself, not the viewer (e.g. the admin's missing avatar). */
const OPENCLOUD_NOISE = [/Failed to load resource: the server responded with a status of 404/]

interface ConsoleEntry {
  type: string
  text: string
}

export class Viewer {
  constructor(readonly page: Page) {}

  /** Opens a file of the user's home folder in the viewer by its URL. */
  async open(name: string) {
    await this.page.goto(`/archive-viewer/personal/${USER}/${encodeURIComponent(name)}`)
    await expect(this.page.locator('.archive-row, .archive-viewer-message').first()).toBeVisible({
      timeout: 60_000
    })
  }

  row(name: string): Locator {
    return this.page.locator('.archive-row', {
      has: this.page.locator('.archive-name', { hasText: new RegExp(`^${escape(name)}$`) })
    })
  }

  names(): Promise<string[]> {
    return this.page.locator('.archive-row .archive-name').allInnerTexts()
  }

  async openFolder(name: string) {
    await this.row(name).click()
    await expect(this.page.locator('.archive-crumb').last()).toHaveText(name)
  }

  async select(...names: string[]) {
    for (const name of names) {
      await this.row(name).locator('input[type="checkbox"]').check()
    }
  }

  async downloadSelected(): Promise<Download> {
    const download = this.page.waitForEvent('download', { timeout: 600_000 })
    await this.page.locator('.archive-download-selected').click()
    return download
  }

  async downloadFile(name: string): Promise<Download> {
    const download = this.page.waitForEvent('download', { timeout: 600_000 })
    await this.row(name).locator('.archive-download').click()
    return download
  }

  /** The error notification OpenCloud shows for a failed download (`showErrorMessage`). */
  errorNotification(): Locator {
    return this.page.locator('.oc-notification-message').last()
  }
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** A phone (Pixel 7) for `test.use`; `defaultBrowserType` is only allowed per project. */
export const phone = (() => {
  const device: Partial<(typeof devices)[string]> = { ...devices['Pixel 7'] }
  delete device.defaultBrowserType
  return device
})()

/** Rewrites the archive-viewer entry of /config.json (what apps.yaml would change). */
export const patchAppConfig = (page: Page, change: Record<string, unknown>) =>
  page.route('**/config.json', async (route) => {
    const response = await route.fetch()
    const config = await response.json()
    for (const app of config.external_apps ?? []) {
      if (app.id === 'archive-viewer') {
        app.config = { ...app.config, ...change }
      }
    }
    await route.fulfill({ response, json: config })
  })

/** Makes the capabilities report another OpenCloud version. */
export const patchProductVersion = (page: Page, version: string) =>
  page.route('**/ocs/v1.php/cloud/capabilities*', async (route) => {
    const response = await route.fetch()
    const body = await response.json()
    body.ocs.data.version.productversion = version
    body.ocs.data.capabilities.core.status.productversion = version
    await route.fulfill({ response, json: body })
  })

/**
 * Removes `worker-src` from the page's Content-Security-Policy, leaving `child-src 'self'`: the
 * situation of OpenCloud's built-in policy (no csp.yaml), where `blob:` workers are blocked.
 */
export const useBuiltInCsp = (page: Page) =>
  page.route('**/*', async (route) => {
    if (route.request().resourceType() !== 'document') {
      return route.fallback()
    }
    const response = await route.fetch()
    const headers = response.headers()
    headers['content-security-policy'] = headers['content-security-policy']
      .split(';')
      .filter((directive) => !directive.trim().startsWith('worker-src'))
      .join(';')
    await route.fulfill({ response, headers })
  })

export const test = base.extend<{
  viewer: Viewer
  consoleEntries: ConsoleEntry[]
  allowedConsole: RegExp[]
}>({
  allowedConsole: [[], { option: true }],
  consoleEntries: [
    async ({ page, allowedConsole }, use) => {
      const entries: ConsoleEntry[] = []
      page.on('console', (message) => entries.push({ type: message.type(), text: message.text() }))
      page.on('pageerror', (error) => entries.push({ type: 'pageerror', text: error.message }))
      await use(entries)
      const unexpected = entries.filter(
        ({ type, text }) =>
          (type === 'error' ||
            type === 'pageerror' ||
            /Content.Security.Policy|WebAssembly/i.test(text)) &&
          ![...OPENCLOUD_NOISE, ...allowedConsole].some((pattern) => pattern.test(text))
      )
      expect(unexpected, 'console errors, CSP or WebAssembly messages').toEqual([])
    },
    { auto: true }
  ],
  viewer: async ({ page }, use) => {
    await use(new Viewer(page))
  }
})

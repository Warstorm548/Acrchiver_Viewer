const capabilityStore = { isInitialized: true, status: { productversion: '8.0.1' } }

vi.mock('@opencloud-eu/web-pkg', () => ({
  AppWrapperRoute: () => ({}),
  defineWebApplication: (args: unknown) => args,
  useCapabilityStore: () => capabilityStore
}))
vi.mock('vue3-gettext', () => ({ useGettext: () => ({ $gettext: (text: string) => text }) }))
vi.mock('../../src/App.vue', () => ({ default: {} }))

type Setup = (options: { applicationConfig: Record<string, unknown> }) => {
  appInfo: { id: string }
}

/** Re-imports the entry module so its top-level version lookup runs with the given version. */
const loadSetup = async (productversion: string): Promise<Setup> => {
  capabilityStore.status.productversion = productversion
  vi.resetModules()
  return ((await import('../../src/index')).default as unknown as { setup: Setup }).setup
}

describe('extension entry', () => {
  afterEach(() => vi.restoreAllMocks())

  it('registers on a supported OpenCloud version', async () => {
    const setup = await loadSetup('8.0.1')
    expect(setup({ applicationConfig: {} }).appInfo.id).toBe('archive-viewer')
  })

  it('refuses to register on an unsupported version, which hides the app', async () => {
    const setup = await loadSetup('8.1.0')
    expect(() => setup({ applicationConfig: {} })).toThrow(
      /supports OpenCloud 8\.0\.1; this server runs 8\.1\.0/
    )
  })

  it('registers with a warning when the admin overrides the check', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const setup = await loadSetup('8.1.0')
    const result = setup({ applicationConfig: { allowUnsupportedOpenCloud: true } })
    expect(result.appInfo.id).toBe('archive-viewer')
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Running anyway'))
  })
})

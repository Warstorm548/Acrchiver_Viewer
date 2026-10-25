import { Resource } from '@opencloud-eu/web-client'
import { AppConfigObject } from '@opencloud-eu/web-pkg'
import { defaultPlugins, mount } from '@opencloud-eu/web-test-helpers'
import { flushPromises } from '@vue/test-utils'
import { mock } from 'vitest-mock-extended'
import { BlobWriter, TextReader, ZipWriter } from '@zip.js/zip.js/lib/zip-native.js'
import App from '../../src/App.vue'
import { configureZip } from '../../src/engine/zip'

const makeZip = async (): Promise<Blob> => {
  const writer = new ZipWriter(new BlobWriter('application/zip'))
  await writer.add('docs/readme.txt', new TextReader('hello'))
  await writer.add('root.txt', new TextReader('root'))
  return writer.close()
}

const respondWith = (blob: Blob) =>
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(blob, { status: 200 }))

const createWrapper = ({
  name = 'archive.zip',
  size = 1024,
  url = 'https://cloud.test/signed',
  config = {}
}: {
  name?: string
  size?: number
  url?: string
  config?: Record<string, unknown>
} = {}) =>
  mount(App, {
    props: {
      resource: mock<Resource>({ id: name, name, size }),
      applicationConfig: mock<AppConfigObject>(config),
      url
    },
    global: { plugins: [...defaultPlugins()], stubs: { OcIcon: true } }
  })

describe('App', () => {
  beforeAll(() => configureZip({ useWebWorkers: false }))
  afterEach(() => vi.restoreAllMocks())

  it('refuses archives above the size limit without downloading them', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const wrapper = createWrapper({ size: 5000, config: { maxArchiveSize: 1000 } })
    await flushPromises()
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(wrapper.find('.archive-viewer-message').text()).toContain('larger than')
    expect(wrapper.find('.archive-viewer-download').exists()).toBe(true)
  })

  it('downloads, opens and lists a zip archive', async () => {
    const zip = await makeZip()
    const fetchSpy = respondWith(zip)
    const wrapper = createWrapper({ size: zip.size })
    await vi.waitFor(async () => {
      await flushPromises()
      expect(wrapper.findAll('.archive-row')).toHaveLength(2)
    })
    expect(fetchSpy).toHaveBeenCalledWith('https://cloud.test/signed', expect.anything())
    expect(wrapper.findAll('.archive-name').map((n) => n.text())).toEqual(['docs', 'root.txt'])
  })

  it('shows an error for damaged archives', async () => {
    respondWith(new Blob(['PK\u0003\u0004 not really a zip']))
    const wrapper = createWrapper()
    await vi.waitFor(async () => {
      await flushPromises()
      expect(wrapper.find('.archive-viewer-message').text()).toContain('damaged')
    })
  })

  it('explains unsupported formats', async () => {
    respondWith(new Blob(['7z content']))
    const wrapper = createWrapper({ name: 'archive.7z' })
    await vi.waitFor(async () => {
      await flushPromises()
      expect(wrapper.find('.archive-viewer-message').text()).toContain('not supported yet')
    })
  })

  it('reports failed downloads', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 403 }))
    const wrapper = createWrapper()
    await vi.waitFor(async () => {
      await flushPromises()
      expect(wrapper.find('.archive-viewer-message').text()).toContain('could not be loaded')
    })
  })
})

import { defaultPlugins, mount } from '@opencloud-eu/web-test-helpers'
import { flushPromises } from '@vue/test-utils'
import ArchiveBrowser from '../../src/components/ArchiveBrowser.vue'
import { openTar } from '../../src/engine/tar'
import * as download from '../../src/download'
import { buildTar } from './engine/tarBuilder'

const handle = () =>
  openTar(
    buildTar([
      { name: 'docs/guide.md', content: '# guide' },
      { name: 'docs/deep/data.json', content: '{"a":1}' },
      { name: 'big.txt', content: 'x'.repeat(50) },
      { name: 'a.txt', content: 'a' }
    ])
  )

const createWrapper = (archiveName = 'sample.tar', props: Record<string, unknown> = {}) =>
  mount(ArchiveBrowser, {
    props: { handle: handle(), archiveName, ...props },
    global: { plugins: [...defaultPlugins()], stubs: { OcIcon: true, PreviewModal: true } }
  })

const names = (wrapper: ReturnType<typeof createWrapper>) =>
  wrapper.findAll('.archive-name').map((node) => node.text())

describe('ArchiveBrowser', () => {
  afterEach(() => vi.restoreAllMocks())

  it('lists the root with folders first', () => {
    expect(names(createWrapper())).toEqual(['docs', 'a.txt', 'big.txt'])
  })

  it('opens folders and navigates back with the breadcrumb', async () => {
    const wrapper = createWrapper()
    await wrapper.find('.archive-row[data-path="docs"]').trigger('click')
    expect(names(wrapper)).toEqual(['deep', 'guide.md'])
    const crumbs = wrapper.findAll('.archive-crumb')
    expect(crumbs.map((c) => c.text())).toEqual(['sample.tar', 'docs'])
    await crumbs[0].trigger('click')
    expect(names(wrapper)).toEqual(['docs', 'a.txt', 'big.txt'])
  })

  it('searches the whole archive and shows each hit’s folder', async () => {
    const wrapper = createWrapper()
    wrapper.vm.searchQuery = 'data'
    await wrapper.vm.$nextTick()
    expect(names(wrapper)).toEqual(['data.json'])
    expect(wrapper.find('.archive-row-folder').text()).toBe('docs/deep')
  })

  it('sorts by size and toggles the direction', async () => {
    const wrapper = createWrapper()
    const sizeHeader = wrapper.find('.archive-sort[data-field="size"]')
    await sizeHeader.trigger('click')
    expect(names(wrapper)).toEqual(['docs', 'a.txt', 'big.txt'])
    await sizeHeader.trigger('click')
    expect(names(wrapper)).toEqual(['docs', 'big.txt', 'a.txt'])
  })

  it('downloads a single file', async () => {
    const trigger = vi.spyOn(download, 'triggerDownload').mockImplementation(() => {})
    const wrapper = createWrapper()
    await wrapper.find('.archive-row[data-path="a.txt"] .archive-download').trigger('click')
    await flushPromises()
    expect(trigger).toHaveBeenCalledWith(expect.any(Blob), 'a.txt')
  })

  it('downloads a selected folder as one zip', async () => {
    const trigger = vi.spyOn(download, 'triggerDownload').mockImplementation(() => {})
    const zip = vi.spyOn(download, 'zipEntries').mockResolvedValue(new Blob(['zip']))
    const wrapper = createWrapper()
    wrapper.vm.toggleSelection(wrapper.vm.rows[0])
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.archive-download-selected').text()).toContain('(1)')
    await wrapper.vm.downloadSelection()
    expect(zip.mock.calls[0][1].map((e) => e.path)).toEqual([
      'docs/guide.md',
      'docs/deep/data.json'
    ])
    expect(trigger).toHaveBeenCalledWith(expect.any(Blob), 'sample-selection.zip')
  })

  it.each([
    ['large.tar.bz2', 'large-selection.zip'],
    ['photos.tgz', 'photos-selection.zip'],
    ['backup.zip', 'backup-selection.zip']
  ])('names the selection zip of %s %s', async (archiveName, expected) => {
    const trigger = vi.spyOn(download, 'triggerDownload').mockImplementation(() => {})
    vi.spyOn(download, 'zipEntries').mockResolvedValue(new Blob(['zip']))
    const wrapper = createWrapper(archiveName)
    wrapper.vm.toggleSelection(wrapper.vm.rows[0])
    await wrapper.vm.downloadSelection()
    expect(trigger).toHaveBeenCalledWith(expect.any(Blob), expected)
  })

  it('refuses files over the entry cap without reading them', async () => {
    const trigger = vi.spyOn(download, 'triggerDownload').mockImplementation(() => {})
    const wrapper = createWrapper('sample.tar', { maxEntrySize: 10 })
    const read = vi.spyOn(wrapper.props('handle'), 'read')
    await wrapper.find('.archive-row[data-path="big.txt"] .archive-download').trigger('click')
    await flushPromises()
    expect(read).not.toHaveBeenCalled()
    expect(trigger).not.toHaveBeenCalled()
  })

  it('refuses a selection whose total is over the entry cap', async () => {
    const zip = vi.spyOn(download, 'zipEntries')
    // The docs folder holds 7 + 7 bytes.
    const wrapper = createWrapper('sample.tar', { maxEntrySize: 10 })
    wrapper.vm.toggleSelection(wrapper.vm.rows[0])
    await wrapper.vm.downloadSelection()
    expect(zip).not.toHaveBeenCalled()
  })

  it('shows extraction progress from the bytes read by range', async () => {
    let finish: (blob: Blob) => void
    const wrapper = createWrapper('sample.tar', { bytesRead: 1000 })
    vi.spyOn(wrapper.props('handle'), 'read').mockReturnValue(
      new Promise((resolve) => (finish = resolve))
    )
    vi.spyOn(download, 'triggerDownload').mockImplementation(() => {})
    await wrapper.find('.archive-row[data-path="big.txt"] .archive-download').trigger('click')
    expect(wrapper.find('.archive-extracting').text()).toBe('Extracting big.txt…')
    await wrapper.setProps({ bytesRead: 1025 })
    expect(wrapper.find('.archive-extracting').text()).toBe('Extracting big.txt… 50%')
    finish(new Blob(['x']))
    await flushPromises()
    expect(wrapper.find('.archive-extracting').exists()).toBe(false)
  })
})

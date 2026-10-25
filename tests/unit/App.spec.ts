import { Resource } from '@opencloud-eu/web-client'
import { AppConfigObject } from '@opencloud-eu/web-pkg'
import { defaultPlugins, mount } from '@opencloud-eu/web-test-helpers'
import { mock } from 'vitest-mock-extended'
import App from '../../src/App.vue'

describe('archive viewer', () => {
  it('renders the archive name', () => {
    const { wrapper } = createWrapper({ name: 'photos.zip' })
    expect(wrapper.find('.archive-viewer-name').text()).toEqual('photos.zip')
  })
  it('renders the archive size', () => {
    const { wrapper } = createWrapper({ size: 2048 })
    expect(wrapper.find('.archive-viewer-size').text()).not.toEqual('')
  })
})

function createWrapper({
  name = 'archive.zip',
  size = 1024
}: { name?: string; size?: number } = {}) {
  return {
    wrapper: mount(App, {
      props: {
        resource: mock<Resource>({ name, size }),
        applicationConfig: mock<AppConfigObject>()
      },
      global: {
        plugins: [...defaultPlugins()],
        stubs: { OcIcon: true }
      }
    })
  }
}

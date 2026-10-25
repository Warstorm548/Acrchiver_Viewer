<template>
  <div class="archive-viewer ext:h-full ext:overflow-auto ext:p-4">
    <archive-browser v-if="state === 'ready'" :handle="handle" :archive-name="resource.name" />
    <div
      v-else
      class="ext:flex ext:flex-col ext:items-center ext:justify-center ext:h-full ext:gap-3 ext:text-center"
    >
      <oc-icon name="file-zip" size="xlarge" />
      <h1 class="archive-viewer-name ext:text-lg ext:font-semibold" v-text="resource.name" />
      <p class="archive-viewer-size" v-text="fileSize" />

      <template v-if="state === 'loading'">
        <oc-spinner :aria-label="$gettext('Loading archive')" />
        <p class="archive-viewer-progress" v-text="progressText" />
      </template>

      <template v-else>
        <p class="archive-viewer-message ext:max-w-md" v-text="message" />
        <oc-button
          v-if="url"
          class="archive-viewer-download"
          type="a"
          :href="url"
          appearance="filled"
        >
          <oc-icon name="download" />
          <span v-text="$gettext('Download archive')" />
        </oc-button>
      </template>
    </div>
  </div>
</template>

<script lang="ts">
import { computed, defineComponent, onBeforeUnmount, PropType, ref, shallowRef, watch } from 'vue'
import { useGettext } from 'vue3-gettext'
import { Resource } from '@opencloud-eu/web-client'
import { AppConfigObject, formatFileSize } from '@opencloud-eu/web-pkg'
import ArchiveBrowser from './components/ArchiveBrowser.vue'
import {
  archiveExtension,
  ArchiveError,
  ArchiveHandle,
  openArchive,
  resolveFormat,
  SIGNATURE_LENGTH
} from './engine'

export const DEFAULT_MAX_ARCHIVE_SIZE = 256 * 1024 * 1024
export const DEFAULT_MAX_UNCOMPRESSED_SIZE = 1024 * 1024 * 1024

type State = 'loading' | 'ready' | 'too-large' | 'error'

const positiveNumber = (value: unknown, fallback: number): number => {
  const number = Number(value)
  return number > 0 ? number : fallback
}

export default defineComponent({
  name: 'ArchiveViewer',
  components: { ArchiveBrowser },
  props: {
    applicationConfig: { type: Object as PropType<AppConfigObject>, required: true },
    resource: { type: Object as PropType<Resource>, required: true },
    url: { type: String, required: false, default: '' }
  },
  setup(props) {
    const { $gettext, current: currentLanguage } = useGettext()
    const state = ref<State>('loading')
    const message = ref('')
    const loaded = ref(0)
    const handle = shallowRef<ArchiveHandle | null>(null)
    let abortController: AbortController | null = null

    const maxArchiveSize = computed(() =>
      positiveNumber(props.applicationConfig?.maxArchiveSize, DEFAULT_MAX_ARCHIVE_SIZE)
    )
    const maxUncompressedSize = computed(() =>
      positiveNumber(props.applicationConfig?.maxUncompressedSize, DEFAULT_MAX_UNCOMPRESSED_SIZE)
    )

    const format = (size: number) => formatFileSize(size, currentLanguage)
    const fileSize = computed(() => format(props.resource.size as number))
    const progressText = computed(() => {
      const total = Number(props.resource.size)
      return total > 0
        ? $gettext('Downloading… %{percent}%', {
            percent: String(Math.min(100, Math.round((loaded.value / total) * 100)))
          })
        : $gettext('Downloading… %{size}', { size: format(loaded.value) })
    })

    const messageFor = (error: unknown): string => {
      if (error instanceof ArchiveError) {
        switch (error.code) {
          case 'unsupported-format':
            return $gettext(
              'This archive format is not supported yet. You can download it instead.'
            )
          case 'too-large':
            return $gettext('The archive expands to more data than the browser is allowed to open.')
          default:
            return $gettext('The archive seems to be damaged or is not a valid archive.')
        }
      }
      return $gettext('The archive could not be loaded.')
    }

    const download = async (url: string, signal: AbortSignal): Promise<Blob> => {
      const response = await fetch(url, { signal })
      if (!response.ok || !response.body) {
        throw new Error(`Download failed with HTTP ${response.status}`)
      }
      const reader = response.body.getReader()
      const chunks: Uint8Array<ArrayBuffer>[] = []
      for (;;) {
        const { done, value } = await reader.read()
        if (done) {
          break
        }
        chunks.push(value as Uint8Array<ArrayBuffer>)
        loaded.value += value.length
      }
      return new Blob(chunks)
    }

    const closeArchive = () => {
      abortController?.abort()
      abortController = null
      handle.value?.close().catch(() => {})
      handle.value = null
    }

    const load = async () => {
      closeArchive()
      loaded.value = 0
      if (Number(props.resource.size) > maxArchiveSize.value) {
        state.value = 'too-large'
        message.value = $gettext(
          'This archive is larger than %{limit}, the most this viewer opens in the browser. You can download it instead.',
          { limit: format(maxArchiveSize.value) }
        )
        return
      }
      if (!props.url) {
        state.value = 'loading'
        return
      }
      state.value = 'loading'
      const controller = new AbortController()
      abortController = controller
      try {
        const blob = await download(props.url, controller.signal)
        const head = new Uint8Array(await blob.slice(0, SIGNATURE_LENGTH).arrayBuffer())
        const archiveFormat = resolveFormat(archiveExtension(props.resource.name), head)
        const opened = await openArchive(blob, archiveFormat, {
          maxUncompressedSize: maxUncompressedSize.value
        })
        if (controller.signal.aborted) {
          await opened.close()
          return
        }
        handle.value = opened
        state.value = 'ready'
      } catch (error) {
        if (controller.signal.aborted) {
          return
        }
        console.error(error)
        state.value = 'error'
        message.value = messageFor(error)
      }
    }

    watch(() => [props.url, props.resource.id], load, { immediate: true })
    onBeforeUnmount(closeArchive)

    return { state, message, handle, fileSize, progressText }
  }
})
</script>

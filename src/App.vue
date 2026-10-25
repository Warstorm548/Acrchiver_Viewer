<template>
  <div class="archive-viewer ext:h-full ext:overflow-auto ext:p-4">
    <archive-browser
      v-if="state === 'ready'"
      :handle="handle"
      :archive-name="resource.name"
      :max-entry-size="limits.entry"
      :bytes-read="bytesRead"
    />
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
import { Resource, SpaceResource } from '@opencloud-eu/web-client'
import { AppConfigObject, formatFileSize } from '@opencloud-eu/web-pkg'
import ArchiveBrowser from './components/ArchiveBrowser.vue'
import {
  archiveExtension,
  ArchiveError,
  ArchiveHandle,
  HttpRangeReader,
  isCompressedFormat,
  openArchive,
  openZip,
  resolveFormat,
  SIGNATURE_LENGTH
} from './engine'
import { resolveLimits } from './limits'

type State = 'loading' | 'ready' | 'too-large' | 'error'
type Phase = 'download' | 'index' | 'decompress'
type GetUrlForResource = (space: SpaceResource, resource: Resource) => Promise<string>

export default defineComponent({
  name: 'ArchiveViewer',
  components: { ArchiveBrowser },
  props: {
    applicationConfig: { type: Object as PropType<AppConfigObject>, required: true },
    resource: { type: Object as PropType<Resource>, required: true },
    url: { type: String, required: false, default: '' },
    space: { type: Object as PropType<SpaceResource>, required: false, default: null },
    /** Provided by OpenCloud's AppWrapper; used to renew the signed URL when it expires. */
    getUrlForResource: {
      type: Function as PropType<GetUrlForResource>,
      required: false,
      default: null
    }
  },
  setup(props) {
    const { $gettext, current: currentLanguage } = useGettext()
    const state = ref<State>('loading')
    const phase = ref<Phase>('download')
    const message = ref('')
    const loaded = ref(0)
    /** Bytes fetched by range requests since the archive was opened (drives read progress). */
    const bytesRead = ref(0)
    const handle = shallowRef<ArchiveHandle | null>(null)
    let abortController: AbortController | null = null

    const limits = computed(() => resolveLimits(props.applicationConfig))

    const format = (size: number) => formatFileSize(size, currentLanguage)
    const fileSize = computed(() => format(props.resource.size as number))
    const progressText = computed(() => {
      if (phase.value === 'index') {
        return $gettext('Reading archive index…')
      }
      if (phase.value === 'decompress') {
        return $gettext('Decompressing…')
      }
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

    /** ZIPs are read by HTTP range requests: only the index and the files the user opens. */
    const canUseRanges = () =>
      archiveExtension(props.resource.name) === 'zip' && !props.url.startsWith('blob:')

    /** Returns the opened ZIP, or null if the file isn't a ZIP or the server ignores ranges. */
    const openByRange = async (signal: AbortSignal): Promise<ArchiveHandle | null> => {
      phase.value = 'index'
      const renewUrl =
        props.getUrlForResource && props.space
          ? () => props.getUrlForResource(props.space, props.resource)
          : undefined
      const reader = new HttpRangeReader(props.url, Number(props.resource.size), {
        renewUrl,
        signal,
        onBytes: (count) => (bytesRead.value += count)
      })
      try {
        const head = await reader.readUint8Array(0, SIGNATURE_LENGTH)
        if (resolveFormat('zip', head) !== 'zip') {
          return null
        }
        return await openZip(reader, { maxEntrySize: limits.value.entry })
      } catch (error) {
        if (error instanceof ArchiveError && error.code === 'range-unsupported') {
          return null
        }
        throw error
      }
    }

    const openByDownload = async (signal: AbortSignal): Promise<ArchiveHandle | null> => {
      if (Number(props.resource.size) > limits.value.archive) {
        state.value = 'too-large'
        message.value = $gettext(
          'This archive is larger than %{limit}, the most this viewer opens in the browser on this device. You can download it instead.',
          { limit: format(limits.value.archive) }
        )
        return null
      }
      phase.value = 'download'
      const blob = await download(props.url, signal)
      const head = new Uint8Array(await blob.slice(0, SIGNATURE_LENGTH).arrayBuffer())
      const archiveFormat = resolveFormat(archiveExtension(props.resource.name), head)
      if (isCompressedFormat(archiveFormat)) {
        phase.value = 'decompress'
      }
      return openArchive(
        blob,
        archiveFormat,
        { maxUncompressedSize: limits.value.uncompressed, maxEntrySize: limits.value.entry },
        props.resource.name
      )
    }

    const load = async () => {
      closeArchive()
      loaded.value = 0
      bytesRead.value = 0
      state.value = 'loading'
      if (!props.url) {
        return
      }
      const controller = new AbortController()
      abortController = controller
      try {
        let opened = canUseRanges() ? await openByRange(controller.signal) : null
        if (!opened) {
          opened = await openByDownload(controller.signal)
        }
        if (!opened) {
          return
        }
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

    return { state, message, handle, fileSize, progressText, limits, bytesRead }
  }
})
</script>

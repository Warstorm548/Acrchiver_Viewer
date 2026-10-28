<template>
  <div class="archive-viewer ext:h-full ext:overflow-auto ext:p-4">
    <archive-browser
      v-if="state === 'ready'"
      :handle="handle"
      :remote="remote"
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
        <oc-button
          v-if="phase === 'server-copy' || phase === 'server-scan'"
          class="archive-viewer-cancel"
          appearance="outline"
          @click="cancel"
        >
          <span v-text="$gettext('Cancel')" />
        </oc-button>
      </template>

      <template v-else>
        <p class="archive-viewer-message ext:max-w-md" v-text="message" />
        <div class="ext:flex ext:flex-wrap ext:justify-center ext:gap-2">
          <oc-button
            v-if="state === 'cancelled'"
            class="archive-viewer-retry"
            appearance="outline"
            @click="load"
          >
            <span v-text="$gettext('Open again')" />
          </oc-button>
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
        </div>
      </template>
    </div>
  </div>
</template>

<script lang="ts">
import { computed, defineComponent, onBeforeUnmount, PropType, ref, shallowRef, watch } from 'vue'
import { useGettext } from 'vue3-gettext'
import { Resource, SpaceResource } from '@opencloud-eu/web-client'
import { AppConfigObject, formatFileSize, useAuthStore } from '@opencloud-eu/web-pkg'
import ArchiveBrowser from './components/ArchiveBrowser.vue'
import {
  archiveExtension,
  ArchiveError,
  ArchiveHandle,
  BlobBuilder,
  HttpRangeReader,
  isCompressedFormat,
  isOutOfMemory,
  openArchive,
  openZip,
  resolveFormat,
  SIGNATURE_LENGTH
} from './engine'
import {
  HelperClient,
  HelperError,
  HelperHealth,
  resolveHelperUrl,
  SessionStatus
} from './helper/client'
import { RemoteArchive } from './helper/remote'
import { resolveLimits } from './limits'

type State = 'loading' | 'ready' | 'too-large' | 'error' | 'cancelled'
type Phase = 'download' | 'index' | 'decompress' | 'server-copy' | 'server-scan'
type GetUrlForResource = (space: SpaceResource, resource: Resource) => Promise<string>

/** Formats the server helper reads (ZIPs are read by range in the browser instead). */
const HELPER_EXTENSIONS = new Set([
  'tar',
  'tar.gz',
  'tgz',
  'tar.bz2',
  'tbz2',
  'tbz',
  'tar.xz',
  'txz',
  'tlz',
  'gz',
  'bz2',
  'xz',
  'lzma'
])

/** How often the status of an archive being prepared on the server is checked. */
const STATUS_INTERVAL = 1000

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(new DOMException('Aborted', 'AbortError'))
    })
  })

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
    const authStore = useAuthStore()
    const state = ref<State>('loading')
    const phase = ref<Phase>('download')
    const message = ref('')
    const loaded = ref(0)
    /** Bytes fetched by range requests since the archive was opened (drives read progress). */
    const bytesRead = ref(0)
    const handle = shallowRef<ArchiveHandle | null>(null)
    const remote = shallowRef<RemoteArchive | null>(null)
    const serverStatus = shallowRef<SessionStatus | null>(null)
    let abortController: AbortController | null = null
    /** A helper session still being prepared (closed if the user cancels or leaves). */
    let pendingRemote: RemoteArchive | null = null

    const limits = computed(() => resolveLimits(props.applicationConfig))

    const format = (size: number) => formatFileSize(size, currentLanguage)
    const fileSize = computed(() => format(props.resource.size as number))
    const percent = (done: number, total: number) =>
      String(total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0)
    const progressText = computed(() => {
      const status = serverStatus.value
      if (phase.value === 'server-copy') {
        return $gettext('Preparing the archive on the server… %{percent}%', {
          percent: percent(status?.copied ?? 0, status?.size ?? 0)
        })
      }
      if (phase.value === 'server-scan') {
        return $gettext('Reading the archive on the server… %{percent}%', {
          percent: percent(status?.scanned ?? 0, status?.size ?? 0)
        })
      }
      if (phase.value === 'index') {
        return $gettext('Reading archive index…')
      }
      if (phase.value === 'decompress') {
        return $gettext('Decompressing…')
      }
      const total = Number(props.resource.size)
      return total > 0
        ? $gettext('Downloading… %{percent}%', { percent: percent(loaded.value, total) })
        : $gettext('Downloading… %{size}', { size: format(loaded.value) })
    })

    const unsupportedMessage = () =>
      $gettext('This archive format is not supported yet. You can download it instead.')
    const damagedMessage = () =>
      $gettext('The archive seems to be damaged or is not a valid archive.')

    /** Messages for the helper's error codes (from opening or from the session status). */
    const helperMessage = (error: HelperError): string => {
      switch (error.code) {
        case 'server-busy':
          return $gettext(
            'Server busy: not enough space to open this archive right now. Try again in a few minutes.'
          )
        case 'user-quota':
          return $gettext('You have too many large archives open. Close one and try again.')
        case 'archive-too-large':
          return $gettext(
            'This archive is larger than the server allows (%{limit}). You can download it instead.',
            { limit: format(error.limit ?? 0) }
          )
        case 'unsupported-format':
          return unsupportedMessage()
        case 'corrupt':
          return damagedMessage()
        case 'too-complex':
          return $gettext(
            'This archive is too large or complex to list on the server. You can download it instead.'
          )
        case 'changed':
          return $gettext('The archive changed while it was being opened. Please try again.')
        default:
          return $gettext('The server could not open this archive. You can download it instead.')
      }
    }

    const messageFor = (error: unknown): string => {
      const outOfMemory = $gettext(
        'This device does not have enough free memory to open this archive. You can download it instead.'
      )
      if (error instanceof HelperError) {
        return helperMessage(error)
      }
      if (isOutOfMemory(error)) {
        return outOfMemory
      }
      if (error instanceof ArchiveError) {
        switch (error.code) {
          case 'unsupported-format':
            return unsupportedMessage()
          case 'too-large':
            return $gettext('The archive expands to more data than the browser is allowed to open.')
          case 'out-of-memory':
            return outOfMemory
          default:
            return damagedMessage()
        }
      }
      return $gettext('The archive could not be loaded.')
    }

    /**
     * Downloads the whole archive into the blob store, or returns null as soon as it turns out
     * larger than `maxSize` (the size in the file's metadata may be wrong or missing).
     */
    const download = async (
      url: string,
      signal: AbortSignal,
      maxSize: number
    ): Promise<Blob | null> => {
      const response = await fetch(url, { signal })
      if (!response.ok || !response.body) {
        throw new Error(`Download failed with HTTP ${response.status}`)
      }
      const reader = response.body.getReader()
      const output = new BlobBuilder()
      for (;;) {
        const { done, value } = await reader.read()
        if (done) {
          break
        }
        if (output.size + value.length > maxSize) {
          await reader.cancel()
          return null
        }
        output.append(value)
        loaded.value += value.length
      }
      return output.build()
    }

    const closeArchive = () => {
      abortController?.abort()
      abortController = null
      handle.value?.close().catch(() => {})
      handle.value = null
      pendingRemote?.close()
      pendingRemote = null
      remote.value?.close()
      remote.value = null
      serverStatus.value = null
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

    const tooLarge = (): null => {
      state.value = 'too-large'
      message.value = $gettext(
        'This archive is larger than %{limit}, the most this viewer opens in the browser on this device. You can download it instead.',
        { limit: format(limits.value.archive) }
      )
      return null
    }

    const openByDownload = async (signal: AbortSignal): Promise<ArchiveHandle | null> => {
      if (Number(props.resource.size) > limits.value.archive) {
        return tooLarge()
      }
      phase.value = 'download'
      const blob = await download(props.url, signal, limits.value.archive)
      if (!blob) {
        return tooLarge()
      }
      const head = new Uint8Array(await blob.slice(0, SIGNATURE_LENGTH).arrayBuffer())
      const archiveFormat = resolveFormat(archiveExtension(props.resource.name), head)
      if (isCompressedFormat(archiveFormat)) {
        phase.value = 'decompress'
      }
      return openArchive(
        blob,
        archiveFormat,
        { maxUncompressedSize: limits.value.uncompressed, maxEntrySize: limits.value.entry },
        props.resource.name,
        signal
      )
    }

    // --- server helper ---------------------------------------------------------------------

    const helperUrl = computed(() => resolveHelperUrl(props.applicationConfig))
    const helperClient = () => new HelperClient(helperUrl.value, () => authStore.accessToken)
    let healthCheck: Promise<HelperHealth | null> | null = null

    /** The file's WebDAV path as the helper expects it: /spaces/<space id>/<path>. */
    const webDavPath = (): string => {
      if (props.resource.webDavPath) {
        return props.resource.webDavPath
      }
      if (props.space?.webDavPath && props.resource.path) {
        return `${props.space.webDavPath}/${props.resource.path}`.replace(/\/{2,}/g, '/')
      }
      return ''
    }

    /**
     * The helper's settings when it can open this file: installed (it answers), a logged-in user
     * (public links have no token), and a format it reads. Checked once per viewer.
     */
    const usableHelper = (): Promise<HelperHealth | null> => {
      if (
        !helperUrl.value ||
        !authStore.accessToken ||
        !webDavPath() ||
        !HELPER_EXTENSIONS.has(archiveExtension(props.resource.name))
      ) {
        return Promise.resolve(null)
      }
      healthCheck ??= helperClient()
        .health()
        .catch((): null => null)
      return healthCheck
    }

    /** Opens the archive on the server and waits (with progress) until it is listed. */
    const openOnServer = async (
      health: HelperHealth,
      signal: AbortSignal
    ): Promise<RemoteArchive> => {
      phase.value = 'server-copy'
      serverStatus.value = null
      const client = helperClient()
      let status = await client.open(webDavPath())
      const opened = new RemoteArchive(client, status.id, health)
      pendingRemote = opened
      while (status.state === 'copying' || status.state === 'scanning') {
        serverStatus.value = status
        phase.value = status.state === 'copying' ? 'server-copy' : 'server-scan'
        await sleep(STATUS_INTERVAL, signal)
        status = await client.status(status.id, signal)
      }
      pendingRemote = null
      if (status.state === 'error') {
        await opened.close()
        throw new HelperError(status.error ?? 'helper-error', 0, `Opening failed: ${status.error}`)
      }
      opened.startHeartbeat(() => {
        remote.value = null
        state.value = 'error'
        message.value = $gettext(
          'This archive was closed on the server after a period of inactivity. Reload the page to open it again.'
        )
      })
      return opened
    }

    const cancel = () => {
      closeArchive()
      state.value = 'cancelled'
      message.value = $gettext('Opening the archive was cancelled.')
    }

    const load = async () => {
      closeArchive()
      loaded.value = 0
      bytesRead.value = 0
      state.value = 'loading'
      phase.value = 'download'
      if (!props.url) {
        return
      }
      const controller = new AbortController()
      abortController = controller
      const { signal } = controller

      /** Opens on the server when the helper can, else returns null. */
      const tryServer = async (): Promise<boolean> => {
        const health = await usableHelper()
        if (!health || signal.aborted) {
          return false
        }
        state.value = 'loading'
        const opened = await openOnServer(health, signal)
        if (signal.aborted) {
          await opened.close()
          return true
        }
        remote.value = opened
        state.value = 'ready'
        return true
      }

      try {
        let opened = canUseRanges() ? await openByRange(signal) : null
        if (!opened && Number(props.resource.size) > limits.value.archive && (await tryServer())) {
          return
        }
        if (!opened) {
          opened = await openByDownload(signal)
        }
        if (!opened) {
          // only when too large for the browser (the metadata's size was wrong): the "too large"
          // message stays unless the helper can open it
          await tryServer()
          return
        }
        if (signal.aborted) {
          await opened.close()
          return
        }
        handle.value = opened
        state.value = 'ready'
      } catch (error) {
        if (signal.aborted) {
          return
        }
        const tooBigForBrowser =
          isOutOfMemory(error) ||
          (error instanceof ArchiveError && ['too-large', 'out-of-memory'].includes(error.code))
        if (tooBigForBrowser) {
          try {
            if (await tryServer()) {
              return
            }
          } catch (serverError) {
            if (signal.aborted) {
              return
            }
            error = serverError
          }
        }
        console.error(error)
        state.value = 'error'
        message.value = messageFor(error)
      }
    }

    watch(() => [props.url, props.resource.id], load, { immediate: true })
    onBeforeUnmount(closeArchive)

    return {
      state,
      phase,
      message,
      handle,
      remote,
      fileSize,
      progressText,
      limits,
      bytesRead,
      cancel,
      load
    }
  }
})
</script>

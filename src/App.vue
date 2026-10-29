<template>
  <div class="archive-viewer ext:h-full ext:overflow-auto ext:p-4">
    <p
      v-if="state === 'ready' && notice"
      class="archive-viewer-notice ext:mb-2 ext:text-sm"
      role="status"
      v-text="notice"
    />
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
  formatForExtension,
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
import { checkHelper, HelperCheck, helperHasFeature } from './helper/gate'
import { RemoteArchive } from './helper/remote'
import { resolveLimits } from './limits'

type State = 'loading' | 'ready' | 'too-large' | 'error' | 'cancelled'
type Phase = 'download' | 'index' | 'decompress' | 'server-copy' | 'server-scan'
type GetUrlForResource = (space: SpaceResource, resource: Resource) => Promise<string>

/**
 * Formats the server helper reads. ZIPs go to it only when over the browser's archive limit or
 * when they hold entries the browser can't decompress; otherwise they are read by range.
 */
const HELPER_EXTENSIONS = new Set([
  'zip',
  '7z',
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

/** Formats only the helper can open (their codecs need WebAssembly in the browser). */
const HELPER_ONLY = new Set(['7z'])

/** How often the status of an archive being prepared on the server is checked. */
const STATUS_INTERVAL = 1000

const abortError = () => new DOMException('Aborted', 'AbortError')

/** Waits `ms`, or rejects at once when `signal` is (or becomes) aborted; leaves no listener behind. */
const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError())
      return
    }
    const onAbort = () => {
      clearTimeout(timer)
      reject(abortError())
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal.addEventListener('abort', onAbort, { once: true })
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
    /** Shown above an open archive, e.g. why a big ZIP is read in the browser after all. */
    const notice = ref('')
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

    const misconfiguredMessage = () =>
      $gettext(
        'The server helper is installed but not set up correctly, so this archive can’t be opened. You can download it instead.'
      )
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
        case 'encrypted':
          return $gettext(
            'This archive is password-protected, which is not supported. You can download it instead.'
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
      notice.value = ''
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
      message.value =
        helperUnavailable === 'misconfigured'
          ? $gettext(
              'This archive is larger than %{limit}, the most this viewer opens in the browser on this device, and the server helper is installed but not set up correctly. You can download it instead.',
              { limit: format(limits.value.archive) }
            )
          : $gettext(
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
    /** The helper check for the current archive (see src/helper/gate.ts); reset by `load`. */
    let healthCheck: Promise<HelperCheck> | null = null
    /** Why the helper wasn't used for the current archive; picks the message when it was needed. */
    let helperUnavailable: 'missing' | 'misconfigured' | null = null

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
     * The helper's settings when it can open this file: a logged-in user (public links have no
     * token), a format it lists among its features, and a helper that passes the version gate and
     * reports itself ready. Checked once per opened archive; the reason it can't be used goes to
     * the console for the admin.
     */
    const usableHelper = async (): Promise<HelperHealth | null> => {
      const extension = archiveExtension(props.resource.name)
      if (
        !helperUrl.value ||
        !authStore.accessToken ||
        !webDavPath() ||
        !HELPER_EXTENSIONS.has(extension)
      ) {
        return null
      }
      if (!healthCheck) {
        healthCheck = checkHelper(helperClient(), props.applicationConfig)
        healthCheck.then((check) => check.detail && console.warn(`Archive Viewer: ${check.detail}`))
      }
      const check = await healthCheck
      if ('reason' in check) {
        helperUnavailable = check.reason
        return null
      }
      const feature = `format:${formatForExtension(extension) ?? extension}`
      if (!helperHasFeature(check.health, feature)) {
        helperUnavailable = 'misconfigured'
        return null
      }
      return check.health
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
      // From here on the session holds server space: any way out other than success closes it
      // (Cancel during the open request, a failed status call, a failed listing).
      try {
        if (signal.aborted) {
          throw abortError()
        }
        pendingRemote = opened
        while (status.state === 'copying' || status.state === 'scanning') {
          serverStatus.value = status
          phase.value = status.state === 'copying' ? 'server-copy' : 'server-scan'
          await sleep(STATUS_INTERVAL, signal)
          status = await client.status(status.id, signal)
        }
        if (status.state === 'error') {
          throw new HelperError(
            status.error ?? 'helper-error',
            0,
            `Opening failed: ${status.error}`
          )
        }
      } catch (error) {
        await opened.close()
        throw error
      } finally {
        pendingRemote = null
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
      healthCheck = null
      helperUnavailable = null
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

      /**
       * For ZIPs, which the browser can still read by range: a helper failure leaves a notice and
       * returns false instead of failing.
       */
      let serverFailed = false
      const tryServerOrRange = async (): Promise<boolean> => {
        try {
          return await tryServer()
        } catch (error) {
          if (signal.aborted) {
            throw error
          }
          serverFailed = true
          console.warn(
            'The archive helper could not open this ZIP; reading it in the browser.',
            error
          )
          notice.value = $gettext(
            'The server could not prepare this archive, so it is read in the browser, where some files may not open.'
          )
          phase.value = 'index'
          return false
        }
      }

      try {
        if (HELPER_ONLY.has(archiveExtension(props.resource.name))) {
          if (!(await tryServer()) && !signal.aborted) {
            state.value = 'error'
            message.value =
              helperUnavailable === 'misconfigured'
                ? misconfiguredMessage()
                : $gettext(
                    'This archive format can only be opened when the server helper is installed. You can download it instead.'
                  )
          }
          return
        }
        const overBrowserLimit = Number(props.resource.size) > limits.value.archive
        // big ZIPs go to the helper, which reads files and selections of any size
        if (canUseRanges() && overBrowserLimit && (await tryServerOrRange())) {
          return
        }
        let opened = canUseRanges() ? await openByRange(signal) : null
        // entries only the helper can decompress (Deflate64, bzip2, …): open it there instead
        // (with its progress and Cancel); the range listing is used only if the helper is
        // missing or fails
        if (!serverFailed && opened?.entries.some((entry) => entry.needsServer)) {
          let onServer = false
          try {
            onServer = await tryServerOrRange()
          } finally {
            if (onServer || signal.aborted) {
              await opened.close()
            }
          }
          if (onServer) {
            return
          }
        }
        if (!opened && overBrowserLimit && !serverFailed && (await tryServer())) {
          return
        }
        if (!opened) {
          opened = await openByDownload(signal)
        }
        if (!opened) {
          // only when too large for the browser (the metadata's size was wrong): the "too large"
          // message stays unless the helper can open it
          if (!serverFailed) {
            await tryServer()
          }
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
        if (tooBigForBrowser && !serverFailed) {
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
      notice,
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

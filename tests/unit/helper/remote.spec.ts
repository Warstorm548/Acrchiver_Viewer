import { mock } from 'vitest-mock-extended'
import { HelperClient, HelperError, HelperHealth } from '../../../src/helper/client'
import { RemoteArchive, toArchiveEntry } from '../../../src/helper/remote'

const health = { heartbeatSeconds: 30 } as HelperHealth

describe('RemoteArchive', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('turns helper entries into archive entries', () => {
    expect(
      toArchiveEntry({
        path: 'a/b.txt',
        name: 'b.txt',
        isDirectory: false,
        size: 3,
        modified: 1000,
        supported: true
      })
    ).toEqual({
      path: 'a/b.txt',
      name: 'b.txt',
      isDirectory: false,
      size: 3,
      modified: new Date(1000),
      supported: true
    })
    expect(
      toArchiveEntry({ path: 'd', name: 'd', isDirectory: true, size: 0, supported: true }).modified
    ).toBeUndefined()
  })

  it('sends heartbeats and reports a session the helper no longer knows', async () => {
    const client = mock<HelperClient>()
    client.heartbeat.mockResolvedValueOnce().mockRejectedValueOnce(new TypeError('offline'))
    client.heartbeat.mockRejectedValueOnce(new HelperError('session-not-found', 404, 'gone'))
    const onLost = vi.fn()
    new RemoteArchive(client, 'id', health).startHeartbeat(onLost)

    await vi.advanceTimersByTimeAsync(30_000)
    await vi.advanceTimersByTimeAsync(30_000) // a network blip is ignored
    expect(onLost).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(30_000)
    expect(onLost).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(90_000)
    expect(client.heartbeat).toHaveBeenCalledTimes(3) // stopped after the session was lost
  })

  it('closes once, stops the heartbeat and closes on pagehide with keepalive', async () => {
    const client = mock<HelperClient>()
    client.close.mockResolvedValue()
    const remote = new RemoteArchive(client, 'id', health)
    remote.startHeartbeat(vi.fn())
    window.dispatchEvent(new Event('pagehide'))
    await remote.close()
    expect(client.close).toHaveBeenCalledTimes(1)
    expect(client.close).toHaveBeenCalledWith('id', true)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(client.heartbeat).not.toHaveBeenCalled()
  })
})

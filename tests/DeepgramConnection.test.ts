/**
 * Verifies source connection backpressure and the Deepgram-owned graceful close sequence.
 */

import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import WebSocket from 'ws'
import { DEFAULT_SETTINGS } from '../src/shared/types'
import DeepgramConnection from '../src/main/services/DeepgramConnection'

interface ConnectionInternals {
  socket: FakeSocket | null
  sendInFlight: boolean
  pendingAudio: Buffer[]
  finalizeAcknowledged: boolean
}

class FakeSocket extends EventEmitter {
  public readyState: number = WebSocket.OPEN
  public bufferedAmount = 0
  public readonly sent: Array<string | Buffer> = []
  public terminated = false

  /** Records a control or binary frame and emulates ws send completion. */
  public send(
    data: string | Buffer,
    optionsOrCallback?: { binary: boolean } | ((error?: Error) => void),
    callback?: (error?: Error) => void,
  ): void {
    this.sent.push(data)
    const completion = typeof optionsOrCallback === 'function' ? optionsOrCallback : callback
    completion?.()
  }

  /** Emulates a hard socket shutdown used only by timeout fallback. */
  public terminate(): void {
    this.terminated = true
    this.readyState = WebSocket.CLOSED
    this.emit('close')
  }
}

/** Creates a connection with inert callbacks and exposes test-only runtime fields. */
const createConnection = (): {
  connection: DeepgramConnection
  internals: ConnectionInternals
  onError: ReturnType<typeof vi.fn>
} => {
  const onError = vi.fn()
  const connection = new DeepgramConnection({
    source: 'microphone',
    apiKey: 'test-key',
    settings: DEFAULT_SETTINGS.transcriptionProviderSettings.deepgram,
    onResult: vi.fn(),
    onError,
    onDiagnostic: vi.fn(),
  })
  return {
    connection,
    internals: connection as unknown as ConnectionInternals,
    onError,
  }
}

describe('DeepgramConnection', () => {
  it('drops the oldest application frame and preserves the newest audio', () => {
    const { connection, internals } = createConnection()
    internals.socket = new FakeSocket()
    internals.sendInFlight = true

    for (let value = 1; value <= 6; value += 1) connection.send(Uint8Array.of(value))

    expect(internals.pendingAudio.map((frame) => frame[0])).toEqual([3, 4, 5, 6])
  })

  it('finalizes before CloseStream and waits for the remote close handshake', async () => {
    const { connection, internals } = createConnection()
    const socket = new FakeSocket()
    internals.socket = socket
    socket.send = (data, optionsOrCallback, callback): void => {
      socket.sent.push(data)
      const completion = typeof optionsOrCallback === 'function' ? optionsOrCallback : callback
      if (data === JSON.stringify({ type: 'Finalize' })) internals.finalizeAcknowledged = true
      completion?.()
      if (data === JSON.stringify({ type: 'CloseStream' })) {
        socket.readyState = WebSocket.CLOSED
        queueMicrotask(() => socket.emit('close'))
      }
    }

    await connection.close()

    expect(socket.sent).toEqual([
      JSON.stringify({ type: 'Finalize' }),
      JSON.stringify({ type: 'CloseStream' }),
    ])
    expect(socket.terminated).toBe(false)
  })

  it('recovers its send queue when the socket rejects a frame synchronously', () => {
    const { connection, internals, onError } = createConnection()
    const socket = new FakeSocket()
    internals.socket = socket
    socket.send = (): void => {
      throw new Error('socket unavailable')
    }

    connection.send(Uint8Array.of(1, 2, 3))

    expect(internals.sendInFlight).toBe(false)
    expect(internals.pendingAudio).toEqual([])
    expect(onError).toHaveBeenCalledWith('socket unavailable')
  })
})

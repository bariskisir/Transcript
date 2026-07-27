/**
 * Captures microphone and speaker-loopback streams and converts each independently to PCM16.
 */

import type { AudioSource, DesktopPlatform } from '@shared/types'
import { PCM_WORKLET_SOURCE } from '@shared/pcmWorkletSource'

interface CaptureBinding {
  stream: MediaStream
  context: AudioContext
  sourceNode: MediaStreamAudioSourceNode
  workletNode: AudioWorkletNode
  sinkNode: GainNode
  diagnosticTimer: ReturnType<typeof setInterval>
}

interface StartOptions {
  sources: AudioSource[]
  microphoneDeviceId: string
  speakerDeviceId: string
  platform: DesktopPlatform
  onFrame: (source: AudioSource, samples: ArrayBuffer) => void
  onLevel: (source: AudioSource, level: number) => void
  onDiagnostic?: (message: string, details: Record<string, unknown>) => void
}

export interface AudioDevice {
  id: string
  label: string
  kind: 'microphone' | 'speaker'
}

const PSEUDO_DEVICE_IDS = new Set(['default', 'communications'])
const PCM_CHUNK_SAMPLES = 1_600
const WORKLET_FLUSH_TIMEOUT_MS = 150

/** Returns true only for a concrete Chromium audio endpoint identifier. */
const isPhysicalDeviceId = (deviceId: string): boolean =>
  Boolean(deviceId) && !PSEUDO_DEVICE_IDS.has(deviceId)

/**
 * Builds a set of output-device groupIds so an input sharing that group can be
 * identified as a monitor source on Linux.  This works across PulseAudio native
 * and PipeWire (via pipewire-pulse).
 */
const buildOutputGroupIds = (devices: MediaDeviceInfo[]): Set<string> => {
  const groupIds = new Set<string>()
  for (const device of devices) {
    if (device.kind === 'audiooutput' && isPhysicalDeviceId(device.deviceId) && device.groupId) {
      groupIds.add(device.groupId)
    }
  }
  return groupIds
}

/** Returns true when a device label suggests a monitor source. */
const hasMonitorLabel = (label: string): boolean => /\bmonitor\b/i.test(label)

export default class AudioCaptureService {
  private readonly bindings = new Map<AudioSource, CaptureBinding>()
  private currentPlatform: DesktopPlatform = 'win32'

  /** Lists microphone inputs and speaker outputs exposed by Chromium. */
  public async listDevices(platform?: DesktopPlatform): Promise<AudioDevice[]> {
    const effectivePlatform = platform ?? this.currentPlatform
    const devices = await navigator.mediaDevices.enumerateDevices()
    const endpoints = new Map<string, AudioDevice>()

    for (const device of devices) {
      if (
        (device.kind !== 'audioinput' && device.kind !== 'audiooutput') ||
        !isPhysicalDeviceId(device.deviceId)
      ) {
        continue
      }
      const endpointKey = `${device.kind}:${device.groupId || device.deviceId}`

      if (device.kind === 'audioinput') {
        if (effectivePlatform === 'linux') {
          if (hasMonitorLabel(device.label) || /\.monitor$/i.test(device.deviceId)) {
            const speakerKey = `speaker:${device.groupId || device.deviceId}`
            if (!endpoints.has(speakerKey)) {
              endpoints.set(speakerKey, {
                id: device.deviceId,
                label: device.label,
                kind: 'speaker',
              })
            }
          } else {
            if (!endpoints.has(endpointKey)) {
              endpoints.set(endpointKey, {
                id: device.deviceId,
                label: device.label,
                kind: 'microphone',
              })
            }
          }
        } else {
          if (!endpoints.has(endpointKey)) {
            endpoints.set(endpointKey, {
              id: device.deviceId,
              label: device.label,
              kind: 'microphone',
            })
          }
        }
      } else {
        if (effectivePlatform === 'linux') continue
        if (!endpoints.has(endpointKey)) {
          endpoints.set(endpointKey, { id: device.deviceId, label: device.label, kind: 'speaker' })
        }
      }
    }

    return [...endpoints.values()]
  }

  /** Starts every requested source and rolls back if any capture fails. */
  public async start(options: StartOptions): Promise<void> {
    if (this.bindings.size > 0) throw new Error('Audio capture is already active.')
    this.currentPlatform = options.platform
    try {
      for (const source of options.sources) {
        const stream =
          source === 'microphone'
            ? await this.createMicrophoneStream(options.microphoneDeviceId)
            : await this.createSpeakerStream(options.speakerDeviceId)
        await this.attachStream(source, stream, options)
      }
    } catch (error) {
      await this.stop()
      throw error
    }
  }

  /** Stops tracks, audio graphs, and worklet contexts for all sources. */
  public async stop(): Promise<void> {
    const bindings = [...this.bindings.values()]
    this.bindings.clear()
    await Promise.allSettled(
      bindings.map(async (binding) => {
        await this.releaseBinding(binding, true)
      }),
    )
  }

  /** Requests an unprocessed mono microphone stream for accurate transcription. */
  private async createMicrophoneStream(deviceId: string): Promise<MediaStream> {
    const devices = await this.listDevices()
    const selectedDeviceId = devices.some(
      (device) => device.kind === 'microphone' && device.id === deviceId,
    )
      ? deviceId
      : 'default'
    return navigator.mediaDevices.getUserMedia({
      video: false,
      audio: {
        ...(isPhysicalDeviceId(selectedDeviceId) ? { deviceId: { exact: selectedDeviceId } } : {}),
        channelCount: 1,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    })
  }

  /** Requests Windows speaker loopback or Linux monitor source capture based on platform. */
  private async createSpeakerStream(deviceId: string): Promise<MediaStream> {
    if (this.currentPlatform === 'linux') {
      return this.createLinuxSpeakerStream(deviceId)
    }
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
    stream.getVideoTracks().forEach((track) => {
      track.stop()
    })
    if (stream.getAudioTracks().length === 0) {
      stream.getTracks().forEach((track) => {
        track.stop()
      })
      throw new Error('The selected speaker did not provide loopback audio.')
    }
    return stream
  }

  /** Captures system audio via a PulseAudio/PipeWire monitor source on Linux. */
  private async createLinuxSpeakerStream(deviceId: string): Promise<MediaStream> {
    const devices = await navigator.mediaDevices.enumerateDevices()
    const monitorSources = this.findLinuxMonitorSources(devices)

    if (isPhysicalDeviceId(deviceId)) {
      const selected = monitorSources.find((device) => device.deviceId === deviceId)
      if (selected) {
        return navigator.mediaDevices.getUserMedia({
          video: false,
          audio: {
            deviceId: { exact: selected.deviceId },
            channelCount: 1,
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
        })
      }
    }

    const fallback = monitorSources[0]
    if (!fallback) {
      throw new Error(
        'No monitor source found for speaker loopback. Ensure PulseAudio or PipeWire is running.',
      )
    }
    return navigator.mediaDevices.getUserMedia({
      video: false,
      audio: {
        deviceId: { exact: fallback.deviceId },
        channelCount: 1,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    })
  }

  /**
   * Finds monitor sources for actual capture: label first, then groupId
   * matching as a fallback for PipeWire systems where labels are generic.
   */
  private findLinuxMonitorSources(devices: MediaDeviceInfo[]): MediaDeviceInfo[] {
    const outputGroupIds = buildOutputGroupIds(devices)
    const labelMatches: MediaDeviceInfo[] = []
    const groupMatches: MediaDeviceInfo[] = []

    for (const device of devices) {
      if (device.kind !== 'audioinput' || !isPhysicalDeviceId(device.deviceId)) continue
      if (hasMonitorLabel(device.label) || /\.monitor$/i.test(device.deviceId)) {
        labelMatches.push(device)
      } else if (device.groupId && outputGroupIds.has(device.groupId)) {
        groupMatches.push(device)
      }
    }

    return labelMatches.length > 0 ? labelMatches : groupMatches
  }

  /** Attaches a stream to an AudioWorklet and a silent sink that keeps processing alive. */
  private async attachStream(
    source: AudioSource,
    stream: MediaStream,
    options: StartOptions,
  ): Promise<void> {
    const context = new AudioContext({ latencyHint: 'interactive' })
    let diagnosticTimer: ReturnType<typeof setInterval> | null = null
    try {
      const moduleUrl = URL.createObjectURL(
        new Blob([PCM_WORKLET_SOURCE], { type: 'text/javascript' }),
      )
      try {
        await context.audioWorklet.addModule(moduleUrl)
      } finally {
        URL.revokeObjectURL(moduleUrl)
      }
      const sourceNode = context.createMediaStreamSource(stream)
      const workletNode = new AudioWorkletNode(context, 'transcript-pcm-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        processorOptions: { targetRate: 16_000, chunkSize: PCM_CHUNK_SAMPLES },
      })
      const sinkNode = context.createGain()
      sinkNode.gain.value = 0
      let pcmFrames = 0
      let pcmBytes = 0
      let peakLevel = 0
      workletNode.port.onmessage = (
        event: MessageEvent<{ type: string; buffer?: ArrayBuffer; value?: number }>,
      ) => {
        if (event.data.type === 'pcm' && event.data.buffer) {
          pcmFrames += 1
          pcmBytes += event.data.buffer.byteLength
          options.onFrame(source, event.data.buffer)
        }
        if (event.data.type === 'level') {
          const level = event.data.value ?? 0
          peakLevel = Math.max(peakLevel, level)
          options.onLevel(source, level)
        }
      }
      sourceNode.connect(workletNode)
      workletNode.connect(sinkNode)
      sinkNode.connect(context.destination)
      const audioTrack = stream.getAudioTracks()[0]
      const trackSettings = audioTrack?.getSettings()
      options.onDiagnostic?.('Audio source attached.', {
        source,
        label: audioTrack?.label ?? 'Unknown audio endpoint',
        sampleRate: trackSettings?.sampleRate ?? context.sampleRate,
        channelCount: trackSettings?.channelCount ?? 0,
        contextSampleRate: context.sampleRate,
      })
      diagnosticTimer = setInterval(() => {
        options.onDiagnostic?.('Audio capture health.', {
          source,
          pcmFrames,
          pcmBytes,
          peakLevel: Number(peakLevel.toFixed(4)),
        })
        pcmFrames = 0
        pcmBytes = 0
        peakLevel = 0
      }, 5_000)
      if (context.state === 'suspended') await context.resume()
      this.bindings.set(source, {
        stream,
        context,
        sourceNode,
        workletNode,
        sinkNode,
        diagnosticTimer,
      })
    } catch (error) {
      if (diagnosticTimer) clearInterval(diagnosticTimer)
      this.stopStreamTracks(stream)
      await context.close().catch(() => undefined)
      throw error
    }
  }

  /** Releases one complete audio graph and optionally flushes its final PCM packet. */
  private async releaseBinding(binding: CaptureBinding, flush: boolean): Promise<void> {
    clearInterval(binding.diagnosticTimer)
    this.stopStreamTracks(binding.stream)
    try {
      if (flush) await this.flushWorklet(binding.workletNode)
    } finally {
      binding.workletNode.port.onmessage = null
      binding.sourceNode.disconnect()
      binding.workletNode.disconnect()
      binding.sinkNode.disconnect()
      await binding.context.close()
    }
  }

  /** Stops every track belonging to one captured media stream. */
  private stopStreamTracks(stream: MediaStream): void {
    stream.getTracks().forEach((track) => {
      track.stop()
    })
  }

  /** Flushes the final partial PCM packet before an audio graph is released. */
  private async flushWorklet(workletNode: AudioWorkletNode): Promise<void> {
    await new Promise<void>((resolve) => {
      let settled = false
      const finish = (): void => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        workletNode.port.removeEventListener('message', onMessage)
        resolve()
      }
      const onMessage = (event: MessageEvent<{ type?: string }>): void => {
        if (event.data.type === 'flushed') finish()
      }
      const timeout = setTimeout(finish, WORKLET_FLUSH_TIMEOUT_MS)
      workletNode.port.addEventListener('message', onMessage)
      workletNode.port.postMessage({ type: 'flush' })
    })
  }
}

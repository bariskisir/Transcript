/**
 * Verifies the isolated worklet's channel downmix and final partial-packet flush behavior.
 */

import vm from 'node:vm'
import { describe, expect, it } from 'vitest'
import { PCM_WORKLET_SOURCE } from '../src/shared/pcmWorkletSource'

interface WorkletMessage {
  type: string
  buffer?: ArrayBuffer
}

interface TestProcessor {
  port: {
    onmessage: ((event: { data: { type: string } }) => void) | null
    messages: WorkletMessage[]
  }
  process(inputs: Float32Array[][]): boolean
}

/** Creates a processor instance inside a minimal AudioWorklet-like VM context. */
const createProcessor = (chunkSize: number): TestProcessor => {
  let Processor: (new (options: Record<string, unknown>) => TestProcessor) | undefined
  class TestAudioWorkletProcessor {
    public readonly port = {
      onmessage: null as ((event: { data: { type: string } }) => void) | null,
      messages: [] as WorkletMessage[],
      postMessage: (message: WorkletMessage): void => {
        this.port.messages.push(message)
      },
    }
  }
  vm.runInNewContext(PCM_WORKLET_SOURCE, {
    AudioWorkletProcessor: TestAudioWorkletProcessor,
    Float32Array,
    Int16Array,
    Math,
    sampleRate: 16_000,
    registerProcessor: (
      _name: string,
      processorConstructor: new (options: Record<string, unknown>) => TestProcessor,
    ): void => {
      Processor = processorConstructor
    },
  })
  if (!Processor) throw new Error('The PCM worklet did not register its processor.')
  return new Processor({ processorOptions: { targetRate: 16_000, chunkSize } })
}

describe('Transcript PCM worklet', () => {
  it('averages every input channel instead of reading only the left channel', () => {
    const processor = createProcessor(4)
    processor.process([[new Float32Array([1, 1, 1, 1]), new Float32Array([-1, -1, -1, -1])]])

    const pcmMessage = processor.port.messages.find((message) => message.type === 'pcm')
    if (!pcmMessage?.buffer) throw new Error('The worklet did not emit a PCM packet.')
    expect([...new Int16Array(pcmMessage.buffer)]).toEqual([0, 0, 0, 0])
  })

  it('emits a partial PCM packet before confirming a stop flush', () => {
    const processor = createProcessor(8)
    processor.process([[new Float32Array([0.5, -0.5])]])
    processor.port.onmessage?.({ data: { type: 'flush' } })

    expect(processor.port.messages.map((message) => message.type)).toEqual(['pcm', 'flushed'])
    const packet = processor.port.messages[0]?.buffer
    if (!packet) throw new Error('The worklet did not flush its partial PCM packet.')
    expect(new Int16Array(packet).length).toBe(2)
  })
})

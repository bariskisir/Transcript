/**
 * Hosts the JavaScript source executed by Node's worker_threads local inference worker.
 */

/**
 * Creates the isolated worker program used to download, load, and run Whisper ONNX models.
 * Keeping the worker program here avoids a second build entry while all maintained source remains TypeScript.
 */
export const createLocalInferenceWorkerSource = (): string => `
const { parentPort } = require('node:worker_threads')

if (!parentPort) throw new Error('Local inference worker requires a parent port.')

let transcriber = null
let languageOptionsEnabled = true

const postError = (requestId, error) => {
  parentPort.postMessage({
    kind: 'error',
    requestId,
    message: error instanceof Error ? error.message : String(error),
  })
}

const load = async (message) => {
  const transformers = require('@huggingface/transformers')
  transformers.env.allowLocalModels = true
  transformers.env.allowRemoteModels = !message.localFilesOnly
  const progress_callback = (progress) => {
    if (progress.status !== 'progress_total') return
    parentPort.postMessage({
      kind: 'progress',
      requestId: message.requestId,
      loaded: progress.loaded,
      total: progress.total,
      percentage: progress.progress,
    })
  }
  transcriber = await transformers.pipeline(
    'automatic-speech-recognition',
    message.modelSource,
    {
      cache_dir: message.cacheDirectory,
      local_files_only: message.localFilesOnly,
      dtype: 'q8',
      progress_callback,
    },
  )
  languageOptionsEnabled = message.languageOptionsEnabled !== false
  parentPort.postMessage({ kind: 'loaded', requestId: message.requestId })
}

const transcribe = async (message) => {
  if (!transcriber) throw new Error('No local transcription model is loaded.')
  const pcm = new Int16Array(message.pcm)
  const audio = new Float32Array(pcm.length)
  for (let index = 0; index < pcm.length; index += 1) {
    audio[index] = pcm[index] / 32768
  }
  const options = {
    chunk_length_s: 20,
    stride_length_s: 3,
    ...(languageOptionsEnabled
      ? {
          task: 'transcribe',
          ...(message.language === 'auto' ? {} : { language: message.language }),
        }
      : {}),
  }
  const output = await transcriber(audio, options)
  const text = Array.isArray(output)
    ? output.map((item) => item && typeof item.text === 'string' ? item.text : '').join(' ')
    : output && typeof output.text === 'string' ? output.text : ''
  parentPort.postMessage({ kind: 'result', requestId: message.requestId, text: text.trim() })
}

const dispose = async (requestId) => {
  if (transcriber && typeof transcriber.dispose === 'function') await transcriber.dispose()
  transcriber = null
  parentPort.postMessage({ kind: 'disposed', requestId })
}

parentPort.on('message', (message) => {
  const run = message.kind === 'load'
    ? load(message)
    : message.kind === 'transcribe'
      ? transcribe(message)
      : message.kind === 'dispose'
        ? dispose(message.requestId)
        : Promise.reject(new Error('Unknown local inference worker command.'))
  void run.catch((error) => postError(message.requestId, error))
})
`

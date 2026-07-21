/**
 * Verifies that logger configuration changes are applied and recorded only when necessary.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const loggerMocks = vi.hoisted(() => {
  /** Creates the electron-log surface used by LoggerService. */
  const createLogger = () => ({
    transports: {
      file: {
        level: 'info' as string | false,
        maxSize: 0,
        format: '',
        resolvePathFn: (): string => '',
      },
      console: { level: 'info' as string | false, format: '' },
    },
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    verbose: vi.fn(),
  })

  return {
    app: createLogger(),
    errors: createLogger(),
  }
})

vi.mock('electron-log/main', () => ({
  default: {
    /** Returns the matching fake transport for each named application logger. */
    create: vi.fn(({ logId }: { logId: string }) =>
      logId === 'transcript-app' ? loggerMocks.app : loggerMocks.errors,
    ),
  },
}))

vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn(async () => undefined),
  readdir: vi.fn(async () => []),
  unlink: vi.fn(async () => undefined),
}))

import LoggerService from '@main/services/LoggerService'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('LoggerService', () => {
  it('does not reconfigure or log when the selected level has not changed', () => {
    const logger = new LoggerService('C:\\Transcript\\Logs', 'info')

    expect(loggerMocks.app.info).toHaveBeenCalledTimes(1)
    logger.setLevel('info')
    logger.setLevel('info')
    expect(loggerMocks.app.info).toHaveBeenCalledTimes(1)

    logger.setLevel('debug')
    expect(loggerMocks.app.transports.file.level).toBe('debug')
    expect(loggerMocks.app.info).toHaveBeenCalledTimes(2)

    logger.setLevel('debug')
    expect(loggerMocks.app.info).toHaveBeenCalledTimes(2)
  })
})

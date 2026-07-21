/**
 * Verifies Deepgram credential validation and optional balance aggregation.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import DeepgramAccountService from '../src/main/services/DeepgramAccountService'

const accountService = new DeepgramAccountService()

afterEach(() => {
  vi.restoreAllMocks()
})

describe('DeepgramAccountService', () => {
  it('aggregates supported project balances by billing unit', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ projects: [{ project_id: 'project-a' }] }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            balances: [
              { amount: 10.25, units: 'USD' },
              { amount: 2.5, units: 'usd' },
            ],
          }),
          { status: 200 },
        ),
      )

    await expect(accountService.verifyAndGetBalance('valid-api-key')).resolves.toEqual([
      { amount: 12.75, units: 'USD' },
    ])
  })

  it('hides balance data when the project endpoint does not support it', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ projects: [{ project_id: 'project-a' }] }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 403 }))

    await expect(accountService.verifyAndGetBalance('valid-api-key')).resolves.toEqual([])
  })

  it('rejects a credential that cannot list its projects', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(null, { status: 401 }))

    await expect(accountService.verifyAndGetBalance('invalid-api-key')).rejects.toThrow(
      'Deepgram rejected the API key.',
    )
  })
})

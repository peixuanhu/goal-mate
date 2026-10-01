import { webcrypto } from 'node:crypto'
import { afterEach, expect, it, vi } from 'vitest'
import { createClientRequestId } from './client-request-id'

afterEach(() => vi.unstubAllGlobals())

it('uses the native UUID generator when available', () => {
  const randomUUID = vi.fn(() => '6b41b5ea-0f66-4a64-a72a-4cb2f39fcfc3')
  vi.stubGlobal('crypto', { randomUUID })
  expect(createClientRequestId()).toBe('6b41b5ea-0f66-4a64-a72a-4cb2f39fcfc3')
  expect(randomUUID).toHaveBeenCalledOnce()
})

it('generates distinct valid v4 UUIDs with random bytes on HTTP', () => {
  vi.stubGlobal('crypto', { getRandomValues: webcrypto.getRandomValues.bind(webcrypto) })
  const ids = Array.from({ length: 100 }, () => createClientRequestId())
  for (const id of ids) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  expect(new Set(ids).size).toBe(100)
})

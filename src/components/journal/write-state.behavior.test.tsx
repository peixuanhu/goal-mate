// @vitest-environment jsdom
import { act, renderHook, cleanup } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { useWriteState } from './editor-shared'

afterEach(cleanup)

it('gives separate successful saves separate identities even with identical content', async () => {
  const { result } = renderHook(() => useWriteState())
  const payload = { plan_id: 'p', content: '每日阅读' }
  const ids: string[] = []
  for (let index = 0; index < 2; index++) {
    await act(async () => result.current.write(async () => { ids.push(result.current.identity(payload)) }))
  }
  expect(ids[1]).not.toBe(ids[0])
})

it('keeps the identity and error feedback across a failed save and its retry', async () => {
  const { result } = renderHook(() => useWriteState())
  const payload = { plan_id: 'p', content: '每日阅读' }
  let first = ''
  await act(async () => result.current.write(async () => { first = result.current.identity(payload); throw new Error('offline') }))
  expect(result.current.error).toContain('offline')
  await act(async () => result.current.write(async () => { expect(result.current.identity(payload)).toBe(first) }))
  expect(result.current.error).toBeNull()
})

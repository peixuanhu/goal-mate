// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useJournalMonth } from './use-journal-month'
import { journalRequest } from '@/lib/journal/client'
import type { JournalMonthView } from '@/lib/journal/types'
vi.mock('@/lib/journal/client', () => ({ journalRequest: vi.fn() }))
afterEach(() => { cleanup(); vi.clearAllMocks() })
const view = (month: string): JournalMonthView => ({ month, timezone: 'Asia/Shanghai', today: '2026-09-27', dates: [], trackers: [], measurements: [], cells: {}, events: [], lanes: [], summaries: [] })
it('ignores an old month response even if fetch ignores abort', async () => {
  let september!: (value: JournalMonthView) => void, october!: (value: JournalMonthView) => void
  vi.mocked(journalRequest).mockImplementationOnce(() => new Promise(resolve => { september = resolve })).mockImplementationOnce(() => new Promise(resolve => { october = resolve }))
  const hook = renderHook(({ month }) => useJournalMonth(month), { initialProps: { month: '2026-09' } })
  hook.rerender({ month: '2026-10' })
  await act(async () => { october(view('2026-10')) }); await act(async () => { september(view('2026-09')) })
  expect(hook.result.current.data?.month).toBe('2026-10')
})
it('refreshes on focus and shared changes and keeps a failed refresh visible', async () => {
  vi.mocked(journalRequest).mockResolvedValue(view('2026-09'))
  const hook = renderHook(() => useJournalMonth('2026-09'))
  await waitFor(() => expect(hook.result.current.loading).toBe(false))
  await act(async () => { window.dispatchEvent(new Event('focus')) })
  expect(journalRequest).toHaveBeenCalledTimes(2)
  vi.mocked(journalRequest).mockRejectedValueOnce(new Error('offline'))
  await act(async () => { window.dispatchEvent(new Event('goal-mate:data-changed')) })
  await waitFor(() => expect(hook.result.current.error).toBe('offline'))
  expect(hook.result.current.data?.month).toBe('2026-09')
})
it('hides a previous month as soon as a different month is selected', async () => {
  vi.mocked(journalRequest).mockResolvedValueOnce(view('2026-09')).mockImplementationOnce(() => new Promise(() => {}))
  const hook = renderHook(({ month }) => useJournalMonth(month), { initialProps: { month: '2026-09' } })
  await waitFor(() => expect(hook.result.current.data).not.toBeNull())
  hook.rerender({ month: '2026-10' }); expect(hook.result.current.data).toBeNull()
})

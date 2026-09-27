// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { journalRequest } from '@/lib/journal/client'
import { CellEditor } from './cell-editor'
import { TrackerEditor } from './tracker-editor'
import { EventEditor } from './event-editor'
import { DayDetail } from './day-detail'
import { monthFixture, trackerFixture } from './test-fixtures'
vi.mock('@/lib/journal/client', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/journal/client')>(), journalRequest: vi.fn(), notifyJournalChanged: vi.fn() }))
beforeEach(() => vi.mocked(journalRequest).mockImplementation(async (url, init) => {
  if (!init?.method || init.method === 'GET') return { list: [] }
  throw new Error('offline')
}))
afterEach(() => { cleanup(); vi.resetAllMocks() })
it('keeps zero after a failed save and reuses the request id for a retry', async () => {
  const tracker = trackerFixture('t', 'quantity'), cell = monthFixture('2026-09', [tracker]).cells['2026-09-12'].t
  render(<CellEditor tracker={tracker} cell={cell} date={cell.date} timezone="Asia/Shanghai" today="2026-09-27" onClose={vi.fn()} onSaved={vi.fn()} />)
  fireEvent.change(screen.getByLabelText('播放量'), { target: { value: '0' } }); fireEvent.click(screen.getByRole('button', { name: '保存' }))
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('保存失败'))
  expect((screen.getByLabelText('播放量') as HTMLInputElement).value).toBe('0')
  fireEvent.click(screen.getByRole('button', { name: '保存' })); await waitFor(() => expect(journalRequest).toHaveBeenCalledTimes(2))
  const first = JSON.parse(String(vi.mocked(journalRequest).mock.calls[0][1]?.body)), retry = JSON.parse(String(vi.mocked(journalRequest).mock.calls[1][1]?.body))
  expect(first.value).toBe('0'); expect(first.expected_version).toBe(0); expect(retry.request_id).toBe(first.request_id)
  await waitFor(() => expect(screen.getByRole('button', { name: '保存' }).hasAttribute('disabled')).toBe(false))
  fireEvent.change(screen.getByLabelText('播放量'), { target: { value: '1' } }); fireEvent.click(screen.getByRole('button', { name: '保存' }))
  await waitFor(() => expect(journalRequest).toHaveBeenCalledTimes(3))
  expect(JSON.parse(String(vi.mocked(journalRequest).mock.calls[2][1]?.body)).request_id).not.toBe(first.request_id)
})
it('submits stable enum IDs and a complete new tracker configuration', async () => {
  render(<TrackerEditor tracker={null} today="2026-09-27" onClose={vi.fn()} onSaved={vi.fn()} />)
  fireEvent.change(screen.getByLabelText('列名称'), { target: { value: '心情' } }); fireEvent.change(screen.getByLabelText('类型'), { target: { value: 'enum' } })
  fireEvent.click(screen.getByRole('button', { name: '创建列' }))
  await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
  const call = vi.mocked(journalRequest).mock.calls.find(([, init]) => init?.method === 'POST')!
  const body = JSON.parse(String(call[1]?.body)); expect(body.kind).toBe('enum'); expect(body.config.source).toBe('manual'); expect(body.config.enum_options[0].id).toBe('happy')
})
it('submits a cross-month planned event with explicit completion choice', async () => {
  render(<EventEditor date="2026-09-28" event={null} today="2026-09-27" onClose={vi.fn()} onSaved={vi.fn()} />)
  fireEvent.change(screen.getByLabelText('事件标题'), { target: { value: '旅行' } }); fireEvent.change(screen.getByLabelText('结束日期'), { target: { value: '2026-10-03' } })
  fireEvent.click(screen.getByRole('button', { name: '保存事件' })); await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
  const call = vi.mocked(journalRequest).mock.calls.find(([, init]) => init?.method === 'POST')!
  expect(JSON.parse(String(call[1]?.body))).toMatchObject({ start_date: '2026-09-28', end_date: '2026-10-03', status: 'planned', sync_completion: false })
})
it('allows editing a retained event after its linked plan was deleted', async () => {
  const event = { event_id: 'e', title: '发布视频', start_date: '2026-09-12', end_date: '2026-09-12', note: '', status: 'completed' as const, source: 'custom' as const,
    plan_id: null, goal_id: null, progress_record_id: null, version: 2, sync_completion: true }
  render(<EventEditor date="2026-09-12" event={event} today="2026-09-27" onClose={vi.fn()} onSaved={vi.fn()} />)
  expect((screen.getByLabelText('同步计划完成') as HTMLInputElement).checked).toBe(false)
  fireEvent.change(screen.getByLabelText('事件标题'), { target: { value: '保留的事件' } }); fireEvent.click(screen.getByRole('button', { name: '保存事件' }))
  await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
  const call = vi.mocked(journalRequest).mock.calls.find(([, init]) => init?.method === 'PUT')!
  expect(JSON.parse(String(call[1]?.body))).toMatchObject({ sync_completion: false, title: '保留的事件' })
})
it('includes all daily events and raw values whose source was deleted', () => {
  const view = monthFixture()
  view.events = Array.from({ length: 150 }, (_, index) => ({ event_id: `p-${index}`, title: `记录 ${index}`, start_date: '2026-09-12', end_date: '2026-09-12', note: '', source: 'progress' as const, status: 'progress' as const, plan_id: null, goal_id: null, progress_record_id: index + 1, version: 1, sync_completion: false }))
  view.measurements = [{ measurement_id: 'm', tracker_id: 't', revision_id: 't-r', local_date: '2026-09-12', value: false, status: 'recorded', origin: 'progress_field', note: '保留值', version: 1, recorded_at: '2026-09-12T04:00:00Z', source_record_id: 12, progress_record_id: null, source_deleted: true }]
  render(<DayDetail date="2026-09-12" view={view} onCell={vi.fn()} onEvent={vi.fn()} onClose={vi.fn()} />)
  expect(screen.getByText('记录 149')).toBeTruthy(); expect(screen.getByText(/来源已删除/)).toBeTruthy(); expect(screen.getByText('保留值')).toBeTruthy()
})

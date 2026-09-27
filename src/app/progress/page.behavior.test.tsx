// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import ProgressPage from './page'
import { journalRequest, JournalRequestError, notifyJournalChanged } from '@/lib/journal/client'
import { trackerFixture } from '@/components/journal/test-fixtures'
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams('plan_id=p&record_id=200') }))
vi.mock('@/components/AuthGuard', () => ({ default: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
vi.mock('@/components/main-layout', () => ({ MainLayout: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
vi.mock('@/components/ui/wysiwyg-editor', () => ({ WysiwygEditor: ({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) => <label>{label}<textarea aria-label={label} value={value} onChange={event => onChange(event.target.value)} /></label> }))
vi.mock('@/components/ui/slider', () => ({ Slider: ({ value, onValueChange }: { value: number[]; onValueChange: (value: number[]) => void }) => <input aria-label="计划百分比" value={value[0]} onChange={event => onValueChange([Number(event.target.value)])} /> }))
vi.mock('@/lib/journal/client', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/journal/client')>(), journalRequest: vi.fn(), notifyJournalChanged: vi.fn() }))
const tracker = trackerFixture('t', 'quantity')
tracker.revisions[0].plan_id = 'p'; tracker.revisions[0].config.source = 'progress_field'
beforeEach(() => {
  vi.mocked(journalRequest).mockImplementation(async (url, init) => {
    if (init?.method === 'PUT') return { id: 200 }
    if (url.startsWith('/api/plan')) return { list: [{ plan_id: 'p', name: '自媒体', progress: .2, is_recurring: false }] }
    if (url === '/api/journal/trackers') return { list: [tracker], today: '2026-09-27', timezone: 'Asia/Shanghai' }
    if (url === '/api/progress_record?id=200') return { id: 200, plan_id: 'p', content: '原内容', thinking: '', gmt_create: '2026-09-12T12:00:00Z', outcome: null, counts_toward_recurrence: true, schedule_block_id: null, version: 4, metrics: [] }
    return { list: [], total: 0 }
  })
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ list: [], total: 0 }))))
})
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals() })
it('opens a source outside the first 100 list records with its version and preference timezone', async () => {
  render(<ProgressPage />)
  await waitFor(() => expect((screen.getByLabelText('进展内容') as HTMLTextAreaElement).value).toBe('原内容'))
  expect(journalRequest).toHaveBeenCalledWith('/api/progress_record?id=200', expect.anything())
  expect((screen.getByLabelText(/记录时间/) as HTMLInputElement).value).toBe('2026-09-12T20:00')
})
it('saves zero and an explicit percentage in the same progress transaction', async () => {
  render(<ProgressPage />)
  await waitFor(() => expect(screen.getByLabelText('播放量')).toBeTruthy())
  await waitFor(() => expect((screen.getByLabelText('进展内容') as HTMLTextAreaElement).value).toBe('原内容'))
  fireEvent.change(screen.getByLabelText('播放量'), { target: { value: '0' } }); fireEvent.change(screen.getByLabelText('计划百分比'), { target: { value: '.5' } })
  fireEvent.click(screen.getByRole('button', { name: '更新进展' }))
  await waitFor(() => expect(notifyJournalChanged).toHaveBeenCalled())
  const call = vi.mocked(journalRequest).mock.calls.find(([, init]) => init?.method === 'PUT')!
  expect(JSON.parse(String(call[1]?.body))).toMatchObject({ id: 200, expected_version: 4, plan_progress: .5, metrics: [{ tracker_id: 't', revision_id: 't-r', value: '0', status: 'recorded', note: '' }] })
  expect(vi.mocked(journalRequest).mock.calls.filter(([url, init]) => url.startsWith('/api/plan') && init?.method === 'PUT')).toHaveLength(0)
})
it('retains unsaved input on a failed write', async () => {
  const initial = vi.mocked(journalRequest).getMockImplementation()!
  vi.mocked(journalRequest).mockImplementation((url, init) => init?.method === 'PUT' ? Promise.reject(new Error('offline')) : initial(url, init))
  render(<ProgressPage />)
  await waitFor(() => expect((screen.getByLabelText('进展内容') as HTMLTextAreaElement).value).toBe('原内容'))
  fireEvent.change(screen.getByLabelText('进展内容'), { target: { value: '保留输入' } }); fireEvent.click(screen.getByRole('button', { name: '更新进展' }))
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('保存失败'))
  expect((screen.getByLabelText('进展内容') as HTMLTextAreaElement).value).toBe('保留输入'); expect(notifyJournalChanged).not.toHaveBeenCalled()
})
it('preserves the original occurrence timestamp when editing only text', async () => {
  render(<ProgressPage />)
  await waitFor(() => expect((screen.getByLabelText('进展内容') as HTMLTextAreaElement).value).toBe('原内容'))
  fireEvent.change(screen.getByLabelText('进展内容'), { target: { value: '编辑文字' } }); fireEvent.click(screen.getByRole('button', { name: '更新进展' }))
  await waitFor(() => expect(notifyJournalChanged).toHaveBeenCalled())
  const call = vi.mocked(journalRequest).mock.calls.find(([, init]) => init?.method === 'PUT')!
  expect(JSON.parse(String(call[1]?.body))).not.toHaveProperty('custom_time')
})
it('merges the latest untouched metric after a version conflict while retaining local edits', async () => {
  const other = trackerFixture('b', 'quantity'); other.name = '点赞'; other.revisions[0].plan_id = 'p'; other.revisions[0].config.source = 'progress_field'
  const initial = vi.mocked(journalRequest).getMockImplementation()!
  let reads = 0, writes = 0
  vi.mocked(journalRequest).mockImplementation(async (url, init) => {
    if (url === '/api/journal/trackers') return { list: [tracker, other], today: '2026-09-27', timezone: 'Asia/Shanghai' }
    if (url === '/api/progress_record?id=200') return { ...await initial(url, init) as object, version: ++reads === 1 ? 4 : 5,
      metrics: [{ tracker_id: 't', revision_id: 't-r', value: '1', status: 'recorded', note: '' }, { tracker_id: 'b', revision_id: 'b-r', value: reads === 1 ? '2' : '20', status: 'recorded', note: '' }] }
    if (init?.method === 'PUT' && ++writes === 1) throw new JournalRequestError(409, 'STALE_VERSION', '记录已变化')
    return initial(url, init)
  })
  render(<ProgressPage />)
  await waitFor(() => expect((screen.getByLabelText('播放量') as HTMLInputElement).value).toBe('1'))
  fireEvent.change(screen.getByLabelText('播放量'), { target: { value: '10' } }); fireEvent.click(screen.getByRole('button', { name: '更新进展' }))
  await screen.findByRole('button', { name: '读取最新数据' }); fireEvent.click(screen.getByRole('button', { name: '读取最新数据' }))
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('已读取最新版本'))
  expect((screen.getByLabelText('播放量') as HTMLInputElement).value).toBe('10'); expect((screen.getByLabelText('点赞') as HTMLInputElement).value).toBe('20')
  fireEvent.click(screen.getByRole('button', { name: '更新进展' })); await waitFor(() => expect(notifyJournalChanged).toHaveBeenCalled())
  const calls = vi.mocked(journalRequest).mock.calls.filter(([, init]) => init?.method === 'PUT')
  const body = JSON.parse(String(calls.at(-1)![1]?.body)); expect(body.expected_version).toBe(5)
  expect(body.metrics).toEqual(expect.arrayContaining([expect.objectContaining({ tracker_id: 't', value: '10' }), expect.objectContaining({ tracker_id: 'b', value: '20' })]))
})

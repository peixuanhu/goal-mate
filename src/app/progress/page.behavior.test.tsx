// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import ProgressPage from './page'
import { journalRequest, JournalRequestError, notifyJournalChanged } from '@/lib/journal/client'
import { trackerFixture } from '@/components/journal/test-fixtures'
let searchParams = 'plan_id=p&record_id=200'
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(searchParams) }))
vi.mock('@/components/AuthGuard', () => ({ default: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
vi.mock('@/components/main-layout', () => ({ MainLayout: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
vi.mock('@/components/ui/wysiwyg-editor', () => ({ WysiwygEditor: ({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) => <label>{label}<textarea aria-label={label} value={value} onChange={event => onChange(event.target.value)} /></label> }))
vi.mock('@/components/ui/slider', () => ({ Slider: ({ value, onValueChange }: { value: number[]; onValueChange: (value: number[]) => void }) => <input aria-label="计划百分比" value={value[0]} onChange={event => onValueChange([Number(event.target.value)])} /> }))
vi.mock('@/components/ui/text-preview', () => ({ TextPreview: ({ text }: { text: string }) => <span>{text}</span> }))
vi.mock('@/lib/journal/client', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/journal/client')>(), journalRequest: vi.fn(), notifyJournalChanged: vi.fn() }))
const tracker = trackerFixture('t', 'quantity')
tracker.revisions[0].plan_id = 'p'; tracker.revisions[0].config.source = 'progress_field'
beforeEach(() => {
  searchParams = 'plan_id=p&record_id=200'
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
it.each([false, true])('adds progress and refreshes the list without randomUUID: %s', async withoutRandomUUID => {
  searchParams = 'plan_id=p'
  if (withoutRandomUUID) vi.stubGlobal('crypto', { getRandomValues: crypto.getRandomValues.bind(crypto) })
  let saved = false
  const initial = vi.mocked(journalRequest).getMockImplementation()!
  vi.mocked(journalRequest).mockImplementation(async (url, init) => {
    if (init?.method === 'POST') { saved = true; return { id: 201 } }
    if (url.startsWith('/api/progress_record')) return { list: saved ? [{ id: 201, plan_id: 'p', content: '新增进展测试', thinking: '', gmt_create: '2026-09-27T12:00:00Z', version: 1 }] : [], total: saved ? 1 : 0 }
    return initial(url, init)
  })
  vi.mocked(notifyJournalChanged).mockImplementation(detail => {
    window.dispatchEvent(new CustomEvent('goal-mate:data-changed', { detail }))
  })
  render(<ProgressPage />)
  await waitFor(() => expect((screen.getByRole('button', { name: '添加进展' }) as HTMLButtonElement).disabled).toBe(false))
  fireEvent.change(screen.getByLabelText('进展内容'), { target: { value: '新增进展测试' } })
  fireEvent.click(screen.getByRole('button', { name: '添加进展' }))
  await waitFor(() => expect(vi.mocked(journalRequest).mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1))
  const call = vi.mocked(journalRequest).mock.calls.find(([, init]) => init?.method === 'POST')!
  expect(JSON.parse(String(call[1]?.body))).toMatchObject({ plan_id: 'p', content: '新增进展测试', request_id: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i) })
  await waitFor(() => expect((screen.getByLabelText('进展内容') as HTMLTextAreaElement).value).toBe(''))
  await screen.findByText('新增进展测试')
})
it.each([0, 1])('keeps plan selector %s limited to existing plans', async index => {
  render(<ProgressPage />)
  await waitFor(() => expect((screen.getByLabelText('进展内容') as HTMLTextAreaElement).value).toBe('原内容'))
  fireEvent.click(screen.getAllByRole('button', { name: '自媒体' })[index])
  const search = screen.getByPlaceholderText(index === 0 ? '请选择计划' : '请选择所属计划')
  fireEvent.change(search, { target: { value: '财务报表' } })
  expect(screen.queryByText(/新建标签/)).toBeNull()
  expect(screen.getByText('没有匹配的计划')).toBeTruthy()
  fireEvent.keyDown(search, { key: 'Enter' })
  expect(screen.getAllByRole('button', { name: '自媒体' })).toHaveLength(2)
  expect(vi.mocked(journalRequest).mock.calls.filter(([, init]) => init?.method === 'PUT')).toHaveLength(0)
})
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

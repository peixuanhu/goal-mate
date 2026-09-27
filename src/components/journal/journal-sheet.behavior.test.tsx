// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { JournalCell } from './journal-cell'
import { JournalSheet } from './journal-sheet'
import { monthFixture, trackerFixture } from './test-fixtures'
afterEach(cleanup)
it('distinguishes a recorded false and a numeric zero from missing', () => {
  const view = monthFixture(), cell = view.cells['2026-09-12'].t, open = vi.fn(), tracker = view.trackers[0]
  render(<JournalCell name="运动" kind="boolean" color={tracker.color} config={tracker.revisions[0].config} cell={{ ...cell, state: 'recorded', value: false }} onOpen={open} />)
  fireEvent.click(screen.getByRole('button', { name: '2026-09-12 运动：未完成' })); expect(open).toHaveBeenCalledOnce(); expect(screen.getByText('×')).toBeTruthy()
  cleanup()
  const numeric = trackerFixture('q', 'quantity')
  render(<JournalCell name="播放量" kind="quantity" color={numeric.color} config={numeric.revisions[0].config} cell={{ ...cell, state: 'recorded', value: '0' }} onOpen={open} />)
  expect(screen.getByRole('button', { name: '2026-09-12 播放量：0' })).toBeTruthy()
})
it('shows every date in a leap month and opens interval events', () => {
  const view = monthFixture('2028-02')
  const event = { event_id: 'e', title: '旅行', start_date: '2028-02-27', end_date: '2028-03-03', note: '', source: 'custom' as const, status: 'planned' as const, plan_id: null, goal_id: null, progress_record_id: null, version: 1, sync_completion: false }
  view.events = [event]; view.lanes = [{ ...event, clipped_start: '2028-02-27', clipped_end: '2028-02-29', continues_before: false, continues_after: true, lane: 0 }]
  const onEvent = vi.fn(), onDate = vi.fn()
  render(<JournalSheet view={view} group={null} onCell={vi.fn()} onTracker={vi.fn()} onDate={onDate} onEvent={onEvent} />)
  fireEvent.click(screen.getByRole('button', { name: '2028-02-29 当天详情' })); expect(onDate).toHaveBeenCalledWith('2028-02-29')
  fireEvent.click(screen.getByRole('button', { name: /旅行.*延续到下月/ })); expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ event_id: 'e' }))
})
it('lets a small screen reach columns beyond the first three', () => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
  const view = monthFixture('2026-09', ['a', 'b', 'c', 'd'].map(id => ({ ...trackerFixture(id), name: `列 ${id}` })))
  render(<JournalSheet view={view} group={null} onCell={vi.fn()} onTracker={vi.fn()} onDate={vi.fn()} onEvent={vi.fn()} />)
  expect(screen.queryByRole('button', { name: '设置 列 d' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '下一组列' })); expect(screen.getByRole('button', { name: '设置 列 d' })).toBeTruthy()
  vi.unstubAllGlobals()
})
it('shows a snapshot line only when that encoding was chosen', () => {
  const tracker = trackerFixture('t', 'snapshot'); tracker.revisions[0].config.encoding = 'number'
  const view = monthFixture('2026-09', [tracker]); view.cells['2026-09-12'].t = { ...view.cells['2026-09-12'].t, state: 'recorded', value: '100' }
  const { container } = render(<JournalSheet view={view} group={null} onCell={vi.fn()} onTracker={vi.fn()} onDate={vi.fn()} onEvent={vi.fn()} />)
  expect(container.querySelectorAll('svg').length).toBe(0)
})

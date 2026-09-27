// @vitest-environment jsdom
import React from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { MonthlyJournal } from './monthly-journal'
import { monthFixture } from './test-fixtures'
const replace = vi.hoisted(() => vi.fn())
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams('month=2026-09'), useRouter: () => ({ replace }) }))
vi.mock('./use-journal-month', () => ({ useJournalMonth: (month: string) => ({ data: monthFixture(month || '2026-09'), loading: false, error: null, reload: vi.fn() }) }))
vi.mock('@/lib/journal/client', () => ({ journalRequest: vi.fn(async () => ({ list: [] })), notifyJournalChanged: vi.fn() }))
afterEach(() => { cleanup(); vi.clearAllMocks() })
it('moves the displayed month and URL together', () => {
  render(<MonthlyJournal />)
  fireEvent.click(screen.getByRole('button', { name: '下个月' }))
  expect(replace).toHaveBeenCalledWith('/journal?month=2026-10', { scroll: false })
  expect(screen.getByRole('button', { name: '2026-10-31 当天详情' })).toBeTruthy()
})
it('opens the column editor from the empty month action', async () => {
  render(<MonthlyJournal />); await act(async () => fireEvent.click(screen.getByRole('button', { name: '添加列' })))
  expect(screen.getByRole('dialog', { name: '添加追踪列' })).toBeTruthy()
})

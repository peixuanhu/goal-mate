// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ProgressMetricFields } from './progress-metric-fields'
import { trackerFixture } from './test-fixtures'
afterEach(cleanup)
const tracker = trackerFixture('t', 'quantity')
tracker.revisions[0].plan_id = 'p'; tracker.revisions[0].config.source = 'progress_field'
it('emits numeric zero without turning it into missing', () => {
  const change = vi.fn()
  render(<ProgressMetricFields trackers={[tracker]} planId="p" date="2026-09-12" value={[]} onChange={change} />)
  fireEvent.change(screen.getByLabelText('播放量'), { target: { value: '0' } })
  expect(change).toHaveBeenLastCalledWith([{ tracker_id: 't', revision_id: 't-r', value: '0', status: 'recorded', note: '' }])
})
it('filters fields by source, plan, date and applicability', () => {
  render(<ProgressMetricFields trackers={[tracker]} planId="other" date="2026-09-12" value={[]} onChange={vi.fn()} />)
  expect(screen.queryByLabelText('播放量')).toBeNull()
})
it('keeps other field values when explicitly clearing one', () => {
  const change = vi.fn(), other = { tracker_id: 'x', revision_id: 'x-r', value: '12', status: 'recorded' as const, note: '' }
  render(<ProgressMetricFields trackers={[tracker]} planId="p" date="2026-09-12" value={[other, { tracker_id: 't', revision_id: 't-r', value: '0', status: 'recorded', note: '' }]} onChange={change} />)
  fireEvent.change(screen.getByLabelText('播放量'), { target: { value: '' } })
  expect(change).toHaveBeenLastCalledWith([other, { tracker_id: 't', revision_id: 't-r', value: null, status: 'cleared', note: '' }])
})

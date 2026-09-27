import { zonedMinuteToUtc } from '@/lib/today/timezone'
import { JournalError } from './types'
import type { ProgressMetricInput, ProgressUpdateInput, ProgressWriteInput } from './types'
import { invalid, journalDate, journalText, journalUuid, journalVersion, strictObject } from './validation'

export function progressInput(raw: unknown, update: false): ProgressWriteInput
export function progressInput(raw: unknown, update: true): ProgressUpdateInput
export function progressInput(raw: unknown, update: boolean): ProgressWriteInput | ProgressUpdateInput {
  const input = strictObject(raw, ['id', 'plan_id', 'content', 'thinking', 'custom_time', 'outcome', 'metrics', 'plan_progress', 'request_id', 'expected_version',
    'plan_name', 'gmt_create', 'gmt_modified', 'version', 'progress_update', 'counts_toward_recurrence', 'schedule_block_id'])
  const value: ProgressUpdateInput = { id: 0 }
  if (update) {
    const id = Number(input.id)
    if (!Number.isSafeInteger(id) || id < 1) invalid('记录标识无效')
    value.id = id
    if (input.expected_version !== undefined) value.expected_version = journalVersion(input.expected_version)
  }
  if (input.plan_id !== undefined || !update) value.plan_id = journalText(input.plan_id, '计划标识', 100)
  if (input.content !== undefined || !update) value.content = journalText(input.content ?? '', '进展内容', 100000, true)
  if (input.thinking !== undefined || !update) value.thinking = journalText(input.thinking ?? '', '思考', 100000, true)
  if (input.custom_time) value.custom_time = journalText(input.custom_time, '发生时间', 40)
  if (input.outcome !== undefined) {
    if (input.outcome !== null && !['completed', 'partial', 'skipped'].includes(String(input.outcome))) invalid('完成状态无效')
    value.outcome = input.outcome as ProgressWriteInput['outcome']
  }
  if (input.request_id !== undefined) value.request_id = journalUuid(input.request_id)
  if (input.plan_progress !== undefined) {
    if (typeof input.plan_progress !== 'number' || !Number.isFinite(input.plan_progress) || input.plan_progress < 0 || input.plan_progress > 1) invalid('百分比进度必须为 0–1')
    value.plan_progress = input.plan_progress
  }
  if (input.metrics !== undefined) {
    if (!Array.isArray(input.metrics) || input.metrics.length > 1000) invalid('结构化字段列表无效')
    value.metrics = input.metrics.map(raw => {
      const metric = strictObject(raw, ['tracker_id', 'revision_id', 'value', 'status', 'note'])
      if (!['recorded', 'skipped', 'cleared'].includes(String(metric.status)) || (metric.status === 'recorded' ? typeof metric.value !== 'string' && typeof metric.value !== 'boolean' : metric.value !== null)) invalid('字段值与状态不一致')
      return { tracker_id: journalText(metric.tracker_id, '字段标识', 100), revision_id: journalText(metric.revision_id, '口径标识', 100),
        value: metric.value as ProgressMetricInput['value'], status: metric.status as ProgressMetricInput['status'], note: journalText(metric.note, '字段备注', 4000, true) }
    })
  }
  if (update) return value
  const { id: _id, ...created } = value
  return created as ProgressWriteInput
}

export function progressOccurrence(value: string | undefined, timezone: string, fallback: Date) {
  if (!value) return fallback
  const local = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(value)
  if (local) {
    journalDate(local[1])
    if (+local[2] > 23 || +local[3] > 59) invalid('发生时间无效')
    try { return zonedMinuteToUtc(local[1], +local[2] * 60 + +local[3], timezone) }
    catch { throw new JournalError('VALIDATION', '该时区不存在这个本地时间') }
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.test(value)) invalid('发生时间必须是本地日期时间或带时区 ISO')
  journalDate(value.slice(0, 10))
  const parsed = new Date(value)
  if (!Number.isFinite(parsed.getTime()) || Number(value.slice(11, 13)) > 23) invalid('发生时间无效')
  return parsed
}

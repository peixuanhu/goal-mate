import { Prisma } from '@prisma/client'
import { dateOnly } from './date'
import { JournalError } from './types'
import type { EnumOption, JournalEventInput, JournalEventUpdateInput, PutMeasurementInput, RecordedValue, TrackerConfig, TrackerCreateInput, TrackerKind, TrackerMutation } from './types'

export function invalid(message: string): never { throw new JournalError('VALIDATION', message) }
export function strictObject(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) invalid('请求必须是对象')
  const input = value as Record<string, unknown>
  if (Object.keys(input).some(key => !keys.includes(key))) invalid('请求包含未知字段')
  return input
}
export function journalText(value: unknown, label: string, maximum = 80, allowEmpty = false): string {
  if (typeof value !== 'string' || value.length > maximum || (!allowEmpty && !value.trim())) invalid(`${label}无效`)
  return value.trim()
}
export function journalVersion(value: unknown, allowZero = false): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < (allowZero ? 0 : 1)) invalid('版本号无效')
  return value
}
export function journalUuid(value: unknown): string {
  const id = journalText(value, '请求标识', 50)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) invalid('请求标识必须为 UUID')
  return id
}
export function journalColor(value: unknown): string {
  if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) invalid('颜色必须为六位十六进制')
  return value
}
export function journalDate(value: unknown): string {
  const date = journalText(value, '日期', 10)
  dateOnly(date)
  return date
}
export function optionalId(value: unknown): string | null { return value === null || value === undefined ? null : journalText(value, '关联标识', 100) }
function decimal(value: unknown): string {
  const text = typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER ? String(value) : value
  if (typeof text !== 'string' || !/^-?\d{1,16}(\.\d{1,4})?$/.test(text)) invalid('数值最多为 16 位整数和 4 位小数')
  return new Prisma.Decimal(text).toString()
}
export function parseJournalValue(kind: TrackerKind, value: unknown, options: EnumOption[]): RecordedValue {
  if (kind === 'boolean' && typeof value === 'boolean') return value
  if (kind === 'enum' && typeof value === 'string' && options.some(option => option.id === value)) return value
  if (kind === 'quantity' || kind === 'snapshot') return decimal(value)
  return invalid('记录值不符合该列的类型')
}
export function assertValueBounds(value: RecordedValue, config: TrackerConfig) {
  if (typeof value === 'boolean' || (config.minimum === null && config.maximum === null)) return
  if (config.minimum !== null && new Prisma.Decimal(value).lt(config.minimum)) invalid('数值低于该列的最小值')
  if (config.maximum !== null && new Prisma.Decimal(value).gt(config.maximum)) invalid('数值高于该列的最大值')
}
export function revisionForDate<T extends { effective_from: string }>(revisions: T[], date: string): T | null {
  return revisions.filter(revision => revision.effective_from <= date)
    .sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0] ?? null
}
export function parseTrackerConfig(value: unknown, kind: TrackerKind, planId: string | null): TrackerConfig {
  const input = strictObject(value, ['unit', 'source', 'daily_aggregation', 'encoding', 'units_per_cell', 'threshold', 'minimum', 'maximum', 'sync_completion', 'active_weekdays', 'enum_options'])
  const source = input.source
  if (source !== 'manual' && source !== 'plan' && source !== 'progress_field') invalid('请选择数据来源')
  const aggregation = input.daily_aggregation
  if (kind === 'boolean' ? aggregation !== 'any' : kind === 'quantity' ? !['sum', 'last'].includes(String(aggregation)) : aggregation !== 'last') invalid('日汇总口径不符合值类型')
  const encodings = kind === 'boolean' ? ['fill', 'symbol'] : kind === 'enum' ? ['symbol', 'fill'] : kind === 'snapshot' ? ['number', 'line', 'heat'] : ['number', 'blocks', 'heat', 'fill']
  if (!encodings.includes(String(input.encoding))) invalid('显示方式不符合值类型')
  if (source === 'plan' && (!planId || !['boolean', 'quantity'].includes(kind))) invalid('计划完成来源需要关联计划及是否/数量类型')
  if (typeof input.sync_completion !== 'boolean') invalid('同步完成设置无效')
  if (input.sync_completion && (source !== 'manual' || !planId || !['boolean', 'quantity'].includes(kind))) invalid('只有关联计划的手动习惯可同步完成')
  const units = decimal(input.units_per_cell)
  if (new Prisma.Decimal(units).lte(0)) invalid('每小格的数量必须大于零')
  const optionalDecimal = (value: unknown) => value === null ? null : decimal(value)
  const threshold = optionalDecimal(input.threshold), minimum = optionalDecimal(input.minimum), maximum = optionalDecimal(input.maximum)
  if (minimum !== null && maximum !== null && new Prisma.Decimal(minimum).gt(maximum)) invalid('最小值不能大于最大值')
  if (kind === 'quantity' && input.sync_completion && (threshold === null || new Prisma.Decimal(threshold).lt(0))) invalid('同步完成需要非负达标阈值')
  if (!Array.isArray(input.active_weekdays) || input.active_weekdays.some(day => !Number.isInteger(day) || day < 1 || day > 7) || new Set(input.active_weekdays).size !== input.active_weekdays.length) invalid('适用星期必须是无重复的 1–7')
  if (!Array.isArray(input.enum_options) || input.enum_options.length > 30 || (kind === 'enum' && !input.enum_options.length)) invalid('分类需包含 1–30 个选项')
  const options = input.enum_options.map(value => {
    const option = strictObject(value, ['id', 'label', 'symbol', 'color'])
    const id = journalText(option.id, '分类标识', 50)
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) invalid('分类标识无效')
    return { id, label: journalText(option.label, '分类名称', 40), symbol: journalText(option.symbol, '分类符号', 12, true), color: journalColor(option.color) }
  })
  if (new Set(options.map(option => option.id)).size !== options.length) invalid('分类标识不能重复')
  if (!['quantity', 'snapshot'].includes(kind) && (threshold !== null || minimum !== null || maximum !== null)) invalid('只有数值类型可设置范围')
  return { unit: journalText(input.unit, '单位', 24, true), source, daily_aggregation: aggregation as TrackerConfig['daily_aggregation'],
    encoding: input.encoding as TrackerConfig['encoding'], units_per_cell: units, threshold, minimum, maximum,
    sync_completion: input.sync_completion, active_weekdays: [...input.active_weekdays], enum_options: options }
}
export function parseTrackerCreate(value: unknown): TrackerCreateInput {
  const input = strictObject(value, ['name', 'kind', 'group', 'color', 'enabled_from', 'plan_id', 'goal_id', 'config'])
  if (!['boolean', 'quantity', 'snapshot', 'enum'].includes(String(input.kind))) invalid('值类型无效')
  const kind = input.kind as TrackerKind, plan_id = optionalId(input.plan_id)
  return { name: journalText(input.name, '列名'), kind, group: journalText(input.group, '分组', 40), color: journalColor(input.color),
    enabled_from: journalDate(input.enabled_from), plan_id, goal_id: optionalId(input.goal_id), config: parseTrackerConfig(input.config, kind, plan_id) }
}
export function parseTrackerMutation(value: unknown): TrackerMutation {
  const input = strictObject(value, ['action', 'tracker_id', 'expected_version', 'name', 'group', 'color', 'effective_from', 'plan_id', 'goal_id', 'config', 'ids', 'expected_versions', 'archived_from'])
  if (input.action === 'reorder') {
    if (!Array.isArray(input.ids) || input.ids.some(id => typeof id !== 'string') || new Set(input.ids).size !== input.ids.length) invalid('排序列表无效')
    const versions = input.expected_versions
    if (!versions || typeof versions !== 'object' || Array.isArray(versions)) invalid('排序版本无效')
    const expected_versions: Record<string, number> = {}
    for (const id of input.ids) expected_versions[journalText(id, '列标识', 100)] = journalVersion((versions as Record<string, unknown>)[id])
    return { action: 'reorder', ids: input.ids, expected_versions }
  }
  const base = { tracker_id: journalText(input.tracker_id, '列标识', 100), expected_version: journalVersion(input.expected_version) }
  if (input.action === 'display') return { ...base, action: 'display', name: journalText(input.name, '列名'), group: journalText(input.group, '分组', 40), color: journalColor(input.color) }
  if (input.action === 'archive') return { ...base, action: 'archive', archived_from: journalDate(input.archived_from) }
  if (input.action === 'revise') {
    if (!input.config || typeof input.config !== 'object' || Array.isArray(input.config)) invalid('列配置无效')
    return { ...base, action: 'revise', effective_from: journalDate(input.effective_from), plan_id: optionalId(input.plan_id), goal_id: optionalId(input.goal_id), config: input.config as TrackerConfig }
  }
  return invalid('列操作无效')
}
export function parseMeasurementInput(value: unknown): PutMeasurementInput {
  const input = strictObject(value, ['tracker_id', 'date', 'expected_version', 'value', 'status', 'note', 'request_id'])
  if (!['recorded', 'skipped', 'cleared'].includes(String(input.status))) invalid('记录状态无效')
  if (input.status === 'recorded' ? !['string', 'boolean', 'number'].includes(typeof input.value) : input.value !== null) invalid('值与记录状态不一致')
  return { tracker_id: journalText(input.tracker_id, '列标识', 100), date: journalDate(input.date), expected_version: journalVersion(input.expected_version, true),
    value: input.value as RecordedValue | null, status: input.status as PutMeasurementInput['status'], note: journalText(input.note, '备注', 4000, true), request_id: journalUuid(input.request_id) }
}
export function parseEventInput(value: unknown): JournalEventInput {
  const input = strictObject(value, ['title', 'start_date', 'end_date', 'note', 'status', 'plan_id', 'goal_id', 'sync_completion', 'request_id'])
  const start_date = journalDate(input.start_date), end_date = journalDate(input.end_date)
  if (end_date < start_date) invalid('结束日期不能早于开始日期')
  if (!['planned', 'progress', 'completed'].includes(String(input.status))) invalid('事件状态无效')
  const plan_id = optionalId(input.plan_id)
  if (typeof input.sync_completion !== 'boolean' || (input.sync_completion && !plan_id)) invalid('同步完成需要关联计划')
  return { title: journalText(input.title, '事件标题', 160), start_date, end_date, note: journalText(input.note, '备注', 4000, true),
    status: input.status as JournalEventInput['status'], plan_id, goal_id: optionalId(input.goal_id), sync_completion: input.sync_completion, request_id: journalUuid(input.request_id) }
}
export function parseEventUpdate(value: unknown): JournalEventUpdateInput {
  const input = strictObject(value, ['event_id', 'expected_version', 'title', 'start_date', 'end_date', 'note', 'status', 'plan_id', 'goal_id', 'sync_completion', 'request_id'])
  const { event_id, expected_version, ...event } = input
  return { ...parseEventInput(event), event_id: journalText(event_id, '事件标识', 100), expected_version: journalVersion(expected_version) }
}
export function parseProgressDelete(params: URLSearchParams) {
  const id = Number(params.get('id'))
  if (!Number.isSafeInteger(id) || id < 1) invalid('记录标识无效')
  return { id, ...(params.has('expected_version') ? { expected_version: journalVersion(Number(params.get('expected_version'))) } : {}) }
}
export function parseEventDelete(params: URLSearchParams) {
  return { event_id: journalText(params.get('event_id'), '事件标识', 100), expected_version: journalVersion(Number(params.get('expected_version'))) }
}

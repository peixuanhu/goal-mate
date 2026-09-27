'use client'
import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { journalRequest, notifyJournalChanged } from '@/lib/journal/client'
import type { MeasurementView, ProgressMetricInput, ProgressRecordView, TrackerView } from '@/lib/journal/types'
import { formatUtcInTimeZone } from '@/lib/today/timezone'
import { useWriteState } from '@/components/journal/editor-shared'
export type Plan = { plan_id: string; name: string; is_recurring?: boolean; progress?: number }
export type ProgressRecord = Omit<ProgressRecordView, 'metrics'> & { metrics?: MeasurementView[]; plan_name?: string; custom_time?: string; progress_update?: number }
type Outcome = 'legacy' | 'data' | 'completed' | 'partial' | 'skipped'
const metricInputs = (record: ProgressRecordView): ProgressMetricInput[] => record.metrics.filter(metric => metric.status !== 'cleared').map(metric => ({ tracker_id: metric.tracker_id, revision_id: metric.revision_id, value: metric.value, status: metric.status, note: metric.note }))
const sameMetric = (left?: ProgressMetricInput, right?: ProgressMetricInput) => left?.revision_id === right?.revision_id && left?.value === right?.value && left?.status === right?.status && left?.note === right?.note
export function useProgressJournal() {
  const params = useSearchParams(), urlPlan = params.get('plan_id'), urlRecord = params.get('record_id')
  const [plans, setPlans] = useState<Plan[]>([]), [planId, setPlanId] = useState(urlPlan ?? 'all'), [records, setRecords] = useState<ProgressRecord[]>([])
  const [form, setForm] = useState<Partial<ProgressRecord>>({}), [editingId, setEditingId] = useState<number | null>(null)
  const [viewMode, setViewMode] = useState<'all' | 'single'>(urlPlan ? 'single' : 'all'), [searchQuery, setSearchQuery] = useState('')
  const [trackers, setTrackers] = useState<TrackerView[]>([]), [timezone, setTimezone] = useState('Asia/Shanghai'), [today, setToday] = useState('')
  const [metadataLoaded, setMetadataLoaded] = useState(false), [readError, setReadError] = useState<string | null>(null), [reading, setReading] = useState(false), [editingLoading, setEditingLoading] = useState(false)
  const [metrics, setMetrics] = useState<ProgressMetricInput[]>([]), [metricsTouched, setMetricsTouched] = useState(false), [outcome, setOutcome] = useState<Outcome>('legacy'), [outcomeTouched, setOutcomeTouched] = useState(false)
  const [refresh, setRefresh] = useState(0), sequence = useRef(0), write = useWriteState()
  const loadedTime = useRef(''), originalMetrics = useRef<ProgressMetricInput[]>([]), dirtyMetrics = useRef(new Set<string>())
  useEffect(() => {
    if (urlPlan) { setPlanId(urlPlan); setViewMode('single') }
  }, [urlPlan])
  useEffect(() => {
    const controller = new AbortController()
    void Promise.all([
      journalRequest<{ list: Plan[] }>('/api/plan?pageSize=1000', { signal: controller.signal }),
      journalRequest<{ list: TrackerView[]; timezone: string; today: string }>('/api/journal/trackers', { signal: controller.signal }),
    ]).then(([plans, metadata]) => {
      if (controller.signal.aborted) return
      setPlans(plans.list); setTrackers(metadata.list); setTimezone(metadata.timezone); setToday(metadata.today); setMetadataLoaded(true)
    }).catch(error => { if (!controller.signal.aborted) setReadError(error instanceof Error ? error.message : '配置加载失败') })
    return () => controller.abort()
  }, [refresh])
  useEffect(() => {
    const controller = new AbortController()
    setReading(true)
    const query = new URLSearchParams({ pageSize: '100', ...(planId !== 'all' ? { plan_id: planId } : {}) })
    void journalRequest<{ list: ProgressRecord[] }>(`/api/progress_record?${query}`, { signal: controller.signal }).then(data => {
      if (!controller.signal.aborted) setRecords(data.list.map(record => ({ ...record, plan_name: plans.find(plan => plan.plan_id === record.plan_id)?.name ?? '未知计划' })))
    }).catch(error => { if (!controller.signal.aborted) setReadError(error instanceof Error ? error.message : '记录加载失败') }).finally(() => { if (!controller.signal.aborted) setReading(false) })
    return () => controller.abort()
  }, [planId, plans, refresh])
  useEffect(() => {
    const reload = () => setRefresh(value => value + 1)
    window.addEventListener('goal-mate:data-changed', reload); window.addEventListener('focus', reload)
    return () => { window.removeEventListener('goal-mate:data-changed', reload); window.removeEventListener('focus', reload) }
  }, [])
  const loadEdit = useCallback(async (id: number, signal?: AbortSignal) => {
    const request = ++sequence.current
    setEditingLoading(true); setReadError(null)
    try {
      const record = await journalRequest<ProgressRecordView>(`/api/progress_record?id=${id}`, { ...(signal ? { signal } : {}) })
      if (signal?.aborted || request !== sequence.current) return
      const local = formatUtcInTimeZone(new Date(record.gmt_create), timezone)
      const time = `${String(Math.floor(local.minutes / 60)).padStart(2, '0')}:${String(local.minutes % 60).padStart(2, '0')}`
      loadedTime.current = `${local.date}T${time}`
      setForm({ ...record, metrics: undefined, custom_time: loadedTime.current }); setEditingId(record.id)
      originalMetrics.current = metricInputs(record); dirtyMetrics.current.clear(); setMetrics(originalMetrics.current)
      setMetricsTouched(false); setOutcome(record.outcome as Outcome || (record.counts_toward_recurrence ? 'legacy' : 'data')); setOutcomeTouched(false)
    } catch (error) { if (!signal?.aborted && request === sequence.current) setReadError(error instanceof Error ? error.message : '原记录已不存在') }
    finally { if (!signal?.aborted && request === sequence.current) setEditingLoading(false) }
  }, [timezone])
  useEffect(() => {
    if (!urlRecord || !metadataLoaded) return
    const id = Number(urlRecord)
    if (!Number.isSafeInteger(id) || id < 1) { setReadError('原记录标识无效'); return }
    const controller = new AbortController()
    void loadEdit(id, controller.signal)
    return () => controller.abort()
  }, [urlRecord, metadataLoaded, loadEdit])
  const reset = () => { ++sequence.current; loadedTime.current = ''; originalMetrics.current = []; dirtyMetrics.current.clear(); setEditingLoading(false); setForm({}); setEditingId(null); setMetrics([]); setMetricsTouched(false); setOutcome('legacy'); setOutcomeTouched(false) }
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await write.write(async () => {
      const id = editingId ? form.plan_id ?? planId : planId
      if (!id || id === 'all') throw new Error('请选择计划')
      const payload = { plan_id: id, content: form.content ?? '', thinking: form.thinking ?? '',
        ...(form.custom_time && (!editingId || form.custom_time !== loadedTime.current) ? { custom_time: form.custom_time } : {}), ...(metricsTouched ? { metrics } : {}),
        ...(form.progress_update !== undefined ? { plan_progress: form.progress_update } : {}),
        ...(outcomeTouched && outcome !== 'legacy' ? { outcome: outcome === 'data' ? null : outcome } : {}),
        ...(editingId ? { id: editingId, expected_version: form.version } : {}),
      }
      await journalRequest('/api/progress_record', { method: editingId ? 'PUT' : 'POST', body: JSON.stringify({ ...payload, request_id: write.identity(payload) }) })
      reset(); write.setError(null); notifyJournalChanged({ entity: 'progress-record' })
    })
  }
  const handleEdit = (record: ProgressRecord) => void loadEdit(record.id)
  const handleDelete = async (id: number) => {
    if (!window.confirm('确定要删除这条进展记录吗？')) return
    await write.write(async () => {
      const record = records.find(record => record.id === id)
      await journalRequest(`/api/progress_record?${new URLSearchParams({ id: String(id), ...(record ? { expected_version: String(record.version) } : {}) })}`, { method: 'DELETE' })
      if (editingId === id) reset()
      notifyJournalChanged({ entity: 'progress-record' })
    })
  }
  const reloadOriginal = () => void write.write(async () => {
    if (!editingId) { setRefresh(value => value + 1); return }
    const record = await journalRequest<ProgressRecordView>(`/api/progress_record?id=${editingId}`)
    const latest = metricInputs(record), dirty = dirtyMetrics.current
    setMetrics(current => [...latest.filter(metric => !dirty.has(metric.tracker_id)), ...current.filter(metric => dirty.has(metric.tracker_id))])
    originalMetrics.current = latest
    setForm(prior => ({ ...prior, version: record.version })); write.setError(`已读取最新版本，当前输入已保留。原记录最新内容：${record.content.replace(/<[^>]*>/g, '').slice(0, 200)}`)
  })
  const handleViewModeChange = (mode: 'all' | 'single') => { setViewMode(mode); reset(); setPlanId(mode === 'all' ? 'all' : plans[0]?.plan_id ?? 'all') }
  const onMetricsChange = (metrics: ProgressMetricInput[]) => {
    dirtyMetrics.current = new Set([...new Set([...originalMetrics.current, ...metrics].map(metric => metric.tracker_id))].filter(id => !sameMetric(originalMetrics.current.find(metric => metric.tracker_id === id), metrics.find(metric => metric.tracker_id === id))))
    setMetrics(metrics); setMetricsTouched(true)
  }
  const onOutcomeChange = (outcome: Outcome) => { setOutcome(outcome); setOutcomeTouched(true) }
  return { plans, planId, setPlanId, records: records.filter(record => !searchQuery || `${record.content} ${record.thinking} ${record.plan_name}`.toLowerCase().includes(searchQuery.toLowerCase())), form, setForm, editingId,
    loading: write.busy || reading || editingLoading || !!urlRecord && !metadataLoaded, saving: write.busy, viewMode, searchQuery, setSearchQuery, handleSubmit, handleEdit, handleCancelEdit: reset, handleDelete, handleViewModeChange,
    trackers, timezone, today, metrics, onMetricsChange, outcome: !editingId && metricsTouched && !outcomeTouched ? 'data' : outcome, onOutcomeChange, error: write.error, conflict: write.conflict, readError, reloadOriginal }
}

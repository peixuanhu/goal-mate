'use client'
import React, { useEffect, useState } from 'react'
import { journalRequest, notifyJournalChanged } from '@/lib/journal/client'
import { revisionForDate } from '@/lib/journal/validation'
import type { JournalCell, JournalMonthView, MeasurementView, ProgressMetricInput, ProgressRecordView, RecordedValue, TrackerView } from '@/lib/journal/types'
import { JournalModal, OriginalLink, WriteError, editorStyles as s, useAssociations, useWriteState } from './editor-shared'
export function CellEditor({ tracker, cell, date, timezone, today, measurements = [], onClose, onSaved }: {
  tracker: TrackerView; cell: JournalCell; date: string; timezone: string; today: string; measurements?: MeasurementView[]; onClose: () => void; onSaved: (result?: MeasurementView) => void
}) {
  const revision = revisionForDate(tracker.revisions, date), config = revision?.config, manual = config?.source === 'manual'
  const raw = measurements.filter(item => item.tracker_id === tracker.tracker_id && item.local_date === date)
  const sourceIds = [...new Set(config?.source === 'plan' ? cell.sources.filter(source => source.kind === 'progress').map(source => Number(source.id)) : raw.filter(item => item.origin === 'progress_field' && item.progress_record_id !== null).map(item => item.progress_record_id!))]
  const [selected, setSelected] = useState(sourceIds.length === 1 ? String(sourceIds[0]) : ''), [original, setOriginal] = useState<ProgressRecordView | null>(null)
  const [value, setValue] = useState<RecordedValue | null>(cell.value), [note, setNote] = useState(raw.find(item => item.origin === 'manual')?.note ?? '')
  const [planId, setPlanId] = useState(revision?.plan_id ?? ''), [version, setVersion] = useState(cell.version), [sourceLoading, setSourceLoading] = useState(false), [sourceError, setSourceError] = useState<string | null>(null)
  const write = useWriteState(), associations = useAssociations(!manual && !revision?.plan_id), editable = date <= today && cell.state !== 'not_applicable' && !!revision
  useEffect(() => {
    if (!selected) { setOriginal(null); return }
    let current = true
    const controller = new AbortController()
    setSourceLoading(true); setSourceError(null); setOriginal(null)
    void journalRequest<ProgressRecordView>(`/api/progress_record?id=${selected}`, { signal: controller.signal }).then(record => {
      if (!current) return
      setOriginal(record)
      const metric = record.metrics.find(metric => metric.tracker_id === tracker.tracker_id)
      if (metric) { setValue(metric.value); setNote(metric.note) }
    }).catch(error => { if (current) setSourceError(error instanceof Error ? error.message : '来源加载失败') }).finally(() => { if (current) setSourceLoading(false) })
    return () => { current = false; controller.abort() }
  }, [selected, tracker.tracker_id])
  const finish = (result?: MeasurementView) => { notifyJournalChanged({ entity: manual ? 'journal' : 'progress-record', date }); onSaved(result) }
  async function save(status: 'recorded' | 'skipped' | 'cleared') {
    if (!editable || !revision) return
    await write.write(async () => {
      const actualValue = status === 'recorded' ? value : null
      if (status === 'recorded' && (actualValue === null || actualValue === '')) throw new Error('请填写值，0 和未完成均可记录')
      if (manual) {
        const payload = { tracker_id: tracker.tracker_id, date, expected_version: version, value: actualValue, status, note }
        const result = await journalRequest<MeasurementView>('/api/journal/measurements', { method: 'PUT', body: JSON.stringify({ ...payload, request_id: write.identity(payload) }) }); finish(result)
        return
      }
      if (selected && !original) throw new Error('请先读取原记录')
      const metric: ProgressMetricInput = { tracker_id: tracker.tracker_id, revision_id: revision.revision_id, value: actualValue, status, note }
      if (original) {
        const metrics = original.metrics.filter(item => item.tracker_id !== tracker.tracker_id).map(item => ({ tracker_id: item.tracker_id, revision_id: item.revision_id, value: item.value, status: item.status, note: item.note }))
        const payload = { id: original.id, expected_version: original.version, metrics: [...metrics, metric] }
        await journalRequest('/api/progress_record', { method: 'PUT', body: JSON.stringify({ ...payload, request_id: write.identity(payload) }) })
      } else {
        if (!planId) throw new Error('请为原进展选择一个计划')
        const payload = { plan_id: planId, content: `${tracker.name}：${actualValue ?? (status === 'skipped' ? '跳过' : '清空')}`, thinking: '', custom_time: `${date}T12:00`, metrics: [metric] }
        await journalRequest('/api/progress_record', { method: 'POST', body: JSON.stringify({ ...payload, request_id: write.identity(payload) }) })
      }
      finish()
    })
  }
  const reload = () => void write.write(async () => {
    if (manual) {
      const view = await journalRequest<JournalMonthView>(`/api/journal/month?month=${date.slice(0, 7)}`)
      const current = view.cells[date]?.[tracker.tracker_id]
      if (!current) throw new Error('该日期已不适用于此列')
      if (current.revision_id !== cell.revision_id) throw new Error('配置已变化，请关闭后重新打开这个格子')
      setVersion(current.version)
    } else if (original) setOriginal(await journalRequest<ProgressRecordView>(`/api/progress_record?id=${original.id}`))
    write.setError('已读取最新版本，当前输入仍保留，请确认后保存。')
  })
  return <JournalModal title={`${tracker.name} · ${date}`} onClose={onClose} busy={write.busy || sourceLoading}>
    <div className={s.form}>
      <p className={s.hint}>{timezone} · {manual ? '手动填写' : config?.source === 'plan' ? '来自计划完成记录' : '来自原进展的结构化字段'}{config?.unit ? ` · ${config.unit}` : ''}</p>
      {!editable ? <p className={s.info}>{date > today ? '未来日期可安排事件，实际值到当天再填写。' : '这一天不在该列的适用范围内。'}</p> : null}
      {!manual ? <>
        {sourceIds.length ? <label>原进展<select aria-label="原进展" value={selected} onChange={event => setSelected(event.target.value)} disabled={write.busy}><option value="">新建一条进展</option>{sourceIds.map(id => <option value={id} key={id}>进展 #{id}</option>)}</select></label> : null}
        {sourceLoading ? <p role="status" className={s.hint}>正在读取原记录…</p> : null}
        {sourceError ? <p role="alert" className={s.error}>{sourceError}</p> : null}
        {original ? <div className={s.info}><p>{original.content.replace(/<[^>]*>/g, '').slice(0, 500) || '无正文'}</p><OriginalLink planId={original.plan_id} recordId={original.id} />{config?.source === 'plan' && original.outcome === null ? <p>旧记录按循环计划的原有计次规则展示。</p> : null}</div> : null}
        {raw.some(item => item.source_deleted) ? <p className={s.info}>来源已删除，原始测量保留在当天详情中，不再计入自动汇总。</p> : null}
        {!original && !revision?.plan_id ? <label>原进展所属计划<select aria-label="原进展所属计划" value={planId} onChange={event => setPlanId(event.target.value)}><option value="">请选择计划</option>{associations.plans.map(plan => <option key={plan.plan_id} value={plan.plan_id}>{plan.name}</option>)}</select></label> : null}
        {revision?.plan_name ? <p className={s.hint}>关联计划：{revision.plan_name}{!revision.plan_id ? '（已删除，请调整未来口径）' : ''}</p> : null}
        {associations.error ? <p role="alert" className={s.error}>{associations.error}</p> : null}
      </> : null}
      {config?.source === 'plan' ? <>
        <p className={s.info}>此格读取真实完成次数。修改、删除现有完成记录请进入原进展；添加完成记录会同步计划计次。</p>
        {!original && editable ? <button type="button" className={`${s.button} ${s.primary}`} disabled={write.busy || !planId} onClick={() => void write.write(async () => {
          const payload = { plan_id: planId, content: `${tracker.name}：已完成`, thinking: '', custom_time: `${date}T12:00`, outcome: 'completed' }
          await journalRequest('/api/progress_record', { method: 'POST', body: JSON.stringify({ ...payload, request_id: write.identity(payload) }) }); finish()
        })}>记录完成一次</button> : null}
      </> : <form onSubmit={event => { event.preventDefault(); void save('recorded') }} className={s.form}>
        <fieldset disabled={write.busy || sourceLoading || !editable} className={s.form}>
          {tracker.kind === 'boolean' ? <div><span className={s.hint}>{tracker.name}</span><div className={s.choice}><button type="button" aria-pressed={value === true} className={value === true ? s.active : ''} onClick={() => setValue(true)}>已完成</button><button type="button" aria-pressed={value === false} className={value === false ? s.active : ''} onClick={() => setValue(false)}>未完成</button></div></div>
            : tracker.kind === 'enum' ? <label>{tracker.name}<select aria-label={tracker.name} value={typeof value === 'string' ? value : ''} onChange={event => setValue(event.target.value)} required><option value="">请选择</option>{config?.enum_options.map(option => <option key={option.id} value={option.id}>{option.symbol} {option.label}</option>)}</select></label>
              : <label>{tracker.name}<input aria-label={tracker.name} inputMode="decimal" value={typeof value === 'string' ? value : ''} onChange={event => setValue(event.target.value)} placeholder={`填写${config?.unit || '数值'}，0 也是有效记录`} required /></label>}
          <label>备注<textarea aria-label="备注" value={note} onChange={event => setNote(event.target.value)} maxLength={4000} /></label>
        </fieldset>
        {config?.sync_completion ? <p className={s.info}>{revision?.plan_id ? `达标后与「${revision.plan_name}」共用当天的一条完成记录；撤销不会删除其他来源的记录。` : '关联计划已删除，这个格子只保存手动值；请设置新的未来口径。'}</p> : null}
        <WriteError error={write.error} conflict={write.conflict} onReload={reload} />
        <div className={s.footer}><button type="button" disabled={write.busy || !editable || sourceLoading} onClick={() => void save('cleared')}>清空</button><button type="button" disabled={write.busy || !editable || sourceLoading} onClick={() => void save('skipped')}>跳过</button><button type="submit" className={s.primary} disabled={write.busy || !editable || sourceLoading}>{write.busy ? '正在保存…' : '保存'}</button></div>
      </form>}
      {config?.source === 'plan' ? <WriteError error={write.error} conflict={write.conflict} onReload={reload} /> : null}
    </div>
  </JournalModal>
}

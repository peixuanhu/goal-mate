'use client'
import React from 'react'
import { isApplicableDate } from '@/lib/journal/aggregate'
import { revisionForDate } from '@/lib/journal/validation'
import type { ProgressMetricInput, RecordedValue, TrackerView } from '@/lib/journal/types'
import s from './editor.module.css'
export function ProgressMetricFields({ trackers, planId, date, value, onChange, disabled = false }: {
  trackers: TrackerView[]; planId: string; date: string; value: ProgressMetricInput[]; onChange: (value: ProgressMetricInput[]) => void; disabled?: boolean
}) {
  const fields = trackers.flatMap(tracker => {
    const revision = revisionForDate(tracker.revisions, date)
    return revision && isApplicableDate(tracker, date) && revision.config.source === 'progress_field' && (revision.plan_id === planId || revision.plan_id === null && revision.plan_name === null) ? [{ tracker, revision }] : []
  })
  const hidden = value.filter(metric => metric.status !== 'cleared' && !fields.some(field => field.tracker.tracker_id === metric.tracker_id))
  const stale = fields.filter(field => value.some(metric => metric.tracker_id === field.tracker.tracker_id && metric.revision_id !== field.revision.revision_id && metric.status !== 'cleared'))
  if (!fields.length && !hidden.length) return null
  const update = (trackerId: string, revisionId: string, actual: RecordedValue | null, status: ProgressMetricInput['status'], note?: string) => {
    const existing = value.find(metric => metric.tracker_id === trackerId)
    const metric: ProgressMetricInput = { tracker_id: trackerId, revision_id: revisionId, value: actual, status, note: note ?? existing?.note ?? '' }
    onChange([...value.filter(metric => metric.tracker_id !== trackerId), metric])
  }
  return <fieldset disabled={disabled} className={`${s.form} rounded-xl border border-stone-200 bg-stone-50/60 p-4`}>
    <legend className="px-2 text-sm font-semibold text-stone-600">手账结构化字段</legend>
    <p className={s.hint}>保存到同一条进展，自动同步 {date} 的手账。未填写的格子保持留白。</p>
    {fields.map(({ tracker, revision }) => {
      const metric = value.find(metric => metric.tracker_id === tracker.tracker_id), recorded = metric?.status === 'recorded', actual = recorded ? metric.value : null
      return <div key={tracker.tracker_id} className={s.form}>
        <label>{tracker.name}{revision.config.unit ? `（${revision.config.unit}）` : ''}
          {tracker.kind === 'boolean' ? <select aria-label={tracker.name} value={actual === true ? 'true' : actual === false ? 'false' : ''} onChange={event => update(tracker.tracker_id, revision.revision_id, event.target.value === '' ? null : event.target.value === 'true', event.target.value === '' ? 'cleared' : 'recorded')}><option value="">未填写</option><option value="true">已完成</option><option value="false">未完成</option></select>
            : tracker.kind === 'enum' ? <select aria-label={tracker.name} value={typeof actual === 'string' ? actual : ''} onChange={event => update(tracker.tracker_id, revision.revision_id, event.target.value || null, event.target.value ? 'recorded' : 'cleared')}><option value="">未填写</option>{revision.config.enum_options.map(option => <option value={option.id} key={option.id}>{option.symbol} {option.label}</option>)}</select>
              : <input aria-label={tracker.name} inputMode="decimal" value={typeof actual === 'string' ? actual : ''} placeholder="未填写" onChange={event => update(tracker.tracker_id, revision.revision_id, event.target.value || null, event.target.value ? 'recorded' : 'cleared')} />}
        </label>
        {metric?.status === 'skipped' ? <p className={s.hint}>此字段已标记跳过。</p> : null}
        {metric && metric.status !== 'cleared' ? <label>{tracker.name}备注<input aria-label={`${tracker.name}备注`} value={metric.note} maxLength={4000} onChange={event => update(tracker.tracker_id, revision.revision_id, metric.value, metric.status, event.target.value)} /></label> : null}
        <div className="flex gap-3 text-xs"><button type="button" onClick={() => update(tracker.tracker_id, revision.revision_id, null, 'skipped')} className="text-stone-500 underline">标记跳过</button>{metric ? <button type="button" onClick={() => update(tracker.tracker_id, revision.revision_id, null, 'cleared')} className="text-stone-500 underline">清空字段</button> : null}</div>
      </div>
    })}
    {stale.length ? <div className={s.info}>日期变更后，{stale.map(field => field.tracker.name).join('、')} 的口径不同。请核对值与单位。<button type="button" className={s.button} onClick={() => onChange(value.map(metric => ({ ...metric, revision_id: fields.find(field => field.tracker.tracker_id === metric.tracker_id)?.revision.revision_id ?? metric.revision_id })))}>确认使用当前日期口径</button></div> : null}
    {hidden.length ? <div className={s.info}>{hidden.length} 个原字段不适用于当前计划或日期，请调整选择，或明确清除这些字段。<button type="button" className={s.button} onClick={() => onChange(value.filter(metric => !hidden.some(item => item.tracker_id === metric.tracker_id)))}>清除不适用字段</button></div> : null}
  </fieldset>
}

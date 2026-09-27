'use client'
import React, { useState } from 'react'
import { journalRequest, notifyJournalChanged } from '@/lib/journal/client'
import type { JournalEventInput, JournalEventView, JournalMonthView } from '@/lib/journal/types'
import { JournalModal, OriginalLink, WriteError, editorStyles as s, useAssociations, useWriteState } from './editor-shared'
import { eventSourceLabel, eventStatusLabel } from './journal-sheet'
export function EventEditor({ date, event, today, onClose, onSaved }: { date: string; event: JournalEventView | null; today: string; onClose: () => void; onSaved: () => void }) {
  const custom = !event || event.source === 'custom', write = useWriteState(), associations = useAssociations(custom)
  const [form, setForm] = useState<Omit<JournalEventInput, 'request_id'>>({ title: event?.title ?? '', start_date: event?.start_date ?? date, end_date: event?.end_date ?? date, note: event?.note ?? '', status: event?.status ?? 'planned', plan_id: event?.plan_id ?? null, goal_id: event?.goal_id ?? null, sync_completion: !!event?.plan_id && (event.sync_completion ?? false) })
  const [version, setVersion] = useState(event?.version), [confirmDelete, setConfirmDelete] = useState(false)
  const change = <K extends keyof typeof form>(key: K, value: typeof form[K]) => setForm(prior => ({ ...prior, [key]: value }))
  const finish = () => { notifyJournalChanged({ entity: 'journal', date: form.start_date }); onSaved() }
  const reload = () => void write.write(async () => {
    const view = await journalRequest<JournalMonthView>(`/api/journal/month?month=${event?.start_date.slice(0, 7)}`)
    const current = view.events.find(item => item.event_id === event?.event_id)
    if (!current) throw new Error('事件已不存在')
    setVersion(current.version); write.setError('已读取最新版本，当前输入仍保留，请确认后保存。')
  })
  return <JournalModal title={event ? custom ? '编辑事件' : event.title : '添加事件'} busy={write.busy} onClose={onClose}>
    {!custom && event ? <div className={s.form}><p className={s.info}>{eventSourceLabel[event.source]} · {eventStatusLabel[event.status]}<br />{event.start_date} 至 {event.end_date}</p><p className={s.hint}>{event.note}</p><OriginalLink planId={event.plan_id} recordId={event.progress_record_id} source={event.source} date={event.start_date} /><div className={s.footer}><button type="button" onClick={onClose}>关闭</button></div></div> : <form className={s.form} onSubmit={submit => {
      submit.preventDefault()
      void write.write(async () => {
        if (form.status === 'completed' && form.end_date > today) throw new Error('未来事件不能标为已完成')
        const payload = { ...form, ...(event ? { event_id: event.event_id, expected_version: version } : {}) }
        await journalRequest('/api/journal/events', { method: event ? 'PUT' : 'POST', body: JSON.stringify({ ...payload, request_id: write.identity(payload) }) }); finish()
      })
    }}>
      <fieldset disabled={write.busy} className={s.form}>
        <label>事件标题<input aria-label="事件标题" value={form.title} onChange={changeEvent => change('title', changeEvent.target.value)} required maxLength={160} placeholder="如：发布视频、设计项目、旅行" /></label>
        <div className={s.grid}><label>开始日期<input type="date" aria-label="开始日期" value={form.start_date} onChange={changeEvent => change('start_date', changeEvent.target.value)} required /></label><label>结束日期<input type="date" aria-label="结束日期" min={form.start_date} value={form.end_date} onChange={changeEvent => change('end_date', changeEvent.target.value)} required /></label></div>
        <label>状态<select aria-label="事件状态" value={form.status} onChange={changeEvent => change('status', changeEvent.target.value as JournalEventInput['status'])}><option value="planned">计划</option><option value="progress">进行中</option><option value="completed">已完成</option></select></label>
        <div className={s.grid}><label>关联计划<select aria-label="关联计划" value={form.plan_id ?? ''} onChange={changeEvent => { change('plan_id', changeEvent.target.value || null); if (!changeEvent.target.value) change('sync_completion', false) }}><option value="">不绑定计划</option>{associations.plans.map(plan => <option key={plan.plan_id} value={plan.plan_id}>{plan.name}</option>)}</select></label><label>关联目标<select aria-label="关联目标" value={form.goal_id ?? ''} onChange={changeEvent => change('goal_id', changeEvent.target.value || null)}><option value="">不绑定目标</option>{associations.goals.map(goal => <option key={goal.goal_id} value={goal.goal_id}>{goal.name}</option>)}</select></label></div>
        {!event?.plan_id && event?.plan_name ? <p className={s.hint}>原关联计划「{event.plan_name}」已删除，历史事件保留。</p> : null}
        {!event?.goal_id && event?.goal_name ? <p className={s.hint}>原关联目标「{event.goal_name}」已删除，历史事件保留。</p> : null}
        <label className={s.check}><input type="checkbox" aria-label="同步计划完成" disabled={!form.plan_id} checked={form.sync_completion} onChange={changeEvent => change('sync_completion', changeEvent.target.checked)} />标为已完成时，同步完成一次关联计划</label>
        <p className={s.hint}>跨日事件显示为纵向区间。只有明确勾选同步并标为已完成，才生成一次完成记录。</p>
        <label>备注<textarea aria-label="事件备注" value={form.note} onChange={changeEvent => change('note', changeEvent.target.value)} maxLength={4000} /></label>
      </fieldset>
      {associations.error ? <p role="alert" className={s.error}>{associations.error}</p> : null}
      <WriteError error={write.error} conflict={write.conflict} onReload={reload} />
      <div className={s.footer}>{event ? <button type="button" className={s.danger} disabled={write.busy} onClick={() => confirmDelete ? void write.write(async () => { await journalRequest(`/api/journal/events?${new URLSearchParams({ event_id: event.event_id, expected_version: String(version) })}`, { method: 'DELETE' }); finish() }) : setConfirmDelete(true)}>{confirmDelete ? '确认删除事件' : '删除事件'}</button> : null}<button type="button" onClick={onClose} disabled={write.busy}>关闭</button><button type="submit" className={s.primary} disabled={write.busy}>{write.busy ? '正在保存…' : '保存事件'}</button></div>
    </form>}
  </JournalModal>
}

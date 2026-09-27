'use client'
import React, { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { shiftJournalMonth } from '@/lib/journal/date'
import { journalRequest, notifyJournalChanged } from '@/lib/journal/client'
import { revisionForDate } from '@/lib/journal/validation'
import type { JournalCell, JournalEventView, MeasurementView, TrackerView } from '@/lib/journal/types'
import { useJournalMonth } from './use-journal-month'
import { JournalSheet } from './journal-sheet'
import { TrackerEditor } from './tracker-editor'
import { CellEditor } from './cell-editor'
import { DayDetail } from './day-detail'
import { EventEditor } from './event-editor'
import styles from './journal-sheet.module.css'
type Editor = { kind: 'none' } | { kind: 'tracker'; tracker: TrackerView | null } | { kind: 'cell'; tracker: TrackerView; cell: JournalCell } | { kind: 'day'; date: string } | { kind: 'event'; date: string; event: JournalEventView | null }
export function MonthlyJournal() {
  const params = useSearchParams(), router = useRouter(), urlMonth = params.get('month')
  const [month, setMonth] = useState<string | null>(urlMonth), [group, setGroup] = useState<string | null>(null), [selected, setSelected] = useState('')
  const [editor, setEditor] = useState<Editor>({ kind: 'none' }), [saving, setSaving] = useState(false), [saveError, setSaveError] = useState<string | null>(null)
  const [toast, setToast] = useState<{ text: string; undo: () => Promise<void>; edit: () => void } | null>(null)
  const { data: view, error, loading, reload } = useJournalMonth(month)
  useEffect(() => setMonth(urlMonth), [urlMonth])
  const close = () => setEditor({ kind: 'none' }), saved = () => close()
  const changeMonth = (month: string | null) => { setMonth(month); close(); setToast(null); router.replace(month ? `/journal?month=${month}` : '/journal', { scroll: false }) }
  const activeTracker = view?.trackers.find(tracker => tracker.tracker_id === selected) ?? view?.trackers[0]
  const summaries = view?.summaries.filter(item => item.tracker_id === activeTracker?.tracker_id) ?? []
  function editCell(cell: JournalCell) {
    const tracker = view?.trackers.find(item => item.tracker_id === cell.tracker_id)
    if (!tracker) return
    setSelected(tracker.tracker_id); setEditor({ kind: 'cell', tracker, cell })
  }
  async function openCell(cell: JournalCell) {
    const tracker = view?.trackers.find(item => item.tracker_id === cell.tracker_id)
    if (!view || !tracker || saving || loading) return
    setSelected(tracker.tracker_id)
    const revision = revisionForDate(tracker.revisions, cell.date)
    if (tracker.kind !== 'boolean' || revision?.config.source !== 'manual' || cell.state === 'future' || cell.state === 'not_applicable') { editCell(cell); return }
    setSaving(true); setSaveError(null); setToast(null)
    const prior = view.measurements.find(item => item.measurement_id === cell.measurement_id), value = cell.state === 'recorded' ? cell.value !== true : true
    try {
      const result = await journalRequest<MeasurementView>('/api/journal/measurements', { method: 'PUT', body: JSON.stringify({ tracker_id: tracker.tracker_id, date: cell.date, expected_version: cell.version, value, status: 'recorded', note: prior?.note ?? '', request_id: crypto.randomUUID() }) })
      notifyJournalChanged({ entity: 'journal', date: cell.date })
      setToast({ text: `${tracker.name}：${value ? '已完成' : '未完成'}`, edit: () => setEditor({ kind: 'cell', tracker, cell: { ...cell, value, state: 'recorded', version: result.version, measurement_id: result.measurement_id } }), undo: async () => {
        await journalRequest('/api/journal/measurements', { method: 'PUT', body: JSON.stringify({ tracker_id: tracker.tracker_id, date: cell.date, expected_version: result.version, value: prior?.value ?? null, status: prior?.status ?? 'cleared', note: prior?.note ?? '', request_id: crypto.randomUUID() }) })
        notifyJournalChanged({ entity: 'journal', date: cell.date })
      } })
    } catch (error) { setSaveError(error instanceof Error ? error.message : '保存失败，请重试') }
    finally { setSaving(false) }
  }
  const displayedMonth = view?.month ?? month, validMonth = displayedMonth && /^\d{4}-\d{2}$/.test(displayedMonth)
  const groups = [...new Set(view?.trackers.map(tracker => tracker.group) ?? [])]
  return <div className={styles.page}>
    <header className={styles.toolbar}>
      <div className={styles.title}><span className={styles.monthNumber}>{validMonth ? Number(displayedMonth.slice(5)) : '—'}</span><div className={styles.monthMeta}><span className={styles.eyebrow}>MONTHLY JOURNAL</span><strong>{validMonth ? `${displayedMonth.slice(0, 4)} · ${['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][Number(displayedMonth.slice(5)) - 1]}` : '月度手账'}</strong><p>把习惯、数据和发生的事，放在同一页。</p></div></div>
      <div className={styles.actions}><button type="button" aria-label="上个月" disabled={!view || saving} onClick={() => view && changeMonth(shiftJournalMonth(view.month, -1))}>←</button><button type="button" aria-label="下个月" disabled={!view || saving} onClick={() => view && changeMonth(shiftJournalMonth(view.month, 1))}>→</button><button type="button" onClick={() => changeMonth(null)}>本月</button><button type="button" disabled={!view || loading || saving} onClick={() => setEditor({ kind: 'event', date: view!.today.slice(0, 7) === view!.month ? view!.today : view!.dates[0], event: null })}>添加事件</button><button type="button" className={styles.primary} disabled={!view || loading || saving} onClick={() => setEditor({ kind: 'tracker', tracker: null })}>添加列</button></div>
    </header>
    {error || saveError ? <div role="alert" className={styles.error}>{saveError ?? error} <button type="button" onClick={reload}>重新读取</button></div> : null}
    {!view ? <p role="status" className={styles.status}>{loading ? '正在加载手账…' : '未能加载本月手账，请重试。'}</p> : <>
      <div className={styles.groupBar}><button type="button" className={group === null ? styles.selected : ''} onClick={() => setGroup(null)}>全部列</button>{groups.map(item => <button key={item} type="button" className={group === item ? styles.selected : ''} onClick={() => setGroup(item)}>{item}</button>)}<span>{view.trackers.length} 列 · {view.dates.length} 天 · {view.timezone}{loading || saving ? ' · 正在更新…' : ''}</span></div>
      <section className={styles.paper} aria-label={`${view.month} 月度手账`}>
        {!view.trackers.length ? <div className={styles.empty}>从一个习惯开始，或添加心情、数量和快照列。每个格子的含义由你设置。</div> : null}
        <JournalSheet view={view} group={group} onCell={cell => void openCell(cell)} onTracker={tracker => setEditor({ kind: 'tracker', tracker })} onDate={date => setEditor({ kind: 'day', date })} onEvent={event => setEditor({ kind: 'event', date: event.start_date, event })} busy={loading || saving} />
        <div className={styles.legend}><span>✓ 已完成</span><span>× 未完成</span><span>— 跳过</span><span>留白 未记录</span><span>○ 计划 / 安排</span><span>点线连接已记录的快照</span></div>
      </section>
      {activeTracker ? <section className={styles.summary} aria-label="本月摘要"><label>本月摘要 <select aria-label="摘要列" value={activeTracker.tracker_id} onChange={event => setSelected(event.target.value)}>{view.trackers.map(tracker => <option key={tracker.tracker_id} value={tracker.tracker_id}>{tracker.name}</option>)}</select></label>{summaries.map(summary => <React.Fragment key={summary.revision_id}>
        {summaries.length > 1 ? <strong>口径 {activeTracker.revisions.find(revision => revision.revision_id === summary.revision_id)?.effective_from}</strong> : null}
        {activeTracker.kind === 'quantity' ? <span>本月累计 <b>{summary.sum ?? '—'}</b>{summary.unit}</span> : null}
        {activeTracker.kind === 'snapshot' ? <><span>最后值 <b>{summary.last ?? '—'}</b>{summary.unit}</span><span>月初基线 {summary.baseline ?? '—'}</span><span>变化 <b>{summary.delta === null ? '—' : Number(summary.delta) > 0 ? `+${summary.delta}` : summary.delta}</b></span></> : null}
        {activeTracker.kind === 'boolean' || summary.completion_rate !== null ? <><span>完成 <b>{summary.completed_days}</b>天</span><span>连续 <b>{summary.streak ?? '—'}</b>天</span><span>已记录日达标率 <b>{summary.completion_rate === null ? '—' : `${Math.round(summary.completion_rate * 100)}%`}</b></span></> : null}
        {activeTracker.kind === 'enum' ? Object.entries(summary.categories).map(([id, count]) => <span key={id}>{activeTracker.revisions.find(revision => revision.revision_id === summary.revision_id)?.config.enum_options.find(option => option.id === id)?.label ?? id} <b>{count}</b>天</span>) : null}
        <span>记录 {summary.recorded_days} / 适用 {summary.applicable_days} 天</span>
      </React.Fragment>)}</section> : null}
      {editor.kind === 'tracker' ? <TrackerEditor tracker={editor.tracker} today={view.today} onClose={close} onSaved={saved} /> : null}
      {editor.kind === 'cell' ? <CellEditor tracker={editor.tracker} cell={editor.cell} date={editor.cell.date} timezone={view.timezone} today={view.today} measurements={view.measurements} onClose={close} onSaved={saved} /> : null}
      {editor.kind === 'day' ? <DayDetail date={editor.date} view={view} onClose={close} onCell={editCell} onEvent={event => setEditor({ kind: 'event', date: event.start_date, event })} onAddEvent={() => setEditor({ kind: 'event', date: editor.date, event: null })} /> : null}
      {editor.kind === 'event' ? <EventEditor date={editor.date} event={editor.event} today={view.today} onClose={close} onSaved={saved} /> : null}
    </>}
    {toast ? <div role="status" className={styles.toast}><span>{toast.text}</span><button type="button" disabled={saving} onClick={() => { toast.edit(); setToast(null) }}>编辑</button><button type="button" disabled={saving} onClick={() => {
      setSaving(true); void toast.undo().then(() => setToast(null)).catch(error => setSaveError(error instanceof Error ? error.message : '撤销失败')).finally(() => setSaving(false))
    }}>撤销</button><button type="button" aria-label="关闭提示" onClick={() => setToast(null)}>×</button></div> : null}
  </div>
}

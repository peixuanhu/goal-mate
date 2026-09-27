'use client'
import React from 'react'
import type { JournalCell, JournalEventView, JournalMonthView } from '@/lib/journal/types'
import { JournalModal, OriginalLink, editorStyles as s } from './editor-shared'
import { cellDescription } from './journal-cell'
import { eventSourceLabel, eventStatusLabel } from './journal-sheet'
export function DayDetail({ date, view, onCell, onEvent, onClose, onAddEvent }: {
  date: string; view: JournalMonthView; onCell: (cell: JournalCell) => void; onEvent: (event: JournalEventView) => void; onClose: () => void; onAddEvent?: () => void
}) {
  const raw = view.measurements.filter(item => item.local_date === date), events = view.events.filter(event => event.start_date <= date && event.end_date >= date)
  return <JournalModal title={`${date} · 当天详情`} onClose={onClose}>
    <p className={s.hint}>{view.timezone} · {raw.length} 条原始测量 · {events.length} 条事件 / 来源</p>
    <h3 className={s.sectionTitle}>每日格子</h3><div className={s.list}>
      {view.trackers.map(tracker => {
        const cell = view.cells[date][tracker.tracker_id], revision = tracker.revisions.find(item => item.revision_id === cell.revision_id)
        return <div key={tracker.tracker_id} className={s.entry}><button type="button" onClick={() => onCell(cell)}>{tracker.name} <span className={s.badge}>{revision ? cellDescription(tracker.kind, revision.config, cell) : '不适用'} · {revision?.config.source === 'manual' ? '手动' : '自动'}</span></button>{cell.sources.length ? <p>{cell.sources.length} 个来源 · {cell.sources.some(source => source.legacy) ? '包含旧记录计次' : '可追溯原记录'}</p> : null}</div>
      })}
      {!view.trackers.length ? <p className={s.hint}>尚未添加列。</p> : null}
    </div>
    <h3 className={s.sectionTitle}>原始测量</h3><div className={s.list}>
      {raw.map(measurement => {
        const tracker = view.trackers.find(item => item.tracker_id === measurement.tracker_id), revision = tracker?.revisions.find(item => item.revision_id === measurement.revision_id)
        const value = measurement.status !== 'recorded' ? measurement.status === 'skipped' ? '跳过' : '已清空' : typeof measurement.value === 'boolean' ? measurement.value ? '已完成' : '未完成' : tracker?.kind === 'enum' ? revision?.config.enum_options.find(option => option.id === measurement.value)?.label ?? measurement.value : `${measurement.value} ${revision?.config.unit ?? ''}`
        return <div key={measurement.measurement_id} className={s.entry}><strong>{tracker?.name ?? '历史列'}：{value}</strong><span className={s.badge}>{measurement.origin === 'manual' ? '手动值' : '进展字段'}{measurement.source_deleted ? ` · 来源已删除 #${measurement.source_record_id}（保留原值）` : ''} · 口径 {revision?.effective_from}</span>{measurement.note ? <p>{measurement.note}</p> : null}{measurement.progress_record_id ? <OriginalLink planId={revision?.plan_id ?? null} recordId={measurement.progress_record_id} /> : null}</div>
      })}
      {!raw.length ? <p className={s.hint}>这一天尚无原始测量。</p> : null}
    </div>
    <h3 className={s.sectionTitle}>事件、进展与区间</h3><div className={s.list}>
      {events.map(event => <div key={event.event_id} className={s.entry}><button type="button" onClick={() => onEvent(event)}>{event.title}</button><span className={s.badge}>{eventSourceLabel[event.source]} · {eventStatusLabel[event.status]}{event.start_date !== event.end_date ? ` · ${event.start_date} 至 ${event.end_date}` : ''}</span>{event.note ? <p>{event.note}</p> : null}{event.source !== 'custom' ? <OriginalLink planId={event.plan_id} recordId={event.progress_record_id} date={date} source={event.source} /> : null}</div>)}
      {!events.length ? <p className={s.hint}>这一天还没有事件。</p> : null}
    </div>
    <div className={s.footer}>{onAddEvent ? <button type="button" className={s.primary} onClick={onAddEvent}>添加当天事件</button> : null}<button type="button" onClick={onClose}>关闭</button></div>
  </JournalModal>
}

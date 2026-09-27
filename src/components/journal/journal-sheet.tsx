'use client'
import React, { useEffect, useState } from 'react'
import { revisionForDate } from '@/lib/journal/validation'
import { trendSegments } from '@/lib/journal/aggregate'
import { defaultTrackerConfig } from '@/lib/journal/defaults'
import type { JournalCell as Cell, JournalEventView, JournalMonthView, TrackerView } from '@/lib/journal/types'
import { JournalCell } from './journal-cell'
import styles from './journal-sheet.module.css'

export const eventSourceLabel = { custom: '事件', progress: '进展', plan_due: '计划到期', action_due: '行动项到期', focus: '专注区间', schedule: '安排' }
export const eventStatusLabel = { planned: '计划', progress: '进行中', completed: '已完成' }
export function JournalSheet({ view, group, onCell, onTracker, onDate, onEvent, busy = false }: {
  view: JournalMonthView; group: string | null; onCell: (cell: Cell) => void; onTracker: (tracker: TrackerView) => void;
  onDate: (date: string) => void; onEvent: (event: JournalEventView) => void; busy?: boolean
}) {
  const [columnsPerPage, setColumnsPerPage] = useState<number | null>(null), [page, setPage] = useState(0)
  useEffect(() => {
    const media = window.matchMedia?.('(max-width: 736px)'), phone = window.matchMedia?.('(max-width: 400px)')
    if (!media || !phone) return
    const update = () => setColumnsPerPage(phone.matches ? 2 : media.matches ? 3 : null)
    update(); media.addEventListener('change', update); phone.addEventListener('change', update)
    return () => { media.removeEventListener('change', update); phone.removeEventListener('change', update) }
  }, [])
  useEffect(() => setPage(0), [group, view.month])
  const filtered = view.trackers.filter(tracker => group === null || tracker.group === group)
  const small = columnsPerPage !== null, limit = columnsPerPage ?? filtered.length
  const pages = small ? Math.max(1, Math.ceil(filtered.length / limit)) : 1, currentPage = Math.min(page, pages - 1)
  const trackers = small ? filtered.slice(currentPage * limit, currentPage * limit + limit) : filtered
  const laneCount = Math.min(3, Math.max(0, ...view.lanes.map(lane => lane.lane + 1)))
  const columns = `${trackers.length ? `repeat(${trackers.length},var(--tracker-size))` : ''} 44px minmax(220px,1fr) ${laneCount ? `repeat(${laneCount},92px)` : ''}`
  const css = { '--columns': columns, '--sheet-width': `${trackers.length * (small ? 72 : 84) + 264 + laneCount * 92}px` } as React.CSSProperties
  return <>
    {pages > 1 ? <div className={styles.pager}><button type="button" aria-label="上一组列" disabled={currentPage === 0} onClick={() => setPage(value => value - 1)}>←</button><span>列 {currentPage * limit + 1}–{Math.min(filtered.length, currentPage * limit + limit)} / {filtered.length}</span><button type="button" aria-label="下一组列" disabled={currentPage + 1 >= pages} onClick={() => setPage(value => value + 1)}>→</button></div> : null}
    <div className={styles.scroll} tabIndex={0} aria-label="月度手账，横向滚动查看事件和区间" aria-busy={busy}>
      <div className={styles.sheet} style={css}>
        <div className={`${styles.row} ${styles.head}`}>
          {trackers.map(tracker => {
            const revision = revisionForDate(tracker.revisions, view.dates[0]) ?? tracker.revisions[0]
            return <button key={tracker.tracker_id} type="button" className={styles.columnHead} aria-label={`设置 ${tracker.name}`} onClick={() => onTracker(tracker)} disabled={busy}>
              <i style={{ background: tracker.color }} /><strong>{tracker.name}</strong><small>{revision.config.unit || (tracker.kind === 'boolean' ? '每日打卡' : tracker.kind === 'enum' ? '每日状态' : '每日数据')}</small>
            </button>
          })}
          <span className={styles.dateHead}>日期</span><span className={styles.eventHead}>这个月发生了什么 <small>点击日期展开全部记录</small></span>
          {Array.from({ length: laneCount }, (_, index) => <span className={styles.laneHead} key={index}>{index === 0 ? '跨日区间' : ''}</span>)}
        </div>
        <div className={styles.body}>
          {view.dates.map(date => {
            const day = new Date(`${date}T00:00:00Z`), weekday = day.getUTCDay()
            const daily = view.events.filter(event => event.start_date === date && event.end_date === date)
            const overflow = view.lanes.filter(lane => lane.lane >= 3 && lane.start_date <= date && lane.end_date >= date).length
            return <div className={`${styles.row} ${weekday === 1 ? styles.weekStart : ''} ${date === view.today ? styles.today : ''} ${date > view.today ? styles.futureRow : ''}`} key={date}>
              {trackers.map(tracker => <JournalCell key={tracker.tracker_id} name={tracker.name} kind={tracker.kind} color={tracker.color}
                config={revisionForDate(tracker.revisions, date)?.config ?? defaultTrackerConfig(tracker.kind)} cell={view.cells[date][tracker.tracker_id]} onOpen={() => { if (!busy) onCell(view.cells[date][tracker.tracker_id]) }} />)}
              <button type="button" disabled={busy} className={`${styles.date} ${weekday === 0 || weekday === 6 ? styles.weekend : ''}`} aria-label={`${date} 当天详情`} onClick={() => onDate(date)}><b>{Number(date.slice(-2))}</b><small>{'日一二三四五六'[weekday]}</small></button>
              <div className={styles.dailyEvents}>
                {daily.slice(0, 2).map(event => <button key={event.event_id} type="button" disabled={busy} onClick={() => onEvent(event)} title={`${eventSourceLabel[event.source]} · ${eventStatusLabel[event.status]}`}><span className={event.status === 'completed' ? styles.doneMark : styles.plannedMark}>{event.status === 'completed' ? '✓' : '○'}</span><span>{event.title}</span>{event.source === 'schedule' ? <small>安排</small> : null}</button>)}
                {daily.length > 2 || overflow ? <button type="button" className={styles.more} disabled={busy} onClick={() => onDate(date)}>{daily.length > 2 ? `另 ${daily.length - 2} 条记录` : ''}{overflow ? ` · 另 ${overflow} 个区间` : ''}</button> : null}
              </div>
            </div>
          })}
          <div className={styles.overlays} style={{ gridTemplateColumns: columns, gridTemplateRows: `repeat(${view.dates.length},var(--row-size))` }}>
            {trackers.map((tracker, index) => {
              if (tracker.kind !== 'snapshot') return null
              const segments = trendSegments(view.dates.map(date => {
                const cell = view.cells[date][tracker.tracker_id]
                return revisionForDate(tracker.revisions, date)?.config.encoding === 'line' ? cell : { ...cell, state: 'missing' as const, value: null }
              }))
              const values = segments.flat().map(point => point.value)
              if (!values.length) return null
              const minimum = Math.min(...values), range = Math.max(1, Math.max(...values) - minimum)
              const x = (value: number) => 14 + (value - minimum) / range * 72
              const y = (date: string) => view.dates.indexOf(date) * 100 + 50
              return <svg key={tracker.tracker_id} aria-hidden="true" preserveAspectRatio="none" viewBox={`0 0 100 ${view.dates.length * 100}`} className={styles.trend} style={{ gridColumn: index + 1, gridRow: `1 / ${view.dates.length + 1}`, color: tracker.color }}>
                {segments.map((segment, part) => <g key={part}><polyline fill="none" stroke="currentColor" strokeWidth="1.3" vectorEffect="non-scaling-stroke" points={segment.map(point => `${x(point.value)},${y(point.date)}`).join(' ')} />{segment.map(point => <circle key={point.date} cx={x(point.value)} cy={y(point.date)} r="3.5" fill="currentColor" />)}</g>)}
              </svg>
            })}
            {view.lanes.filter(lane => lane.lane < 3).map(lane => <button type="button" key={lane.event_id} disabled={busy} className={`${styles.interval} ${lane.status === 'planned' ? styles.plannedInterval : ''}`}
              style={{ gridColumn: trackers.length + 3 + lane.lane, gridRow: `${view.dates.indexOf(lane.clipped_start) + 1} / ${view.dates.indexOf(lane.clipped_end) + 2}` }}
              aria-label={`${lane.title} ${lane.start_date} 至 ${lane.end_date}${lane.continues_before ? '，从上月延续' : ''}${lane.continues_after ? '，延续到下月' : ''}`} onClick={() => onEvent(lane)}>
              <span>{lane.continues_before ? '↑ ' : ''}{lane.title}</span><small>{eventStatusLabel[lane.status]}{lane.continues_after ? ' ↓' : ''}</small>
            </button>)}
          </div>
        </div>
      </div>
    </div>
  </>
}

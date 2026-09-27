'use client'
import React from 'react'
import type { JournalCell as Cell, TrackerConfig, TrackerKind } from '@/lib/journal/types'
import styles from './journal-sheet.module.css'

export function cellDescription(kind: TrackerKind, config: TrackerConfig, cell: Cell) {
  if (cell.state !== 'recorded') return { missing: '未记录', skipped: '跳过', not_applicable: '不适用', future: '未来日期' }[cell.state]
  if (kind === 'boolean') return cell.value === true ? '已完成' : '未完成'
  if (kind === 'enum') return config.enum_options.find(option => option.id === cell.value)?.label ?? String(cell.value)
  return `${cell.value}${config.unit ? ` ${config.unit}` : ''}`
}
export function JournalCell({ name, kind, color, config, cell, onOpen }: {
  name: string; kind: TrackerKind; color: string; config: TrackerConfig; cell: Cell; onOpen: () => void
}) {
  const recorded = cell.state === 'recorded', option = config.enum_options.find(option => option.id === cell.value)
  const units = Number(config.units_per_cell), numeric = Number(cell.value)
  const blocks = recorded && config.encoding === 'blocks' && units > 0 ? Math.max(0, numeric / units) : 0
  const heat = recorded && config.encoding === 'heat' ? Math.max(.12, Math.min(.85, Math.abs(numeric) / (Number(config.maximum) || Math.max(1, Number(config.threshold) || units * 10)))) : recorded && config.encoding === 'fill' && (config.threshold !== null ? numeric >= Number(config.threshold) : numeric > 0) ? .55 : 0
  return <button type="button" className={`${styles.cell} ${cell.state === 'future' || cell.state === 'not_applicable' ? styles.mutedCell : ''}`}
    aria-label={`${cell.date} ${name}：${cellDescription(kind, config, cell)}`} title={`${cellDescription(kind, config, cell)}${cell.sources.length ? ` · ${cell.sources.length} 个来源` : ''}`}
    onClick={onOpen} style={{ '--ink': option?.color ?? color } as React.CSSProperties}>
    {recorded && kind === 'boolean' ? cell.value === true ? <span className={config.encoding === 'fill' ? styles.highlight : styles.symbol}>✓</span> : <span className={styles.falseValue}>×</span> : null}
    {recorded && kind === 'enum' ? <span className={styles.enumValue}>{option?.symbol || option?.label || cell.value}</span> : null}
    {recorded && (kind === 'quantity' || kind === 'snapshot') ? <>
      {config.encoding === 'blocks' ? <span className={styles.blocks} aria-hidden="true">{Array.from({ length: Math.min(6, Math.ceil(blocks)) }, (_, index) => <i key={index} style={{ background: `linear-gradient(to right, var(--ink) ${Math.min(1, blocks - index) * 100}%, transparent 0)` }} />)}{blocks > 6 ? <small>+</small> : null}</span> : null}
      {heat > 0 ? <span aria-hidden="true" className={styles.heat} style={{ opacity: heat }} /> : null}
      <span className={styles.number}>{cell.value}</span>
    </> : null}
    {cell.state === 'skipped' ? <span>—</span> : null}
    {cell.state === 'not_applicable' ? <span className={styles.placeholder}>·</span> : null}
  </button>
}

'use client'
import React, { useEffect, useState } from 'react'
import { defaultTrackerConfig } from '@/lib/journal/defaults'
import { shiftJournalMonth } from '@/lib/journal/date'
import { journalRequest, notifyJournalChanged } from '@/lib/journal/client'
import type { TrackerConfig, TrackerKind, TrackerView } from '@/lib/journal/types'
import { JournalModal, WriteError, editorStyles as s, useAssociations, useWriteState } from './editor-shared'

const kinds: Record<TrackerKind, string> = { boolean: '是否完成', quantity: '每日数量 / 时长', snapshot: '存量快照', enum: '分类 / 心情' }
const encodings = { boolean: ['fill', 'symbol'], quantity: ['number', 'blocks', 'heat', 'fill'], snapshot: ['line', 'number', 'heat'], enum: ['symbol', 'fill'] } as const
const encodingNames = { fill: '填色', symbol: '符号', number: '数字', blocks: '小格', heat: '深浅 + 数字', line: '折线 + 数字' }
export function TrackerEditor({ tracker, today, onClose, onSaved }: { tracker: TrackerView | null; today: string; onClose: () => void; onSaved: () => void }) {
  const latest = tracker?.revisions.at(-1), nextMonth = `${shiftJournalMonth(today.slice(0, 7), 1)}-01`
  const [tab, setTab] = useState<'display' | 'revise'>('display'), [name, setName] = useState(tracker?.name ?? ''), [group, setGroup] = useState(tracker?.group ?? '生活')
  const [color, setColor] = useState(tracker?.color ?? '#b6d99d'), [kind, setKind] = useState<TrackerKind>(tracker?.kind ?? 'boolean')
  const [config, setConfig] = useState<TrackerConfig>(latest?.config ?? defaultTrackerConfig('boolean'))
  const [planId, setPlanId] = useState(latest?.plan_id ?? ''), [goalId, setGoalId] = useState(latest?.goal_id ?? '')
  const [effective, setEffective] = useState(latest && latest.effective_from >= nextMonth ? `${shiftJournalMonth(latest.effective_from.slice(0, 7), 1)}-01` : nextMonth)
  const [enabled, setEnabled] = useState(`${today.slice(0, 7)}-01`), [baseVersion, setBaseVersion] = useState(tracker?.version ?? 0)
  const [ordered, setOrdered] = useState<TrackerView[]>([]), [archiveConfirm, setArchiveConfirm] = useState(false)
  const associations = useAssociations(), write = useWriteState(), semantic = !tracker || tab === 'revise'
  useEffect(() => {
    const controller = new AbortController()
    if (tracker) void journalRequest<{ list: TrackerView[] }>('/api/journal/trackers', { signal: controller.signal }).then(data => setOrdered(data.list.filter(item => !item.archived_from || item.archived_from > today))).catch(() => {})
    return () => controller.abort()
  }, [tracker, today])
  const change = <K extends keyof TrackerConfig>(key: K, value: TrackerConfig[K]) => setConfig(prior => ({ ...prior, [key]: value }))
  const finish = () => { notifyJournalChanged({ entity: 'journal' }); onSaved() }
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    await write.write(async () => {
      const payload = !tracker ? { name, group, color, kind, enabled_from: enabled, plan_id: planId || null, goal_id: goalId || null, config }
        : tab === 'display' ? { action: 'display', tracker_id: tracker.tracker_id, expected_version: baseVersion, name, group, color }
          : { action: 'revise', tracker_id: tracker.tracker_id, expected_version: baseVersion, effective_from: effective, plan_id: planId || null, goal_id: goalId || null, config }
      await journalRequest('/api/journal/trackers', { method: tracker ? 'PUT' : 'POST', body: JSON.stringify(payload) }); finish()
    })
  }
  const reload = () => void write.write(async () => {
    const data = await journalRequest<{ list: TrackerView[] }>('/api/journal/trackers')
    const current = data.list.find(item => item.tracker_id === tracker?.tracker_id)
    if (!current) throw new Error('列已不存在')
    setBaseVersion(current.version); setOrdered(data.list.filter(item => !item.archived_from || item.archived_from > today)); write.setError('已读取最新版本，当前输入仍保留，请确认后保存。')
  })
  async function move(delta: number) {
    if (!tracker) return
    await write.write(async () => {
      const items = [...ordered], index = items.findIndex(item => item.tracker_id === tracker.tracker_id), target = index + delta
      if (index < 0 || target < 0 || target >= items.length) return
      ;[items[index], items[target]] = [items[target], items[index]]
      await journalRequest('/api/journal/trackers', { method: 'PUT', body: JSON.stringify({ action: 'reorder', ids: items.map(item => item.tracker_id), expected_versions: Object.fromEntries(items.map(item => [item.tracker_id, item.version])) }) }); finish()
    })
  }
  return <JournalModal title={tracker ? `设置 ${tracker.name}` : '添加追踪列'} onClose={onClose} busy={write.busy}>
    {tracker ? <div className={s.tabs}><button type="button" className={tab === 'display' ? s.active : ''} onClick={() => setTab('display')} disabled={write.busy}>名称与显示</button><button type="button" className={tab === 'revise' ? s.active : ''} onClick={() => setTab('revise')} disabled={write.busy}>来源与口径</button></div> : null}
    <form className={s.form} onSubmit={submit}>
      <fieldset disabled={write.busy || !!tracker?.archived_from} className={s.form}>
        {!tracker || tab === 'display' ? <>
          <label>列名称<input aria-label="列名称" value={name} onChange={event => setName(event.target.value)} required maxLength={80} placeholder="如：运动、播放量、粉丝数、心情" /></label>
          <div className={s.grid}><label>分组<input aria-label="分组" value={group} onChange={event => setGroup(event.target.value)} required maxLength={40} /></label><label>颜色<input type="color" aria-label="颜色" value={color} onChange={event => setColor(event.target.value)} /></label></div>
        </> : null}
        {semantic ? <>
          <div className={s.grid}><label>类型<select aria-label="类型" value={kind} disabled={!!tracker} onChange={event => { const kind = event.target.value as TrackerKind; setKind(kind); setConfig(defaultTrackerConfig(kind)) }}>{Object.entries(kinds).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label>{tracker ? '新口径生效日期' : '启用日期'}<input type="date" aria-label={tracker ? '新口径生效日期' : '启用日期'} value={tracker ? effective : enabled} min={tracker ? nextMonth : undefined} onChange={event => tracker ? setEffective(event.target.value) : setEnabled(event.target.value)} required /></label></div>
          {tracker ? <p className={s.hint}>新口径从未来日期生效，历史记录保留原口径。需要更换值类型时，请新建一列。</p> : null}
          <label>数据来源<select aria-label="数据来源" value={config.source} onChange={event => { change('source', event.target.value as TrackerConfig['source']); change('sync_completion', false) }}><option value="manual">手动填写</option>{kind === 'boolean' || kind === 'quantity' ? <option value="plan">读取计划完成记录</option> : null}<option value="progress_field">读取进展中的结构化字段</option></select></label>
          <div className={s.grid}><label>关联计划<select aria-label="关联计划" value={planId} onChange={event => { setPlanId(event.target.value); if (!event.target.value) change('sync_completion', false) }} required={config.source === 'plan'}><option value="">不绑定计划</option>{associations.plans.map(plan => <option key={plan.plan_id} value={plan.plan_id}>{plan.name}</option>)}</select></label><label>关联目标<select aria-label="关联目标" value={goalId} onChange={event => setGoalId(event.target.value)}><option value="">不绑定目标</option>{associations.goals.map(goal => <option key={goal.goal_id} value={goal.goal_id}>{goal.name}</option>)}</select></label></div>
          {associations.error ? <p role="alert" className={s.error}>{associations.error}</p> : null}
          {config.source === 'progress_field' ? <p className={s.info}>填写进展时会出现此字段；同一条原记录修改后，手账同步更新。{!planId ? '未绑定时可在任意计划的进展中填写。' : ''}</p> : config.source === 'plan' ? <p className={s.info}>只读取已完成的进展，安排和普通文字不自动算作完成。数量类型显示当天完成次数。</p> : null}
          <div className={s.grid}><label>单位<input aria-label="单位" value={config.unit} onChange={event => change('unit', event.target.value)} maxLength={24} placeholder="次 / 分钟 / 人 / 件" /></label><label>显示方式<select aria-label="显示方式" value={config.encoding} onChange={event => change('encoding', event.target.value as TrackerConfig['encoding'])}>{encodings[kind].map(value => <option value={value} key={value}>{encodingNames[value]}</option>)}</select></label></div>
          {kind === 'quantity' || kind === 'snapshot' ? <>
            <div className={s.grid}><label>每小格代表<input inputMode="decimal" aria-label="每小格代表" value={config.units_per_cell} onChange={event => change('units_per_cell', event.target.value)} required /></label><label>当天多条记录<select aria-label="当天多条记录" value={config.daily_aggregation} onChange={event => change('daily_aggregation', event.target.value as 'sum' | 'last')}><option value="last">取最后值</option>{kind === 'quantity' ? <option value="sum">相加</option> : null}</select></label></div>
            <div className={s.grid}><label>最小值<input inputMode="decimal" aria-label="最小值" value={config.minimum ?? ''} onChange={event => change('minimum', event.target.value || null)} placeholder="不限制" /></label><label>最大值<input inputMode="decimal" aria-label="最大值" value={config.maximum ?? ''} onChange={event => change('maximum', event.target.value || null)} placeholder="不限制" /></label></div>
            {kind === 'quantity' ? <label>每日达标阈值<input aria-label="每日达标阈值" inputMode="decimal" value={config.threshold ?? ''} onChange={event => change('threshold', event.target.value || null)} placeholder="可选，例如 30 分钟" /></label> : <p className={s.hint}>快照显示最后值与相对月初基线的变化，不累计每天的存量。未记录日期不连线。</p>}
          </> : null}
          {kind === 'enum' ? <div className={s.form}><span className={s.hint}>分类选项，保存后用稳定标识关联历史值</span>{config.enum_options.map((option, index) => <div className={s.enumRow} key={option.id}>
            <label>名称<input aria-label={`分类 ${index + 1} 名称`} value={option.label} required onChange={event => change('enum_options', config.enum_options.map(item => item.id === option.id ? { ...item, label: event.target.value } : item))} /></label>
            <label>符号<input aria-label={`分类 ${index + 1} 符号`} value={option.symbol} onChange={event => change('enum_options', config.enum_options.map(item => item.id === option.id ? { ...item, symbol: event.target.value } : item))} /></label>
            <label>颜色<input type="color" aria-label={`分类 ${index + 1} 颜色`} value={option.color} onChange={event => change('enum_options', config.enum_options.map(item => item.id === option.id ? { ...item, color: event.target.value } : item))} /></label>
            <button type="button" aria-label={`移除分类 ${index + 1}`} onClick={() => change('enum_options', config.enum_options.filter(item => item.id !== option.id))}>×</button>
          </div>)}<button className={s.button} type="button" onClick={() => change('enum_options', [...config.enum_options, { id: crypto.randomUUID(), label: '新分类', symbol: '·', color }])}>添加分类</button></div> : null}
          <div><span className={s.hint}>适用星期（不选择表示每天）</span><div className={s.weekdays}>{[1, 2, 3, 4, 5, 6, 7].map(day => <label key={day}><input type="checkbox" checked={config.active_weekdays.includes(day)} onChange={event => change('active_weekdays', event.target.checked ? [...config.active_weekdays, day].sort() : config.active_weekdays.filter(item => item !== day))} />{'一二三四五六日'[day - 1]}</label>)}</div></div>
          {config.source === 'manual' && (kind === 'boolean' || kind === 'quantity') ? <label className={s.check}><input type="checkbox" checked={config.sync_completion} disabled={!planId} onChange={event => change('sync_completion', event.target.checked)} />达标时同步完成一次关联计划</label> : null}
          <p className={s.hint}>格子含义：{kind === 'boolean' ? '当天是否完成' : kind === 'enum' ? '当天选中的分类' : `${config.units_per_cell}${config.unit || '单位'} / 小格`}。{config.sync_completion ? '多个列关联同一天同一计划时，共用一条完成记录。' : ''}</p>
        </> : null}
      </fieldset>
      {tracker?.archived_from ? <p className={s.info}>此列已于 {tracker.archived_from} 归档，历史记录仍可查看。</p> : null}
      <WriteError error={write.error} conflict={write.conflict} onReload={reload} />
      <div className={s.footer}>
        {tracker && !tracker.archived_from ? <>
          <button type="button" className={s.danger} disabled={write.busy} onClick={() => archiveConfirm ? void write.write(async () => { await journalRequest('/api/journal/trackers', { method: 'PUT', body: JSON.stringify({ action: 'archive', tracker_id: tracker.tracker_id, expected_version: baseVersion, archived_from: today }) }); finish() }) : setArchiveConfirm(true)}>{archiveConfirm ? '确认从今天归档' : '归档'}</button>
          <button type="button" disabled={write.busy || ordered.findIndex(item => item.tracker_id === tracker.tracker_id) <= 0} onClick={() => void move(-1)}>上移</button><button type="button" disabled={write.busy || ordered.findIndex(item => item.tracker_id === tracker.tracker_id) >= ordered.length - 1} onClick={() => void move(1)}>下移</button>
        </> : null}
        <button type="button" disabled={write.busy} onClick={onClose}>关闭</button>{!tracker?.archived_from ? <button className={s.primary} disabled={write.busy} type="submit">{write.busy ? '正在保存…' : tracker ? tab === 'revise' ? '保存新口径' : '保存设置' : '创建列'}</button> : null}
      </div>
    </form>
  </JournalModal>
}

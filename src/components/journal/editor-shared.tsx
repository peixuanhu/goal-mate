'use client'
import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { useModalAccessibility } from '@/components/today/use-modal-accessibility'
import { journalRequest, JournalRequestError } from '@/lib/journal/client'
import styles from './editor.module.css'
export { styles as editorStyles }
export function JournalModal({ title, children, busy = false, onClose }: { title: string; children: React.ReactNode; busy?: boolean; onClose: () => void }) {
  const id = useId(), first = useRef<HTMLElement | null>(null)
  const { modalRef } = useModalAccessibility({ initialFocusRef: first, loading: busy, onClose })
  useLayoutEffect(() => { first.current = modalRef.current?.querySelector<HTMLElement>('input:not([disabled]),select:not([disabled]),textarea:not([disabled])') ?? null }, [modalRef])
  return <div className={styles.backdrop} onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose() }}>
    <section role="dialog" aria-modal="true" aria-labelledby={id} tabIndex={-1} ref={modalRef} className={styles.modal}>
      <header className={styles.header}><div><span>MONTHLY JOURNAL</span><h2 id={id}>{title}</h2></div><button type="button" aria-label="关闭" disabled={busy} onClick={onClose}>×</button></header>
      {children}
    </section>
  </div>
}
export function useWriteState() {
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [conflict, setConflict] = useState(false)
  const request = useRef<{ payload: string; id: string } | null>(null)
  const identity = (payload: unknown) => {
    const serialized = JSON.stringify(payload)
    if (request.current?.payload !== serialized) request.current = { payload: serialized, id: crypto.randomUUID() }
    return request.current.id
  }
  const write = async (run: () => Promise<void>) => {
    if (busy) return
    setBusy(true); setError(null); setConflict(false)
    try { await run() }
    catch (error) {
      const stale = error instanceof JournalRequestError && error.status === 409
      setConflict(stale)
      setError(stale ? `${error.message}。读取最新数据后再保存；当前输入已保留。` : `保存失败：${error instanceof Error ? error.message : '请重试'}。当前输入已保留。`)
    } finally { setBusy(false) }
  }
  return { busy, error, conflict, write, identity, setError, setConflict }
}
export type PlanChoice = { plan_id: string; name: string; is_recurring?: boolean }
export type GoalChoice = { goal_id: string; name: string }
export function useAssociations(enabled = true) {
  const [plans, setPlans] = useState<PlanChoice[]>([]), [goals, setGoals] = useState<GoalChoice[]>([]), [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    void Promise.all([journalRequest<{ list: PlanChoice[] }>('/api/plan?pageSize=1000', { signal: controller.signal }), journalRequest<{ list: GoalChoice[] }>('/api/goal?pageSize=1000', { signal: controller.signal })])
      .then(([plans, goals]) => { if (!controller.signal.aborted) { setPlans(plans.list); setGoals(goals.list) } })
      .catch(() => { if (!controller.signal.aborted) setError('关联列表加载失败，请关闭后重试') })
    return () => controller.abort()
  }, [enabled])
  return { plans, goals, error }
}
export function WriteError({ error, conflict, onReload }: { error: string | null; conflict: boolean; onReload?: () => void }) {
  return error ? <div role="alert" className={styles.error}>{error}{conflict && onReload ? <button type="button" onClick={onReload}>读取最新数据</button> : null}</div> : null
}
export function OriginalLink({ planId, recordId, date, source }: { planId: string | null; recordId?: number | null; date?: string; source?: string }) {
  const href = recordId ? `/progress?${new URLSearchParams({ ...(planId ? { plan_id: planId } : {}), record_id: String(recordId) })}` : source === 'schedule' || source === 'focus' ? `/?date=${date}` : planId ? `/plans?highlight=${encodeURIComponent(planId)}` : '/plans'
  return <a href={href} className={styles.link}>{recordId ? '编辑原进展记录 ↗' : source === 'focus' || source === 'schedule' ? '在今日工作台查看 ↗' : '查看关联计划 ↗'}</a>
}

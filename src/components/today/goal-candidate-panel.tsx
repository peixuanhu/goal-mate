"use client"

import { CalendarClock, CircleDot, Flag, Layers3 } from "lucide-react"
import React, { useId } from "react"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { QuadrantId, SchedulableCandidate, TodayView } from "@/lib/today/types"

interface GoalCandidatePanelProps {
  focus: TodayView["focus"]
  candidates: SchedulableCandidate[]
  loading: boolean
  error: string | null
}

interface CandidateGroup {
  key: string
  name: string
  candidates: SchedulableCandidate[]
  focused: boolean
}

interface PlanCandidateGroup {
  planId: string
  actions: SchedulableCandidate[]
  plan: SchedulableCandidate | null
}

export const FOCUS_GROUP_KEY = "__focus__"

export const QUADRANT_LABELS: Record<QuadrantId, string> = {
  q1: "重要且紧急",
  q2: "重要不紧急",
  q3: "紧急不重要",
  q4: "不重要不紧急",
}

function groupByPlan(candidates: SchedulableCandidate[]): PlanCandidateGroup[] {
  const groups = new Map<string, PlanCandidateGroup>()

  for (const candidate of candidates) {
    const group = groups.get(candidate.plan_id) ?? {
      planId: candidate.plan_id,
      actions: [],
      plan: null,
    }

    if (candidate.kind === "action") {
      group.actions.push(candidate)
    } else {
      group.plan = candidate
    }
    groups.set(candidate.plan_id, group)
  }

  return [...groups.values()]
}

function buildGoalGroups(
  candidates: SchedulableCandidate[],
  focus: TodayView["focus"],
): CandidateGroup[] {
  const grouped = new Map<string, CandidateGroup>()

  for (const candidate of candidates) {
    const groupKey = candidate.goal_id ?? "__unassigned__"
    const focused = candidate.goal_id !== null && candidate.goal_id === focus?.goal_id
    const key = focused ? FOCUS_GROUP_KEY : groupKey
    const group = grouped.get(key) ?? {
      key,
      name: candidate.goal_name ?? "未关联目标",
      candidates: [],
      focused,
    }
    group.candidates.push(candidate)
    grouped.set(key, group)
  }

  return [...grouped.values()].sort((left, right) => {
    if (left.focused !== right.focused) return left.focused ? -1 : 1
    return left.name.localeCompare(right.name, "zh-CN")
  })
}

function CandidateCard({ candidate }: { candidate: SchedulableCandidate }) {
  const isAction = candidate.kind === "action"

  return (
    <article className="rounded-xl border border-gray-200 bg-white p-3 shadow-xs">
      <div className="flex items-start gap-2.5">
        <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${isAction ? "bg-rose-50 text-rose-500" : "bg-indigo-50 text-indigo-500"}`}>
          {isAction ? <CircleDot aria-hidden="true" className="h-3.5 w-3.5" /> : <Layers3 aria-hidden="true" className="h-3.5 w-3.5" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 text-sm font-medium leading-5 text-gray-800">{candidate.name}</p>
            <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">
              {isAction ? "行动项" : "计划"}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-400">
            <span className="inline-flex items-center gap-1">
              <CalendarClock aria-hidden="true" className="h-3 w-3" />
              预计 {candidate.estimated_minutes ?? "—"} 分钟
            </span>
            {candidate.goal_name ? <span className="truncate">{candidate.goal_name}</span> : null}
            {candidate.due_date ? <time dateTime={candidate.due_date}>截止 {candidate.due_date}</time> : null}
          </div>
        </div>
      </div>
      {!isAction ? (
        <button
          className="mt-3 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs font-medium text-gray-400"
          disabled
          title="排程功能将在下一阶段开放"
          type="button"
        >
          直接安排计划
        </button>
      ) : null}
    </article>
  )
}

function EmptyCandidates() {
  return (
    <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">
      暂无可安排事项
    </div>
  )
}

function PlanGroups({
  candidates,
  planNamesById,
}: {
  candidates: SchedulableCandidate[]
  planNamesById: ReadonlyMap<string, string>
}) {
  const idPrefix = useId().replace(/[^A-Za-z0-9_-]/g, "") || "plan-group"

  if (candidates.length === 0) return <EmptyCandidates />

  return (
    <div className="space-y-3">
      {groupByPlan(candidates).map((group, index) => {
        const planName = group.plan?.name ?? planNamesById.get(group.planId) ?? `计划 ${group.planId}`
        const headingId = `${idPrefix}-plan-${index}`

        return (
          <section
            aria-labelledby={headingId}
            className="rounded-xl border border-gray-100 bg-gray-50/60 p-2"
            key={group.planId}
          >
            <div className="mb-2 flex items-center justify-between gap-2 px-1">
              <h4 className="truncate text-xs font-semibold text-gray-600" id={headingId}>{planName}</h4>
              {group.actions.length > 0 ? (
                <span className="shrink-0 text-[10px] text-gray-400">{group.actions.length} 个行动项</span>
              ) : null}
            </div>
            <ul aria-label={`${planName}的行动项`} className="space-y-2">
              {group.actions.map(action => (
                <li key={action.id}><CandidateCard candidate={action} /></li>
              ))}
            </ul>
            {group.plan ? (
              <div className={group.actions.length > 0 ? "mt-2" : undefined}>
                <CandidateCard candidate={group.plan} />
              </div>
            ) : null}
          </section>
        )
      })}
    </div>
  )
}

function GoalTree({
  candidates,
  focus,
  planNamesById,
}: Pick<GoalCandidatePanelProps, "candidates" | "focus"> & {
  planNamesById: ReadonlyMap<string, string>
}) {
  const groups = buildGoalGroups(candidates, focus)
  if (groups.length === 0) return <EmptyCandidates />

  return (
    <div className="space-y-5">
      {groups.map(group => (
        <section aria-labelledby={`goal-group-${group.key}`} key={group.key}>
          <div className="mb-2 flex items-center gap-2">
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: group.focused ? focus?.color ?? "#7c3aed" : "#d1d5db" }}
            />
            <h3 id={`goal-group-${group.key}`} className="truncate text-sm font-semibold text-gray-800">
              {group.name}
            </h3>
            {group.focused ? (
              <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-medium text-violet-600">
                <Flag aria-hidden="true" className="h-3 w-3" />
                当前聚焦
              </span>
            ) : null}
          </div>
          <PlanGroups candidates={group.candidates} planNamesById={planNamesById} />
        </section>
      ))}
    </div>
  )
}

export function GoalCandidatePanel({ focus, candidates, loading, error }: GoalCandidatePanelProps) {
  const planNamesById = new Map(
    candidates
      .filter(candidate => candidate.kind === "plan")
      .map(candidate => [candidate.plan_id, candidate.name] as const),
  )
  const inboxCandidates = candidates.filter(
    candidate => candidate.goal_id === null && candidate.effective_quadrant === null,
  )

  return (
    <aside
      aria-labelledby="candidate-panel-heading"
      className="flex h-full min-h-[620px] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm"
    >
      <div className="border-b border-gray-100 px-4 py-4">
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-gray-400">待安排</p>
        <h2 id="candidate-panel-heading" className="mt-0.5 text-base font-semibold text-gray-900">目标与候选事项</h2>
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center p-6 text-sm text-gray-500" role="status">
          正在加载候选事项…
        </div>
      ) : error ? (
        <div className="m-4 rounded-xl border border-red-100 bg-red-50 p-4" role="alert">
          <p className="text-sm font-medium text-red-700">候选事项加载失败</p>
          <p className="mt-1 text-xs leading-5 text-red-600">{error}</p>
        </div>
      ) : (
        <Tabs className="min-h-0 flex-1 gap-0" defaultValue="goal-tree">
          <div className="border-b border-gray-100 px-3 py-3">
            <TabsList aria-label="候选事项分组方式" className="grid w-full grid-cols-3 bg-gray-100">
              <TabsTrigger value="goal-tree">目标树</TabsTrigger>
              <TabsTrigger value="quadrant">四象限</TabsTrigger>
              <TabsTrigger value="inbox">收集箱</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent className="m-0 min-h-0 flex-1 overflow-y-auto p-3" value="goal-tree">
            <GoalTree candidates={candidates} focus={focus} planNamesById={planNamesById} />
          </TabsContent>

          <TabsContent className="m-0 min-h-0 flex-1 overflow-y-auto p-3" value="quadrant">
            <div className="space-y-5">
              {(Object.keys(QUADRANT_LABELS) as QuadrantId[]).map(quadrant => {
                const quadrantCandidates = candidates.filter(candidate => candidate.effective_quadrant === quadrant)
                return (
                  <section aria-labelledby={`quadrant-${quadrant}`} key={quadrant}>
                    <h3 id={`quadrant-${quadrant}`} className="mb-2 text-sm font-semibold text-gray-700">
                      {QUADRANT_LABELS[quadrant]}
                    </h3>
                    <PlanGroups candidates={quadrantCandidates} planNamesById={planNamesById} />
                  </section>
                )
              })}
            </div>
          </TabsContent>

          <TabsContent className="m-0 min-h-0 flex-1 overflow-y-auto p-3" value="inbox">
            <PlanGroups candidates={inboxCandidates} planNamesById={planNamesById} />
          </TabsContent>
        </Tabs>
      )}
    </aside>
  )
}

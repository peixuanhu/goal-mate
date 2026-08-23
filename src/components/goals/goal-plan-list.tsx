"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { ChevronDown, ChevronRight, GripVertical, Plus, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { getRecurringTaskDetails, getRecurrenceTypeDisplay } from "@/lib/recurring-utils"
import { cn, refreshQuadrantSidebar } from "@/lib/utils"

type GoalPlan = {
  plan_id: string
  name: string
  difficulty?: string | null
  progress: number
  is_recurring: boolean
  recurrence_type?: string | null
  recurrence_value?: string | null
  tags: string[]
  progressRecords?: Array<{
    gmt_create: string | Date
    counts_toward_recurrence?: boolean
  }>
}

type GoalPlanListProps = {
  goalId: string
}

type QuadrantId = "q1" | "q2" | "q3" | "q4"

const QUADRANT_IDS: QuadrantId[] = ["q1", "q2", "q3", "q4"]

async function readApiError(response: Response, fallback: string): Promise<string> {
  try {
    const data = await response.json() as { error?: string; message?: string }
    return data.error ?? data.message ?? fallback
  } catch {
    return fallback
  }
}

export function formatGoalPlanProgress(plan: GoalPlan): string {
  if (plan.is_recurring) {
    const details = getRecurringTaskDetails({
      ...plan,
      recurrence_type: plan.recurrence_type ?? undefined,
      recurrence_value: plan.recurrence_value ?? undefined,
      progressRecords: (plan.progressRecords ?? []).map(record => ({
        gmt_create: new Date(record.gmt_create),
        counts_toward_recurrence: record.counts_toward_recurrence,
      })),
    })
    return details ? `${details.progressText} ${details.statusText}` : getRecurrenceTypeDisplay(plan.recurrence_type || "")
  }

  return `${Math.round((plan.progress || 0) * 100)}%`
}

function formatRecentProgress(plan: GoalPlan): string {
  const firstRecord = plan.progressRecords?.[0]
  if (!firstRecord) return "暂无进展"

  return new Date(firstRecord.gmt_create).toLocaleDateString("zh-CN")
}

function isFullyCompletedPlan(plan: GoalPlan): boolean {
  return !plan.is_recurring && (plan.progress || 0) >= 1
}

function isQuadrantId(value: string | null): value is QuadrantId {
  return QUADRANT_IDS.includes(value as QuadrantId)
}

function getEventPoint(event: Event): { x: number; y: number } | null {
  if (event instanceof MouseEvent) {
    return { x: event.clientX, y: event.clientY }
  }

  if (typeof TouchEvent !== "undefined" && event instanceof TouchEvent) {
    const touch = event.touches[0] ?? event.changedTouches[0]
    return touch ? { x: touch.clientX, y: touch.clientY } : null
  }

  return null
}

function getQuadrantDropTarget(event: DragEndEvent): QuadrantId | null {
  if (typeof document === "undefined") return null

  const startPoint = getEventPoint(event.activatorEvent)
  if (!startPoint) return null

  const x = startPoint.x + event.delta.x
  const y = startPoint.y + event.delta.y

  for (const element of document.elementsFromPoint(x, y)) {
    const target = element.closest("[data-quadrant-drop-id]")
    const quadrantId = target?.getAttribute("data-quadrant-drop-id") ?? null
    if (isQuadrantId(quadrantId)) return quadrantId
  }

  return null
}

function getDifficultyClass(difficulty?: string | null): string {
  switch (difficulty) {
    case "hard":
    case "high":
      return "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
    case "medium":
      return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"
    case "easy":
    case "low":
      return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"
    default:
      return "border-gray-200 bg-gray-100 text-gray-700 dark:border-gray-800 dark:bg-gray-800 dark:text-gray-200"
  }
}

function SortablePlanRow({
  plan,
  index,
  disabled,
  completed = false,
  onDetach,
  onOpenPlan,
}: {
  plan: GoalPlan
  index: number
  disabled: boolean
  completed?: boolean
  onDetach: (planId: string) => void
  onOpenPlan: (planId: string) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: plan.plan_id, disabled })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "grid grid-cols-[32px_64px_minmax(180px,320px)_72px_150px_100px_72px] items-center justify-start gap-3 border-b px-3 py-2 text-sm last:border-b-0",
        isDragging ? "bg-blue-50 opacity-80" : "bg-white dark:bg-gray-950",
        completed && "bg-gray-50 text-gray-400 dark:bg-gray-900"
      )}
    >
      <button
        type="button"
        disabled={disabled || completed}
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded border text-gray-500 hover:bg-gray-50",
          completed && "cursor-not-allowed text-gray-300 hover:bg-transparent"
        )}
        aria-label={`拖拽排序 ${plan.name}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <span className={cn("font-medium text-gray-700 dark:text-gray-200", completed && "text-gray-400 dark:text-gray-500")}>第 {index + 1} 步</span>
      <div className="min-w-0">
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "block w-full min-w-0 truncate rounded text-left font-medium text-blue-700 hover:text-blue-800 hover:underline focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:pointer-events-none disabled:text-gray-500 disabled:no-underline dark:text-blue-300 dark:hover:text-blue-200",
            completed && "text-gray-400 line-through hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-400"
          )}
          onClick={() => onOpenPlan(plan.plan_id)}
          aria-label={`打开计划 ${plan.name}`}
        >
          {plan.name}
        </button>
        <div className="mt-1 flex flex-wrap gap-1">
          {plan.tags.slice(0, 3).map(tag => (
            <span key={tag} className={cn("rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-700", completed && "bg-gray-100 text-gray-400")}>
              {tag}
            </span>
          ))}
        </div>
      </div>
      <span className={cn(
        "inline-flex justify-self-start rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        getDifficultyClass(plan.difficulty),
        completed && "border-gray-200 bg-gray-100 text-gray-400 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-500"
      )}>
        {plan.difficulty || "未设置"}
      </span>
      <span className={cn("whitespace-nowrap text-gray-700 dark:text-gray-200", completed && "text-gray-400 dark:text-gray-500")}>{formatGoalPlanProgress(plan)}</span>
      <span className={cn("whitespace-nowrap text-gray-500", completed && "text-gray-400 dark:text-gray-500")}>{formatRecentProgress(plan)}</span>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-8 justify-self-start px-2 text-xs"
        disabled={disabled}
        onClick={() => onDetach(plan.plan_id)}
        aria-label={`移除关联计划 ${plan.name}`}
      >
        <X className="h-4 w-4" />
        移除
      </Button>
    </div>
  )
}

export function GoalPlanList({ goalId }: GoalPlanListProps) {
  const router = useRouter()
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )
  const [plans, setPlans] = React.useState<GoalPlan[]>([])
  const [unassignedPlans, setUnassignedPlans] = React.useState<GoalPlan[]>([])
  const [selectedPlanId, setSelectedPlanId] = React.useState("")
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [completedPlansOpen, setCompletedPlansOpen] = React.useState(false)
  const savingRef = React.useRef(false)

  const loadPlans = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [goalPlansResponse, unassignedResponse] = await Promise.all([
        fetch(`/api/plan?goal_id=${encodeURIComponent(goalId)}&pageSize=1000`),
        fetch("/api/plan?unassigned=true&pageSize=1000"),
      ])
      if (!goalPlansResponse.ok) {
        throw new Error(await readApiError(goalPlansResponse, "关联计划加载失败"))
      }
      if (!unassignedResponse.ok) {
        throw new Error(await readApiError(unassignedResponse, "未归属计划加载失败"))
      }
      const goalPlansData = await goalPlansResponse.json() as { list?: GoalPlan[] }
      const unassignedData = await unassignedResponse.json() as { list?: GoalPlan[] }
      setPlans(goalPlansData.list ?? [])
      setUnassignedPlans(unassignedData.list ?? [])
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "计划加载失败")
    } finally {
      setLoading(false)
    }
  }, [goalId])

  const refreshUnassignedPlans = React.useCallback(async () => {
    const response = await fetch("/api/plan?unassigned=true&pageSize=1000")
    if (!response.ok) {
      throw new Error(await readApiError(response, "未归属计划加载失败"))
    }

    const data = await response.json() as { list?: GoalPlan[] }
    const nextUnassignedPlans = data.list ?? []
    setUnassignedPlans(nextUnassignedPlans)
    return nextUnassignedPlans
  }, [])

  React.useEffect(() => {
    void loadPlans()
  }, [loadPlans])

  async function saveOrder(nextPlans: GoalPlan[], previousPlans: GoalPlan[]) {
    savingRef.current = true
    setSaving(true)
    setError(null)
    try {
      const response = await fetch("/api/plan/order", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goal_id: goalId,
          ordered_plan_ids: nextPlans.map(plan => plan.plan_id),
        }),
      })
      if (!response.ok) {
        throw new Error(await readApiError(response, "排序保存失败"))
      }
      const data = await response.json() as { list?: GoalPlan[] }
      setPlans(data.list ?? nextPlans)
    } catch (saveError) {
      setPlans(previousPlans)
      setError(saveError instanceof Error ? saveError.message : "排序保存失败")
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  async function schedulePlanToQuadrant(planId: string, targetQuadrant: QuadrantId) {
    savingRef.current = true
    setSaving(true)
    setError(null)
    try {
      const response = await fetch("/api/plan/priority", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan_id: planId,
          priority_quadrant: targetQuadrant,
          is_scheduled: true,
        }),
      })
      if (!response.ok) {
        throw new Error(await readApiError(response, "安排到四象限失败"))
      }
      refreshQuadrantSidebar()
    } catch (scheduleError) {
      setError(scheduleError instanceof Error ? scheduleError.message : "安排到四象限失败")
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    if (savingRef.current) return

    const { active, over } = event
    const planId = active.id as string
    const quadrantDropTarget = getQuadrantDropTarget(event)
    if (quadrantDropTarget) {
      void schedulePlanToQuadrant(planId, quadrantDropTarget)
      return
    }

    if (!over || active.id === over.id) return

    const oldIndex = plans.findIndex(plan => plan.plan_id === active.id)
    const newIndex = plans.findIndex(plan => plan.plan_id === over.id)
    if (oldIndex < 0 || newIndex < 0) return

    const previousPlans = plans
    const nextPlans = arrayMove(plans, oldIndex, newIndex)
    setPlans(nextPlans)
    void saveOrder(nextPlans, previousPlans)
  }

  async function attachSelectedPlan() {
    if (!selectedPlanId || savingRef.current) return
    const attachedPlanId = selectedPlanId
    savingRef.current = true
    setSaving(true)
    setError(null)
    try {
      const latestUnassignedPlans = await refreshUnassignedPlans()
      const selectedPlanStillUnassigned = latestUnassignedPlans.some(plan => plan.plan_id === attachedPlanId)
      if (!selectedPlanStillUnassigned) {
        setSelectedPlanId("")
        throw new Error("该计划已被关联到其他目标，请重新选择")
      }

      const response = await fetch("/api/plan", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan_id: attachedPlanId, goal_id: goalId, expected_goal_id: null }),
      })
      if (!response.ok) {
        throw new Error(await readApiError(response, "添加已有计划失败"))
      }
      setUnassignedPlans(current => current.filter(plan => plan.plan_id !== attachedPlanId))
      setSelectedPlanId("")
      await loadPlans()
    } catch (attachError) {
      setError(attachError instanceof Error ? attachError.message : "添加已有计划失败")
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  async function detachPlan(planId: string) {
    if (savingRef.current) return
    const previousPlans = plans
    savingRef.current = true
    setSaving(true)
    setError(null)
    setPlans(current => current.filter(plan => plan.plan_id !== planId))
    try {
      const response = await fetch("/api/plan", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan_id: planId, goal_id: null, expected_goal_id: goalId }),
      })
      if (!response.ok) {
        throw new Error(await readApiError(response, "移除关联计划失败"))
      }
      await loadPlans()
    } catch (detachError) {
      setPlans(previousPlans)
      setError(detachError instanceof Error ? detachError.message : "移除关联计划失败")
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  function openPlan(planId: string) {
    router.push(`/plans?goal_id=${encodeURIComponent(goalId)}&highlight=${encodeURIComponent(planId)}`)
  }

  const activePlans = plans.filter(plan => !isFullyCompletedPlan(plan))
  const completedPlans = plans.filter(isFullyCompletedPlan)
  const visiblePlans = completedPlansOpen ? [...activePlans, ...completedPlans] : activePlans

  return (
    <div className="rounded-lg border bg-gray-50 p-3 dark:bg-gray-900">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="shrink-0 text-sm font-medium text-gray-700 dark:text-gray-200">目标执行路线</div>
        <div className="ml-auto flex max-w-full flex-wrap items-center justify-end gap-2">
          <div className="w-[220px] shrink-0">
            <Select value={selectedPlanId} onValueChange={setSelectedPlanId}>
              <SelectTrigger className="h-8 w-full bg-white">
                <SelectValue placeholder="添加未归属计划" />
              </SelectTrigger>
              <SelectContent>
                {unassignedPlans.length === 0 ? (
                  <SelectItem value="none" disabled>暂无未归属计划</SelectItem>
                ) : unassignedPlans.map(plan => (
                  <SelectItem key={plan.plan_id} value={plan.plan_id}>{plan.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="button" size="sm" variant="outline" className="shrink-0" disabled={!selectedPlanId || saving} onClick={() => void attachSelectedPlan()}>
            添加已有
          </Button>
          <Button type="button" size="sm" className="shrink-0" onClick={() => router.push(`/plans?goal_id=${encodeURIComponent(goalId)}`)}>
            <Plus className="h-4 w-4" />
            新建计划
          </Button>
        </div>
      </div>

      {error ? (
        <div className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      ) : null}

      {loading ? (
        <div className="py-6 text-center text-sm text-gray-500">加载关联计划...</div>
      ) : plans.length === 0 ? (
        <div className="rounded border border-dashed bg-white py-6 text-center text-sm text-gray-500 dark:bg-gray-950">
          暂无关联计划
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={visiblePlans.map(plan => plan.plan_id)} strategy={verticalListSortingStrategy}>
            <div className="overflow-x-auto rounded border bg-white dark:bg-gray-950">
              <div className="min-w-[790px]">
                {activePlans.map(plan => (
                  <SortablePlanRow
                    key={plan.plan_id}
                    plan={plan}
                    index={plans.findIndex(currentPlan => currentPlan.plan_id === plan.plan_id)}
                    disabled={saving}
                    onDetach={detachPlan}
                    onOpenPlan={openPlan}
                  />
                ))}
                {completedPlans.length > 0 ? (
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 border-b bg-gray-50 px-3 py-2 text-left text-sm font-medium text-gray-500 hover:bg-gray-100 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800"
                    onClick={() => setCompletedPlansOpen(current => !current)}
                    aria-expanded={completedPlansOpen}
                  >
                    {completedPlansOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    已完成
                    <span className="text-xs font-normal text-gray-400">{completedPlans.length} 项</span>
                  </button>
                ) : null}
                {completedPlansOpen ? completedPlans.map(plan => (
                  <SortablePlanRow
                    key={plan.plan_id}
                    plan={plan}
                    index={plans.findIndex(currentPlan => currentPlan.plan_id === plan.plan_id)}
                    disabled={saving}
                    completed={isFullyCompletedPlan(plan)}
                    onDetach={detachPlan}
                    onOpenPlan={openPlan}
                  />
                )) : null}
              </div>
            </div>
          </SortableContext>
        </DndContext>
      )}

      {saving ? <div className="mt-2 text-xs text-gray-500">保存中...</div> : null}
    </div>
  )
}

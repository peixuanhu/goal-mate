"use client"

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  rectIntersection,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVertical, X } from "lucide-react"
import { useRouter } from "next/navigation"
import React, { useCallback, useEffect, useMemo, useState } from "react"

import { isPlanCompleted } from "@/lib/plan-completion"
import type { QuadrantId } from "@/lib/today/types"
import { cn } from "@/lib/utils"

export type QuadrantPlan = {
  plan_id: string
  name: string
  progress: number
  is_recurring: boolean
  recurrence_type: string | null
  recurrence_value: string | null
  tags: string[]
  progressRecords: Array<{
    gmt_create: string | Date
    counts_toward_recurrence?: boolean
  }>
}

type QuadrantData = Record<QuadrantId, QuadrantPlan[]>

const EMPTY_DATA: QuadrantData = { q1: [], q2: [], q3: [], q4: [] }

const QUADRANTS: Array<{
  id: QuadrantId
  title: string
  subtitle: string
  surface: string
  border: string
  accent: string
  count: string
}> = [
  { id: "q1", title: "重要且紧急", subtitle: "立即去做", surface: "bg-red-50", border: "border-red-200", accent: "bg-red-500", count: "bg-red-100 text-red-700" },
  { id: "q2", title: "重要不紧急", subtitle: "计划去做", surface: "bg-blue-50", border: "border-blue-200", accent: "bg-blue-500", count: "bg-blue-100 text-blue-700" },
  { id: "q3", title: "紧急不重要", subtitle: "授权去做", surface: "bg-amber-50", border: "border-amber-200", accent: "bg-amber-500", count: "bg-amber-100 text-amber-700" },
  { id: "q4", title: "不重要不紧急", subtitle: "稍后去做", surface: "bg-gray-50", border: "border-gray-200", accent: "bg-gray-500", count: "bg-gray-100 text-gray-700" },
]

function normalizeQuadrantData(value: unknown): QuadrantData {
  if (value === null || typeof value !== "object") return EMPTY_DATA
  const record = value as Partial<Record<QuadrantId, unknown>>
  return {
    q1: Array.isArray(record.q1) ? record.q1 as QuadrantPlan[] : [],
    q2: Array.isArray(record.q2) ? record.q2 as QuadrantPlan[] : [],
    q3: Array.isArray(record.q3) ? record.q3 as QuadrantPlan[] : [],
    q4: Array.isArray(record.q4) ? record.q4 as QuadrantPlan[] : [],
  }
}

function sortPlans(plans: QuadrantPlan[]): QuadrantPlan[] {
  return [...plans].sort((left, right) => {
    const leftDone = isPlanCompleted(left)
    const rightDone = isPlanCompleted(right)
    if (leftDone !== rightDone) return leftDone ? 1 : -1
    return left.name.localeCompare(right.name, "zh-CN")
  })
}

function QuadrantCard({
  overlay = false,
  plan,
  onOpen,
  onRemove,
}: {
  overlay?: boolean
  plan: QuadrantPlan
  onOpen: (planId: string) => void
  onRemove?: (planId: string) => void
}) {
  const { attributes, isDragging, listeners, setNodeRef, transform, transition } = useSortable({
    id: plan.plan_id,
    data: { plan },
    disabled: overlay,
  })
  const completed = isPlanCompleted(plan)

  return (
    <article
      className={cn(
        "group relative rounded-lg border border-gray-200 bg-white p-2 shadow-xs transition hover:border-indigo-200 hover:shadow-sm",
        isDragging && "opacity-50",
        overlay && "rotate-2 shadow-lg",
      )}
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <div className="flex items-start gap-1.5">
        <button
          aria-label={`拖动 ${plan.name}`}
          className="mt-0.5 flex h-6 w-6 shrink-0 cursor-grab items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          type="button"
          {...attributes}
          {...listeners}
        >
          <GripVertical aria-hidden="true" className="h-3.5 w-3.5" />
        </button>
        <button className="min-w-0 flex-1 text-left" onClick={() => onOpen(plan.plan_id)} type="button">
          <p className={cn("break-words text-xs font-medium leading-5 text-gray-800", completed && "text-gray-400 line-through")}>
            {plan.name}
          </p>
          {plan.tags.length > 0 ? (
            <div className="mt-1 flex flex-wrap gap-1">
              {plan.tags.slice(0, 2).map(tag => (
                <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500" key={tag}>{tag}</span>
              ))}
            </div>
          ) : null}
        </button>
        {onRemove ? (
          <button
            aria-label={`移出四象限 ${plan.name}`}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-gray-300 opacity-70 hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
            onClick={() => onRemove(plan.plan_id)}
            onPointerDown={event => event.stopPropagation()}
            type="button"
          >
            <X aria-hidden="true" className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
    </article>
  )
}

function QuadrantColumn({
  plans,
  quadrant,
  onDropPlan,
  onOpen,
  onRemove,
}: {
  plans: QuadrantPlan[]
  quadrant: typeof QUADRANTS[number]
  onDropPlan: (planId: string, quadrant: QuadrantId) => void
  onOpen: (planId: string) => void
  onRemove: (planId: string) => void
}) {
  const { isOver, setNodeRef } = useDroppable({ id: quadrant.id })
  const [nativeOver, setNativeOver] = useState(false)

  return (
    <section
      aria-label={quadrant.title}
      className={cn(
        "flex min-h-0 flex-col overflow-hidden rounded-xl border",
        quadrant.surface,
        quadrant.border,
        (isOver || nativeOver) && "ring-2 ring-indigo-400 ring-offset-1",
      )}
      data-quadrant-drop-id={quadrant.id}
      onDragLeave={() => setNativeOver(false)}
      onDragOver={event => {
        event.preventDefault()
        event.dataTransfer.dropEffect = "move"
        setNativeOver(true)
      }}
      onDrop={event => {
        event.preventDefault()
        setNativeOver(false)
        try {
          const data = JSON.parse(event.dataTransfer.getData("application/json")) as { plan_id?: string }
          if (data.plan_id) onDropPlan(data.plan_id, quadrant.id)
        } catch {
          // Ignore unrelated native drag payloads.
        }
      }}
      ref={setNodeRef}
      role="region"
    >
      <header className="shrink-0 border-b border-gray-200/60 px-2.5 py-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate text-xs font-semibold text-gray-800">{quadrant.title}</h3>
            <p className="mt-0.5 text-[10px] text-gray-500">{quadrant.subtitle}</p>
          </div>
          <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-medium", quadrant.count)}>{plans.length}</span>
        </div>
        <div className={cn("mt-1.5 h-0.5 rounded-full", quadrant.accent)} />
      </header>
      <div className="min-h-[120px] flex-1 space-y-1.5 overflow-y-auto p-1.5">
        <SortableContext items={plans.map(plan => plan.plan_id)} strategy={verticalListSortingStrategy}>
          {plans.length === 0 ? (
            <div className="grid h-full min-h-20 place-items-center text-[10px] text-gray-400">暂无计划</div>
          ) : plans.map(plan => (
            <QuadrantCard key={plan.plan_id} onOpen={onOpen} onRemove={onRemove} plan={plan} />
          ))}
        </SortableContext>
      </div>
    </section>
  )
}

export function QuadrantBoard() {
  const router = useRouter()
  const [data, setData] = useState<QuadrantData>(EMPTY_DATA)
  const [activePlan, setActivePlan] = useState<QuadrantPlan | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch("/api/plan/priority")
      if (!response.ok) throw new Error("四象限加载失败")
      const payload: unknown = await response.json()
      const normalized = normalizeQuadrantData(payload)
      setData({
        q1: sortPlans(normalized.q1),
        q2: sortPlans(normalized.q2),
        q3: sortPlans(normalized.q3),
        q4: sortPlans(normalized.q4),
      })
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "四象限加载失败")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    const refresh = () => void load()
    window.addEventListener("quadrant-refresh", refresh)
    window.addEventListener("goal-mate:data-changed", refresh)
    return () => {
      window.removeEventListener("quadrant-refresh", refresh)
      window.removeEventListener("goal-mate:data-changed", refresh)
    }
  }, [load])

  const updatePlan = useCallback(async (planId: string, quadrant: QuadrantId | null) => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch("/api/plan/priority", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan_id: planId,
          priority_quadrant: quadrant,
          is_scheduled: quadrant !== null,
        }),
      })
      if (!response.ok) throw new Error(quadrant === null ? "移出四象限失败" : "更新四象限失败")
      await load()
      window.dispatchEvent(new CustomEvent("goal-mate:data-changed", { detail: { entity: "plan-priority" } }))
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "更新四象限失败")
      setLoading(false)
    }
  }, [load])

  const sortedData = useMemo(() => data, [data])

  function handleDragStart(event: DragStartEvent) {
    const plan = event.active.data.current?.plan as QuadrantPlan | undefined
    setActivePlan(plan ?? null)
  }

  function handleDragEnd(event: DragEndEvent) {
    setActivePlan(null)
    const target = event.over?.id
    if (target === "q1" || target === "q2" || target === "q3" || target === "q4") {
      void updatePlan(String(event.active.id), target)
    }
  }

  return (
    <div className="relative h-full min-h-0">
      {error ? <div className="mb-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">{error}</div> : null}
      <DndContext
        collisionDetection={rectIntersection}
        onDragEnd={handleDragEnd}
        onDragStart={handleDragStart}
        sensors={sensors}
      >
        <div className="grid h-full min-h-[420px] grid-cols-2 gap-2">
          {QUADRANTS.map(quadrant => (
            <QuadrantColumn
              key={quadrant.id}
              onDropPlan={(planId, target) => void updatePlan(planId, target)}
              onOpen={planId => router.push(`/progress?plan_id=${encodeURIComponent(planId)}`)}
              onRemove={planId => void updatePlan(planId, null)}
              plans={sortedData[quadrant.id]}
              quadrant={quadrant}
            />
          ))}
        </div>
        <DragOverlay>{activePlan ? <QuadrantCard overlay onOpen={() => undefined} plan={activePlan} /> : null}</DragOverlay>
      </DndContext>
      {loading ? (
        <div className="pointer-events-none absolute inset-0 grid place-items-center rounded-xl bg-white/45" role="status">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
          <span className="sr-only">正在加载四象限</span>
        </div>
      ) : null}
    </div>
  )
}

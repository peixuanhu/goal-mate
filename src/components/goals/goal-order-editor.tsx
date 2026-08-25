"use client"

import * as React from "react"
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVertical } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"

export type GoalOrderItem = {
  id: number
  goal_id: string
  tag: string
  name: string
  description: string | null
  position: number | null
}

async function readApiError(response: Response, fallback: string): Promise<string> {
  try {
    const data = await response.json() as { error?: string; message?: string }
    return data.error ?? data.message ?? fallback
  } catch {
    return fallback
  }
}

function SortableGoalRow({ goal, index, disabled }: { goal: GoalOrderItem; index: number; disabled: boolean }) {
  const {
    attributes,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: goal.goal_id, disabled })

  return (
    <tr
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("border-b transition-colors", isDragging ? "bg-orange-50 dark:bg-orange-950/40" : "bg-background")}
    >
      <TableCell className="w-20 font-medium text-muted-foreground">{index + 1}</TableCell>
      <TableCell className="min-w-0">
        <div className="flex items-center gap-2">
          <button
            ref={setActivatorNodeRef}
            type="button"
            disabled={disabled}
            aria-label={`拖拽排序 ${goal.name}`}
            className="touch-none cursor-grab rounded p-1 text-muted-foreground hover:bg-muted active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-50"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="size-4" />
          </button>
          <span data-testid="goal-order-name" className="min-w-0 truncate font-medium">{goal.name}</span>
        </div>
      </TableCell>
      <TableCell>
        <span className="inline-flex rounded-full bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-700 dark:bg-orange-950 dark:text-orange-200">
          {goal.tag || "未分类"}
        </span>
      </TableCell>
      <TableCell className="max-w-0 truncate text-muted-foreground" title={goal.description ?? undefined}>
        {goal.description || "—"}
      </TableCell>
    </tr>
  )
}

export function GoalOrderEditor({ onDone }: { onDone: () => void }) {
  const [goals, setGoals] = React.useState<GoalOrderItem[]>([])
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const savingRef = React.useRef(false)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  React.useEffect(() => {
    let cancelled = false

    async function loadGoals() {
      try {
        const response = await fetch("/api/goal?all=true")
        if (!response.ok) {
          throw new Error(await readApiError(response, "目标加载失败"))
        }
        const data = await response.json() as { list?: GoalOrderItem[] }
        if (!cancelled) {
          setGoals(data.list ?? [])
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "目标加载失败")
          setGoals([])
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadGoals()
    return () => {
      cancelled = true
    }
  }, [])

  async function saveOrder(nextGoals: GoalOrderItem[], previousGoals: GoalOrderItem[]) {
    savingRef.current = true
    setSaving(true)
    setError(null)

    try {
      const response = await fetch("/api/goal/order", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ordered_goal_ids: nextGoals.map(goal => goal.goal_id) }),
      })
      if (!response.ok) {
        throw new Error(await readApiError(response, "排序保存失败"))
      }
      const data = await response.json() as { list?: GoalOrderItem[] }
      setGoals(data.list ?? nextGoals)
    } catch (saveError) {
      setGoals(previousGoals)
      setError(saveError instanceof Error ? saveError.message : "排序保存失败")
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    if (savingRef.current || !event.over || event.active.id === event.over.id) return

    const oldIndex = goals.findIndex(goal => goal.goal_id === event.active.id)
    const newIndex = goals.findIndex(goal => goal.goal_id === event.over?.id)
    if (oldIndex < 0 || newIndex < 0) return

    const previousGoals = goals
    const nextGoals = arrayMove(goals, oldIndex, newIndex)
    setGoals(nextGoals)
    void saveOrder(nextGoals, previousGoals)
  }

  return (
    <div className="space-y-3 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-muted-foreground">拖动左侧手柄调整全部目标的显示顺序。</p>
        <Button type="button" className="ml-auto" disabled={loading || saving} onClick={onDone}>完成排序</Button>
      </div>

      {error ? <div role="alert" className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}

      {loading ? (
        <div role="status" className="py-6 text-center text-sm text-muted-foreground">正在加载全部目标…</div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={goals.map(goal => goal.goal_id)} strategy={verticalListSortingStrategy}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>顺序</TableHead>
                  <TableHead>目标</TableHead>
                  <TableHead>标签</TableHead>
                  <TableHead>说明</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {goals.map((goal, index) => (
                  <SortableGoalRow key={goal.goal_id} goal={goal} index={index} disabled={saving} />
                ))}
              </TableBody>
            </Table>
          </SortableContext>
        </DndContext>
      )}
    </div>
  )
}

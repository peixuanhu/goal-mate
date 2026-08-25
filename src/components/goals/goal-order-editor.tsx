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

type LoadState = "loading" | "ready" | "error"

const LOAD_FORMAT_ERROR = "目标加载数据格式无效，请重试"
const SAVE_CONFIRMATION_ERROR = "排序结果确认失败，请重新加载目标"

function isGoalOrderItem(value: unknown): value is GoalOrderItem {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false

  const item = value as Record<string, unknown>
  return Number.isInteger(item.id)
    && typeof item.goal_id === "string" && item.goal_id.length > 0
    && typeof item.tag === "string"
    && typeof item.name === "string"
    && (typeof item.description === "string" || item.description === null)
    && (item.position === null || (typeof item.position === "number" && Number.isInteger(item.position) && item.position >= 0))
}

function parseGoalList(payload: unknown, expectedIds?: string[]): GoalOrderItem[] | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null

  const list = (payload as { list?: unknown }).list
  if (!Array.isArray(list) || !list.every(isGoalOrderItem)) return null

  const goalIds = new Set(list.map(goal => goal.goal_id))
  if (goalIds.size !== list.length) return null

  if (expectedIds) {
    const expectedIdSet = new Set(expectedIds)
    if (expectedIdSet.size !== expectedIds.length || goalIds.size !== expectedIdSet.size) return null
    if ([...goalIds].some(goalId => !expectedIdSet.has(goalId))) return null
  }

  return list
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
          {goal.tag}
        </span>
      </TableCell>
      <TableCell className="max-w-[28rem] truncate text-muted-foreground" title={goal.description ?? undefined}>
        {goal.description || "—"}
      </TableCell>
    </tr>
  )
}

export function GoalOrderEditor({ onDone }: { onDone: () => void }) {
  const [goals, setGoals] = React.useState<GoalOrderItem[]>([])
  const [loadState, setLoadState] = React.useState<LoadState>("loading")
  const [saving, setSaving] = React.useState(false)
  const [requiresReload, setRequiresReload] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const savingRef = React.useRef(false)
  const mountedRef = React.useRef(false)
  const loadControllerRef = React.useRef<AbortController | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const loading = loadState === "loading"

  const updateIfMounted = React.useCallback((update: () => void) => {
    if (mountedRef.current) update()
  }, [])

  const loadGoals = React.useCallback(async () => {
    loadControllerRef.current?.abort()
    const controller = new AbortController()
    loadControllerRef.current = controller
    updateIfMounted(() => {
      setLoadState("loading")
      setError(null)
      setRequiresReload(false)
    })

    try {
      const response = await fetch("/api/goal?all=true", { signal: controller.signal })
      if (!response.ok) {
        throw new Error(await readApiError(response, "目标加载失败"))
      }
      const list = parseGoalList(await response.json())
      if (!list) {
        throw new Error(LOAD_FORMAT_ERROR)
      }
      updateIfMounted(() => {
        if (loadControllerRef.current !== controller) return
        setGoals(list)
        setLoadState("ready")
        setError(null)
        setRequiresReload(false)
      })
    } catch (loadError) {
      if (controller.signal.aborted) return
      updateIfMounted(() => {
        if (loadControllerRef.current !== controller) return
        setGoals([])
        setLoadState("error")
        setError(loadError instanceof Error ? loadError.message : "目标加载失败")
        setRequiresReload(false)
      })
    } finally {
      if (loadControllerRef.current === controller) {
        loadControllerRef.current = null
      }
    }
  }, [updateIfMounted])

  React.useEffect(() => {
    mountedRef.current = true
    void loadGoals()
    return () => {
      mountedRef.current = false
      loadControllerRef.current?.abort()
      loadControllerRef.current = null
    }
  }, [loadGoals])

  async function saveOrder(nextGoals: GoalOrderItem[], previousGoals: GoalOrderItem[]) {
    savingRef.current = true
    updateIfMounted(() => {
      setSaving(true)
      setError(null)
    })

    try {
      const response = await fetch("/api/goal/order", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ordered_goal_ids: nextGoals.map(goal => goal.goal_id) }),
      })
      if (!response.ok) {
        const message = await readApiError(response, "排序保存失败")
        updateIfMounted(() => {
          setGoals(previousGoals)
          setError(message)
          setRequiresReload(response.status === 409)
        })
        return
      }

      let savedGoals: GoalOrderItem[] | null = null
      try {
        savedGoals = parseGoalList(await response.json(), nextGoals.map(goal => goal.goal_id))
      } catch {
        savedGoals = null
      }
      if (!savedGoals) {
        updateIfMounted(() => {
          setError(SAVE_CONFIRMATION_ERROR)
          setRequiresReload(true)
        })
        return
      }

      updateIfMounted(() => {
        setGoals(savedGoals)
        setError(null)
      })
    } catch (saveError) {
      updateIfMounted(() => {
        setGoals(previousGoals)
        setError(saveError instanceof Error ? saveError.message : "排序保存失败")
      })
    } finally {
      savingRef.current = false
      updateIfMounted(() => setSaving(false))
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    if (savingRef.current || requiresReload || !event.over || event.active.id === event.over.id) return

    const oldIndex = goals.findIndex(goal => goal.goal_id === event.active.id)
    const newIndex = goals.findIndex(goal => goal.goal_id === event.over?.id)
    if (oldIndex < 0 || newIndex < 0) return

    const previousGoals = goals
    const nextGoals = arrayMove(goals, oldIndex, newIndex)
    setGoals(nextGoals)
    void saveOrder(nextGoals, previousGoals)
  }

  const controlsDisabled = loading || saving || loadState === "error" || requiresReload

  return (
    <div className="space-y-3 rounded-lg border bg-card p-4" aria-busy={loading || saving}>
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-muted-foreground">拖动左侧手柄调整全部目标的显示顺序。</p>
        <Button type="button" className="ml-auto" disabled={controlsDisabled} onClick={onDone}>完成排序</Button>
      </div>

      {saving ? <p role="status" className="text-sm text-muted-foreground">正在保存排序…</p> : null}
      {error ? <div role="alert" className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}

      {loadState === "error" ? (
        <Button type="button" variant="outline" onClick={() => void loadGoals()}>重新加载目标</Button>
      ) : loading ? (
        <div role="status" className="py-6 text-center text-sm text-muted-foreground">正在加载全部目标…</div>
      ) : goals.length === 0 ? (
        <div className="rounded border border-dashed py-6 text-center text-sm text-muted-foreground">暂无目标可排序</div>
      ) : (
        <>
          {requiresReload ? <Button type="button" variant="outline" onClick={() => void loadGoals()}>重新加载目标</Button> : null}
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
                    <SortableGoalRow key={goal.goal_id} goal={goal} index={index} disabled={saving || requiresReload} />
                  ))}
                </TableBody>
              </Table>
            </SortableContext>
          </DndContext>
        </>
      )}
    </div>
  )
}

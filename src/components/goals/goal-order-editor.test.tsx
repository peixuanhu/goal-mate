// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

const dndState = vi.hoisted(() => ({
  onDragEnd: undefined as undefined | ((event: { active: { id: string }; over: { id: string } | null }) => void),
}))

vi.mock("@dnd-kit/core", () => ({
  DndContext: ({ children, onDragEnd }: { children: React.ReactNode; onDragEnd?: typeof dndState.onDragEnd }) => {
    dndState.onDragEnd = onDragEnd
    return <>{children}</>
  },
  closestCenter: vi.fn(),
  KeyboardSensor: class KeyboardSensor {},
  PointerSensor: class PointerSensor {},
  useSensor: vi.fn(),
  useSensors: vi.fn(() => []),
}))

vi.mock("@dnd-kit/sortable", () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  arrayMove: <T,>(items: T[], oldIndex: number, newIndex: number) => {
    const nextItems = [...items]
    const [item] = nextItems.splice(oldIndex, 1)
    nextItems.splice(newIndex, 0, item)
    return nextItems
  },
  sortableKeyboardCoordinates: vi.fn(),
  useSortable: vi.fn(() => ({
    attributes: {},
    listeners: {},
    setActivatorNodeRef: () => undefined,
    setNodeRef: () => undefined,
    isDragging: false,
    transform: null,
    transition: undefined,
  })),
  verticalListSortingStrategy: vi.fn(),
}))

import { GoalOrderEditor } from "./goal-order-editor"

const goals = [
  { id: 1, goal_id: "goal_a", tag: "工作", name: "目标甲", description: "甲的说明", position: 0 },
  { id: 2, goal_id: "goal_b", tag: "生活", name: "目标乙", description: null, position: 1 },
]

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

function orderedNames(): string[] {
  return screen.getAllByTestId("goal-order-name").map(element => element.textContent ?? "")
}

afterEach(() => {
  cleanup()
  dndState.onDragEnd = undefined
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("GoalOrderEditor", () => {
  it("loads all goals and saves an optimistic reordered list", async () => {
    let resolveSave: ((value: Response) => void) | undefined
    const save = new Promise<Response>(resolve => {
      resolveSave = resolve
    })
    const fetchMock = vi.fn((url: RequestInfo | URL) => {
      if (String(url) === "/api/goal?all=true") return Promise.resolve(response({ list: goals, total: 2 }))
      return save
    })
    vi.stubGlobal("fetch", fetchMock)

    render(<GoalOrderEditor onDone={vi.fn()} />)

    await screen.findByText("目标甲")
    expect(fetchMock.mock.calls[0][0]).toBe("/api/goal?all=true")

    act(() => {
      dndState.onDragEnd?.({ active: { id: "goal_b" }, over: { id: "goal_a" } })
    })

    await waitFor(() => expect(orderedNames()).toEqual(["目标乙", "目标甲"]))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(fetchMock.mock.calls[1]).toEqual([
      "/api/goal/order",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ordered_goal_ids: ["goal_b", "goal_a"] }),
      },
    ])
    expect((screen.getByRole("button", { name: "完成排序" }) as HTMLButtonElement).disabled).toBe(true)

    await act(async () => {
      resolveSave?.(response({ list: [goals[1], goals[0]], total: 2 }))
      await Promise.resolve()
    })

    await waitFor(() => expect((screen.getByRole("button", { name: "完成排序" }) as HTMLButtonElement).disabled).toBe(false))
  })

  it("rolls back the optimistic order when the server rejects the save", async () => {
    const fetchMock = vi.fn((url: RequestInfo | URL) => {
      if (String(url) === "/api/goal?all=true") return Promise.resolve(response({ list: goals, total: 2 }))
      return Promise.resolve(response({ error: "目标集合已变化，请刷新后重试" }, 409))
    })
    vi.stubGlobal("fetch", fetchMock)

    render(<GoalOrderEditor onDone={vi.fn()} />)

    await screen.findByText("目标甲")
    await act(async () => {
      dndState.onDragEnd?.({ active: { id: "goal_b" }, over: { id: "goal_a" } })
      await Promise.resolve()
    })

    expect((await screen.findByRole("alert")).textContent).toContain("目标集合已变化，请刷新后重试")
    expect(orderedNames()).toEqual(["目标甲", "目标乙"])
  })

  it("calls onDone after loading when completion is selected", async () => {
    const onDone = vi.fn()
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(response({ list: goals, total: 2 }))))

    render(<GoalOrderEditor onDone={onDone} />)

    await screen.findByText("目标甲")
    fireEvent.click(screen.getByRole("button", { name: "完成排序" }))
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it("shows the server load error without rendering reorder rows", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(response({ error: "目标加载失败，请重试" }, 500))))

    render(<GoalOrderEditor onDone={vi.fn()} />)

    expect((await screen.findByRole("alert")).textContent).toContain("目标加载失败，请重试")
    expect(screen.queryAllByTestId("goal-order-name")).toHaveLength(0)
  })

  it("does not save when a goal is dropped onto itself", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(response({ list: goals, total: 2 })))
    vi.stubGlobal("fetch", fetchMock)

    render(<GoalOrderEditor onDone={vi.fn()} />)

    await screen.findByText("目标甲")
    act(() => {
      dndState.onDragEnd?.({ active: { id: "goal_a" }, over: { id: "goal_a" } })
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

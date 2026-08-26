// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { KeyboardCoordinateGetter } from "@dnd-kit/core"

import { MainLayout } from "./main-layout"
import { minuteFromTimelinePoint } from "./today/scheduling-ui"

const { dndContext, keyboardSensor, pointerSensor, useSensor, useSensors } = vi.hoisted(() => ({
  dndContext: vi.fn(),
  keyboardSensor: class KeyboardSensor {},
  pointerSensor: class PointerSensor {},
  useSensor: vi.fn((sensor: unknown, options: Record<string, unknown> = {}) => ({ sensor, options })),
  useSensors: vi.fn((...sensors: unknown[]) => sensors),
}))

vi.mock("@dnd-kit/core", () => ({
  DndContext: ({ children, ...props }: { children: React.ReactNode } & Record<string, unknown>) => {
    dndContext(props)
    return <>{children}</>
  },
  KeyboardSensor: keyboardSensor,
  PointerSensor: pointerSensor,
  defaultKeyboardCoordinateGetter: (event: KeyboardEvent, { currentCoordinates }: { currentCoordinates: { x: number; y: number } }) => {
    if (event.code === "ArrowLeft") return { ...currentCoordinates, x: currentCoordinates.x - 25 }
    if (event.code === "ArrowRight") return { ...currentCoordinates, x: currentCoordinates.x + 25 }
    if (event.code === "ArrowUp") return { ...currentCoordinates, y: currentCoordinates.y - 25 }
    if (event.code === "ArrowDown") return { ...currentCoordinates, y: currentCoordinates.y + 25 }
    return undefined
  },
  useSensor,
  useSensors,
}))

vi.mock("./app-header", () => ({
  AppHeader: () => <header>全局导航</header>,
}))

vi.mock("./workspace/workspace-sidebar-controller", () => ({
  WorkspaceSidebarController: ({ date }: { date?: string | null }) => <aside>共享工作台 {date}</aside>,
}))

vi.mock("./today/goal-candidate-panel", () => ({
  GoalCandidatePanel: ({ candidates }: { candidates: Array<{ name: string }> }) => (
    <aside>今日共享快照 {candidates.map(candidate => candidate.name).join("、")}</aside>
  ),
}))

vi.mock("./today/ai-workspace", () => ({
  AiWorkspace: () => <aside>共享 AI</aside>,
}))

afterEach(cleanup)

describe("MainLayout", () => {
  it("renders one shared header, workspace sidebar, central page, and AI sidebar", () => {
    render(
      <MainLayout workspaceDate="2026-08-24">
        <section>页面内容</section>
      </MainLayout>,
    )

    expect(screen.getAllByText("全局导航")).toHaveLength(1)
    expect(screen.getByText("共享工作台 2026-08-24")).toBeTruthy()
    expect(screen.getByText("页面内容")).toBeTruthy()
    expect(screen.getByText("共享 AI")).toBeTruthy()
    expect(screen.getByRole("button", { name: "打开目标工作台" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "打开 AI 助手" })).toBeTruthy()

    const desktopWorkspace = screen.getByRole("complementary", { name: "目标工作台" })
    expect(desktopWorkspace.className).toContain("w-[380px]")
    expect(desktopWorkspace.className).toContain("xl:w-[400px]")

    fireEvent.click(screen.getByRole("button", { name: "打开目标工作台" }))
    const mobileWorkspace = screen.getByRole("dialog", { name: "目标工作台" })
    expect(mobileWorkspace.className).toContain("w-[min(92vw,400px)]")
  })

  it("uses a page-provided workspace snapshot without starting the shared controller", () => {
    render(
      <MainLayout
        workspaceSnapshot={{
          candidates: [{ name: "今日候选" }] as never,
          error: null,
          focus: null,
          loading: false,
        }}
      >
        <section>今日时间轴</section>
      </MainLayout>,
    )

    expect(screen.getByText("今日共享快照 今日候选")).toBeTruthy()
    expect(screen.queryByText(/共享工作台/)).toBeNull()
  })

  it("forwards the complete workspace drag lifecycle and timeline auto-scroll configuration", () => {
    const onWorkspaceDragStart = vi.fn()
    const onWorkspaceDragMove = vi.fn()
    const onWorkspaceDragCancel = vi.fn()
    const onWorkspaceDragEnd = vi.fn()

    render(
      <MainLayout
        onWorkspaceDragCancel={onWorkspaceDragCancel}
        onWorkspaceDragEnd={onWorkspaceDragEnd}
        onWorkspaceDragMove={onWorkspaceDragMove}
        onWorkspaceDragStart={onWorkspaceDragStart}
      >
        <section>页面内容</section>
      </MainLayout>,
    )

    const props = dndContext.mock.calls.at(-1)?.[0]
    expect(props).toMatchObject({
      onDragStart: onWorkspaceDragStart,
      onDragMove: onWorkspaceDragMove,
      onDragCancel: onWorkspaceDragCancel,
      onDragEnd: onWorkspaceDragEnd,
      autoScroll: { threshold: { x: 0, y: 0.08 }, acceleration: 8 },
    })
  })

  it("configures keyboard dragging so every vertical arrow moves one measured 15-minute row", () => {
    render(
      <MainLayout>
        <section>页面内容</section>
      </MainLayout>,
    )

    const props = dndContext.mock.calls.at(-1)?.[0]
    const sensors = props?.sensors as Array<{ sensor: unknown; options: { coordinateGetter?: KeyboardCoordinateGetter } }> | undefined
    expect(sensors).toHaveLength(2)
    expect(sensors?.[0]?.sensor).toBe(pointerSensor)
    expect(sensors?.[1]?.sensor).toBe(keyboardSensor)

    const getter = sensors?.[1]?.options.coordinateGetter
    if (!getter) throw new Error("missing timeline keyboard coordinate getter")

    for (const geometry of [
      { dayStartMinutes: 0, dayEndMinutes: 1_440, height: 4_608, startingMinute: 480 },
      { dayStartMinutes: 490, dayEndMinutes: 610, height: 520, startingMinute: 520 },
    ]) {
      const preference = {
        preference_id: "default" as const,
        timezone: "Asia/Shanghai",
        day_start_minutes: geometry.dayStartMinutes,
        day_end_minutes: geometry.dayEndMinutes,
        high_energy_start_minutes: null,
        high_energy_end_minutes: null,
        buffer_minutes: 0,
        default_block_minutes: 30,
        capacity_warning_minutes: 0,
        version: null,
      }
      const context = {
        droppableRects: new Map([
          ["today-timeline", { top: 0, height: geometry.height }],
        ]),
        droppableContainers: new Map([
          ["today-timeline", { data: { current: {
            dayStartMinutes: geometry.dayStartMinutes,
            dayEndMinutes: geometry.dayEndMinutes,
          } } }],
        ]),
      } as never
      const start = {
        x: 12,
        y: (geometry.startingMinute - geometry.dayStartMinutes)
          / (geometry.dayEndMinutes - geometry.dayStartMinutes)
          * geometry.height,
      }
      const args = (currentCoordinates: { x: number; y: number }) => ({
        active: "schedule-block:block",
        currentCoordinates,
        context,
      })
      const firstDown = getter(new KeyboardEvent("keydown", { code: "ArrowDown" }), args(start))
      if (!firstDown) throw new Error("ArrowDown did not produce coordinates")
      const secondDown = getter(new KeyboardEvent("keydown", { code: "ArrowDown" }), args(firstDown))
      if (!secondDown) throw new Error("second ArrowDown did not produce coordinates")
      const oneUp = getter(new KeyboardEvent("keydown", { code: "ArrowUp" }), args(secondDown))
      if (!oneUp) throw new Error("ArrowUp did not produce coordinates")

      const minuteAt = (coordinate: { y: number }) => minuteFromTimelinePoint(
        coordinate.y,
        { top: 0, height: geometry.height },
        preference,
        15,
      )
      expect([minuteAt(firstDown), minuteAt(secondDown), minuteAt(oneUp)]).toEqual([
        geometry.startingMinute + 15,
        geometry.startingMinute + 30,
        geometry.startingMinute + 15,
      ])
    }

    const fallbackArgs = {
      active: "schedule-block:block",
      currentCoordinates: { x: 12, y: 20 },
      context: {
        droppableRects: new Map(),
        droppableContainers: new Map(),
      } as never,
    }
    expect(getter(new KeyboardEvent("keydown", { code: "ArrowDown" }), fallbackArgs)).toEqual({ x: 12, y: 45 })
    expect(getter(new KeyboardEvent("keydown", { code: "ArrowRight" }), fallbackArgs)).toEqual({ x: 37, y: 20 })

    const invalidGeometryArgs = {
      ...fallbackArgs,
      context: {
        droppableRects: new Map([["today-timeline", { top: 0, height: 520 }]]),
        droppableContainers: new Map([["today-timeline", { data: { current: {
          dayStartMinutes: 610,
          dayEndMinutes: 490,
        } } }]]),
      } as never,
    }
    expect(getter(new KeyboardEvent("keydown", { code: "ArrowDown" }), invalidGeometryArgs)).toEqual({ x: 12, y: 45 })
  })
})

import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const projectRoot = process.cwd()

function readProjectFile(relativePath: string) {
  const filePath = path.join(projectRoot, relativePath)
  return existsSync(filePath) ? readFileSync(filePath, "utf8") : ""
}

describe("read-only Today workspace", () => {
  it("replaces the authenticated dashboard shell without changing its redirect", () => {
    const source = readProjectFile("src/app/page.tsx")

    expect(source).toContain("const authenticated = await isAuthenticated()")
    expect(source).toContain("redirect('/login')")
    expect(source).toContain("<TodayWorkspace />")
    expect(source).not.toContain("<MainLayout")
  })

  it("uses a desktop three-column workspace with the timeline first on mobile", () => {
    const source = readProjectFile("src/components/today/today-workspace.tsx")

    expect(source).toContain("lg:grid-cols-[300px_minmax(0,1fr)_340px]")
    expect(source).toContain("<GoalCandidatePanel")
    expect(source).toContain("<DayTimeline")
    expect(source).toContain("<AiWorkspace")
    expect(source).toMatch(/order-1[^\"]*lg:col-start-2/)
    expect(source).toMatch(/order-2[^\"]*lg:col-start-1/)
    expect(source).toMatch(/order-3[^\"]*lg:col-start-3/)
  })

  it("loads the local date and protects newer requests from stale success or error state", () => {
    const source = readProjectFile("src/components/today/today-workspace.tsx")

    expect(source).toContain("normalizeLocalDateInput(new Date())")
    expect(source).toContain("++requestIdRef.current")
    expect(source).toContain("`/api/today?date=${encodeURIComponent(date)}`")
    expect(source.match(/requestId !== requestIdRef\.current/g)?.length).toBeGreaterThanOrEqual(2)
    expect(source).toContain("response.ok")
    expect(source).toContain("controller.abort()")
  })

  it("offers accessible mobile panel toggles and date navigation", () => {
    const source = readProjectFile("src/components/today/today-workspace.tsx")

    expect(source).toContain('aria-label="前一天"')
    expect(source).toContain('aria-label="后一天"')
    expect(source).toContain("回到今天")
    expect(source).toContain('aria-controls="today-candidates"')
    expect(source).toContain('aria-controls="today-ai"')
    expect(source).toContain("显示候选任务")
    expect(source).toContain("显示 AI 工作区")
  })

  it("keeps the timeline visible when a mobile auxiliary panel opens", () => {
    const source = readProjectFile("src/components/today/today-workspace.tsx")
    const timelineSection = source.slice(source.indexOf('className={cn("order-1'), source.indexOf("<DayTimeline"))

    expect(timelineSection).not.toContain("max-lg:hidden")
  })

  it("keeps AI chat mounted while switching between check and chat", () => {
    const source = readProjectFile("src/components/today/ai-workspace.tsx")

    expect(source).toContain('value="check"')
    expect(source).toContain('value="chat"')
    expect(source).toContain("<ChatWrapper />")
    expect(source).toContain("forceMount")
    expect(source).toContain("invisible absolute inset-0 pointer-events-none")
    expect(source).toContain("今日检查将在排程阶段启用")
    expect(source).not.toContain('activeTab === "chat" ? <ChatWrapper')
  })

  it("groups candidates for goal, quadrant and inbox views", () => {
    const source = readProjectFile("src/components/today/goal-candidate-panel.tsx")

    expect(source).toContain('value="goal-tree"')
    expect(source).toContain('value="quadrant"')
    expect(source).toContain('value="inbox"')
    expect(source).toContain("目标树")
    expect(source).toContain("四象限")
    expect(source).toContain("收集箱")
    expect(source).toContain("FOCUS_GROUP_KEY")
    expect(source).toContain("QUADRANT_LABELS")
    expect(source).toContain("candidate.goal_id === null && candidate.effective_quadrant === null")
    expect(source).toContain("行动项")
    expect(source).toContain("计划")
    expect(source).toContain("直接安排计划")
    expect(source).toContain("预计")
    expect(source).not.toContain("showGoal && candidate.goal_name")
    expect(source).toContain("暂无可安排事项")
    expect(source).toContain("候选事项加载失败")
  })

  it("renders a bounded timeline with the exact empty-state guidance", () => {
    const source = readProjectFile("src/components/today/day-timeline.tsx")

    expect(source).toContain("day_start_minutes")
    expect(source).toContain("day_end_minutes")
    expect(source).toContain("MAX_TIMELINE_MARKERS")
    expect(source).toContain("把左侧计划或行动项拖到这里安排时间")
  })
})

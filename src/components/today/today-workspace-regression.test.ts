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

  it("places the timeline inside the shared application shell", () => {
    const source = readProjectFile("src/components/today/today-workspace.tsx")

    expect(source).toContain("<MainLayout")
    expect(source).toContain("workspaceSnapshot=")
    expect(source).toContain("onWorkspaceDragEnd={handleDragEnd}")
    expect(source).toContain("<DayTimeline")
    expect(source).not.toContain("<GoalCandidatePanel")
    expect(source).not.toContain("<AiWorkspace")
    expect(source).not.toContain("lg:grid-cols-[300px_minmax(0,1fr)_340px]")
  })

  it("keeps date navigation while delegating auxiliary panels to the shell", () => {
    const source = readProjectFile("src/components/today/today-workspace.tsx")

    expect(source).toContain('aria-label="前一天"')
    expect(source).toContain('aria-label="后一天"')
    expect(source).toContain("回到今天")
    expect(source).not.toContain('aria-controls="today-candidates"')
    expect(source).not.toContain('aria-controls="today-ai"')
  })

  it("lays out AI check and chat tabs around the chat workspace", () => {
    const source = readProjectFile("src/components/today/ai-workspace.tsx")

    expect(source).toContain('value="check"')
    expect(source).toContain('value="chat"')
    expect(source).toContain("<ChatWrapper />")
    expect(source).toContain("今日检查将在排程阶段启用")
  })

  it("lays out goal, quadrant and unclassified candidate tabs", () => {
    const source = readProjectFile("src/components/today/goal-candidate-panel.tsx")

    expect(source).toContain('value="goal-tree"')
    expect(source).toContain('value="quadrant"')
    expect(source).toContain('value="unclassified"')
    expect(source).toContain("目标树")
    expect(source).toContain("四象限")
    expect(source).toContain("未归类")
  })

  it("renders a bounded timeline with the exact empty-state guidance", () => {
    const source = readProjectFile("src/components/today/day-timeline.tsx")

    expect(source).toContain("day_start_minutes")
    expect(source).toContain("day_end_minutes")
    expect(source).toContain("MAX_TIMELINE_MARKERS")
    expect(source).toContain("把左侧计划或行动项拖到这里安排时间")
  })
})

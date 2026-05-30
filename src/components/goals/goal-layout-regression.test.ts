import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const projectRoot = process.cwd()

function readProjectFile(relativePath: string) {
  return readFileSync(path.join(projectRoot, relativePath), "utf8")
}

describe("table action layout regression", () => {
  it("lets expanded goal routes fill the full table width", () => {
    const source = readProjectFile("src/app/goals/page.tsx")

    expect(source).toContain("colSpan={5}")
    expect(source).not.toContain('aria-hidden="true" className="sticky right-0')
  })

  it("keeps row actions as a single stable button group", () => {
    const source = readProjectFile("src/app/goals/page.tsx")

    expect(source).toContain('<Table className="w-full table-fixed">')
    expect(source).toContain("w-[180px] min-w-[180px]")
    expect(source).not.toContain("sticky right-0")
    expect(source).toContain("inline-flex items-center justify-end gap-2 whitespace-nowrap")
    expect(source).not.toContain("min-w-[980px]")
  })

  it("shows full goal descriptions on hover without the markdown eye toggle", () => {
    const source = readProjectFile("src/app/goals/page.tsx")

    expect(source).not.toContain("MarkdownPreview")
    expect(source).toContain("TextPreview")
    expect(source).toContain("text={goal.description || ''}")
    expect(source).toContain("maxLength={32}")
    expect(source).toContain("overflow-hidden")
  })

  it("allows route toolbar controls to wrap without overlapping", () => {
    const source = readProjectFile("src/components/goals/goal-plan-list.tsx")

    expect(source).not.toContain("sm:justify-between")
    expect(source).toContain("ml-auto flex max-w-full flex-wrap items-center justify-end gap-2")
    expect(source).toContain("w-[220px] shrink-0")
    expect(source).not.toContain("min-w-[220px] flex-1")
    expect(source).not.toContain("ml-auto shrink-0")
  })

  it("keeps route progress columns wide enough to avoid overlap", () => {
    const source = readProjectFile("src/components/goals/goal-plan-list.tsx")

    expect(source).toContain("grid-cols-[32px_64px_minmax(180px,320px)_72px_150px_100px]")
    expect(source).toContain("justify-start")
    expect(source).not.toContain("minmax(220px,1fr)")
    expect(source).toContain("whitespace-nowrap")
    expect(source).toContain("justify-self-start")
  })

  it("colors route priority badges by difficulty", () => {
    const source = readProjectFile("src/components/goals/goal-plan-list.tsx")

    expect(source).toContain("function getDifficultyClass")
    expect(source).toContain("bg-red-50")
    expect(source).toContain("bg-amber-50")
    expect(source).toContain("bg-emerald-50")
  })

  it("keeps plan row actions in a single stable button group", () => {
    const source = readProjectFile("src/app/plans/page.tsx")

    expect(source).not.toContain("max-w-full overflow-x-auto overscroll-x-contain rounded-lg border")
    expect(source).toContain("w-[230px] min-w-[230px]")
    expect(source).toContain("inline-flex items-center justify-end gap-2 whitespace-nowrap")
  })

  it("keeps progress row actions in a single stable button group", () => {
    const source = readProjectFile("src/app/progress/page.tsx")

    expect(source).not.toContain("max-w-full overflow-x-auto overscroll-x-contain rounded-lg border")
    expect(source).toContain("inline-flex items-center justify-end gap-2 whitespace-nowrap")
  })
})

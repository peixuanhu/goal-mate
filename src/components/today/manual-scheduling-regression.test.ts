import fs from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

const ROOT = process.cwd()

function source(file: string): string {
  return fs.readFileSync(path.join(ROOT, "src/components/today", file), "utf8")
}

describe("manual scheduling UI source contract", () => {
  it("keeps the planned DnD, timeline, editor, completion, and mutation seams", () => {
    const candidateSource = source("goal-candidate-panel.tsx")
    const timelineSource = source("day-timeline.tsx")
    const editorSource = source("schedule-block-editor.tsx")
    const completionSource = source("schedule-completion-sheet.tsx")
    const workspaceSource = source("today-workspace.tsx")

    expect(candidateSource).toContain("useDraggable")
    expect(candidateSource).toContain("安排到今天")
    expect(timelineSource).toContain("useDroppable")
    expect(timelineSource).toContain("当前时间")
    expect(timelineSource).toContain("onEditBlock")
    expect(editorSource).toContain("expected_version")
    expect(completionSource).toContain('value="partial"')
    expect(workspaceSource).toContain('method: "POST"')
    expect(workspaceSource).toContain('method: "PUT"')
    expect(workspaceSource).toContain("goal-mate:data-changed")
  })
})

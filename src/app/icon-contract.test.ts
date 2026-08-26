import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const root = process.cwd()

function readProjectFile(relativePath: string): string {
  const absolutePath = path.join(root, relativePath)
  return existsSync(absolutePath) ? readFileSync(absolutePath, "utf8") : ""
}

describe("Goal Mate browser icon contract", () => {
  it("uses the orange target-and-check SVG as the explicit browser icon", () => {
    const layout = readProjectFile("src/app/layout.tsx")
    const icon = readProjectFile("src/app/icon.svg")

    expect(layout).toContain("icons:")
    expect(layout).toContain('url: "/icon.svg"')
    expect(layout).toContain('shortcut: "/icon.svg"')
    expect(icon).toContain('viewBox="0 0 64 64"')
    expect(icon).toContain("#f97316")
    expect(icon).toContain("<circle")
    expect(icon).toContain("<path")
  })
})

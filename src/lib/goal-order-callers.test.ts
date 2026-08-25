import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

const goalRoute = readFileSync(new URL("../app/api/goal/route.ts", import.meta.url), "utf8")
const copilotRoute = readFileSync(new URL("../app/api/copilotkit/route.ts", import.meta.url), "utf8")

describe("goal order mutation callers", () => {
  it("routes HTTP and Copilot goal creation through the serialized helper", () => {
    expect(goalRoute).toMatch(/createGoalAtEnd\(prisma,\s*\{[\s\S]*?name,[\s\S]*?tag/)
    expect(copilotRoute).toMatch(/createGoalAtEnd\(prisma,\s*\{[\s\S]*?name,[\s\S]*?tag/)
  })

  it("serializes deletion and prevents position updates through the goal route", () => {
    expect(goalRoute).toMatch(/const \{ goal_id, position: _position, \.\.\.rest \} = data/)
    expect(goalRoute).toMatch(/prisma\.\$transaction\(async\s*\(?tx\)?\s*=>\s*\{[\s\S]*?lockGoalOrder\(tx\)[\s\S]*?tx\.goal\.delete/)
  })
})

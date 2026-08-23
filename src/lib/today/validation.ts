import { parseDateOnly } from "@/lib/focus-period-utils"

import type { EnergyLevel, QuadrantId } from "./types"

export type PlanningFields = {
  due_date?: Date | null
  estimated_minutes?: number | null
  energy_level?: EnergyLevel | null
  priority_quadrant?: QuadrantId | null
}

export type ActionItemInput = PlanningFields & {
  name: string
  description?: string | null
}

const ENERGY_LEVELS = new Set<EnergyLevel>(["low", "medium", "high"])
const QUADRANT_IDS = new Set<QuadrantId>(["q1", "q2", "q3", "q4"])

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") {
    return false
  }

  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function hasOwn(input: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(input, key)
}

export function parseDateKey(value: unknown): string {
  if (value === null) {
    throw new Error("date is required")
  }

  if (typeof value !== "string") {
    throw new Error("date must be a valid calendar date in YYYY-MM-DD format")
  }

  try {
    return parseDateOnly(value).toISOString().slice(0, 10)
  } catch {
    throw new Error("date must be a valid calendar date in YYYY-MM-DD format")
  }
}

export function parsePlanningFields(value: unknown): PlanningFields {
  if (!isPlainObject(value)) {
    throw new Error("planning fields must be a plain object")
  }

  const result: PlanningFields = {}

  if (hasOwn(value, "due_date")) {
    const dueDate = value.due_date
    if (dueDate === null || dueDate === "") {
      result.due_date = null
    } else if (typeof dueDate === "string") {
      try {
        result.due_date = parseDateOnly(dueDate)
      } catch {
        throw new Error("due_date must be a valid yyyy-mm-dd value or null")
      }
    } else {
      throw new Error("due_date must be a valid yyyy-mm-dd value or null")
    }
  }

  if (hasOwn(value, "estimated_minutes")) {
    const estimatedMinutes = value.estimated_minutes
    if (estimatedMinutes === null || estimatedMinutes === "") {
      result.estimated_minutes = null
    } else if (typeof estimatedMinutes === "number" && Number.isInteger(estimatedMinutes) && estimatedMinutes > 0) {
      result.estimated_minutes = estimatedMinutes
    } else {
      throw new Error("estimated_minutes must be a positive integer or null")
    }
  }

  if (hasOwn(value, "energy_level")) {
    const energyLevel = value.energy_level
    if (energyLevel === null || energyLevel === "") {
      result.energy_level = null
    } else if (typeof energyLevel === "string" && ENERGY_LEVELS.has(energyLevel as EnergyLevel)) {
      result.energy_level = energyLevel as EnergyLevel
    } else {
      throw new Error("energy_level must be low, medium, high, or null")
    }
  }

  if (hasOwn(value, "priority_quadrant")) {
    const priorityQuadrant = value.priority_quadrant
    if (priorityQuadrant === null || priorityQuadrant === "") {
      result.priority_quadrant = null
    } else if (typeof priorityQuadrant === "string" && QUADRANT_IDS.has(priorityQuadrant as QuadrantId)) {
      result.priority_quadrant = priorityQuadrant as QuadrantId
    } else {
      throw new Error("priority_quadrant must be q1, q2, q3, q4, or null")
    }
  }

  return result
}

export function parseActionItemInput(value: unknown): ActionItemInput {
  if (!isPlainObject(value)) {
    throw new Error("action item input must be a plain object")
  }

  if (typeof value.name !== "string" || value.name.trim() === "") {
    throw new Error("name required")
  }

  const result: ActionItemInput = {
    name: value.name.trim(),
  }

  if (hasOwn(value, "description")) {
    if (value.description === null) {
      result.description = null
    } else if (typeof value.description === "string") {
      result.description = value.description.trim()
    } else {
      throw new Error("description must be a string or null")
    }
  }

  return {
    ...result,
    ...parsePlanningFields(value),
  }
}

import type { PlanningPreferenceView } from "./types"

const POSTGRESQL_INT_MAX = 2_147_483_647

export type PersistedPlanningPreferenceRow = {
  preference_id: string
  timezone: string
  day_start_minutes: number
  day_end_minutes: number
  high_energy_start_minutes: number | null
  high_energy_end_minutes: number | null
  buffer_minutes: number
  default_block_minutes: number
  capacity_warning_minutes: number
  gmt_modified: Date
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") {
    return false
  }

  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function parseTimezone(value: unknown): string {
  if (typeof value !== "string" || value === "") {
    throw new Error("timezone must be a valid IANA timezone")
  }

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format()
  } catch {
    throw new Error("timezone must be a valid IANA timezone")
  }

  return value
}

function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value)
}

function parseVersion(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null
  }

  if (typeof value !== "string") {
    throw new Error("version must be a string or null")
  }

  return value
}

export function getDefaultPlanningPreference(
  timezone = Intl.DateTimeFormat().resolvedOptions().timeZone,
): PlanningPreferenceView {
  return normalizePlanningPreference({
    preference_id: "default",
    timezone,
    day_start_minutes: 480,
    day_end_minutes: 1320,
    high_energy_start_minutes: null,
    high_energy_end_minutes: null,
    buffer_minutes: 15,
    default_block_minutes: 60,
    capacity_warning_minutes: 480,
    version: null,
  })
}

export function normalizePlanningPreference(value: unknown): PlanningPreferenceView {
  if (!isPlainObject(value)) {
    throw new Error("planning preference must be a plain object")
  }

  const timezone = parseTimezone(value.timezone)
  const dayStart = value.day_start_minutes
  const dayEnd = value.day_end_minutes
  if (!isInteger(dayStart) || !isInteger(dayEnd) || dayStart < 0 || dayStart >= dayEnd || dayEnd > 1440) {
    throw new Error("planning day must use integer minutes with 0 <= start < end <= 1440")
  }

  const highEnergyStart = value.high_energy_start_minutes
  const highEnergyEnd = value.high_energy_end_minutes
  const highEnergyWindowIsNull = highEnergyStart === null && highEnergyEnd === null
  const highEnergyWindowIsValid =
    isInteger(highEnergyStart) &&
    isInteger(highEnergyEnd) &&
    highEnergyStart >= dayStart &&
    highEnergyStart < highEnergyEnd &&
    highEnergyEnd <= dayEnd

  if (!highEnergyWindowIsNull && !highEnergyWindowIsValid) {
    throw new Error(
      "high-energy window must be null or use integer minutes inside the planning day with start < end",
    )
  }

  const bufferMinutes = value.buffer_minutes
  if (!isInteger(bufferMinutes) || bufferMinutes < 0 || bufferMinutes > POSTGRESQL_INT_MAX) {
    throw new Error("buffer_minutes must be a non-negative integer")
  }

  const defaultBlockMinutes = value.default_block_minutes
  if (!isInteger(defaultBlockMinutes) || defaultBlockMinutes <= 0 || defaultBlockMinutes > POSTGRESQL_INT_MAX) {
    throw new Error("default_block_minutes must be a positive integer")
  }

  const capacityWarningMinutes = value.capacity_warning_minutes
  if (!isInteger(capacityWarningMinutes) || capacityWarningMinutes <= 0 || capacityWarningMinutes > POSTGRESQL_INT_MAX) {
    throw new Error("capacity_warning_minutes must be a positive integer")
  }

  return {
    preference_id: "default",
    timezone,
    day_start_minutes: dayStart,
    day_end_minutes: dayEnd,
    high_energy_start_minutes: highEnergyWindowIsNull ? null : highEnergyStart,
    high_energy_end_minutes: highEnergyWindowIsNull ? null : highEnergyEnd,
    buffer_minutes: bufferMinutes,
    default_block_minutes: defaultBlockMinutes,
    capacity_warning_minutes: capacityWarningMinutes,
    version: parseVersion(value.version),
  }
}

export function toPlanningPreferenceView<T extends PersistedPlanningPreferenceRow>(
  row: T,
): PlanningPreferenceView {
  return normalizePlanningPreference({
    ...row,
    version: row.gmt_modified.toISOString(),
  })
}

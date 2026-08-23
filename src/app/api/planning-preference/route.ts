import { PrismaClient } from "@prisma/client"
import { NextRequest, NextResponse } from "next/server"

import {
  getDefaultPlanningPreference,
  normalizePlanningPreference,
  toPlanningPreferenceView,
} from "@/lib/today/planning-preference"

const prisma = new PrismaClient()
const DEFAULT_PREFERENCE_ID = "default"

function validationError(message: string) {
  return NextResponse.json({ error: message }, { status: 400 })
}

export async function GET() {
  const row = await prisma.planningPreference.findUnique({
    where: { preference_id: DEFAULT_PREFERENCE_ID },
  })

  return NextResponse.json(row ? toPlanningPreferenceView(row) : getDefaultPlanningPreference())
}

export async function PUT(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return validationError("planning preference must be a plain object")
  }

  let preference: ReturnType<typeof normalizePlanningPreference>
  try {
    preference = normalizePlanningPreference(body)
  } catch (error) {
    if (error instanceof Error) {
      return validationError(error.message)
    }
    throw error
  }

  const persistedFields = {
    timezone: preference.timezone,
    day_start_minutes: preference.day_start_minutes,
    day_end_minutes: preference.day_end_minutes,
    high_energy_start_minutes: preference.high_energy_start_minutes,
    high_energy_end_minutes: preference.high_energy_end_minutes,
    buffer_minutes: preference.buffer_minutes,
    default_block_minutes: preference.default_block_minutes,
    capacity_warning_minutes: preference.capacity_warning_minutes,
  }
  const saved = await prisma.planningPreference.upsert({
    where: { preference_id: DEFAULT_PREFERENCE_ID },
    create: {
      preference_id: DEFAULT_PREFERENCE_ID,
      ...persistedFields,
    },
    update: persistedFields,
  })

  return NextResponse.json(toPlanningPreferenceView(saved))
}

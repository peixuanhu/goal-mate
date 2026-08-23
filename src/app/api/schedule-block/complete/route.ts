import { PrismaClient } from "@prisma/client"
import { NextRequest, NextResponse } from "next/server"

import {
  completeScheduleBlock,
  type CompleteScheduleBlockInput,
} from "@/lib/today/completion-service"
import { ScheduleServiceError } from "@/lib/today/schedule-service"

const prisma = new PrismaClient()
const POST_FIELDS = new Set([
  "block_id",
  "expected_version",
  "outcome",
  "content",
  "thinking",
  "result_note",
  "plan_progress",
])

function routeValidation(message: string): never {
  throw new ScheduleServiceError("VALIDATION", message)
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false
  }
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

async function readJsonObject(req: NextRequest): Promise<Record<string, unknown>> {
  let value: unknown
  try {
    value = await req.json()
  } catch {
    routeValidation("请求体必须是有效 JSON 对象")
  }
  if (!isPlainObject(value)) {
    routeValidation("请求体必须是有效 JSON 对象")
  }
  return value
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    routeValidation(`${field} required`)
  }
  return value.trim()
}

function optionalText(
  body: Record<string, unknown>,
  field: "content" | "thinking" | "result_note",
): string | undefined {
  if (!Object.prototype.hasOwnProperty.call(body, field)) return undefined
  const value = body[field]
  if (typeof value !== "string") {
    routeValidation(`${field} must be a string`)
  }
  return value
}

function parseBody(body: Record<string, unknown>): CompleteScheduleBlockInput {
  const unexpected = Object.keys(body).find(field => !POST_FIELDS.has(field))
  if (unexpected) {
    routeValidation(`unexpected field: ${unexpected}`)
  }

  if (typeof body.expected_version !== "number"
    || !Number.isInteger(body.expected_version)
    || body.expected_version < 1) {
    routeValidation("expected_version must be a positive integer")
  }
  if (body.outcome !== "completed" && body.outcome !== "partial" && body.outcome !== "skipped") {
    routeValidation("outcome must be completed, partial, or skipped")
  }
  if (Object.prototype.hasOwnProperty.call(body, "plan_progress") && (
    typeof body.plan_progress !== "number"
    || !Number.isFinite(body.plan_progress)
    || body.plan_progress < 0
    || body.plan_progress > 1
  )) {
    routeValidation("plan_progress must be a finite number between 0 and 1")
  }

  const content = optionalText(body, "content")
  const thinking = optionalText(body, "thinking")
  const resultNote = optionalText(body, "result_note")
  return {
    block_id: requiredString(body.block_id, "block_id"),
    expected_version: body.expected_version,
    outcome: body.outcome,
    ...(content !== undefined ? { content } : {}),
    ...(thinking !== undefined ? { thinking } : {}),
    ...(resultNote !== undefined ? { result_note: resultNote } : {}),
    ...(typeof body.plan_progress === "number" ? { plan_progress: body.plan_progress } : {}),
  }
}

function toErrorResponse(error: ScheduleServiceError): NextResponse {
  const status = error.code === "VALIDATION"
    ? 400
    : error.code === "NOT_FOUND"
      ? 404
      : 409
  return NextResponse.json({
    error: error.message,
    code: error.code,
    ...(error.conflictIds ? { conflictIds: error.conflictIds } : {}),
  }, { status })
}

export async function POST(req: NextRequest) {
  try {
    const body = await readJsonObject(req)
    return NextResponse.json(await completeScheduleBlock(prisma, parseBody(body)))
  } catch (error) {
    if (error instanceof ScheduleServiceError) {
      return toErrorResponse(error)
    }
    throw error
  }
}

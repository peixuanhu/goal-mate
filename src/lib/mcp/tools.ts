import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { normalizePlanningPreference } from '@/lib/today/planning-preference'
import { GoalMateApiError, type GoalMateApiClient } from './api-client'

const id = z.string().trim().min(1).max(100)
const name = z.string().trim().min(1).max(300)
const description = z.string().max(20_000).nullable().optional()
const progress = z.number().finite().min(0).max(1).describe('Fraction between 0 and 1, e.g. 0.5 means 50%.')
const version = z.number().int().min(1).max(2_147_483_647).describe('Use the latest version returned by Goal Mate; refresh after a conflict.')
const requestId = z.string().uuid().describe('Stable client-generated UUID for this logical write. Reuse on retry; never generate a new ID for the same write.')
const idempotencyKey = z.string().min(1).max(128).regex(/^[\x21-\x7E]+$/).describe('Stable unique key for this logical creation (UUID recommended). Reuse on retry.')
const date = z.string().regex(/^[1-9]\d{3}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}, 'Must be an existing calendar date YYYY-MM-DD').describe('Local calendar date YYYY-MM-DD in the saved planning timezone; not a UTC instant.')
const timestamp = z.string().max(40).datetime({ offset: true }).refine(value => {
  return Number.isFinite(Date.parse(value)) && /(Z|[+-]\d{2}:\d{2})$/.test(value)
}, 'Must include Z or an explicit timezone offset, e.g. +08:00')
const slotMinutes = z.number().int().positive().max(2_147_483_647).multipleOf(15)
const pagination = {
  pageNum: z.number().int().min(1).max(1_000_000).default(1),
  pageSize: z.number().int().min(1).max(100).default(50),
}
const pageHelp = 'Returns {list,total}; pageNum starts at 1, pageSize defaults to 50 (max 100). Fetch successive pages until all total records are read; this is not the full dataset.'
const planningFields = {
  due_date: date.nullable().optional(),
  estimated_minutes: slotMinutes.nullable().optional(),
  energy_level: z.enum(['low', 'medium', 'high']).nullable().optional(),
  priority_quadrant: z.enum(['q1', 'q2', 'q3', 'q4']).nullable().optional(),
}
const planFields = {
  name: name.optional(), description,
  difficulty: z.enum(['easy', 'medium', 'hard', 'low', 'high']).nullable().optional(),
  progress: progress.optional(),
  is_recurring: z.boolean().optional(),
  recurrence_type: z.enum(['daily', 'weekly', 'monthly']).nullable().optional(),
  recurrence_value: z.string().regex(/^[1-9]\d{0,5}$/).nullable().optional().describe('Positive repetition count as a string, e.g. "3".'),
  goal_id: id.nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(100)).max(100).optional(),
  ...planningFields,
  // The plan REST route forwards this field directly to Prisma DateTime input.
  due_date: timestamp.nullable().optional().describe('ISO timestamp with offset, stored as a UTC calendar date. Use YYYY-MM-DDT00:00:00Z for an intended due date; null clears it.'),
  default_block_minutes: slotMinutes.nullable().optional(),
  is_scheduled: z.boolean().optional(),
}
const interval = { start_at: timestamp, end_at: timestamp }
type Arguments = Record<string, unknown>
type Mapping = { body: Arguments; idempotencyKey?: string }
type ToolOptions = {
  validate?: (args: Arguments) => void
  map?: (args: Arguments) => Mapping
  idempotent?: boolean
  destructive?: boolean
}

function invalid(message: string): never {
  throw new GoalMateApiError('VALIDATION', message, 400)
}

function requireChange(args: Arguments, identifiers: string[]): void {
  if (!Object.keys(args).some(key => !identifiers.includes(key))) invalid('At least one editable field is required')
}

function validateInterval(args: Arguments): void {
  if (Date.parse(String(args.end_at)) <= Date.parse(String(args.start_at))) invalid('end_at must be later than start_at')
}

function withIdempotency(args: Arguments): Mapping {
  const { idempotency_key, ...body } = args
  return { body, idempotencyKey: idempotency_key as string }
}

/** Explicit tool contracts; no caller-selected endpoint or arbitrary HTTP request is exposed. */
export function registerGoalMateTools(server: McpServer, api: GoalMateApiClient): void {
  function register(
    toolName: string, toolDescription: string, shape: z.ZodRawShape,
    path: string, method: 'GET' | 'POST' | 'PUT', options: ToolOptions = {},
  ) {
    server.registerTool(toolName, {
      description: toolDescription,
      inputSchema: z.object(shape).strict(),
      annotations: {
        readOnlyHint: method === 'GET',
        destructiveHint: options.destructive ?? method === 'PUT',
        idempotentHint: method === 'GET' || options.idempotent === true,
        openWorldHint: false,
      },
    }, async (args: Arguments) => {
      try {
        options.validate?.(args)
        const result = await api.request(path, method, method === 'GET'
          ? { query: args as Record<string, string | number | boolean | undefined> }
          : options.map?.(args) ?? { body: args })
        return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] }
      } catch (error) {
        const safe = error instanceof GoalMateApiError ? error : new GoalMateApiError('INTERNAL_ERROR', 'Goal Mate operation failed', 500)
        return {
          isError: true,
          content: [{ type: 'text' as const, text: JSON.stringify({ error: {
            code: safe.code, status: safe.status, message: safe.message,
            ...(safe.conflictIds ? { conflictIds: safe.conflictIds } : {}),
          } }) }],
        }
      }
    })
  }

  register('list_goals', `List goals, optionally filtered by tag. ${pageHelp}`, {
    ...pagination, tag: z.string().max(100).optional(),
  }, '/api/goal', 'GET')
  register('create_goal', 'Create a goal. No automatic retry: this endpoint has no idempotency key; check existing goals after an uncertain response.', {
    name, tag: z.string().trim().min(1).max(100), description,
  }, '/api/goal', 'POST')
  register('update_goal', 'Update the supplied goal fields. Omitted fields are unchanged; null clears description.', {
    goal_id: id, name: name.optional(), tag: z.string().trim().min(1).max(100).optional(), description,
  }, '/api/goal', 'PUT', { validate: args => requireChange(args, ['goal_id']) })
  register('list_plans', `List plans. goal_id takes precedence over tag; unassigned selects plans without a goal. ${pageHelp}`, {
    ...pagination, tag: z.string().max(100).optional(), difficulty: planFields.difficulty.unwrap().unwrap().optional(),
    goal_id: id.optional(), is_scheduled: z.boolean().optional(), priority_quadrant: z.enum(['q1', 'q2', 'q3', 'q4']).optional(),
    unscheduled: z.boolean().optional(), unassigned: z.boolean().optional(),
  }, '/api/plan', 'GET')
  register('create_plan', 'Create a plan. Recurring plans cannot have a total estimated_minutes. Minutes use increments of 15. No idempotency: inspect existing plans before retrying an uncertain write.', {
    ...planFields, name,
  }, '/api/plan', 'POST')
  register('update_plan', 'Update only supplied plan fields. To move a plan, supply goal_id (null to detach) and expected_goal_id from the latest read. Recurrence changes may conflict with execution history.', {
    ...planFields, plan_id: id, expected_goal_id: id.nullable().optional(),
  }, '/api/plan', 'PUT', { validate: args => requireChange(args, ['plan_id', 'expected_goal_id']) })
  register('list_progress', `List progress records, optionally for a plan. ${pageHelp}`, {
    ...pagination, plan_id: id.optional(),
  }, '/api/progress_record', 'GET')
  register('create_progress', 'Create a progress record with stable request_id for safe retries. custom_time is an ISO timestamp with offset; omitted means now. plan_progress is 0–1. Metrics use tracker/revision IDs from list_trackers.', {
    plan_id: id, request_id: requestId,
    content: z.string().max(100_000).optional(), thinking: z.string().max(100_000).optional(),
    custom_time: timestamp.optional(), outcome: z.enum(['completed', 'partial', 'skipped']).nullable().optional(),
    plan_progress: progress.optional(),
    metrics: z.array(z.discriminatedUnion('status', [
      z.object({ tracker_id: id, revision_id: id, status: z.literal('recorded'), value: z.union([z.string().max(100), z.boolean()]), note: z.string().max(4000) }).strict(),
      z.object({ tracker_id: id, revision_id: id, status: z.literal('skipped'), value: z.null(), note: z.string().max(4000) }).strict(),
      z.object({ tracker_id: id, revision_id: id, status: z.literal('cleared'), value: z.null(), note: z.string().max(4000) }).strict(),
    ])).max(1000).optional(),
  }, '/api/progress_record', 'POST', { idempotent: true, destructive: true })
  register('get_today', 'Read the daily workspace for the requested local date in the saved planning timezone, including schedule, available slots and tasks.', { date }, '/api/today', 'GET')
  register('list_tags', 'Read all distinct goal and plan tags.', {}, '/api/tag', 'GET')
  register('get_journal_month', 'Read one journal calendar month in the saved planning timezone, including tracker values and events.', {
    month: z.string().regex(/^[1-9]\d{3}-(0[1-9]|1[0-2])$/).describe('Calendar month YYYY-MM.'),
  }, '/api/journal/month', 'GET')
  register('list_trackers', 'Read tracker definitions and revisions for interpreting journal values and progress metrics.', {}, '/api/journal/trackers', 'GET')
  register('get_weekly_report', 'Read a weekly summary. weekStart must be Monday YYYY-MM-DD, always interpreted in Asia/Shanghai (independent of planning timezone). Omit for the current Shanghai week.', {
    weekStart: date.refine(value => new Date(`${value}T00:00:00Z`).getUTCDay() === 1, 'weekStart must be Monday').optional(),
  }, '/api/report/weekly', 'GET')
  register('get_planning_preferences', 'Read saved timezone, daily planning boundaries, energy window and default durations. Read before scheduling local dates.', {}, '/api/planning-preference', 'GET')
  register('update_planning_preferences', 'Replace all planning preferences. Read current preferences first and send every field; this endpoint has no version check. All *_minutes are integer minutes; day/energy boundaries are minutes after local midnight.', {
    timezone: z.string().min(1).max(100),
    day_start_minutes: z.number().int().min(0).max(1439), day_end_minutes: z.number().int().min(1).max(1440),
    high_energy_start_minutes: z.number().int().min(0).max(1439).nullable(), high_energy_end_minutes: z.number().int().min(1).max(1440).nullable(),
    buffer_minutes: z.number().int().min(0).max(2_147_483_647), default_block_minutes: slotMinutes,
    capacity_warning_minutes: z.number().int().min(1).max(2_147_483_647),
  }, '/api/planning-preference', 'PUT', { validate: args => {
    try { normalizePlanningPreference(args) }
    catch (error) { invalid(error instanceof Error ? error.message : 'Invalid planning preferences') }
  } })
  register('list_action_items', 'List all action items for one ordinary (non-recurring) plan.', { plan_id: id }, '/api/action-item', 'GET')
  register('create_action_item', 'Create an action item under an ordinary plan. Reuse idempotency_key on retry. due_date is a calendar date; estimated_minutes uses increments of 15.', {
    plan_id: id, name, description, ...planningFields, idempotency_key: idempotencyKey,
  }, '/api/action-item', 'POST', { map: withIdempotency, idempotent: true })
  register('update_action_item', 'Update supplied action item fields; is_completed marks completion or reopens it. null clears nullable fields.', {
    action_id: id, name: name.optional(), description, ...planningFields, is_completed: z.boolean().optional(),
  }, '/api/action-item', 'PUT', { validate: args => requireChange(args, ['action_id']) })
  register('list_schedule_blocks', 'Read all schedule blocks intersecting a local calendar date in the saved planning timezone, including terminal statuses and versions.', { date }, '/api/schedule-block', 'GET')
  const scheduleHelp = 'Use ISO timestamps with explicit offsets. Boundaries must align to the saved 15-minute grid, fit one local date (end may be next midnight), and respect conflicts/time budget.'
  register('create_schedule_block', `Schedule a plan or action item, recorded with source ai_chat. Reuse the same idempotency_key on retries. ${scheduleHelp}`, {
    plan_id: id, action_id: id.nullable().optional(), ...interval, idempotency_key: idempotencyKey,
  }, '/api/schedule-block', 'POST', {
    validate: validateInterval, idempotent: true,
    map: args => { const mapped = withIdempotency(args); return { ...mapped, body: { ...mapped.body, source: 'ai_chat' } } },
  })
  register('update_schedule_block', `Move or resize a block using its latest expected_version. ${scheduleHelp}`, {
    block_id: id, expected_version: version, ...interval,
  }, '/api/schedule-block', 'PUT', { validate: validateInterval, map: args => ({ body: { ...args, operation: 'update' } }) })
  register('cancel_schedule_block', 'Cancel a schedule block using its latest expected_version. Retains history. On conflict, read the current block before deciding again.', {
    block_id: id, expected_version: version,
  }, '/api/schedule-block', 'PUT', { map: args => ({ body: { ...args, operation: 'cancel' } }) })
  register('complete_schedule_block', 'Complete a block with outcome completed, partial or skipped. Use its latest expected_version. Writes linked progress; plan_progress is 0–1. Refresh after conflicts; never invent a newer version.', {
    block_id: id, expected_version: version, outcome: z.enum(['completed', 'partial', 'skipped']),
    content: z.string().max(100_000).optional(), thinking: z.string().max(100_000).optional(), plan_progress: progress.optional(),
  }, '/api/schedule-block/complete', 'POST', { destructive: true })
}

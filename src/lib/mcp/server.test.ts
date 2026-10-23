import { createHash, webcrypto } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { handleMcpRequest } from './server'
import { createGoalMateApiClient } from './api-client'

const token = 'test-mcp-only'
const requestId = '1c194ec3-e716-48ac-a3cd-026369c1c492'
const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream' }
const fetcher = vi.fn<typeof fetch>()
const apiClient = createGoalMateApiClient({ fetch: fetcher, credentials: () => 'test-cookie' })
const rpc = (method: string, params: unknown = {}, id = 1) => handleMcpRequest(new Request('https://example.com/api/mcp', {
  method: 'POST', headers, body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
}), { apiClient })
const call = async (name: string, args: unknown) => (await rpc('tools/call', { name, arguments: args })).json()

beforeEach(() => {
  // Next supplies this on Node 18; Vitest does not. Node 20+ has it natively.
  vi.stubGlobal('crypto', webcrypto)
  vi.stubEnv('GOAL_MATE_MCP_TOKEN_SHA256', createHash('sha256').update(token).digest('hex'))
  fetcher.mockReset().mockImplementation(async () => Response.json({ list: [], total: 0 }))
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

describe('stateless MCP protocol over the official SDK', () => {
  it('initializes and lists explicitly bounded tools without session state', async () => {
    const init = await rpc('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test', version: '1' } })
    expect(init.status).toBe(200)
    expect(init.headers.has('mcp-session-id')).toBe(false)
    expect(await init.json()).toMatchObject({ result: { serverInfo: { name: 'goal-mate' }, capabilities: { tools: {} } } })
    const { result } = await (await rpc('tools/list')).json()
    expect(result.tools.map((tool: { name: string }) => tool.name)).toEqual(expect.arrayContaining([
      'list_goals', 'create_goal', 'update_goal', 'list_plans', 'create_plan', 'update_plan',
      'list_progress', 'create_progress', 'get_today', 'list_tags', 'get_journal_month', 'list_trackers',
      'get_weekly_report', 'get_planning_preferences', 'update_planning_preferences',
      'list_action_items', 'create_action_item', 'update_action_item', 'list_schedule_blocks',
      'create_schedule_block', 'update_schedule_block', 'cancel_schedule_block', 'complete_schedule_block',
    ]))
    expect(result.tools.some((tool: { name: string }) => /delete|request|fetch/.test(tool.name))).toBe(false)
    const listGoals = result.tools.find((tool: { name: string }) => tool.name === 'list_goals')
    expect(listGoals.annotations.readOnlyHint).toBe(true)
    expect(listGoals.inputSchema.additionalProperties).toBe(false)
    expect(listGoals.inputSchema.properties.pageSize.maximum).toBe(100)
    // A progress write can also replace the plan's percentage, so it is not purely additive.
    expect(result.tools.find((tool: { name: string }) => tool.name === 'create_progress').annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true, idempotentHint: true })
  })

  it('returns full REST pagination metadata and sends bounded default pagination', async () => {
    fetcher.mockResolvedValueOnce(Response.json({ list: [{ goal_id: 'goal_1' }], total: 201 }))
    const result = await call('list_goals', {})
    expect(JSON.parse(result.result.content[0].text)).toEqual({ list: [{ goal_id: 'goal_1' }], total: 201 })
    expect(String(fetcher.mock.calls[0][0])).toContain('pageNum=1&pageSize=50')
  })

  it.each([
    ['create_goal', { name: 'Learn', tag: 'Study' }, '/api/goal', 'POST'],
    ['update_goal', { goal_id: 'g', description: null }, '/api/goal', 'PUT'],
    ['list_plans', { goal_id: 'g', pageNum: 2, pageSize: 10 }, '/api/plan', 'GET'],
    ['create_plan', { name: 'Read', progress: 0.5, due_date: '2026-10-24T00:00:00Z' }, '/api/plan', 'POST'],
    ['update_plan', { plan_id: 'p', goal_id: null, expected_goal_id: 'g' }, '/api/plan', 'PUT'],
    ['list_progress', { plan_id: 'p', pageNum: 2, pageSize: 10 }, '/api/progress_record', 'GET'],
    ['get_today', { date: '2026-10-24' }, '/api/today', 'GET'],
    ['list_tags', {}, '/api/tag', 'GET'],
    ['get_journal_month', { month: '2026-10' }, '/api/journal/month', 'GET'],
    ['list_trackers', {}, '/api/journal/trackers', 'GET'],
    ['get_weekly_report', { weekStart: '2026-10-19' }, '/api/report/weekly', 'GET'],
    ['get_planning_preferences', {}, '/api/planning-preference', 'GET'],
    ['update_planning_preferences', { timezone: 'Asia/Shanghai', day_start_minutes: 0, day_end_minutes: 1440, high_energy_start_minutes: null, high_energy_end_minutes: null, buffer_minutes: 15, default_block_minutes: 60, capacity_warning_minutes: 480 }, '/api/planning-preference', 'PUT'],
    ['list_action_items', { plan_id: 'p' }, '/api/action-item', 'GET'],
    ['update_action_item', { action_id: 'a', is_completed: true }, '/api/action-item', 'PUT'],
    ['list_schedule_blocks', { date: '2026-10-24' }, '/api/schedule-block', 'GET'],
  ])('maps %s only to its documented REST endpoint', async (name, args, path, method) => {
    const result = await call(name, args)
    expect(result.result?.isError).not.toBe(true)
    expect(fetcher).toHaveBeenCalledTimes(1)
    const [url, options] = fetcher.mock.calls[0]
    expect(new URL(String(url)).pathname).toBe(path)
    expect(options?.method).toBe(method)
    if (method === 'GET') expect(Object.fromEntries(new URL(String(url)).searchParams)).toEqual(Object.fromEntries(Object.entries(args).map(([key, value]) => [key, String(value)])))
    else expect(JSON.parse(String(options?.body))).toEqual(args)
  })

  it('creates an action item with a stable idempotency header', async () => {
    await call('create_action_item', { plan_id: 'p', name: 'Read chapter', due_date: '2026-10-24', idempotency_key: requestId })
    const [, options] = fetcher.mock.calls[0]
    expect(new Headers(options?.headers).get('Idempotency-Key')).toBe(requestId)
    expect(JSON.parse(String(options?.body))).toEqual({ plan_id: 'p', name: 'Read chapter', due_date: '2026-10-24' })
  })

  it.each([
    ['get_today', { date: '2026-02-30' }], ['get_journal_month', { month: '2026-13' }],
    ['list_goals', { all: true }], ['list_goals', { pageSize: 101 }],
    ['create_plan', { name: 'Example', progress: 50 }],
    ['create_plan', { name: 'Example', due_date: '2026-10-24' }],
    ['update_goal', { goal_id: 'g' }], ['update_plan', { plan_id: 'p', position: 1 }],
    ['update_action_item', { action_id: 'a' }],
    ['create_plan', { name: 'Example', estimated_minutes: 14 }],
    ['get_weekly_report', { weekStart: '2026-10-20' }],
    ['create_progress', { plan_id: 'p', request_id: 'not-a-uuid' }],
    ['update_planning_preferences', { timezone: 'Invalid/Zone', day_start_minutes: 0, day_end_minutes: 1440, high_energy_start_minutes: null, high_energy_end_minutes: null, buffer_minutes: 15, default_block_minutes: 60, capacity_warning_minutes: 480 }],
    ['update_planning_preferences', { timezone: 'Asia/Shanghai', day_start_minutes: 900, day_end_minutes: 800, high_energy_start_minutes: null, high_energy_end_minutes: null, buffer_minutes: 15, default_block_minutes: 60, capacity_warning_minutes: 480 }],
    ['create_progress', { plan_id: 'plan_1', content: 'x' }],
    ['create_progress', { plan_id: 'plan_1', request_id: requestId, custom_time: '2026-10-24T10:00:00' }],
    ['create_schedule_block', { plan_id: 'p', idempotency_key: requestId, start_at: '2026-10-24T10:00:00+08:00', end_at: '2026-10-24T09:00:00+08:00' }],
    ['update_schedule_block', { block_id: 'b', expected_version: 0, start_at: '2026-10-24T10:00:00Z', end_at: '2026-10-24T11:00:00Z' }],
  ])('rejects invalid arguments for %s before calling REST', async (name, args) => {
    const result = await call(name, args)
    expect(result.result?.isError).toBe(true)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('rejects unknown tools', async () => {
    const result = await call('arbitrary_request', { url: 'https://evil.test' })
    expect(result.result?.isError).toBe(true)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('preserves caller progress request_id across retries', async () => {
    const args = { plan_id: 'p', request_id: requestId, content: 'done', plan_progress: 0.5 }
    await call('create_progress', args)
    await call('create_progress', args)
    expect(fetcher.mock.calls.map(([, options]) => JSON.parse(String(options?.body)))).toEqual([args, args])
  })

  it('maps schedule idempotency only to the header and marks source ai_chat', async () => {
    const args = { plan_id: 'p', idempotency_key: requestId, start_at: '2026-10-24T10:00:00+08:00', end_at: '2026-10-24T11:00:00+08:00' }
    await call('create_schedule_block', args)
    const [, options] = fetcher.mock.calls[0]
    expect(new Headers(options?.headers).get('Idempotency-Key')).toBe(requestId)
    expect(JSON.parse(String(options?.body))).toEqual({ plan_id: 'p', start_at: args.start_at, end_at: args.end_at, source: 'ai_chat' })
  })

  it.each([
    ['update_schedule_block', { block_id: 'b', expected_version: 3, start_at: '2026-10-24T10:00:00Z', end_at: '2026-10-24T11:00:00Z' }, 'update'],
    ['cancel_schedule_block', { block_id: 'b', expected_version: 3 }, 'cancel'],
    ['complete_schedule_block', { block_id: 'b', expected_version: 3, outcome: 'completed', plan_progress: 1 }, undefined],
  ])('preserves expected_version for %s', async (name, args, operation) => {
    await call(name, args)
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toEqual(operation ? { ...args, operation } : args)
  })

  it('returns structured conflicts as tool errors while hiding backend internals', async () => {
    fetcher.mockResolvedValueOnce(Response.json({ error: '版本已变化', code: 'STALE_VERSION' }, { status: 409 }))
    const result = await call('cancel_schedule_block', { block_id: 'b', expected_version: 2 })
    expect(result.result.isError).toBe(true)
    expect(JSON.parse(result.result.content[0].text)).toMatchObject({ error: { code: 'STALE_VERSION', status: 409, message: '版本已变化' } })
  })

  it('authenticates before reading malformed bodies', async () => {
    const request = new Request('https://example.com/api/mcp', { method: 'POST', body: '{ private bad json' })
    expect((await handleMcpRequest(request, { apiClient })).status).toBe(401)
    expect(request.bodyUsed).toBe(false)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it.each(['GET', 'DELETE'])('%s authenticates then returns 405 with Allow POST', async method => {
    expect((await handleMcpRequest(new Request('https://example.com/api/mcp', { method }), { apiClient })).status).toBe(401)
    const response = await handleMcpRequest(new Request('https://example.com/api/mcp', { method, headers }), { apiClient })
    expect(response.status).toBe(405)
    expect(response.headers.get('allow')).toBe('POST')
  })

  it('bounds request bodies and handles malformed JSON safely', async () => {
    const huge = await handleMcpRequest(new Request('https://example.com/api/mcp', { method: 'POST', headers, body: 'x'.repeat(256 * 1024 + 1) }), { apiClient })
    expect(huge.status).toBe(413)
    const invalid = await handleMcpRequest(new Request('https://example.com/api/mcp', { method: 'POST', headers, body: '{private-input' }), { apiClient })
    expect(invalid.status).toBe(400)
    expect(await invalid.text()).not.toContain('private-input')
  })
})

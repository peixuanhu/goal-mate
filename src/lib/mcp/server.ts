import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { authenticateMcp } from './auth'
import { createGoalMateApiClient, type GoalMateApiClient } from './api-client'
import { registerGoalMateTools } from './tools'

export async function handleMcpRequest(request: Request, options: { apiClient?: GoalMateApiClient } = {}): Promise<Response> {
  const rejected = authenticateMcp(request)
  if (rejected) return rejected
  if (request.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405, headers: { Allow: 'POST' } })
  }

  const server = new McpServer({ name: 'goal-mate', version: '1.0.0' })
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
    maxRequestBodySize: 256 * 1024,
  })
  try {
    registerGoalMateTools(server, options.apiClient ?? createGoalMateApiClient())
    await server.connect(transport)
    const response = await transport.handleRequest(request)
    // SDK errors can include diagnostic `data`; keep transport failures generic.
    if (response.status >= 400) {
      await response.body?.cancel()
      return Response.json({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid MCP HTTP request' } }, {
        status: response.status,
        headers: { 'Cache-Control': 'no-store' },
      })
    }
    response.headers.set('Cache-Control', 'no-store')
    return response
  } catch {
    return Response.json({ jsonrpc: '2.0', id: null, error: { code: -32603, message: 'MCP request failed' } }, { status: 500 })
  } finally {
    // JSON mode resolves only once the reply is complete; no session/SSE survives this POST.
    await server.close().catch(() => undefined)
    await transport.close().catch(() => undefined)
  }
}

// Run after `npm run build`. Starts an isolated standalone server with synthetic
// credentials and an unreachable database; never targets the deployed service.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomBytes, createHash, webcrypto } from 'node:crypto'
import { cp, readdir, readFile, access } from 'node:fs/promises'
import { createServer } from 'node:net'
import path from 'node:path'
import { once } from 'node:events'
import jwt from 'jsonwebtoken'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

globalThis.crypto ??= webcrypto
const root = process.cwd()
const standalone = path.join(root, '.next/standalone')
await access(path.join(standalone, 'server.js'))
await cp(path.join(root, '.next/static'), path.join(standalone, '.next/static'), { recursive: true })
await cp(path.join(root, 'public'), path.join(standalone, 'public'), { recursive: true })

async function routeFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  return (await Promise.all(entries.map(entry => entry.isDirectory()
    ? routeFiles(path.join(dir, entry.name))
    : entry.name === 'route.ts' ? [path.join(dir, entry.name)] : []))).flat()
}
const endpoints = []
const apiDir = path.join(root, 'src/app/api')
for (const file of await routeFiles(apiDir)) {
  const url = '/api/' + path.relative(apiDir, path.dirname(file)).split(path.sep).join('/')
  if (['/api/auth/login', '/api/mcp'].includes(url)) continue
  const source = await readFile(file, 'utf8')
  for (const match of source.matchAll(/export\s+(?:(?:async\s+)?function|const)\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g)) {
    endpoints.push({ url, method: match[1] })
  }
}
assert(endpoints.length >= 40, 'Private route inventory unexpectedly empty or incomplete')

const listener = createServer()
listener.listen(0, '127.0.0.1')
await once(listener, 'listening')
const port = listener.address().port
await new Promise((resolve, reject) => listener.close(error => error ? reject(error) : resolve()))
const base = `http://127.0.0.1:${port}`
const username = 'auth-smoke-user'
const password = randomBytes(32).toString('hex')
const secret = randomBytes(32).toString('hex')
const mcpToken = randomBytes(32).toString('hex')
const server = spawn(process.execPath, ['server.js'], {
  cwd: standalone,
  env: {
    ...process.env, NODE_ENV: 'production', PORT: String(port), HOSTNAME: '127.0.0.1',
    AUTH_USERNAME: username, AUTH_PASSWORD: password, AUTH_SECRET: secret,
    GOAL_MATE_MCP_TOKEN_SHA256: createHash('sha256').update(mcpToken).digest('hex'),
    OPENAI_API_KEY: 'local-auth-test-only', OPENAI_BASE_URL: 'http://127.0.0.1:1',
    DATABASE_URL: 'postgresql://auth_test:auth_test@127.0.0.1:1/auth_test?connect_timeout=1',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})
// Do not print server output or credentials. Keep a bounded log for diagnosis.
let serverLog = ''
for (const stream of [server.stdout, server.stderr]) stream.on('data', data => {
  serverLog = (serverLog + data).slice(-16000)
})
let requestCount = 0
async function check(url, expected, init = {}) {
  const res = await fetch(base + url, { ...init, redirect: 'manual', signal: AbortSignal.timeout(5000) })
  await res.arrayBuffer()
  requestCount++
  assert.equal(res.status, expected, `${init.method ?? 'GET'} ${url}`)
  return res
}
let client
try {
  let ready = false
  for (let attempt = 0; attempt < 40; attempt++) {
    assert.equal(server.exitCode, null, 'Standalone server exited before readiness')
    try {
      const res = await fetch(base + '/login', { signal: AbortSignal.timeout(500) })
      await res.arrayBuffer()
      if (res.status === 200) { ready = true; break }
    } catch { /* Server still starting. */ }
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  assert(ready, 'Standalone server failed to become ready')

  const expired = jwt.sign({ username }, secret, { expiresIn: -1 })
  for (const cookie of ['', 'auth-token=forged', `auth-token=${expired}`]) {
    for (const { url, method } of endpoints) {
      await check(url, 401, {
        method, headers: { Cookie: cookie, 'Content-Type': 'application/json' },
        ...(['POST', 'PUT', 'PATCH'].includes(method) ? { body: '{' } : {}),
      })
    }
  }
  for (const url of ['/api/goal.json', '/api/auth/login-extra', '/api/auth/login/extra', '/api/mcp/extra', '/api/debug/env.json']) {
    await check(url, 401)
  }
  await check('/api/goal', 401, { headers: { 'x-middleware-subrequest': 'src/middleware:src/middleware:src/middleware:src/middleware:src/middleware' } })
  await check('/goals', 307)
  await check('/login', 200)
  await check('/icon.svg', 200)
  await check('/globe.svg', 200)
  await check('/api/mcp', 401)
  const login = await check('/api/auth/login', 200, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }),
  })
  const cookie = login.headers.get('set-cookie')?.split(';')[0]
  assert(cookie?.startsWith('auth-token='), 'Login did not issue a session')
  await check('/api/auth/me', 200, { headers: { Cookie: cookie } })
  await check('/api/debug/env', 200, { headers: { Cookie: cookie } })
  await check('/api/copilotkit/health', 200, { headers: { Cookie: cookie } })
  await check('/api/mcp', 401, { headers: { Cookie: cookie } })
  await check('/api/auth/logout', 200, { method: 'POST', headers: { Cookie: cookie } })

  client = new Client({ name: 'goal-mate-auth-smoke', version: '1.0.0' })
  await client.connect(new StreamableHTTPClientTransport(new URL(base + '/api/mcp'), {
    requestInit: { headers: { Authorization: `Bearer ${mcpToken}` } },
  }))
  const { tools } = await client.listTools()
  assert.equal(tools.length, 23)
  console.log(`Standalone authentication verified: ${endpoints.length} private API methods, ${requestCount} HTTP checks, valid login, 23 MCP tools.`)
} catch (error) {
  // Only fixed test credentials can enter this isolated server; still redact them.
  let safeLog = serverLog
  for (const credential of [password, secret, mcpToken]) safeLog = safeLog.replaceAll(credential, '[redacted]')
  console.error(safeLog)
  throw error
} finally {
  await client?.close()
  const exited = once(server, 'exit')
  if (server.exitCode === null) {
    server.kill('SIGTERM')
    const forceStop = setTimeout(() => server.kill('SIGKILL'), 5000)
    await exited
    clearTimeout(forceStop)
  }
}

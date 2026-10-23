import { handleMcpRequest } from '@/lib/mcp/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function POST(request: Request): Promise<Response> { return handleMcpRequest(request) }
export const GET = POST
export const DELETE = POST
export const PUT = POST
export const PATCH = POST
export const OPTIONS = POST
export const HEAD = POST

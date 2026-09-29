import { NextResponse } from 'next/server'
import { denyIfLocked } from '@/lib/guard'
import { refreshWorkspace } from '@/lib/refresh'
import { refreshSchema } from '@/lib/schemas'
import { workspaceResponse } from '@/lib/workspace-response'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const denied = denyIfLocked(request)
  if (denied) return denied
  const parsed = refreshSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 })
  }
  return NextResponse.json(workspaceResponse(await refreshWorkspace(parsed.data.projectId)))
}

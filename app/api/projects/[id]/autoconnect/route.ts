import { NextResponse } from 'next/server'
import { autoconnectProject } from '@/lib/autoconnect'
import { denyIfLocked } from '@/lib/guard'
import { withLock } from '@/lib/lock'
import { refreshWorkspace } from '@/lib/refresh'
import { workspaceResponse } from '@/lib/workspace-response'

export const runtime = 'nodejs'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = denyIfLocked(request)
  if (denied) return denied
  const { id } = await params
  const result = await withLock(() => autoconnectProject(id))
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 404 })
  const linked = result.items.some((item) => item.state === 'enlazado')
  const data = linked ? await refreshWorkspace(id) : undefined
  return NextResponse.json({
    items: result.items,
    hints: result.hints,
    ...(data ? workspaceResponse(data) : {}),
  })
}

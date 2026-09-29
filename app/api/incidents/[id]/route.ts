import { NextResponse } from 'next/server'
import { appendAudit } from '@/lib/audit'
import { denyIfLocked } from '@/lib/guard'
import { incidentPatchSchema } from '@/lib/schemas'
import { loadWorkspace, saveWorkspace } from '@/lib/store'
import { workspaceResponse } from '@/lib/workspace-response'

export const runtime = 'nodejs'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = denyIfLocked(request)
  if (denied) return denied
  const { id } = await params
  const parsed = incidentPatchSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Estado inválido' }, { status: 400 })
  }
  const data = loadWorkspace()
  const incident = data.incidents.find((item) => item.id === id)
  if (!incident) return NextResponse.json({ error: 'No existe' }, { status: 404 })
  const now = new Date().toISOString()
  incident.status = parsed.data.status
  incident.resolvedAt = parsed.data.status === 'resolved' ? now : undefined
  if (parsed.data.status === 'acknowledged') incident.acknowledgedAt = now
  if (parsed.data.status === 'open') incident.acknowledgedAt = undefined
  saveWorkspace(data)
  if (parsed.data.status === 'resolved') {
    appendAudit({ type: 'incident.resolved', label: incident.title })
  }
  return NextResponse.json(workspaceResponse(data))
}

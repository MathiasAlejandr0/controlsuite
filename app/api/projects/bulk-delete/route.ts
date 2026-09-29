import { NextResponse } from 'next/server'
import { appendAudit } from '@/lib/audit'
import { denyIfLocked } from '@/lib/guard'
import { projectBulkDeleteSchema } from '@/lib/schemas'
import { removeProjects } from '@/lib/store'
import { workspaceResponse } from '@/lib/workspace-response'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const denied = denyIfLocked(request)
  if (denied) return denied
  const parsed = projectBulkDeleteSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Elegí al menos un proyecto.' }, { status: 400 })
  }
  const data = removeProjects(parsed.data.ids)
  appendAudit({
    type: 'project.deleted',
    label: parsed.data.ids.length === 1 ? parsed.data.ids[0] : `${parsed.data.ids.length} proyectos`,
  })
  return NextResponse.json(workspaceResponse(data))
}

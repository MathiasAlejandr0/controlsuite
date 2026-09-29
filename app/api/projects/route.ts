import { NextResponse } from 'next/server'
import { isBlockedPath } from '@/lib/disk'
import { denyIfLocked } from '@/lib/guard'
import { createProjectFromDraft } from '@/lib/project-factory'
import { refreshWorkspace } from '@/lib/refresh'
import { projectDraftSchema } from '@/lib/schemas'
import { loadWorkspace, upsertProject } from '@/lib/store'
import { workspaceResponse } from '@/lib/workspace-response'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const denied = denyIfLocked(request)
  if (denied) return denied
  const parsed = projectDraftSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Nombre, tipo y path local son obligatorios.' }, { status: 400 })
  }
  if (!parsed.data.localPath.startsWith('github://') && isBlockedPath(parsed.data.localPath)) {
    return NextResponse.json({ error: 'Ese path del sistema no se puede usar.' }, { status: 400 })
  }
  const existing = loadWorkspace()
  const project = createProjectFromDraft(
    parsed.data,
    existing.projects.map((item) => item.id),
  )
  upsertProject(project)
  return NextResponse.json({
    ...workspaceResponse(await refreshWorkspace(project.id)),
    createdId: project.id,
  })
}

export function GET(request: Request) {
  const denied = denyIfLocked(request)
  if (denied) return denied
  return NextResponse.json(workspaceResponse(loadWorkspace()).projects)
}

import { NextResponse } from 'next/server'
import { appendAudit } from '@/lib/audit'
import { denyIfLocked } from '@/lib/guard'
import { isBlockedPath } from '@/lib/disk'
import { withLock } from '@/lib/lock'
import { applyProjectPatch } from '@/lib/project-patch'
import { projectPatchSchema } from '@/lib/schemas'
import { loadWorkspace, removeProject, saveWorkspace } from '@/lib/store'
import { workspaceResponse } from '@/lib/workspace-response'

export const runtime = 'nodejs'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = denyIfLocked(request)
  if (denied) return denied
  const { id } = await params
  const parsed = projectPatchSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 })
  }
  const patch = parsed.data
  if (patch.localPath && !patch.localPath.startsWith('github://') && isBlockedPath(patch.localPath)) {
    return NextResponse.json({ error: 'Ese path del sistema no se puede usar.' }, { status: 400 })
  }
  return withLock(() => {
    const data = loadWorkspace()
    const index = data.projects.findIndex((project) => project.id === id)
    if (index < 0) return NextResponse.json({ error: 'No existe' }, { status: 404 })
    data.projects[index] = applyProjectPatch(data.projects[index], patch)
    saveWorkspace(data)
    return NextResponse.json(workspaceResponse(data))
  })
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = denyIfLocked(request)
  if (denied) return denied
  const { id } = await params
  const data = removeProject(id)
  appendAudit({ type: 'project.deleted', label: id })
  return NextResponse.json(workspaceResponse(data))
}

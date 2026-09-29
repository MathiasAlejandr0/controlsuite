import { NextResponse } from 'next/server'
import { denyIfLocked } from '@/lib/guard'
import { syncProjectGit } from '@/lib/git-sync'
import { withLock } from '@/lib/lock'
import { loadWorkspace, saveWorkspace } from '@/lib/store'
import { workspaceResponse } from '@/lib/workspace-response'

export const runtime = 'nodejs'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = denyIfLocked(request)
  if (denied) return denied
  const { id } = await params
  return withLock(async () => {
    const data = loadWorkspace()
    const project = data.projects.find((item) => item.id === id)
    if (!project) return NextResponse.json({ error: 'No existe' }, { status: 404 })
    const result = await syncProjectGit(project, data.profile.scanRoots)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
    if (result.path && result.path !== project.localPath) {
      project.localPath = result.path
      saveWorkspace(data)
    }
    return NextResponse.json({ ...workspaceResponse(data), detail: result.detail })
  })
}

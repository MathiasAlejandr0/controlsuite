import { existsSync } from 'node:fs'
import { NextResponse } from 'next/server'
import { denyIfLocked } from '@/lib/guard'
import { analyzeDirectory } from '@/lib/disk'
import { withLock } from '@/lib/lock'
import { applyProjectPatch } from '@/lib/project-patch'
import { dropCloudServicesNotInNeeds, ensureNeedServices } from '@/lib/project-factory'
import { loadWorkspace, saveWorkspace } from '@/lib/store'
import { workspaceResponse } from '@/lib/workspace-response'

export const runtime = 'nodejs'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = denyIfLocked(request)
  if (denied) return denied
  const { id } = await params
  return withLock(() => {
    const data = loadWorkspace()
    const index = data.projects.findIndex((project) => project.id === id)
    if (index < 0) return NextResponse.json({ error: 'No existe' }, { status: 404 })
    const project = data.projects[index]
    if (!project.localPath || project.localPath.startsWith('github://') || !existsSync(project.localPath)) {
      return NextResponse.json({ error: 'No hay carpeta local para analizar.' }, { status: 400 })
    }
    const analysis = analyzeDirectory(project.localPath)
    const needs = analysis.draft.needs ?? []
    const patched = applyProjectPatch(project, {
      kind: analysis.draft.kind,
      githubRepo: analysis.draft.githubRepo,
      vercelProject: analysis.draft.vercelProject,
      cloudflareZone: analysis.draft.cloudflareZone,
      supabaseRef: analysis.draft.supabaseRef,
      insforgeProject: analysis.draft.insforgeProject,
      sentryProject: analysis.draft.sentryProject,
      productionUrl: analysis.draft.productionUrl ?? project.productionUrl,
    })
    data.projects[index] = ensureNeedServices(dropCloudServicesNotInNeeds(patched, needs), needs)
    saveWorkspace(data)
    return NextResponse.json({
      ...workspaceResponse(data),
      needs: analysis.needs,
    })
  })
}

import { NextResponse } from 'next/server'
import { denyIfLocked } from '@/lib/guard'
import { workspaceResponse } from '@/lib/workspace-response'
import { normalizeRepo } from '@/lib/connectors/github'
import {
  analyzeDirectory,
  importedPathSet,
  isIgnoredRemote,
  isUnderAllowedRoot,
  normalizeDiskPath,
  resolveDirectory,
  resolveScanRoots,
} from '@/lib/disk'
import { createProjectFromDraft } from '@/lib/project-factory'
import { reconcileProjectFromDisk } from '@/lib/reconcile'
import { refreshWorkspace } from '@/lib/refresh'
import { projectImportSchema } from '@/lib/schemas'
import { loadWorkspace, upsertProjects } from '@/lib/store'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const denied = denyIfLocked(request)
  if (denied) return denied
  const parsed = projectImportSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Elegí al menos una carpeta.' }, { status: 400 })
  }

  const workspace = loadWorkspace()
  const roots = resolveScanRoots(workspace.profile.scanRoots)
  const imported = importedPathSet(workspace.projects.map((project) => project.localPath))
  const ids = workspace.projects.map((project) => project.id)
  const created = []
  const skipped: Array<{ path: string; reason: string }> = []

  for (const raw of parsed.data.paths) {
    const resolved = resolveDirectory(raw)
    if (!resolved.ok) {
      skipped.push({ path: raw, reason: resolved.error })
      continue
    }
    if (!isUnderAllowedRoot(resolved.path, roots)) {
      skipped.push({ path: resolved.path, reason: 'Esa carpeta está fuera de las raíces permitidas.' })
      continue
    }
    const analysis = analyzeDirectory(resolved.path, imported)
    if (analysis.alreadyImported) {
      skipped.push({ path: resolved.path, reason: 'Ya está en el catálogo.' })
      continue
    }
    if (analysis.markers.length === 0 || isIgnoredRemote(analysis.draft.githubRepo)) {
      skipped.push({ path: resolved.path, reason: 'No parece un proyecto tuyo.' })
      continue
    }
    const repo = analysis.draft.githubRepo
    const existing = repo
      ? workspace.projects.find((project) =>
          project.services.some(
            (service) => service.kind === 'github' && normalizeRepo(service.externalId) === normalizeRepo(repo),
          ),
        )
      : undefined
    if (existing) {
      existing.localPath = resolved.path
      Object.assign(existing, reconcileProjectFromDisk(existing))
      created.push(existing)
      imported.add(normalizeDiskPath(resolved.path))
      continue
    }
    const project = createProjectFromDraft(analysis.draft, ids)
    ids.push(project.id)
    imported.add(normalizeDiskPath(resolved.path))
    created.push(project)
  }

  if (created.length === 0) {
    return NextResponse.json(
      { error: skipped[0]?.reason ?? 'No se importó ningún proyecto.', skipped },
      { status: 400 },
    )
  }

  upsertProjects(created)
  const next = await refreshWorkspace(created.map((project) => project.id))
  return NextResponse.json({
    ...workspaceResponse(next),
    createdIds: created.map((project) => project.id),
    skipped,
  })
}

import { existsSync } from 'node:fs'
import { analyzeDirectory } from './disk'
import { applyProjectPatch } from './project-patch'
import { dropCloudServicesNotInNeeds, ensureNeedServices } from './project-factory'
import type { Project } from './types'

export function reconcileProjectFromDisk(project: Project): Project {
  const path = project.localPath?.trim()
  if (!path || path.startsWith('github://') || !existsSync(path)) return project
  const analysis = analyzeDirectory(path)
  const needs = analysis.draft.needs ?? []
  const patched = applyProjectPatch(project, {
    kind: analysis.draft.kind,
    githubRepo: analysis.draft.githubRepo,
    vercelProject: analysis.draft.vercelProject,
    cloudflareZone: analysis.draft.cloudflareZone,
    supabaseRef: analysis.draft.supabaseRef,
    sentryProject: analysis.draft.sentryProject,
    productionUrl: analysis.draft.productionUrl ?? project.productionUrl,
  })
  return ensureNeedServices(dropCloudServicesNotInNeeds(patched, needs), needs)
}

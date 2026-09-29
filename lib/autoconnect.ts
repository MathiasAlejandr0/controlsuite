import { existsSync } from 'node:fs'
import { listCloudflareZones } from './connectors/cloudflare'
import { fetchInstallationRepos, listGithubRepos } from './connectors/github'
import { listSentryProjects } from './connectors/sentry'
import { listSupabaseProjects } from './connectors/supabase'
import { listVercelProjects } from './connectors/vercel'
import { loadCredentials } from './credentials'
import { detectResourceHints, obviousMatch, type ConnectKind, type ListedResource, type ResourceHint } from './detect-resources'
import { githubAccessToken } from './github-access'
import { applyProjectPatch } from './project-patch'
import { mockResources, patchFieldFor, providerMocksEnabled } from './service-link'
import { loadWorkspace, saveWorkspace } from './store'
import type { ProjectPatch } from './schemas'
import type { Project } from './types'

const KINDS: ConnectKind[] = ['github', 'vercel', 'cloudflare', 'supabase', 'sentry']

export type AutoconnectItem = {
  kind: ConnectKind
  state: 'conectado' | 'enlazado' | 'elegir' | 'falta-cuenta' | 'error'
  hint?: string
  resourceId?: string
  reason?: string
  resources?: ListedResource[]
  error?: string
}

function patchFor(kind: ConnectKind, resourceId: string): ProjectPatch {
  const field = patchFieldFor(kind)
  if (field === 'githubRepo') return { githubRepo: resourceId }
  if (field === 'vercelProject') return { vercelProject: resourceId }
  if (field === 'cloudflareZone') return { cloudflareZone: resourceId }
  if (field === 'supabaseRef') return { supabaseRef: resourceId }
  return { sentryProject: resourceId }
}

function hintFor(project: Project, hints: ResourceHint[], kind: ConnectKind) {
  const detected = hints.find((item) => item.kind === kind)?.id
  const service = project.services.find((item) => item.kind === kind)
  return service?.externalId || detected
}

export function classifyLink(input: {
  hasAccount: boolean
  externalId?: string
  hint?: string
  resources: ListedResource[]
  error?: string
}): AutoconnectItem['state'] | { state: 'enlazado'; resourceId: string; reason: string } {
  if (input.externalId) return 'conectado'
  if (!input.hasAccount) return 'falta-cuenta'
  if (input.error) return 'error'
  const match = obviousMatch(input.hint, input.resources)
  if (match) return { state: 'enlazado', resourceId: match.id, reason: match.reason }
  return 'elegir'
}

async function resourcesFor(kind: ConnectKind, token: string, teamId?: string): Promise<ListedResource[]> {
  if (providerMocksEnabled()) return mockResources(kind)
  if (kind === 'github') {
    const repos = await listGithubRepos(token)
    if (repos.length > 0) return repos
    try {
      const installed = await fetchInstallationRepos(token)
      return installed.map((repo) => ({
        id: repo.fullName,
        label: repo.fullName,
        hint: repo.private ? 'privado' : 'público',
      }))
    } catch {
      return []
    }
  }
  if (kind === 'vercel') return listVercelProjects(token, teamId)
  if (kind === 'cloudflare') return listCloudflareZones(token)
  if (kind === 'supabase') return listSupabaseProjects(token)
  return listSentryProjects(token)
}

export async function autoconnectProject(projectId: string) {
  const creds = loadCredentials()
  const data = loadWorkspace()
  const project = data.projects.find((item) => item.id === projectId)
  if (!project) return { ok: false as const, error: 'Proyecto no encontrado.' }

  const hints =
    project.localPath && !project.localPath.startsWith('github://') && existsSync(project.localPath)
      ? detectResourceHints(project.localPath)
      : []
  const githubToken = await githubAccessToken()
  const items: AutoconnectItem[] = []
  let current = project

  const relevant = KINDS.filter(
    (kind) =>
      hints.some((item) => item.kind === kind) ||
      project.services.some((service) => service.kind === kind),
  )
  for (const kind of (relevant.length > 0 ? relevant : KINDS)) {
    const externalId = current.services.find((service) => service.kind === kind)?.externalId
    const hint = hintFor(current, hints, kind)
    const token = kind === 'github' ? githubToken : creds.integrations[kind]
    if (!token) {
      items.push({ kind, state: 'falta-cuenta', hint })
      continue
    }
    if (externalId) {
      items.push({ kind, state: 'conectado', hint: externalId })
      continue
    }
    let resources: ListedResource[] = []
    try {
      resources = await resourcesFor(kind, token, creds.vercelTeamId)
    } catch (error) {
      items.push({
        kind,
        state: 'error',
        hint,
        error: error instanceof Error ? error.message : 'No se pudo listar recursos.',
      })
      continue
    }
    const decision = classifyLink({ hasAccount: true, hint, resources })
    if (typeof decision === 'object') {
      current = applyProjectPatch(current, patchFor(kind, decision.resourceId))
      items.push({ kind, state: 'enlazado', hint, resourceId: decision.resourceId, reason: decision.reason })
    } else if (resources.length === 0) {
      items.push({
        kind,
        state: 'error',
        hint,
        error: 'La cuenta no ve recursos. Revisá el permiso del token.',
      })
    } else {
      items.push({ kind, state: 'elegir', hint, resources })
    }
  }

  const index = data.projects.findIndex((item) => item.id === projectId)
  data.projects[index] = current
  saveWorkspace(data)
  return { ok: true as const, items, hints }
}

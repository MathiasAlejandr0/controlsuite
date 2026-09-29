import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { loadCredentials, saveCredentials } from './credentials'
import { readJsonWithBackup, writeJsonFile } from './json-file'
import { repairMojibake } from './mojibake'
import { migrateUsernamesToVault } from './public-workspace'
import { suiteDataDir } from './paths'
import { workspaceDataSchema } from './schemas'
import { emptyWorkspace } from './seed'
import type { Project, WorkspaceData } from './types'

const dataDir = suiteDataDir()
const workspaceFile = join(dataDir, 'workspace.json')
const workspaceBackup = `${workspaceFile}.bak`

export class WorkspaceCorruptError extends Error {
  constructor() {
    super('El catálogo está corrupto. Revisá data/workspace.json.corrupt o el .bak.')
    this.name = 'WorkspaceCorruptError'
  }
}

function ensureDir() {
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true })
}

function persistWorkspace(data: WorkspaceData) {
  writeJsonFile(workspaceFile, data)
  try {
    copyFileSync(workspaceFile, workspaceBackup)
  } catch {
    // el principal ya se escribió
  }
}

export function loadWorkspace(): WorkspaceData {
  ensureDir()
  if (!existsSync(workspaceFile)) {
    const seed = emptyWorkspace()
    persistWorkspace(seed)
    return seed
  }
  const parsed = readJsonWithBackup<unknown>(workspaceFile, workspaceBackup)
  if (!parsed.ok) {
    throw new WorkspaceCorruptError()
  }
  const checked = workspaceDataSchema.safeParse(parsed.value)
  if (!checked.success) {
    throw new WorkspaceCorruptError()
  }
  const repaired = repairMojibake(checked.data as WorkspaceData)
  const migrated = migrateUsernamesToVault({
    profile: repaired.profile ?? emptyWorkspace().profile,
    projects: repaired.projects ?? [],
    incidents: repaired.incidents ?? [],
    activities: repaired.activities ?? [],
    lastSyncedAt: repaired.lastSyncedAt,
  })
  if (migrated.dirty || parsed.restored || !existsSync(workspaceBackup)) persistWorkspace(migrated.data)
  return migrated.data
}

export function saveWorkspace(data: WorkspaceData) {
  ensureDir()
  persistWorkspace(data)
}

export function upsertProject(project: Project) {
  const data = loadWorkspace()
  const index = data.projects.findIndex((item) => item.id === project.id)
  if (index >= 0) data.projects[index] = project
  else data.projects.unshift(project)
  saveWorkspace(data)
  return data
}

export function upsertProjects(projects: Project[]) {
  const data = loadWorkspace()
  for (const project of [...projects].reverse()) {
    const index = data.projects.findIndex((item) => item.id === project.id)
    if (index >= 0) data.projects[index] = project
    else data.projects.unshift(project)
  }
  saveWorkspace(data)
  return data
}

export function removeProject(id: string) {
  return removeProjects([id])
}

export function removeProjects(ids: string[]) {
  const wanted = new Set(ids)
  const data = loadWorkspace()
  const removed = data.projects.filter((project) => wanted.has(project.id))
  const secretIds = removed.flatMap((project) =>
    project.services.flatMap((service) => service.secretRefs.map((secret) => secret.id)),
  )
  data.projects = data.projects.filter((project) => !wanted.has(project.id))
  data.incidents = data.incidents.filter((incident) => !wanted.has(incident.projectId))
  data.activities = data.activities.filter((item) => !item.projectId || !wanted.has(item.projectId))
  saveWorkspace(data)
  if (secretIds.length > 0) {
    const creds = loadCredentials()
    for (const secretId of secretIds) {
      delete creds.secrets[secretId]
      if (creds.logins) delete creds.logins[secretId]
    }
    if (creds.logins) {
      for (const [id, login] of Object.entries(creds.logins)) {
        if (login.aliasOf && secretIds.includes(login.aliasOf)) delete creds.logins[id]
      }
    }
    saveCredentials(creds)
  }
  return data
}

export function slugify(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
}

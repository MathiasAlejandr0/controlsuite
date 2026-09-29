import { loadCredentials, saveCredentials } from './credentials'
import type { Project, WorkspaceData } from './types'

export function stripSecretUsernames(data: WorkspaceData): WorkspaceData {
  return {
    ...data,
    projects: data.projects.map((project) => ({
      ...project,
      services: project.services.map((service) => ({
        ...service,
        secretRefs: service.secretRefs.map(({ username: _ignored, ...secret }) => secret),
      })),
    })),
  }
}

export function migrateUsernamesToVault(data: WorkspaceData) {
  const creds = loadCredentials()
  creds.logins = creds.logins ?? {}
  let dirty = false
  for (const project of data.projects) {
    for (const service of project.services) {
      for (const secret of service.secretRefs) {
        if (!secret.username) continue
        if (!creds.logins[secret.id]?.username) {
          creds.logins[secret.id] = { ...creds.logins[secret.id], username: secret.username }
        }
        delete secret.username
        dirty = true
      }
    }
  }
  if (dirty) saveCredentials(creds)
  return { data, dirty }
}

export function publicProject(project: Project): Project {
  return stripSecretUsernames({
    profile: { name: '', initials: '', label: '' },
    projects: [project],
    incidents: [],
    activities: [],
  }).projects[0]
}

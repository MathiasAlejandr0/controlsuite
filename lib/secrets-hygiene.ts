import type { Project, SecretRef } from './types'

const STALE_MS = 90 * 24 * 60 * 60 * 1000

export function isSecretStale(secret: SecretRef, now = Date.now()) {
  const stamp = secret.rotatedAt ?? secret.lastRevealedAt
  if (!stamp) return true
  const at = new Date(stamp).getTime()
  if (!Number.isFinite(at)) return true
  return now - at >= STALE_MS
}

export function staleSecrets(projects: Project[], now = Date.now()) {
  const rows: Array<{ projectId: string; projectName: string; serviceName: string; secret: SecretRef }> = []
  for (const project of projects) {
    for (const service of project.services) {
      for (const secret of service.secretRefs) {
        if (isSecretStale(secret, now)) {
          rows.push({
            projectId: project.id,
            projectName: project.name,
            serviceName: service.name,
            secret,
          })
        }
      }
    }
  }
  return rows
}

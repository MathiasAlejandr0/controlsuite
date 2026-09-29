import { isBlockedPath } from './disk'
import { safeHttpUrl } from './safe-url'
import type { Project } from './types'

const UNSAFE_PATH = /[&|<>^\r\n]/

export function sanitizeImportedProject(project: Project): Project {
  const localPath = project.localPath?.trim() ?? ''
  const pathOk = localPath && !UNSAFE_PATH.test(localPath) && !isBlockedPath(localPath)
  return {
    ...project,
    localPath: pathOk ? localPath : '',
    productionUrl: safeHttpUrl(project.productionUrl),
    services: (project.services ?? []).map((service) => ({
      ...service,
      dashboardUrl: safeHttpUrl(service.dashboardUrl),
      secretRefs: (service.secretRefs ?? []).map((secret) => ({
        ...secret,
        loginUrl: safeHttpUrl(secret.loginUrl),
      })),
    })),
  }
}

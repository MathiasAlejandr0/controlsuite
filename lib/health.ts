import type { HealthCheck, HealthStatus, Project, Service } from './types'

const STATUS_SCORE: Record<HealthStatus, number> = {
  healthy: 100,
  degraded: 70,
  down: 20,
  unknown: 50,
}

export function computeScoreFromChecks(checks: HealthCheck[]) {
  const measured = checks.filter((check) => check.status !== 'unknown')
  if (measured.length === 0) return 50
  const totalWeight = measured.reduce((sum, check) => sum + check.weight, 0)
  if (totalWeight === 0) return 50
  const weighted = measured.reduce(
    (sum, check) => sum + STATUS_SCORE[check.status] * check.weight,
    0,
  )
  return Math.round(weighted / totalWeight)
}

export function projectChecks(project: Project) {
  return project.services
    .filter((service) => !service.accessOnly)
    .flatMap((service) => service.checks)
}

export function projectScore(project: Project) {
  return computeScoreFromChecks(projectChecks(project))
}

export function projectCoverage(project: Project) {
  const checks = projectChecks(project)
  const measured = checks.filter((check) => check.status !== 'unknown')
  return { measured: measured.length, total: checks.length }
}

export function projectStatus(project: Project): HealthStatus {
  const checks = projectChecks(project)
  const measured = checks.filter((check) => check.status !== 'unknown')
  if (measured.some((check) => check.status === 'down')) return 'down'
  if (measured.some((check) => check.status === 'degraded')) return 'degraded'
  if (measured.length === 0) return 'unknown'
  return 'healthy'
}

export function serviceStatus(service: Service): HealthStatus {
  if (service.accessOnly) return service.status
  if (service.checks.some((check) => check.status === 'down')) return 'down'
  if (service.checks.some((check) => check.status === 'degraded')) return 'degraded'
  if (service.checks.some((check) => check.status === 'unknown')) return 'unknown'
  if (service.checks.length === 0) return 'unknown'
  return 'healthy'
}

export function statusLabel(status: HealthStatus) {
  switch (status) {
    case 'healthy':
      return 'Sano'
    case 'degraded':
      return 'Degradado'
    case 'down':
      return 'Caído'
    case 'unknown':
      return 'Desconocido'
  }
}

export function isLiveProject(project: Project) {
  return Boolean(project.productionUrl?.trim())
}

export function stageLabel(project: Project) {
  return isLiveProject(project) ? 'En producción' : 'Local'
}

export function kindLabel(kind: Project['kind']) {
  switch (kind) {
    case 'web':
      return 'Plataforma web'
    case 'mobile':
      return 'Aplicación móvil'
    case 'desktop':
      return 'Software de escritorio'
    case 'backend':
      return 'Servicio backend'
  }
}

export function overallScore(projects: Project[]) {
  if (projects.length === 0) return 0
  const scores = projects.map(projectScore)
  return Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length)
}

export function sortByRisk<T extends Project>(projects: T[]) {
  return [...projects].sort((a, b) => {
    const order: Record<HealthStatus, number> = {
      down: 0,
      degraded: 1,
      unknown: 2,
      healthy: 3,
    }
    const statusDelta = order[projectStatus(a)] - order[projectStatus(b)]
    if (statusDelta !== 0) return statusDelta
    return projectScore(a) - projectScore(b)
  })
}

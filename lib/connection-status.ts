import type { HealthCheck } from './types'

export type LinkState = 'conectado' | 'error' | 'sin conectar'

const AUTH_ERROR = /401|403|inválid|sin permiso|no es válido|no tiene acceso/i

export function connectionState(input: {
  hasToken: boolean
  externalId?: string
  checks: HealthCheck[]
}): { state: LinkState; detail: string } {
  if (!input.hasToken) {
    return { state: 'sin conectar', detail: 'Falta el token en la bóveda de este equipo.' }
  }
  if (!input.externalId?.trim()) {
    return { state: 'sin conectar', detail: 'El token está guardado. Elegí el recurso de este proyecto.' }
  }
  const failed = input.checks.find(
    (check) => check.status !== 'healthy' && check.status !== 'unknown' && AUTH_ERROR.test(check.detail),
  )
  const authUnknown = input.checks.find((check) => check.status === 'unknown' && AUTH_ERROR.test(check.detail))
  if (failed || authUnknown) {
    return { state: 'error', detail: (failed ?? authUnknown)!.detail }
  }
  return { state: 'conectado', detail: 'Enlazado. El último chequeo usó este recurso.' }
}

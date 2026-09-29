import { describe, expect, it } from 'vitest'
import { connectionState } from './connection-status'
import type { HealthCheck } from './types'

const check = (detail: string, status: HealthCheck['status']): HealthCheck => ({
  id: 'chk',
  label: 'x',
  weight: 1,
  status,
  detail,
  source: 'Vercel',
})

describe('connectionState', () => {
  it('distingue sin conectar, error y conectado', () => {
    expect(connectionState({ hasToken: false, checks: [] }).state).toBe('sin conectar')
    expect(connectionState({ hasToken: true, checks: [] }).state).toBe('sin conectar')
    expect(
      connectionState({
        hasToken: true,
        externalId: 'demo',
        checks: [check('Token de Vercel inválido o sin permiso.', 'unknown')],
      }).state,
    ).toBe('error')
    expect(
      connectionState({
        hasToken: true,
        externalId: 'demo',
        checks: [check('READY', 'healthy')],
      }).state,
    ).toBe('conectado')
  })
})

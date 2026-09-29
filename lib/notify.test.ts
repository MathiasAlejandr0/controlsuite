import { describe, expect, it } from 'vitest'
import { newProductionIncidents } from './notify'
import type { Incident } from './types'

const incident = (id: string, extra: Partial<Incident> = {}): Incident => ({
  id,
  projectId: 'p',
  title: id,
  detail: 'x',
  environment: 'production',
  status: 'open',
  severity: 'critical',
  detectedAt: new Date().toISOString(),
  ...extra,
})

describe('newProductionIncidents', () => {
  it('no avisa media, baja ni local', () => {
    const next = [
      incident('media', { severity: 'medium' }),
      incident('baja', { severity: 'low' }),
      incident('local', { environment: 'local' }),
    ]
    expect(newProductionIncidents([], next)).toEqual([])
  })

  it('solo avisa issues de producción que no estaban', () => {
    const prev = [incident('old')]
    const next = [incident('old'), incident('new'), incident('local', { environment: 'local' })]
    expect(newProductionIncidents(prev, next).map((item) => item.id)).toEqual(['new'])
  })
})

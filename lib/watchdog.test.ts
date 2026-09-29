import { describe, expect, it } from 'vitest'
import { newProductionIncidents } from './notify'
import { queueRemediations, loadOps, saveOps } from './ops'
import type { Incident } from './types'

describe('queueRemediations', () => {
  it('no duplica el mismo incidente de producción', () => {
    saveOps({ remediations: [] })
    const incident = (id: string): Incident => ({
      id,
      projectId: 'p',
      title: id,
      detail: 'x',
      environment: 'production',
      status: 'open',
      severity: 'high',
      detectedAt: new Date().toISOString(),
    })
    expect(queueRemediations([incident('a')])).toBe(1)
    expect(queueRemediations([incident('a'), incident('b')])).toBe(1)
    expect(loadOps().remediations).toHaveLength(2)
    expect(newProductionIncidents([incident('a')], [incident('a'), incident('b')]).map((item) => item.id)).toEqual([
      'b',
    ])
  })
})

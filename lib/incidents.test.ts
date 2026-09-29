import { describe, expect, it } from 'vitest'
import { mergeIncidents, openIncidents } from './incidents'
import type { Incident } from './types'

const incident = (id: string, extra: Partial<Incident> = {}): Incident => ({
  id,
  projectId: 'suertudos',
  title: id,
  detail: 'x',
  environment: 'production',
  status: 'open',
  severity: 'high',
  detectedAt: '2026-01-01T00:00:00.000Z',
  ...extra,
})

describe('mergeIncidents', () => {
  it('conserva detectedAt y reabre si volvio el check', () => {
    const prev = [incident('a', { status: 'resolved', resolvedAt: '2026-01-02T00:00:00.000Z' })]
    const [next] = mergeIncidents(prev, [incident('a', { detail: 'nuevo' })])
    expect(next.detectedAt).toBe('2026-01-01T00:00:00.000Z')
    expect(next.status).toBe('open')
    expect(next.detail).toBe('nuevo')
  })

  it('cierra solo los que desaparecieron', () => {
    const merged = mergeIncidents([incident('gone'), incident('stay')], [incident('stay')])
    expect(merged.find((item) => item.id === 'gone')?.status).toBe('resolved')
    expect(merged.find((item) => item.id === 'stay')?.status).toBe('open')
  })
})

describe('openIncidents', () => {
  it('omite resueltos', () => {
    expect(openIncidents([incident('a'), incident('b', { status: 'resolved' })]).map((i) => i.id)).toEqual([
      'a',
    ])
  })
})

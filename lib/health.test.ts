import { describe, expect, it } from 'vitest'
import { computeScoreFromChecks, isLiveProject, projectScore, projectStatus } from './health'
import type { HealthCheck, Project } from './types'

const check = (status: HealthCheck['status'], weight: number, id = status): HealthCheck => ({
  id,
  label: id,
  weight,
  status,
  detail: '',
  source: 'test',
})

describe('computeScoreFromChecks', () => {
  it('devuelve 50 si no hay checks', () => {
    expect(computeScoreFromChecks([])).toBe(50)
  })

  it('promedia por peso solo lo medido', () => {
    expect(computeScoreFromChecks([check('healthy', 25), check('down', 25, 'd')])).toBe(60)
  })

  it('unknown no entra al promedio', () => {
    expect(computeScoreFromChecks([check('unknown', 10), check('healthy', 15)])).toBe(100)
  })
})

describe('projectStatus', () => {
  const project = (checks: HealthCheck[]): Project => ({
    id: 'p',
    name: 'P',
    kind: 'web',
    summary: '',
    localPath: 'D:\\x',
    branch: 'main',
    uptime: '—',
    lastActivity: new Date().toISOString(),
    services: [
      {
        id: 's',
        kind: 'uptime',
        name: 'HTTP',
        role: 'up',
        status: 'unknown',
        secretRefs: [],
        checks,
      },
    ],
  })

  it('down gana a todo', () => {
    expect(projectStatus(project([check('down', 15), check('healthy', 25)]))).toBe('down')
  })

  it('unknown no degrada un sitio medido sano', () => {
    expect(projectStatus(project([check('unknown', 10), check('healthy', 15)]))).toBe('healthy')
  })
})

describe('projectScore', () => {
  it('ignora servicios accessOnly', () => {
    const project: Project = {
      id: 'p',
      name: 'P',
      kind: 'web',
      summary: '',
      localPath: 'D:\\x',
      branch: 'main',
      uptime: '—',
      lastActivity: new Date().toISOString(),
      services: [
        {
          id: 'ig',
          kind: 'instagram',
          name: 'IG',
          role: 'social',
          status: 'healthy',
          accessOnly: true,
          secretRefs: [],
          checks: [check('down', 100)],
        },
        {
          id: 'up',
          kind: 'uptime',
          name: 'HTTP',
          role: 'up',
          status: 'healthy',
          secretRefs: [],
          checks: [check('healthy', 15)],
        },
      ],
    }
    expect(projectScore(project)).toBe(100)
  })
})

describe('isLiveProject', () => {
  it('es producción solo si hay URL pública', () => {
    expect(isLiveProject({ productionUrl: 'https://suertu2s.cl' } as Project)).toBe(true)
    expect(isLiveProject({ localPath: 'D:\\Betfree' } as Project)).toBe(false)
  })
})

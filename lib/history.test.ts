import { describe, expect, it } from 'vitest'
import { pointsFromProjects, pruneHistory } from './history'
import type { Project } from './types'

describe('history', () => {
  it('poda puntos de más de 48 h', () => {
    const now = Date.parse('2026-08-30T20:00:00.000Z')
    const kept = pruneHistory(
      [
        { projectId: 'a', at: '2026-08-28T10:00:00.000Z', status: 'healthy', score: 90 },
        { projectId: 'a', at: '2026-08-30T18:00:00.000Z', status: 'down', score: 20 },
      ],
      now,
    )
    expect(kept).toHaveLength(1)
    expect(kept[0].score).toBe(20)
  })

  it('arma un punto por proyecto', () => {
    const project = {
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
          status: 'healthy',
          secretRefs: [],
          checks: [
            { id: 'chk-uptime', label: 'Uptime HTTP', weight: 15, status: 'healthy', detail: '200', source: 'HTTP' },
          ],
        },
      ],
    } as Project
    expect(pointsFromProjects([project])[0].score).toBe(100)
  })
})

import { describe, expect, it } from 'vitest'
import { composeRemediationPrompt, failingIssues } from './prompt-engineer'
import type { Project } from './types'

function project(overrides?: Partial<Project>): Project {
  return {
    id: 'suertudos',
    name: 'Suertudos',
    kind: 'web',
    summary: 'Apuestas en vivo',
    localPath: 'D:\\suertu2s',
    branch: 'main',
    productionUrl: 'https://suertu2s.cl',
    uptime: 'down',
    lastActivity: new Date().toISOString(),
    services: [
      {
        id: 'up',
        kind: 'uptime',
        name: 'HTTP',
        role: 'uptime',
        status: 'down',
        secretRefs: [],
        checks: [
          {
            id: 'chk-uptime',
            label: 'Uptime HTTP',
            weight: 15,
            status: 'down',
            detail: 'https://suertu2s.cl → 502 en 340ms',
            source: 'HTTP',
          },
        ],
      },
      {
        id: 'gh',
        kind: 'github',
        name: 'GitHub',
        role: 'repo',
        status: 'unknown',
        externalId: 'Suertu2s/suertu2s',
        secretRefs: [],
        checks: [
          {
            id: 'chk-ci',
            label: 'CI y supply chain',
            weight: 10,
            status: 'unknown',
            detail: 'Falta token de GitHub',
            source: 'GitHub',
          },
        ],
      },
    ],
    ...overrides,
  }
}

describe('composeRemediationPrompt', () => {
  it('prioriza el error medido y no trata unknown como bug', () => {
    const prompt = composeRemediationPrompt({ project: project() })
    expect(prompt).toContain('Tarea de remediación · Suertudos')
    expect(prompt).toContain('https://suertu2s.cl → 502 en 340ms')
    expect(prompt).toContain('No rediseñes')
    expect(prompt).toContain('Sin medir')
    expect(prompt).toContain('Falta token de GitHub')
    expect(failingIssues(project())).toHaveLength(1)
    expect(failingIssues(project())[0].id).toBe('chk-uptime')
  })

  it('no inventa un incidente si todo lo medido está sano', () => {
    const prompt = composeRemediationPrompt({
      project: project({
        services: [
          {
            id: 'up',
            kind: 'uptime',
            name: 'HTTP',
            role: 'uptime',
            status: 'healthy',
            secretRefs: [],
            checks: [
              {
                id: 'chk-uptime',
                label: 'Uptime HTTP',
                weight: 15,
                status: 'healthy',
                detail: 'https://suertu2s.cl → 200',
                source: 'HTTP',
              },
            ],
          },
        ],
      }),
    })
    expect(prompt).toContain('No hay un check **medido** en rojo')
  })
})

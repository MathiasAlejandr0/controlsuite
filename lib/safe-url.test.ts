import { describe, expect, it, vi } from 'vitest'
import { sanitizeImportedProject } from './catalog-sanitize'
import { resolveCursorTarget } from './cursor'
import { safeHttpUrl } from './safe-url'
import { sessionBypassed } from './session'
import type { Project } from './types'

describe('safeHttpUrl', () => {
  it('solo deja http(s)', () => {
    expect(safeHttpUrl('https://rgmotorschile.cl')).toBe('https://rgmotorschile.cl/')
    expect(safeHttpUrl('javascript:alert(1)')).toBeUndefined()
    expect(safeHttpUrl('data:text/html,x')).toBeUndefined()
  })
})

describe('sanitizeImportedProject', () => {
  it('limpia javascript: y paths con metacaracteres', () => {
    const project = sanitizeImportedProject({
      id: 'x',
      name: 'X',
      kind: 'web',
      summary: '',
      localPath: 'D:\\pwn&calc',
      branch: 'main',
      uptime: '—',
      lastActivity: new Date().toISOString(),
      productionUrl: 'javascript:alert(1)',
      services: [
        {
          id: 's',
          kind: 'github',
          name: 'GitHub',
          role: 'x',
          status: 'unknown',
          dashboardUrl: 'javascript:alert(1)',
          secretRefs: [{ id: 'l', label: 'l', vaultUri: 'local://l', field: 'password', loginUrl: 'data:text/html,x' }],
          checks: [],
        },
      ],
    } as Project)
    expect(project.localPath).toBe('')
    expect(project.productionUrl).toBeUndefined()
    expect(project.services[0].dashboardUrl).toBeUndefined()
    expect(project.services[0].secretRefs[0].loginUrl).toBeUndefined()
  })
})

describe('resolveCursorTarget', () => {
  it('rechaza metacaracteres de cmd', () => {
    expect(resolveCursorTarget('D:\\pwn&calc').ok).toBe(false)
  })
})

describe('sessionBypassed', () => {
  it('no abre el PIN en production aunque VITEST esté puesto', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('VITEST', 'true')
    expect(sessionBypassed()).toBe(false)
    vi.unstubAllEnvs()
  })
})

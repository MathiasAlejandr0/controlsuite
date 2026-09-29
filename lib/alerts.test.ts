import { describe, expect, it } from 'vitest'
import { alertFromCheck, dedupeAlerts, severityForCheck } from './alerts'
import { detectedIncidents } from './incidents'
import type { HealthCheck, Incident, Project, Service } from './types'

const check = (partial: Partial<HealthCheck> & Pick<HealthCheck, 'id' | 'status'>): HealthCheck => ({
  label: partial.id,
  weight: 10,
  detail: partial.detail ?? partial.id,
  source: 'test',
  ...partial,
})

describe('severityForCheck', () => {
  it('ignora sano y desconocido', () => {
    expect(severityForCheck(check({ id: 'a', status: 'healthy', code: 'http.uptime' }))).toBeNull()
    expect(severityForCheck(check({ id: 'a', status: 'unknown', code: 'github.secrets' }))).toBeNull()
  })

  it('marca ataques y secretos como críticos y un sitio caído también', () => {
    expect(severityForCheck(check({ id: 'a', status: 'degraded', code: 'cloudflare.attack' }))).toBe('critical')
    expect(severityForCheck(check({ id: 'a', status: 'down', code: 'github.secrets' }))).toBe('critical')
    expect(severityForCheck(check({ id: 'a', status: 'down', code: 'http.uptime' }))).toBe('critical')
    expect(severityForCheck(check({ id: 'a', status: 'down', code: 'vercel.deploy' }))).toBe('high')
    expect(severityForCheck(check({ id: 'a', status: 'degraded', code: 'supabase.security' }))).toBe('medium')
    expect(severityForCheck(check({ id: 'a', status: 'degraded', code: 'github.pulls' }))).toBe('low')
  })
})

describe('dedupeAlerts', () => {
  it('se queda con la severidad peor del mismo id', () => {
    const low = { id: 'p-a', projectId: 'p', title: 'a', detail: 'baja', environment: 'production', status: 'open', severity: 'low', detectedAt: '2026-01-01T00:00:00.000Z' } satisfies Incident
    const high = { ...low, severity: 'critical', detail: 'peor' } satisfies Incident
    expect(dedupeAlerts([low, high])).toEqual([high])
    expect(dedupeAlerts([high, low])).toEqual([high])
  })
})

describe('detectedIncidents', () => {
  it('normaliza checks reales y omite los sanos', () => {
    const service: Service = {
      id: 's',
      kind: 'vercel',
      name: 'Vercel',
      role: 'deploy',
      status: 'down',
      secretRefs: [],
      checks: [
        check({ id: 'chk-deploy', status: 'down', code: 'vercel.deploy', detail: 'ERROR', source: 'Vercel' }),
        check({ id: 'chk-ok', status: 'healthy', code: 'vercel.domain', source: 'Vercel' }),
      ],
    }
    const project: Project = {
      id: 'demo',
      name: 'Demo',
      kind: 'web',
      summary: '',
      localPath: 'D:\\demo',
      branch: 'main',
      productionUrl: 'https://demo.example',
      uptime: 'down',
      lastActivity: '',
      services: [service],
    }
    const [alert] = detectedIncidents([project])
    expect(alert.id).toBe('demo-chk-deploy')
    expect(alert.severity).toBe('high')
    expect(alert.source).toBe('Vercel')
    expect(alertFromCheck(project, service, service.checks[1])).toBeNull()
  })
})

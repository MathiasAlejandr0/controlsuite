import { afterEach, describe, expect, it, vi } from 'vitest'
import { monitorCloudflare } from './cloudflare'
import { checkGithub } from './github'
import { monitorSentry } from './sentry'
import { monitorSupabase, summarizeAdvisors, summarizeBackups } from './supabase'
import { monitorVercel, summarizeBuildLog } from './vercel'
import { validateServiceToken } from '../service-link'

const TOKEN = 'fake-token-not-real'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('monitorVercel', () => {
  it('lee deploys, el log de build y degrada el firewall', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const target = String(url)
        if (target.includes('firewall')) return json({ error: 'plan' }, 403)
        if (target.includes('/v6/deployments')) {
          return json({
            deployments: [{ uid: 'dpl_fake', readyState: 'ERROR', url: 'demo.vercel.app', inspectorUrl: 'https://vercel.com/demo/dpl_fake' }],
          })
        }
        if (target.includes('/events')) {
          return json([{ text: 'Error: Module not found: fake-pkg' }])
        }
        if (target.includes('/v9/projects/')) {
          return json({ id: 'prj_fake', name: 'demo', targets: { production: { alias: ['demo.example'] } } })
        }
        if (target.includes('/v6/domains/')) return json({ verified: false })
        if (target.includes('runtime-logs')) return json({ error: 'plan' }, 402)
        return json({}, 404)
      }),
    )
    const checks = await monitorVercel('demo', TOKEN)
    expect(checks.find((item) => item.code === 'vercel.deploy')?.status).toBe('down')
    expect(checks.find((item) => item.code === 'vercel.build')?.detail).toMatch(/Module not found/)
    expect(checks.find((item) => item.code === 'vercel.domain')?.status).toBe('degraded')
    expect(checks.find((item) => item.code === 'vercel.firewall')?.status).toBe('unknown')
    expect(JSON.stringify(checks)).not.toContain(TOKEN)
    expect(summarizeBuildLog(['Error: npm ERR! missing script']).status).toBe('down')
  })
})

describe('monitorSupabase', () => {
  it('lee salud, advisors y degrada backups del plan', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const target = String(url)
        if (target.endsWith('/health')) {
          return json({ services: [{ name: 'db', healthy: false, status: 'UNHEALTHY' }, { name: 'auth', healthy: true }] })
        }
        if (target.endsWith('/advisors/security')) {
          return json({ lints: [{ name: 'rls_disabled_in_public', title: 'RLS disabled', level: 'ERROR', detail: 'public.orders' }] })
        }
        if (target.endsWith('/advisors/performance')) return json({ lints: [] })
        if (target.endsWith('/database/backups') || target.endsWith('/config/auth') || target.endsWith('/database/usage')) {
          return json({ error: 'plan' }, 404)
        }
        return json({ id: 'ref_fake', name: 'demo', status: 'ACTIVE_HEALTHY', region: 'sa-east-1' })
      }),
    )
    const checks = await monitorSupabase('ref_fake', TOKEN)
    expect(checks.find((item) => item.id === 'chk-db')?.status).toBe('healthy')
    expect(checks.find((item) => item.code === 'supabase.health')?.status).toBe('down')
    expect(checks.find((item) => item.code === 'supabase.security')?.detail).toMatch(/RLS disabled/)
    expect(checks.find((item) => item.code === 'supabase.backup')?.status).toBe('unknown')
    expect(summarizeAdvisors([], 'security').status).toBe('healthy')
    expect(summarizeBackups({ pitr_enabled: true }).detail).toMatch(/PITR/)
  })
})

describe('monitorCloudflare', () => {
  it('lee SSL y cuenta eventos de firewall', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const target = String(url)
        if (init?.method === 'POST') {
          return json({
            data: { viewer: { zones: [{ firewallEventsAdaptiveGroups: [{ count: 80 }, { count: 20 }] }] } },
          })
        }
        if (target.includes('/settings/ssl')) return json({ result: { value: 'flexible' } })
        if (target.includes('/settings/security_level')) return json({ result: { value: 'medium' } })
        if (target.includes('/zones?')) return json({ result: [{ id: 'zone_fake', name: 'demo.example', status: 'active' }] })
        return json({}, 404)
      }),
    )
    const checks = await monitorCloudflare('demo.example', TOKEN)
    expect(checks.find((item) => item.id === 'chk-tls')?.status).toBe('degraded')
    expect(checks.find((item) => item.code === 'cloudflare.attack')?.status).toBe('degraded')
    expect(checks.find((item) => item.code === 'cloudflare.attack')?.detail).toMatch(/100/)
  })
})

describe('monitorSentry', () => {
  it('cuenta issues y detecta un pico', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const target = String(url)
        if (target.includes('/stats/')) return json([[1, 1], [2, 1], [3, 1], [4, 1], [5, 40]])
        return json([{ id: '1', title: 'Boom' }, { id: '2', title: 'Boom 2' }])
      }),
    )
    const checks = await monitorSentry('acme/web', TOKEN)
    expect(checks[0]?.status).toBe('degraded')
    expect(checks.find((item) => item.code === 'sentry.spike')?.status).toBe('down')
  })
})

describe('checkGithub', () => {
  it('marca CI, dependabot y secretos con fetch simulado', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const target = String(url)
        if (target.endsWith('/repos/acme/web')) {
          return json({
            full_name: 'acme/web',
            name: 'web',
            description: 'demo',
            private: true,
            language: 'TypeScript',
            default_branch: 'main',
            pushed_at: '2026-09-01T00:00:00Z',
            html_url: 'https://github.com/acme/web',
            homepage: null,
          })
        }
        if (target.includes('/actions/runs')) {
          return json({ workflow_runs: [{ name: 'CI', status: 'completed', conclusion: 'failure', html_url: 'https://github.com/acme/web/actions/1' }] })
        }
        if (target.includes('/check-runs')) return json({ check_runs: [{ name: 'lint', status: 'completed', conclusion: 'success' }] })
        if (target.includes('/dependabot/alerts')) return json([{ severity: 'high', state: 'open' }])
        if (target.includes('/secret-scanning/alerts')) return json([{ secret_type: 'aws', html_url: 'https://github.com/acme/web/security/secret-scanning/1' }])
        if (target.includes('/pulls')) return json([{ number: 1 }, { number: 2 }])
        return json({}, 404)
      }),
    )
    const checks = await checkGithub('acme/web', TOKEN)
    expect(checks.find((item) => item.id === 'chk-ci')?.status).toBe('down')
    expect(checks.find((item) => item.code === 'github.dependabot')?.status).toBe('down')
    expect(checks.find((item) => item.code === 'github.secrets')?.status).toBe('down')
    expect(checks.find((item) => item.code === 'github.pulls')?.status).toBe('healthy')
  })
})

describe('validateServiceToken', () => {
  it('valida Vercel y no devuelve el token', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const target = String(url)
        if (target.includes('/v2/user')) return json({ user: { username: 'mathi-test' } })
        if (target.includes('/v2/teams')) return json({ teams: [{ id: 'team_fake', name: 'Demo' }] })
        if (target.includes('/v9/projects')) return json({ projects: [{ id: 'prj_fake', name: 'demo' }] })
        return json({}, 404)
      }),
    )
    const result = await validateServiceToken('vercel', TOKEN)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.account).toBe('mathi-test')
      expect(result.resources[0]?.id).toBe('demo')
      expect(result.teamId).toBe('team_fake')
    }
    expect(JSON.stringify(result)).not.toContain(TOKEN)
  })
})

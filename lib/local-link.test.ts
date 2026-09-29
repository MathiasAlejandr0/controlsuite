import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  harvestCloudflare,
  harvestSupabase,
  harvestVercel,
  isLinkProvider,
  linkPlan,
  parseInsforgeAuth,
  parseVercelAuth,
  parseWranglerToml,
} from './local-link'
import { connectSchema } from './schemas'

const previousHome = process.env.SUITE_HOME

afterEach(() => {
  if (previousHome === undefined) delete process.env.SUITE_HOME
  else process.env.SUITE_HOME = previousHome
})

describe('local-link parsers', () => {
  it('lee auth.json de Vercel y oauth de wrangler', () => {
    expect(parseVercelAuth('{"token":"vercel-token-1"}')).toBe('vercel-token-1')
    expect(parseWranglerToml('oauth_token = "cf-oauth-1"\n')).toBe('cf-oauth-1')
    expect(parseWranglerToml('name = "x"\n')).toBeUndefined()
  })

  it('cosecha archivos del home simulado', () => {
    const home = mkdtempSync(join(tmpdir(), 'suite-home-'))
    process.env.SUITE_HOME = home
    mkdirSync(join(home, '.vercel'), { recursive: true })
    mkdirSync(join(home, '.wrangler', 'config'), { recursive: true })
    mkdirSync(join(home, '.supabase'), { recursive: true })
    writeFileSync(join(home, '.vercel', 'auth.json'), JSON.stringify({ token: 'v-from-home' }))
    writeFileSync(join(home, '.wrangler', 'config', 'default.toml'), 'oauth_token = "cf-from-home"\n')
    writeFileSync(join(home, '.supabase', 'access-token'), 'sb-from-home')

    expect(harvestVercel()).toEqual({ ok: true, token: 'v-from-home', source: 'Vercel CLI (auth.json)' })
    expect(harvestCloudflare()).toEqual({ ok: true, token: 'cf-from-home', source: 'wrangler login' })
    expect(harvestSupabase()).toEqual({ ok: true, token: 'sb-from-home', source: 'supabase login' })
  })

  it('el plan de login no acepta un bin arbitrario', () => {
    expect(parseInsforgeAuth('{"apiKey":"inf-1"}')).toBe('inf-1')
    expect(isLinkProvider('github')).toBe(true)
    expect(isLinkProvider('insforge')).toBe(true)
    expect(isLinkProvider('aws')).toBe(false)
    expect(connectSchema.safeParse({ action: 'start', provider: 'github' }).success).toBe(true)
    expect(connectSchema.safeParse({ action: 'start', provider: 'aws' }).success).toBe(false)
    const plan = linkPlan('cloudflare')
    expect(plan.command?.bin).toBe('npx')
    expect(plan.command?.args).toEqual(['--yes', 'wrangler', 'login'])
    expect(plan.urls.every((url) => url.startsWith('https://'))).toBe(true)
  })
})

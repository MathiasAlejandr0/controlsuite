import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  cloudflareZoneFromText,
  detectResourceHints,
  githubFromGitConfig,
  obviousMatch,
  sentrySlugFromText,
  supabaseRefFromText,
  vercelNameFromText,
} from './detect-resources'

describe('detectores de recursos', () => {
  it('saca ref, zona, repo y proyecto sin copiar secretos', () => {
    expect(githubFromGitConfig('[remote "origin"]\nurl = git@github.com:acme/web.git\n')).toBe('acme/web')
    expect(supabaseRefFromText('NEXT_PUBLIC_SUPABASE_URL=https://abcdefghijklmnop.supabase.co\n')).toBe(
      'abcdefghijklmnop',
    )
    expect(supabaseRefFromText('', 'project_id = "zzsupernotsecret"\n')).toBe('zzsupernotsecret')
    expect(vercelNameFromText('{"projectName":"taller"}', 'VERCEL_PROJECT_NAME=otro\n')).toBe('taller')
    expect(cloudflareZoneFromText('zone_name = "rgmotorschile.cl"\n', 'https://www.rgmotorschile.cl')).toBe(
      'rgmotorschile.cl',
    )
    expect(cloudflareZoneFromText('', 'https://demo.vercel.app')).toBeUndefined()
    expect(sentrySlugFromText('SENTRY_ORG=acme\nSENTRY_PROJECT=web\nSECRET=sk_live_fake\n')).toBe('acme/web')
    expect(sentrySlugFromText('SENTRY_DSN=https://abc@o1.ingest.sentry.io/12345\n')).toBe('12345')
  })

  it('elige el recurso obvio y no adivina entre varios', () => {
    const resources = [
      { id: 'acme/web', label: 'acme/web' },
      { id: 'acme/api', label: 'acme/api' },
    ]
    expect(obviousMatch('acme/web', resources)?.id).toBe('acme/web')
    expect(obviousMatch(undefined, resources)).toBeUndefined()
    expect(obviousMatch(undefined, [{ id: 'solo', label: 'Solo' }])?.reason).toBe('es el único')
  })

  it('lee el disco de un proyecto de prueba', () => {
    const dir = mkdtempSync(join(tmpdir(), 'suite-detect-'))
    mkdirSync(join(dir, '.git'))
    mkdirSync(join(dir, '.vercel'))
    mkdirSync(join(dir, 'supabase'))
    writeFileSync(join(dir, '.git', 'config'), '[remote "origin"]\n\turl = https://github.com/acme/web.git\n')
    writeFileSync(join(dir, '.vercel', 'project.json'), JSON.stringify({ projectName: 'web' }))
    writeFileSync(join(dir, 'supabase', 'config.toml'), 'project_id = "abcdefghijklmnop"\n')
    writeFileSync(join(dir, 'wrangler.toml'), 'zone_name = "acme.test"\n')
    writeFileSync(join(dir, '.env.example'), 'SENTRY_ORG=acme\nSENTRY_PROJECT=web\nSUPABASE_SERVICE_ROLE_KEY=secret-value\n')
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ homepage: 'https://acme.test' }))
    const hints = detectResourceHints(dir)
    expect(hints.find((item) => item.kind === 'github')?.id).toBe('acme/web')
    expect(hints.find((item) => item.kind === 'vercel')?.id).toBe('web')
    expect(hints.find((item) => item.kind === 'supabase')?.id).toBe('abcdefghijklmnop')
    expect(hints.find((item) => item.kind === 'cloudflare')?.id).toBe('acme.test')
    expect(hints.find((item) => item.kind === 'sentry')?.id).toBe('acme/web')
    expect(JSON.stringify(hints)).not.toContain('secret-value')
  })

  it('detecta servicios por dependencias de package.json', () => {
    const dir = mkdtempSync(join(tmpdir(), 'suite-deps-'))
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({
        dependencies: {
          '@supabase/supabase-js': '2.0.0',
          '@sentry/nextjs': '8.0.0',
          wrangler: '3.0.0',
        },
      }),
    )
    const kinds = detectResourceHints(dir).map((item) => item.kind)
    expect(kinds).toContain('supabase')
    expect(kinds).toContain('sentry')
    expect(kinds).toContain('cloudflare')
    expect(kinds).not.toContain('github')
  })
})

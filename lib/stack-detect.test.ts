import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createProjectFromDraft, dropCloudServicesNotInNeeds } from './project-factory'
import { applyStackToDraft, detectStack } from './stack-detect'
import { linkTarget } from './link-target'

function scratch() {
  return mkdtempSync(join(tmpdir(), 'suite-stack-'))
}

describe('detectStack', () => {
  it('lee Supabase, Prisma y wrangler sin devolver secretos', () => {
    const dir = scratch()
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({
        dependencies: { next: '15.0.0', '@supabase/supabase-js': '2.0.0', '@prisma/client': '6.0.0' },
        devDependencies: { wrangler: '4.0.0' },
      }),
    )
    writeFileSync(
      join(dir, '.env.example'),
      [
        'NEXT_PUBLIC_SUPABASE_URL=https://abcdefghijklmnop.supabase.co',
        'SUPABASE_SERVICE_ROLE_KEY=super-secret-do-not-leak',
        'DATABASE_URL=postgresql://user:pass@localhost:5432/app',
        'SENTRY_ORG=acme',
        'SENTRY_PROJECT=web',
      ].join('\n'),
    )
    mkdirSync(join(dir, 'prisma'))
    writeFileSync(join(dir, 'prisma', 'schema.prisma'), 'datasource db { provider = "postgresql" }')
    writeFileSync(join(dir, 'wrangler.toml'), 'name = "demo"\n')
    writeFileSync(join(dir, 'next.config.mjs'), 'export default {}')
    mkdirSync(join(dir, '.vercel'))
    writeFileSync(join(dir, '.vercel', 'project.json'), JSON.stringify({ projectName: 'demo' }))

    const report = detectStack(dir)
    const providers = report.needs.map((need) => need.provider)
    expect(providers).toContain('supabase')
    expect(providers).toContain('cloudflare')
    expect(providers).toContain('vercel')
    expect(providers).toContain('sentry')
    expect(report.draft.supabaseRef).toBe('abcdefghijklmnop')
    expect(report.draft.sentryProject).toBe('acme/web')
    expect(JSON.stringify(report)).not.toContain('super-secret-do-not-leak')
    expect(JSON.stringify(report)).not.toContain('user:pass')
  })

  it('si solo hay Prisma, propone base y el botón apunta a Supabase', () => {
    const dir = scratch()
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ dependencies: { '@prisma/client': '6.0.0' } }))
    mkdirSync(join(dir, 'prisma'))
    writeFileSync(join(dir, 'prisma', 'schema.prisma'), 'datasource db { provider = "postgresql" }')
    const report = detectStack(dir)
    const database = report.needs.find((need) => need.provider === 'database')
    expect(database?.canLink).toBe(true)
    expect(linkTarget(database!)).toBe('supabase')
  })

  it('Next.js local sin .vercel no pide Vercel', () => {
    const dir = scratch()
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ dependencies: { next: '15.0.0' } }))
    writeFileSync(join(dir, 'next.config.mjs'), 'export default {}')
    const report = detectStack(dir)
    expect(report.needs.some((need) => need.provider === 'vercel')).toBe(false)
    expect(detectStack(dir, 'web').needs.some((need) => need.provider === 'vercel')).toBe(true)
  })

  it('el factory crea el servicio aunque falte el ref', () => {
    const draft = applyStackToDraft(
      { name: 'Demo', kind: 'web', localPath: 'D:\\Demo' },
      { needs: [], draft: { needs: ['supabase', 'docker'] } },
    )
    const project = createProjectFromDraft(draft)
    expect(project.services.some((service) => service.kind === 'supabase')).toBe(true)
    expect(project.services.some((service) => service.kind === 'docker')).toBe(true)
  })

  it('saca Vercel inventado si el stack no lo pide', () => {
    const project = createProjectFromDraft({
      name: 'Suite',
      kind: 'desktop',
      localPath: 'D:\\suite_control',
      vercelProject: 'suite_control',
    })
    expect(project.services.some((service) => service.kind === 'vercel')).toBe(true)
    const cleaned = dropCloudServicesNotInNeeds(project, [])
    expect(cleaned.services.some((service) => service.kind === 'vercel')).toBe(false)
  })
})

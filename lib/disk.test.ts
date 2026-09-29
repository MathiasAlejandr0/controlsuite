import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { suiteDataDir } from './paths'
import {
  analyzeDirectory,
  confidenceFor,
  inferKind,
  isBlockedPath,
  isUnderAllowedRoot,
  parseGitConfig,
  parseGitHead,
  parseGithubRemote,
  scanProjects,
  shouldSkipName,
} from './disk'

describe('parseGithubRemote', () => {
  it('acepta https y ssh', () => {
    expect(parseGithubRemote('https://github.com/mathi/suertudos.git')).toBe('mathi/suertudos')
    expect(parseGithubRemote('git@github.com:mathi/rg-motors.git')).toBe('mathi/rg-motors')
  })
})

describe('parseGitConfig / HEAD', () => {
  it('lee origin y branch', () => {
    const parsed = parseGitConfig(`[remote "origin"]
	url = https://github.com/mathi/demo.git
[branch "main"]
	remote = origin
`)
    expect(parsed.origin).toBe('mathi/demo')
    expect(parseGitHead('ref: refs/heads/develop\n')).toBe('develop')
  })
})

describe('inferKind', () => {
  it('detecta mobile, desktop, web y backend', () => {
    expect(inferKind(['pubspec.yaml'])).toBe('mobile')
    expect(inferKind(['tauri.conf.json'])).toBe('desktop')
    expect(inferKind(['next.config.mjs'], { dependencies: { next: '15.0.0' } })).toBe('web')
    expect(inferKind(['go.mod'])).toBe('backend')
    expect(inferKind(['installer', 'package.json'], { dependencies: { next: '15.0.0' } })).toBe('desktop')
  })
})

describe('path guards', () => {
  it('bloquea carpetas de sistema y skips conocidos', () => {
    expect(isBlockedPath('C:\\Windows\\System32')).toBe(true)
    expect(isBlockedPath(suiteDataDir())).toBe(true)
    expect(isUnderAllowedRoot('D:\\RgMotors')).toBe(true)
    expect(shouldSkipName('node_modules')).toBe(true)
    expect(shouldSkipName('RgMotors')).toBe(false)
    expect(confidenceFor(['.git'])).toBe('medium')
    expect(confidenceFor(['package.json', '.git'])).toBe('high')
  })
})

describe('analyzeDirectory / scanProjects', () => {
  it('arma un draft desde package.json y git', () => {
    const dir = mkdtempSync(join(tmpdir(), 'suite-disk-'))
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({
        name: 'rg-motors',
        description: 'Taller web',
        homepage: 'https://rgmotors.cl',
        dependencies: { next: '15.0.0' },
      }),
    )
    writeFileSync(join(dir, 'next.config.mjs'), 'export default {}')
    mkdirSync(join(dir, '.git'))
    writeFileSync(
      join(dir, '.git', 'config'),
      `[remote "origin"]\n\turl = https://github.com/mathi/rg-motors.git\n`,
    )
    writeFileSync(join(dir, '.git', 'HEAD'), 'ref: refs/heads/main\n')

    const analysis = analyzeDirectory(dir)
    expect(analysis.draft.kind).toBe('web')
    expect(analysis.draft.githubRepo).toBe('mathi/rg-motors')
    expect(analysis.draft.productionUrl).toBe('https://rgmotors.cl')
    expect(analysis.draft.cloudflareZone).toBe('rgmotors.cl')
    expect(analysis.draft.branch).toBe('main')
    expect(analysis.markers).toContain('package.json')
    expect(analysis.needs?.some((need) => need.provider === 'vercel')).toBe(true)
  })

  it('detecta supabase desde .env.example al analizar', () => {
    const dir = mkdtempSync(join(tmpdir(), 'suite-disk-sb-'))
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ dependencies: { '@supabase/supabase-js': '2.0.0' } }))
    writeFileSync(join(dir, '.env.example'), 'NEXT_PUBLIC_SUPABASE_URL=https://xyzabcdefghijklm.supabase.co\n')
    const analysis = analyzeDirectory(dir)
    expect(analysis.draft.supabaseRef).toBe('xyzabcdefghijklm')
    expect(analysis.needs?.some((need) => need.provider === 'supabase')).toBe(true)
  })

  it('encuentra proyectos anidados y no entra a node_modules', () => {
    const root = mkdtempSync(join(tmpdir(), 'suite-scan-'))
    const nested = join(root, 'apps', 'demo')
    mkdirSync(nested, { recursive: true })
    mkdirSync(join(root, 'node_modules', 'leftpad'), { recursive: true })
    writeFileSync(join(nested, 'package.json'), JSON.stringify({ name: 'demo' }))
    writeFileSync(join(root, 'node_modules', 'leftpad', 'package.json'), JSON.stringify({ name: 'nope' }))

    const found = scanProjects(root)
    expect(found).toHaveLength(1)
    expect(found[0].path.toLowerCase()).toBe(nested.toLowerCase())
  })
})

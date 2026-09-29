import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { authorizeRecover } from './recover'

describe('authorizeRecover', () => {
  it('bloquea restore de un archivo sano sin sesión ni PIN', () => {
    expect(
      authorizeRecover({
        target: 'workspace',
        targetCorrupt: false,
        credentialsCorrupt: false,
        sessionOk: false,
        pinOk: false,
      }),
    ).toBe(false)
  })

  it('permite vault corrupto sin PIN', () => {
    expect(
      authorizeRecover({
        target: 'credentials',
        targetCorrupt: true,
        credentialsCorrupt: true,
        sessionOk: false,
        pinOk: false,
      }),
    ).toBe(true)
  })

  it('exige PIN si solo el catálogo está roto', () => {
    expect(
      authorizeRecover({
        target: 'workspace',
        targetCorrupt: true,
        credentialsCorrupt: false,
        sessionOk: false,
        pinOk: false,
      }),
    ).toBe(false)
    expect(
      authorizeRecover({
        target: 'workspace',
        targetCorrupt: true,
        credentialsCorrupt: false,
        sessionOk: false,
        pinOk: true,
      }),
    ).toBe(true)
  })
})

describe('restoreFromBackup', () => {
  afterEach(() => {
    vi.resetModules()
    vi.unstubAllEnvs()
  })

  it('copia el .bak sobre el principal', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'suite-recover-'))
    mkdirSync(join(dir, 'data'), { recursive: true })
    writeFileSync(join(dir, 'data', 'workspace.json'), '{"roto":true}')
    writeFileSync(join(dir, 'data', 'workspace.json.bak'), '{"ok":true}')
    const cwd = process.cwd()
    process.chdir(dir)
    const { restoreFromBackup, canRestore } = await import('./recover')
    expect(canRestore('workspace')).toBe(true)
    expect(restoreFromBackup('workspace').ok).toBe(true)
    process.chdir(cwd)
  })
})

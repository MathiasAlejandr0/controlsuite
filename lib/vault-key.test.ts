import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

describe('clave del vault', () => {
  it('no inventa una clave si el archivo falta y ya hay vault', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'suite-vault-'))
    writeFileSync(join(dir, 'credentials.json'), '{"v":2,"alg":"aes-256-gcm","iv":"aa","tag":"bb","data":"cc"}')
    vi.stubEnv('SUITE_DATA_DIR', dir)
    vi.resetModules()
    const { VaultKeyError, encryptJson } = await import('./protect')
    expect(() => encryptJson({ integrations: {} })).toThrow(VaultKeyError)
  })
})

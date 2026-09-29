import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

describe('suiteDataDir', () => {
  afterEach(() => {
    vi.resetModules()
    vi.unstubAllEnvs()
  })

  it('usa SUITE_DATA_DIR si está definido', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'suite-data-'))
    vi.stubEnv('SUITE_DATA_DIR', dir)
    const { suiteDataDir, suiteDataFile } = await import('./paths')
    expect(suiteDataDir()).toBe(dir)
    expect(suiteDataFile('credentials.json')).toBe(join(dir, 'credentials.json'))
  })

  it('cae a cwd/data en desarrollo', async () => {
    vi.stubEnv('SUITE_DATA_DIR', '')
    const { suiteDataDir } = await import('./paths')
    expect(suiteDataDir()).toBe(join(process.cwd(), 'data'))
  })
})

import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

describe('watchdog tick', () => {
  it('no superpone dos ticks', async () => {
    vi.stubEnv('SUITE_DATA_DIR', mkdtempSync(join(tmpdir(), 'suite-wd-')))
    vi.resetModules()
    vi.doMock('./refresh', () => ({
      refreshWorkspace: vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 40))
        const { loadWorkspace } = await import('./store')
        return loadWorkspace()
      }),
    }))
    const { runWatchdogTick } = await import('./watchdog')
    const [first, second] = await Promise.all([runWatchdogTick(), runWatchdogTick()])
    const skipped = [first, second].filter((item) => item.skipped)
    expect(skipped).toHaveLength(1)
  })
})

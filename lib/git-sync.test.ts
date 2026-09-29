import { describe, expect, it } from 'vitest'
import { composePlan } from './compose-act'
import { gitSyncPlan } from './git-sync'

describe('gitSyncPlan', () => {
  it('rechaza paths con metacaracteres y github inválido', () => {
    expect(gitSyncPlan({ localPath: 'D:\\pwn&calc' } as never).ok).toBe(false)
    expect(gitSyncPlan({ localPath: 'github://bad' } as never).ok).toBe(false)
    const clone = gitSyncPlan({ localPath: 'github://mathi/rg-motors' } as never, ['D:\\'])
    expect(clone.ok).toBe(true)
    if (clone.ok) {
      expect(clone.action).toBe('clone')
      expect(clone.dest.toLowerCase()).toContain('rg-motors')
    }
  })
})

describe('composePlan', () => {
  it('no arma compose fuera de raíces o con github://', () => {
    expect(composePlan('github://mathi/x', ['D:\\']).ok).toBe(false)
    expect(composePlan('C:\\Windows\\System32', ['D:\\']).ok).toBe(false)
  })
})

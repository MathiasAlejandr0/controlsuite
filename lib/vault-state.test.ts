import { describe, expect, it } from 'vitest'
import { vaultState } from './vault-state'
import type { CredentialStatus, Project, StackNeed } from './types'

const creds = (integrations: Partial<CredentialStatus['integrations']>): CredentialStatus => ({
  integrations: {
    github: false,
    vercel: false,
    cloudflare: false,
    sentry: false,
    supabase: false,
    insforge: false,
    ...integrations,
  },
  openai: false,
  hasPin: true,
  secretCount: 0,
  access: {},
})

const githubNeed: StackNeed = {
  provider: 'github',
  label: 'GitHub',
  detail: 'x',
  evidence: ['.git'],
  canLink: true,
}

describe('vaultState', () => {
  it('no pide enlace si la cuenta ya está autorizada', () => {
    expect(vaultState(githubNeed, creds({ github: true }))).toBe('ready')
    expect(vaultState(githubNeed, creds({}))).toBe('pending')
  })

  it('marca broken solo si el check dice que el token no sirve', () => {
    const project = {
      services: [
        {
          kind: 'vercel',
          checks: [{ id: 'chk-deploy', detail: 'Vercel 401. Revisá el token', status: 'unknown' }],
        },
      ],
    } as Project
    const need: StackNeed = { provider: 'vercel', label: 'Vercel', detail: 'x', evidence: [], canLink: true }
    expect(vaultState(need, creds({ vercel: true }), project)).toBe('broken')
    expect(vaultState(need, creds({ vercel: true }))).toBe('ready')
  })
})

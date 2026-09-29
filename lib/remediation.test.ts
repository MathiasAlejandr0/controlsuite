import { describe, expect, it } from 'vitest'
import { remediationFor } from './remediation'

describe('remediationFor', () => {
  it('explica un pico de ataques con pasos concretos', () => {
    const guide = remediationFor('cloudflare.attack')
    expect(guide.title).toMatch(/ataques/i)
    expect(guide.steps.join(' ')).toMatch(/Under Attack/i)
    expect(guide.steps.join(' ')).toMatch(/rate limit/i)
    expect(guide.steps.join(' ')).toMatch(/rotá/i)
  })

  it('indica RLS cuando el advisor de Supabase falla', () => {
    const guide = remediationFor('supabase.security')
    expect(guide.steps.join(' ')).toMatch(/Row Level Security/)
    expect(guide.steps.join(' ')).toMatch(/policy/i)
  })

  it('apunta al log cuando el deploy falla', () => {
    const guide = remediationFor('vercel.deploy')
    expect(guide.steps.join(' ')).toMatch(/log de build/i)
  })

  it('tiene una guía genérica si el código no está mapeado', () => {
    expect(remediationFor('no.existe').steps.length).toBeGreaterThan(0)
    expect(remediationFor(undefined).title).toBe('Qué hacer')
  })
})

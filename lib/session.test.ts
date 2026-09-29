import { describe, expect, it } from 'vitest'
import { evaluateGate } from './guard'
import { signSession, verifySession } from './session'

describe('session', () => {
  const secret = 'test-secret-key'

  it('firma y verifica un token vigente', () => {
    const token = signSession(secret, 1_000, 60_000)
    expect(verifySession(token, secret, 1_500)).toBe(true)
    expect(verifySession(token, secret, 70_000)).toBe(false)
    expect(verifySession('nope', secret)).toBe(false)
  })
})

describe('evaluateGate', () => {
  const secret = 'test-secret-key'

  it('exige PIN y cookie válida, o bypass de test', () => {
    expect(evaluateGate({ hasPin: false, secret }).ok).toBe(false)
    expect(evaluateGate({ hasPin: false, secret, bypass: true }).ok).toBe(true)
    expect(evaluateGate({ hasPin: true, secret }).code).toBe('locked')
    const cookie = signSession(secret)
    expect(evaluateGate({ hasPin: true, cookie, secret }).ok).toBe(true)
  })
})

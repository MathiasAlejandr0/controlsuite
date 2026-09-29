import { describe, expect, it } from 'vitest'
import { hashPin, isPinStrong, verifyPin } from './pin'

describe('pin', () => {
  it('rechaza PIN corto y verifica el hash', () => {
    expect(isPinStrong('12345')).toBe(false)
    expect(isPinStrong('123456')).toBe(true)
    const stored = hashPin('secreto-local')
    expect(verifyPin('secreto-local', stored)).toBe(true)
    expect(verifyPin('otro', stored)).toBe(false)
    expect(verifyPin('secreto-local', 'basura')).toBe(false)
  })
})

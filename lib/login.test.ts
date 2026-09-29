import { describe, expect, it } from 'vitest'
import { accessFlags, resolveLogin } from './login'

describe('resolveLogin', () => {
  it('resuelve usuario y clave propios', () => {
    const resolved = resolveLogin(
      'vercel-login',
      { 'vercel-login': 'clave' },
      { 'vercel-login': { username: 'mathi@mail.com' } },
    )
    expect(resolved.username).toBe('mathi@mail.com')
    expect(resolved.password).toBe('clave')
    expect(resolved.aliased).toBe(false)
  })

  it('sigue el alias de Cloudflare a GitHub', () => {
    const resolved = resolveLogin(
      'cf-login',
      { 'gh-login': 'secreto' },
      {
        'gh-login': { username: 'mathi' },
        'cf-login': { aliasOf: 'gh-login' },
      },
    )
    expect(resolved.username).toBe('mathi')
    expect(resolved.password).toBe('secreto')
    expect(resolved.aliased).toBe(true)
  })

  it('no entra en un loop de alias', () => {
    const resolved = resolveLogin(
      'a',
      { a: '1' },
      { a: { aliasOf: 'b' }, b: { aliasOf: 'a' } },
    )
    expect(resolved.resolvedId === 'a' || resolved.resolvedId === 'b').toBe(true)
  })
})

describe('accessFlags', () => {
  it('no expone valores, solo flags', () => {
    const flags = accessFlags({ 'x-login': 'secret' }, { 'x-login': { username: 'u' } })
    expect(flags['x-login']).toEqual({ stored: true, username: true, aliased: false })
  })
})

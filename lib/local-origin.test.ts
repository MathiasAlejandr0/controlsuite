import { describe, expect, it } from 'vitest'
import { allowLocalMutation, originMatchesHost } from './local-origin'

describe('originMatchesHost', () => {
  it('exige el mismo puerto que la suite', () => {
    expect(originMatchesHost('http://127.0.0.1:3100', '127.0.0.1:3100')).toBe(true)
    expect(originMatchesHost('http://127.0.0.1:8080', '127.0.0.1:3100')).toBe(false)
    expect(originMatchesHost('https://evil.example', '127.0.0.1:3100')).toBe(false)
  })
})

describe('allowLocalMutation', () => {
  it('deja pasar GET y bloquea POST cross-site o de otro puerto', () => {
    expect(
      allowLocalMutation({
        method: 'GET',
        origin: null,
        host: '127.0.0.1:3100',
        fetchSite: null,
      }),
    ).toBe(true)
    expect(
      allowLocalMutation({
        method: 'POST',
        origin: 'http://127.0.0.1:3100',
        host: '127.0.0.1:3100',
        fetchSite: 'same-origin',
      }),
    ).toBe(true)
    expect(
      allowLocalMutation({
        method: 'POST',
        origin: 'http://127.0.0.1:8080',
        host: '127.0.0.1:3100',
        fetchSite: 'same-origin',
      }),
    ).toBe(false)
    expect(
      allowLocalMutation({
        method: 'POST',
        origin: 'http://127.0.0.1:3100',
        host: '127.0.0.1:3100',
        fetchSite: 'cross-site',
      }),
    ).toBe(false)
    expect(
      allowLocalMutation({
        method: 'PUT',
        origin: null,
        host: '127.0.0.1:3100',
        fetchSite: 'same-origin',
      }),
    ).toBe(false)
  })
})

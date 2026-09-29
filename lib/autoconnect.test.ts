import { describe, expect, it } from 'vitest'
import { classifyLink } from './autoconnect'

describe('classifyLink', () => {
  it('no toca lo ya conectado y enlaza el match obvio', () => {
    expect(classifyLink({ hasAccount: true, externalId: 'web', resources: [] })).toBe('conectado')
    expect(classifyLink({ hasAccount: false, resources: [] })).toBe('falta-cuenta')
    const linked = classifyLink({
      hasAccount: true,
      hint: 'acme/web',
      resources: [
        { id: 'acme/web', label: 'acme/web' },
        { id: 'acme/api', label: 'acme/api' },
      ],
    })
    expect(linked).toEqual({ state: 'enlazado', resourceId: 'acme/web', reason: 'coincide con el repo' })
    expect(
      classifyLink({
        hasAccount: true,
        resources: [
          { id: 'a', label: 'A' },
          { id: 'b', label: 'B' },
        ],
      }),
    ).toBe('elegir')
  })
})

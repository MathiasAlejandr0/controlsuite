import { describe, expect, it } from 'vitest'
import { isSecretStale } from './secrets-hygiene'

describe('isSecretStale', () => {
  const now = Date.parse('2026-08-30T00:00:00.000Z')

  it('es viejo si nunca se rotó o pasaron 90 días', () => {
    expect(isSecretStale({ id: 'a', label: 'x', vaultUri: 'local://a', field: 'value' }, now)).toBe(true)
    expect(
      isSecretStale(
        { id: 'a', label: 'x', vaultUri: 'local://a', field: 'value', rotatedAt: '2026-08-01T00:00:00.000Z' },
        now,
      ),
    ).toBe(false)
    expect(
      isSecretStale(
        { id: 'a', label: 'x', vaultUri: 'local://a', field: 'value', rotatedAt: '2026-01-01T00:00:00.000Z' },
        now,
      ),
    ).toBe(true)
  })
})

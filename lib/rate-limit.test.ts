import { afterEach, describe, expect, it } from 'vitest'
import { allowRate, resetRateLimit } from './rate-limit'

describe('allowRate', () => {
  afterEach(() => resetRateLimit())

  it('cierra después de N golpes en la ventana', () => {
    expect(allowRate('t', 2, 60_000)).toBe(true)
    expect(allowRate('t', 2, 60_000)).toBe(true)
    expect(allowRate('t', 2, 60_000)).toBe(false)
  })
})

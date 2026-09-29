import { describe, expect, it } from 'vitest'
import { parseSentrySlug } from './sentry'

describe('parseSentrySlug', () => {
  it('normaliza URL, org y org/proyecto', () => {
    expect(parseSentrySlug('https://sentry.io/organizations/acme/projects/web/')).toBe('acme/web')
    expect(parseSentrySlug('acme/web')).toBe('acme/web')
    expect(parseSentrySlug('acme')).toBe('acme')
    expect(parseSentrySlug('')).toBeUndefined()
  })
})

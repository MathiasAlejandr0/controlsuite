import { generateKeyPairSync } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  githubAppJwt,
  githubAppManifest,
  githubInstallUrl,
  parseInstallationId,
  safeReturnTo,
  suitePublicOrigin,
} from './github-app'
import { beginGithubAuthorization } from './github-authorize'

describe('github app helpers', () => {
  it('arma un manifiesto de solo lectura y URLs locales', () => {
    const manifest = githubAppManifest('http://127.0.0.1:3100')
    expect(manifest.public).toBe(false)
    expect(manifest.default_permissions).toEqual({
      metadata: 'read',
      contents: 'read',
      actions: 'read',
      checks: 'read',
      pull_requests: 'read',
    })
    expect(manifest.redirect_url).toBe('http://127.0.0.1:3100/api/connect/github/manifest')
    expect(manifest.setup_url).toBe('http://127.0.0.1:3100/api/connect/github/installed')
    expect(manifest.hook_attributes.active).toBe(false)
  })

  it('solo vuelve a rutas internas y exige un installation id numérico', () => {
    expect(safeReturnTo('suite-control')).toBe('/projects/suite-control')
    expect(safeReturnTo('../etc')).toBe('/integrations')
    expect(safeReturnTo()).toBe('/integrations')
    expect(parseInstallationId('123456')).toBe(123456)
    expect(parseInstallationId('12abc')).toBeUndefined()
    expect(githubInstallUrl('suite-control-mathi')).toBe(
      'https://github.com/apps/suite-control-mathi/installations/new',
    )
  })

  it('firma un JWT RS256 y no navega a un redirect ajeno', () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const pem = privateKey.export({ type: 'pkcs1', format: 'pem' }).toString()
    const jwt = githubAppJwt(42, pem)
    expect(jwt.split('.')).toHaveLength(3)
    expect(suitePublicOrigin(new Request('http://127.0.0.1:3100/api/connect'))).toBe('http://127.0.0.1:3100')
    expect(suitePublicOrigin(new Request('http://evil.example/api/connect'))).toBe('http://127.0.0.1:3100')
    expect(beginGithubAuthorization({ startUrl: 'https://evil.example/phish' })).toBe(false)
    expect(beginGithubAuthorization({ redirect: 'https://evil.example/phish' })).toBe(false)
    expect(
      beginGithubAuthorization({
        flow: 'github-app',
        action: 'https://evil.example/apps/new',
        manifest: '{}',
      }),
    ).toBe(false)
  })
})

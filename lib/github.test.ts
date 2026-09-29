import { describe, expect, it } from 'vitest'
import {
  actionsHealthCheck,
  commitChecksHealth,
  githubRepoPath,
  inferKindFromLanguage,
  mapGithubRepo,
  normalizeRepo,
  repoHealthCheck,
} from './connectors/github'

describe('github helpers', () => {
  it('normaliza owner/repo', () => {
    expect(normalizeRepo('MathiasAlejandr0/RGmotors.git')).toBe('mathiasalejandr0/rgmotors')
    expect(githubRepoPath('mathi/demo')).toBe('mathi/demo')
    expect(githubRepoPath('mathi/../etc')).toBeUndefined()
  })

  it('infiere kind por lenguaje', () => {
    expect(inferKindFromLanguage('Dart')).toBe('mobile')
    expect(inferKindFromLanguage('Go')).toBe('backend')
    expect(inferKindFromLanguage('TypeScript')).toBe('web')
  })

  it('arma checks de repo y actions', () => {
    const repo = mapGithubRepo({
      full_name: 'mathi/demo',
      name: 'demo',
      description: 'Hola',
      private: true,
      language: 'TypeScript',
      default_branch: 'main',
      pushed_at: '2026-08-01T00:00:00Z',
      html_url: 'https://github.com/mathi/demo',
      homepage: 'https://demo.cl',
      open_issues_count: 2,
    })
    expect(repoHealthCheck(repo).status).toBe('healthy')
    expect(actionsHealthCheck('mathi/demo', { name: 'CI', status: 'completed', conclusion: 'failure', html_url: '' }).status).toBe(
      'down',
    )
    expect(actionsHealthCheck('mathi/demo', { name: 'CI', status: 'in_progress', conclusion: null, html_url: '' }).status).toBe(
      'degraded',
    )
    expect(actionsHealthCheck('mathi/demo').status).toBe('unknown')
    expect(actionsHealthCheck('mathi/demo', undefined, true).status).toBe('unknown')
    expect(
      commitChecksHealth('mathi/demo', [{ name: 'lint', status: 'completed', conclusion: 'failure' }]).status,
    ).toBe('down')
    expect(
      commitChecksHealth('mathi/demo', [{ name: 'lint', status: 'completed', conclusion: 'success' }]).detail,
    ).toContain('en verde')
  })
})

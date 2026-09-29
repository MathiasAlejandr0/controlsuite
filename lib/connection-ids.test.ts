import { describe, expect, it } from 'vitest'
import {
  normalizeCloudflareZone,
  normalizeGithubRepo,
  normalizeSupabaseRef,
  normalizeVercelProject,
} from './connection-ids'

describe('normalizeGithubRepo', () => {
  it('acepta URL, ssh y owner/repo', () => {
    expect(normalizeGithubRepo('https://github.com/Suertu2s/suertu2s.git')).toBe('Suertu2s/suertu2s')
    expect(normalizeGithubRepo('Suertu2s/suertu2s')).toBe('Suertu2s/suertu2s')
  })
})

describe('normalizeVercelProject', () => {
  it('saca el slug de vercel.app', () => {
    expect(normalizeVercelProject('https://suertu2s.vercel.app/')).toBe('suertu2s')
    expect(normalizeVercelProject('suertudos')).toBe('suertudos')
  })
})

describe('normalizeSupabaseRef', () => {
  it('lee el ref de la URL del dashboard', () => {
    expect(normalizeSupabaseRef('https://supabase.com/dashboard/project/abcdefghijklmnop')).toBe(
      'abcdefghijklmnop',
    )
  })
})

describe('normalizeCloudflareZone', () => {
  it('quita https y www', () => {
    expect(normalizeCloudflareZone('https://www.suertu2s.cl')).toBe('suertu2s.cl')
  })
})

import { parseGithubRemote } from './disk'

export function normalizeGithubRepo(value?: string) {
  const trimmed = (value ?? '').trim()
  if (!trimmed) return undefined
  const fromUrl = parseGithubRemote(trimmed)
  if (fromUrl) return fromUrl
  const parts = trimmed.replace(/\.git$/i, '').split('/').filter(Boolean)
  if (parts.length === 2 && !parts[0].includes(':')) return `${parts[0]}/${parts[1]}`
  return trimmed
}

export function normalizeVercelProject(value?: string) {
  const trimmed = (value ?? '').trim()
  if (!trimmed) return undefined
  try {
    const url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`)
    if (url.hostname.endsWith('.vercel.app')) {
      return url.hostname.replace(/\.vercel\.app$/i, '')
    }
    const segments = url.pathname.split('/').filter(Boolean)
    if (url.hostname.includes('vercel.com') && segments.length > 0) {
      return segments[segments.length - 1]
    }
  } catch {
    // slug crudo
  }
  return trimmed.replace(/^https?:\/\//i, '').split('/')[0]?.replace(/\.vercel\.app$/i, '') || trimmed
}

export function normalizeSupabaseRef(value?: string) {
  const trimmed = (value ?? '').trim()
  if (!trimmed) return undefined
  const fromUrl = trimmed.match(/supabase\.com\/dashboard\/project\/([a-z0-9]+)/i)
  if (fromUrl) return fromUrl[1]
  return trimmed.replace(/^https?:\/\//, '').split('.')[0] || trimmed
}

export function normalizeCloudflareZone(value?: string) {
  const trimmed = (value ?? '').trim()
  if (!trimmed) return undefined
  try {
    const url = trimmed.includes('://') ? new URL(trimmed) : new URL(`https://${trimmed}`)
    return url.hostname.replace(/^www\./, '')
  } catch {
    return trimmed.replace(/^www\./, '')
  }
}

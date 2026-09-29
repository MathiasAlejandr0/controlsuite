import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  normalizeCloudflareZone,
  normalizeGithubRepo,
  normalizeSupabaseRef,
  normalizeVercelProject,
} from './connection-ids'
import { parseGitConfig } from './disk'
import { parseSentrySlug } from './connectors/sentry'

export type ConnectKind = 'github' | 'vercel' | 'cloudflare' | 'supabase' | 'sentry'

export type ResourceHint = {
  kind: ConnectKind
  id?: string
  evidence: string
}

export type ListedResource = { id: string; label: string; hint?: string }

const PLATFORM_HOST = /localhost|127\.0\.0\.1|vercel\.app|github\.io|supabase\.co|sentry\.io/i

function readCapped(path: string, max = 40_000) {
  try {
    const raw = readFileSync(path, 'utf8')
    return raw.length > max ? raw.slice(0, max) : raw
  } catch {
    return ''
  }
}

function dependencyNames(packageJson: string) {
  try {
    const parsed = JSON.parse(packageJson) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    return Object.keys({ ...parsed.dependencies, ...parsed.devDependencies })
  } catch {
    return []
  }
}

function usesPackage(names: string[], markers: string[]) {
  return names.some((name) => markers.some((marker) => name === marker || name.startsWith(marker)))
}

function envValue(text: string, key: string) {
  const match = text.match(new RegExp(`^\\s*(?:export\\s+)?${key}\\s*=\\s*["']?([^\\s#"'\\r\\n]+)`, 'im'))
  return match?.[1]?.trim()
}

export function publicZone(value?: string) {
  const zone = normalizeCloudflareZone(value)
  if (!zone || PLATFORM_HOST.test(zone)) return undefined
  return zone
}

export function githubFromGitConfig(text: string) {
  return normalizeGithubRepo(parseGitConfig(text).origin)
}

export function vercelNameFromText(projectJson?: string, env?: string, vercelJson?: string) {
  let fromFile: string | undefined
  if (projectJson) {
    try {
      const parsed = JSON.parse(projectJson) as { projectName?: string; name?: string }
      fromFile = parsed.projectName || parsed.name
    } catch {
      fromFile = undefined
    }
  }
  let fromVercelJson: string | undefined
  if (vercelJson) {
    try {
      const parsed = JSON.parse(vercelJson) as { name?: string }
      fromVercelJson = parsed.name
    } catch {
      fromVercelJson = undefined
    }
  }
  return normalizeVercelProject(
    fromFile || envValue(env ?? '', 'VERCEL_PROJECT_NAME') || fromVercelJson || envValue(env ?? '', 'VERCEL_PROJECT_ID'),
  )
}

export function supabaseRefFromText(text: string, configToml = '') {
  const url =
    envValue(text, 'NEXT_PUBLIC_SUPABASE_URL') ??
    envValue(text, 'SUPABASE_URL') ??
    text.match(/https:\/\/([a-z0-9]{15,})\.supabase\.co/i)?.[0]
  const fromToml = configToml.match(/^\s*project_id\s*=\s*["']([a-z0-9]+)["']/im)?.[1]
  return normalizeSupabaseRef(url || fromToml)
}

export function cloudflareZoneFromText(wrangler = '', homepage?: string) {
  const named = wrangler.match(/^\s*zone_name\s*=\s*["']([^"']+)["']/im)?.[1]
  const route =
    wrangler.match(/^\s*route\s*=\s*["']([^"']+)["']/im)?.[1] ??
    wrangler.match(/^\s*pattern\s*=\s*["']([^"']+)["']/im)?.[1]
  const fromRoute = route?.replace(/\/\*.*$/, '').replace(/\*.*$/, '')
  return publicZone(named || fromRoute || homepage)
}

export function sentrySlugFromText(env = '', properties = '') {
  const org = envValue(env, 'SENTRY_ORG') ?? properties.match(/^\s*defaults\.org\s*=\s*(\S+)/im)?.[1]
  const project =
    envValue(env, 'SENTRY_PROJECT') ?? properties.match(/^\s*defaults\.project\s*=\s*(\S+)/im)?.[1]
  const dsn = envValue(env, 'SENTRY_DSN') ?? envValue(env, 'NEXT_PUBLIC_SENTRY_DSN')
  const fromDsn = dsn?.match(/@[^/]+\/(\d+)/)?.[1]
  return parseSentrySlug(org && project ? `${org}/${project}` : org || fromDsn)
}

export function obviousMatch(hint: string | undefined, resources: ListedResource[]) {
  if (resources.length === 0) return undefined
  const needle = hint?.trim().toLowerCase()
  if (needle) {
    const exact = resources.find(
      (item) => item.id.toLowerCase() === needle || item.label.toLowerCase() === needle,
    )
    if (exact) return { id: exact.id, reason: 'coincide con el repo' as const }
    const tail = needle.split('/').pop()
    const loose = resources.find((item) => {
      const id = item.id.toLowerCase()
      const label = item.label.toLowerCase()
      return id.endsWith(`/${needle}`) || label.endsWith(`/${needle}`) || (tail && (id === tail || label === tail))
    })
    if (loose) return { id: loose.id, reason: 'coincide con el repo' as const }
  }
  if (resources.length === 1) return { id: resources[0].id, reason: 'es el único' as const }
  return undefined
}

export function detectResourceHints(dir: string): ResourceHint[] {
  if (!dir || dir.startsWith('github://') || !existsSync(dir)) return []
  const envFiles = ['.env.example', '.env.local.example', '.env.development.example']
  const env = envFiles.map((name) => (existsSync(join(dir, name)) ? readCapped(join(dir, name)) : '')).join('\n')
  const git = existsSync(join(dir, '.git', 'config')) ? readCapped(join(dir, '.git', 'config')) : ''
  const vercelProject = existsSync(join(dir, '.vercel', 'project.json'))
    ? readCapped(join(dir, '.vercel', 'project.json'))
    : ''
  const vercelJson = existsSync(join(dir, 'vercel.json')) ? readCapped(join(dir, 'vercel.json')) : ''
  const wranglerName = ['wrangler.toml', 'wrangler.jsonc', 'wrangler.json'].find((name) => existsSync(join(dir, name)))
  const wrangler = wranglerName ? readCapped(join(dir, wranglerName)) : ''
  const supabaseToml = existsSync(join(dir, 'supabase', 'config.toml'))
    ? readCapped(join(dir, 'supabase', 'config.toml'))
    : ''
  const sentryProps = existsSync(join(dir, 'sentry.properties')) ? readCapped(join(dir, 'sentry.properties')) : ''
  let homepage = ''
  let packageText = ''
  if (existsSync(join(dir, 'package.json'))) {
    packageText = readCapped(join(dir, 'package.json'))
    try {
      homepage = String((JSON.parse(packageText) as { homepage?: string }).homepage ?? '')
    } catch {
      homepage = ''
    }
  }
  const deps = dependencyNames(packageText)

  const hints: ResourceHint[] = []
  const github = githubFromGitConfig(git)
  if (github || git || existsSync(join(dir, '.git'))) {
    hints.push({ kind: 'github', id: github, evidence: github ? `remote ${github}` : 'carpeta .git' })
  }
  const vercel = vercelNameFromText(vercelProject, env, vercelJson)
  if (vercel || vercelProject || vercelJson || env.includes('VERCEL_') || usesPackage(deps, ['vercel', '@vercel/'])) {
    hints.push({ kind: 'vercel', id: vercel, evidence: vercel ? `proyecto ${vercel}` : 'Vercel en el repo' })
  }
  const supabase = supabaseRefFromText(env, supabaseToml)
  if (supabase || supabaseToml || usesPackage(deps, ['@supabase/'])) {
    hints.push({ kind: 'supabase', id: supabase, evidence: supabase ? `ref ${supabase}` : 'carpeta supabase/' })
  }
  const zone = cloudflareZoneFromText(wrangler, homepage)
  if (zone || wrangler || usesPackage(deps, ['wrangler'])) {
    hints.push({ kind: 'cloudflare', id: zone, evidence: zone ? `zona ${zone}` : wranglerName ?? 'wrangler' })
  }
  const sentry = sentrySlugFromText(env, sentryProps)
  if (sentry || sentryProps || /SENTRY_/i.test(env) || usesPackage(deps, ['@sentry/'])) {
    hints.push({ kind: 'sentry', id: sentry, evidence: sentry ? sentry : 'Sentry en el entorno' })
  }
  return hints
}

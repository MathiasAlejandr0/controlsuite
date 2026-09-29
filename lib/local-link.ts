import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { LinkProvider } from './types'

export const LINK_PROVIDERS: LinkProvider[] = ['github', 'vercel', 'cloudflare', 'supabase', 'insforge']

export type HarvestResult =
  | { ok: true; token: string; source: string }
  | { ok: false; error: string }

export type LinkPlan = {
  provider: LinkProvider
  urls: string[]
  command?: { bin: string; args: readonly string[] }
  detail: string
}

const LOGIN_URL: Record<LinkProvider, string> = {
  github: 'https://github.com/login',
  vercel: 'https://vercel.com/login',
  cloudflare: 'https://dash.cloudflare.com/login',
  supabase: 'https://supabase.com/dashboard',
  insforge: 'https://insforge.dev/dashboard',
}

function userHome() {
  return process.env.SUITE_HOME?.trim() || process.env.USERPROFILE || process.env.HOME || homedir()
}

function readCapped(path: string, max = 8_000) {
  try {
    const raw = readFileSync(path, 'utf8')
    return raw.length > max ? raw.slice(0, max) : raw
  } catch {
    return ''
  }
}

export function parseVercelAuth(text: string) {
  try {
    const parsed = JSON.parse(text) as { token?: string; accessToken?: string }
    const token = parsed.token?.trim() || parsed.accessToken?.trim()
    return token || undefined
  } catch {
    return undefined
  }
}

export function parseWranglerToml(text: string) {
  const match = text.match(/^\s*oauth_token\s*=\s*"([^"]+)"/m)
  return match?.[1]?.trim()
}

function firstExisting(paths: string[]) {
  return paths.find((path) => existsSync(path))
}

function lookOnPath(bin: string) {
  const extra = process.platform === 'win32' ? ['.cmd', '.exe', ''] : ['']
  const names = extra.map((suffix) => (suffix && !bin.endsWith(suffix) ? `${bin}${suffix}` : bin))
  const result = spawnSync(process.platform === 'win32' ? 'where' : 'which', [names[0]], {
    timeout: 4_000,
    windowsHide: true,
    encoding: 'utf8',
  })
  const line = (result.stdout ?? '')
    .split(/\r?\n/)
    .map((item) => item.trim())
    .find(Boolean)
  return line && existsSync(line) ? line : undefined
}

export function harvestGithub(): HarvestResult {
  const gh = lookOnPath('gh')
  if (!gh) return { ok: false, error: 'No está GitHub CLI (gh). Se abrió el login web.' }
  const result = spawnSync(gh, ['auth', 'token'], {
    timeout: 8_000,
    windowsHide: true,
    encoding: 'utf8',
  })
  const token = (result.stdout ?? '').trim()
  if (token && !/error|not logged/i.test(token) && token.length > 8) {
    return { ok: true, token, source: 'gh auth token' }
  }
  return { ok: false, error: 'GitHub CLI no tiene sesión. Completá el login en el navegador.' }
}

export function harvestVercel(): HarvestResult {
  const home = userHome()
  const isolated = Boolean(process.env.SUITE_HOME)
  const appData = isolated ? join(home, 'AppData', 'Roaming') : (process.env.APPDATA ?? join(home, 'AppData', 'Roaming'))
  const local = isolated ? join(home, 'AppData', 'Local') : (process.env.LOCALAPPDATA ?? join(home, 'AppData', 'Local'))
  const file = firstExisting([
    join(appData, 'com.vercel.cli', 'auth.json'),
    join(local, 'com.vercel.cli', 'auth.json'),
    join(home, '.local', 'share', 'com.vercel.cli', 'auth.json'),
    join(home, '.vercel', 'auth.json'),
  ])
  if (!file) return { ok: false, error: 'Vercel CLI todavía no guardó sesión en este usuario.' }
  const token = parseVercelAuth(readCapped(file))
  return token
    ? { ok: true, token, source: 'Vercel CLI (auth.json)' }
    : { ok: false, error: 'El archivo de Vercel no tiene token.' }
}

export function harvestCloudflare(): HarvestResult {
  const home = userHome()
  const file = firstExisting([
    join(home, '.wrangler', 'config', 'default.toml'),
    join(home, '.config', '.wrangler', 'config', 'default.toml'),
  ])
  if (!file) return { ok: false, error: 'wrangler todavía no guardó oauth_token. Completá el login.' }
  const token = parseWranglerToml(readCapped(file))
  return token
    ? { ok: true, token, source: 'wrangler login' }
    : { ok: false, error: 'default.toml no tiene oauth_token.' }
}

export function harvestSupabase(): HarvestResult {
  const file = join(userHome(), '.supabase', 'access-token')
  const token = readCapped(file, 2_000).trim()
  if (!token) return { ok: false, error: 'Supabase CLI todavía no guardó access-token.' }
  return { ok: true, token, source: 'supabase login' }
}

export function parseInsforgeAuth(text: string) {
  try {
    const parsed = JSON.parse(text) as { token?: string; accessToken?: string; apiKey?: string }
    return parsed.token?.trim() || parsed.accessToken?.trim() || parsed.apiKey?.trim()
  } catch {
    const match = text.match(/^\s*(?:api_key|token|access_token)\s*=\s*"([^"]+)"/m)
    return match?.[1]?.trim()
  }
}

export function harvestInsforge(): HarvestResult {
  const home = userHome()
  const file = firstExisting([
    join(home, '.insforge', 'credentials.json'),
    join(home, '.insforge', 'auth.json'),
    join(home, '.insforge', 'config.toml'),
  ])
  if (!file) return { ok: false, error: 'InsForge todavía no guardó sesión. Completá el login del dashboard.' }
  const token = parseInsforgeAuth(readCapped(file))
  return token
    ? { ok: true, token, source: 'InsForge CLI' }
    : { ok: false, error: 'El archivo de InsForge no tiene token.' }
}

export function harvestProvider(provider: LinkProvider): HarvestResult {
  if (provider === 'github') return harvestGithub()
  if (provider === 'vercel') return harvestVercel()
  if (provider === 'cloudflare') return harvestCloudflare()
  if (provider === 'insforge') return harvestInsforge()
  return harvestSupabase()
}

export function linkPlan(provider: LinkProvider): LinkPlan {
  if (provider === 'github') {
    return {
      provider,
      urls: [LOGIN_URL.github],
      command: lookOnPath('gh')
        ? { bin: 'gh', args: ['auth', 'login', '--web', '--hostname', 'github.com', '--git-protocol', 'https'] }
        : undefined,
      detail: lookOnPath('gh')
        ? 'Se abre GitHub CLI en el navegador. Cuando termines, pulsá Recoger sesión.'
        : 'Se abre GitHub. Instalá GitHub CLI (gh) para recoger la sesión sola.',
    }
  }
  if (provider === 'vercel') {
    return {
      provider,
      urls: [LOGIN_URL.vercel],
      command: { bin: 'npx', args: ['--yes', 'vercel', 'login'] },
      detail: 'Se abre Vercel y el CLI oficial. Cuando el navegador confirme, pulsá Recoger sesión.',
    }
  }
  if (provider === 'cloudflare') {
    return {
      provider,
      urls: [LOGIN_URL.cloudflare],
      command: { bin: 'npx', args: ['--yes', 'wrangler', 'login'] },
      detail: 'wrangler login abre Cloudflare. Al autorizar, la suite recoge el oauth_token.',
    }
  }
  if (provider === 'insforge') {
    return {
      provider,
      urls: [LOGIN_URL.insforge],
      command: { bin: 'npx', args: ['--yes', '@insforge/cli', 'login'] },
      detail: 'Se abre InsForge. Cuando autorices, la suite recoge la sesión.',
    }
  }
  return {
    provider,
    urls: [LOGIN_URL.supabase],
    command: { bin: 'npx', args: ['--yes', 'supabase', 'login'] },
    detail: 'Se abre el dashboard de Supabase y el CLI. Al terminar, Recoger sesión guarda el token.',
  }
}

export function openBrowser(url: string) {
  if (
    !/^https:\/\/(github\.com|vercel\.com|dash\.cloudflare\.com|supabase\.com|cli\.github\.com|insforge\.dev)\b/i.test(
      url,
    )
  ) {
    return false
  }
  const args =
    process.platform === 'win32'
      ? { bin: 'cmd.exe', argv: ['/c', 'start', '', url] }
      : process.platform === 'darwin'
        ? { bin: 'open', argv: [url] }
        : { bin: 'xdg-open', argv: [url] }
  spawn(args.bin, args.argv, { detached: true, stdio: 'ignore', windowsHide: true }).unref()
  return true
}

function spawnWhitelisted(bin: string, args: readonly string[]) {
  const allowedBins = new Set(['gh', 'npx', 'npx.cmd'])
  if (!allowedBins.has(bin) && !bin.endsWith('\\gh.exe') && !bin.endsWith('\\npx.cmd')) return false
  const resolved = bin === 'gh' || bin === 'npx' ? lookOnPath(bin) : bin
  if (!resolved) return false
  spawn(resolved, [...args], { detached: true, stdio: 'ignore', windowsHide: false }).unref()
  return true
}

export function startLink(provider: LinkProvider) {
  const plan = linkPlan(provider)
  const opened = plan.urls.map((url) => openBrowser(url)).some(Boolean)
  const startedCli = plan.command ? spawnWhitelisted(plan.command.bin, plan.command.args) : false
  return {
    opened,
    startedCli,
    detail: plan.detail,
    urls: plan.urls,
  }
}

export function isLinkProvider(value: string): value is LinkProvider {
  return LINK_PROVIDERS.includes(value as LinkProvider)
}

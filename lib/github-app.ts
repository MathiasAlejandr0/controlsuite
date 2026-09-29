import { createPrivateKey, createSign, randomBytes, timingSafeEqual } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { hostname } from 'node:os'
import { join } from 'node:path'
import { isLocalHostname } from './local-origin'
import { suiteDataDir } from './paths'
import type { GithubAppRecord } from './types'

type GithubOAuthState = {
  nonce: string
  projectId?: string
  createdAt: number
}

type GithubConversion = {
  id: number
  slug: string
  pem: string
  client_id: string
  client_secret: string
  webhook_secret?: string
}

const STATE_TTL_MS = 20 * 60 * 1000

function stateFile() {
  return join(suiteDataDir(), 'github-oauth.json')
}

export function suitePublicOrigin(request: Request) {
  const url = new URL(request.url)
  if (!isLocalHostname(url.hostname)) return 'http://127.0.0.1:3100'
  return `${url.protocol}//${url.host}`
}

export function safeReturnTo(projectId?: string) {
  if (projectId && /^[a-zA-Z0-9_-]{1,80}$/.test(projectId)) return `/projects/${projectId}`
  return '/integrations'
}

function githubAppName() {
  const raw = (process.env.USERNAME ?? hostname() ?? 'local').replace(/[^a-zA-Z0-9]/g, '').slice(0, 10)
  const suffix = raw || randomBytes(2).toString('hex')
  return `Suite Control ${suffix}`.slice(0, 34)
}

export function githubAppManifest(origin: string) {
  return {
    name: githubAppName(),
    url: origin,
    description: 'Centro de mando local: lee el repo, Actions y checks. No despliega ni escribe código.',
    public: false,
    redirect_url: `${origin}/api/connect/github/manifest`,
    setup_url: `${origin}/api/connect/github/installed`,
    callback_urls: [`${origin}/api/connect/github/manifest`],
    hook_attributes: {
      url: `${origin}/api/github/webhook`,
      active: false,
    },
    default_permissions: {
      metadata: 'read',
      contents: 'read',
      actions: 'read',
      checks: 'read',
      pull_requests: 'read',
    },
  }
}

function writeState(state: GithubOAuthState) {
  const dir = suiteDataDir()
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(stateFile(), JSON.stringify(state), 'utf8')
}

export function beginGithubState(projectId?: string) {
  const nonce = randomBytes(24).toString('hex')
  writeState({
    nonce,
    projectId: projectId && /^[a-zA-Z0-9_-]{1,80}$/.test(projectId) ? projectId : undefined,
    createdAt: Date.now(),
  })
  return nonce
}

export function readGithubState() {
  try {
    const parsed = JSON.parse(readFileSync(stateFile(), 'utf8')) as GithubOAuthState
    if (!parsed.nonce || Date.now() - parsed.createdAt > STATE_TTL_MS) return undefined
    return parsed
  } catch {
    return undefined
  }
}

export function peekGithubState(nonce: string | null) {
  const stored = readGithubState()
  if (!stored || !nonce) return undefined
  const a = Buffer.from(stored.nonce)
  const b = Buffer.from(nonce)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return undefined
  return stored
}

export function consumeGithubState(nonce: string | null) {
  const stored = peekGithubState(nonce)
  if (!stored) return undefined
  try {
    unlinkSync(stateFile())
  } catch {
    // el nonce ya no se reutiliza
  }
  return stored
}

export function takeGithubReturn() {
  const stored = readGithubState()
  try {
    unlinkSync(stateFile())
  } catch {
    // no había estado pendiente
  }
  return stored
}

export function beginGithubAppRegistration(origin: string, projectId?: string) {
  const nonce = beginGithubState(projectId)
  return {
    action: `https://github.com/settings/apps/new?state=${nonce}`,
    manifest: JSON.stringify(githubAppManifest(origin)),
    nonce,
  }
}

export function githubInstallUrl(slug: string) {
  return `https://github.com/apps/${encodeURIComponent(slug)}/installations/new`
}

export function parseInstallationId(value: string | null) {
  if (!value || !/^\d{1,12}$/.test(value)) return undefined
  return Number(value)
}

export function githubAppJwt(appId: number, pem: string) {
  const now = Math.floor(Date.now() / 1000)
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(
    JSON.stringify({ iat: now - 60, exp: now + 8 * 60, iss: String(appId) }),
  ).toString('base64url')
  const data = `${header}.${payload}`
  const sign = createSign('RSA-SHA256')
  sign.update(data)
  const signature = sign.sign(createPrivateKey(pem)).toString('base64url')
  return `${data}.${signature}`
}

export async function convertGithubManifest(code: string): Promise<GithubAppRecord> {
  const response = await fetch(`https://api.github.com/app-manifests/${encodeURIComponent(code)}/conversions`, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'suite-control',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    cache: 'no-store',
  })
  if (!response.ok) {
    throw new Error(`GitHub ${response.status} al crear la app.`)
  }
  const raw = (await response.json()) as GithubConversion
  if (!raw.id || !raw.slug || !raw.pem || !raw.client_id) {
    throw new Error('GitHub no devolvió las credenciales de la app.')
  }
  return {
    id: raw.id,
    slug: raw.slug,
    clientId: raw.client_id,
    clientSecret: raw.client_secret,
    pem: raw.pem,
    webhookSecret: raw.webhook_secret,
  }
}

export async function mintInstallationToken(app: GithubAppRecord) {
  if (!app.installationId) throw new Error('Falta instalar Suite Control en un repo.')
  const jwt = githubAppJwt(app.id, app.pem)
  const response = await fetch(
    `https://api.github.com/app/installations/${app.installationId}/access_tokens`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${jwt}`,
        'User-Agent': 'suite-control',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      cache: 'no-store',
    },
  )
  if (!response.ok) throw new Error(`GitHub ${response.status} al emitir el token de instalación.`)
  const raw = (await response.json()) as { token?: string }
  if (!raw.token) throw new Error('GitHub no emitió token de instalación.')
  return raw.token
}

export async function fetchInstallationAccount(app: GithubAppRecord) {
  if (!app.installationId) return undefined
  const jwt = githubAppJwt(app.id, app.pem)
  const response = await fetch(`https://api.github.com/app/installations/${app.installationId}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${jwt}`,
      'User-Agent': 'suite-control',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    cache: 'no-store',
  })
  if (!response.ok) return undefined
  const raw = (await response.json()) as { account?: { login?: string; html_url?: string } }
  return raw.account?.login
    ? { login: raw.account.login, htmlUrl: raw.account.html_url ?? `https://github.com/${raw.account.login}` }
    : undefined
}

export function htmlNotice(title: string, body: string, href: string) {
  const esc = (value: string) =>
    value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
  return `<!doctype html><html lang="es"><meta charset="utf-8"><title>${esc(title)}</title><body style="font-family:Geist,Segoe UI,sans-serif;background:#0b1015;color:#e8eef4;padding:48px;max-width:40rem"><h1 style="font-size:1.4rem">${esc(title)}</h1><p>${esc(body)}</p><p><a href="${esc(href)}" style="color:#7dd3fc">Volver a Suite Control</a></p></body></html>`
}

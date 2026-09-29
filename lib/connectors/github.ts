import type { HealthCheck, ProjectKind } from '../types'

type GithubRun = {
  conclusion: string | null
  status: string
  html_url: string
  name: string
}

type GithubRepoRaw = {
  full_name: string
  name: string
  description: string | null
  private: boolean
  language: string | null
  default_branch: string
  pushed_at: string | null
  html_url: string
  homepage: string | null
  open_issues_count?: number
  archived?: boolean
  fork?: boolean
}

export type GithubUser = {
  login: string
  name?: string | null
  avatarUrl?: string
  htmlUrl: string
}

export type GithubRepo = {
  fullName: string
  name: string
  description: string
  private: boolean
  language?: string
  defaultBranch: string
  pushedAt?: string
  htmlUrl: string
  homepage?: string
  openIssues: number
  archived: boolean
  fork: boolean
}

function headers(token?: string) {
  const next: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'suite-control',
    'X-GitHub-Api-Version': '2022-11-28',
  }
  if (token) next.Authorization = `Bearer ${token}`
  return next
}

export function normalizeRepo(value?: string) {
  return (value ?? '').trim().replace(/\.git$/i, '').toLowerCase()
}

export function githubRepoPath(repo: string) {
  const parts = repo.trim().split('/').filter(Boolean)
  if (parts.length !== 2) return undefined
  if (parts.some((part) => part === '.' || part === '..')) return undefined
  return `${encodeURIComponent(parts[0])}/${encodeURIComponent(parts[1])}`
}

export function inferKindFromLanguage(language?: string | null): ProjectKind {
  const lang = (language ?? '').toLowerCase()
  if (lang === 'dart' || lang === 'kotlin' || lang === 'swift') return 'mobile'
  if (lang === 'go' || lang === 'rust' || lang === 'python' || lang === 'php' || lang === 'c#') return 'backend'
  return 'web'
}

export function mapGithubRepo(raw: GithubRepoRaw): GithubRepo {
  return {
    fullName: raw.full_name,
    name: raw.name,
    description: raw.description?.trim() || 'Sin descripción.',
    private: raw.private,
    language: raw.language ?? undefined,
    defaultBranch: raw.default_branch || 'main',
    pushedAt: raw.pushed_at ?? undefined,
    htmlUrl: raw.html_url,
    homepage: raw.homepage?.startsWith('http') ? raw.homepage : undefined,
    openIssues: raw.open_issues_count ?? 0,
    archived: Boolean(raw.archived),
    fork: Boolean(raw.fork),
  }
}

export function repoHealthCheck(repo: GithubRepo): HealthCheck {
  const when = repo.pushedAt ? new Date(repo.pushedAt).toLocaleDateString('es-CL') : 'sin push'
  return {
    id: 'chk-repo',
    label: 'Repositorio',
    weight: 8,
    status: repo.archived ? 'degraded' : 'healthy',
    detail: `${repo.private ? 'Privado' : 'Público'} · ${repo.language ?? 'sin lenguaje'} · último push ${when}`,
    source: 'GitHub',
    code: 'github.repo',
  }
}

export function commitChecksHealth(
  repo: string,
  runs?: Array<{ name: string; status: string; conclusion: string | null }>,
): HealthCheck {
  if (!runs || runs.length === 0) {
    return {
      id: 'chk-github-checks',
      label: 'Checks del commit',
      weight: 10,
      status: 'unknown',
      detail: `${repo} sin checks en la rama por defecto.`,
      source: 'GitHub',
    }
  }
  const failed = runs.filter((run) => run.conclusion === 'failure' || run.conclusion === 'timed_out')
  const pending = runs.filter((run) => run.status === 'queued' || run.status === 'in_progress')
  const first = failed[0] ?? pending[0] ?? runs[0]
  return {
    id: 'chk-github-checks',
    label: 'Checks del commit',
    weight: 10,
    code: 'github.ci',
    status: failed.length ? 'down' : pending.length ? 'degraded' : 'healthy',
    detail:
      failed.length > 0
        ? `${failed.length} check${failed.length === 1 ? '' : 's'} en rojo · ${first.name}`
        : pending.length > 0
          ? `${pending.length} check${pending.length === 1 ? '' : 's'} en curso · ${first.name}`
          : `${runs.length} check${runs.length === 1 ? '' : 's'} en verde`,
    source: 'GitHub',
  }
}

export function actionsHealthCheck(repo: string, run?: GithubRun, reachableWithoutActions = false): HealthCheck {
  if (reachableWithoutActions) {
    return {
      id: 'chk-ci',
      label: 'CI y supply chain',
      weight: 10,
      code: 'github.ci',
      status: 'unknown',
      detail: `${repo} accesible. Sin permiso para Actions.`,
      source: 'GitHub',
    }
  }
  if (!run) {
    return {
      id: 'chk-ci',
      label: 'CI y supply chain',
      weight: 10,
      code: 'github.ci',
      status: 'unknown',
      detail: `${repo} sin workflow runs todavía.`,
      source: 'GitHub',
    }
  }
  const failed = run.conclusion === 'failure' || run.conclusion === 'timed_out'
  const pending = run.status === 'in_progress' || run.status === 'queued'
  return {
    id: 'chk-ci',
    label: 'CI y supply chain',
    weight: 10,
    code: 'github.ci',
    status: failed ? 'down' : pending ? 'degraded' : 'healthy',
    detail: `${run.name}: ${run.conclusion ?? run.status}`,
    source: 'GitHub',
    href: run.html_url || undefined,
  }
}

export async function fetchGithubUser(token: string): Promise<GithubUser> {
  const response = await fetch('https://api.github.com/user', { headers: headers(token), cache: 'no-store' })
  if (response.status === 401) {
    throw new Error('GitHub no aceptó el token. Creá uno con repo, security_events y read:org.')
  }
  if (!response.ok) throw new Error(`GitHub ${response.status} al leer la cuenta.`)
  const raw = (await response.json()) as { login: string; name?: string | null; avatar_url?: string; html_url: string }
  return {
    login: raw.login,
    name: raw.name,
    avatarUrl: raw.avatar_url,
    htmlUrl: raw.html_url,
  }
}

export async function fetchInstallationRepos(token: string): Promise<GithubRepo[]> {
  const repos: GithubRepo[] = []
  for (let page = 1; page <= 3; page += 1) {
    const response = await fetch(`https://api.github.com/installation/repositories?per_page=100&page=${page}`, {
      headers: headers(token),
      cache: 'no-store',
    })
    if (!response.ok) throw new Error(`GitHub ${response.status} al listar repos instalados.`)
    const payload = (await response.json()) as { repositories?: GithubRepoRaw[] }
    const batch = payload.repositories ?? []
    repos.push(...batch.map(mapGithubRepo))
    if (batch.length < 100) break
  }
  return repos.filter((repo) => !repo.archived)
}

export async function fetchGithubRepos(token: string): Promise<GithubRepo[]> {
  const repos: GithubRepo[] = []
  for (let page = 1; page <= 3; page += 1) {
    const response = await fetch(
      `https://api.github.com/user/repos?per_page=100&page=${page}&sort=pushed&affiliation=owner,collaborator,organization_member`,
      { headers: headers(token), cache: 'no-store' },
    )
    if (!response.ok) throw new Error(`GitHub ${response.status} al listar repos.`)
    const batch = (await response.json()) as GithubRepoRaw[]
    repos.push(...batch.map(mapGithubRepo))
    if (batch.length < 100) break
  }
  return repos.filter((repo) => !repo.archived)
}

export async function checkGithub(repo: string, token?: string): Promise<HealthCheck[]> {
  const path = githubRepoPath(repo)
  if (!path) {
    return [
      {
        id: 'chk-ci',
        label: 'CI y supply chain',
        weight: 10,
        status: 'unknown',
        detail: 'Falta owner/repo en el servicio GitHub.',
        source: 'GitHub',
      },
    ]
  }

  const repoRes = await fetch(`https://api.github.com/repos/${path}`, {
    headers: headers(token),
    cache: 'no-store',
  })
  if (repoRes.status === 404) {
    return [
      {
        id: 'chk-ci',
        label: 'CI y supply chain',
        weight: 10,
        status: token ? 'down' : 'unknown',
        detail: token
          ? `Repo ${repo} no existe o el token no tiene acceso.`
          : `Repo ${repo} no es público. Pegá un PAT en Ajustes.`,
        source: 'GitHub',
      },
    ]
  }
  if (!repoRes.ok) {
    return [
      {
        id: 'chk-ci',
        label: 'CI y supply chain',
        weight: 10,
        status: 'unknown',
        detail: `GitHub ${repoRes.status} al leer ${repo}`,
        source: 'GitHub',
      },
    ]
  }

  const raw = (await repoRes.json()) as GithubRepoRaw
  const mapped = mapGithubRepo(raw)
  const checks = [repoHealthCheck(mapped)]

  const runsRes = await fetch(`https://api.github.com/repos/${path}/actions/runs?per_page=1`, {
    headers: headers(token),
    cache: 'no-store',
  })
  if (!runsRes.ok) {
    checks.push(actionsHealthCheck(repo, undefined, true))
  } else {
    const payload = (await runsRes.json()) as { workflow_runs?: GithubRun[] }
    checks.push(actionsHealthCheck(repo, payload.workflow_runs?.[0]))

    const branch = encodeURIComponent(mapped.defaultBranch || 'main')
    const checksRes = await fetch(`https://api.github.com/repos/${path}/commits/${branch}/check-runs?per_page=20`, {
      headers: headers(token),
      cache: 'no-store',
    })
    if (checksRes.ok) {
      const checkPayload = (await checksRes.json()) as {
        check_runs?: Array<{ name: string; status: string; conclusion: string | null }>
      }
      checks.push(commitChecksHealth(repo, checkPayload.check_runs))
    }
  }

  checks.push(await dependabotCheck(path, repo, token))
  checks.push(await secretScanningCheck(path, repo, token))
  checks.push(await pullsCheck(path, repo, token))

  return checks
}

type AlertRow = { state?: string; severity?: string; secret_type?: string; html_url?: string; number?: number }

function alertRows(payload: unknown): AlertRow[] {
  return Array.isArray(payload) ? (payload as AlertRow[]) : []
}

export function dependabotSummary(repo: string, alerts: AlertRow[], statusCode?: number): HealthCheck {
  if (statusCode === 403 || statusCode === 404) {
    return {
      id: 'chk-dependabot',
      label: 'Dependabot',
      weight: 12,
      status: 'unknown',
      detail: `${repo} · el token no tiene security_events o Dependabot no está habilitado.`,
      source: 'GitHub',
      code: 'github.dependabot',
    }
  }
  const high = alerts.filter((item) => item.severity === 'critical' || item.severity === 'high')
  return {
    id: 'chk-dependabot',
    label: 'Dependabot',
    weight: 12,
    status: high.length ? 'down' : alerts.length ? 'degraded' : 'healthy',
    detail: alerts.length
      ? `${alerts.length} alertas abiertas · ${high.length} altas o críticas`
      : `${repo} · sin alertas abiertas de Dependabot`,
    source: 'GitHub',
    code: 'github.dependabot',
    href: `https://github.com/${repo}/security/dependabot`,
  }
}

export function secretScanningSummary(repo: string, alerts: AlertRow[], statusCode?: number): HealthCheck {
  if (statusCode === 403 || statusCode === 404) {
    return {
      id: 'chk-secrets',
      label: 'Secret scanning',
      weight: 14,
      status: 'unknown',
      detail: `${repo} · secret scanning no disponible con este token o plan.`,
      source: 'GitHub',
      code: 'github.secrets',
    }
  }
  const first = alerts[0]
  return {
    id: 'chk-secrets',
    label: 'Secret scanning',
    weight: 16,
    status: alerts.length ? 'down' : 'healthy',
    detail: alerts.length
      ? `${alerts.length} secretos abiertos${first?.secret_type ? ` · ${first.secret_type}` : ''}`
      : `${repo} · sin secretos filtrados abiertos`,
    source: 'GitHub',
    code: 'github.secrets',
    href: first?.html_url || `https://github.com/${repo}/security/secret-scanning`,
  }
}

export function pullsSummary(repo: string, count: number): HealthCheck {
  return {
    id: 'chk-pulls',
    label: 'Pull requests',
    weight: 4,
    status: count >= 8 ? 'degraded' : 'healthy',
    detail: count ? `${repo} · ${count} PR abiertas` : `${repo} · sin PR abiertas`,
    source: 'GitHub',
    code: 'github.pulls',
    href: `https://github.com/${repo}/pulls`,
  }
}

async function dependabotCheck(path: string, repo: string, token?: string): Promise<HealthCheck> {
  try {
    const response = await fetch(`https://api.github.com/repos/${path}/dependabot/alerts?state=open&per_page=30`, {
      headers: headers(token),
      cache: 'no-store',
    })
    if (!response.ok) return dependabotSummary(repo, [], response.status)
    return dependabotSummary(repo, alertRows(await response.json()))
  } catch {
    return dependabotSummary(repo, [], 404)
  }
}

async function secretScanningCheck(path: string, repo: string, token?: string): Promise<HealthCheck> {
  try {
    const response = await fetch(`https://api.github.com/repos/${path}/secret-scanning/alerts?state=open&per_page=20`, {
      headers: headers(token),
      cache: 'no-store',
    })
    if (!response.ok) return secretScanningSummary(repo, [], response.status)
    return secretScanningSummary(repo, alertRows(await response.json()))
  } catch {
    return secretScanningSummary(repo, [], 404)
  }
}

async function pullsCheck(path: string, repo: string, token?: string): Promise<HealthCheck> {
  try {
    const response = await fetch(`https://api.github.com/repos/${path}/pulls?state=open&per_page=20`, {
      headers: headers(token),
      cache: 'no-store',
    })
    if (!response.ok) return pullsSummary(repo, 0)
    const rows = (await response.json()) as unknown[]
    return pullsSummary(repo, Array.isArray(rows) ? rows.length : 0)
  } catch {
    return pullsSummary(repo, 0)
  }
}

export async function listGithubRepos(token: string) {
  const response = await fetch('https://api.github.com/user/repos?per_page=40&sort=pushed&affiliation=owner,collaborator', {
    headers: headers(token),
    cache: 'no-store',
  })
  if (!response.ok) return []
  const rows = (await response.json()) as GithubRepoRaw[]
  return rows.map((row) => ({ id: row.full_name, label: row.full_name, hint: row.private ? 'privado' : 'público' }))
}

export async function validateGithubToken(token: string) {
  const user = await fetchGithubUser(token).catch((error: unknown) => {
    throw error instanceof Error ? error : new Error('GitHub rechazó el token.')
  })
  const resources = await listGithubRepos(token)
  return { ok: true as const, account: user.login, resources }
}

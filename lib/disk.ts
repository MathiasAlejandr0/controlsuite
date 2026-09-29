import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { suiteDataDir } from './paths'
import { assertPublicHttpUrl } from './public-url'
import { applyStackToDraft, detectStack } from './stack-detect'
import type { DiskAnalysis, DiskFolder, ProjectDraft, ProjectKind } from './types'

const SKIP_NAMES = new Set([
  '$recycle.bin',
  '.cache',
  '.git',
  '.next',
  '.turbo',
  '.venv',
  '__pycache__',
  'appdata',
  'build',
  'coverage',
  'dist',
  'documents and settings',
  'node_modules',
  'out',
  'perflogs',
  'program files',
  'program files (x86)',
  'programdata',
  'recovery',
  'steamlibrary',
  'system volume information',
  'venv',
  'windows',
  'windowsapps',
  'xboxgames',
])

const BLOCKED_PREFIXES = [
  'c:\\windows',
  'c:\\program files',
  'c:\\program files (x86)',
  'c:\\programdata',
]

const FILE_MARKERS = [
  'package.json',
  'pubspec.yaml',
  'cargo.toml',
  'go.mod',
  'pyproject.toml',
  'composer.json',
  'app.json',
  'tauri.conf.json',
  'next.config.ts',
  'next.config.mjs',
  'next.config.js',
  'vite.config.ts',
  'vite.config.mjs',
  'vite.config.js',
  'nuxt.config.ts',
  'docker-compose.yml',
  'docker-compose.yaml',
  'compose.yml',
  'compose.yaml',
  'cmakelists.txt',
  'project.godot',
] as const

const IGNORE_REMOTES = new Set(['flutter/flutter'])

export function isIgnoredRemote(repo?: string) {
  return Boolean(repo && IGNORE_REMOTES.has(repo))
}

const EXTRA_SUFFIXES = ['.sln', '.csproj', '.uproject']

const MAX_SCAN = 80
const MAX_BROWSE = 200
const MAX_DEPTH = 2

export function defaultRoots(): string[] {
  const extra = (process.env.SUITE_ROOTS ?? '')
    .split(';')
    .map((item) => item.trim())
    .filter(Boolean)
  const home = process.env.USERPROFILE?.trim()
  return ['D:\\', home, ...extra].filter((root): root is string => {
    if (!root) return false
    try {
      return existsSync(root) && lstatSync(root).isDirectory()
    } catch {
      return false
    }
  })
}

export function normalizeDiskPath(value: string) {
  return resolve(value).replace(/[/\\]+$/, '').toLowerCase()
}

export function isBlockedPath(value: string) {
  const normalized = normalizeDiskPath(value)
  const vault = normalizeDiskPath(suiteDataDir())
  const prefixes = [...BLOCKED_PREFIXES, vault]
  return prefixes.some((prefix) => normalized === prefix || normalized.startsWith(`${prefix}\\`))
}

export function resolveScanRoots(custom?: string[]) {
  const wanted = (custom ?? []).map((item) => item.trim()).filter(Boolean)
  const list = wanted.length > 0 ? wanted : defaultRoots()
  return list.filter((root) => {
    try {
      return existsSync(root) && lstatSync(root).isDirectory()
    } catch {
      return false
    }
  })
}

export function isUnderAllowedRoot(value: string, roots?: string[]) {
  const normalized = normalizeDiskPath(value)
  const allowed = roots?.length ? roots : defaultRoots()
  return allowed.some((root) => {
    const prefix = normalizeDiskPath(root)
    return normalized === prefix || normalized.startsWith(`${prefix}\\`)
  })
}

export function shouldSkipName(name: string) {
  const lower = name.toLowerCase()
  if (SKIP_NAMES.has(lower)) return true
  if (lower.startsWith('$')) return true
  return false
}

export function parseGithubRemote(url: string): string | undefined {
  const trimmed = url.trim()
  const https = trimmed.match(/github\.com[/:]([^/\s]+\/[^/\s]+?)(?:\.git)?$/i)
  if (!https) return undefined
  return https[1].replace(/\.git$/i, '')
}

export function parseGitConfig(content: string): { origin?: string; branch?: string } {
  const origin = content.match(/\[remote "origin"\][\s\S]*?url\s*=\s*(.+)/i)?.[1]?.trim()
  const branch =
    content.match(/\[branch "([^"]+)"\]/)?.[1] ??
    content.match(/head\s*=\s*refs\/heads\/(\S+)/i)?.[1]
  return {
    origin: origin ? parseGithubRemote(origin) : undefined,
    branch,
  }
}

export function parseGitHead(content: string): string | undefined {
  return content.match(/^ref:\s*refs\/heads\/(\S+)/m)?.[1]
}

type PackageJson = {
  name?: string
  description?: string
  homepage?: string
  repository?: string | { url?: string }
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

export function inferKind(markers: string[], pkg?: PackageJson): ProjectKind {
  const deps = { ...pkg?.dependencies, ...pkg?.devDependencies }
  const has = (name: string) => markers.includes(name)
  if (
    has('pubspec.yaml') ||
    has('app.json') ||
    deps.expo ||
    deps['react-native']
  ) {
    return 'mobile'
  }
  if (
    has('installer') ||
    has('tauri.conf.json') ||
    deps['@tauri-apps/cli'] ||
    deps.electron ||
    deps['electron-builder']
  ) {
    return 'desktop'
  }
  if (
    has('next.config.ts') ||
    has('next.config.mjs') ||
    has('next.config.js') ||
    has('vite.config.ts') ||
    has('nuxt.config.ts') ||
    deps.next ||
    deps.vite
  ) {
    return 'web'
  }
  if (has('.sln') || has('.csproj') || has('.uproject') || has('project.godot')) {
    return 'desktop'
  }
  if (has('go.mod') || has('pyproject.toml') || has('cargo.toml') || has('composer.json')) {
    return 'backend'
  }
  if (has('package.json')) return 'web'
  return 'web'
}

export function confidenceFor(markers: string[]): DiskAnalysis['confidence'] {
  if (markers.some((marker) => marker !== '.git' && marker !== 'docker-compose.yml')) return 'high'
  if (markers.includes('.git')) return 'medium'
  return 'low'
}

function readText(path: string, max = 80_000) {
  const raw = readFileSync(path, 'utf8')
  return raw.length > max ? raw.slice(0, max) : raw
}

function readJson<T>(path: string): T | undefined {
  try {
    return JSON.parse(readText(path)) as T
  } catch {
    return undefined
  }
}

function listMarkers(dir: string): string[] {
  const found: string[] = []
  if (existsSync(join(dir, '.git'))) found.push('.git')
  for (const marker of FILE_MARKERS) {
    const names: string[] = [marker]
    if (marker === 'cargo.toml') names.push('Cargo.toml')
    for (const name of names) {
      if (existsSync(join(dir, name)) && !found.includes(marker)) found.push(marker)
    }
  }
  if (existsSync(join(dir, 'src-tauri', 'tauri.conf.json')) && !found.includes('tauri.conf.json')) {
    found.push('tauri.conf.json')
  }
  if (
    (existsSync(join(dir, 'installer')) || existsSync(join(dir, 'suite-control.iss'))) &&
    !found.includes('installer')
  ) {
    found.push('installer')
  }
  try {
    for (const name of readdirSync(dir)) {
      const lower = name.toLowerCase()
      if (EXTRA_SUFFIXES.some((suffix) => lower.endsWith(suffix)) && !found.includes(lower.slice(lower.lastIndexOf('.')))) {
        found.push(lower.slice(lower.lastIndexOf('.')))
      }
    }
  } catch {
    // carpeta sin permiso
  }
  return found
}

export function isProjectDir(dir: string) {
  return listMarkers(dir).length > 0
}

function prettyFolderName(name: string) {
  if (/[a-z][A-Z]/.test(name) || name.includes(' ')) return name
  return name
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function hostnameFromUrl(value?: string) {
  if (!value) return undefined
  try {
    const host = new URL(value).hostname.replace(/^www\./, '')
    return host || undefined
  } catch {
    return undefined
  }
}

function firstHttpUrl(text: string) {
  const match = text.match(/https?:\/\/[^\s)"'`>]+/i)
  if (!match) return undefined
  const url = match[0].replace(/[.,;]+$/, '')
  if (/github\.com|localhost|127\.0\.0\.1|example\.com|shields\.io|badge/i.test(url)) return undefined
  const allowed = assertPublicHttpUrl(url)
  return allowed.ok ? allowed.url.toString() : undefined
}

export function analyzeDirectory(dir: string, importedPaths: Set<string> = new Set()): DiskAnalysis {
  const path = resolve(dir)
  const markers = listMarkers(path)
  const pkg = existsSync(join(path, 'package.json'))
    ? readJson<PackageJson>(join(path, 'package.json'))
    : undefined
  const gitConfig = existsSync(join(path, '.git', 'config'))
    ? parseGitConfig(readText(join(path, '.git', 'config')))
    : {}
  const gitHead = existsSync(join(path, '.git', 'HEAD'))
    ? parseGitHead(readText(join(path, '.git', 'HEAD')))
    : undefined
  const vercel = existsSync(join(path, '.vercel', 'project.json'))
    ? readJson<{ projectName?: string; name?: string }>(join(path, '.vercel', 'project.json'))
    : undefined

  const repoFromPkg =
    typeof pkg?.repository === 'string'
      ? parseGithubRemote(pkg.repository)
      : pkg?.repository?.url
        ? parseGithubRemote(pkg.repository.url)
        : undefined

  const homepage = pkg?.homepage?.startsWith('http') && assertPublicHttpUrl(pkg.homepage).ok
    ? pkg.homepage
    : undefined
  const readmeName = ['README.md', 'readme.md', 'README.MD'].find((name) => existsSync(join(path, name)))
  const readmeUrl = readmeName ? firstHttpUrl(readText(join(path, readmeName), 4000)) : undefined
  const productionUrl = homepage || readmeUrl
  const githubRepo = gitConfig.origin || repoFromPkg
  const kind = inferKind(markers, pkg)
  const folder = basename(path)
  const name = prettyFolderName(folder)
  const vercelProject = vercel?.projectName || vercel?.name
  const pubspec = existsSync(join(path, 'pubspec.yaml'))
    ? readText(join(path, 'pubspec.yaml'), 2000).match(/^name:\s*(\S+)/m)?.[1]
    : undefined

  const stack = detectStack(path, kind)
  const draft = applyStackToDraft(
    {
      name: name || pubspec || pkg?.name || folder,
      kind,
      summary: pkg?.description?.trim() || `Importado desde ${path}`,
      localPath: path,
      branch: gitHead || gitConfig.branch || 'main',
      productionUrl,
      githubRepo,
      vercelProject,
      cloudflareZone: hostnameFromUrl(productionUrl),
      hasDocker: markers.some((marker) => marker.startsWith('docker-compose') || marker === 'compose.yml'),
    },
    stack,
  )

  return {
    path,
    markers,
    draft,
    alreadyImported: importedPaths.has(normalizeDiskPath(path)),
    confidence: confidenceFor(markers),
    needs: stack.needs,
  }
}

export function resolveDirectory(input: string): { ok: true; path: string } | { ok: false; error: string } {
  const trimmed = input.trim()
  if (!trimmed) return { ok: false, error: 'Indicá una carpeta.' }
  const path = resolve(trimmed)
  if (isBlockedPath(path)) return { ok: false, error: 'Esa carpeta del sistema no se escanea.' }
  try {
    if (!existsSync(path) || !lstatSync(path).isDirectory()) {
      return { ok: false, error: 'La carpeta no existe.' }
    }
  } catch {
    return { ok: false, error: 'No se pudo leer esa carpeta.' }
  }
  return { ok: true, path }
}

export function browseDirectory(input: string): { path: string; parent: string | null; folders: DiskFolder[] } {
  const resolved = resolveDirectory(input)
  if (!resolved.ok) throw new Error(resolved.error)
  const path = resolved.path
  const parentDir = dirname(path)
  const parent = parentDir !== path ? parentDir : null
  const folders: DiskFolder[] = []

  for (const entry of readdirSync(path, { withFileTypes: true })) {
    if (folders.length >= MAX_BROWSE) break
    if (!entry.isDirectory() || entry.isSymbolicLink() || shouldSkipName(entry.name)) continue
    const full = join(path, entry.name)
    try {
      if (lstatSync(full).isSymbolicLink()) continue
    } catch {
      continue
    }
    const markers = listMarkers(full)
    folders.push({
      name: entry.name,
      path: full,
      isProject: markers.length > 0,
      markers,
    })
  }

  folders.sort((a, b) => Number(b.isProject) - Number(a.isProject) || a.name.localeCompare(b.name))
  return { path, parent, folders }
}

export function scanProjects(root: string, importedPaths: Set<string> = new Set()): DiskAnalysis[] {
  const resolved = resolveDirectory(root)
  if (!resolved.ok) throw new Error(resolved.error)
  const found: DiskAnalysis[] = []

  function walk(dir: string, depth: number) {
    if (found.length >= MAX_SCAN) return
    if (shouldSkipName(basename(dir)) && depth > 0) return
    if (isBlockedPath(dir)) return

    const markers = listMarkers(dir)
    if (markers.length > 0 && depth > 0) {
      const analysis = analyzeDirectory(dir, importedPaths)
      if (!isIgnoredRemote(analysis.draft.githubRepo)) {
        found.push(analysis)
      }
      return
    }

    if (depth >= MAX_DEPTH) return
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (found.length >= MAX_SCAN) return
      if (!entry.isDirectory() || entry.isSymbolicLink() || shouldSkipName(entry.name)) continue
      const full = join(dir, entry.name)
      try {
        if (lstatSync(full).isSymbolicLink()) continue
      } catch {
        continue
      }
      walk(full, depth + 1)
    }
  }

  if (isProjectDir(resolved.path)) {
    found.push(analyzeDirectory(resolved.path, importedPaths))
    return found
  }
  walk(resolved.path, 0)
  return found
}

export function importedPathSet(paths: string[]) {
  return new Set(paths.map((path) => normalizeDiskPath(path)))
}

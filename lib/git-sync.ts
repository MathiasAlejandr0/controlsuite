import { existsSync } from 'node:fs'
import { basename, join } from 'node:path'
import { runTool } from './exec'
import { isBlockedPath, isUnderAllowedRoot, resolveScanRoots } from './disk'
import { slugify } from './store'
import type { Project } from './types'

const UNSAFE = /[&|<>^\r\n]/

function githubSlug(value: string) {
  const trimmed = value.trim()
  const fromProto = trimmed.match(/^github:\/\/([^/]+\/[^/]+)$/i)
  if (fromProto) return fromProto[1]
  const fromUrl = trimmed.match(/github\.com[/:]([^/\s]+\/[^/\s]+?)(?:\.git)?$/i)
  return fromUrl?.[1]
}

export function gitSyncPlan(project: Project, roots?: string[]) {
  const allowed = resolveScanRoots(roots)
  if (project.localPath.startsWith('github://')) {
    const repo = githubSlug(project.localPath)
    if (!repo || UNSAFE.test(repo)) return { ok: false as const, error: 'Repo de GitHub inválido.' }
    const root = allowed[0]
    if (!root) return { ok: false as const, error: 'No hay una raíz de escaneo para clonar.' }
    const dest = join(root, slugify(basename(repo)))
    if (isBlockedPath(dest) || !isUnderAllowedRoot(dest, allowed)) {
      return { ok: false as const, error: 'El destino del clone no está permitido.' }
    }
    return { ok: true as const, action: 'clone' as const, repo, dest }
  }
  const path = project.localPath.trim()
  if (!path || UNSAFE.test(path) || isBlockedPath(path) || !isUnderAllowedRoot(path, allowed)) {
    return { ok: false as const, error: 'Ese path local no se puede sincronizar.' }
  }
  if (!existsSync(path)) return { ok: false as const, error: 'La carpeta local no existe.' }
  return { ok: true as const, action: 'pull' as const, dest: path }
}

export async function syncProjectGit(project: Project, roots?: string[]) {
  const plan = gitSyncPlan(project, roots)
  if (!plan.ok) return plan
  if (plan.action === 'clone') {
    if (existsSync(plan.dest)) {
      const pull = await runTool('git', ['-C', plan.dest, 'pull', '--ff-only'], 90_000)
      if (!pull.ok) return { ok: false as const, error: pull.stderr || 'git pull falló.' }
      return { ok: true as const, action: 'pull' as const, path: plan.dest, detail: pull.stdout || 'Ya existía; pull ff-only.' }
    }
    const clone = await runTool(
      'git',
      ['clone', '--', `https://github.com/${plan.repo}.git`, plan.dest],
      180_000,
    )
    if (!clone.ok) return { ok: false as const, error: clone.stderr || 'git clone falló.' }
    return { ok: true as const, action: 'clone' as const, path: plan.dest, detail: clone.stdout || `Clonado en ${plan.dest}` }
  }
  const pull = await runTool('git', ['-C', plan.dest, 'pull', '--ff-only'], 90_000)
  if (!pull.ok) return { ok: false as const, error: pull.stderr || 'git pull falló.' }
  return { ok: true as const, action: 'pull' as const, path: plan.dest, detail: pull.stdout || 'git pull --ff-only' }
}

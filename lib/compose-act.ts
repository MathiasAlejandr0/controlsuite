import { dirname } from 'node:path'
import { composeFileFor } from './connectors/docker'
import { isBlockedPath, isUnderAllowedRoot, resolveScanRoots } from './disk'
import { runTool } from './exec'

const UNSAFE = /[&|<>^\r\n]/

export function composePlan(localPath: string, roots?: string[]) {
  const path = localPath.trim()
  if (!path || path.startsWith('github://') || UNSAFE.test(path) || isBlockedPath(path)) {
    return { ok: false as const, error: 'Ese path no admite compose.' }
  }
  const allowed = resolveScanRoots(roots)
  if (!isUnderAllowedRoot(path, allowed)) {
    return { ok: false as const, error: 'La carpeta está fuera de las raíces permitidas.' }
  }
  const file = composeFileFor(path)
  if (!file || UNSAFE.test(file) || isBlockedPath(dirname(file))) {
    return { ok: false as const, error: 'No hay docker-compose en esa carpeta.' }
  }
  return { ok: true as const, file }
}

export async function composeUp(localPath: string, roots?: string[]) {
  const plan = composePlan(localPath, roots)
  if (!plan.ok) return plan
  const result = await runTool('docker', ['compose', '-f', plan.file, 'up', '-d'], 180_000)
  if (!result.ok) return { ok: false as const, error: result.stderr || 'docker compose up falló.' }
  return { ok: true as const, file: plan.file, detail: result.stdout || 'compose up -d' }
}

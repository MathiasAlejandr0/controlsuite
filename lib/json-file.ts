import { closeSync, copyFileSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync, writeSync } from 'node:fs'
import { dirname } from 'node:path'

export function writeJsonFile(path: string, value: unknown) {
  const dir = dirname(path)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const tmp = `${path}.${process.pid}.tmp`
  const payload = JSON.stringify(value, null, 2)
  const fd = openSync(tmp, 'w')
  try {
    writeSync(fd, payload)
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
  try {
    renameSync(tmp, path)
  } catch {
    writeFileSync(path, payload, 'utf8')
    if (existsSync(tmp)) unlinkSync(tmp)
  }
}

export function readJsonFile<T>(path: string): { ok: true; value: T } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(readFileSync(path, 'utf8')) as T }
  } catch {
    return { ok: false }
  }
}

export function readJsonWithBackup<T>(
  path: string,
  backupPath: string,
): { ok: true; value: T; restored: boolean } | { ok: false } {
  const primary = readJsonFile<T>(path)
  if (primary.ok) return { ...primary, restored: false }
  if (existsSync(path)) {
    try {
      copyFileSync(path, `${path}.corrupt`)
    } catch {
      // se conserva el original
    }
  }
  const backup = readJsonFile<T>(backupPath)
  if (!backup.ok) return { ok: false }
  writeJsonFile(path, backup.value)
  return { ok: true, value: backup.value, restored: true }
}

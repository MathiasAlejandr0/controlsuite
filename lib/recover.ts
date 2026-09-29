import { copyFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { CredentialsCorruptError, loadCredentials } from './credentials'
import { suiteDataDir } from './paths'
import { loadWorkspace, WorkspaceCorruptError } from './store'

const dataDir = suiteDataDir()

export function authorizeRecover(input: {
  target: 'workspace' | 'credentials'
  targetCorrupt: boolean
  credentialsCorrupt: boolean
  sessionOk: boolean
  pinOk: boolean
}) {
  if (input.sessionOk || input.pinOk) return true
  if (!input.targetCorrupt) return false
  if (input.target === 'credentials') return true
  return input.credentialsCorrupt
}

export function isTargetCorrupt(kind: 'workspace' | 'credentials') {
  if (!existsSync(backupPath(kind).primary)) return false
  try {
    if (kind === 'workspace') loadWorkspace()
    else loadCredentials()
    return false
  } catch (error) {
    return error instanceof WorkspaceCorruptError || error instanceof CredentialsCorruptError
  }
}

export function backupPath(kind: 'workspace' | 'credentials') {
  return kind === 'workspace'
    ? { primary: join(dataDir, 'workspace.json'), backup: join(dataDir, 'workspace.json.bak') }
    : { primary: join(dataDir, 'credentials.json'), backup: join(dataDir, 'credentials.json.bak') }
}

export function canRestore(kind: 'workspace' | 'credentials') {
  return existsSync(backupPath(kind).backup)
}

export function restoreFromBackup(kind: 'workspace' | 'credentials') {
  const paths = backupPath(kind)
  if (!existsSync(paths.backup)) {
    return { ok: false as const, error: `No hay backup de ${kind}.` }
  }
  copyFileSync(paths.backup, paths.primary)
  return { ok: true as const, path: paths.primary }
}

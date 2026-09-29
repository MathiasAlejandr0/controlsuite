import { spawnSync } from 'node:child_process'
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { suiteDataDir } from './paths'

const dataDir = suiteDataDir()
const keyFile = join(dataDir, '.vault.key')

export type VaultEnvelope = {
  v: 2
  alg: 'aes-256-gcm'
  iv: string
  tag: string
  data: string
}

export function isVaultEnvelope(value: unknown): value is VaultEnvelope {
  if (!value || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  return row.v === 2 && row.alg === 'aes-256-gcm' && typeof row.data === 'string'
}

function restrictFile(path: string) {
  try {
    chmodSync(path, 0o600)
  } catch {
    // Windows puede ignorar el mode
  }
  if (process.platform !== 'win32') return
  try {
    spawnSync(
      'icacls',
      [path, '/inheritance:r', '/grant:r', `${process.env.USERNAME ?? 'Administrators'}:F`],
      { windowsHide: true, timeout: 4000, stdio: 'ignore' },
    )
  } catch {
    // ACL best-effort
  }
}

function dpapi(bytes: Buffer, unprotect: boolean): Buffer {
  const script = unprotect
    ? `
Add-Type -AssemblyName System.Security
$raw = [Convert]::FromBase64String([Console]::In.ReadToEnd().Trim())
$plain = [Security.Cryptography.ProtectedData]::Unprotect($raw, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
[Convert]::ToBase64String($plain)
`
    : `
Add-Type -AssemblyName System.Security
$raw = [Convert]::FromBase64String([Console]::In.ReadToEnd().Trim())
$prot = [Security.Cryptography.ProtectedData]::Protect($raw, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
[Convert]::ToBase64String($prot)
`
  const result = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', script],
    { input: bytes.toString('base64'), encoding: 'utf8', windowsHide: true, timeout: 12_000 },
  )
  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() || 'DPAPI falló.')
  }
  return Buffer.from(String(result.stdout).trim(), 'base64')
}

function readAesKey(): Buffer {
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true })
  if (!existsSync(keyFile)) {
    const raw = randomBytes(32)
    const stored = process.platform === 'win32' ? dpapi(raw, false) : raw
    writeFileSync(keyFile, stored)
    restrictFile(keyFile)
    return raw
  }
  const stored = readFileSync(keyFile)
  if (process.platform === 'win32') {
    try {
      const raw = dpapi(stored, true)
      if (raw.length !== 32) throw new Error('La clave del vault no es válida.')
      return raw
    } catch {
      if (stored.length === 32) {
        try {
          writeFileSync(keyFile, dpapi(stored, false))
          restrictFile(keyFile)
        } catch {
          // se sigue con la clave legacy en claro hasta el próximo arranque
        }
        return stored
      }
      throw new Error('No se pudo abrir la clave del vault.')
    }
  }
  if (stored.length !== 32) throw new Error('La clave del vault no es válida.')
  return stored
}

export function encryptJson(value: unknown): VaultEnvelope {
  const key = readAesKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const payload = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()])
  return {
    v: 2,
    alg: 'aes-256-gcm',
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: payload.toString('base64'),
  }
}

export function decryptJson<T>(envelope: VaultEnvelope): T {
  const key = readAesKey()
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64'))
  decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'))
  const plain = Buffer.concat([
    decipher.update(Buffer.from(envelope.data, 'base64')),
    decipher.final(),
  ])
  return JSON.parse(plain.toString('utf8')) as T
}

export function restrictDataFile(path: string) {
  restrictFile(path)
}

import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { readJsonWithBackup, writeJsonFile } from './json-file'
import { suiteDataDir } from './paths'
import { accessFlags, resolveLogin } from './login'
import { decryptJson, encryptJson, isVaultEnvelope, restrictDataFile } from './protect'
import type { CredentialStatus, Credentials, IntegrationId } from './types'

const dataDir = suiteDataDir()
const file = join(dataDir, 'credentials.json')
const backupFile = `${file}.bak`

const INTEGRATIONS: IntegrationId[] = ['github', 'vercel', 'cloudflare', 'sentry', 'supabase', 'insforge']

export class CredentialsCorruptError extends Error {
  constructor() {
    super('El vault está corrupto. Revisá data/credentials.json.corrupt o el .bak.')
    this.name = 'CredentialsCorruptError'
  }
}

function empty(): Credentials {
  return { integrations: {}, secrets: {}, logins: {} }
}

function coerceGithubApp(value: Credentials['githubApp']): Credentials['githubApp'] {
  if (!value || typeof value !== 'object') return undefined
  if (!value.id || !value.slug || !value.pem || !value.clientId) return undefined
  return {
    id: value.id,
    slug: value.slug,
    clientId: value.clientId,
    clientSecret: value.clientSecret,
    pem: value.pem,
    webhookSecret: value.webhookSecret,
    installationId: value.installationId,
    accountLogin: value.accountLogin,
  }
}

function coerceCredentials(value: unknown): Credentials | undefined {
  if (!value || typeof value !== 'object') return undefined
  const row = value as Partial<Credentials>
  if (row.secrets && typeof row.secrets !== 'object') return undefined
  return {
    integrations: row.integrations ?? {},
    githubApp: coerceGithubApp(row.githubApp),
    vercelTeamId: row.vercelTeamId,
    openaiKey: row.openaiKey,
    pinHash: row.pinHash,
    secrets: row.secrets ?? {},
    logins: row.logins ?? {},
  }
}

function persistCredentials(next: Credentials) {
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true })
  writeJsonFile(file, encryptJson(next))
  restrictDataFile(file)
  try {
    writeJsonFile(backupFile, encryptJson(next))
    restrictDataFile(backupFile)
  } catch {
    // el principal ya se escribió
  }
}

export function loadCredentials(): Credentials {
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true })
  if (!existsSync(file)) return empty()
  const parsed = readJsonWithBackup<unknown>(file, backupFile)
  if (!parsed.ok) throw new CredentialsCorruptError()
  try {
    const inner = isVaultEnvelope(parsed.value)
      ? decryptJson<unknown>(parsed.value)
      : parsed.value
    const creds = coerceCredentials(inner)
    if (!creds) throw new CredentialsCorruptError()
    if (!isVaultEnvelope(parsed.value) || parsed.restored) {
      try {
        persistCredentials(creds)
      } catch {
        // se sigue sirviendo en memoria hasta el próximo guardado
      }
    }
    return creds
  } catch (error) {
    if (error instanceof CredentialsCorruptError) throw error
    throw new CredentialsCorruptError()
  }
}

export function saveCredentials(next: Credentials) {
  persistCredentials(next)
}

export function credentialStatus(data = loadCredentials()): CredentialStatus {
  return {
    integrations: Object.fromEntries(
      INTEGRATIONS.map((id) => [
        id,
        id === 'github'
          ? Boolean(data.integrations.github || data.githubApp?.installationId)
          : Boolean(data.integrations[id]),
      ]),
    ) as Record<IntegrationId, boolean>,
    openai: Boolean(data.openaiKey),
    hasPin: Boolean(data.pinHash),
    secretCount: Object.keys(data.secrets).length,
    access: accessFlags(data.secrets, data.logins ?? {}),
  }
}

export function resolveStoredLogin(secretId: string) {
  const data = loadCredentials()
  return resolveLogin(secretId, data.secrets, data.logins ?? {})
}

export function integrationToken(id: IntegrationId) {
  return loadCredentials().integrations[id]
}

export function secretValue(id: string) {
  return loadCredentials().secrets[id]
}

export function upsertSecret(id: string, value: string) {
  const data = loadCredentials()
  if (value.trim()) data.secrets[id] = value.trim()
  else delete data.secrets[id]
  saveCredentials(data)
}

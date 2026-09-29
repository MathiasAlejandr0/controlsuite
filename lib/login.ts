import type { LoginRecord } from './types'

export function resolveLogin(
  secretId: string,
  secrets: Record<string, string>,
  logins: Record<string, LoginRecord> = {},
) {
  const seen = new Set<string>()
  let current = secretId
  while (logins[current]?.aliasOf && !seen.has(current)) {
    seen.add(current)
    current = logins[current].aliasOf as string
  }
  return {
    username: logins[current]?.username ?? logins[secretId]?.username ?? null,
    password: secrets[current] ?? secrets[secretId] ?? null,
    resolvedId: current,
    aliased: current !== secretId,
  }
}

export function accessFlags(secrets: Record<string, string>, logins: Record<string, LoginRecord> = {}) {
  const ids = new Set([...Object.keys(secrets), ...Object.keys(logins)])
  return Object.fromEntries(
    [...ids].map((id) => {
      const resolved = resolveLogin(id, secrets, logins)
      return [
        id,
        {
          stored: Boolean(resolved.password),
          username: Boolean(resolved.username),
          aliased: resolved.aliased,
        },
      ]
    }),
  )
}

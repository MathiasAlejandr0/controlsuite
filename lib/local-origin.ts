export function isLocalHostname(hostname: string) {
  return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '::1'
}

export function originMatchesHost(origin: string, hostHeader: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(origin)
  } catch {
    return false
  }
  if (!isLocalHostname(parsed.hostname)) return false
  const requestHost = hostHeader.split('/')[0].toLowerCase()
  const originHost = parsed.host.toLowerCase()
  if (originHost === requestHost) return true
  const impliedPort = parsed.protocol === 'https:' ? '443' : '80'
  return `${parsed.hostname}:${impliedPort}` === requestHost
}

export function allowLocalMutation(input: {
  method: string
  origin: string | null
  host: string
  fetchSite: string | null
}) {
  if (input.method === 'GET' || input.method === 'HEAD') return true
  if (input.fetchSite === 'cross-site') return false
  if (!input.origin) return false
  return originMatchesHost(input.origin, input.host)
}

import { loadCredentials } from './credentials'
import { fetchInstallationAccount, mintInstallationToken } from './github-app'

let cache: { token: string; exp: number; installationId: number } | undefined

export async function githubAccessToken() {
  const creds = loadCredentials()
  const app = creds.githubApp
  if (app?.installationId && app.pem) {
    if (cache && cache.installationId === app.installationId && cache.exp > Date.now() + 30_000) {
      return cache.token
    }
    const token = await mintInstallationToken(app)
    cache = { token, installationId: app.installationId, exp: Date.now() + 50 * 60 * 1000 }
    return token
  }
  return creds.integrations.github
}

export async function githubAccountLabel() {
  const creds = loadCredentials()
  if (creds.githubApp?.installationId && creds.githubApp.pem) {
    const account = await fetchInstallationAccount(creds.githubApp)
    if (account) return account
  }
  return undefined
}

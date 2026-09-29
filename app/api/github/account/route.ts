import { NextResponse } from 'next/server'
import { fetchGithubRepos, fetchGithubUser, fetchInstallationRepos, normalizeRepo } from '@/lib/connectors/github'
import { githubAccessToken, githubAccountLabel } from '@/lib/github-access'
import { denyIfLocked } from '@/lib/guard'
import { loadCredentials } from '@/lib/credentials'
import { loadWorkspace } from '@/lib/store'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const denied = denyIfLocked(request)
  if (denied) return denied
  const token = await githubAccessToken()
  if (!token) {
    return NextResponse.json({ error: 'Enlazá GitHub para que Suite Control lea tus repos.' }, { status: 400 })
  }
  try {
    const installed = Boolean(loadCredentials().githubApp?.installationId)
    const [user, repos] = await Promise.all([
      installed
        ? githubAccountLabel().then(
            (account) => account ?? { login: 'GitHub', htmlUrl: 'https://github.com' },
          )
        : fetchGithubUser(token),
      installed ? fetchInstallationRepos(token) : fetchGithubRepos(token),
    ])
    const imported = new Set(
      loadWorkspace().projects.flatMap((project) =>
        project.services
          .filter((service) => service.kind === 'github' && service.externalId)
          .map((service) => normalizeRepo(service.externalId)),
      ),
    )
    return NextResponse.json({
      user,
      repos: repos.map((repo) => ({
        ...repo,
        alreadyImported: imported.has(normalizeRepo(repo.fullName)),
      })),
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'No se pudo leer GitHub.' },
      { status: 400 },
    )
  }
}

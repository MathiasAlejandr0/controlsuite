import { NextResponse } from 'next/server'
import { fetchGithubRepos, fetchInstallationRepos, inferKindFromLanguage, normalizeRepo } from '@/lib/connectors/github'
import { githubAccessToken } from '@/lib/github-access'
import { denyIfLocked } from '@/lib/guard'
import { loadCredentials } from '@/lib/credentials'
import { workspaceResponse } from '@/lib/workspace-response'
import { createProjectFromDraft } from '@/lib/project-factory'
import { refreshWorkspace } from '@/lib/refresh'
import { githubImportSchema } from '@/lib/schemas'
import { loadWorkspace, upsertProjects } from '@/lib/store'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const denied = denyIfLocked(request)
  if (denied) return denied
  const parsed = githubImportSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Elegí al menos un repo.' }, { status: 400 })
  }
  const token = await githubAccessToken()
  if (!token) {
    return NextResponse.json({ error: 'Enlazá GitHub para importar repos.' }, { status: 400 })
  }

  try {
    const remote = loadCredentials().githubApp?.installationId
      ? await fetchInstallationRepos(token)
      : await fetchGithubRepos(token)
    const workspace = loadWorkspace()
    const existingRepos = new Set(
      workspace.projects.flatMap((project) =>
        project.services
          .filter((service) => service.kind === 'github' && service.externalId)
          .map((service) => normalizeRepo(service.externalId)),
      ),
    )
    const ids = workspace.projects.map((project) => project.id)
    const created = []
    const skipped: Array<{ repo: string; reason: string }> = []

    for (const requested of parsed.data.repos) {
      const repo = remote.find((item) => normalizeRepo(item.fullName) === normalizeRepo(requested))
      if (!repo) {
        skipped.push({ repo: requested, reason: 'No aparece en tu cuenta.' })
        continue
      }
      if (existingRepos.has(normalizeRepo(repo.fullName))) {
        skipped.push({ repo: repo.fullName, reason: 'Ya está en el catálogo.' })
        continue
      }
      const project = createProjectFromDraft(
        {
          name: repo.name,
          kind: inferKindFromLanguage(repo.language),
          summary: repo.description,
          localPath: `github://${repo.fullName}`,
          branch: repo.defaultBranch,
          productionUrl: repo.homepage,
          githubRepo: repo.fullName,
        },
        ids,
      )
      ids.push(project.id)
      existingRepos.add(normalizeRepo(repo.fullName))
      created.push(project)
    }

    if (created.length === 0) {
      return NextResponse.json(
        { error: skipped[0]?.reason ?? 'No se importó ningún repo.', skipped },
        { status: 400 },
      )
    }

    upsertProjects(created)
    const next = await refreshWorkspace(created.map((project) => project.id))
    return NextResponse.json({
      ...workspaceResponse(next),
      createdIds: created.map((project) => project.id),
      skipped,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'No se pudieron importar los repos.' },
      { status: 400 },
    )
  }
}

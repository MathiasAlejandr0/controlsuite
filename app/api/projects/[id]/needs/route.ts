import { existsSync } from 'node:fs'
import { NextResponse } from 'next/server'
import { credentialStatus } from '@/lib/credentials'
import { analyzeDirectory } from '@/lib/disk'
import { denyIfLocked } from '@/lib/guard'
import { harvestProvider, LINK_PROVIDERS } from '@/lib/local-link'
import { loadWorkspace } from '@/lib/store'
import type { StackNeed } from '@/lib/types'

export const runtime = 'nodejs'

function fromServices(project: { services: Array<{ kind: string; externalId?: string }> }): StackNeed[] {
  return project.services
    .filter((service) =>
      ['github', 'vercel', 'cloudflare', 'supabase', 'insforge', 'email', 'sentry', 'docker'].includes(service.kind),
    )
    .map((service) => ({
      provider: service.kind as StackNeed['provider'],
      label: service.kind,
      detail: service.externalId
        ? `Ya está en el catálogo como ${service.externalId}. Autorizá a Suite Control para leer CI y errores.`
        : service.kind === 'github'
          ? 'Autorizá a Suite Control en GitHub para leer el repo, Actions y checks.'
          : 'El proyecto lo necesita. Enlazá la cuenta de este PC.',
      evidence: service.externalId ? [service.externalId] : [],
      canLink: ['github', 'vercel', 'cloudflare', 'supabase', 'insforge'].includes(service.kind),
    }))
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = denyIfLocked(request)
  if (denied) return denied
  const { id } = await params
  const project = loadWorkspace().projects.find((item) => item.id === id)
  if (!project) return NextResponse.json({ error: 'No existe' }, { status: 404 })

  const local = project.localPath
  const canAnalyze = Boolean(local) && !local.startsWith('github://') && existsSync(local)
  const analysis = canAnalyze ? analyzeDirectory(local) : undefined
  const needs = analysis ? analysis.needs : fromServices(project)

  const harvestable = Object.fromEntries(
    LINK_PROVIDERS.map((provider) => [provider, harvestProvider(provider).ok]),
  )

  return NextResponse.json({
    projectId: project.id,
    localPath: local,
    analyzed: Boolean(analysis),
    draft: analysis?.draft,
    needs,
    credentials: credentialStatus(),
    harvestable,
  })
}

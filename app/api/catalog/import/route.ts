import { NextResponse } from 'next/server'
import { sanitizeImportedProject } from '@/lib/catalog-sanitize'
import { denyIfLocked } from '@/lib/guard'
import { withLock } from '@/lib/lock'
import { catalogImportSchema } from '@/lib/schemas'
import { loadWorkspace, saveWorkspace } from '@/lib/store'
import type { ActivityItem, Incident, Project, WorkspaceProfile } from '@/lib/types'
import { workspaceResponse } from '@/lib/workspace-response'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const denied = denyIfLocked(request)
  if (denied) return denied
  const parsed = catalogImportSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: 'El archivo no es un catálogo válido.' }, { status: 400 })
  }
  return withLock(() => {
    const current = loadWorkspace()
    current.profile = (parsed.data.profile as WorkspaceProfile | undefined) ?? current.profile
    current.projects = (parsed.data.projects as Project[]).map(sanitizeImportedProject)
    current.incidents = (parsed.data.incidents as Incident[] | undefined) ?? []
    current.activities = (parsed.data.activities as ActivityItem[] | undefined) ?? []
    saveWorkspace(current)
    return NextResponse.json(workspaceResponse(current))
  })
}

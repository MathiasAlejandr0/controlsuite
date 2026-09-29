import { NextResponse } from 'next/server'
import { composeUp } from '@/lib/compose-act'
import { denyIfLocked } from '@/lib/guard'
import { loadWorkspace } from '@/lib/store'

export const runtime = 'nodejs'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = denyIfLocked(request)
  if (denied) return denied
  const { id } = await params
  const data = loadWorkspace()
  const project = data.projects.find((item) => item.id === id)
  if (!project) return NextResponse.json({ error: 'No existe' }, { status: 404 })
  const result = await composeUp(project.localPath, data.profile.scanRoots)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ ok: true, detail: result.detail })
}

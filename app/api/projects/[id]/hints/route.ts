import { existsSync } from 'node:fs'
import { NextResponse } from 'next/server'
import { detectResourceHints } from '@/lib/detect-resources'
import { denyIfLocked } from '@/lib/guard'
import { loadWorkspace } from '@/lib/store'

export const runtime = 'nodejs'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = denyIfLocked(request)
  if (denied) return denied
  const { id } = await params
  const project = loadWorkspace().projects.find((item) => item.id === id)
  if (!project) return NextResponse.json({ error: 'Proyecto no encontrado.' }, { status: 404 })
  const local = project.localPath && !project.localPath.startsWith('github://') && existsSync(project.localPath)
  const hints = local
    ? detectResourceHints(project.localPath).map((hint) => ({
        kind: hint.kind,
        id: hint.id,
        evidence: hint.evidence,
      }))
    : []
  return NextResponse.json({ hints })
}

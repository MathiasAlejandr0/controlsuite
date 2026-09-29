import { NextResponse } from 'next/server'
import { appendAudit } from '@/lib/audit'
import { denyIfLocked } from '@/lib/guard'
import { loadCredentials } from '@/lib/credentials'
import { openInCursor } from '@/lib/cursor'
import { composeCompactPrompt, composeRemediationPrompt } from '@/lib/prompt-engineer'
import { polishPrompt } from '@/lib/prompt-llm'
import { cursorSchema } from '@/lib/schemas'
import { loadWorkspace } from '@/lib/store'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const denied = denyIfLocked(request)
  if (denied) return denied
  const parsed = cursorSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: 'projectId requerido' }, { status: 400 })
  }
  const data = loadWorkspace()
  const project = data.projects.find((item) => item.id === parsed.data.projectId)
  if (!project?.localPath) {
    return NextResponse.json({ error: 'Proyecto sin path local' }, { status: 404 })
  }

  const draft = composeRemediationPrompt({
    project,
    incidents: data.incidents,
    incidentId: parsed.data.incidentId,
  })
  const compact = composeCompactPrompt({
    project,
    incidents: data.incidents,
    incidentId: parsed.data.incidentId,
  })
  const polished = await polishPrompt(draft, loadCredentials().openaiKey)
  const prompt = polished.prompt

  const result = await openInCursor(project.localPath, {
    prompt,
    compactPrompt: compact,
    projectId: project.id,
  })
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 422 })
  }

  appendAudit({
    type: 'cursor.opened',
    label: `${project.name} · ${project.localPath}${parsed.data.incidentId ? ` · ${parsed.data.incidentId}` : ''}`,
  })

  return NextResponse.json({
    ok: true,
    path: project.localPath,
    prompt,
    source: polished.source,
    injected: result.injected,
    clipboard: result.clipboard,
    taskFile: result.taskFile,
  })
}

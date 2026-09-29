import { NextResponse } from 'next/server'
import { denyIfLocked } from '@/lib/guard'
import { loadOps, patchRemediation, queuedRemediations } from '@/lib/ops'
import { z } from 'zod'

export const runtime = 'nodejs'

const patchSchema = z.object({
  id: z.string().min(1),
  status: z.enum(['done', 'dismissed']),
})

export function GET(request: Request) {
  const denied = denyIfLocked(request)
  if (denied) return denied
  const ops = loadOps()
  return NextResponse.json({
    remediations: queuedRemediations(ops),
    lastTickAt: ops.lastTickAt,
    tone: ops.tone,
    down: ops.down,
    degraded: ops.degraded,
  })
}

export async function PATCH(request: Request) {
  const denied = denyIfLocked(request)
  if (denied) return denied
  const parsed = patchSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 })
  const row = patchRemediation(parsed.data.id, parsed.data.status)
  if (!row) return NextResponse.json({ error: 'No existe' }, { status: 404 })
  return NextResponse.json({ ok: true, remediations: queuedRemediations() })
}

import { NextResponse } from 'next/server'
import { denyIfLocked } from '@/lib/guard'
import { withLock } from '@/lib/lock'
import { profilePatchSchema } from '@/lib/schemas'
import { loadWorkspace, saveWorkspace } from '@/lib/store'
import { workspaceResponse } from '@/lib/workspace-response'

export const runtime = 'nodejs'

export async function PATCH(request: Request) {
  const denied = denyIfLocked(request)
  if (denied) return denied
  const parsed = profilePatchSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 })
  }
  return withLock(() => {
    const data = loadWorkspace()
    data.profile = {
      ...data.profile,
      ...parsed.data,
      scanRoots: parsed.data.scanRoots?.filter(Boolean) ?? data.profile.scanRoots,
    }
    saveWorkspace(data)
    return NextResponse.json(workspaceResponse(data))
  })
}

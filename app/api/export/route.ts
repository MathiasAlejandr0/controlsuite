import { NextResponse } from 'next/server'
import { denyIfLocked } from '@/lib/guard'
import { stripSecretUsernames } from '@/lib/public-workspace'
import { loadWorkspace } from '@/lib/store'

export const runtime = 'nodejs'

export function GET(request: Request) {
  const denied = denyIfLocked(request)
  if (denied) return denied
  const catalog = stripSecretUsernames(loadWorkspace())
  return new NextResponse(JSON.stringify(catalog, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': 'attachment; filename="suite-control-catalogo.json"',
    },
  })
}

import { NextResponse } from 'next/server'
import { CredentialsCorruptError } from '@/lib/credentials'
import { denyIfLocked } from '@/lib/guard'
import { loadWorkspace, WorkspaceCorruptError } from '@/lib/store'
import { ensureWatchdogKey } from '@/lib/watchdog-auth'
import { startWatchdogLoop } from '@/lib/watchdog-loop'
import { workspaceResponse } from '@/lib/workspace-response'

export const runtime = 'nodejs'

export function GET(request: Request) {
  ensureWatchdogKey()
  startWatchdogLoop()
  const denied = denyIfLocked(request)
  if (denied) return denied
  try {
    return NextResponse.json(workspaceResponse(loadWorkspace()))
  } catch (error) {
    if (error instanceof WorkspaceCorruptError) {
      return NextResponse.json({ error: error.message, code: 'corrupt-workspace' }, { status: 500 })
    }
    if (error instanceof CredentialsCorruptError) {
      return NextResponse.json({ error: error.message, code: 'corrupt-credentials' }, { status: 500 })
    }
    throw error
  }
}

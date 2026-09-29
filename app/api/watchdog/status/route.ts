import { NextResponse } from 'next/server'
import { denyIfLocked } from '@/lib/guard'
import { ensureWatchdogKey, watchdogAuthorized } from '@/lib/watchdog-auth'
import { readWatchdogStatus } from '@/lib/watchdog'

export const runtime = 'nodejs'

export function GET(request: Request) {
  ensureWatchdogKey()
  if (!watchdogAuthorized(request)) {
    const denied = denyIfLocked(request)
    if (denied) return denied
  }
  return NextResponse.json(readWatchdogStatus())
}

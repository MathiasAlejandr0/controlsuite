import { NextResponse } from 'next/server'
import { watchdogAuthorized } from '@/lib/watchdog-auth'
import { runWatchdogTick } from '@/lib/watchdog'
import { startWatchdogLoop } from '@/lib/watchdog-loop'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  if (!watchdogAuthorized(request)) {
    return NextResponse.json({ error: 'Watchdog no autorizado.' }, { status: 401 })
  }
  startWatchdogLoop()
  return NextResponse.json(await runWatchdogTick())
}

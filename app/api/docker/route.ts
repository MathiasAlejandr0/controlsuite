import { NextResponse } from 'next/server'
import { probeDocker } from '@/lib/connectors/docker'
import { denyIfLocked } from '@/lib/guard'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const denied = denyIfLocked(request)
  if (denied) return denied
  return NextResponse.json(await probeDocker())
}

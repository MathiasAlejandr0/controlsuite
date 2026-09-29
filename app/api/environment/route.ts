import { NextResponse } from 'next/server'
import { denyIfLocked } from '@/lib/guard'
import { probeEnvironment } from '@/lib/toolchain'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const denied = denyIfLocked(request)
  if (denied) return denied
  return NextResponse.json(await probeEnvironment())
}

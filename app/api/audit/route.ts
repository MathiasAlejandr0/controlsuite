import { NextResponse } from 'next/server'
import { readAudit } from '@/lib/audit'
import { denyIfLocked } from '@/lib/guard'

export const runtime = 'nodejs'

export function GET(request: Request) {
  const denied = denyIfLocked(request)
  if (denied) return denied
  return NextResponse.json({ events: readAudit(80) })
}

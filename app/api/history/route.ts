import { NextResponse } from 'next/server'
import { denyIfLocked } from '@/lib/guard'
import { loadHistory } from '@/lib/history'

export const runtime = 'nodejs'

export function GET(request: Request) {
  const denied = denyIfLocked(request)
  if (denied) return denied
  return NextResponse.json({ points: loadHistory() })
}

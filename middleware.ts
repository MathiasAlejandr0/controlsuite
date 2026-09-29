import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { allowLocalMutation, isLocalHostname } from '@/lib/local-origin'

export function middleware(request: NextRequest) {
  const host = request.headers.get('host') ?? ''
  const hostname = host.split(':')[0]
  if (!isLocalHostname(hostname)) {
    return new NextResponse('Forbidden', { status: 403 })
  }

  if (request.nextUrl.pathname.startsWith('/api/')) {
    if (request.nextUrl.pathname.startsWith('/api/watchdog/')) {
      return NextResponse.next()
    }
    const allowed = allowLocalMutation({
      method: request.method,
      origin: request.headers.get('origin'),
      host,
      fetchSite: request.headers.get('sec-fetch-site'),
    })
    if (!allowed) {
      return new NextResponse('Forbidden', { status: 403 })
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}

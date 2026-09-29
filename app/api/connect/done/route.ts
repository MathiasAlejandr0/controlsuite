import { NextResponse } from 'next/server'
import { safeReturnTo, suitePublicOrigin } from '@/lib/github-app'

export const runtime = 'nodejs'

export function GET(request: Request) {
  const origin = suitePublicOrigin(request)
  const to = new URL(request.url).searchParams.get('to') ?? ''
  const href = `${origin}${to.startsWith('/projects/') ? to : safeReturnTo()}`
  const page = `<!doctype html><html lang="es"><meta charset="utf-8"><title>Enlazado</title>
<body style="font-family:Geist,Segoe UI,sans-serif;background:#0b1015;color:#e8eef4;padding:48px">
<p>Acceso guardado en la bóveda de este PC.</p>
<script>
if (window.opener) {
  window.opener.postMessage({ suite: 'linked' }, '*');
  window.close();
} else {
  location.replace(${JSON.stringify(href)});
}
</script>
</body></html>`
  return new NextResponse(page, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}

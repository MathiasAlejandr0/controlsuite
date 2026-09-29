import { NextResponse } from 'next/server'
import { startLink, isLinkProvider } from '@/lib/local-link'
import { currentGate } from '@/lib/guard'
import { htmlNotice, suitePublicOrigin } from '@/lib/github-app'
import { credentialStatus } from '@/lib/credentials'

export const runtime = 'nodejs'

export function GET(request: Request) {
  const origin = suitePublicOrigin(request)
  const gate = currentGate(request)
  if (!gate.ok) {
    return new NextResponse(htmlNotice('Sesión bloqueada', 'Desbloqueá Suite Control y volvé a autorizar.', `${origin}/`), {
      status: 401,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }
  const url = new URL(request.url)
  const provider = url.searchParams.get('provider') ?? ''
  const projectId = url.searchParams.get('projectId') ?? ''
  if (provider === 'github') {
    const next = new URL('/api/connect/github/start', origin)
    if (projectId) next.searchParams.set('projectId', projectId)
    return NextResponse.redirect(next)
  }
  if (!isLinkProvider(provider) || provider === 'github') {
    return new NextResponse(htmlNotice('Proveedor inválido', 'Ese servicio no se autoriza desde acá.', `${origin}/`), {
      status: 400,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }
  const started = startLink(provider)
  const official = started.urls[0] ?? origin
  const page = `<!doctype html><html lang="es"><meta charset="utf-8"><title>Autorizar ${provider}</title>
<body style="font-family:Geist,Segoe UI,sans-serif;background:#0b1015;color:#e8eef4;padding:40px;max-width:28rem">
<h1 style="font-size:1.2rem">Autorizá ${provider}</h1>
<p>${started.detail}</p>
<p><a href="${official}" target="_blank" rel="noreferrer" style="color:#c8f542">Abrir permisos oficiales</a></p>
<p id="st">Esperando que GitHub/Vercel/Supabase/InsForge confirmen…</p>
<script>
const provider = ${JSON.stringify(provider)};
async function tick() {
  const res = await fetch('/api/connect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'import', provider }),
  });
  if (res.ok) {
    document.getElementById('st').textContent = 'Acceso guardado en la bóveda.';
    if (window.opener) window.opener.postMessage({ suite: 'linked', provider }, '*');
    setTimeout(() => window.close(), 600);
    return;
  }
  setTimeout(tick, 2500);
}
tick();
</script>
</body></html>`
  return new NextResponse(page, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}

export function POST() {
  return NextResponse.json(credentialStatus())
}

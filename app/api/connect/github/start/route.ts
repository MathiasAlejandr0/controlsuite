import { NextResponse } from 'next/server'
import { loadCredentials } from '@/lib/credentials'
import {
  beginGithubAppRegistration,
  beginGithubState,
  githubInstallUrl,
  htmlNotice,
  suitePublicOrigin,
} from '@/lib/github-app'
import { currentGate } from '@/lib/guard'

export const runtime = 'nodejs'

function html(status: number, title: string, body: string, href: string) {
  return new NextResponse(htmlNotice(title, body, href), {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}

function escapeAttr(value: string) {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

export function GET(request: Request) {
  const gate = currentGate(request)
  const origin = suitePublicOrigin(request)
  if (!gate.ok) {
    return html(401, 'Sesión bloqueada', 'Desbloqueá Suite Control y volvé a pulsar Enlazar GitHub.', `${origin}/`)
  }
  const projectId = new URL(request.url).searchParams.get('projectId') ?? undefined
  const existing = loadCredentials().githubApp
  if (existing?.slug && existing.pem) {
    beginGithubState(projectId)
    return NextResponse.redirect(githubInstallUrl(existing.slug))
  }
  const started = beginGithubAppRegistration(origin, projectId)
  const page = `<!doctype html><html lang="es"><meta charset="utf-8"><title>Enlazar GitHub</title>
<body style="font-family:Geist,Segoe UI,sans-serif;background:#0b1015;color:#e8eef4;padding:48px">
<p>GitHub va a pedir que autorices a Suite Control sobre tus repos.</p>
<form id="gh" method="post" action="${escapeAttr(started.action)}">
<input type="hidden" name="manifest" value="${escapeAttr(started.manifest)}">
<button type="submit" style="background:#c8f542;border:0;padding:10px 16px;border-radius:999px;font-weight:600">Continuar en GitHub</button>
</form>
<script>document.getElementById('gh').submit()</script>
</body></html>`
  return new NextResponse(page, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}

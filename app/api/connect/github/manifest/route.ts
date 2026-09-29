import { NextResponse } from 'next/server'
import { appendAudit } from '@/lib/audit'
import { loadCredentials, saveCredentials } from '@/lib/credentials'
import {
  convertGithubManifest,
  githubInstallUrl,
  htmlNotice,
  peekGithubState,
  safeReturnTo,
  suitePublicOrigin,
} from '@/lib/github-app'
import { withLock } from '@/lib/lock'

export const runtime = 'nodejs'

function html(status: number, title: string, body: string, href: string) {
  return new NextResponse(htmlNotice(title, body, href), {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const home = suitePublicOrigin(request)
  const state = peekGithubState(url.searchParams.get('state'))
  const code = url.searchParams.get('code')?.trim()
  const back = `${home}${safeReturnTo(state?.projectId)}`

  if (!state) {
    return html(400, 'Autorización incompleta', 'El pedido a GitHub expiró o no salió de este equipo. Volvé a pulsar Enlazar GitHub.', back)
  }
  if (!code || !/^[a-zA-Z0-9_-]{8,200}$/.test(code)) {
    return html(400, 'GitHub no envió el código', 'Cancelaste la creación o el enlace volvió vacío.', back)
  }

  try {
    const app = await convertGithubManifest(code)
    withLock(() => {
      const current = loadCredentials()
      current.githubApp = { ...current.githubApp, ...app }
      saveCredentials(current)
      appendAudit({ type: 'integration.linked', label: `github · app ${app.slug}` })
    })
    return NextResponse.redirect(githubInstallUrl(app.slug))
  } catch (error) {
    return html(
      400,
      'No se pudo crear la app',
      error instanceof Error ? error.message : 'GitHub rechazó el manifiesto.',
      back,
    )
  }
}

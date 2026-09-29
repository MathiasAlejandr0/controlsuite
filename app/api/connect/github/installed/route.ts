import { NextResponse } from 'next/server'
import { appendAudit } from '@/lib/audit'
import { loadCredentials, saveCredentials } from '@/lib/credentials'
import {
  fetchInstallationAccount,
  htmlNotice,
  parseInstallationId,
  safeReturnTo,
  suitePublicOrigin,
  takeGithubReturn,
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
  const pending = takeGithubReturn()
  const back = `${home}${safeReturnTo(pending?.projectId)}`
  const installationId = parseInstallationId(url.searchParams.get('installation_id'))
  const action = url.searchParams.get('setup_action')

  if (action === 'request') {
    return html(200, 'Pedido enviado', 'El dueño del org tiene que aprobar la instalación. Cuando lo haga, volvé a Enlazar.', back)
  }
  if (!installationId) {
    return html(400, 'Falta la instalación', 'GitHub no indicó en qué cuenta quedó Suite Control.', back)
  }

  const current = loadCredentials()
  if (!current.githubApp?.pem) {
    return html(400, 'No hay app de GitHub', 'Primero pulsá Enlazar GitHub para crear Suite Control en tu cuenta.', back)
  }

  try {
    current.githubApp = { ...current.githubApp, installationId }
    const account = await fetchInstallationAccount(current.githubApp)
    if (account) current.githubApp.accountLogin = account.login
    withLock(() => {
      const latest = loadCredentials()
      latest.githubApp = current.githubApp
      saveCredentials(latest)
      appendAudit({
        type: 'integration.linked',
        label: `github · instalación ${installationId}${account ? ` · ${account.login}` : ''}`,
      })
    })
    const done = new URL('/api/connect/done', home)
    done.searchParams.set('to', safeReturnTo(pending?.projectId))
    return NextResponse.redirect(done)
  } catch (error) {
    return html(
      400,
      'No se guardó la instalación',
      error instanceof Error ? error.message : 'GitHub no confirmó el acceso.',
      back,
    )
  }
}

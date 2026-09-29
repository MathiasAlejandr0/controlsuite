export function beginGithubAuthorization(payload: {
  flow?: string
  action?: string
  manifest?: string
  redirect?: string
  startUrl?: string
}) {
  if (payload.startUrl?.startsWith('/api/connect/github/start')) {
    window.location.assign(payload.startUrl)
    return true
  }
  if (payload.redirect?.startsWith('https://github.com/')) {
    window.location.assign(payload.redirect)
    return true
  }
  if (
    payload.flow === 'github-app' &&
    payload.action?.startsWith('https://github.com/settings/apps/new') &&
    payload.manifest
  ) {
    const form = document.createElement('form')
    form.method = 'POST'
    form.action = payload.action
    const input = document.createElement('input')
    input.type = 'hidden'
    input.name = 'manifest'
    input.value = payload.manifest
    form.appendChild(input)
    document.body.appendChild(form)
    form.submit()
    return true
  }
  return false
}

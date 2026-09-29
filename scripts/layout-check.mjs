import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright'

const port = Number(process.env.LAYOUT_PORT ?? 3198)
const base = `http://127.0.0.1:${port}`
const out = process.env.SHOT_DIR ?? '/opt/cursor/artifacts'
const dataDir = mkdtempSync(join(tmpdir(), 'suite-layout-'))
const projectDir = mkdtempSync(join(tmpdir(), 'suite-layout-proj-'))

mkdirSync(join(projectDir, '.git'))
writeFileSync(join(projectDir, '.git', 'config'), '[remote "origin"]\n\turl = https://github.com/acme/web.git\n')
writeFileSync(join(projectDir, 'package.json'), JSON.stringify({ name: 'acme' }))

const viewports = [
  { name: '1024', width: 1024, height: 640, dsf: 1, shot: true },
  { name: '1280', width: 1280, height: 800, dsf: 1, shot: true },
  { name: '1440', width: 1440, height: 900, dsf: 1, shot: false },
  { name: '1920', width: 1920, height: 1080, dsf: 1, shot: false },
  { name: '125', width: 1536, height: 864, dsf: 1.25, shot: false },
  { name: '150', width: 1280, height: 720, dsf: 1.5, shot: false },
]

function waitForServer() {
  return new Promise((resolve, reject) => {
    const started = Date.now()
    const timer = setInterval(async () => {
      try {
        const response = await fetch(base)
        if (response.ok || response.status < 500) {
          clearInterval(timer)
          resolve()
        }
      } catch {
        if (Date.now() - started > 40_000) {
          clearInterval(timer)
          reject(new Error('La suite no arrancó'))
        }
      }
    }, 400)
  })
}

const server = spawn('npx', ['next', 'start', '--hostname', '127.0.0.1', '--port', String(port)], {
  cwd: process.cwd(),
  env: { ...process.env, SUITE_DATA_DIR: dataDir, SUITE_MOCK_PROVIDERS: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: true,
})
server.stderr.on('data', (chunk) => process.stderr.write(chunk))

const failures = []

async function layout(page) {
  return page.evaluate(() => {
    const problems = []
    const root = document.documentElement
    if (root.scrollWidth > root.clientWidth + 1) problems.push('scroll horizontal')
    const topbar = document.querySelector('.topbar')?.getBoundingClientRect()
    for (const toast of document.querySelectorAll('.toast')) {
      const box = toast.getBoundingClientRect()
      if (topbar && box.top < topbar.bottom && box.right > topbar.left) problems.push('toast tapa el encabezado')
    }
    for (const card of document.querySelectorAll('[data-service-card]')) {
      const box = card.getBoundingClientRect()
      for (const el of card.querySelectorAll('button, select, h3, p')) {
        if (el.closest('[role="menu"]')) continue
        const rect = el.getBoundingClientRect()
        if (rect.width < 1 || rect.height < 1) continue
        const outside =
          rect.left < box.left - 1 ||
          rect.right > box.right + 1 ||
          rect.top < box.top - 1 ||
          rect.bottom > box.bottom + 1
        if (outside) {
          problems.push(`se sale de la tarjeta: ${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 40)}`)
        }
      }
    }
    return problems
  })
}

try {
  await waitForServer()
  const browser = await chromium.launch({ headless: true })
  mkdirSync(out, { recursive: true })

  async function prepare(page) {
    await page.goto(base, { waitUntil: 'networkidle' })
    if (await page.getByLabel('PIN').count()) {
      await page.getByLabel('PIN').fill('123456')
      const button = page.getByRole('button', { name: /Guardar PIN|Entrar/ })
      await button.click()
      await page.getByRole('link', { name: 'Proyectos' }).waitFor()
    }
  }

  const setup = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await setup.newPage()
  await prepare(page)
  const projectId = await page.evaluate(async (localPath) => {
    const response = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Acme Web', kind: 'web', localPath }),
    })
    const payload = await response.json()
    if (!response.ok) throw new Error(payload.error ?? 'No se pudo crear')
    const seeded = await fetch('/api/demo/states', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: payload.createdId }),
    })
    if (!seeded.ok) throw new Error('No se pudieron sembrar los estados')
    return payload.createdId
  }, projectDir)

  const pages = [
    ['inicio', '/'],
    ['proyectos', '/projects'],
    ['proyecto', `/projects/${projectId}`],
    ['alertas', '/incidents'],
    ['cuentas', '/integrations'],
    ['ajustes', '/settings'],
  ]

  for (const viewport of viewports) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: viewport.dsf,
    })
    const tab = await context.newPage()
    await prepare(tab)
    for (const [name, path] of pages) {
      await tab.goto(base + path, { waitUntil: 'networkidle' })
      if (name === 'proyecto') {
        await tab.locator('[data-service-card]').first().waitFor()
        const count = await tab.locator('[data-service-card]').count()
        if (count < 5) failures.push(`${viewport.name} ${name}: hay ${count} tarjetas`)
      }
      const problems = await layout(tab)
      for (const problem of problems) failures.push(`${viewport.name} ${name}: ${problem}`)
      if (viewport.shot) {
        const file = join(out, `${viewport.name}-${name}.png`)
        await tab.screenshot({ path: file, fullPage: true })
        console.log('shot', file)
      }
    }
    await context.close()
  }

  const flow = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const flowPage = await flow.newPage()
  await prepare(flowPage)
  await flowPage.goto(`${base}/projects/${projectId}`, { waitUntil: 'networkidle' })
  await flowPage.getByRole('button', { name: 'Conectar' }).first().click()
  await flowPage.getByRole('dialog').waitFor()
  await flowPage.screenshot({ path: join(out, '1280-conectar.png'), fullPage: true })
  await flowPage.getByLabel('Token').fill('suite-mock-ok')
  await flowPage.getByRole('button', { name: 'Validar y guardar' }).click()
  await flowPage.getByText(/quedó en este equipo|confirmado|enlazado/i).first().waitFor({ timeout: 15_000 })
  if (await flowPage.getByRole('dialog').count()) {
    await flowPage.getByRole('button', { name: 'Cerrar', exact: true }).click()
  }
  await flowPage.getByText('Conectado').first().waitFor()
  await flowPage.screenshot({ path: join(out, '1280-conectado.png'), fullPage: true })

  const narrow = await browser.newContext({ viewport: { width: 1024, height: 640 } })
  const narrowPage = await narrow.newPage()
  await prepare(narrowPage)
  await narrowPage.goto(`${base}/projects/${projectId}`, { waitUntil: 'networkidle' })
  await narrowPage.getByRole('button', { name: 'Conectar' }).first().click()
  await narrowPage.getByRole('dialog').waitFor()
  await narrowPage.screenshot({ path: join(out, '1024-conectar.png'), fullPage: true })
  const narrowProblems = await layout(narrowPage)
  for (const problem of narrowProblems) failures.push(`1024 conectar: ${problem}`)

  await flowPage.goto(`${base}/incidents`, { waitUntil: 'networkidle' })
  const resolver = flowPage.getByRole('button', { name: 'Resolver' })
  if (await resolver.count()) {
    await resolver.first().click()
    await flowPage.getByText('Nada que resolver').waitFor()
  }
  await flowPage.screenshot({ path: join(out, '1280-alerta-resuelta.png'), fullPage: true })

  await browser.close()
} catch (error) {
  failures.push(error instanceof Error ? error.stack ?? error.message : String(error))
} finally {
  try {
    process.kill(-server.pid, 'SIGTERM')
  } catch {
    server.kill('SIGTERM')
  }
}

if (failures.length) {
  console.error(failures.join('\n'))
  process.exit(1)
}
console.log('layout ok')

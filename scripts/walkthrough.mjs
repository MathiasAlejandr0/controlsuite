// Recorrido manual con Playwright (no forma parte de npm test).
// Requiere `playwright` instalado y la suite en SUITE_URL (por defecto 127.0.0.1:3100).
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright'

const base = process.env.SUITE_URL ?? 'http://127.0.0.1:3100'
const out = process.env.SHOT_DIR ?? '/opt/cursor/artifacts'
const pin = '123456'

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'suite-fixture-'))
  mkdirSync(join(dir, '.git'))
  mkdirSync(join(dir, 'supabase'))
  writeFileSync(join(dir, '.git', 'config'), '[remote "origin"]\n\turl = https://github.com/acme/web.git\n')
  writeFileSync(join(dir, 'vercel.json'), JSON.stringify({ name: 'web' }))
  writeFileSync(join(dir, 'supabase', 'config.toml'), 'project_id = "abcdefghijklmnop"\n')
  writeFileSync(join(dir, 'wrangler.toml'), 'zone_name = "acme.test"\n')
  writeFileSync(
    join(dir, '.env.example'),
    'NEXT_PUBLIC_SUPABASE_URL=https://abcdefghijklmnop.supabase.co\nSENTRY_ORG=acme\nSENTRY_PROJECT=web\n',
  )
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({
      dependencies: { next: '15.0.0', '@supabase/supabase-js': '2.0.0' },
    }),
  )
  return dir
}

async function shot(page, name) {
  mkdirSync(out, { recursive: true })
  const file = join(out, name)
  await page.screenshot({ path: file, fullPage: true })
  console.log('shot', file)
}

const errors = []
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
page.on('pageerror', (error) => errors.push(error.message))
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text())
})

const projectDir = fixture()
await page.goto(base, { waitUntil: 'networkidle' })
await page.getByLabel('PIN').waitFor()
await shot(page, '01-pin.png')
await page.getByLabel('PIN').fill(pin)
await page.getByRole('button', { name: 'Guardar PIN' }).click()
await page.getByRole('heading', { name: /Sin proyectos/ }).waitFor()
await shot(page, '02-inicio.png')

const createdId = await page.evaluate(async (localPath) => {
  const response = await fetch('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Acme Web', kind: 'web', localPath }),
  })
  const payload = await response.json()
  if (!response.ok) throw new Error(payload.error ?? 'No se pudo crear el proyecto')
  return payload.createdId
}, projectDir)
if (!createdId) throw new Error('La API no devolvió createdId')

await page.goto(`${base}/projects`, { waitUntil: 'networkidle' })
await page.getByRole('link', { name: 'Acme Web' }).waitFor()
await shot(page, '03-proyectos.png')

await page.goto(`${base}/projects/${createdId}`, { waitUntil: 'networkidle' })
await page.getByRole('heading', { name: 'Acme Web' }).waitFor()
await page.getByRole('button', { name: 'Conectar todo' }).waitFor()
await shot(page, '04-proyecto.png')

await page.getByRole('button', { name: 'Conectar todo' }).click()
await page.getByRole('dialog').waitFor()
await shot(page, '05-conectar.png')
await page.getByRole('button', { name: 'Cerrar' }).click()

await page.goto(`${base}/incidents`, { waitUntil: 'networkidle' })
await page.getByRole('heading', { name: /alerta/i }).waitFor()
await shot(page, '06-alertas.png')

await page.goto(`${base}/security`, { waitUntil: 'networkidle' })
if (!page.url().includes('/incidents')) throw new Error(`Seguridad no redirigió: ${page.url()}`)

await page.goto(`${base}/integrations`, { waitUntil: 'networkidle' })
await page.getByRole('heading', { name: 'Cuentas' }).waitFor()
await shot(page, '07-cuentas.png')
await page.getByRole('button', { name: 'Conectar' }).first().click()
await page.getByRole('dialog').waitFor()
await shot(page, '08-conectar-cuenta.png')
await page.getByRole('button', { name: 'Cerrar' }).click()

await page.goto(`${base}/settings`, { waitUntil: 'networkidle' })
await page.getByRole('heading', { name: 'Ajustes' }).waitFor()
await shot(page, '09-ajustes.png')

await browser.close()
const noisy = errors.filter((item) => !/favicon|Download the React DevTools/i.test(item))
if (noisy.length) {
  console.error(noisy.join('\n'))
  process.exit(1)
}
console.log('walkthrough ok', createdId)

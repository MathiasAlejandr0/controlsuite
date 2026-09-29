import { execFileSync, execSync } from 'node:child_process'
import { createWriteStream, existsSync, mkdirSync, cpSync, rmSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import https from 'node:https'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version
const NODE_VERSION = '22.18.0'
const packDir = join(root, '.pack')
const cacheDir = join(packDir, 'cache')
const stageDir = join(root, 'installer', 'stage')
const distDir = join(root, 'dist')
const nodeZip = join(cacheDir, `node-v${NODE_VERSION}-win-x64.zip`)
const nodeUrl = `https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-win-x64.zip`
const innoUrl = 'https://github.com/jrsoftware/issrc/releases/download/is-6_7_3/innosetup-6.7.3.exe'

function log(message) {
  console.log(`→ ${message}`)
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const request = (current) => {
      https
        .get(current, (response) => {
          const location = response.headers.location
          if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && location) {
            response.resume()
            request(new URL(location, current).href)
            return
          }
          if (response.statusCode !== 200) {
            response.resume()
            reject(new Error(`Descarga falló (${response.statusCode}): ${current}`))
            return
          }
          pipeline(response, createWriteStream(dest)).then(resolve).catch(reject)
        })
        .on('error', reject)
    }
    request(url)
  })
}

async function ensureFile(url, dest, label) {
  if (existsSync(dest) && readFileSync(dest).byteLength > 1_000_000) {
    log(`${label} ya está en caché`)
    return
  }
  mkdirSync(dirname(dest), { recursive: true })
  log(`Descargando ${label}…`)
  await download(url, dest)
}

function findCsc() {
  const candidates = [
    join(process.env['WINDIR'] ?? 'C:\\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe'),
    join(process.env['WINDIR'] ?? 'C:\\Windows', 'Microsoft.NET', 'Framework', 'v4.0.30319', 'csc.exe'),
  ]
  return candidates.find((path) => existsSync(path))
}

function findIscc() {
  const candidates = [
    join(packDir, 'inno', 'ISCC.exe'),
    join(process.env['LOCALAPPDATA'] ?? '', 'Programs', 'Inno Setup 6', 'ISCC.exe'),
    join(process.env['LOCALAPPDATA'] ?? '', 'Programs', 'Inno Setup 7', 'ISCC.exe'),
    'C:\\Program Files (x86)\\Inno Setup 6\\ISCC.exe',
    'C:\\Program Files (x86)\\Inno Setup 7\\ISCC.exe',
    'C:\\Program Files\\Inno Setup 6\\ISCC.exe',
    'C:\\Program Files\\Inno Setup 7\\ISCC.exe',
  ]
  return candidates.find((path) => path && existsSync(path))
}

function powershell(script) {
  execFileSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
    { stdio: 'inherit', windowsHide: true },
  )
}

function writeIcon(dest) {
  const script = `
Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap 256, 256
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.Clear([System.Drawing.Color]::FromArgb(11, 16, 21))
$bg = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(16, 32, 28))
$g.FillEllipse($bg, 12, 12, 232, 232)
$ring = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(61, 214, 140), 10)
$g.DrawEllipse($ring, 28, 28, 200, 200)
$accent = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(61, 214, 140))
$font = New-Object System.Drawing.Font 'Segoe UI', 72
$sf = New-Object System.Drawing.StringFormat
$sf.Alignment = [System.Drawing.StringAlignment]::Center
$sf.LineAlignment = [System.Drawing.StringAlignment]::Center
$g.DrawString('SC', $font, $accent, (New-Object System.Drawing.RectangleF 0, 8, 256, 256), $sf)
$icon = [System.Drawing.Icon]::FromHandle($bmp.GetHicon())
$fs = [System.IO.File]::Create('${dest.replace(/\\/g, '\\\\')}')
$icon.Save($fs)
$fs.Close()
$icon.Dispose(); $font.Dispose(); $ring.Dispose(); $accent.Dispose(); $bg.Dispose(); $g.Dispose(); $bmp.Dispose()
`
  powershell(script)
}

function tryWingetInno() {
  try {
    execFileSync(
      'winget',
      [
        'install',
        '-e',
        '--id',
        'JRSoftware.InnoSetup',
        '--accept-package-agreements',
        '--accept-source-agreements',
        '--disable-interactivity',
      ],
      { stdio: 'inherit', windowsHide: true },
    )
  } catch {
    return null
  }
  return findIscc() ?? null
}

async function ensureInno() {
  const existing = findIscc()
  if (existing) return existing
  const setup = join(cacheDir, 'innosetup.exe')
  try {
    await ensureFile(innoUrl, setup, 'Inno Setup')
    const dest = join(packDir, 'inno')
    mkdirSync(dest, { recursive: true })
    log('Instalando Inno Setup en .pack/inno…')
    execFileSync(setup, ['/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', `/DIR=${dest}`], {
      stdio: 'inherit',
      windowsHide: true,
    })
  } catch (error) {
    log(`Descarga directa falló (${error instanceof Error ? error.message : error}). Probando winget…`)
    const fromWinget = tryWingetInno()
    if (fromWinget) return fromWinget
  }
  const compiled = findIscc()
  if (!compiled) throw new Error('Inno Setup no quedó instalado. Instalá “Inno Setup 6” y reintentá.')
  return compiled
}

function stageApp() {
  if (existsSync(stageDir)) rmSync(stageDir, { recursive: true, force: true })
  mkdirSync(stageDir, { recursive: true })
  const standalone = join(root, '.next', 'standalone')
  if (!existsSync(join(standalone, 'server.js'))) {
    throw new Error('Falta .next/standalone/server.js. El build no generó el bundle.')
  }
  cpSync(standalone, join(stageDir, 'app'), { recursive: true })
  const staticSrc = join(root, '.next', 'static')
  const staticDest = join(stageDir, 'app', '.next', 'static')
  if (existsSync(staticSrc)) cpSync(staticSrc, staticDest, { recursive: true })
  const publicSrc = join(root, 'public')
  if (existsSync(publicSrc)) cpSync(publicSrc, join(stageDir, 'app', 'public'), { recursive: true })
}

function stageRuntime() {
  const extracted = join(cacheDir, `node-v${NODE_VERSION}-win-x64`)
  if (!existsSync(join(extracted, 'node.exe'))) {
    log('Extrayendo Node.js portátil…')
    if (existsSync(extracted)) rmSync(extracted, { recursive: true, force: true })
    powershell(`Expand-Archive -LiteralPath '${nodeZip}' -DestinationPath '${cacheDir}' -Force`)
  }
  const runtime = join(stageDir, 'runtime')
  mkdirSync(runtime, { recursive: true })
  cpSync(join(extracted, 'node.exe'), join(runtime, 'node.exe'))
  cpSync(join(extracted, 'LICENSE'), join(runtime, 'LICENSE'))
}

function signingRequested() {
  return Boolean(
    process.env.SUITE_SIGN_PFX?.trim() ||
      process.env.SUITE_SIGN_SUBJECT?.trim() ||
      process.env.SUITE_SIGN_SHA1?.trim(),
  )
}

function findSigntool() {
  const kits = join(process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)', 'Windows Kits', '10', 'bin')
  if (!existsSync(kits)) return undefined
  const versions = readdirSync(kits)
    .filter((name) => /^\d+\./.test(name))
    .sort()
    .reverse()
  for (const version of versions) {
    const candidate = join(kits, version, 'x64', 'signtool.exe')
    if (existsSync(candidate)) return candidate
  }
  return undefined
}

function signFile(file) {
  if (!signingRequested()) return false
  const signtool = findSigntool()
  if (!signtool) {
    throw new Error(
      'Hay variables de firma (SUITE_SIGN_*) pero no está signtool.exe. Instalá “Windows SDK — Signing Tools”.',
    )
  }
  const timestamp = process.env.SUITE_SIGN_TIMESTAMP?.trim() || 'http://timestamp.digicert.com'
  const args = ['sign', '/fd', 'sha256', '/tr', timestamp, '/td', 'sha256']
  const pfx = process.env.SUITE_SIGN_PFX?.trim()
  const sha1 = process.env.SUITE_SIGN_SHA1?.trim()
  const subject = process.env.SUITE_SIGN_SUBJECT?.trim()
  if (pfx) {
    if (!existsSync(pfx)) throw new Error(`No está el PFX: ${pfx}`)
    args.push('/f', pfx)
    const password = process.env.SUITE_SIGN_PASSWORD
    if (password) args.push('/p', password)
  } else if (sha1) {
    args.push('/sha1', sha1)
  } else if (subject) {
    args.push('/n', subject)
  }
  args.push(file)
  log(`Firmando ${file}`)
  execFileSync(signtool, args, { stdio: 'inherit', windowsHide: true })
  return true
}

function compileLauncher(icon) {
  const csc = findCsc()
  if (!csc) throw new Error('No está csc.exe (.NET Framework 4). Es parte de Windows.')
  const exe = join(stageDir, 'SuiteControl.exe')
  log('Compilando el lanzador…')
  execFileSync(
    csc,
    [
      '/nologo',
      '/target:winexe',
      `/out:${exe}`,
      `/win32icon:${icon}`,
      '/reference:System.dll',
      '/reference:System.Windows.Forms.dll',
      '/reference:System.Drawing.dll',
      join(root, 'installer', 'SuiteControl.cs'),
    ],
    { stdio: 'inherit', windowsHide: true },
  )
}

async function main() {
  mkdirSync(cacheDir, { recursive: true })
  mkdirSync(distDir, { recursive: true })

  log('Tests')
  execSync('npm test', { cwd: root, stdio: 'inherit' })

  log('Build Next standalone')
  execSync('npm run build', { cwd: root, stdio: 'inherit', env: { ...process.env, NODE_ENV: 'production' } })

  const icon = join(root, 'installer', 'app.ico')
  if (!existsSync(icon) || readFileSync(icon).byteLength < 500) {
    log('Generando icono')
    writeIcon(icon)
  }

  await ensureFile(nodeUrl, nodeZip, `Node ${NODE_VERSION} win-x64`)
  stageApp()
  stageRuntime()
  compileLauncher(icon)
  signFile(join(stageDir, 'SuiteControl.exe'))

  const iscc = await ensureInno()
  log('Compilando el Setup.exe')
  execFileSync(iscc, ['/Qp', `/DMyAppVersion=${version}`, join(root, 'installer', 'suite-control.iss')], {
    cwd: join(root, 'installer'),
    stdio: 'inherit',
    windowsHide: true,
  })

  const setup = join(distDir, `SuiteControl-Setup-${version}.exe`)
  if (!existsSync(setup)) throw new Error(`No apareció ${setup}`)
  const signed = signFile(setup)
  console.log(`\nListo: ${setup}`)
  console.log('Instala por usuario, sin admin. Datos en %LOCALAPPDATA%\\SuiteControl\\data')
  console.log('Sigue escuchando solo 127.0.0.1:3100')
  if (!signed) {
    console.log('Sin firma Authenticode (no hay SUITE_SIGN_PFX / SUBJECT / SHA1). SmartScreen puede avisar.')
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})

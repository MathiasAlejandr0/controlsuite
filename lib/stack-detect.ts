import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  normalizeCloudflareZone,
  normalizeGithubRepo,
  normalizeSupabaseRef,
  normalizeVercelProject,
} from './connection-ids'
import { parseSentrySlug } from './connectors/sentry'
import { cloudflareZoneFromText, githubFromGitConfig, publicZone, supabaseRefFromText } from './detect-resources'
import { linkTarget } from './link-target'
import type { DetectedNeed, ProjectDraft, ProjectKind, StackNeed } from './types'

export { linkTarget }

type PackageJson = {
  homepage?: string
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

const ENV_FILES = ['.env.example', '.env.local.example', '.env.development.example', '.env']

const KNOWN_RELATIVE = [
  'prisma/schema.prisma',
  'supabase/config.toml',
  'insforge.toml',
  'wrangler.toml',
  'wrangler.jsonc',
  'wrangler.json',
  '.vercel/project.json',
  'sentry.properties',
  'sentry.client.config.ts',
  'sentry.server.config.ts',
  'docker-compose.yml',
  'docker-compose.yaml',
  'compose.yml',
  'compose.yaml',
  'Dockerfile',
]

export type StackReport = {
  needs: StackNeed[]
  draft: Partial<ProjectDraft>
}

function readCapped(path: string, max = 60_000) {
  try {
    const raw = readFileSync(path, 'utf8')
    return raw.length > max ? raw.slice(0, max) : raw
  } catch {
    return ''
  }
}

function hasFile(dir: string, rel: string) {
  return existsSync(join(dir, rel))
}

function envValue(text: string, key: string) {
  const match = text.match(new RegExp(`^\\s*${key}\\s*=\\s*["']?([^\\s#"'\\r\\n]+)`, 'im'))
  return match?.[1]?.trim()
}

function readSupabaseRef(envText: string, dir: string) {
  const toml = hasFile(dir, 'supabase/config.toml') ? readCapped(join(dir, 'supabase/config.toml'), 20_000) : ''
  return supabaseRefFromText(envText, toml)
}

function databaseHint(text: string): 'supabase' | 'insforge' | 'neon' | 'postgres' | undefined {
  const url = envValue(text, 'DATABASE_URL') ?? envValue(text, 'POSTGRES_URL')
  if (!url) return undefined
  if (/supabase\.co/i.test(url)) return 'supabase'
  if (/insforge/i.test(url)) return 'insforge'
  if (/neon\.tech/i.test(url)) return 'neon'
  if (/postgres|postgresql/i.test(url)) return 'postgres'
  return undefined
}

function insforgeIdFromText(text: string) {
  return (
    envValue(text, 'INSFORGE_PROJECT_ID') ??
    envValue(text, 'NEXT_PUBLIC_INSFORGE_PROJECT_ID') ??
    text.match(/insforge\.dev\/dashboard\/project\/([a-zA-Z0-9_-]+)/i)?.[1]
  )
}

function usesProjectEmail(text: string, deps: Set<string>) {
  return Boolean(
    envValue(text, 'SMTP_HOST') ||
      envValue(text, 'SMTP_USER') ||
      envValue(text, 'EMAIL_USER') ||
      envValue(text, 'RESEND_API_KEY') ||
      envValue(text, 'MAIL_FROM') ||
      deps.has('nodemailer') ||
      deps.has('resend'),
  )
}

function parsePackage(dir: string): PackageJson | undefined {
  if (!hasFile(dir, 'package.json')) return undefined
  try {
    return JSON.parse(readCapped(join(dir, 'package.json'), 120_000)) as PackageJson
  } catch {
    return undefined
  }
}

function depSet(pkg?: PackageJson) {
  return new Set(Object.keys({ ...pkg?.dependencies, ...pkg?.devDependencies }))
}

function addNeed(list: StackNeed[], need: StackNeed) {
  if (list.some((item) => item.provider === need.provider && item.label === need.label)) return
  list.push(need)
}

export function detectStack(dir: string, kind?: ProjectKind): StackReport {
  const pkg = parsePackage(dir)
  const deps = depSet(pkg)
  const envText = ENV_FILES.filter((name) => hasFile(dir, name))
    .map((name) => readCapped(join(dir, name), 20_000))
    .join('\n')
  const prisma = hasFile(dir, 'prisma/schema.prisma') ? readCapped(join(dir, 'prisma/schema.prisma'), 40_000) : ''
  const wrangler = ['wrangler.toml', 'wrangler.jsonc', 'wrangler.json'].find((name) => hasFile(dir, name))
  const vercelFile = hasFile(dir, '.vercel/project.json')
    ? readCapped(join(dir, '.vercel/project.json'), 8_000)
    : ''
  const present = KNOWN_RELATIVE.filter((rel) => hasFile(dir, rel))

  const supabaseRef = readSupabaseRef(envText, dir)
  const gitConfig = hasFile(dir, '.git/config') ? readCapped(join(dir, '.git/config'), 8_000) : ''
  const githubRepo = githubFromGitConfig(gitConfig)
  const wranglerText = wrangler ? readCapped(join(dir, wrangler), 20_000) : ''
  const dbHint = databaseHint(envText)
  const vercelFromFile = (() => {
    try {
      const parsed = vercelFile ? (JSON.parse(vercelFile) as { projectName?: string; name?: string }) : undefined
      return parsed?.projectName || parsed?.name
    } catch {
      return undefined
    }
  })()
  const sentryOrg = envValue(envText, 'SENTRY_ORG')
  const sentryProject = envValue(envText, 'SENTRY_PROJECT')
  const sentrySlug = sentryOrg && sentryProject ? `${sentryOrg}/${sentryProject}` : sentryOrg
  const usesSupabase =
    Boolean(supabaseRef) ||
    hasFile(dir, 'supabase/config.toml') ||
    deps.has('@supabase/supabase-js') ||
    deps.has('@supabase/ssr')
  const usesPrisma = hasFile(dir, 'prisma/schema.prisma') || deps.has('@prisma/client') || deps.has('prisma')
  const usesPostgres = usesPrisma || dbHint === 'postgres' || dbHint === 'neon' || /provider\s*=\s*"postgresql"/i.test(prisma)
  const homepage = pkg?.homepage ?? ''
  const zone = cloudflareZoneFromText(wranglerText, homepage || undefined) || publicZone(homepage)
  const vercelFromEnv = Boolean(envValue(envText, 'VERCEL_PROJECT_ID') || envValue(envText, 'VERCEL_PROJECT_NAME'))
  const vercelFromUrl = /\.vercel\.app\b/i.test(homepage)
  const usesVercel = Boolean(vercelFromFile) || vercelFromEnv || vercelFromUrl || kind === 'web'
  const usesCloudflare =
    Boolean(wrangler) ||
    Boolean(zone) ||
    deps.has('wrangler') ||
    deps.has('@cloudflare/workers-types')
  const usesSentry =
    Boolean(sentrySlug) ||
    deps.has('@sentry/nextjs') ||
    deps.has('@sentry/node') ||
    present.some((rel) => rel.startsWith('sentry'))
  const usesDocker = present.some(
    (rel) => rel.startsWith('docker-compose') || rel === 'compose.yml' || rel === 'compose.yaml' || rel === 'Dockerfile',
  )
  const usesGithub = hasFile(dir, '.git') || hasFile(dir, '.github')
  const insforgeProject = insforgeIdFromText(envText)
  const usesInsforge =
    Boolean(insforgeProject) ||
    dbHint === 'insforge' ||
    hasFile(dir, 'insforge.toml') ||
    hasFile(dir, '.insforge') ||
    deps.has('@insforge/cli') ||
    deps.has('@insforge/sdk') ||
    /insforge/i.test(envText)
  const usesEmail = usesProjectEmail(envText, deps)

  const needs: StackNeed[] = []

  if (usesGithub) {
    addNeed(needs, {
      provider: 'github',
      label: 'GitHub',
      detail: 'Repo local con git. Autorizá a Suite Control para leer CI, checks y errores.',
      evidence: [hasFile(dir, '.git') ? '.git' : '.github'].filter(Boolean),
      canLink: true,
      dashboardUrl: 'https://github.com',
    })
  }

  if (usesVercel) {
    addNeed(needs, {
      provider: 'vercel',
      label: 'Vercel',
      detail: 'Next u otro front que se despliega. El login oficial abre el navegador.',
      evidence: [
        vercelFromFile ? `.vercel (${vercelFromFile})` : undefined,
        vercelFromEnv ? 'VERCEL_PROJECT_*' : undefined,
        vercelFromUrl ? homepage : undefined,
      ].filter((item): item is string => Boolean(item)),
      canLink: true,
      dashboardUrl: 'https://vercel.com/login',
    })
  }

  if (usesCloudflare) {
    addNeed(needs, {
      provider: 'cloudflare',
      label: 'Cloudflare',
      detail: wrangler
        ? `Worker/Pages (${wrangler}). wrangler login abre el dashboard. Si el chequeo de zona falla, pegá un token Zone.Read en Ajustes.`
        : 'Zona DNS/TLS del dominio. wrangler login cubre Workers; para TLS de zona a veces hace falta un token Zone.Read.',
      evidence: wrangler ? [wrangler] : ['dominio de producción'],
      canLink: true,
      dashboardUrl: 'https://dash.cloudflare.com/login',
    })
  }

  if (usesInsforge) {
    addNeed(needs, {
      provider: 'insforge',
      label: 'InsForge',
      detail: insforgeProject
        ? `Proyecto ${insforgeProject}. Autorizá InsForge para vigilar la base.`
        : 'El repo usa InsForge. La ventana de permisos abre el dashboard oficial.',
      evidence: [
        insforgeProject ? `project ${insforgeProject}` : undefined,
        hasFile(dir, 'insforge.toml') ? 'insforge.toml' : undefined,
        deps.has('@insforge/cli') ? '@insforge/cli' : undefined,
      ].filter((item): item is string => Boolean(item)),
      canLink: true,
      dashboardUrl: insforgeProject
        ? `https://insforge.dev/dashboard/project/${insforgeProject}`
        : 'https://insforge.dev/dashboard',
    })
  }

  if (usesSupabase) {
    addNeed(needs, {
      provider: 'supabase',
      label: 'Supabase',
      detail: supabaseRef
        ? `Proyecto ${supabaseRef} detectado en el código. Enlazá la cuenta para chequearlo.`
        : 'El repo usa Supabase. Enlazá la cuenta; no hace falta inventar un token.',
      evidence: [
        supabaseRef ? `ref ${supabaseRef}` : undefined,
        hasFile(dir, 'supabase/config.toml') ? 'supabase/config.toml' : undefined,
        deps.has('@supabase/supabase-js') ? '@supabase/supabase-js' : undefined,
      ].filter((item): item is string => Boolean(item)),
      canLink: true,
      dashboardUrl: supabaseRef
        ? `https://supabase.com/dashboard/project/${supabaseRef}`
        : 'https://supabase.com/dashboard',
    })
  } else if (usesPostgres && !usesInsforge) {
    addNeed(needs, {
      provider: 'database',
      label: 'Base de datos',
      detail:
        dbHint === 'neon'
          ? 'Prisma/Postgres apunta a Neon. Podés enlazar Supabase u otra cuenta si también la usás.'
          : 'Hay Prisma o DATABASE_URL. El botón abre el login de Supabase (lo más habitual acá).',
      evidence: [
        prisma ? 'prisma/schema.prisma' : undefined,
        dbHint ? `DATABASE_URL (${dbHint})` : undefined,
      ].filter((item): item is string => Boolean(item)),
      canLink: true,
      dashboardUrl: 'https://supabase.com/dashboard',
    })
  }

  if (usesSentry) {
    addNeed(needs, {
      provider: 'sentry',
      label: 'Sentry',
      detail: sentrySlug
        ? `Proyecto ${sentrySlug}. Sentry no tiene CLI de login: se abre el dashboard.`
        : 'Hay SDK de Sentry. Abrí el dashboard para completar org/proyecto.',
      evidence: [sentrySlug, deps.has('@sentry/nextjs') ? '@sentry/nextjs' : undefined].filter(
        (item): item is string => Boolean(item),
      ),
      canLink: false,
      dashboardUrl: 'https://sentry.io/auth/login/',
    })
  }

  if (usesEmail) {
    addNeed(needs, {
      provider: 'email',
      label: 'Correo del proyecto',
      detail: 'Usuario y clave del buzón viven en la bóveda de este PC. No se inventa un token.',
      evidence: ['SMTP / RESEND / EMAIL en el entorno'].filter(Boolean),
      canLink: false,
    })
  }

  if (usesDocker) {
    addNeed(needs, {
      provider: 'docker',
      label: 'Docker',
      detail: 'Compose o Dockerfile. El daemon local no pide token.',
      evidence: present.filter((rel) => /docker|compose|Dockerfile/i.test(rel)),
      canLink: false,
    })
  }

  return {
    needs,
    draft: {
      supabaseRef,
      insforgeProject,
      githubRepo,
      cloudflareZone: zone,
      vercelProject: normalizeVercelProject(vercelFromFile || envValue(envText, 'VERCEL_PROJECT_NAME')),
      sentryProject: parseSentrySlug(sentrySlug),
      hasDocker: usesDocker,
      needs: needs.map((need) => need.provider as DetectedNeed),
    },
  }
}

export function applyStackToDraft(draft: ProjectDraft, report: StackReport): ProjectDraft {
  return {
    ...draft,
    supabaseRef: draft.supabaseRef || report.draft.supabaseRef,
    insforgeProject: draft.insforgeProject || report.draft.insforgeProject,
    vercelProject: draft.vercelProject || report.draft.vercelProject,
    sentryProject: draft.sentryProject || report.draft.sentryProject,
    cloudflareZone: draft.cloudflareZone || normalizeCloudflareZone(draft.productionUrl),
    githubRepo: draft.githubRepo || normalizeGithubRepo(draft.githubRepo),
    hasDocker: draft.hasDocker || report.draft.hasDocker,
    needs: report.draft.needs,
  }
}


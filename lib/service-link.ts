import { validateCloudflareToken } from './connectors/cloudflare'
import { validateGithubToken } from './connectors/github'
import { validateSentryToken } from './connectors/sentry'
import { validateSupabaseToken } from './connectors/supabase'
import { validateVercelToken } from './connectors/vercel'

export const CONNECT_KINDS = ['github', 'vercel', 'cloudflare', 'supabase', 'sentry'] as const
export type ConnectKind = (typeof CONNECT_KINDS)[number]

export type ServiceResource = { id: string; label: string; hint?: string }

export type TokenGuide = {
  kind: ConnectKind
  label: string
  tokenUrl: string
  scopes: string[]
  oauth: boolean
}

export const TOKEN_GUIDES: Record<ConnectKind, TokenGuide> = {
  github: {
    kind: 'github',
    label: 'GitHub',
    tokenUrl: 'https://github.com/settings/tokens/new?scopes=repo,security_events&description=Suite%20Control',
    scopes: ['repo', 'security_events', 'read:org'],
    oauth: true,
  },
  vercel: {
    kind: 'vercel',
    label: 'Vercel',
    tokenUrl: 'https://vercel.com/account/tokens',
    scopes: ['Lectura de proyectos, deployments, dominios y logs del equipo'],
    oauth: false,
  },
  cloudflare: {
    kind: 'cloudflare',
    label: 'Cloudflare',
    tokenUrl: 'https://dash.cloudflare.com/profile/api-tokens',
    scopes: ['Zone:Read', 'SSL and Certificates:Read', 'Zone Settings:Read', 'Firewall Services:Read', 'Analytics:Read'],
    oauth: false,
  },
  supabase: {
    kind: 'supabase',
    label: 'Supabase',
    tokenUrl: 'https://supabase.com/dashboard/account/tokens',
    scopes: ['Personal access token de la Management API'],
    oauth: false,
  },
  sentry: {
    kind: 'sentry',
    label: 'Sentry',
    tokenUrl: 'https://sentry.io/settings/account/api/auth-tokens/',
    scopes: ['project:read', 'event:read', 'org:read'],
    oauth: false,
  },
}

const PATCH_FIELD = {
  github: 'githubRepo',
  vercel: 'vercelProject',
  cloudflare: 'cloudflareZone',
  supabase: 'supabaseRef',
  sentry: 'sentryProject',
} as const

export function patchFieldFor(kind: ConnectKind) {
  return PATCH_FIELD[kind]
}

export type TokenValidation =
  | { ok: true; account: string; resources: ServiceResource[]; teamId?: string }
  | { ok: false; error: string }

export async function validateServiceToken(kind: ConnectKind, token: string): Promise<TokenValidation> {
  try {
    if (kind === 'vercel') {
      const result = await validateVercelToken(token)
      if (!result.ok) return result
      return { ok: true, account: result.account, resources: result.resources, teamId: result.teamId }
    }
    const result =
      kind === 'github'
        ? await validateGithubToken(token)
        : kind === 'cloudflare'
          ? await validateCloudflareToken(token)
          : kind === 'supabase'
            ? await validateSupabaseToken(token)
            : await validateSentryToken(token)
    if (!result.ok) return result
    return { ok: true, account: result.account, resources: result.resources }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'No se pudo validar el token.' }
  }
}

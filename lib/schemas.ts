import { z } from 'zod'

export const projectDraftSchema = z.object({
  name: z.string().trim().min(1),
  kind: z.enum(['web', 'mobile', 'desktop', 'backend']),
  summary: z.string().optional(),
  localPath: z.string().trim().min(1),
  branch: z.string().optional(),
  productionUrl: z.string().optional(),
  githubRepo: z.string().optional(),
  vercelProject: z.string().optional(),
  cloudflareZone: z.string().optional(),
  supabaseRef: z.string().optional(),
  insforgeProject: z.string().optional(),
  sentryProject: z.string().optional(),
  hasDocker: z.boolean().optional(),
  tag: z.enum(['trabajo', 'casa']).optional(),
})

export const projectImportSchema = z.object({
  paths: z.array(z.string().trim().min(1).max(500)).min(1).max(80),
})

export const githubImportSchema = z.object({
  repos: z.array(z.string().trim().min(3).max(200)).min(1).max(40),
})

export const refreshSchema = z.object({
  projectId: z.string().min(1).optional(),
})

export const cursorSchema = z.object({
  projectId: z.string().min(1),
  incidentId: z.string().min(1).optional(),
})

export const revealSchema = z.object({
  projectId: z.string().min(1),
  serviceId: z.string().min(1),
  secretId: z.string().min(1),
})

export const accessSaveSchema = z.object({
  projectId: z.string().min(1),
  serviceId: z.string().min(1),
  username: z.string().max(200).optional(),
  password: z.string().max(400).optional(),
  loginUrl: z.string().max(300).optional(),
  mfa: z.string().max(200).optional(),
  note: z.string().max(400).optional(),
  aliasOfSecretId: z.string().max(200).optional(),
})

export const connectSchema = z.object({
  action: z.enum(['start', 'import']),
  provider: z.enum(['github', 'vercel', 'cloudflare', 'supabase', 'insforge']),
  projectId: z.string().max(80).optional(),
})

export const credentialsSchema = z.object({
  integrations: z
    .record(z.string(), z.string())
    .optional(),
  vercelTeamId: z.string().optional(),
  openaiKey: z.string().optional(),
  secrets: z.record(z.string(), z.string()).optional(),
})

export const incidentPatchSchema = z.object({
  status: z.enum(['open', 'fixing', 'resolved']),
})

export const diskPathSchema = z.object({
  path: z.string().trim().min(1).max(500),
})

export const projectBulkDeleteSchema = z.object({
  ids: z.array(z.string().trim().min(1)).min(1).max(80),
})

const healthStatusSchema = z.enum(['healthy', 'degraded', 'down', 'unknown'])

const secretRefSchema = z.object({
  id: z.string().min(1),
  label: z.string(),
  vaultUri: z.string(),
  field: z.string(),
  loginUrl: z.string().optional(),
  username: z.string().optional(),
  mfa: z.string().optional(),
  lastRevealedAt: z.string().optional(),
  rotatedAt: z.string().optional(),
  note: z.string().optional(),
})

const healthCheckSchema = z.object({
  id: z.string().min(1),
  label: z.string(),
  weight: z.number(),
  status: healthStatusSchema,
  detail: z.string(),
  source: z.string(),
})

const serviceSchema = z.object({
  id: z.string().min(1),
  kind: z.enum([
    'github',
    'vercel',
    'cloudflare',
    'supabase',
    'insforge',
    'email',
    'sentry',
    'hostinger',
    'expo',
    'firebase',
    'aws',
    'railway',
    'neon',
    'instagram',
    'meta',
    'x',
    'uptime',
    'docker',
  ]),
  name: z.string(),
  role: z.string(),
  status: healthStatusSchema,
  externalId: z.string().optional(),
  dashboardUrl: z.string().optional(),
  secretRefs: z.array(secretRefSchema),
  checks: z.array(healthCheckSchema),
  accessOnly: z.boolean().optional(),
})

export const projectPatchSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    kind: z.enum(['web', 'mobile', 'desktop', 'backend']).optional(),
    summary: z.string().optional(),
    localPath: z.string().trim().min(1).max(500).optional(),
    branch: z.string().optional(),
    productionUrl: z.string().optional(),
    githubRepo: z.string().max(200).optional(),
    vercelProject: z.string().max(200).optional(),
    cloudflareZone: z.string().max(200).optional(),
    supabaseRef: z.string().max(200).optional(),
    insforgeProject: z.string().max(200).optional(),
    sentryProject: z.string().max(200).optional(),
    tag: z.enum(['trabajo', 'casa']).optional(),
    autoCompose: z.boolean().optional(),
    autoPull: z.boolean().optional(),
  })
  .strict()

export type ProjectPatch = z.infer<typeof projectPatchSchema>

export const profilePatchSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    initials: z.string().trim().min(1).max(4).optional(),
    label: z.string().trim().min(1).max(80).optional(),
    scanRoots: z.array(z.string().trim().min(1).max(500)).max(12).optional(),
  })
  .strict()

export const pinSchema = z.object({
  pin: z.string().min(6).max(64),
  currentPin: z.string().max(64).optional(),
})

export const recoverSchema = z.object({
  target: z.enum(['workspace', 'credentials']),
  pin: z.string().min(6).max(64).optional(),
})

export const catalogImportSchema = z.object({
  profile: z
    .object({
      name: z.string(),
      initials: z.string(),
      label: z.string(),
    })
    .passthrough()
    .optional(),
  projects: z.array(z.object({ id: z.string(), name: z.string(), kind: z.string() }).passthrough()).max(200),
  incidents: z.array(z.unknown()).optional(),
  activities: z.array(z.unknown()).optional(),
})

export const workspaceDataSchema = z.object({
  profile: z
    .object({
      name: z.string(),
      initials: z.string(),
      label: z.string(),
    })
    .passthrough(),
  projects: z.array(
    z
      .object({
        id: z.string().min(1),
        name: z.string().min(1),
        kind: z.enum(['web', 'mobile', 'desktop', 'backend']),
        services: z.array(z.object({ id: z.string(), kind: z.string() }).passthrough()),
      })
      .passthrough(),
  ),
  incidents: z.array(z.unknown()).default([]),
  activities: z.array(z.unknown()).default([]),
  lastSyncedAt: z.string().optional(),
})

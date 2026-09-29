export type ProjectKind = 'web' | 'mobile' | 'desktop' | 'backend'
export type ProjectTag = 'trabajo' | 'casa'
export type HealthStatus = 'healthy' | 'degraded' | 'down' | 'unknown'
export type IncidentStatus = 'open' | 'fixing' | 'resolved'
export type IncidentSeverity = 'critical' | 'high' | 'medium'
export type ActivityTone = 'green' | 'blue' | 'amber' | 'purple'

export type ServiceKind =
  | 'github'
  | 'vercel'
  | 'cloudflare'
  | 'supabase'
  | 'insforge'
  | 'email'
  | 'sentry'
  | 'hostinger'
  | 'expo'
  | 'firebase'
  | 'aws'
  | 'railway'
  | 'neon'
  | 'instagram'
  | 'meta'
  | 'x'
  | 'uptime'
  | 'docker'

export type SecretRef = {
  id: string
  label: string
  vaultUri: string
  field: string
  loginUrl?: string
  username?: string
  mfa?: string
  lastRevealedAt?: string
  rotatedAt?: string
  note?: string
}

export type HealthCheck = {
  id: string
  label: string
  weight: number
  status: HealthStatus
  detail: string
  source: string
}

export type Service = {
  id: string
  kind: ServiceKind
  name: string
  role: string
  status: HealthStatus
  externalId?: string
  dashboardUrl?: string
  secretRefs: SecretRef[]
  checks: HealthCheck[]
  accessOnly?: boolean
}

export type Incident = {
  id: string
  projectId: string
  title: string
  detail: string
  environment: string
  status: IncidentStatus
  severity: IncidentSeverity
  detectedAt: string
  lastSeenAt?: string
  resolvedAt?: string
}

export type ActivityItem = {
  id: string
  projectId?: string
  title: string
  detail: string
  tone: ActivityTone
  at: string
}

export type AuditEvent = {
  id: string
  type:
    | 'secret.revealed'
    | 'access.saved'
    | 'cursor.opened'
    | 'project.opened'
    | 'incident.resolved'
    | 'project.deleted'
    | 'integration.linked'
  label: string
  at: string
}

export type LinkProvider = 'github' | 'vercel' | 'cloudflare' | 'supabase' | 'insforge'
export type DetectedNeed = LinkProvider | 'sentry' | 'docker' | 'database' | 'email'

export type VaultState = 'pending' | 'ready' | 'broken'

export type StackNeed = {
  provider: DetectedNeed
  label: string
  detail: string
  evidence: string[]
  canLink: boolean
  dashboardUrl?: string
}

export type Project = {
  id: string
  name: string
  kind: ProjectKind
  tag?: ProjectTag
  summary: string
  localPath: string
  branch: string
  productionUrl?: string
  uptime: string
  lastActivity: string
  lastSyncedAt?: string
  autoCompose?: boolean
  autoPull?: boolean
  services: Service[]
}

export type WorkspaceProfile = {
  name: string
  initials: string
  label: string
  scanRoots?: string[]
}

export type Remediation = {
  id: string
  projectId: string
  incidentId?: string
  title: string
  detail: string
  at: string
  status: 'queued' | 'done' | 'dismissed'
}

export type WorkspaceData = {
  profile: WorkspaceProfile
  projects: Project[]
  incidents: Incident[]
  activities: ActivityItem[]
  lastSyncedAt?: string
}

export type IntegrationId = 'github' | 'vercel' | 'cloudflare' | 'sentry' | 'supabase' | 'insforge'

export type LoginRecord = {
  username?: string
  aliasOf?: string
}

export type AccessFlag = {
  stored: boolean
  username: boolean
  aliased: boolean
}

export type GithubAppRecord = {
  id: number
  slug: string
  clientId: string
  clientSecret: string
  pem: string
  webhookSecret?: string
  installationId?: number
  accountLogin?: string
}

export type Credentials = {
  integrations: Partial<Record<IntegrationId, string>>
  githubApp?: GithubAppRecord
  vercelTeamId?: string
  openaiKey?: string
  pinHash?: string
  secrets: Record<string, string>
  logins?: Record<string, LoginRecord>
}

export type CredentialStatus = {
  integrations: Record<IntegrationId, boolean>
  openai: boolean
  hasPin: boolean
  secretCount: number
  access: Record<string, AccessFlag>
}

export type ProjectDraft = {
  name: string
  kind: ProjectKind
  summary?: string
  localPath: string
  branch?: string
  productionUrl?: string
  githubRepo?: string
  vercelProject?: string
  cloudflareZone?: string
  supabaseRef?: string
  insforgeProject?: string
  sentryProject?: string
  hasDocker?: boolean
  needs?: DetectedNeed[]
  tag?: ProjectTag
}

export type DiskFolder = {
  name: string
  path: string
  isProject: boolean
  markers: string[]
}

export type DiskAnalysis = {
  path: string
  markers: string[]
  draft: ProjectDraft
  alreadyImported: boolean
  confidence: 'high' | 'medium' | 'low'
  needs?: StackNeed[]
}

export type FilterId =
  | 'all'
  | 'live'
  | 'local'
  | 'risk'
  | 'trabajo'
  | 'casa'
  | 'web'
  | 'mobile'
  | 'desktop'
  | 'backend'

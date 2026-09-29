export type RemediationGuide = {
  title: string
  steps: string[]
}

const GUIDES: Record<string, RemediationGuide> = {
  'cloudflare.attack': {
    title: 'Pico de ataques en Cloudflare',
    steps: [
      'Abrí la zona en Cloudflare y subí Security level a I’m Under Attack.',
      'Revisá los eventos de WAF y firewall de la última hora. Bloqueá IP, país o ruta que concentre el tráfico.',
      'Agregá una regla de rate limit en login, API y formularios públicos.',
      'Si el evento muestra credenciales o un secreto, rotá esa clave en el proveedor y en la bóveda de la suite.',
    ],
  },
  'cloudflare.ssl': {
    title: 'TLS de la zona',
    steps: [
      'En SSL/TLS dejá el modo Full (strict). Evitá Off o Flexible.',
      'Confirmá que el certificado de borde no esté por vencer y que el origen también presente HTTPS.',
      'Si el dominio no verifica, revisá los nameservers y el registro DNS que apunta al origen.',
    ],
  },
  'cloudflare.zone': {
    title: 'Zona de Cloudflare',
    steps: [
      'Confirmá que la zona esté Active y que los nameservers del registrador sean los de Cloudflare.',
      'Revisá que el token tenga Zone:Read sobre esa zona.',
    ],
  },
  'vercel.deploy': {
    title: 'Deploy de Vercel fallido',
    steps: [
      'Abrí el deployment en rojo y leé el log de build que dejó la suite en el detalle.',
      'Reproducí el comando de build en local, corregí el error y volvé a desplegar.',
      'Si el fallo es de variables, revisá Environment Variables del proyecto en Vercel. No pegues el valor en el chat.',
    ],
  },
  'vercel.build': {
    title: 'Error de build',
    steps: [
      'El detalle cita la línea del log. Corregí esa dependencia, tipo o comando.',
      'Confirmá que el Root Directory y el Build Command coincidan con el repo.',
    ],
  },
  'vercel.runtime': {
    title: 'Errores de runtime en Vercel',
    steps: [
      'Abrí Runtime Logs del deployment de producción y filtrá por 5xx.',
      'Si el error es de base de datos o de una clave, revisá la variable y el estado del servicio aguas abajo.',
    ],
  },
  'vercel.domain': {
    title: 'Dominio o SSL en Vercel',
    steps: [
      'En Domains del proyecto verificá el registro DNS y que el certificado esté emitido.',
      'Si sigue unverified, esperá la propagación o volvé a asignar el dominio.',
    ],
  },
  'vercel.firewall': {
    title: 'Firewall de Vercel',
    steps: [
      'Revisá Firewall del proyecto y activá Attack Challenge Mode si el pico sigue.',
      'Agregá una regla de rate limit. En planes sin firewall esta señal no aparece: la suite lo deja como no disponible.',
    ],
  },
  'supabase.status': {
    title: 'Proyecto Supabase',
    steps: [
      'Abrí el proyecto en el dashboard y mirá si está pausado, reiniciando o unhealthy.',
      'Si está pausado por inactividad del plan Free, reanudalo. Si está unhealthy, revisá el status de la región.',
    ],
  },
  'supabase.health': {
    title: 'Servicio de Supabase caído',
    steps: [
      'En el detalle figura qué servicio falló (db, auth, rest, realtime o storage).',
      'Reiniciá el servicio desde el dashboard si el proyecto lo permite y revisá los logs de esa pieza.',
    ],
  },
  'supabase.usage': {
    title: 'Uso de base de datos',
    steps: [
      'Revisá el tamaño del disco y las conexiones abiertas en Database → Reports.',
      'Cerrá clientes que dejan conexiones colgadas y subí el pooler si estás al límite del plan.',
    ],
  },
  'supabase.security': {
    title: 'Advisor de seguridad (RLS)',
    steps: [
      'Abrí Advisors → Security. Cada lint ERROR nombra la tabla.',
      'Activá Row Level Security en esa tabla y agregá una policy mínima: SELECT/INSERT/UPDATE solo para auth.uid() = user_id, o el criterio real del proyecto.',
      'No desactives el advisor. Volvé a chequear desde la suite cuando la policy esté publicada.',
    ],
  },
  'supabase.perf': {
    title: 'Advisor de performance',
    steps: [
      'Abrí Advisors → Performance y aplicá el índice o el ajuste que nombra el lint.',
      'Evitá índices duplicados. En el plan Free algunos reportes vienen vacíos: la suite no inventa un hallazgo.',
    ],
  },
  'supabase.backup': {
    title: 'Backups de Supabase',
    steps: [
      'En Database → Backups confirmá que el último backup esté Completed o que PITR esté activo.',
      'En el plan Free los backups físicos pueden no existir. Exportá un dump si el dato es crítico.',
    ],
  },
  'supabase.auth': {
    title: 'Auth de Supabase',
    steps: [
      'En Authentication → Providers desactivá autoconfirm o usuarios anónimos si no son intencionales.',
      'Activá captcha y un rate limit de emails si el proyecto está en internet.',
    ],
  },
  'github.ci': {
    title: 'CI de GitHub en rojo',
    steps: [
      'Abrí el workflow run del detalle y leé el job que falló.',
      'Reproducí el paso en local, parcheá y dejá que Actions vuelva a verde.',
    ],
  },
  'github.dependabot': {
    title: 'Alertas de Dependabot',
    steps: [
      'Abrí Security → Dependabot del repo y mergeá el PR de la alerta alta o crítica.',
      'Si no hay parche, fijá una versión segura o quitá la dependencia.',
    ],
  },
  'github.secrets': {
    title: 'Secreto filtrado en GitHub',
    steps: [
      'Tratá el secreto como comprometido. Rotá la clave en el proveedor ahora.',
      'En Security → Secret scanning cerrá la alerta solo después de rotar y de sacar el valor del historial si sigue alcanzable.',
      'Actualizá la bóveda de la suite con el valor nuevo. No lo copies a un issue.',
    ],
  },
  'github.pulls': {
    title: 'Pull requests abiertos',
    steps: [
      'Revisá la cola de PRs. No es una caída: es trabajo acumulado.',
      'Cerrá o mergeá los que ya no aplican para no tapar un CI rojo.',
    ],
  },
  'sentry.issues': {
    title: 'Errores sin resolver en Sentry',
    steps: [
      'Abrí el issue más frecuente del proyecto y leé el stack.',
      'Resolvé o ignorá con criterio. Un pico de 15 o más issues sin resolver queda en rojo.',
    ],
  },
  'sentry.spike': {
    title: 'Pico de errores en Sentry',
    steps: [
      'Compará la última hora con la anterior en Sentry → Stats.',
      'Si coincide con un deploy, revertí o corregí ese release. Si no, mirá el issue nuevo que concentra el volumen.',
    ],
  },
  'http.uptime': {
    title: 'El sitio no responde',
    steps: [
      'Confirmá el status HTTP del detalle y si el dominio resuelve.',
      'Revisá el último deploy, el certificado y el firewall. Si hay un pico de ataques, activá Under Attack en Cloudflare.',
    ],
  },
  'tls.expiry': {
    title: 'Certificado TLS',
    steps: [
      'Renovó el certificado antes de los 14 días. Si ya venció, el sitio queda inaccesible para los clientes.',
      'En Cloudflare o en el emisor (Let’s Encrypt / Vercel) forzá la reemisión y verificá la cadena.',
    ],
  },
}

const GENERIC: RemediationGuide = {
  title: 'Qué hacer',
  steps: [
    'Leé el detalle del check: dice el servicio, el código y el síntoma medido.',
    'Abrí el dashboard del proveedor, corregí la causa y volvé a pulsar Chequear ahora.',
  ],
}

export function remediationFor(code?: string): RemediationGuide {
  if (!code) return GENERIC
  return GUIDES[code] ?? GENERIC
}

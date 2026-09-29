# Suite Control

Suite local de control para un solo desarrollador. Corre en tu PC, en `127.0.0.1:3100`, y no se publica a internet. Lista proyectos del disco y de GitHub, conecta los servicios de cada uno y convierte los chequeos en alertas con pasos concretos.

La interfaz está en español. Los tokens viven en una bóveda cifrada dentro de `data/` y esa carpeta no se commitea.

## Qué mide

| Servicio | API | Qué mira | Si el plan no lo trae |
| --- | --- | --- | --- |
| Vercel | REST `api.vercel.com` deployments, events, projects, domains, runtime logs, firewall events | Últimos deploys, error de build, logs de runtime, dominio verificado, eventos de firewall | Runtime logs y firewall quedan como “no disponible”. El deploy igual se mide. |
| Supabase | Management API `api.supabase.com/v1` | Estado del proyecto, health de servicios, advisors de seguridad y performance, backups, auth, uso de disco | Advisors, backups o uso pueden responder 404. No se inventa un hallazgo. |
| Cloudflare | REST de zonas y settings, GraphQL Analytics | Zona activa, modo SSL, security level, eventos de firewall de la última hora | Analytics de firewall pide `Analytics:Read`. Sin ese permiso el check queda desconocido. |
| GitHub | REST `api.github.com` | Actions, checks del commit, Dependabot, secret scanning, pull requests | Secret scanning y Dependabot piden `security_events` y, en secretos, GitHub Advanced Security en repos privados. |
| Sentry | REST `sentry.io/api/0` | Issues sin resolver y pico de eventos de la última hora | Stats puede no venir en el plan. Las issues igual se cuentan. |
| HTTP y TLS | GET público y el certificado de `:443` | Status, latencia y vencimiento. No sigue redirects hacia direcciones privadas. | No usa token. |

El watchdog corre un chequeo completo cada ~3 minutos y deja un aviso de Windows solo para alertas **críticas** y **altas** de producción. La pantalla relee el catálogo cada 20 segundos.

## Instalar y correr

Requisitos: Node.js 22 y, para el instalador de Windows, el script `npm run pack` (Inno Setup se baja solo).

```bat
npm ci
npm run dev
```

Producción local:

```bat
npm run build
npm start
```

O el acceso directo `abrir-suite.bat`, que usa el mismo puerto. El instalador se arma con `npm run pack` y no hace falta tocarlo para desarrollar.

La primera vez la suite pide un PIN. Sin PIN no abre el catálogo. El middleware rechaza cualquier host que no sea `localhost`, `127.0.0.1` o `::1`, y las rutas que modifican datos exigen que el `Origin` coincida con ese host.

## Conectar un servicio

Entrá a un proyecto. Cada servicio (GitHub, Vercel, Supabase, Cloudflare, Sentry) tiene una tarjeta con **Conectar**, **Probar** y **Desconectar**.

1. **Conectar** abre el diálogo. El enlace lleva a la página de tokens del proveedor y lista los permisos mínimos.
2. Pegás el token. **Validar** lo prueba contra la API. Si falla, no se guarda.
3. Elegís el recurso de ese proyecto: proyecto de Vercel, ref de Supabase, zona de Cloudflare, `org/proyecto` de Sentry o `owner/repo` de GitHub.
4. **Guardar enlace** cifra el token en la bóveda y corre el chequeo.
5. El estado de la tarjeta es **Conectado**, **Error** o **Sin conectar**, con la hora del último chequeo.

GitHub también puede usar la GitHub App (el mismo flujo de manifiesto que ya tenía la suite), en lugar de un PAT.

**Olvidar token** borra el token de la bóveda. **Desconectar** solo suelta el recurso de ese proyecto.

### Permisos mínimos

- **GitHub:** `repo`, `security_events`, `read:org`. [Crear token](https://github.com/settings/tokens/new?scopes=repo,security_events&description=Suite%20Control).
- **Vercel:** token de cuenta con lectura de proyectos, deployments y dominios. [Tokens](https://vercel.com/account/tokens). Si el token ve un equipo, la suite guarda el team id.
- **Supabase:** personal access token de la Management API. [Tokens](https://supabase.com/dashboard/account/tokens).
- **Cloudflare:** `Zone:Read`, `SSL and Certificates:Read`, `Zone Settings:Read`, `Firewall Services:Read`, `Analytics:Read`. [API tokens](https://dash.cloudflare.com/profile/api-tokens).
- **Sentry:** `project:read`, `event:read`, `org:read`. [Auth tokens](https://sentry.io/settings/account/api/auth-tokens/).

Los tokens no vuelven al navegador. Revelar un secreto de acceso es otra acción, auditada, y no lista estos tokens de integración.

## Alertas

Cada check que no está sano ni desconocido se vuelve una alerta:

- **Crítica:** sitio caído, certificado vencido, base Supabase caída, pico de firewall, secreto filtrado.
- **Alta:** deploy, CI, advisor de seguridad, issues graves de Sentry.
- **Media:** degradados (SSL flojo, latencia, backups viejos).
- **Baja:** cola larga de pull requests, avisos de performance.

La misma alerta no se duplica: la clave es proyecto + check. Se guardan la primera y la última vez. **Marcar visto** la deja abierta sin volver a notificar. **Resolver** la cierra. Si el check reaparece después de resuelto, se abre de nuevo. Si el check sana solo, se cierra solo.

Cada alerta trae **Qué hacer**, en español: por ejemplo activar Under Attack y un rate limit, la policy RLS que falta, o el log del deploy.

Aparecen en Inicio, en Incidentes y, si son de exposición, en Seguridad.

## Datos locales

`data/` guarda el catálogo, la bóveda, la auditoría y `watchdog.key`. Está en `.gitignore`. No copies esa carpeta a un repo público.

## Comandos

```bat
npm test
npm run typecheck
npm run lint
npm run build
npm run watchdog
```

`lint` corre el typecheck: el proyecto no usa ESLint.

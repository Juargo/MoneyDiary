# MoneyDiary — Contexto para Claude Code

## ¿Qué es este proyecto?

App de finanzas personales para consolidar y analizar movimientos bancarios chilenos (Banco de Chile, BancoEstado, BCI, Santander) importados desde archivos `.xlsx`. Es simultáneamente un ejercicio de aprendizaje en buenas prácticas de ingeniería (Clean Architecture, TDD, ADRs, Agile/Scrum).

**Repositorio:** `git@github.com:Juargo/MoneyDiary.git`
**Stack:** Express + TypeScript strict en `apps/api` (ADR-028, migrado desde NestJS) · React + Vite + Tailwind/shadcn en `apps/web` · Expo + NativeWind en `apps/mobile` · Astro en `apps/landing`. Las versiones exactas están en cada `package.json`.
**Producción (dominio propio `moneydiary.cl`, DNS gestionado por Vercel):** landing → `https://moneydiary.cl` (apex, Vercel) · web → `https://app.moneydiary.cl` (Vercel `money-diary-web`) · API → `https://api.moneydiary.cl` (CNAME → Render `moneydiary-api`; sigue accesible en `https://moneydiary-api.onrender.com`), protegida por `apiKeyMiddleware` (`x-api-key`). El API expone **CORS con allowlist por env** (`CORS_ALLOWED_ORIGINS`, incluye `app.moneydiary.cl`; ver `render.yaml`) para el `GET /version` público; el web lo lee cross-origin vía `VITE_API_BASE_URL=https://api.moneydiary.cl`. Deploy git→prod del web (Vercel) confirmado.

---

## Documentación del proyecto

Fuentes de verdad por tipo (migración Obsidian → GitHub, 2026-07-30):

- **Decisiones de arquitectura (ADRs)** → `docs/adr/` en el repo (un `ADR-NNN-slug.md` por decisión + `README.md` índice). Se revisan en el PR que las implementa. El resumen de una línea por decisión, con su estado real de implementación, vive en `docs/adr/estado-implementacion.md`; el texto completo, en cada `ADR-NNN-slug.md`.
- **User Stories / backlog** → [GitHub Issues](https://github.com/Juargo/MoneyDiary/issues) (labels `epic:*` + `moscow:*`). El estado se deriva de open/closed + el PR vinculado, no de prosa.
- **Épicas** → labels `epic:*` · **Sprints** → [Milestones](https://github.com/Juargo/MoneyDiary/milestones) `Sprint-1…9`.
- **Proceso SDD (OpenSpec)** → `openspec/` (specs vigentes + changes archivados).
- **Proceso (DoD, DoR, ceremonias, ciclo de vida) y diseño narrativo** → vault Obsidian, `00 Metodología/` y `02 Diseño/`. El vault **ya NO es fuente de verdad** de ADRs/US/Sprints — quedan copias históricas con banner de deprecación. Ruta: `~/Library/Mobile Documents/iCloud~md~obsidian/Documents/JJ - Developer/0002 EL YO CREADOR/DEV PERSONAL/MoneyDiary/`.

Los IDs de US son **globales y secuenciales** (no se reinician por épica). La **DoD/DoR canónicas viven en `00 Metodología/`**: cada US se cierra solo si cumple la DoD.

---

## Arquitectura

**Estructura raíz:** monorepo `pnpm workspaces` (ADR-008) — `apps/api` · `apps/web` · `apps/mobile` · `apps/landing`, más `openspec/` (proceso SDD) y `docs/adr/`. El layout exacto de cada workspace se lee del repo.

**Backend — patrón:** Monolito Modular + Clean Architecture (ADR-005)
**Regla de dependencias backend:** `domain ← application ← infrastructure`. Nunca al revés.
**Manejo de errores backend:** `Result<T,E>` (en `apps/api/src/shared/result.ts`) — nunca lanzar excepciones en domain/application.
**Al implementar una nueva US del backend:** empezar siempre por el dominio (value objects, errores), luego application (ports, use cases), luego infrastructure. No al revés.

**Capa HTTP (post-ADR-028, Express):** los endpoints viven en `infrastructure/http-express/` — `app.ts` (`createApp(container)`, sin `listen`), `middleware/` (`apiKeyMiddleware` → `sessionMiddleware` → `errorMiddleware`), y `routes/*.routes.ts` (funciones `registrar*(router, useCase)` con closure-DI). No hay decoradores ni módulos: el grafo se arma a mano en `composition/container.ts`. "Ruta pública" = no montar el middleware. El entrypoint es `http-express/server.ts` (`node dist/infrastructure/http-express/server`). Los DTOs y helpers de auth framework-agnósticos sobrevivieron en `infrastructure/http/` (dto/, multer-file-reader.adapter, auth/ sin los guards/decorators). ⚠️ **Las referencias de secciones históricas de sprints a `http/*.controller.ts`, `*.module.ts`, `PrismaService`/`prisma.module.ts`, `ApiKeyGuard`/`SessionGuard`, `@CurrentUser()`/`@Public()` son PRE-migración** — hoy son, respectivamente, `http-express/routes/`, `container.ts`/`crear-*`, `createPrismaClient()`, los middleware, y `req.userId`/no-montar-middleware.

**Frontend — sin compartir dominio:** el frontend NO importa de `apps/api/src/domain` (rompería ADR-005). El contrato real son los DTOs HTTP; los tipos se escriben a mano en `apps/web/src/api/types.ts`. No existe `packages/shared` — decisión deliberada (ADR-008).

---

## Decisiones Técnicas Clave (ADRs)

Las decisiones viven en `docs/adr/` (un archivo por decisión). Dos índices:

- **[`docs/adr/README.md`](docs/adr/README.md)** — índice canónico: número, título y estado de los 45 ADRs.
- **[`docs/adr/estado-implementacion.md`](docs/adr/estado-implementacion.md)** — resumen de una línea por decisión **con el estado real de implementación** (qué se construyó, qué quedó como deuda, qué se verificó en prod). Leelo cuando necesites el mapa completo.

Los ADRs que cargan reglas vivas de comportamiento — las que te van a morder si las ignorás mientras escribís código — están resumidos en las secciones de abajo (Arquitectura, Convenciones, Plan de pruebas, Notas de seguridad) y en `apps/api/CLAUDE.md`. Los más filosos:

- **ADR-005** — regla de dependencias `domain ← application ← infrastructure`, nunca al revés.
- **ADR-013** — cifrado en reposo: `descripcion`, `numeroCuenta` y `email` van cifrados; la clave vive fuera de la BD.
- **ADR-028** — la capa HTTP es Express (`http-express/`); toda referencia histórica a controllers/modules/guards de NestJS es **pre-migración**. Ver el detalle en `## Arquitectura`.
- **ADR-036 / ADR-042** — el catálogo de categorías es **por usuario**, y su unicidad es `(userId, bucketId, nombre)`: la reclasificación identifica por `categoriaId`, nunca por nombre.
- **ADR-045** — `Categoria.icono` se valida contra la allowlist de `domain/value-objects/icono-categoria.ts`; las filas viejas quedan en `null` con fallback en cliente.

---

## Estado y backlog

El estado de sprints y User Stories **no vive en este archivo** — se derivaba de prosa y driftaba (ese fue el motivo de la migración a GitHub). Fuente de verdad:

- **Qué está hecho / pendiente:** [Issues](https://github.com/Juargo/MoneyDiary/issues) y [Milestones](https://github.com/Juargo/MoneyDiary/milestones) (`Sprint-1…9`).
- **Detalle de decisiones:** `docs/adr/` · **changes SDD:** `openspec/changes/`.
- **Runbooks operativos:** `apps/api/docs/` y `docs/` (`mobile-launch-runbook.md`, `local-test-db.md`, etc.).

## Notas técnicas por dominio (gotchas)

Conocimiento no obvio del código ya entregado — durable, no derivable de un vistazo. El *estado* de cada US vive en los Issues; esto es solo el saber técnico.

- **Backend (`apps/api/`):** gotchas de parseo Excel, Prisma, dinero, semáforo, categorización, aislamiento multi-tenant, db-safety y cifrado, más los patrones de detección bancaria y los fixtures de prueba, viven en `apps/api/CLAUDE.md` (se carga al trabajar bajo ese directorio).
- **Landing (`apps/landing/`):** gotchas de Tailwind 4 CSS-first (el token `--radius` y la trampa de `--radius-DEFAULT`, `scroll-mt-*` para el header sticky) y la excepción tipográfica scoped, viven en `apps/landing/CLAUDE.md` (se carga al trabajar bajo ese directorio).

---

## Comandos frecuentes

La raíz tiene shortcuts: `pnpm api ...` → `pnpm --filter @moneydiary/api ...`, idem `pnpm web ...`. El listado completo de scripts está en el `package.json` de cada workspace; aquí solo los gated o no obvios:

```bash
pnpm api test:e2e                            # vitest e2e — muta BD real, gate ALLOW_DESTRUCTIVE_DB=1
pnpm api test:integration                    # vitest integración — mismo gate
pnpm api cli -- ./test/fixtures/movimientos-test.xlsx
pnpm api start:prod                          # node dist/infrastructure/http-express/server
pnpm --filter @moneydiary/mobile test        # mobile no tiene shortcut raíz; jest-expo 57 (jest@29) + RNTL
# mobile dev: `npx expo start` dentro de apps/mobile (requiere .env con EXPO_PUBLIC_API_BASE_URL / EXPO_PUBLIC_API_KEY — ver .env.example)
pnpm web dev                                 # Vite en :5173 con proxy /api → :3000
```

---

## Convenciones de código

- **Nombres en español** para domain y application (value objects, errores, use cases)
- **Nombres en inglés** para infraestructura (routes/handlers, middleware, adapters)
- **Archivos:** `kebab-case.ts`, clases `PascalCase`
- **Commits:** Conventional Commits (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`)
- **No lanzar excepciones** en domain/application — usar `Result.fail(error)`
- **Ports** son interfaces en `application/ports/`, implementaciones en `infrastructure/`
- **Principios de diseño:** skills de proyecto en `.claude/skills/` — `solid`, `dry`, `kiss`, `yagni` (adaptadas de JordanCoin/codingskills, MIT, con ejemplos de este repo). Aplicarlas al escribir código nuevo y en peer review; sus checklists complementan el checklist de seguridad de ADR-015

> **Fuentes de verdad:** este `CLAUDE.md` es canónico para lo **técnico del repo** (arquitectura, convenciones de código, comandos, seguridad, gotchas). Las **decisiones de arquitectura** viven en `docs/adr/`; el **backlog y su estado** en GitHub Issues/Milestones; el **proceso** (Definition of Done, Definition of Ready, ceremonias, ciclo de vida) en el vault Obsidian bajo `00 Metodología/`. La nota `Convenciones de código y commits.md` del vault es solo un espejo legible: si diverge, manda este archivo.
>
> **Proceso (Scrum):** antes de dar una US por terminada, verificar la DoD del vault (capa correcta, tests + `tsc`, sin secretos/cifrado por env, verificación con fixtures reales, Conventional Commits).

---

## Plan de pruebas — verificación y validación (ADR-014, ADR-015)

El plan de pruebas separa **verificación** (*¿lo construimos correctamente?*, ADR-015) de **validación** (*¿construimos el producto correcto?*, ADR-014). Ambas se apoyan en la testabilidad de la Clean Architecture (ADR-005). Al escribir código o tests para una US, aplicar estas reglas de énfasis (el riesgo se concentra en el dinero y en el control de acceso, no en cobertura homogénea):

- **Dinero con tipos exactos, nunca `float`.** Los tests unitarios del dominio cubren explícitamente redondeo, decimales y signo ingreso/gasto del cálculo 50/30/20 (RF-VIS-001/008).
- **Aislamiento por `user_id` (RNF-SEC-006).** Todo endpoint que devuelve datos de usuario lleva un test de integración que verifica que un usuario no accede a transacciones de otro.
- **`CryptoService` (ADR-013)** se verifica aislado: cifra/descifra correctamente y la clave vive fuera de la BD.
- **Peer review con checklist de seguridad fijo** antes de integrar (inyección, gestión de secretos, validación de entrada, no commitear claves — RNF-SEC-005).
- **BDD / criterios de aceptación ejecutables** dan la trazabilidad requisito → prueba; la cobertura es guía para detectar huecos en lógica crítica, no una meta.
- **Validación (ADR-014):** demos al cierre de sprint, pruebas de usabilidad (5 usuarios, think-aloud, SUS) y prueba piloto con datos reales en entorno tipo producción (ADR-004). Métricas de negocio y test A/B quedan como trabajo futuro.

---

## Notas de seguridad

- `pnpm-workspace.yaml` tiene `overrides: uuid: >=11.1.1` (CVE en exceljs → uuid) y `packages: ['apps/*']`
- `.npmrc` tiene `minimum-release-age=10080`, `audit-level=high`, `block-exotic-subdeps=true`
- SheetJS descartado (CVEs sin parche en npm) — ver ADR-007
- `pnpm approve-builds` requerido para `@prisma/engines`, `@swc/core`, `prisma` y `unrs-resolver` en instalación limpia (declarado en `pnpm-workspace.yaml > allowBuilds`)
- **Secretos de producción fuera del repo:** `API_KEY`/`DATABASE_URL`/`DIRECT_URL` viven en el dashboard de Render (`sync:false` en `render.yaml`); la key del cliente mobile va en env de build (EAS Secrets), **nunca** hardcodeada en el bundle
- `apps/api/@types/node` fijado en `^22` — no subir a v24 (incompatibilidad de tipos con ExcelJS). El frontend (`apps/web`) puede usar `^22` también por consistencia
- Workspaces de pnpm usan resolución **aislada** (no hoisted) → cada `apps/*` declara explícitamente sus deps directas. Si aparece "Cannot find module X" pero X funciona en tests, probablemente X es transitivo de otro paquete y hay que declararlo como dep directa (caso real: `multer`, `dotenv`, `@types/multer` en `apps/api`)

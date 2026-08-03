# MoneyDiary — Contexto para Claude Code

## ¿Qué es este proyecto?

App de finanzas personales para consolidar y analizar movimientos bancarios chilenos (Banco de Chile, BancoEstado, BCI, Santander) importados desde archivos `.xlsx`. Es simultáneamente un ejercicio de aprendizaje en buenas prácticas de ingeniería (Clean Architecture, TDD, ADRs, Agile/Scrum).

**Repositorio:** `git@github.com:Juargo/MoneyDiary.git`
**Stack backend:** **Express + TypeScript strict** (ADR-028, migrado desde NestJS) · pnpm v11 · Node.js 22+ · Prisma 7 · PostgreSQL (Supabase)
**Stack frontend:** React 19 · TypeScript · Vite 8 · Tailwind 4 · shadcn/ui · TanStack Query · TanStack Router · Zustand
**Stack mobile:** Expo SDK 57 · Expo Router · NativeWind 4 (Tailwind 3) · jest-expo + RNTL (ADR-010/017)
**Estructura:** Monorepo `pnpm workspaces` — `apps/api` (backend) + `apps/web` (frontend) + `apps/mobile` (Expo)
**Producción (dominio propio `moneydiary.cl`, DNS gestionado por Vercel):** landing → `https://moneydiary.cl` (apex, Vercel) · web → `https://app.moneydiary.cl` (Vercel `money-diary-web`) · API → `https://api.moneydiary.cl` (CNAME → Render `moneydiary-api`; sigue accesible en `https://moneydiary-api.onrender.com`), protegida por `apiKeyMiddleware` (`x-api-key`). El API expone **CORS con allowlist por env** (`CORS_ALLOWED_ORIGINS`, incluye `app.moneydiary.cl`; ver `render.yaml`) para el `GET /version` público; el web lo lee cross-origin vía `VITE_API_BASE_URL=https://api.moneydiary.cl`. Deploy git→prod del web (Vercel) confirmado.

---

## Documentación del proyecto

Fuentes de verdad por tipo (migración Obsidian → GitHub, 2026-07-30):

- **Decisiones de arquitectura (ADRs)** → `docs/adr/` en el repo (un `ADR-NNN-slug.md` por decisión + `README.md` índice). Se revisan en el PR que las implementa. La tabla de más abajo es un resumen rápido; el texto completo y el estado viven en el archivo.
- **User Stories / backlog** → [GitHub Issues](https://github.com/Juargo/MoneyDiary/issues) (labels `epic:*` + `moscow:*`). El estado se deriva de open/closed + el PR vinculado, no de prosa.
- **Épicas** → labels `epic:*` · **Sprints** → [Milestones](https://github.com/Juargo/MoneyDiary/milestones) `Sprint-1…9`.
- **Proceso SDD (OpenSpec)** → `openspec/` (specs vigentes + changes archivados).
- **Proceso (DoD, DoR, ceremonias, ciclo de vida) y diseño narrativo** → vault Obsidian, `00 Metodología/` y `02 Diseño/`. El vault **ya NO es fuente de verdad** de ADRs/US/Sprints — quedan copias históricas con banner de deprecación. Ruta: `~/Library/Mobile Documents/iCloud~md~obsidian/Documents/JJ - Developer/0002 EL YO CREADOR/DEV PERSONAL/MoneyDiary/`.

Los IDs de US son **globales y secuenciales** (no se reinician por épica). La **DoD/DoR canónicas viven en `00 Metodología/`**: cada US se cierra solo si cumple la DoD.

---

## Arquitectura

**Estructura raíz:** monorepo `pnpm workspaces` (ADR-008)

```
apps/
  api/              ← Backend Express + Clean Architecture (ADR-028, ADR-005)
    src/
      domain/         ← Entidades, Value Objects, errores de negocio (sin dependencias externas)
      application/    ← Use Cases y Ports (interfaces). Depende solo del dominio.
      infrastructure/ ← Adapters concretos: `http-express/` (app + middleware + routes),
                        `persistence/`, `excel/`, `pdf/`, `cli/`, `scheduler/`. Depende de application.
      shared/         ← Result<T,E>, utilidades transversales
      composition/    ← Composition Root real: `container.ts` (DI manual con `new`) + helpers `crear-*`
    test/
    prisma/
  web/              ← Frontend React (ADR-003, ADR-008)
    src/
      routes/         ← TanStack Router file-based (`__root.tsx`, `index.tsx`, ...)
      components/ui/  ← shadcn/ui — componentes copiados al repo, no instalados
      stores/         ← Zustand stores (client state)
      api/            ← TanStack Query hooks + tipos DTO escritos a mano
      lib/            ← `cn()` y helpers
  mobile/           ← App Expo (ADR-010; +subida de cartola por ADR-026)
    app/              ← Expo Router (`_layout.tsx`, `index.tsx`)
    src/
      domain/         ← lógica pura (view-model, formateo CLP sobre string, geometría pie)
      api/            ← cliente HTTP mínimo (`fetchResumen`) + config env (`EXPO_PUBLIC_*`)
      components/     ← pantalla resumen + estados Loading/Error/Empty (NativeWind)
    .maestro/         ← E2E manual en dispositivo (no CI)
openspec/           ← Proceso SDD (OpenSpec): specs vigentes + changes archivados
  specs/              ← `api-access-control` · `mobile-resumen-screen`
  changes/archive/    ← `2026-07-14-sprint3-mvp-mobile` (proposal/spec/design/tasks)
```

**Backend — patrón:** Monolito Modular + Clean Architecture (ADR-005)
**Regla de dependencias backend:** `domain ← application ← infrastructure`. Nunca al revés.
**Manejo de errores backend:** `Result<T,E>` (en `apps/api/src/shared/result.ts`) — nunca lanzar excepciones en domain/application.
**Al implementar una nueva US del backend:** empezar siempre por el dominio (value objects, errores), luego application (ports, use cases), luego infrastructure. No al revés.

**Capa HTTP (post-ADR-028, Express):** los endpoints viven en `infrastructure/http-express/` — `app.ts` (`createApp(container)`, sin `listen`), `middleware/` (`apiKeyMiddleware` → `sessionMiddleware` → `errorMiddleware`), y `routes/*.routes.ts` (funciones `registrar*(router, useCase)` con closure-DI). No hay decoradores ni módulos: el grafo se arma a mano en `composition/container.ts`. "Ruta pública" = no montar el middleware. El entrypoint es `http-express/server.ts` (`node dist/infrastructure/http-express/server`). Los DTOs y helpers de auth framework-agnósticos sobrevivieron en `infrastructure/http/` (dto/, multer-file-reader.adapter, auth/ sin los guards/decorators). ⚠️ **Las referencias de secciones históricas de sprints a `http/*.controller.ts`, `*.module.ts`, `PrismaService`/`prisma.module.ts`, `ApiKeyGuard`/`SessionGuard`, `@CurrentUser()`/`@Public()` son PRE-migración** — hoy son, respectivamente, `http-express/routes/`, `container.ts`/`crear-*`, `createPrismaClient()`, los middleware, y `req.userId`/no-montar-middleware.

**Frontend — sin compartir dominio:** el frontend NO importa de `apps/api/src/domain` (rompería ADR-005). El contrato real son los DTOs HTTP; los tipos se escriben a mano en `apps/web/src/api/types.ts`. No existe `packages/shared` — decisión deliberada (ADR-008).

---

## Decisiones Técnicas Clave (ADRs)

Resumen de una línea por decisión. **Texto completo y estado en `docs/adr/`** (fuente de verdad).

| ADR | Decisión |
|-----|----------|
| ADR-001 | Backend: NestJS + TypeScript — ⛔ **supersedido por ADR-028** (framework); TypeScript se mantiene |
| ADR-002 | Base de datos: PostgreSQL + Supabase + Prisma 7 |
| ADR-003 | Frontend: React + TypeScript + Vite |
| ADR-004 | Hosting: Vercel + Render + GitHub Actions |
| ADR-005 | Arquitectura: Monolito Modular + Clean Architecture |
| ADR-006 | Package manager: pnpm v11+ (security by default) |
| ADR-007 | Parseo Excel: ExcelJS únicamente `.xlsx` — SheetJS descartado por CVEs en npm |
| ADR-008 | Frontend Stack: Monorepo pnpm + Tailwind/shadcn + TanStack Query/Zustand + TanStack Router — ⚠️ parcialmente reemplazado por ADR-011/012 |
| ADR-009 | Parseo PDF: pdfjs-dist (build legacy) |
| ADR-010 | Mobile: React Native + Expo + Expo Router + NativeWind — ✅ adelantado a Sprint 3 (pivote MVP mobile). Nota: NativeWind 4 exige `tailwindcss@3` (soporte v4 solo en preview) |
| ADR-011 | Contrato-first: `openapi.json` como fuente única del contrato HTTP |
| ADR-012 | `@moneydiary/api-client`: cliente HTTP agnóstico de plataforma |
| ADR-013 | Cifrado de datos en reposo (todo) + a nivel de app en columnas sensibles |
| ADR-014 | Validación de requisitos: 3 técnicas cualitativas de bajo coste (demos → usabilidad → piloto); métricas de negocio y test A/B diferidas como trabajo futuro |
| ADR-015 | Verificación de requisitos: verificación por capas con énfasis en dinero (unit) y control de acceso (integración) + criterios ejecutables BDD + peer review con checklist de seguridad + UAT |
| ADR-016 | Testing framework: Vitest (runner único front + back, reemplaza Jest) — ✅ implementado. Backend usa el transformador **Oxc por defecto** (se quitó `unplugin-swc`/`oxc:false` al eliminar Nest — ya no hay decoradores, ADR-028); front usa jsdom + Testing Library |
| ADR-017 | Testing mobile: Jest (jest-expo) + React Native Testing Library + Maestro (E2E) — ✅ activo: `apps/mobile` ya es app Expo real dentro del workspace (Sprint 3, PR #28); jest-expo 57 fija jest@29. Maestro corre manual en dispositivo, no en CI |
| ADR-018 | Testing accesibilidad + UX: a11y por capas — web (eslint-jsx-a11y + vitest-axe + @axe-core/playwright), mobile (eslint-rn-a11y + rn-accessibility-engine + VoiceOver/TalkBack, post-MVP); WCAG 2.2 AA; UX validada vía ADR-014 |
| ADR-019 | Tracking y monitoring: 🔵 EN DISCUSIÓN (decisión final diferida). Propuesta: SDKs de Sentry (backend/web/mobile) → GlitchTip (cloud free → self-host cuando el volumen/privacidad lo exija). Highlight descartado (deprecado feb 2026). PII/financial scrubbing obligatorio en `beforeSend` (ADR-013). Session replay/tracing profundo diferido |
| ADR-020 | Git hooks (monorepo): Husky + lint-staged + commitlint, instalados **solo en la raíz** (instalarlos en `apps/*` los deja sin efecto). `pre-commit` → lint-staged (ESLint --fix + Prettier + typecheck del workspace tocado, routing por glob); `commit-msg` → commitlint (Conventional Commits); `pre-push` → tests de workspaces afectados. **Los hooks son conveniencia, NO enforcement (`--no-verify` los salta): CI debe re-correr las mismas checks.** Lefthook evaluado y diferido (stack all-Node) — ✅ **implementado** (estaba documentado pero nunca construido; se hizo como precondición del Slice A de ADR-030, PR #118, 2026-07-27) |
| ADR-021 | Análisis de seguridad automatizado en el pipeline (GitHub Actions, OSS/gratis): **SCA** (Dependabot + `pnpm audit --audit-level=high` gate + Socket.dev supply-chain) · **DAST** (OWASP ZAP API scan + Schemathesis dirigidos por `openapi.json`, contra entorno efímero — **nunca Supabase real**) · **SAST** (Semgrep; CodeQL si repo público/GHAS) · **secretos** (gitleaks en pre-commit + CI). Bloquean high/critical + secretos; el resto advierte. BOLA/IDOR (aislamiento user_id) NO lo cubre DAST → tests de integración (ADR-015) |
| ADR-022 | Ruta de despliegue mobile: distribución interna con EAS Build (APK Android firmado, compartido por URL/QR) antes que store. Publicación en tiendas deja de ser prioridad y no bloquea nada |
| ADR-023 | Topología de despliegue: actual PaaS free tier mono-usuario (Render + Vercel + Supabase) y evolución prevista hacia multi-cliente |
| ADR-024 | Arquitectura de clientes: backend rico + clientes delgados contract-first. El dominio canónico vive una sola vez en el backend; web/mobile solo tienen lógica de presentación. Regla de oro: si afecta cuánto dinero se muestra o cómo se clasifica → `domain`; si afecta cómo se presenta → cliente |
| ADR-025 | Landing page: workspace propio `apps/landing` con Astro 100 % estático, desplegado como proyecto Vercel independiente bajo el dominio raíz |
| ADR-026 | Ingesta desde mobile: la app gana una única capacidad de escritura — subir cartola `.xlsx`/`.pdf` vía `POST /api/ingestas` (`expo-document-picker`). Toda otra escritura queda fuera. Enmienda ADR-010 (mobile deja de ser solo-lectura) |
| ADR-027 | Set de iconos unificado web+mobile: **`lucide`** (`lucide-react` ya embebido en web + default de shadcn; `lucide-react-native` en mobile). Iconoir evaluado y descartado por peaje de migración + fricción permanente con shadcn. `react-native-svg` vía `expo install` |
| ADR-028 | Backend framework: **NestJS → Express + TypeScript strict** — ✅ **código completo** (PR #109, change SDD `migrate-api-to-express`, 10 slices TDD). Supersede ADR-001. Motivo: la magia de Nest (DI, decoradores) tapaba los fundamentos que el proyecto busca aprender. Capa HTTP reescrita a `http-express/` (middleware + routes) + composition root real (`container.ts` + `crear-*`); `domain`/`application` **0 cambios** (el aislamiento de ADR-005 lo permitió). Prisma se mantiene. Guards → middleware; `@Cron` demo → node-cron. ✅ **Mergeado a `main` y deployado** (2026-07-24, PR #109); 8d verificado por smoke-test del entrypoint de prod (`start:prod`: boot + matriz curl 200/401/401/401 + conectividad DB). Deuda: e2e/int con DB (bloqueados: `.env`→prod, el gate db-safety los rechaza; necesitan una DB de dev; varios bit-rotteados de sesión) + reubicar sobrevivientes de `http/` |
| ADR-029 | Ambientes (dev/test/prod) + validación de entorno: **`NODE_ENV` ∈ `{development, test, production}`** como fuente única del ambiente lógico (se descarta `APP_ENV`, YAGNI sin staging deployado). Testing = configuración + **BD Postgres efímera en localhost** (sin servidor deployado; desbloquea la deuda e2e/int de ADR-028 y el DAST de ADR-021). Validación de env centralizada con **Zod** en `apps/api/src/config/env.ts` (fail-fast al boot, reglas condicionales por ambiente: prod ⇒ Supabase + `COOKIE_SECURE=true` + `ALLOW_DESTRUCTIVE_DB` prohibido; test/dev ⇒ localhost). `.env.example` **derivado del schema** (script `env:example` + check en CI). Scope: solo `apps/api`. Implementación como change SDD aparte |
| ADR-030 | Versionado + releases: versión **semver independiente por workspace** (api/web/mobile/landing, cada uno su changelog) — se descarta lockstep. **release-please** (GitHub Actions, manifest mode) deriva bump+changelog de los Conventional Commits ya obligatorios (ADR-020); emite tag con prefijo **`<paquete>-vX.Y.Z`** que es identidad de release **y** trigger del CD separado. Mobile: release-please dueño de `version`, **EAS `autoIncrement`** dueño de `versionCode`/`buildNumber`, `runtimeVersion`/OTA diferido (YAGNI, ADR-022). CI partido por **path filters**. Changesets descartado (para libs npm, duplica la intención del commit). — ✅ **implementado**: change SDD `versioning-release-automation` mergeado a `main` (4 PRs encadenados #118-#121, 2026-07-27). Pendiente: activación en plataformas (EXPO_TOKEN, Vercel Root Directory + Deep Clone, buildFilter de Render). Branch protection en `main` (C.7) ✅ activa (PR obligatorio + checks `CI success`/`Commitlint` + `enforce_admins`, sin force-push/borrado) |
| ADR-031 | Estrategia de ramas: **GitHub Flow (trunk-based)** — `main` es tronco único protegido; ramas efímeras `type/descripción` → PR → `main`; releases/deploy derivan de `main` (ADR-030). Se descarta **GitFlow** (pelea con release-please/CD cableados a `main` y es overkill mono-dev) y el **trunk-based puro** (bloqueado por la branch protection de C.7). — ✅ **Decidido** (2026-07-28). Trabajo concurrente (p. ej. Claude Code + OpenCode en paralelo por throughput) se aísla con **git worktree** particionado por workspace (conflicto ≈ 0); helpers fish `wt-new`/`wt-rm` |

---

## Estado y backlog

El estado de sprints y User Stories **no vive en este archivo** — se derivaba de prosa y driftaba (ese fue el motivo de la migración a GitHub). Fuente de verdad:

- **Qué está hecho / pendiente:** [Issues](https://github.com/Juargo/MoneyDiary/issues) y [Milestones](https://github.com/Juargo/MoneyDiary/milestones) (`Sprint-1…9`).
- **Detalle de decisiones:** `docs/adr/` · **changes SDD:** `openspec/changes/`.
- **Runbooks operativos:** `apps/api/docs/` y `docs/` (`mobile-launch-runbook.md`, `local-test-db.md`, etc.).

## Notas técnicas por dominio (gotchas)

Conocimiento no obvio del código ya entregado — durable, no derivable de un vistazo. El *estado* de cada US vive en los Issues; esto es solo el saber técnico. (Los nombres HTTP pre-migración a Express están cubiertos en **Arquitectura**; todas las rutas backend cuelgan de `apps/api/`.)

- **Parseo Excel:** las strategies leen celdas con `cell.text`, **no** `String(cell.value)` — BCI usa `richText` y `.value` no lo resuelve. Cada strategy expone `getEstructura()` (fila de encabezados + columnas esperadas). Fechas aceptadas: `DD/MM/YYYY`, `YYYY-MM-DD`, `DD-MM-YYYY` (el último para Santander). Detección de banco por celda clave → ver "Patrones de detección bancaria".
- **Prisma:** `prisma.config.ts` (raíz de `apps/api/`) **NO** acepta `earlyAccess: true` (el tipo estable de Prisma 7 lo rechaza). El `CHECK cargo/abono ≥ 0` va por SQL puro en migración (`add_cargo_abono_check`) — Prisma no modela CHECK.
- **Dinero:** `BigInt` exacto en `cargo/abono`, nunca `float`; el mapper `number ↔ BigInt` (`transaccion.mapper.ts`) tiene guardas de overflow (`Number.MAX_SAFE_INTEGER`). Los porcentajes 50/30/20 se calculan en basis points con round-half-up (`resumen-mes.ts`). Los montos crudos se **scrubben** de los mensajes de error (dominio y boundary HTTP 400). DTOs BigInt-safe: montos como string.
- **Semáforo (`estado-semaforo.ts`):** umbrales en bp — Necesidades ≤50%, Deseos ≤30%, Ahorro en banda bidireccional 20–40%; `estadoGlobal` = peor estado entre los 3 buckets de gasto. El backend **calcula** el estado; el cliente solo lo renderiza (ADR-024).
- **Categorización:** `PatronClasificacion.coincide()` es case-insensitive con `CONTAINS`/`STARTS_WITH`/`REGEX` (REGEX en try/catch, nunca lanza). Regla Ingreso = `abono>0 && cargo===0`. El paso de categorización en `ProcessIngestaUseCase` es una **isla degradable**: si falla, deja las filas no-Ingreso en `null` (no `SinCategoria`) para reintento. Seed idempotente del catálogo chileno. Sin IA (RES-ALC-003).
- **Aislamiento multi-tenant (RNF-SEC-006):** todo repo que devuelve datos de usuario filtra por `userId` en el WHERE (p. ej. `account: { userId }`), **no** en memoria. `periodo` ausente → mes en curso; inválido → 400 con scrub.
- **db-safety:** las mutaciones destructivas de BD exigen opt-in `ALLOW_DESTRUCTIVE_DB=1` y rechazan connection strings de prod. El gate bloquea e2e/int contra Supabase (por eso necesitan una DB local; ver `apps/api/docs/local-test-db.md`).
- **Cifrado de columnas sensibles:** ver ADR-013 (`docs/adr/`).

---

## Fixtures de prueba

Los fixtures llevan sufijo `-test` y contienen datos anonimizados (los originales, con info sensible real, se eliminaron del repo).

```
apps/api/test/fixtures/
  Últimos_Movimientos_CuentaRUT_test.xlsx            ← BancoEstado ✅ detectado
  movimientos-test.xlsx                              ← BCI ✅ detectado
  ultimos movimientos-Cuenta Corriente-test.xlsx     ← Santander ✅ detectado
  cartola-test.xls     ← placeholder .xls (sin datos) — solo para el test de rechazo por extensión (ADR-007)
  pdf/                 ← cartolas PDF de prueba (ADR-009, pdfjs-dist), una por banco:
    bancochile-cartola-test.pdf · bancoestado-cartola-test.pdf · bci-cartola-test.pdf · santander-cartola-test.pdf
```

---

## Comandos frecuentes

La raíz tiene shortcuts: `pnpm api ...` → `pnpm --filter @moneydiary/api ...`, idem `pnpm web ...`.

```bash
# Backend
pnpm api test                                # vitest run (ADR-016; transformador Oxc por defecto)
pnpm api test:watch                          # vitest (watch)
pnpm api test:e2e                            # vitest e2e — muta BD real, gate ALLOW_DESTRUCTIVE_DB=1
pnpm api test:integration                    # vitest integración — mismo gate
pnpm api cli -- ./test/fixtures/movimientos-test.xlsx
pnpm api start                               # server Express desde fuente (ts-node)
pnpm api build                               # tsc -p tsconfig.build.json → dist/
pnpm api start:prod                          # node dist/infrastructure/http-express/server
pnpm api exec tsc --noEmit                   # TypeScript check
pnpm api exec prisma migrate dev             # migraciones

# Mobile (sin shortcut raíz — usar --filter)
pnpm --filter @moneydiary/mobile test        # jest-expo 57 (jest@29) + RNTL
# dev: `npx expo start` dentro de apps/mobile (requiere .env con EXPO_PUBLIC_API_BASE_URL / EXPO_PUBLIC_API_KEY — ver .env.example)

# Frontend
pnpm web dev                                 # Vite en :5173 con proxy /api → :3000
pnpm web test                                # vitest run (jsdom + Testing Library, ADR-016)
pnpm web build                               # tsr generate + tsc + vite build
pnpm web typecheck                           # tsr generate + tsc -b

# Workspace completo
pnpm test                                    # tests de todos los workspaces
pnpm build                                   # builds de todos los workspaces
pnpm audit                                   # auditoría de seguridad
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

## Patrones de detección bancaria

| Banco | Celda clave | Valor |
|-------|-------------|-------|
| BancoEstado | A1 | Contiene `"CuentaRUT"` |
| Banco de Chile | B8/B9/B10 | `"Sr(a):"` / `"Rut:"` / `"Cuenta:"` |
| Santander | A2 | Comienza con `"Cuenta Corriente:"` + contiene `"0-000-"` |
| BCI | A1 + A8 | `"Últimos Movimientos"` + `"Fecha Transacción"` |

---

## Notas de seguridad

- `pnpm-workspace.yaml` tiene `overrides: uuid: >=11.1.1` (CVE en exceljs → uuid) y `packages: ['apps/*']`
- `.npmrc` tiene `minimum-release-age=10080`, `audit-level=high`, `block-exotic-subdeps=true`
- SheetJS descartado (CVEs sin parche en npm) — ver ADR-007
- `pnpm approve-builds` requerido para `@prisma/engines`, `@swc/core`, `prisma` y `unrs-resolver` en instalación limpia (declarado en `pnpm-workspace.yaml > allowBuilds`)
- **Secretos de producción fuera del repo:** `API_KEY`/`DATABASE_URL`/`DIRECT_URL` viven en el dashboard de Render (`sync:false` en `render.yaml`); la key del cliente mobile va en env de build (EAS Secrets), **nunca** hardcodeada en el bundle
- `apps/api/@types/node` fijado en `^22` — no subir a v24 (incompatibilidad de tipos con ExcelJS). El frontend (`apps/web`) puede usar `^22` también por consistencia
- Workspaces de pnpm usan resolución **aislada** (no hoisted) → cada `apps/*` declara explícitamente sus deps directas. Si aparece "Cannot find module X" pero X funciona en tests, probablemente X es transitivo de otro paquete y hay que declararlo como dep directa (caso real: `multer`, `dotenv`, `@types/multer` en `apps/api`)

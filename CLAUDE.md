# MoneyDiary — Contexto para Claude Code

## ¿Qué es este proyecto?

App de finanzas personales para consolidar y analizar movimientos bancarios chilenos (Banco de Chile, BancoEstado, BCI, Santander) importados desde archivos `.xlsx`. Es simultáneamente un ejercicio de aprendizaje en buenas prácticas de ingeniería (Clean Architecture, TDD, ADRs, Agile/Scrum).

**Repositorio:** `git@github.com:Juargo/MoneyDiary.git`
**Stack backend:** NestJS v11 · TypeScript strict · pnpm v11 · Node.js 22+ · Prisma 7 · PostgreSQL (Supabase)
**Stack frontend:** React 19 · TypeScript · Vite 8 · Tailwind 4 · shadcn/ui · TanStack Query · TanStack Router · Zustand
**Estructura:** Monorepo `pnpm workspaces` — `apps/api` (backend) + `apps/web` (frontend)

---

## Documentación de diseño (Obsidian)

Todos los ADRs, User Stories, Sprint Planning, metodología y diseño viven en el vault de Obsidian. **La estructura de carpetas está numerada para reflejar la secuencia del ciclo de vida (SDLC + Scrum)** — Obsidian ordena alfabéticamente, así que el número = fase.

```
~/Library/Mobile Documents/iCloud~md~obsidian/Documents/JJ - Developer/0002 EL YO CREADOR/DEV PERSONAL/MoneyDiary/
  000 INDEX MONEYDIARY.md
  00 Metodología/                                    ← el "proceso" en sí
    Ciclo de Vida y Metodología — Fases + Scrum.md   ← diagrama SDLC+Scrum (Mermaid)
    Definition of Done (DoD).md                      ← DoD canónica (fuente única, go-forward)
    Definition of Ready (DoR).md                     ← DoR (ligera)
    Convenciones de código y commits.md              ← espejo Obsidian de este CLAUDE.md
  01 Análisis de Requisitos/                         ← Casos de Uso, RF/RNF/RES/RN, Reuniones, INDEX
  02 Diseño/
    ADRs/                                            ← ADR-001 … ADR-021 (subcarpeta)
    Design Doc · ERD · API Design · Threat Model · Wireframes · INDEX DISEÑO.md
  03 Product Backlog/
    000 INDEX Product Backlog.md
    01 Epic - Ingesta de datos/     US-001 … US-011  ← estado detallado por US
    02 Epic - Categorización/       US-012, US-013
    03 Epic - Visualización/        US-014 … US-017
    04 Epic - Gestión de datos/     US-018
  04 Sprints/
    Sprint-1/Sprint-1.md                             ← cerrado (may 2026)
    Sprint-2/Sprint-2.md                             ← en curso (7–18 jul 2026)
  99 Archivo/                                        ← fichas obsoletas (Epic A–D descartados)
```

Cuando trabajes en análisis o diseño, leer los archivos relevantes de esa ruta antes de proponer cambios. Los IDs de US son **globales y secuenciales** (no se reinician por épica). La **DoD/DoR canónicas viven en `00 Metodología/`**: cada US se cierra solo si cumple la DoD.

---

## Arquitectura

**Estructura raíz:** monorepo `pnpm workspaces` (ADR-008)

```
apps/
  api/              ← Backend NestJS (ADR-001, ADR-005)
    src/
      domain/         ← Entidades, Value Objects, errores de negocio (sin dependencias externas)
      application/    ← Use Cases y Ports (interfaces). Depende solo del dominio.
      infrastructure/ ← Implementaciones concretas (HTTP, CLI, Excel). Depende de application.
      shared/         ← Result<T,E>, utilidades transversales
      composition/    ← Composition Root (placeholder, DI manual por ahora)
    test/
    prisma/
  web/              ← Frontend React (ADR-003, ADR-008)
    src/
      routes/         ← TanStack Router file-based (`__root.tsx`, `index.tsx`, ...)
      components/ui/  ← shadcn/ui — componentes copiados al repo, no instalados
      stores/         ← Zustand stores (client state)
      api/            ← TanStack Query hooks + tipos DTO escritos a mano
      lib/            ← `cn()` y helpers
```

**Backend — patrón:** Monolito Modular + Clean Architecture (ADR-005)
**Regla de dependencias backend:** `domain ← application ← infrastructure`. Nunca al revés.
**Manejo de errores backend:** `Result<T,E>` (en `apps/api/src/shared/result.ts`) — nunca lanzar excepciones en domain/application.
**Al implementar una nueva US del backend:** empezar siempre por el dominio (value objects, errores), luego application (ports, use cases), luego infrastructure. No al revés.

**Frontend — sin compartir dominio:** el frontend NO importa de `apps/api/src/domain` (rompería ADR-005). El contrato real son los DTOs HTTP; los tipos se escriben a mano en `apps/web/src/api/types.ts`. No existe `packages/shared` — decisión deliberada (ADR-008).

---

## Decisiones Técnicas Clave (ADRs)

| ADR | Decisión |
|-----|----------|
| ADR-001 | Backend: NestJS + TypeScript |
| ADR-002 | Base de datos: PostgreSQL + Supabase + Prisma 7 |
| ADR-003 | Frontend: React + TypeScript + Vite |
| ADR-004 | Hosting: Vercel + Render + GitHub Actions |
| ADR-005 | Arquitectura: Monolito Modular + Clean Architecture |
| ADR-006 | Package manager: pnpm v11+ (security by default) |
| ADR-007 | Parseo Excel: ExcelJS únicamente `.xlsx` — SheetJS descartado por CVEs en npm |
| ADR-008 | Frontend Stack: Monorepo pnpm + Tailwind/shadcn + TanStack Query/Zustand + TanStack Router — ⚠️ parcialmente reemplazado por ADR-011/012 |
| ADR-009 | Parseo PDF: pdfjs-dist (build legacy) |
| ADR-010 | Mobile: React Native + Expo + Expo Router + NativeWind (post-MVP) |
| ADR-011 | Contrato-first: `openapi.json` como fuente única del contrato HTTP |
| ADR-012 | `@moneydiary/api-client`: cliente HTTP agnóstico de plataforma |
| ADR-013 | Cifrado de datos en reposo (todo) + a nivel de app en columnas sensibles |
| ADR-014 | Validación de requisitos: 3 técnicas cualitativas de bajo coste (demos → usabilidad → piloto); métricas de negocio y test A/B diferidas como trabajo futuro |
| ADR-015 | Verificación de requisitos: verificación por capas con énfasis en dinero (unit) y control de acceso (integración) + criterios ejecutables BDD + peer review con checklist de seguridad + UAT |
| ADR-016 | Testing framework: Vitest (runner único front + back, reemplaza Jest) — ✅ implementado. Backend transpila con SWC (`unplugin-swc` + `oxc:false`) por la metadata de decoradores de Nest; front usa jsdom + Testing Library |
| ADR-017 | Testing mobile: Jest (jest-expo) + React Native Testing Library + Maestro (E2E) — post-MVP. Esqueleto en `apps/mobile/` (excluido del workspace hasta scaffoldear la app real) |
| ADR-018 | Testing accesibilidad + UX: a11y por capas — web (eslint-jsx-a11y + vitest-axe + @axe-core/playwright), mobile (eslint-rn-a11y + rn-accessibility-engine + VoiceOver/TalkBack, post-MVP); WCAG 2.2 AA; UX validada vía ADR-014 |
| ADR-019 | Tracking y monitoring: 🔵 EN DISCUSIÓN (decisión final diferida). Propuesta: SDKs de Sentry (backend/web/mobile) → GlitchTip (cloud free → self-host cuando el volumen/privacidad lo exija). Highlight descartado (deprecado feb 2026). PII/financial scrubbing obligatorio en `beforeSend` (ADR-013). Session replay/tracing profundo diferido |
| ADR-020 | Git hooks (monorepo): Husky + lint-staged + commitlint, instalados **solo en la raíz** (instalarlos en `apps/*` los deja sin efecto). `pre-commit` → lint-staged (ESLint --fix + Prettier + typecheck del workspace tocado, routing por glob); `commit-msg` → commitlint (Conventional Commits); `pre-push` → tests de workspaces afectados. **Los hooks son conveniencia, NO enforcement (`--no-verify` los salta): CI debe re-correr las mismas checks.** Lefthook evaluado y diferido (stack all-Node) |
| ADR-021 | Análisis de seguridad automatizado en el pipeline (GitHub Actions, OSS/gratis): **SCA** (Dependabot + `pnpm audit --audit-level=high` gate + Socket.dev supply-chain) · **DAST** (OWASP ZAP API scan + Schemathesis dirigidos por `openapi.json`, contra entorno efímero — **nunca Supabase real**) · **SAST** (Semgrep; CodeQL si repo público/GHAS) · **secretos** (gitleaks en pre-commit + CI). Bloquean high/critical + secretos; el resto advierte. BOLA/IDOR (aislamiento user_id) NO lo cubre DAST → tests de integración (ADR-015) |

---

## Estado actual

**Sprint 1 (26–30 mayo 2026) — CERRADO.** Pipeline backend de parseo completo (detectar → validar → normalizar) + Supabase/Prisma integrado.

**Hito post-Sprint 1 (2026-06-10):** scaffold frontend completado en rama `feature/frontend-scaffold` — monorepo `apps/api`+`apps/web`, Vite + React 19 + Tailwind 4 + TanStack + Zustand. PR pendiente.

**Sprint 2 (7–18 julio 2026) — CERRADO (11 jul, 23/24 tareas).** Pipeline backend completo `… → persistir → categorizar → consultar consolidado` para un usuario fijo: US-011 (persistencia), US-012 (categorización) y US-014 (consolidación mensual) + Tarea 0 mono-usuario. `apps/api/src/infrastructure/persistence/` ya está poblado (`PrismaService`, repos Prisma, mapper, seed) y `Transaccion` tiene sus FK (`ingestaId`/`accountId` NOT NULL, `bucketId` nullable) + dinero en `BigInt cargo/abono`. Único pendiente: **11.6 cifrado de columna real**, diferido como `NoOpCryptoService` (CA-03 abierto). Detalle en `04 Sprints/Sprint-2/Sprint-2.md` del vault.

**Sprint 3 (julio 2026) — EN CURSO.** UI de visualización. El **backend de US-015** (distribución 50/30/20, `GET /api/resumen?periodo=YYYY-MM`) y **US-016** (semáforo verde/amarillo/rojo: `estadoSemaforo` por bucket + `estadoGlobal`) **ya está mergeado en `main`** (PRs #22/#23); falta la UI de ambas + US-017 (detalle de bucket). Detalle en `04 Sprints/Sprint-3/Sprint-3.md`.

**Roadmap MVP (siguiente):** completar la UI de Sprint 3 (distribución + semáforo + detalle de bucket) sobre los mockups de Stitch → primer flujo end-to-end con UI → MVP funcional.

> **Nota sobre paths:** todas las rutas de archivos backend que se mencionan abajo viven dentro de `apps/api/`. Por brevedad se omite el prefijo (ej: `src/domain/...` significa `apps/api/src/domain/...`).

### ✅ US-001 — Carga de archivo XLSX (completo)

- `src/domain/value-objects/extension.ts` — solo acepta `.xlsx` (ADR-007)
- `src/domain/errors/extension-no-permitida.error.ts`
- `src/application/ports/file-reader.port.ts` — `IFileReader`
- `src/application/use-cases/ingest-file.use-case.ts` — 9 tests ✅
- `src/infrastructure/http/multer-file-reader.adapter.ts`
- `src/infrastructure/http/ingesta.controller.ts` — `POST /api/ingestas`
- `src/infrastructure/http/ingesta.module.ts`
- `src/infrastructure/cli/fs-file-reader.adapter.ts`
- `src/infrastructure/cli/ingestar.ts` — `pnpm api cli -- archivo.xlsx`
- `test/ingesta.e2e-spec.ts` — integration test HTTP (3 casos: .xlsx ok, .xls rechazado, sin archivo) ✅

### ✅ US-006 — Detección de banco (completo, verificado con fixtures reales)

- `src/domain/value-objects/nombre-banco.ts` — `BancoConocido` enum
- `src/domain/value-objects/tipo-cuenta.ts` — `TipoCuentaConocido` enum
- `src/domain/errors/banco-no-reconocido.error.ts`
- `src/application/ports/bank-detector.port.ts` — `IBankDetector` (async)
- `src/application/use-cases/detect-bank.use-case.ts`
- `src/infrastructure/excel/excel-bank-detector.service.ts` — ExcelJS
- `src/infrastructure/excel/strategies/` — 4 estrategias (BancoChile, BancoEstado, BCI, Santander)

Verificado con `pnpm cli` para BancoEstado, BCI y Santander ✅. Banco de Chile pendiente (solo tiene fixtures `.xls` — descargar `.xlsx` del portal).

> Nota: las strategies leen celdas vía `cell.text` (no `String(cell.value)`) — necesario para BCI que usa `richText`. El fix se hizo junto con US-002.

### ✅ US-002 — Validación de estructura (completo, verificado con fixtures reales)

- `src/domain/value-objects/tipo-columna.ts` — enum `TipoColumna` (`Fecha|Numero|Texto`)
- `src/domain/value-objects/columna-esperada.ts` — VO `{ letra, nombre, tipo }`
- `src/domain/errors/estructura-invalida.error.ts` — agrupa todos los problemas en una pasada
- `src/application/ports/structure-validator.port.ts` — `IStructureValidator` (async)
- `src/application/use-cases/validate-structure.use-case.ts` — 3 tests ✅
- `src/infrastructure/excel/strategies/estructura-banco.ts` — interfaz `EstructuraBanco`
- Cada strategy expone `getEstructura()` con fila de encabezados + columnas esperadas
- `src/infrastructure/excel/excel-structure-validator.service.ts` — 11 tests ✅ (CA-01/02/03 + fixtures reales)
- CLI muestra `Encabezados : fila N` + `Filas datos : N`

**Formatos de fecha aceptados:** `DD/MM/YYYY`, `YYYY-MM-DD`, `DD-MM-YYYY` (este último agregado para Santander).

### ✅ US-007 — Normalización de columnas (mergeada en main, PR #2)

Pipeline de ingesta queda completo: detectar → validar → normalizar a esquema canónico de transacciones.

### ✅ Supabase + Prisma 7 (mergeado en main, PR #4)

`apps/api/prisma/schema.prisma` + migración inicial `20260610013724_init`. `prisma.config.ts` en raíz de `apps/api/` (NO usar `earlyAccess: true` — el tipo estable de Prisma 7 no lo acepta).

### ✅ Frontend scaffold (rama `feature/frontend-scaffold`, 2026-06-10)

`apps/web/` con Vite 8 + React 19 + Tailwind 4 + TanStack Router (file-based) + TanStack Query + Zustand. `components.json` y `lib/utils.ts` listos para `npx shadcn@latest add <name>`. `routeTree.gen.ts` se genera con `tsr generate` (en scripts `build` y `typecheck`) y está en `.gitignore`. Dev server tiene proxy `/api → http://localhost:3000`.

### ✅ US-011 — Persistencia de transacciones (mergeado en main, Sprint 2)

- `src/infrastructure/persistence/prisma.service.ts` + `prisma.module.ts` — `@Global` (instancia única; dos `PrismaService` module-scoped rompían el e2e de escritura atómica)
- `src/application/ports/{ingesta,transaccion,account}-repository.port.ts` — 3 puertos
- `src/infrastructure/persistence/prisma-{ingesta,transaccion,account}.repository.ts` — adapters
- `src/infrastructure/persistence/transaccion.mapper.ts` — `number ↔ BigInt` con guardas de overflow (`Number.MAX_SAFE_INTEGER`)
- `src/application/use-cases/persist-transactions.use-case.ts` — estado `PENDIENTE → PROCESADA/FALLIDA`, `Result`, nunca lanza
- `src/application/use-cases/process-ingesta.use-case.ts` — orquestador del pipeline; `IngestaModule` es el composition root real (tokens + `useFactory` tipados). Compartido por CLI y HTTP
- Migraciones: `add_transaccion_relations` (FK breaking) + `add_cargo_abono_check` (`CHECK cargo/abono ≥ 0`, SQL puro — Prisma no modela CHECK)
- Seguridad: `db-safety.ts` (opt-in `ALLOW_DESTRUCTIVE_DB=1` + rechazo de connection strings de prod); scrub de montos crudos en mensajes de error (también en el boundary HTTP 400)
- ⏸️ Cifrado de columna diferido: `crypto-service.port.ts` + `no-op-crypto.service.ts` (identidad). CA-03 abierto

### ✅ US-012 — Categorización automática (mergeado en main, Sprint 2)

- `src/domain/value-objects/bucket.ts` — VO `Bucket` (5 valores; subcategoría diferida a US-013)
- `src/domain/value-objects/patron-clasificacion.ts` — `coincide()` case-insensitive; `CONTAINS`/`STARTS_WITH`/`REGEX` (REGEX en try/catch, nunca lanza)
- `src/application/ports/catalogo-clasificacion.port.ts` + `src/application/use-cases/categorizar-transaccion.use-case.ts` — regla Ingreso (`abono>0 && cargo===0`) → match por prioridad → fallback `SinCategoria`
- `src/infrastructure/persistence/prisma-catalogo-clasificacion.repository.ts` + `prisma-transaccion-clasificacion.repository.ts` — lee `PatronClasificacion`/`BucketPresupuesto`; seed idempotente del catálogo chileno
- Wiring: paso post-persist en `ProcessIngestaUseCase` (isla degradable — si falla, deja filas no-Ingreso en `null`, no `SinCategoria`, para que US-013 las retome). Sin IA (RES-ALC-003)

### ✅ US-014 — Consolidación multi-banco por mes (mergeado en main, Sprint 2)

- `src/domain/value-objects/periodo-mes.ts` — VO `PeriodoMes` (`crear`/`actual`)
- `src/application/ports/movimientos-mes.port.ts` + `src/application/use-cases/obtener-movimientos-mes.use-case.ts` — thin
- `src/infrastructure/persistence/prisma-movimientos-mes.repository.ts` — `findMany` con JOIN a `Account`; **aislamiento estructural por `userId`** (`account: { userId }` en el WHERE — RNF-SEC-006)
- `src/infrastructure/http/movimientos.controller.ts` — `GET /api/movimientos?periodo=YYYY-MM`; DTO BigInt-safe (montos como string); `periodo` ausente → mes en curso, inválido → 400 con scrub. **Lista filtrada, no agrega** (agregación 50/30/20 → US-015)

### ✅ US-015 / US-016 — Resumen 50/30/20 + semáforo (mergeado en main, backend adelantado — Sprint 3)

- `src/domain/value-objects/resumen-mes.ts` — VO `ResumenMes` (`totalIngreso` + 4 slices con `porcentajeBp` en basis points, round-half-up; dinero `BigInt` exacto)
- `src/domain/value-objects/estado-semaforo.ts` — enum `EstadoSemaforo` (Verde/Amarillo/Rojo); Necesidades ≤50%, Deseos ≤30%, Ahorro banda bidireccional 20–40% (umbrales en bp). `estadoGlobal` = peor estado entre los 3 buckets de gasto
- `src/application/use-cases/calcular-resumen-mes.use-case.ts` + `src/infrastructure/persistence/prisma-resumen-mes.repository.ts` (aislamiento por `userId`)
- `src/infrastructure/http/resumen.controller.ts` — `GET /api/resumen?periodo=YYYY-MM`
- ⬜ Falta la UI (`apps/web` aún no consume `/api/resumen`) → trabajo de Sprint 3

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
pnpm api test                                # vitest run (ADR-016; SWC para metadata de decoradores de Nest)
pnpm api test:watch                          # vitest (watch)
pnpm api test:e2e                            # vitest e2e — muta BD real, gate ALLOW_DESTRUCTIVE_DB=1
pnpm api test:integration                    # vitest integración — mismo gate
pnpm api cli -- ./test/fixtures/movimientos-test.xlsx
pnpm api start:dev                           # NestJS watch
pnpm api exec tsc --noEmit                   # TypeScript check
pnpm api exec prisma migrate dev             # migraciones

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
- **Nombres en inglés** para infraestructura NestJS (controllers, modules, adapters)
- **Archivos:** `kebab-case.ts`, clases `PascalCase`
- **Commits:** Conventional Commits (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`)
- **No lanzar excepciones** en domain/application — usar `Result.fail(error)`
- **Ports** son interfaces en `application/ports/`, implementaciones en `infrastructure/`

> **Fuentes de verdad:** este `CLAUDE.md` es canónico para lo **técnico del repo** (convenciones de código, arquitectura, comandos, seguridad). El **proceso** (Definition of Done, Definition of Ready, ceremonias, ciclo de vida) es canónico en el vault Obsidian bajo `00 Metodología/`. La nota `Convenciones de código y commits.md` del vault es solo un espejo legible: si diverge, manda este archivo.
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
- `pnpm approve-builds` requerido para `@nestjs/core`, `@prisma/engines`, `prisma` y `unrs-resolver` en instalación limpia (declarado en `pnpm-workspace.yaml > allowBuilds`)
- `apps/api/@types/node` fijado en `^22` — no subir a v24 (incompatibilidad de tipos con ExcelJS). El frontend (`apps/web`) puede usar `^22` también por consistencia
- Workspaces de pnpm usan resolución **aislada** (no hoisted) → cada `apps/*` declara explícitamente sus deps directas. Si aparece "Cannot find module X" pero X funciona en tests, probablemente X es transitivo de otro paquete y hay que declararlo como dep directa (caso real: `multer`, `dotenv`, `@types/multer` en `apps/api`)

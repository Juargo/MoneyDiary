# MoneyDiary — Contexto para Claude Code

## ¿Qué es este proyecto?

App de finanzas personales para consolidar y analizar movimientos bancarios chilenos (Banco de Chile, BancoEstado, BCI, Santander) importados desde archivos `.xlsx`. Es simultáneamente un ejercicio de aprendizaje en buenas prácticas de ingeniería (Clean Architecture, TDD, ADRs, Agile/Scrum).

**Repositorio:** `git@github.com:Juargo/MoneyDiary.git`
**Stack backend:** NestJS v11 · TypeScript strict · pnpm v11 · Node.js 22+ · Prisma 7 · PostgreSQL (Supabase)
**Stack frontend:** React 19 · TypeScript · Vite 8 · Tailwind 4 · shadcn/ui · TanStack Query · TanStack Router · Zustand
**Estructura:** Monorepo `pnpm workspaces` — `apps/api` (backend) + `apps/web` (frontend)

---

## Documentación de diseño (Obsidian)

Todos los ADRs, User Stories, Sprint Planning y diseño viven en:

```
~/Library/Mobile Documents/iCloud~md~obsidian/Documents/JJ - Developer/0002 EL YO CREADOR/DEV PERSONAL/MoneyDiary/
  Diseño/
    ADR-001 Backend Framework.md
    ADR-002 Base de Datos.md
    ADR-003 Frontend.md
    ADR-004 Hosting.md
    ADR-005 Monolito-Modular-Clean-Architecture.md
    ADR-006 Package Manager.md
    ADR-007 Libreria Parseo Excel.md
    ADR-008 Frontend Stack.md
    INDEX DISEÑO.md
  Product Backlog/
    Epic - Ingesta de datos/
      US-001 Carga de archivo XLSX.md        ← estado actual detallado
      US-002 Validacion estructura.md
      US-006 Deteccion banco.md
      US-007 Normalizacion columnas.md
  Sprints/
    Sprint-1.md                              ← tareas y estado del sprint actual
```

Cuando trabajes en análisis o diseño, leer los archivos relevantes de esa ruta antes de proponer cambios.

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
| ADR-008 | Frontend Stack: Monorepo pnpm + Tailwind/shadcn + TanStack Query/Zustand + TanStack Router |

---

## Estado actual

**Sprint 1 (26–30 mayo 2026) — CERRADO.** Pipeline backend completo + Supabase/Prisma integrado.

**Hito post-Sprint 1 (2026-06-10):** scaffold frontend completado en rama `feature/frontend-scaffold` — monorepo `apps/api`+`apps/web`, Vite + React 19 + Tailwind 4 + TanStack + Zustand. PR pendiente.

**Roadmap MVP (siguiente):** US de persistencia (backend ↔ DB) → UI de carga (basada en mockups de Stitch) → MVP funcional end-to-end.

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

---

## Fixtures de prueba

```
apps/api/test/fixtures/
  Últimos_Movimientos_CuentaRUT_1778764122306.xlsx  ← BancoEstado ✅ detectado
  movimientos.xlsx                                   ← BCI ✅ detectado
  ultimos movimientos-Cuenta Corriente.xlsx          ← Santander ✅ detectado
  cartola.xls          ← Banco de Chile ❌ formato no soportado (descargar .xlsx)
  cartola_30042026.xls ← Banco de Chile ❌ formato no soportado (descargar .xlsx)
```

---

## Comandos frecuentes

La raíz tiene shortcuts: `pnpm api ...` → `pnpm --filter @moneydiary/api ...`, idem `pnpm web ...`.

```bash
# Backend
pnpm api test                                # jest
pnpm api test:watch
pnpm api cli -- ./test/fixtures/movimientos.xlsx
pnpm api start:dev                           # NestJS watch
pnpm api exec tsc --noEmit                   # TypeScript check
pnpm api exec prisma migrate dev             # migraciones

# Frontend
pnpm web dev                                 # Vite en :5173 con proxy /api → :3000
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

# MoneyDiary — Contexto para Claude Code

## ¿Qué es este proyecto?

App de finanzas personales para consolidar y analizar movimientos bancarios chilenos (Banco de Chile, BancoEstado, BCI, Santander) importados desde archivos `.xlsx`. Es simultáneamente un ejercicio de aprendizaje en buenas prácticas de ingeniería (Clean Architecture, TDD, ADRs, Agile/Scrum).

**Repositorio:** `git@github.com:Juargo/MoneyDiary.git`
**Stack:** NestJS v11 · TypeScript strict · pnpm v11 · Node.js 22+

---

## Arquitectura

**Patrón:** Monolito Modular + Clean Architecture (ver ADR-005)

```
src/
  domain/           ← Entidades, Value Objects, errores de negocio (sin dependencias externas)
  application/      ← Use Cases y Ports (interfaces). Depende solo del dominio.
  infrastructure/   ← Implementaciones concretas (HTTP, CLI, Excel). Depende de application.
  shared/           ← Result<T,E>, utilidades transversales
  composition/      ← Composition Root (placeholder, DI manual por ahora)
```

**Regla de dependencias:** `domain ← application ← infrastructure`. Nunca al revés.

**Manejo de errores:** Se usa `Result<T,E>` (en `src/shared/result.ts`) en lugar de excepciones en domain/application. Los errores de infraestructura se propagan normalmente.

---

## Decisiones Técnicas Clave (ADRs)

Los ADRs completos están en:
`~/Library/Mobile Documents/iCloud~md~obsidian/Documents/JJ - Developer/0002 EL YO CREADOR/DEV PERSONAL/MoneyDiary/Diseño/`

| ADR | Decisión |
|-----|----------|
| ADR-001 | Backend: NestJS + TypeScript |
| ADR-002 | Base de datos: PostgreSQL + Supabase + Prisma (deferred al final del Sprint 1) |
| ADR-003 | Frontend: React + TypeScript + Vite |
| ADR-004 | Hosting: Vercel + Render + GitHub Actions |
| ADR-005 | Arquitectura: Monolito Modular + Clean Architecture |
| ADR-006 | Package manager: pnpm v11+ (security by default) |
| ADR-007 | Parseo Excel: ExcelJS únicamente `.xlsx` — SheetJS descartado por CVEs en npm |

---

## Estado actual — Sprint 1 (26–30 mayo 2026)

**Sprint Goal:** Pipeline backend completo: recibir `.xlsx` → detectar banco → validar estructura → normalizar transacciones. Sin UI, sin persistencia.

### US-001 — Carga de archivo XLSX ✅ (casi completo)

Archivos implementados:
- `src/domain/value-objects/extension.ts` — solo acepta `.xlsx` (ADR-007)
- `src/domain/errors/extension-no-permitida.error.ts`
- `src/application/ports/file-reader.port.ts` — `IFileReader`
- `src/application/use-cases/ingest-file.use-case.ts` + spec (9 tests ✅)
- `src/infrastructure/http/multer-file-reader.adapter.ts`
- `src/infrastructure/http/ingesta.controller.ts` — `POST /api/ingestas`
- `src/infrastructure/http/ingesta.module.ts`
- `src/infrastructure/cli/fs-file-reader.adapter.ts`
- `src/infrastructure/cli/ingestar.ts` — script CLI (`pnpm cli -- archivo.xlsx`)

Pendiente: integration test del endpoint HTTP (Tarea 1.7).

### US-006 — Detección de banco ✅ (implementado, pendiente verificar fixtures)

Archivos implementados:
- `src/domain/value-objects/nombre-banco.ts` — `BancoConocido` enum
- `src/domain/value-objects/tipo-cuenta.ts` — `TipoCuentaConocido` enum
- `src/domain/errors/banco-no-reconocido.error.ts`
- `src/application/ports/bank-detector.port.ts` — `IBankDetector` (async)
- `src/application/use-cases/detect-bank.use-case.ts`
- `src/infrastructure/excel/excel-bank-detector.service.ts` — usa ExcelJS
- `src/infrastructure/excel/strategies/banco-chile.strategy.ts`
- `src/infrastructure/excel/strategies/banco-estado.strategy.ts`
- `src/infrastructure/excel/strategies/bci.strategy.ts`
- `src/infrastructure/excel/strategies/santander.strategy.ts`

Pendiente: correr `pnpm cli` con los fixtures `.xlsx` y confirmar detección correcta.

### Pendiente en Sprint 1

- US-002 — Validación de estructura del archivo
- US-007 — Normalización de columnas de transacciones
- Supabase/Prisma — deferred al final del sprint

---

## Fixtures de prueba

```
test/fixtures/
  Últimos_Movimientos_CuentaRUT_1778764122306.xlsx  ← BancoEstado
  movimientos.xlsx                                   ← BCI
  ultimos movimientos-Cuenta Corriente.xlsx          ← Santander
  cartola.xls          ← Banco de Chile (NO soportado — descargar como .xlsx)
  cartola_30042026.xls ← Banco de Chile (NO soportado — descargar como .xlsx)
```

---

## Comandos frecuentes

```bash
# Tests
pnpm test
pnpm test:watch

# CLI (probar pipeline sin HTTP)
pnpm cli -- ./test/fixtures/movimientos.xlsx

# Servidor de desarrollo
pnpm start:dev

# Auditoría de seguridad
pnpm audit

# TypeScript check
pnpm exec tsc --noEmit
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

## Patrones de detección bancaria (para reference)

| Banco | Celda clave | Valor |
|-------|-------------|-------|
| BancoEstado | A1 | Contiene `"CuentaRUT"` |
| Banco de Chile | B8/B9/B10 | `"Sr(a):"` / `"Rut:"` / `"Cuenta:"` |
| Santander | A2 | Comienza con `"Cuenta Corriente:"` + contiene `"0-000-"` |
| BCI | A1 + A8 | `"Últimos Movimientos"` + `"Fecha Transacción"` |

---

## Notas de seguridad

- `pnpm-workspace.yaml` tiene `overrides: uuid: >=11.1.1` (CVE en exceljs → uuid)
- `.npmrc` tiene `minimum-release-age=10080`, `audit-level=high`, `block-exotic-subdeps=true`
- SheetJS descartado (CVEs sin parche en npm) — ver ADR-007
- `pnpm approve-builds` requerido para `@nestjs/core` y `unrs-resolver` en instalación limpia

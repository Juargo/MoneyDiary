# MoneyDiary

App de finanzas personales para consolidar y analizar movimientos bancarios chilenos (Banco de Chile, BancoEstado, BCI, Santander) importados desde archivos `.xlsx`. Clasifica el gasto con el método **50/30/20** (Necesidades / Deseos / Ahorro) y responde de un vistazo *"¿estoy bien este mes?"* mediante un semáforo verde/amarillo/rojo.

Es también un ejercicio de ingeniería de software aplicada: Clean Architecture, TDD, ADRs y Scrum. La documentación de proceso (ADRs, User Stories, sprints) vive en un vault de Obsidian; la documentación técnica canónica del repo está en **[CLAUDE.md](./CLAUDE.md)**.

## Stack

- **Backend** (`apps/api`): NestJS v11 · TypeScript strict · Prisma 7 · PostgreSQL (Supabase) · ExcelJS
- **Frontend** (`apps/web`): React 19 · Vite 8 · Tailwind 4 · shadcn/ui · TanStack Query/Router · Zustand
- **Monorepo**: pnpm v11 workspaces · Node.js 22+

## Estructura

```
apps/
  api/   Backend NestJS — Clean Architecture (domain ← application ← infrastructure)
  web/   Frontend React (SPA)
```

El backend sigue Clean Architecture con manejo de errores vía `Result<T,E>` (nunca excepciones en domain/application). Detalle de arquitectura, ADRs y convenciones en [CLAUDE.md](./CLAUDE.md); modo mono-usuario y seguridad de BD en [apps/api/README.md](./apps/api/README.md).

## Estado del proyecto (julio 2026)

Pipeline backend completo y verificado end-to-end en `main`:

```
cargar → detectar banco → validar estructura → normalizar → persistir → categorizar → consolidar por mes → resumen 50/30/20 + semáforo
```

- **Sprint 1** ✅ — parseo XLSX (detección, validación, normalización) de los 4 bancos.
- **Sprint 2** ✅ — persistencia (US-011), categorización automática sin IA (US-012) y consolidación mensual (US-014). Único pendiente: cifrado de columna real (diferido como `NoOpCryptoService`).
- **Sprint 3** 🟡 en curso — **UI de visualización**. El backend de la distribución 50/30/20 (US-015) y del semáforo (US-016) ya está en `main`; falta consumirlo desde `apps/web` + el detalle de bucket (US-017).

### Endpoints principales

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/api/ingestas` | Sube un `.xlsx` y ejecuta el pipeline de ingesta |
| `GET`  | `/api/movimientos?periodo=YYYY-MM` | Movimientos consolidados del mes (multi-banco) |
| `GET`  | `/api/resumen?periodo=YYYY-MM` | Distribución 50/30/20 + semáforo por bucket |

> `periodo` ausente → mes en curso; inválido → 400. Montos serializados como string (dinero en `BigInt` para precisión exacta en CLP).

## Puesta en marcha

```bash
pnpm install                             # instala todos los workspaces
# Crea apps/api/.env con DATABASE_URL (Postgres/Supabase); DIRECT_URL es opcional
pnpm api exec prisma migrate dev         # aplica migraciones
ALLOW_DESTRUCTIVE_DB=1 pnpm api exec prisma db seed   # usuario/cuenta fijos (mono-usuario)
```

> El seed está declarado en `apps/api/prisma.config.ts` (Prisma 7: `seed: 'ts-node prisma/seed.ts'`), no en `package.json`.

## Comandos frecuentes

La raíz expone shortcuts: `pnpm api ...` → `pnpm --filter @moneydiary/api ...` (ídem `pnpm web`).

```bash
# Backend
pnpm api start:dev                        # NestJS en :3000 (watch)
pnpm api test                             # unit (sin BD)
pnpm api test:integration                 # integración contra BD real de dev
pnpm api test:e2e                         # e2e HTTP contra BD real de dev
pnpm api exec tsc --noEmit                # typecheck
pnpm api cli -- ./test/fixtures/movimientos.xlsx   # pipeline por CLI

# Frontend
pnpm web dev                              # Vite en :5173 (proxy /api → :3000)
pnpm web build

# Workspace completo
pnpm test
pnpm build
pnpm audit                                # auditoría de seguridad
```

## Seguridad

Seguridad es un foco explícito del proyecto:

- **pnpm por defecto seguro**: `minimum-release-age`, `audit-level=high`, `block-exotic-subdeps` (ver ADR-006).
- **Dinero exacto**: columnas `BigInt cargo/abono` con `CHECK ≥ 0` a nivel de BD; nunca `float`.
- **Aislamiento por usuario** (RNF-SEC-006): todo endpoint filtra estructuralmente por `userId` (`account: { userId }` en el WHERE).
- **Operaciones destructivas de BD** requieren opt-in `ALLOW_DESTRUCTIVE_DB=1` y rechazan connection strings de producción.
- **Sin fuga de datos sensibles**: los montos crudos se *scrubbean* de los mensajes de error, también en el boundary HTTP.

## Documentación

- **[CLAUDE.md](./CLAUDE.md)** — arquitectura, ADRs, convenciones, comandos y estado detallado (canónico para lo técnico del repo).
- **[apps/api/README.md](./apps/api/README.md)** — modo mono-usuario y seguridad de base de datos.
- **Vault Obsidian** — proceso (Definition of Done, sprints, User Stories, casos de uso, threat model).

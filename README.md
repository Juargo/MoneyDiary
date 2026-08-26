# MoneyDiary

App de finanzas personales para consolidar y analizar movimientos bancarios chilenos (Banco de Chile, BancoEstado, BCI, Santander) importados desde archivos `.xlsx`. Clasifica el gasto con el método **50/30/20** (Necesidades / Deseos / Ahorro) y responde de un vistazo *"¿estoy bien este mes?"* mediante un semáforo verde/amarillo/rojo.

Es también un ejercicio de ingeniería de software aplicada: Clean Architecture, TDD, ADRs y Scrum. Las decisiones de arquitectura (ADRs) viven en `docs/adr/`; el backlog (User Stories, sprints) en GitHub Issues/Milestones; la documentación técnica canónica del repo está en **[CLAUDE.md](./CLAUDE.md)**.

## Stack

- **Backend** (`apps/api`): Express · TypeScript strict · Prisma 7 · PostgreSQL (Supabase) · ExcelJS (ADR-028)
- **Frontend** (`apps/web`): React 19 · Vite 8 · Tailwind 4 · shadcn/ui · TanStack Query/Router · Zustand
- **Mobile** (`apps/mobile`): Expo SDK 57 · Expo Router · NativeWind
- **Landing** (`apps/landing`): Astro estático
- **Monorepo**: pnpm v11 workspaces · Node.js 22+

## Estructura

```
apps/
  api/       Backend Express — Clean Architecture (domain ← application ← infrastructure)
  web/       Frontend React (SPA)
  mobile/    App Expo (Expo Router)
  landing/   Landing Astro estática
```

El backend sigue Clean Architecture con manejo de errores vía `Result<T,E>` (nunca excepciones en domain/application). Detalle de arquitectura, ADRs y convenciones en [CLAUDE.md](./CLAUDE.md); modo mono-usuario y seguridad de BD en [apps/api/README.md](./apps/api/README.md).

## Estado del proyecto (agosto 2026)

**MVP v1 cerrado (30-jul-2026)** y en producción bajo dominio propio: landing en [moneydiary.cl](https://moneydiary.cl), web en `app.moneydiary.cl`, API en `api.moneydiary.cl` (Render, protegida por `x-api-key`) y mobile con builds EAS. 15 sprints cerrados, 60/63 User Stories entregadas, releases vigentes `api-v0.4.0` · `web-v0.3.0` · `mobile-v0.3.0` (25-ago).

Pipeline completo end-to-end:

```
cargar (xlsx/pdf/manual) → detectar banco → validar → normalizar → preview/commit → persistir (cifrado) → categorizar (catálogo per-user) → consolidar por mes → resumen 50/30/20 + semáforo + detalle
```

El estado vivo se deriva de [GitHub Issues](https://github.com/Juargo/MoneyDiary/issues) y [Milestones](https://github.com/Juargo/MoneyDiary/milestones); el snapshot visual está en el artefacto **Estado del proyecto** (ver [Documentación](#documentación)).

### Contrato HTTP

El contrato canónico es `apps/api/openapi.json` (contract-first, ADR-011) — se auto-bumpea en cada release del api. Endpoints principales: `POST /api/ingestas` (preview/commit), `POST /api/movimientos` (registro manual), `GET /api/resumen`, `GET /api/resumen/semaforo`, detalle mes-bucket/ingresos, y CRUD de `/api/categorias` + `/api/patrones`.

> `periodo` ausente → mes en curso; inválido → 400. Montos serializados como string (dinero en `BigInt` para precisión exacta en CLP).

## Puesta en marcha

```bash
pnpm install                             # instala todos los workspaces
# Crea apps/api/.env — en dev, DATABASE_URL/DIRECT_URL deben apuntar a Postgres local
# (ADR-029: env.ts hace fail-fast si no es localhost; Supabase es solo prod)
pnpm api db:up                           # Postgres local efímero (Docker) en :5432
pnpm api exec prisma migrate dev         # aplica migraciones
ALLOW_DESTRUCTIVE_DB=1 pnpm api exec prisma db seed   # usuario/cuenta fijos (mono-usuario)
```

> El seed está declarado en `apps/api/prisma.config.ts` (Prisma 7: `seed: 'tsx prisma/seed.ts'` — ADR-032), no en `package.json`.

## Comandos frecuentes

La raíz expone shortcuts: `pnpm api ...` → `pnpm --filter @moneydiary/api ...` (ídem `pnpm web`).

```bash
# Backend
pnpm api dev                              # Express en :3000 con watch (tsx watch — recarga al guardar)
pnpm api start                            # Express en :3000 (tsx, un solo arranque, sin watch)
pnpm api test                             # unit (sin BD)
pnpm api test:integration                 # integración contra Postgres local (.env.test; ADR-029)
pnpm api test:e2e                         # e2e HTTP contra Postgres local (.env.test; ADR-029)
pnpm api exec tsc --noEmit                # typecheck
pnpm api cli -- ./test/fixtures/movimientos-test.xlsx   # pipeline por CLI

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

Fuentes de verdad por tipo:

- **[CLAUDE.md](./CLAUDE.md)** — arquitectura, convenciones, comandos y gotchas (canónico para lo técnico del repo).
- **[docs/adr/](./docs/adr/)** — las 39 decisiones de arquitectura, un archivo por ADR + índice.
- **[GitHub Issues](https://github.com/Juargo/MoneyDiary/issues)** y **[Milestones](https://github.com/Juargo/MoneyDiary/milestones)** — backlog de User Stories y sprints (fuente de verdad del estado).
- **[openspec/](./openspec/)** — proceso SDD: specs vigentes + changes archivados.
- **[apps/api/README.md](./apps/api/README.md)** — modo mono-usuario y seguridad de base de datos.
- **[apps/api/docs/](./apps/api/docs/)** y **[docs/](./docs/)** — runbooks operativos (DB local de test, lanzamiento mobile, etc.).
- **Vault Obsidian** — solo proceso (Definition of Done, DoR, ceremonias); ya NO es fuente de verdad de ADRs/US/sprints.

### Artefactos visuales (Claude Artifacts)

Diagramas y snapshots publicados como artifacts (privados de la cuenta — se listan con `/artifacts` en Claude Code o en [claude.ai/code/artifacts](https://claude.ai/code/artifacts)). Estado al 26-ago-2026 (duplicados depurados el 25-ago); los marcados ⚠️ tienen drift y son candidatos a refrescar:

| Artefacto | Actualizado | Estado |
|-----------|-------------|--------|
| [MoneyDiary — Estado del proyecto](https://claude.ai/code/artifact/bacddba6-296e-4a98-bdb5-377eb20a6ff6) | 25-ago-2026 | ✅ al día — snapshot completo (US, sprints, releases, deuda) |
| [MoneyDiary · Flujos del proyecto](https://claude.ai/code/artifact/a53dc906-d1da-4cd2-a936-b15d3cb9924e) | 25-ago-2026 | ✅ al día — 5 diagramas Mermaid (bootstrap, dev loop, gate local, CI, release+deploy) |
| [MoneyDiary · Mapa del monorepo](https://claude.ai/code/artifact/8cba6d90-69a6-42b1-90cc-9f6c34422d92) | 26-ago-2026 | ✅ al día — qué es y para qué sirve cada directorio, regla de dependencias del api y pipeline del contrato (api-client) |
| [Ambientes — MoneyDiary](https://claude.ai/code/artifact/1ae8c209-cb4d-4c2b-b1f6-21ccb7c0b6ec) | 27-jul-2026 | ⚠️ previo a la implementación de ADR-029; refrescar contra `apps/api/src/config/env.ts` |
| [Clean Architecture — MoneyDiary (apps/api)](https://claude.ai/code/artifact/57de7fa5-cb89-48f4-9138-c9e2b8b0fe6c) | 24-jul-2026 | ⚠️ del día del merge de ADR-028; verificar que refleje `http-express/` + composition root |
| [mapa-stack](https://claude.ai/code/artifact/e55b32b8-5602-401d-bb61-b21781903380) | 23-jul-2026 | ⚠️ previo a ADR-032…039; revisar vigencia |

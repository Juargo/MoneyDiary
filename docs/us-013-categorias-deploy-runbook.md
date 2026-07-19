# US-013 Categorías — Deploy Runbook

Secuencia para llevar la cadena `feat/us-013-categorias` (S1–S6b) a producción de forma segura.
`main` **auto-deploya** la API en Render, así que la DB de prod debe tener las migraciones
aplicadas **antes** del merge a `main`.

> **Validado** (2026-07-19) contra un Postgres 17 local desechable que replica el estado real de
> prod: un **único `prisma migrate deploy`** aplica las 3 migraciones US-013 limpio y atómico;
> `db seed` idempotente; backfill correcto (invariante `categoría.bucket == bucketId`, 0 mismatches);
> int-specs `categorizacion` / `reclasificar-categoria` / `backfill-categorias` → **11/11**.

## Hechos del entorno (verificados, read-only, contra prod)
- **Hay un solo proyecto Supabase** (`cpudmeahqjiuvpqvvizg`, "MoneyDiary") y **ES prod**. No existe una dev separada. El `.env` local apunta ahí → **nunca** correr comandos destructivos con ese `.env`.
- Prod está en el estado pre-US-013 **con data real**: 20 `PatronClasificacion`, 467 `Transaccion` (367 con bucket), 3 usuarios, 5 buckets.
- Los 20 ids de patrón en prod **matchean exactamente** los del seed → la migración puente los backfillea a todos.

## ⚠️ Divergencia de tracking Prisma ↔ Supabase (reconciliación obligatoria)
`add_demo_trial_mode` (columnas `User.esDemo` / `demoCreatedAt`) **ya está aplicada físicamente** (vía Supabase CLI/MCP) pero **Prisma NO la registra** en `_prisma_migrations`. Sin reconciliar, `migrate deploy` intenta re-aplicarla y **falla** ("column already exists").

## Por qué NO hacer un `migrate deploy` a ciegas sin la migración puente
Sin la migración `20260719005000_backfill_patron_categoria` (ya en la cadena), un S1→S2 back-to-back
**falla de forma NO atómica**: S2 dropea las FK de `PatronClasificacion` **antes** de fallar por el
NOT NULL, dejando la tabla sin integridad referencial y a medio aplicar. La migración puente elimina
ese riesgo (S1 → puente → S2 corre limpio). **No aplicar S1/S2 salteando la migración puente.**

---

## 0. Pre-requisitos
- [ ] Los PRs de la cadena revisados y consolidados en el tracker (PR #86 `tracker→main`, en DRAFT).
- [ ] **Tomar un snapshot / backup de la DB de prod** (Supabase → Database → Backups / PITR) ANTES de empezar.
- [ ] Aplicar contra prod desde un entorno con el `DATABASE_URL`/`DIRECT_URL` de prod (Render env o `.env`).

## 1. Reconciliar `add_demo_trial_mode` (metadata, no toca schema)
```bash
pnpm --filter @moneydiary/api exec prisma migrate resolve \
  --applied 20260718120000_add_demo_trial_mode
pnpm --filter @moneydiary/api exec prisma migrate status   # → solo las 3 US-013 pendientes
```

## 2. Aplicar las migraciones US-013 (un solo comando, atómico)
La migración puente siembra el catálogo `Categoria` + backfillea `PatronClasificacion.categoriaId`
entre S1 y S2, así que ya NO hay pasos manuales ni seed intermedio.
```bash
pnpm --filter @moneydiary/api exec prisma migrate deploy    # S1 → puente → S2
pnpm --filter @moneydiary/api exec prisma migrate status    # → limpio, sin drift
```
Verificar: `Categoria` = 8 filas; los 20 patrones con `categoriaId` NOT NULL; `PatronClasificacion.bucketId` ya no existe.

## 3. Seed (idempotente) + backfill de transacciones
```bash
pnpm --filter @moneydiary/api exec prisma db seed           # idempotente, no-op sobre lo ya sembrado
# backfill de las ~367 transacciones con bucket (el repo usa ts-node, NO tsx):
ALLOW_DESTRUCTIVE_DB=1 pnpm --filter @moneydiary/api exec ts-node prisma/backfill-categorias.ts --dry-run
# revisar el dry-run (filas afectadas + movimiento de plata), luego:
ALLOW_DESTRUCTIVE_DB=1 pnpm --filter @moneydiary/api exec ts-node prisma/backfill-categorias.ts
```
> Nota: el backfill scope-a `categoriaId IS NULL` globalmente (todos los users) — es intencional para
> este one-shot, pero re-correrlo siempre re-evalúa las filas que quedan null por diseño (Ingreso/SinCategoría).

## 4. Verificación en prod (post-migración, pre-merge)
- [ ] `migrate status` limpio.
- [ ] Query de invariante: 0 filas donde la `categoría.bucket` ≠ `Transaccion.bucketId`.
- [ ] (Opcional) Matriz curl del endpoint `PATCH /api/transacciones/:id/categoria`: 200 propio / 404 ajeno-o-inexistente / 400 categoría desconocida.

## 5. a11y (independiente de la DB)
- [ ] Spot-check con lector de pantalla (VoiceOver/NVDA) del control de reclasificar: el `<select>` anuncia su label por fila, el `alertdialog` cross-bucket recibe foco, Escape cancela, el error se anuncia (`role="alert"`).

## 6. Merge → deploy
- [ ] Con las migraciones YA aplicadas a prod (pasos 1–3), marcar el PR **#86 "Ready for review"** y mergear `tracker → main`.
- [ ] `main` auto-deploya la API en Render con el código US-013, ya alineado con el schema de prod.
- [ ] Smoke test: dashboard → click en un bucket → detalle agrupado por categoría; reclasificar same-bucket (commit directo) y cross-bucket (confirmación); confirmar que el 50/30/20 refleja el movimiento.

## 7. Cerrar el ciclo SDD
- [ ] `sdd-archive` de `us-013-categorias` (fusiona los delta specs a `openspec/specs/` y cierra el change). Recién tiene sentido una vez mergeado a `main`.

## Gotchas operativos (de la validación)
- Correr `prisma generate` después de cada `git checkout` de branch antes de seed/migrate (cliente Prisma stale si no).
- El repo corre scripts TS con `ts-node`, **no** `tsx`.

## Rollback
- Web (S6a/S6b): revert de los commits/PR — sin cambio de datos.
- Backend: el drop de `PatronClasificacion.bucketId` (S2) es la única pérdida de columna, pero es derivable de la categoría; un rollback requeriría una migración inversa que re-derive `bucketId` desde `categoria.bucket`. `Transaccion.bucketId` nunca se perdió (siguió siendo fuente de verdad del 50/30/20). Para un rollback duro, restaurar el snapshot del paso 0.

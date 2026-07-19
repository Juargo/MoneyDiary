# US-013 Categorías — Deploy Runbook

Secuencia para llevar la cadena `feat/us-013-categorias` (7 PRs, S1–S6b) a producción de
forma segura. El riesgo concentrado está en (a) el orden de migraciones sobre una Supabase dev
**compartida** con una migración pendiente no relacionada, y (b) que `main` **auto-deploya** la
API en Render — la DB de prod debe tener las migraciones aplicadas **antes** del merge a `main`.

> Estado al escribir esto: código completo y verificado (`sdd-verify` → PASS WITH WARNINGS,
> 0 CRITICAL). api 768 · web 317 tests verde. Migraciones **hand-authored, NO aplicadas** a
> ninguna DB. Los int/e2e gated están escritos pero **no ejecutados** contra DB real.

## 0. Pre-requisitos
- [ ] Los 7 PRs de la cadena revisados (#78 S1, #79 S2, #80 S3, #81 S4, #82 S5, #83 S6a, #84 S6b).
- [ ] Acceso a una DB dev **desechable** (o rama de Supabase) para correr migraciones + int-specs
      sin tocar datos reales. NO usar la conexión de prod para las pruebas.

## 1. Reconciliar la migración pendiente no relacionada
La Supabase dev compartida tiene `20260718120000_add_demo_trial_mode` pendiente, ajena a US-013.
- [ ] Resolver su estado primero (`pnpm api exec prisma migrate status`) — aplicarla o marcarla,
      según corresponda, ANTES de las de US-013. Si `migrate status` reporta drift, resolver el drift.

## 2. Aplicar las migraciones de US-013 EN ORDEN
El orden es obligatorio: la de S2 hace `PatronClasificacion.categoriaId` NOT NULL y dropea
`bucketId`, así que **exige** que la de S1 + el seed hayan corrido antes (categoriaId poblado).

- [ ] `20260719000000_add_categoria_model` (S1 — aditiva: tabla `Categoria`, `categoriaId` nullable).
- [ ] Re-correr el seed para poblar categorías + linkear patrones:
      `pnpm --filter @moneydiary/api exec prisma db seed` (o el script de seed del repo).
- [ ] `20260719010000_drop_patron_bucketid` (S2 — dropea `PatronClasificacion.bucketId`, `categoriaId` → NOT NULL).
- [ ] `pnpm api exec prisma migrate status` → limpio, sin drift.

## 3. Backfill de transacciones existentes
Asigna `categoriaId` a filas viejas re-clasificando por patrón. Idempotente (`categoriaId IS NULL`),
gated por `ALLOW_DESTRUCTIVE_DB`, preserva ediciones manuales.

- [ ] **Dry-run** (no escribe — muestra filas afectadas + movimiento de plata entre buckets):
      `ALLOW_DESTRUCTIVE_DB=1 pnpm --filter @moneydiary/api exec tsx prisma/backfill-categorias.ts --dry-run`
- [ ] Revisar el resumen del dry-run. Si tiene sentido, correr el real (sin `--dry-run`).

## 4. Correr los tests gated contra DB real
Escritos con aserciones reales (deltas BigInt exactos, flip de umbral del semáforo, aislamiento
cross-tenant) pero **no ejecutados** este ciclo.

- [ ] `ALLOW_DESTRUCTIVE_DB=1 pnpm api test:integration` y/o `test:e2e`, cubriendo:
      `categorizacion.int-spec.ts`, `reclasificar-categoria.int-spec.ts`, `backfill-categorias.int-spec.ts`.
- [ ] Matriz curl del endpoint: `PATCH /api/transacciones/:id/categoria` — 200 propio /
      404 ajeno-o-inexistente / 400 categoría desconocida.

## 5. a11y
- [ ] Spot-check con lector de pantalla (VoiceOver/NVDA) del control de reclasificar: el `<select>`
      anuncia su label por fila, el `alertdialog` de confirmación cross-bucket recibe foco,
      Escape cancela, el error se anuncia (`role="alert"`).

## 6. Merge de la cadena
feature-branch-chain: los PRs apuntan al slice anterior; solo el tracker mergea a `main`.
- [ ] Mergear en orden hacia el tracker: #78 → #79 → #80 → #81 → #82 → #83 → #84.
      (GitHub re-apunta las bases automáticamente a medida que cada base mergea/se borra.)
- [ ] **Antes** del merge tracker→`main`: confirmar que la DB de **prod** tiene las migraciones
      de US-013 aplicadas. Verificar si el build de Render corre `prisma migrate deploy`; si NO,
      aplicarlas manualmente a prod primero. `main` auto-deploya la API — no debe deployar código
      que espera columnas que la DB de prod aún no tiene.
- [ ] Mergear tracker `feat/us-013-categorias` → `main`.

## 7. Post-deploy
- [ ] Smoke test en prod: cargar el dashboard, click en un bucket → ver el detalle agrupado por
      categoría; reclasificar una transacción same-bucket (commit directo) y cross-bucket (confirmación).
- [ ] Verificar que el 50/30/20 y el resumen anual reflejan un movimiento cross-bucket.

## 8. Cerrar el ciclo SDD
- [ ] Correr `sdd-archive` de `us-013-categorias` (fusiona los delta specs a `openspec/specs/` y
      cierra el change). Recién tiene sentido una vez mergeado a `main`.

## Rollback
- Web (S6a/S6b): revert de los PRs correspondientes — sin cambio de datos.
- Backend: el drop de `PatronClasificacion.bucketId` (S2) es la única pérdida de dato, pero es
  derivable de la categoría; un rollback requeriría una migración inversa que re-derive `bucketId`
  desde `categoria.bucket`. `Transaccion.bucketId` nunca se perdió (siguió siendo fuente de verdad).

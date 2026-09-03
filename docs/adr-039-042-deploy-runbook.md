# Runbook — aplicar migraciones pendientes a producción (US-058 / ADR-039 + ADR-042)

> ## ✅ EJECUTADO — 2026-09-02
>
> Ambas migraciones aplicadas en un solo `migrate deploy` (`17 migrations found`, las 2 pendientes
> `applied`). Verificado contra la base: `_prisma_migrations` **17 registradas, 0 sin terminar**;
> `Categoria_userId_bucketId_nombre_key` presente y `Categoria_userId_nombre_key` ausente;
> `Categoria_id_userId_key` intacto; `Transaccion.origen` presente, `ingestaId` nullable, CHECK
> `Transaccion_origen_ingesta_consistency` activo. Datos sin cambio: 508 `Transaccion`, 26 `Categoria`.
> API sana en `commit 2ed0996`.
>
> **La trampa de `DIRECT_URL` (ver abajo) es real y se confirmó en la ejecución** — el comando final
> setea ambas variables. Queda como referencia para la próxima migración.
>
> Pendiente del paso 6: rebuild del APK de mobile, y decidir si `migrate deploy` entra al
> `buildCommand` de Render.

Producción tenía **dos migraciones sin aplicar**. La API ya corría el código que las asume
(`main` auto-deploya en Render), así que la base estaba atrasada respecto del código.

| Migración | En repo desde | Estado en prod |
|---|---|---|
| `20260821000000_us058_manual_movement` | 2026-08-21 | ✅ aplicada 2026-09-02 |
| `20260901000000_categoria_unica_por_bucket` | 2026-09-02 | ✅ aplicada 2026-09-02 |

## Hechos del entorno (verificados read-only contra prod, 2026-09-02)

- Proyecto Supabase `cpudmeahqjiuvpqvvizg` ("MoneyDiary") — **es prod**, no hay dev separada.
- `_prisma_migrations`: 15 registradas, **0 sin terminar, 0 revertidas**.
- Repo: 17 migraciones. Diff contra la base: **0 en DB que no estén en repo** (sin drift peligroso),
  exactamente las 2 de arriba pendientes.
- Datos: 508 `Transaccion`, 26 `Categoria`, 3 `User`.

A diferencia del runbook de US-013, **acá no hay divergencia de tracking que reconciliar**.
Un solo `migrate deploy` aplica ambas en orden y escribe el ledger.

## Qué está roto en prod hasta que esto corra

- **Movimientos manuales (ADR-039)** — `prisma-registrar-movimiento-manual.repository.ts:99`
  escribe `origen: 'Manual'` en una columna inexistente → **500**. Roto desde el 2026-08-21.
- **`DELETE /api/movimientos/:id` (ADR-040)** — filtra por `origen: 'Manual'` → **500**.
- **Crear categoría con nombre repetido en otro bucket (ADR-042)** — el use case lo permite
  bucket-scoped, el índice viejo lo rechaza, nadie captura el P2002 → **500**.
  Antes del deploy de hoy esto devolvía un `409 NOMBRE_DUPLICADO` limpio.

**No** están afectados el dashboard, el resumen ni el detalle mes-bucket: todos sus readers
usan `select` explícito que no pide `origen`.

---

## ⚠️ La trampa: `DIRECT_URL` te puede migrar la base equivocada

`apps/api/prisma.config.ts` hace `import 'dotenv/config'` y resuelve la url así:

```ts
url: process.env.DIRECT_URL ? env('DIRECT_URL') : env('DATABASE_URL')
```

`apps/api/.env` define **`DIRECT_URL` apuntando a `localhost`** (ADR-029). dotenv no pisa lo que ya
está en el shell, pero **sí setea lo que falta**. Entonces:

```bash
# ❌ MAL — migra localhost, no prod
DATABASE_URL="<prod>" pnpm exec prisma migrate deploy
#   dotenv carga DIRECT_URL=localhost desde .env → config la prefiere → toca la base local
```

Hay que setear **`DIRECT_URL`** explícitamente. Usar la conexión **directa** (puerto 5432),
no el pooler (6543): `migrate deploy` necesita sesión no-pooleada para tomar advisory locks.

---

## 0. Pre-requisitos

- [ ] **Backup / PITR de prod** — Supabase → Database → Backups. Antes de todo.
- [ ] Connection string directa: Supabase → Settings → Database → **Connection string → URI**
      (host `db.cpudmeahqjiuvpqvvizg.supabase.co`, puerto **5432**).
- [ ] Ventana sin uso: la API sigue arriba, pero evitá escribir mientras corre.

## 1. Confirmar el estado de partida

```bash
psql "<DIRECT_URL_PROD>" -c '\d "Categoria"' | grep -i unique
psql "<DIRECT_URL_PROD>" -c '\d "Transaccion"' | grep -iE 'origen|ingestaId'
```

Esperado **antes**: `Categoria_userId_nombre_key`, sin columna `origen`, `ingestaId` NOT NULL.
Si ya ves `Categoria_userId_bucketId_nombre_key` u `origen`, **pará**: alguien las aplicó y este
runbook no aplica.

## 2. Aplicar

```bash
cd apps/api
DIRECT_URL="<DIRECT_URL_PROD>" DATABASE_URL="<DIRECT_URL_PROD>" \
  pnpm exec prisma migrate deploy
```

Ambas variables al mismo valor: `DIRECT_URL` es la que manda, `DATABASE_URL` se setea por si
alguna ruta la lee. Esperado: `2 migrations found`, ambas `applied`.

## 3. Verificar

```bash
psql "<DIRECT_URL_PROD>" -c '\d "Categoria"'    | grep -i unique
psql "<DIRECT_URL_PROD>" -c '\d "Transaccion"'  | grep -iE 'origen|ingestaId|consistency'
psql "<DIRECT_URL_PROD>" -c 'SELECT migration_name, finished_at FROM "_prisma_migrations" ORDER BY started_at DESC LIMIT 2;'
```

Esperado **después**:

- `Categoria_userId_bucketId_nombre_key` presente, `Categoria_userId_nombre_key` ausente.
- `Categoria_id_userId_key` **sigue ahí** (FK compuesta de ADR-036 — si desapareció, algo salió mal).
- `Transaccion.origen` text nullable, `ingestaId` nullable, CHECK `Transaccion_origen_ingesta_consistency`.
- Las 2 migraciones con `finished_at` no nulo.

Smoke funcional (sesión web real):

- [ ] Crear una categoría con un nombre que ya exista en **otro** bucket → **201**, no 409 ni 500.
- [ ] Crear una con nombre repetido en **el mismo** bucket → **409 `NOMBRE_DUPLICADO`**.
- [ ] Registrar un movimiento manual → **201**.
- [ ] Borrar ese movimiento manual → **204**.
- [ ] Reclasificar una transacción → OK (esto ya funcionaba: es código, no depende del índice).

## 4. Por qué es seguro

**US-058** — las tres sentencias son aditivas o de relajación:
`ALTER COLUMN ingestaId DROP NOT NULL` (widening puro), `ADD COLUMN origen TEXT` (nullable, sin
backfill) y el CHECK de paridad. El CHECK no puede fallar sobre los datos actuales: las 508 filas
tienen `ingestaId` NOT NULL (**0 con `ingestaId IS NULL`**, verificado), y tras el `ADD COLUMN`
todas tienen `origen = NULL`, así que la invariante evalúa `false = false` → true en todas.

**ADR-042** — `DROP INDEX` + `CREATE UNIQUE INDEX` sobre un superconjunto de columnas. Como
`(userId, nombre)` es único hoy, ninguna fila puede violar `(userId, bucketId, nombre)`. Verificado
igual por las dudas: **0 colisiones** en el índice nuevo. Sin backfill, sin tocar datos.
El **orden de columnas es load-bearing**: determina el nombre del selector compuesto que genera
Prisma (`userId_bucketId_nombre`) y debe coincidir con `schema.prisma`.

## 5. Rollback

Ninguna de las dos borra datos, así que revertir es DDL inverso:

```sql
-- ADR-042
DROP INDEX "Categoria_userId_bucketId_nombre_key";
CREATE UNIQUE INDEX "Categoria_userId_nombre_key" ON "Categoria" ("userId", "nombre");

-- US-058 (solo si no se creó ningún movimiento manual todavía)
ALTER TABLE "Transaccion" DROP CONSTRAINT "Transaccion_origen_ingesta_consistency";
ALTER TABLE "Transaccion" DROP COLUMN "origen";
ALTER TABLE "Transaccion" ALTER COLUMN "ingestaId" SET NOT NULL;
```

Más borrar las 2 filas de `_prisma_migrations`, o el próximo `migrate deploy` las saltea.

⚠️ El rollback de US-058 **falla si ya existe un movimiento manual** (`ingestaId IS NULL`):
el `SET NOT NULL` no puede volver atrás. A partir del primer movimiento manual creado en prod,
el camino de vuelta es restaurar el backup del paso 0.

## 6. Después

- [ ] **Rebuildear y reinstalar el APK de mobile** (ADR-022). El cutover de ADR-042 es duro: un APK
      instalado que siga mandando `{ categoria: nombre }` recibe **400** al reclasificar.
- [ ] Considerar agregar `prisma migrate deploy` al `buildCommand` de Render, o dejar asentado que
      el paso es manual. Que US-058 haya vivido 12 días sin aplicarse salió de acá.

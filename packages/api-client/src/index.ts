/**
 * Public surface of `@moneydiary/api-client`. Types only — no runtime code
 * (functions, classes, values) is exported from this package by design (see
 * `package.json`'s `exports` map: `types` condition only, no `default`/
 * `import`). Consumers compile the source directly; there is no build step
 * (ADR-012 amendment, 2026-08-XX note).
 *
 * `paths`/`components`/`operations` stay exported: a future runtime client
 * needs `paths`, and an app that wants a shape the alias layer below does
 * not name can index `components['schemas'][...]` directly without a
 * package change.
 *
 * The DTO aliases below are the single source of the mapping "the wire
 * schema X is what the apps call Y" — previously duplicated by hand in
 * `apps/web/src/api/types.ts` and mobile's `src/domain/resumen.types.ts` /
 * `src/api/*.ts`. Every alias MUST be a one-line indexed access into
 * `components['schemas']`: no re-declared fields, no widening/narrowing of
 * the wire shape. A mismatch with an app's expectation is resolved in the
 * app, never by editing an alias here (design.md "Decision").
 */
export type { paths, components, operations } from './types.gen';

import type { components } from './types.gen';

type S = components['schemas'];

/** GET /api/resumen — 50/30/20 monthly breakdown. Money as decimal strings (BigInt-safe). */
export type ResumenMesDto = S['ResumenMesResponse'];

/** One bucket entry inside `ResumenMesDto.buckets` (Necesidades/Deseos/Ahorro/SinCategoria). */
export type BucketResumenDto = S['ResumenMesResponse']['buckets'][number];

/** GET /api/resumen/anual — 50/30/20 annual breakdown; `meses` reuses `ResumenMesDto` (DRY). */
export type ResumenAnualDto = S['ResumenAnualResponse'];

/** GET /api/buckets/:bucket — bucket drill-down. */
export type DetalleBucketDto = S['DetalleBucketResponse'];

/** GET /api/buckets/:bucket/detalle — month×bucket detail grouped by category (US-051/US-053). Money as decimal strings (BigInt-safe). */
export type DetalleBucketMesDto = S['BucketDetalleMesResponse'];

/** One category group inside `DetalleBucketMesDto.grupos` — es-CL alphabetical, "Sin categoría" last (server-ordered, MBD-02). */
export type GrupoDetalleBucketMesDto = S['BucketDetalleMesResponse']['grupos'][number];

/** One transaction row inside `GrupoDetalleBucketMesDto.transacciones`. Money as decimal strings. */
export type TransaccionDetalleBucketMesDto = S['BucketDetalleMesResponse']['grupos'][number]['transacciones'][number];

/** One transaction row inside `DetalleBucketDto.transacciones`. Money as decimal strings. */
export type DetalleBucketTransaccionDto = S['DetalleBucketResponse']['transacciones'][number];

/** GET /api/ingresos/mes — monthly income list by origin (US-052/US-054): header total, count, and ALL transactions (MID-01). Money as decimal strings (BigInt-safe). */
export type IngresosMesDto = S['IngresosMesResponse'];

/** One transaction row inside `IngresosMesDto.transacciones`. Money as decimal strings. */
export type TransaccionIngresosMesDto = S['IngresosMesResponse']['transacciones'][number];

/** GET /api/auth/me — the authenticated user identity. `esDemo` accounts have `email: null`. */
export type MeDto = S['AuthMeResponse'];

/** PATCH /api/transacciones/:id/categoria — manual reclassification result. */
export type ReclasificarCategoriaDto = S['TransaccionesCategoriaResponse'];

/** POST /api/ingestas — successful upload result. */
export type IngestaResponseDto = S['IngestaUploadResponse'];

/** One transaction row inside `IngestaResponseDto.transacciones`. Money as decimal strings. */
export type TransaccionResponseDto = S['IngestaUploadResponse']['transacciones'][number];

/** One entry inside `GET /api/ingestas`'s `ingestas` list. */
export type IngestaListItemDto = S['IngestasListResponse']['ingestas'][number];

/** GET /version — deployed build info for the API. */
export type ApiVersionDto = S['VersionResponse'];

/** GET /api/auth/capabilities — feature-activation discovery (web + mobile Google login gates). */
export type AuthCapabilitiesDto = S['AuthCapabilitiesResponse'];

/**
 * POST /api/ingestas/preview — dry-run of a would-be upload.
 *
 * BACKWARD-COMPATIBLE (product decision 2026-08-21): carries BOTH the canonical
 * US-057 shape (`resumen` + `filas`, optional at the type level so legacy client
 * literals stay assignable) and the deprecated legacy shape (`estructura` +
 * `muestra`, removed by US-061). The server always emits both.
 */
export type PreviewIngestaDto = S['PreviewIngestaResponse'];

/**
 * One row inside the deprecated `PreviewIngestaDto.muestra` (legacy 4-field
 * shape). Money as decimal strings. @deprecated read `PreviewIngestaDto.filas`
 * for the canonical per-row shape (rowIndex/esDuplicado/sugerido); removed by
 * US-061. Aliased to the legacy row so shipped clients keep typechecking.
 */
export type PreviewTransaccionDto = S['PreviewIngestaResponse']['muestra'][number];

/**
 * One row inside the canonical `PreviewIngestaDto.filas` (US-057): full per-row
 * dedup status + classification suggestion. Money as decimal strings.
 */
export type PreviewFilaDto = NonNullable<
  S['PreviewIngestaResponse']['filas']
>[number];

/** POST /api/ingestas/commit — commit result: persisted ingesta + per-row summary (US-057, CMT-05). */
export type CommitIngestaDto = S['CommitIngestaResponse'];

/** POST /api/auth/login — successful authentication (mobile). */
export type LoginResponseDto = S['AuthLoginResponse'];

/** GET /api/resumen/semaforo — semáforo detail (US-049). Money as decimal strings (BigInt-safe). */
export type SemaforoDetalleDto = S['SemaforoDetalleResponse'];

/** One bucket entry inside `SemaforoDetalleDto.buckets` (Necesidades/Deseos/Ahorro, always exactly 3). */
export type SemaforoBucketDetalleDto = S['SemaforoDetalleResponse']['buckets'][number];

/** GET /api/categorias — the authenticated caller's full classification catalog (US-038/US-044). */
export type CatalogoDto = S['CatalogoResponse'];

/** One category inside `CatalogoDto.categorias`, with nested patterns + all-history `transaccionesCount`. */
export type CategoriaDto = S['CategoriaResponse'];

/** One classification pattern (`POST`/`PATCH /api/patrones` response, also nested inside `CategoriaDto.patrones`). */
export type PatronDto = S['PatronResponse'];

/** POST /api/movimientos — registered manual movement (US-058). Money as decimal strings (BigInt-safe). */
export type RegistrarMovimientoManualDto = S['RegistrarMovimientoManualResponse'];

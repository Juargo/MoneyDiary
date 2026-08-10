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

/** One transaction row inside `DetalleBucketDto.transacciones`. Money as decimal strings. */
export type DetalleBucketTransaccionDto = S['DetalleBucketResponse']['transacciones'][number];

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

/** POST /api/ingestas/preview — dry-run sample of a would-be upload. */
export type PreviewIngestaDto = S['PreviewIngestaResponse'];

/** One transaction row inside `PreviewIngestaDto.muestra`. Money as decimal strings. */
export type PreviewTransaccionDto = S['PreviewIngestaResponse']['muestra'][number];

/** POST /api/auth/login — successful authentication (mobile). */
export type LoginResponseDto = S['AuthLoginResponse'];

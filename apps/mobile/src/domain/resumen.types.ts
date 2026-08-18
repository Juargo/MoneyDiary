/**
 * Type aliases over `@moneydiary/api-client`'s generated DTOs (ADR-012 slice
 * — see `packages/api-client/src/index.ts` for the "why" behind the alias
 * layer). Previously a hand-written mirror of the backend HTTP DTO; the
 * mechanical link to the OpenAPI contract now lives in the package.
 *
 * Money fields stay as decimal strings (BigInt-serialized, SC-06) — never
 * parsed to number here. `porcentajeBp` is a safe JS number (basis points,
 * ≤ 10000, far below 2^53).
 */
export type {
  BucketResumenDto,
  ResumenMesDto,
  ResumenAnualDto,
} from '@moneydiary/api-client';

/**
 * Mirror of `GET /api/auth/me`'s success body (MOB-04). `esDemo` and a
 * nullable `email` are new required/widened fields gained from the package's
 * `AuthMeResponse` — `esMeDto` (client.ts) now accepts `email: string | null`
 * per the wire contract, so a demo account resolves correctly. Previously
 * tracked debt (design.md "Mobile" adoption mapping), closed by US-044 PR1.
 */
export type { MeDto } from '@moneydiary/api-client';

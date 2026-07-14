/**
 * Hand-written mirror of the backend HTTP DTO (ADR-011/012 note: a formal
 * `@moneydiary/api-client` is deferred — see design.md D2 and tasks.md
 * "Tracked debt"). Source of truth on the backend:
 * `apps/api/src/infrastructure/http/dto/resumen-mes.dto.ts`.
 *
 * Money fields stay as decimal strings (BigInt-serialized, SC-06) — never
 * parsed to number here. `porcentajeBp` is a safe JS number (basis points,
 * ≤ 10000, far below 2^53).
 */

export interface BucketResumenDto {
  readonly bucket: string;
  readonly total: string;
  readonly porcentajeBp: number | null;
  readonly estadoSemaforo: string | null;
}

export interface ResumenMesDto {
  readonly periodo: string;
  readonly totalIngreso: string;
  readonly sinIngreso: boolean;
  readonly buckets: ReadonlyArray<BucketResumenDto>;
  readonly targets: {
    readonly Necesidades: number;
    readonly Deseos: number;
    readonly Ahorro: number;
  };
  readonly estadoGlobal: string | null;
}

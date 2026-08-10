/**
 * Compile-time pin on money-bearing fields (AC-04): each MUST resolve to
 * `string` (BigInt-safe decimal string), never `number`. There is no test
 * runner in this package (design.md "no test runner is added — `tsc` is
 * the gate") — `pnpm api-client typecheck` compiling this file green IS the
 * assertion. A backend change that widens a money field to `number` fails
 * this file to compile, which fails the `api-client` CI job.
 *
 * Exported (not local consts) as convention-consistency with the apps'
 * stricter compiler settings (`noUnusedLocals` in apps/web); this package's
 * own tsconfig does not enable that flag today.
 */
import type {
  ResumenMesDto,
  BucketResumenDto,
  DetalleBucketTransaccionDto,
  TransaccionResponseDto,
  PreviewTransaccionDto,
} from './index';
import type { components } from './types.gen';

type Assert<T extends true> = T;
type Eq<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

export type _TotalIngresoIsString = Assert<Eq<ResumenMesDto['totalIngreso'], string>>;
export type _BucketTotalIsString = Assert<Eq<BucketResumenDto['total'], string>>;
export type _CargoIsString = Assert<Eq<DetalleBucketTransaccionDto['cargo'], string>>;
export type _AbonoIsString = Assert<Eq<DetalleBucketTransaccionDto['abono'], string>>;
export type _IngestaCargoIsString = Assert<Eq<TransaccionResponseDto['cargo'], string>>;
export type _IngestaAbonoIsString = Assert<Eq<TransaccionResponseDto['abono'], string>>;
export type _PreviewCargoIsString = Assert<Eq<PreviewTransaccionDto['cargo'], string>>;
export type _PreviewAbonoIsString = Assert<Eq<PreviewTransaccionDto['abono'], string>>;
// No public alias added to index.ts — no client consumes movimientos yet (YAGNI).
export type _MovimientosCargoIsString = Assert<
  Eq<components['schemas']['MovimientosMesResponse']['transacciones'][number]['cargo'], string>
>;
export type _MovimientosAbonoIsString = Assert<
  Eq<components['schemas']['MovimientosMesResponse']['transacciones'][number]['abono'], string>
>;

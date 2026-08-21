/**
 * GrupoMovimientosMobile — stub (RED, US-056 T-10).
 * Production implementation lands in T-11.
 * This stub intentionally throws so NO test case can pass.
 */
import type { GrupoDetalleBucketMesDto } from '../../domain/detalle.types';

interface GrupoMovimientosMobileProps {
  readonly grupo: GrupoDetalleBucketMesDto;
  readonly destacar?: string;
  readonly onReclasificado?: () => void;
  readonly onMovida?: (bucketLabel: string) => void;
}

export function GrupoMovimientosMobile(
  _props: GrupoMovimientosMobileProps,
): never {
  throw new Error('GrupoMovimientosMobile: not implemented (RED stub T-10)');
}

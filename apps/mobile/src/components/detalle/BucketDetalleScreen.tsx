/**
 * BucketDetalleScreen — stub (RED, US-056 T-10).
 * Production implementation lands in T-12.
 * This stub intentionally throws so NO test case can pass.
 */

interface BucketDetalleScreenProps {
  readonly bucket: string;
  readonly destacar?: string;
  readonly periodo?: string;
  readonly onChangePeriodo: (periodo: string) => void;
  readonly onBack: () => void;
  readonly onMovida?: (bucketLabel: string) => void;
}

export function BucketDetalleScreen(_props: BucketDetalleScreenProps): never {
  throw new Error('BucketDetalleScreen: not implemented (RED stub T-10)');
}

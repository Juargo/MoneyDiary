/**
 * IngresosMesScreen — RED stub (US-056, T-16).
 * Every export throws so all spec cases fail RED (import/no-unresolved resolves,
 * but runtime always throws — PR3 T-10 throwing-stub pattern).
 * Replaced by real implementation in T-17 (GREEN).
 */

export function IngresosMesScreen(_props: {
  periodo?: string;
  onChangePeriodo: (periodo: string) => void;
  onBack: () => void;
}): never {
  throw new Error('IngresosMesScreen: RED stub — not implemented yet (T-17)');
}

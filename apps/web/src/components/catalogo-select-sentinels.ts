/**
 * Shared sentinel options for the bucket→categoría cascade selects (used by
 * `FilaRevision`'s per-row cascade and `PreviewMuestra`'s bulk-apply toolbar
 * cascade — same UI language, same leading "no selection" option). Kept in
 * their own module (not re-exported from `FilaRevision.tsx`) so this stays a
 * component-only file for React Fast Refresh.
 */
export const SENTINEL_OPTION = { value: '', label: 'Sin categoría' } as const;
export const BUCKET_SENTINEL_OPTION = {
  value: '',
  label: 'Seleccionar bucket',
} as const;

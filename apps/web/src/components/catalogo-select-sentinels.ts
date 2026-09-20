/**
 * Shared sentinel options for the bucket→categoría cascade selects (used by
 * `FilaRevision`'s per-row cascade and `PreviewMuestra`'s bulk-apply toolbar
 * cascade — same UI language, same leading "no selection" option). Kept in
 * their own module (not re-exported from `FilaRevision.tsx`) so this stays a
 * component-only file for React Fast Refresh.
 *
 * 2026-09-06: `BUCKET_SENTINEL_OPTION` is back. It was removed on 2026-08-30
 * when the per-row bucket control became `SelectorBucket` (a segmented
 * control of native radios, which built its own leading option); that
 * control has since been reverted to a plain `<select>`, so the leading
 * sentinel option lives here again.
 */
export const SENTINEL_OPTION = { value: '', label: 'Sin categoría' } as const;
export const BUCKET_SENTINEL_OPTION = {
  value: '',
  label: 'Seleccionar grupo',
} as const;

/**
 * Shared sentinel option for the categoría cascade selects (used by
 * `FilaRevision`'s per-row cascade and `PreviewMuestra`'s bulk-apply toolbar
 * cascade — same UI language, same leading "no selection" option). Kept in
 * its own module (not re-exported from `FilaRevision.tsx`) so this stays a
 * component-only file for React Fast Refresh.
 *
 * 2026-08-30: `BUCKET_SENTINEL_OPTION` (formerly here, for the per-row
 * bucket `<select>`) was removed — the bucket control is now
 * `SelectorBucket`, a segmented control that builds its own leading
 * "Sin categoría" option internally.
 */
export const SENTINEL_OPTION = { value: '', label: 'Sin categoría' } as const;

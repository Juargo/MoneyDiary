import { createFileRoute, Outlet } from '@tanstack/react-router';
import { ConfiguracionLayout } from '@/components/configuracion/ConfiguracionLayout';

type ConfiguracionSearch = { readonly google?: 'vinculado' | 'error' };

/**
 * `/configuracion` — now a LAYOUT route (US-043 design.md §1/Q1a/Q1c),
 * shared by the Perfil leaf (`configuracion.index.tsx`) and the Categorías
 * list leaf (`configuracion.categorias.tsx`); the edit leaf
 * (`configuracion_.categorias.$categoriaId.tsx`) deliberately escapes this
 * layout via the trailing-underscore mechanism verified in design.md §1/Q1b.
 *
 * `validateSearch` STAYS here (Q1c) — the shipped WCFG-05 scenarios target
 * this exact route id, and moving the schema to the index leaf would force
 * rewriting them for no gain. The `?google=` read/clean effect that used to
 * live in this file moved to `configuracion.index.tsx` (task 7): it
 * describes Perfil's landing, not the section shell.
 */
export const Route = createFileRoute('/_authenticated/configuracion')({
  validateSearch: (search: Record<string, unknown>): ConfiguracionSearch => {
    const valor = search.google;
    return valor === 'vinculado' || valor === 'error' ? { google: valor } : {};
  },
  component: ConfiguracionRoute,
});

/**
 * Thin container (`buckets.$bucket.tsx:12-18` precedent, design.md §1/Q1f):
 * hands off to `ConfiguracionLayout`, which owns the shared `Configuración`
 * h1, the fluid grid, and `ConfiguracionTabs`. `<Outlet/>` renders whichever
 * leaf route matched.
 */
function ConfiguracionRoute() {
  return (
    <ConfiguracionLayout>
      <Outlet />
    </ConfiguracionLayout>
  );
}

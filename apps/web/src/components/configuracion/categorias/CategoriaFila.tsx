import { Link } from '@tanstack/react-router';
import { Pencil, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CategoriaDto } from '@/api/types';
import { etiquetaPatrones } from './plural';
import { CLASE_BOTON_ICONO } from './estilos';

/**
 * CategoriaFila (US-043, design.md §1/Q10a mecanismo 2, §1/Q10c, WCTG-02,
 * WCTG-03, WCTG-11, WCTG-13): una fila de `/configuracion/categorias`.
 *
 * `min-w-0 truncate` en la celda del nombre, dentro de una fila `flex
 * flex-wrap items-center gap-2` (Q10a mecanismo 2 — el mecanismo 1,
 * `min-w-0` en la pista de contenido, ya vive en `ConfiguracionLayout`).
 *
 * Editar es un `<Link>` REAL a `/configuracion/categorias/$categoriaId`
 * (navegación, no una acción destructiva) — el `aria-label` desambiguado
 * incluye el nombre de la categoría, precedente `EliminarIngestaControl:122`:
 * una lista de botones-icono idénticos es inutilizable por lector de
 * pantalla sin nombres por fila. Eliminar es un `<button>` que por ahora NO
 * tiene diálogo cableado (eso es PR #5, task 44/47) — inerte esta PR, sin
 * `onClick`. Ambos llevan `CLASE_BOTON_ICONO` (usos 1/3 y 2/3 del
 * three-strike rule, Q10c).
 *
 * Eliminar se deshabilita PROACTIVAMENTE en una sesión demo (WCTG-11); el
 * `Link` de editar sigue activo — el catálogo de un demo sigue siendo
 * navegable de solo lectura (segundo escenario de WCTG-11).
 */
export function CategoriaFila({
  categoria,
  esDemo,
}: {
  readonly categoria: CategoriaDto;
  readonly esDemo: boolean;
}) {
  return (
    <li className="flex flex-wrap items-center gap-2 border-b border-border py-3 last:border-b-0">
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
        {categoria.nombre}
      </span>
      <span className="shrink-0 text-xs text-muted-foreground">
        {etiquetaPatrones(categoria.patrones.length)}
      </span>
      <Link
        to="/configuracion/categorias/$categoriaId"
        params={{ categoriaId: categoria.id }}
        aria-label={`Editar categoría ${categoria.nombre}`}
        className={CLASE_BOTON_ICONO}
      >
        <Pencil aria-hidden="true" className="size-[18px]" />
      </Link>
      <button
        type="button"
        disabled={esDemo}
        aria-label={`Eliminar categoría ${categoria.nombre}`}
        className={cn(
          CLASE_BOTON_ICONO,
          'text-destructive disabled:cursor-not-allowed disabled:opacity-50',
        )}
      >
        <Trash2 aria-hidden="true" className="size-[18px]" />
      </button>
    </li>
  );
}

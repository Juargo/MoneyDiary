import { useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Pencil, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CategoriaDto } from '@/api/types';
import { useEliminarCategoria } from '@/api/use-eliminar-categoria';
import { etiquetaPatrones } from './plural';
import { CLASE_BOTON_ICONO } from './estilos';
import { ConfirmarImpactoDialog } from './ConfirmarImpactoDialog';
import { fraseDeImpacto, mensajeDeErrorCatalogo } from './mensajes-catalogo';

/**
 * CategoriaFila (US-043, design.md §1/Q10a mecanismo 2, §1/Q10c, §1/Q6d,
 * WCTG-02, WCTG-03, WCTG-08, WCTG-11, WCTG-13): una fila de
 * `/configuracion/categorias`.
 *
 * `min-w-0 truncate` en la celda del nombre, dentro de una fila `flex
 * flex-wrap items-center gap-2` (Q10a mecanismo 2 — el mecanismo 1,
 * `min-w-0` en la pista de contenido, ya vive en `ConfiguracionLayout`).
 *
 * Editar es un `<Link>` REAL a `/configuracion/categorias/$categoriaId`
 * (navegación, no una acción destructiva) — el `aria-label` desambiguado
 * incluye el nombre de la categoría, precedente `EliminarIngestaControl:122`:
 * una lista de botones-icono idénticos es inutilizable por lector de
 * pantalla sin nombres por fila. Ambos llevan `CLASE_BOTON_ICONO` (usos 1/3
 * y 2/3 del three-strike rule, Q10c).
 *
 * **El segundo punto de entrada de borrado** (§1/Q6d, task 44, WCTG-08 — el
 * primero es el footer de `EditarCategoria`, PR #3b): eliminar abre el
 * MISMO `ConfirmarImpactoDialog` con `fraseDeImpacto({tipo:'eliminar', …})`
 * y llama al MISMO `useEliminarCategoria()`. La única diferencia frente a la
 * pantalla de edición: al confirmar, esta fila NO navega — solo cierra su
 * propio diálogo; la fila desaparece de la lista vía la invalidación de
 * perfil B que la misma mutación ya dispara. `transaccionesCount` viene del
 * DTO YA CARGADO en esta fila (decisión 3) — nunca un fetch nuevo.
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
  const eliminacion = useEliminarCategoria();
  const [dialogoAbierto, setDialogoAbierto] = useState(false);
  const eliminarRef = useRef<HTMLButtonElement>(null);

  function abrirEliminar() {
    // `.reset()` al abrir (precedente `EliminarIngestaControl.tsx:90-93`,
    // reusado también en `EditarCategoria.tsx`): sin esto, un error residual
    // de un intento fallido anterior se filtraría al diálogo recién abierto.
    eliminacion.reset();
    setDialogoAbierto(true);
  }

  function confirmarEliminar() {
    eliminacion.mutate(categoria.id, {
      onSuccess: () => {
        setDialogoAbierto(false);
      },
    });
  }

  function cerrarDialogo() {
    // `ConfirmarImpactoDialog.cancelar()` ya bloquea Escape/Cancelar
    // mientras `pendiente` es verdadero, así que esta función nunca corre
    // con un DELETE en vuelo — no necesita su propio guard adicional.
    setDialogoAbierto(false);
    eliminarRef.current?.focus();
  }

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
        ref={eliminarRef}
        type="button"
        disabled={esDemo || eliminacion.isPending}
        onClick={abrirEliminar}
        aria-label={`Eliminar categoría ${categoria.nombre}`}
        className={cn(
          CLASE_BOTON_ICONO,
          'text-destructive disabled:cursor-not-allowed disabled:opacity-50',
        )}
      >
        <Trash2 aria-hidden="true" className="size-[18px]" />
      </button>
      {dialogoAbierto && (
        <div className="w-full">
          <ConfirmarImpactoDialog
            {...fraseDeImpacto({
              tipo: 'eliminar',
              nombre: categoria.nombre,
              transaccionesCount: categoria.transaccionesCount,
            })}
            pendiente={esDemo || eliminacion.isPending}
            error={
              eliminacion.isError
                ? mensajeDeErrorCatalogo(eliminacion.error)
                : null
            }
            onConfirmar={confirmarEliminar}
            onCancelar={cerrarDialogo}
          />
        </div>
      )}
    </li>
  );
}

import { useEffect, useId, useRef, useState } from 'react'
import { useReclasificarCategoria } from '@/api/use-reclasificar-categoria'
import { agruparCategoriasPorBucket, CATEGORIA_BUCKET } from '@/domain/categoria'
import { ETIQUETA_BUCKET } from '@/lib/bucket-colors'

const GRUPOS_CATEGORIA = agruparCategoriasPorBucket()

function etiqueta(bucket: string): string {
  return ETIQUETA_BUCKET[bucket] ?? bucket
}

/**
 * ReclasificarCategoriaControl — el `<select>` por fila que reemplaza los
 * placeholders deshabilitados "Editar categoría"/"Clasificar" (US-013 S6b,
 * WCAT-04/05, T6.0 decision). Un único control cubre AMBOS casos (reclasificar
 * una fila ya categorizada, o asignar categoría a una fila SinCategoria) —
 * mismo mecanismo, `categoriaActual` simplemente llega `null` en el segundo
 * caso (design.md §7.3, DRY: no dos controles distintos).
 *
 * Ofrece las 8 categorías agrupadas por bucket vía `<optgroup>` (T6.0:
 * cross-bucket permitido, decisión confirmada explícitamente por el usuario
 * antes de esta implementación — la alternativa "solo mismo bucket" fue
 * descartada porque el caso de uso principal de reclasificar ES corregir un
 * bucket equivocado). Si la categoría elegida deriva a un bucket DISTINTO del
 * bucket actual de la fila, se pide confirmación mostrando el monto que se
 * mueve (money-move visible) ANTES de comprometer el cambio; mismo-bucket
 * commitea directo. `CATEGORIA_BUCKET` (mirror web de
 * `apps/api/src/domain/value-objects/categoria.ts`, ADR-008) es la única
 * fuente de verdad para esa comparación — nunca se acepta un bucket
 * independiente del cliente.
 *
 * a11y (ADR-018, WCAT-05): `<label htmlFor>` visualmente oculto pero con
 * nombre accesible real ("Cambiar categoría de {descripcion}", no un genérico
 * "Editar categoría" sin contexto); la confirmación es un `role="alertdialog"`
 * con foco movido a "Confirmar" al abrirse y devuelto al `<select>` al
 * cancelar — operable enteramente por teclado (botones nativos, sin ARIA de
 * dropdown custom). El control se DESHABILITA (no se oculta) mientras la
 * mutación está en curso.
 */
export function ReclasificarCategoriaControl({
  transaccionId,
  descripcion,
  montoLabel,
  bucketActual,
  categoriaActual,
  periodo,
}: {
  readonly transaccionId: string
  readonly descripcion: string
  readonly montoLabel: string
  readonly bucketActual: string
  readonly categoriaActual: string | null
  readonly periodo: string | undefined
}) {
  const selectId = useId()
  const selectRef = useRef<HTMLSelectElement>(null)
  const confirmarRef = useRef<HTMLButtonElement>(null)
  const [valor, setValor] = useState(categoriaActual ?? '')
  const [pendiente, setPendiente] = useState<{ nombre: string; bucketNuevo: string } | null>(null)
  const [errorMensaje, setErrorMensaje] = useState<string | null>(null)
  const mutacion = useReclasificarCategoria(periodo, bucketActual)

  // Foco al abrir la confirmación (WCAT-05): mueve el foco a "Confirmar" en
  // vez de dejarlo huérfano en el <select> que acaba de disparar `onChange`
  // — un usuario de teclado necesita saber que apareció un diálogo antes de
  // seguir tabulando.
  useEffect(() => {
    if (pendiente) {
      confirmarRef.current?.focus()
    }
  }, [pendiente])

  function commit(nombre: string) {
    setErrorMensaje(null)
    mutacion.mutate(
      { transaccionId, categoria: nombre },
      {
        onError: (error) => {
          setErrorMensaje(error.message)
          setValor(categoriaActual ?? '')
        },
      },
    )
  }

  function alCambiar(event: React.ChangeEvent<HTMLSelectElement>) {
    const nombre = event.target.value
    // Clear any stale pending confirmation FIRST: a new selection always
    // supersedes a previous, unconfirmed cross-bucket dialog — otherwise the
    // old dialog stays on screen referencing a categoría the user no longer
    // has selected, and confirming it fires a PATCH for the wrong value
    // (network race between "pick B" and "confirm A").
    setPendiente(null)
    setValor(nombre)
    setErrorMensaje(null)
    const bucketNuevo = CATEGORIA_BUCKET[nombre]
    if (bucketNuevo === bucketActual) {
      commit(nombre)
      return
    }
    setPendiente({ nombre, bucketNuevo })
  }

  function confirmar() {
    if (!pendiente) return
    commit(pendiente.nombre)
    setPendiente(null)
  }

  function cancelar() {
    setPendiente(null)
    setValor(categoriaActual ?? '')
    selectRef.current?.focus()
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <label htmlFor={selectId} className="sr-only">
        Cambiar categoría de {descripcion}
      </label>
      <select
        id={selectId}
        ref={selectRef}
        value={valor}
        disabled={mutacion.isPending}
        onChange={alCambiar}
        className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {categoriaActual === null && (
          <option value="" disabled>
            Sin categoría
          </option>
        )}
        {GRUPOS_CATEGORIA.map((grupo) => (
          <optgroup key={grupo.bucket} label={etiqueta(grupo.bucket)}>
            {grupo.categorias.map((nombre) => (
              <option key={nombre} value={nombre}>
                {nombre}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <span aria-live="polite" className="sr-only">
        {mutacion.isSuccess && !pendiente ? `Categoría actualizada a ${mutacion.data?.categoria.nombre}.` : ''}
      </span>
      {errorMensaje && (
        <p role="alert" className="text-xs text-red-600">
          {errorMensaje}
        </p>
      )}
      {pendiente && (
        <div
          role="alertdialog"
          aria-label="Confirmar cambio de categoría"
          className="flex flex-col gap-2 rounded-lg border border-slate-300 bg-white p-3 text-xs text-slate-700 shadow-sm"
        >
          <p>
            Esto mueve {montoLabel} de {etiqueta(bucketActual)} a {etiqueta(pendiente.bucketNuevo)}.
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={cancelar}
              className="rounded-full border border-slate-300 px-3 py-1 font-semibold text-slate-600"
            >
              Cancelar
            </button>
            <button
              ref={confirmarRef}
              type="button"
              onClick={confirmar}
              disabled={mutacion.isPending}
              className="rounded-full bg-slate-800 px-3 py-1 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Confirmar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

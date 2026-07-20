import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { Button } from './ui/button'
import { DemoUploadNudge } from './DemoUploadNudge'
import { useIngesta } from '@/api/use-ingesta'
import { validarArchivoWeb } from '@/domain/validar-archivo'
import { formatearMontoCLP } from '@/domain/formatear-monto'

const CANTIDAD_PREVIEW_TRANSACCIONES = 5

type EstadoSubida = 'idle' | 'validando' | 'subiendo' | 'exito' | 'error'

// The aria-live region announces the STATE transition (generic wording per
// state) — it deliberately does NOT repeat `mensajeError` verbatim, so the
// specific backend/validation message (CU-04) lives in exactly one place
// (the `role="alert"` paragraph below). Repeating it here would make
// `getByText(message)` ambiguous for callers/tests and double-announce the
// same text to a screen reader. `Record<EstadoSubida, string>` keeps this
// type-exhaustive — a new `EstadoSubida` member fails to compile without a
// message here.
const MENSAJE_POR_ESTADO: Record<EstadoSubida, string> = {
  idle: 'Selecciona un archivo .xlsx o .pdf para subir.',
  validando: 'Archivo válido, listo para subir.',
  subiendo: 'Subiendo archivo…',
  exito: 'Archivo subido correctamente.',
  error: 'No se pudo completar la subida.',
}

/**
 * SubirCartola (`upload-cartola-ui`, US-031/US-032, design.md Decision 5) —
 * presentational component wiring `validarArchivoWeb` (client-side gate,
 * A.3) and `useIngesta` (transport + cache invalidation, A.7) into a single
 * state machine: `idle → validando → subiendo → éxito | error`.
 *
 * `validando`/`error` (client-side rejection) come from `validarArchivoWeb`,
 * run synchronously the moment a file is selected — CU-01 requires the
 * rejection to happen WITHOUT any HTTP request, so validation runs before
 * `mutate` is ever reachable. `subiendo`/`éxito`/`error` (backend outcome)
 * come from `mutation.status`. Submit stays `disabled` while `subiendo` for
 * the visual affordance, but the actual double-submit guard (CU-02) is a
 * synchronous `isSubmittingRef` checked+set inside `handleSubmit` — neither
 * `mutation.isPending` nor `disabled` update until React re-renders, which
 * doesn't happen between two synchronous clicks fired before paint.
 *
 * Result panel renders the fields CU-03 requires plus a bounded transaction
 * preview (reuses `formatearMontoCLP` — never format money by hand, mirrors
 * `BucketDetailList`'s discipline).
 *
 * A11y (CU-05, ADR-018): the file `<input>` has an associated `<label>`; an
 * `aria-live="polite"` region announces every state transition; on `éxito`
 * focus moves to the result heading, on `error` to the error text — both
 * carry `tabIndex={-1}` so they're programmatically focusable without being
 * in the natural tab order.
 *
 * `esDemo` (CU-07, design.md Decision 6): renders `<DemoUploadNudge>` HERE
 * (not in the route) so this component's own test suite covers CU-07
 * directly, and so a route-level unit test isn't required to prove it.
 */
export function SubirCartola({ esDemo }: { readonly esDemo?: boolean }) {
  const [archivo, setArchivo] = useState<File | null>(null)
  const [errorValidacion, setErrorValidacion] = useState<string | null>(null)
  const mutation = useIngesta()

  const headingRef = useRef<HTMLHeadingElement>(null)
  const errorRef = useRef<HTMLParagraphElement>(null)
  // Synchronous double-submit guard (money-duplication risk): `mutation.isPending`
  // is a stale render value and the `disabled` attribute only updates after a
  // re-render — neither blocks two synchronous clicks fired before paint. A
  // ref is read/written synchronously inside `handleSubmit`, independent of
  // the render cycle, so the SECOND of two back-to-back clicks is gated even
  // though React hasn't re-rendered yet.
  const isSubmittingRef = useRef(false)

  const estado: EstadoSubida = mutation.isPending
    ? 'subiendo'
    : mutation.isSuccess
      ? 'exito'
      : mutation.isError
        ? 'error'
        : errorValidacion
          ? 'error'
          : archivo
            ? 'validando'
            : 'idle'

  useEffect(() => {
    if (estado === 'exito') {
      headingRef.current?.focus()
    } else if (estado === 'error') {
      errorRef.current?.focus()
    }
  }, [estado])

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const seleccionado = event.target.files?.[0]
    mutation.reset()
    isSubmittingRef.current = false
    if (!seleccionado) {
      setArchivo(null)
      setErrorValidacion(null)
      return
    }

    const resultado = validarArchivoWeb(seleccionado)
    if (resultado.tag === 'rechazado') {
      setArchivo(null)
      setErrorValidacion(resultado.message)
      return
    }

    setArchivo(seleccionado)
    setErrorValidacion(null)
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!archivo || mutation.isPending || isSubmittingRef.current) {
      return
    }
    isSubmittingRef.current = true
    mutation.mutate(archivo, {
      onSettled: () => {
        isSubmittingRef.current = false
      },
    })
  }

  const mensajeError = errorValidacion ?? mutation.error?.message ?? null
  const mensajeEstado: string = MENSAJE_POR_ESTADO[estado]

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4 p-4">
      <h1 className="text-lg font-semibold text-foreground">Subir cartola</h1>

      <DemoUploadNudge esDemo={esDemo} />

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <label htmlFor="cartola-file" className="text-sm font-medium text-muted-foreground">
          Selecciona un archivo (.xlsx o .pdf)
        </label>
        <input
          id="cartola-file"
          type="file"
          accept=".xlsx,.pdf"
          onChange={handleFileChange}
          disabled={estado === 'subiendo'}
          className="text-sm text-muted-foreground"
        />
        <Button type="submit" disabled={!archivo || estado === 'subiendo'}>
          Subir cartola
        </Button>
      </form>

      <div role="status" aria-live="polite" aria-label="Estado de la subida" className="text-sm text-muted-foreground">
        {mensajeEstado}
      </div>

      {estado === 'error' && mensajeError && (
        <p
          ref={errorRef}
          tabIndex={-1}
          role="alert"
          className="text-sm text-destructive focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
        >
          {mensajeError}
        </p>
      )}

      {estado === 'exito' && mutation.data && (
        <section
          aria-labelledby="resultado-subida-heading"
          className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4"
        >
          <h2
            id="resultado-subida-heading"
            ref={headingRef}
            tabIndex={-1}
            className="text-base font-semibold text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
          >
            Cartola subida
          </h2>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <dt className="font-medium">Banco</dt>
            <dd>{mutation.data.banco}</dd>
            <dt className="font-medium">Tipo de cuenta</dt>
            <dd>{mutation.data.tipoCuenta}</dd>
            <dt className="font-medium">Número de cuenta</dt>
            <dd>{mutation.data.numeroCuenta}</dd>
            <dt className="font-medium">Transacciones</dt>
            <dd>{mutation.data.totalTransacciones}</dd>
          </dl>
          <ul className="flex flex-col gap-2">
            {mutation.data.transacciones.slice(0, CANTIDAD_PREVIEW_TRANSACCIONES).map((transaccion, indice) => (
              // El DTO no trae `id` (a diferencia de `DetalleBucketTransaccionDto`) — la key
              // combina los campos disponibles + el índice para distinguir filas con datos
              // idénticos sin depender solo de la posición.
              <li
                key={`${transaccion.fecha}-${transaccion.descripcion}-${transaccion.cargo}-${transaccion.abono}-${indice}`}
                className="flex flex-col gap-1 rounded-lg border border-border bg-muted p-2 text-sm"
              >
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>{transaccion.fecha.slice(0, 10)}</span>
                  <span className="font-medium">{transaccion.descripcion}</span>
                </div>
                <div className="flex items-center justify-between text-foreground">
                  <span>
                    Cargo: <span className="font-medium">{formatearMontoCLP(transaccion.cargo)}</span>
                  </span>
                  <span>
                    Abono: <span className="font-medium">{formatearMontoCLP(transaccion.abono)}</span>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

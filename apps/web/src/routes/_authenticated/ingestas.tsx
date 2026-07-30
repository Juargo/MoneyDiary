import { createFileRoute } from '@tanstack/react-router'
import { ListaIngestas } from '@/components/ListaIngestas'

export const Route = createFileRoute('/_authenticated/ingestas')({
  component: ListaIngestas,
})

/**
 * Route for GET/DELETE `/api/ingestas` (`us-018-eliminar-ingesta` Slice 2,
 * design.md §7.5, T2.12) — thin container under `_authenticated`, same as
 * `/subir`: `ListaIngestas` owns its own query + rendering, this file just
 * wires it to the router (no route context needed here, unlike `/subir`'s
 * `esDemo` read).
 */

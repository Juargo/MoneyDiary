import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { AlertCircle, Pencil, Plus, Trash2 } from 'lucide-react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { PatronFormModal } from '@/components/patrones/patron-form-modal'
import { LucideIcon } from '@/components/patrones/lucide-icon'
import {
  useCreatePatron,
  useDeletePatron,
  usePatrones,
  useUpdatePatron,
} from '@/api/use-patrones'
import type { Patron, PatronInput } from '@/api/patrones'

export const Route = createFileRoute('/patrones')({
  component: PatronesPage,
})

function PatronesPage() {
  const query = usePatrones()
  const createMutation = useCreatePatron()
  const updateMutation = useUpdatePatron()
  const deleteMutation = useDeletePatron()

  const [editing, setEditing] = useState<Patron | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  const handleNew = () => {
    setEditing(null)
    setModalOpen(true)
  }

  const handleEdit = (p: Patron) => {
    setEditing(p)
    setModalOpen(true)
  }

  const handleClose = () => {
    setModalOpen(false)
    createMutation.reset()
    updateMutation.reset()
  }

  const handleSubmit = (input: PatronInput) => {
    if (editing) {
      updateMutation.mutate(
        { id: editing.id, input },
        { onSuccess: handleClose },
      )
    } else {
      createMutation.mutate(input, { onSuccess: handleClose })
    }
  }

  const handleDelete = (p: Patron) => {
    if (confirm(`¿Eliminar el patrón "${p.label ?? p.expression}"?`)) {
      deleteMutation.mutate(p.id)
    }
  }

  const patrones = query.data?.patrones ?? []
  const saving = createMutation.isPending || updateMutation.isPending
  const submitError =
    (editing
      ? (updateMutation.error as Error | null)?.message
      : (createMutation.error as Error | null)?.message) ?? null

  return (
    <DashboardLayout title="">
      <div className="mx-auto flex max-w-[1280px] flex-col gap-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-on-surface">Patrones</h1>
            <p className="mt-1 text-sm text-on-surface-variant">
              Reglas globales para categorizar transacciones por descripción.
            </p>
          </div>
          <button
            type="button"
            onClick={handleNew}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary shadow"
          >
            <Plus className="size-4" strokeWidth={2.5} />
            Nuevo patrón
          </button>
        </div>

        {query.isError && (
          <div className="flex items-start gap-3 rounded-lg border border-error/40 bg-error-container px-4 py-3 text-sm text-on-error-container">
            <AlertCircle className="mt-0.5 size-5 shrink-0" />
            <div>
              <p className="font-semibold">No se pudieron cargar los patrones</p>
              <p className="mt-1 opacity-90">{(query.error as Error).message}</p>
            </div>
          </div>
        )}

        {query.isPending && <p className="text-sm">Cargando…</p>}

        {query.isSuccess && (
          <div className="overflow-x-auto rounded-xl border border-on-surface/10 bg-surface">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-on-surface/5 text-xs uppercase text-on-surface-variant">
                <tr>
                  <th className="px-4 py-3">Icono</th>
                  <th className="px-4 py-3">Etiqueta</th>
                  <th className="px-4 py-3">Bucket</th>
                  <th className="px-4 py-3">Expresión</th>
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3">Prioridad</th>
                  <th className="px-4 py-3">Activo</th>
                  <th className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {patrones.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-on-surface-variant">
                      No hay patrones todavía. Crea el primero.
                    </td>
                  </tr>
                )}
                {patrones.map((p) => (
                  <tr key={p.id} className="border-t border-on-surface/10">
                    <td className="px-4 py-2">
                      <div className="flex size-8 items-center justify-center rounded bg-on-surface/5">
                        {p.icon ? (
                          <LucideIcon name={p.icon} className="size-5" />
                        ) : (
                          <span className="text-xs text-on-surface-variant">—</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2 font-medium">{p.label ?? '—'}</td>
                    <td className="px-4 py-2">{p.bucketName}</td>
                    <td
                      className="max-w-[280px] truncate px-4 py-2 font-mono text-xs"
                      title={p.expression}
                    >
                      {p.expression}
                    </td>
                    <td className="px-4 py-2 text-xs">{p.matchType}</td>
                    <td className="px-4 py-2">{p.priority}</td>
                    <td className="px-4 py-2">
                      <span
                        className={
                          p.active
                            ? 'rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800'
                            : 'rounded-full bg-on-surface/10 px-2 py-0.5 text-xs text-on-surface-variant'
                        }
                      >
                        {p.active ? 'Sí' : 'No'}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-right">
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => handleEdit(p)}
                          className="rounded-md p-2 hover:bg-on-surface/10"
                          aria-label="Editar"
                        >
                          <Pencil className="size-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(p)}
                          disabled={deleteMutation.isPending}
                          className="rounded-md p-2 text-error hover:bg-error/10 disabled:opacity-50"
                          aria-label="Eliminar"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {deleteMutation.isError && (
          <p className="text-sm text-error">
            Error eliminando: {(deleteMutation.error as Error).message}
          </p>
        )}
      </div>

      <PatronFormModal
        open={modalOpen}
        initial={editing}
        saving={saving}
        error={submitError}
        onClose={handleClose}
        onSubmit={handleSubmit}
      />
    </DashboardLayout>
  )
}

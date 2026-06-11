import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { AlertCircle } from 'lucide-react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import {
  TransactionsTable,
  TransactionsTableSkeleton,
} from '@/components/transactions/transactions-table'
import { UploadPromptCard } from '@/components/transactions/upload-prompt-card'
import { useTransacciones } from '@/api/use-transacciones'

export const Route = createFileRoute('/transacciones')({
  component: TransaccionesPage,
})

function TransaccionesPage() {
  const navigate = useNavigate()
  const query = useTransacciones()

  const transacciones = query.data?.transacciones ?? []
  const sortedTransacciones = [...transacciones].sort(
    (a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime(),
  )
  const total = query.data?.total ?? 0
  const isEmpty = query.isSuccess && total === 0

  return (
    <DashboardLayout title="">
      <div className="mx-auto flex max-w-[1280px] flex-col gap-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h1 className="text-3xl font-bold text-on-surface">Transacciones</h1>
          {query.isSuccess && (
            <p className="text-sm text-on-surface-variant">
              {total === 0
                ? 'Sin registros aún'
                : `Mostrando ${total} ${total === 1 ? 'registro' : 'registros'}`}
            </p>
          )}
        </div>

        {query.isError && (
          <div className="flex items-start gap-3 rounded-lg border border-error/40 bg-error-container px-4 py-3 text-sm text-on-error-container">
            <AlertCircle className="mt-0.5 size-5 shrink-0" strokeWidth={2} />
            <div>
              <p className="font-semibold">No se pudieron cargar las transacciones</p>
              <p className="mt-1 opacity-90">{query.error.message}</p>
            </div>
          </div>
        )}

        {query.isPending && <TransactionsTableSkeleton />}

        {query.isSuccess && !isEmpty && (
          <TransactionsTable transacciones={sortedTransacciones} />
        )}

        <UploadPromptCard
          title={isEmpty ? 'Sube tu primera cartola' : '¿Falta alguna transacción?'}
          description={
            isEmpty
              ? 'Aún no has subido ningún archivo. Sube una cartola .xlsx para ver tus movimientos aquí.'
              : 'Sube otra cartola para sumar más transacciones a tu historial.'
          }
          ctaLabel={isEmpty ? 'Subir archivo' : 'Subir otro archivo'}
          onCtaClick={() => navigate({ to: '/' })}
        />
      </div>
    </DashboardLayout>
  )
}

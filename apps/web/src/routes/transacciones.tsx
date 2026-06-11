import { createFileRoute } from '@tanstack/react-router'
import { ShoppingCart, Drama, PiggyBank } from 'lucide-react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import {
  TransactionsTable,
  type TransactionGroup,
} from '@/components/transactions/transactions-table'
import { UploadPromptCard } from '@/components/transactions/upload-prompt-card'

export const Route = createFileRoute('/transacciones')({
  component: TransaccionesPage,
})

const groups: TransactionGroup[] = [
  {
    key: 'needs',
    variant: 'needs',
    icon: ShoppingCart,
    label: 'Necesidades',
    idealPercent: 50,
    progressPercent: 80,
    total: -542_500,
    transactions: [
      {
        id: 'n1',
        date: '12 Oct, 2024',
        merchant: 'Supermercado Lider',
        category: { label: 'Alimentación', variant: 'needs' },
        amount: -82_450,
      },
      {
        id: 'n2',
        date: '10 Oct, 2024',
        merchant: 'Inmobiliaria Providencia',
        category: { label: 'Vivienda', variant: 'needs' },
        amount: -450_000,
      },
      {
        id: 'n3',
        date: '08 Oct, 2024',
        merchant: 'Enel Distribución',
        category: { label: 'Cuentas', variant: 'needs' },
        amount: -10_050,
      },
    ],
  },
  {
    key: 'wants',
    variant: 'wants',
    icon: Drama,
    label: 'Gustos',
    idealPercent: 30,
    progressPercent: 70,
    total: -145_200,
    exceeded: true,
    exceededLabel: '+15% excedido',
    transactions: [
      {
        id: 'w1',
        date: '11 Oct, 2024',
        merchant: 'Netflix Chile',
        category: { label: 'Ocio', variant: 'wants' },
        amount: -12_900,
      },
      {
        id: 'w2',
        date: '09 Oct, 2024',
        merchant: 'Starbucks Reserve',
        category: { label: 'Restaurantes', variant: 'wants' },
        amount: -7_400,
      },
    ],
  },
  {
    key: 'savings',
    variant: 'savings',
    icon: PiggyBank,
    label: 'Ahorro e Ingresos',
    idealPercent: 20,
    progressPercent: 25,
    total: 1_250_000,
    transactions: [
      {
        id: 's1',
        date: '01 Oct, 2024',
        merchant: 'Deposito Sueldo SPA',
        category: { label: 'Ingreso', variant: 'savings' },
        amount: 1_200_000,
      },
      {
        id: 's2',
        date: '02 Oct, 2024',
        merchant: 'Fintual Portafolio',
        category: { label: 'Ahorro', variant: 'savings' },
        amount: 50_000,
      },
    ],
  },
]

function TransaccionesPage() {
  const totalCount = groups.reduce(
    (acc, group) => acc + group.transactions.length,
    0,
  )

  return (
    <DashboardLayout title="">
      <div className="mx-auto flex max-w-[1280px] flex-col gap-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h1 className="text-3xl font-bold text-on-surface">Transacciones</h1>
          <p className="text-sm text-on-surface-variant">
            Mostrando {totalCount} registros del mes
          </p>
        </div>

        <TransactionsTable groups={groups} />

        <UploadPromptCard
          title="¿Falta alguna transacción?"
          description="Sube tu cartola bancaria (.pdf o .csv) para actualizar tus gastos automáticamente y obtener un reporte detallado."
          ctaLabel="Subir archivo"
        />
      </div>
    </DashboardLayout>
  )
}

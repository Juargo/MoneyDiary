import { Landmark } from 'lucide-react'

const banks = [
  { name: 'Banco de Chile', short: 'BCh' },
  { name: 'BancoEstado', short: 'BE' },
  { name: 'BCI', short: 'BCI' },
  { name: 'Santander', short: 'San' },
]

export function SupportedBanks() {
  return (
    <div className="text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-on-surface-variant">
        Soportamos los principales bancos de Chile
      </p>

      <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        {banks.map((bank) => (
          <div
            key={bank.name}
            title={bank.name}
            className="flex aspect-square items-center justify-center rounded-lg bg-surface-container text-on-surface-variant"
          >
            <Landmark className="size-7" strokeWidth={1.5} />
          </div>
        ))}
      </div>
    </div>
  )
}

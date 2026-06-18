import { Lightbulb } from 'lucide-react'
import type { InsightTiendas } from '@/lib/productos-mock'

type Props = {
  insight: InsightTiendas
}

export function InsightTiendasBanner({ insight }: Props) {
  if (!insight) return null

  return (
    <div className="flex items-start gap-3 rounded-2xl bg-surface-container px-4 py-4">
      <Lightbulb
        className="mt-0.5 size-5 shrink-0 text-amber-500"
        strokeWidth={2}
        aria-hidden
      />
      <p className="text-sm text-on-surface">
        La{' '}
        <span className="font-semibold">{insight.tiendaBarata}</span> es{' '}
        <span className="font-semibold text-[#16a34a]">{insight.pct}%</span>{' '}
        más barata que el{' '}
        <span className="font-semibold">{insight.tiendaCara}</span>.
      </p>
    </div>
  )
}

import { TrendingUp } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

/**
 * "INGRESOS" hero card: a mint fill with a trend icon over the month's total
 * income, rendered large. `totalIngreso` arrives already formatted as CLP
 * from the view-model (BigInt-string-safe, spec W1-01) — never reformatted
 * here. DOM port of `apps/mobile/src/components/IngresoCard.tsx`; color
 * identity diverges by product decision (spec DCR-01/02/03).
 */
export function IngresoCard({ totalIngreso }: { readonly totalIngreso: string }) {
  return (
    <Card className="bg-ingreso">
      <CardContent className="flex flex-col items-center gap-1 text-center">
        <span className="flex items-center gap-1.5">
          <TrendingUp aria-hidden className="size-4" data-testid="ingreso-trend-icon" />
          <span className="text-xs font-semibold tracking-widest text-ingreso-foreground">INGRESOS</span>
        </span>
        <span className="text-4xl font-extrabold text-ingreso-foreground">{totalIngreso}</span>
      </CardContent>
    </Card>
  )
}

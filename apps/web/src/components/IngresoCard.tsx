import { Card, CardContent } from '@/components/ui/card'

/**
 * "INGRESOS" hero card: a small uppercase label over the month's total
 * income, rendered large. `totalIngreso` arrives already formatted as CLP
 * from the view-model (BigInt-string-safe, spec W1-01) — never reformatted
 * here. DOM port of `apps/mobile/src/components/IngresoCard.tsx`.
 */
export function IngresoCard({ totalIngreso }: { readonly totalIngreso: string }) {
  return (
    <Card className="border-l-4 border-l-slate-800">
      <CardContent className="flex flex-col items-center gap-1 text-center">
        <span className="text-xs font-semibold tracking-widest text-slate-500">INGRESOS</span>
        <span className="text-4xl font-extrabold text-slate-900">{totalIngreso}</span>
      </CardContent>
    </Card>
  )
}

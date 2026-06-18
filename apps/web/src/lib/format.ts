const clpFormatter = new Intl.NumberFormat('es-CL')

export function formatCLP(value: number): string {
  return `$${clpFormatter.format(value)}`
}

export function formatCLPSigned(value: number): string {
  const sign = value < 0 ? '-' : '+'
  return `${sign}$${clpFormatter.format(Math.abs(value))}`
}

const monthsShort = [
  'Ene',
  'Feb',
  'Mar',
  'Abr',
  'May',
  'Jun',
  'Jul',
  'Ago',
  'Sep',
  'Oct',
  'Nov',
  'Dic',
]

export function formatFechaCorta(iso: string): string {
  const d = new Date(iso)
  const day = String(d.getUTCDate()).padStart(2, '0')
  const month = monthsShort[d.getUTCMonth()]
  const year = d.getUTCFullYear()
  return `${day} ${month}, ${year}`
}

/** Fecha compacta sin año. Ej: "14 jun" */
export function formatDiaMes(iso: string): string {
  const d = new Date(iso)
  const day = d.getUTCDate()
  const month = monthsShort[d.getUTCMonth()]!.toLowerCase()
  return `${day} ${month}`
}

const monthsLong = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
]

export function formatMesAno(iso: string): string {
  const d = new Date(iso)
  return `${monthsLong[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

export function mesAnoKey(iso: string): string {
  const d = new Date(iso)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

/** Fecha con mes corto y año, sin coma. Ej: "12 mar 2026" */
export function formatFechaMes(iso: string): string {
  const d = new Date(iso)
  const day = d.getUTCDate()
  const month = monthsShort[d.getUTCMonth()]!.toLowerCase()
  const year = d.getUTCFullYear()
  return `${day} ${month} ${year}`
}

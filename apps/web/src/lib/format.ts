const clpFormatter = new Intl.NumberFormat('es-CL')

export function formatCLP(value: number): string {
  return `$${clpFormatter.format(value)}`
}

export function formatCLPSigned(value: number): string {
  const sign = value < 0 ? '-' : '+'
  return `${sign}$${clpFormatter.format(Math.abs(value))}`
}

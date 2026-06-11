const clpFormatter = new Intl.NumberFormat('es-CL')

export function formatCLP(value: number): string {
  return `$${clpFormatter.format(value)}`
}

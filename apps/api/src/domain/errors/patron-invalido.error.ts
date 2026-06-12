export class PatronInvalidoError extends Error {
  constructor(motivo: string) {
    super(`Patrón inválido: ${motivo}`);
    this.name = 'PatronInvalidoError';
  }
}

export class PatronNoEncontradoError extends Error {
  constructor(id: string) {
    super(`Patrón ${id} no encontrado.`);
    this.name = 'PatronNoEncontradoError';
  }
}

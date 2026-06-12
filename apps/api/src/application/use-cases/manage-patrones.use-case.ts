import { Result } from '../../shared/result';
import {
  PatronInvalidoError,
  PatronNoEncontradoError,
} from '../../domain/errors/patron-invalido.error';
import {
  MatchTypePatron,
  Patron,
  PatronInput,
} from '../../domain/value-objects/patron';
import { IPatronRepository } from '../ports/patron-repository.port';

function validar(input: Partial<PatronInput>): PatronInvalidoError | null {
  if (input.expression !== undefined) {
    if (!input.expression.trim()) {
      return new PatronInvalidoError('expression vacío.');
    }
    if (input.matchType === MatchTypePatron.Regex) {
      try {
        new RegExp(input.expression, 'i');
      } catch {
        return new PatronInvalidoError(
          `regex no compilable: ${input.expression}`,
        );
      }
    }
  }
  if (input.matchType !== undefined && !Object.values(MatchTypePatron).includes(input.matchType)) {
    return new PatronInvalidoError(`matchType desconocido: ${input.matchType}`);
  }
  if (input.priority !== undefined && (!Number.isInteger(input.priority) || input.priority < 0)) {
    return new PatronInvalidoError('priority debe ser entero >= 0.');
  }
  if (input.bucketName !== undefined && !input.bucketName.trim()) {
    return new PatronInvalidoError('bucketName vacío.');
  }
  if (input.icon != null && input.icon !== '' && !/^[A-Za-z0-9]+$/.test(input.icon)) {
    return new PatronInvalidoError('icon debe ser un nombre Lucide válido.');
  }
  return null;
}

export class ListPatronesUseCase {
  constructor(private readonly repo: IPatronRepository) {}
  execute(): Promise<ReadonlyArray<Patron>> {
    return this.repo.findAll();
  }
}

export class CreatePatronUseCase {
  constructor(private readonly repo: IPatronRepository) {}

  async execute(input: PatronInput): Promise<Result<Patron, PatronInvalidoError>> {
    const err = validar(input);
    if (err) return Result.fail(err);
    const created = await this.repo.create(input);
    return Result.ok(created);
  }
}

export class UpdatePatronUseCase {
  constructor(private readonly repo: IPatronRepository) {}

  async execute(
    id: string,
    input: Partial<PatronInput>,
  ): Promise<Result<Patron, PatronInvalidoError | PatronNoEncontradoError>> {
    const err = validar(input);
    if (err) return Result.fail(err);
    const updated = await this.repo.update(id, input);
    if (!updated) return Result.fail(new PatronNoEncontradoError(id));
    return Result.ok(updated);
  }
}

export class DeletePatronUseCase {
  constructor(private readonly repo: IPatronRepository) {}

  async execute(id: string): Promise<Result<void, PatronNoEncontradoError>> {
    const ok = await this.repo.delete(id);
    if (!ok) return Result.fail(new PatronNoEncontradoError(id));
    return Result.ok(undefined);
  }
}

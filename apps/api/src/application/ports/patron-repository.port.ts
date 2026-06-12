import { Patron, PatronInput } from '../../domain/value-objects/patron';

export interface IPatronRepository {
  findAll(): Promise<ReadonlyArray<Patron>>;
  findActiveOrdered(): Promise<ReadonlyArray<Patron>>;
  findById(id: string): Promise<Patron | null>;
  create(input: PatronInput): Promise<Patron>;
  update(id: string, input: Partial<PatronInput>): Promise<Patron | null>;
  delete(id: string): Promise<boolean>;
}

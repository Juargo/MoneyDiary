import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Result } from '../../shared/result';
import {
  ITransactionRepository,
  SaveIngestaInput,
  SaveIngestaResult,
} from '../../application/ports/transaction-repository.port';
import { TransaccionAlmacenada } from '../../domain/value-objects/transaccion-almacenada';

const DEFAULT_BUCKET_NAME = 'SinCategorizar';

type StoredTransaccion = TransaccionAlmacenada & { _mutable: { bucketName: string } };

@Injectable()
export class InMemoryTransactionRepository implements ITransactionRepository {
  private readonly store: StoredTransaccion[] = [];

  saveIngesta(
    input: SaveIngestaInput,
  ): Promise<Result<SaveIngestaResult, Error>> {
    const ingestaId = randomUUID();
    const almacenadas: StoredTransaccion[] = input.transacciones.map((t) => {
      const mutable = { bucketName: DEFAULT_BUCKET_NAME };
      return {
        ...t,
        id: randomUUID(),
        ingestaId,
        banco: input.banco,
        tipoCuenta: input.tipoCuenta,
        numeroCuenta: input.numeroCuenta,
        get bucketName() {
          return mutable.bucketName;
        },
        _mutable: mutable,
      };
    });
    this.store.push(...almacenadas);
    return Promise.resolve(
      Result.ok({ ingestaId, count: almacenadas.length }),
    );
  }

  findAll(): Promise<ReadonlyArray<TransaccionAlmacenada>> {
    return Promise.resolve([...this.store]);
  }

  updateBucket(
    transactionId: string,
    bucketName: string,
  ): Promise<Result<void, Error>> {
    const tx = this.store.find((t) => t.id === transactionId);
    if (!tx) {
      return Promise.resolve(
        Result.fail(new Error(`Transaccion ${transactionId} no existe`)),
      );
    }
    tx._mutable.bucketName = bucketName;
    return Promise.resolve(Result.ok(undefined));
  }
}

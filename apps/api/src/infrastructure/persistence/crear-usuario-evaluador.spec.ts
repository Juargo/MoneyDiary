import type { PrismaClient } from '@prisma/client';
import {
  runCrearUsuarioEvaluador,
  main,
  scrubCredenciales,
  logCrearUsuarioEvaluadorFailure,
} from '../../../prisma/crear-usuario-evaluador';
import type { ICryptoService } from '../../application/ports/crypto-service.port';
import type { IBlindIndexService } from '../../application/ports/blind-index-service.port';
import type { IPasswordHasher } from '../../application/ports/password-hasher.port';

/**
 * crear-usuario-evaluador — unit tests (sin BD).
 *
 * Mismo patrón que backfill-email-blind-index.spec.ts (fakes de Prisma,
 * ningún mock de librería real) y que
 * prisma-identidad-google.repository.spec.ts para el fake `$transaction`
 * interactivo (`{...} as unknown as PrismaClient`, ver ahí) — evita modelar
 * a mano los tipos generados de Prisma para `categoria`/`patronClasificacion`.
 */

const EMAIL_VALIDO = 'Evaluador@Example.com';
const EMAIL_NORMALIZADO = 'evaluador@example.com';
const PASSWORD_VALIDA = 'super-secreta-evaluador-tfm-2026';

function makeCrypto(overrides: Partial<ICryptoService> = {}): ICryptoService {
  return {
    encrypt: overrides.encrypt ?? ((v: string) => `enc:${v}`),
    decrypt:
      overrides.decrypt ??
      ((v: string) => {
        if (!v.startsWith('enc:')) {
          throw new Error('formato v1 malformado.');
        }
        return v.slice('enc:'.length);
      }),
  };
}

function makeBlindIndex(): IBlindIndexService {
  return { compute: (v: string) => `bi:${v}` };
}

function makeHasher(hashResult = 'hashed-argon2id'): {
  hasher: IPasswordHasher;
  hashMock: ReturnType<typeof vi.fn>;
} {
  const hashMock = vi.fn(async (_plano: string) => hashResult);
  return {
    hasher: {
      hash: hashMock,
      verificar: vi.fn(async () => true),
    },
    hashMock,
  };
}

interface FakePrismaOptions {
  existente?: { email: string | null } | null;
  duplicado?: { id: string } | null;
  createdUserId?: string;
}

function makeFakePrisma(options: FakePrismaOptions = {}) {
  const orden: string[] = [];

  const findFirstMock = vi.fn(async () => options.existente ?? null);
  const findUniqueMock = vi.fn(async () => options.duplicado ?? null);

  const createMock = vi.fn(async (args: { data: Record<string, unknown> }) => {
    orden.push('user.create');
    return {
      id: options.createdUserId ?? 'user-evaluador-nuevo',
      ...args.data,
    };
  });
  const categoriaCreateManyMock = vi.fn(
    async (_args: { data: Array<{ userId: string }> }) => {
      orden.push('categoria.createMany');
      return { count: 0 };
    },
  );
  const categoriaFindManyMock = vi.fn(async () => {
    orden.push('categoria.findMany');
    return [] as Array<{ id: string; nombre: string; bucketId: string }>;
  });
  const patronCreateManyMock = vi.fn(async () => {
    orden.push('patronClasificacion.createMany');
    return { count: 0 };
  });

  const txClient = {
    user: { create: createMock },
    categoria: {
      createMany: categoriaCreateManyMock,
      findMany: categoriaFindManyMock,
    },
    patronClasificacion: { createMany: patronCreateManyMock },
  };

  const transactionMock = vi.fn(
    async (callback: (tx: unknown) => Promise<unknown>) => callback(txClient),
  );

  const prisma = {
    user: { findFirst: findFirstMock, findUnique: findUniqueMock },
    $transaction: transactionMock,
  } as unknown as PrismaClient;

  return {
    prisma,
    orden,
    findFirstMock,
    findUniqueMock,
    createMock,
    categoriaCreateManyMock,
    categoriaFindManyMock,
    patronCreateManyMock,
    transactionMock,
  };
}

describe('runCrearUsuarioEvaluador — creación del usuario evaluador TFM (unit, sin BD)', () => {
  it('happy path: crea el usuario con email cifrado + blind index + hash, y copia el catálogo en la MISMA transacción', async () => {
    const {
      prisma,
      createMock,
      categoriaCreateManyMock,
      patronCreateManyMock,
      transactionMock,
      orden,
    } = makeFakePrisma({
      existente: { email: 'enc:otro-usuario@example.com' },
      duplicado: null,
      createdUserId: 'user-evaluador-nuevo',
    });
    const crypto = makeCrypto();
    const blindIndex = makeBlindIndex();
    const { hasher, hashMock } = makeHasher('hashed-argon2id');

    const resultado = await runCrearUsuarioEvaluador(
      prisma,
      { email: EMAIL_VALIDO, password: PASSWORD_VALIDA },
      { crypto, blindIndex, hasher },
    );

    expect(resultado).toEqual({
      userId: 'user-evaluador-nuevo',
      email: EMAIL_NORMALIZADO,
    });

    expect(createMock).toHaveBeenCalledTimes(1);
    expect(createMock.mock.calls[0][0]).toEqual({
      data: {
        nombre: 'Evaluador TFM',
        email: `enc:${EMAIL_NORMALIZADO}`,
        emailBlindIndex: `bi:${EMAIL_NORMALIZADO}`,
        passwordHash: 'hashed-argon2id',
      },
    });

    expect(hashMock).toHaveBeenCalledWith(PASSWORD_VALIDA);
    expect(transactionMock).toHaveBeenCalledTimes(1);

    // El copy del catálogo va DENTRO de la misma transacción: ambas
    // createMany reciben el userId recién creado.
    expect(categoriaCreateManyMock).toHaveBeenCalledTimes(1);
    const categoriaData = categoriaCreateManyMock.mock.calls[0][0]
      .data as Array<{
      userId: string;
    }>;
    expect(categoriaData.length).toBeGreaterThan(0);
    expect(
      categoriaData.every((c) => c.userId === 'user-evaluador-nuevo'),
    ).toBe(true);
    expect(patronCreateManyMock).toHaveBeenCalledTimes(1);

    // Orden: crear el user ANTES de copiar el catálogo.
    expect(orden).toEqual([
      'user.create',
      'categoria.createMany',
      'categoria.findMany',
      'patronClasificacion.createMany',
    ]);
  });

  it('usa EVALUADOR_NOMBRE si se provee, en vez del default', async () => {
    const { prisma, createMock } = makeFakePrisma({ existente: null });
    const { hasher } = makeHasher();

    await runCrearUsuarioEvaluador(
      prisma,
      {
        email: EMAIL_VALIDO,
        password: PASSWORD_VALIDA,
        nombre: 'Profesor Guía',
      },
      { crypto: makeCrypto(), blindIndex: makeBlindIndex(), hasher },
    );

    expect(
      (createMock.mock.calls[0][0] as { data: { nombre: string } }).data.nombre,
    ).toBe('Profesor Guía');
  });

  it('computa el hash de argon2 ANTES de abrir la transacción', async () => {
    const { prisma, transactionMock } = makeFakePrisma({ existente: null });
    const orden: string[] = [];
    const hashMock = vi.fn(async (_plano: string) => {
      orden.push('hash');
      return 'hashed';
    });
    const hasher: IPasswordHasher = { hash: hashMock, verificar: vi.fn() };
    transactionMock.mockImplementation(async (callback) => {
      orden.push('transaction-open');
      return callback({
        user: { create: vi.fn(async () => ({ id: 'x' })) },
        categoria: {
          createMany: vi.fn(async () => ({ count: 0 })),
          findMany: vi.fn(async () => []),
        },
        patronClasificacion: { createMany: vi.fn(async () => ({ count: 0 })) },
      });
    });

    await runCrearUsuarioEvaluador(
      prisma,
      { email: EMAIL_VALIDO, password: PASSWORD_VALIDA },
      { crypto: makeCrypto(), blindIndex: makeBlindIndex(), hasher },
    );

    expect(orden).toEqual(['hash', 'transaction-open']);
  });

  it('email inválido: aborta sin escrituras (ni transacción ni hash)', async () => {
    const { prisma, transactionMock } = makeFakePrisma();
    const { hasher, hashMock } = makeHasher();

    await expect(
      runCrearUsuarioEvaluador(
        prisma,
        { email: 'no-es-un-email', password: PASSWORD_VALIDA },
        { crypto: makeCrypto(), blindIndex: makeBlindIndex(), hasher },
      ),
    ).rejects.toThrow(/email/i);

    expect(transactionMock).not.toHaveBeenCalled();
    expect(hashMock).not.toHaveBeenCalled();
  });

  it('password inválida (muy corta): aborta sin escrituras, y el mensaje NO incluye la password cruda', async () => {
    const { prisma, transactionMock } = makeFakePrisma();
    const { hasher, hashMock } = makeHasher();
    const passwordCorta = 'corta1';

    await expect(
      runCrearUsuarioEvaluador(
        prisma,
        { email: EMAIL_VALIDO, password: passwordCorta },
        { crypto: makeCrypto(), blindIndex: makeBlindIndex(), hasher },
      ),
    ).rejects.toThrow(/contraseñ/i);

    expect(transactionMock).not.toHaveBeenCalled();
    expect(hashMock).not.toHaveBeenCalled();
  });

  it('password inválida (muy larga, 129 caracteres): también aborta sin escrituras', async () => {
    const { prisma, transactionMock } = makeFakePrisma();
    const { hasher } = makeHasher();

    await expect(
      runCrearUsuarioEvaluador(
        prisma,
        { email: EMAIL_VALIDO, password: 'a'.repeat(129) },
        { crypto: makeCrypto(), blindIndex: makeBlindIndex(), hasher },
      ),
    ).rejects.toThrow(/contraseñ/i);

    expect(transactionMock).not.toHaveBeenCalled();
  });

  it('ENCRYPTION_KEY no coincide con la clave de la BD (decrypt falla sobre una fila existente): aborta sin escrituras', async () => {
    const { prisma, transactionMock } = makeFakePrisma({
      existente: { email: 'ciphertext-bajo-otra-clave' },
    });
    const crypto = makeCrypto({
      decrypt: () => {
        throw new Error('AesGcmCryptoService: formato v1 malformado.');
      },
    });
    const { hasher, hashMock } = makeHasher();

    await expect(
      runCrearUsuarioEvaluador(
        prisma,
        { email: EMAIL_VALIDO, password: PASSWORD_VALIDA },
        { crypto, blindIndex: makeBlindIndex(), hasher },
      ),
    ).rejects.toThrow(/ENCRYPTION_KEY/);

    expect(transactionMock).not.toHaveBeenCalled();
    expect(hashMock).not.toHaveBeenCalled();
  });

  it('ningún usuario existente tiene email: continúa (con warning) en vez de abortar', async () => {
    const { prisma, transactionMock } = makeFakePrisma({ existente: null });
    const warnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);
    const { hasher } = makeHasher();

    const resultado = await runCrearUsuarioEvaluador(
      prisma,
      { email: EMAIL_VALIDO, password: PASSWORD_VALIDA },
      { crypto: makeCrypto(), blindIndex: makeBlindIndex(), hasher },
    );

    expect(resultado.userId).toBe('user-evaluador-nuevo');
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0].join(' ')).toMatch(
      /ENCRYPTION_KEY|verificar/i,
    );

    warnSpy.mockRestore();
  });

  it('emailBlindIndex duplicado: aborta sin escrituras (no actualiza la fila existente)', async () => {
    const { prisma, transactionMock } = makeFakePrisma({
      existente: { email: 'enc:otro@example.com' },
      duplicado: { id: 'user-ya-existente' },
    });
    const { hasher, hashMock } = makeHasher();

    await expect(
      runCrearUsuarioEvaluador(
        prisma,
        { email: EMAIL_VALIDO, password: PASSWORD_VALIDA },
        { crypto: makeCrypto(), blindIndex: makeBlindIndex(), hasher },
      ),
    ).rejects.toThrow(/ya existe/i);

    expect(transactionMock).not.toHaveBeenCalled();
    expect(hashMock).not.toHaveBeenCalled();
  });

  it('nunca loguea la password cruda (ni en el log de éxito ni en ningún console.*)', async () => {
    const { prisma } = makeFakePrisma({ existente: null });
    const { hasher } = makeHasher();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const warnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);
    const errorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    await runCrearUsuarioEvaluador(
      prisma,
      { email: EMAIL_VALIDO, password: PASSWORD_VALIDA },
      { crypto: makeCrypto(), blindIndex: makeBlindIndex(), hasher },
    );

    const todoElOutput = [
      ...logSpy.mock.calls,
      ...warnSpy.mock.calls,
      ...errorSpy.mock.calls,
    ]
      .flat()
      .map(String)
      .join(' ');

    expect(todoElOutput).not.toContain(PASSWORD_VALIDA);
    // Control positivo: el log de éxito SÍ existe y menciona el id/email —
    // si este assert nunca puede pasar, el anterior tampoco puede fallar.
    expect(todoElOutput).toContain('user-evaluador-nuevo');
    expect(todoElOutput).toContain(EMAIL_NORMALIZADO);

    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });
});

describe('scrubCredenciales — redacta credenciales de connection string embebidas en un mensaje', () => {
  it('reemplaza el user:pass de una URL de conexión por ***:***', () => {
    const mensaje =
      'connect ECONNREFUSED postgres://produser:s3cr3t@prod-db.example.com:5432/production';

    expect(scrubCredenciales(mensaje)).toBe(
      'connect ECONNREFUSED postgres://***:***@prod-db.example.com:5432/production',
    );
  });

  it('deja intacto un mensaje sin credenciales embebidas', () => {
    const mensaje = 'Timeout esperando respuesta del pool';

    expect(scrubCredenciales(mensaje)).toBe(mensaje);
  });
});

describe('logCrearUsuarioEvaluadorFailure — nunca loguea el DSN crudo de un error de conexión', () => {
  it('scrubbea la URL de conexión embebida en el mensaje/stack antes de loguear el fallo', () => {
    const errorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const error = new Error(
      'connect ECONNREFUSED postgres://produser:s3cr3t@prod-db.example.com:5432/production',
    );
    error.stack = error.message;

    logCrearUsuarioEvaluadorFailure(error);

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const loggedArgs = errorSpy.mock.calls[0].join(' ');
    expect(loggedArgs).not.toContain('s3cr3t');
    expect(loggedArgs).toContain('***:***');

    errorSpy.mockRestore();
  });

  it('errores no-Error (string/objeto arbitrario) también se scrubbean sin lanzar', () => {
    const errorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    logCrearUsuarioEvaluadorFailure(
      'postgres://produser:s3cr3t@prod-db.example.com/production',
    );

    const loggedArgs = errorSpy.mock.calls[0].join(' ');
    expect(loggedArgs).not.toContain('s3cr3t');

    errorSpy.mockRestore();
  });
});

describe('crear-usuario-evaluador — gates de main() (ALLOW_DESTRUCTIVE_DB / EVALUADOR_* / ENCRYPTION_KEY) (unit, sin BD)', () => {
  const originalAllow = process.env.ALLOW_DESTRUCTIVE_DB;
  const originalDbUrl = process.env.DATABASE_URL;
  const originalDirectUrl = process.env.DIRECT_URL;
  const originalConfirmProdBackfill = process.env.CONFIRM_PROD_BACKFILL;
  const originalEncryptionKey = process.env.ENCRYPTION_KEY;
  const originalEmail = process.env.EVALUADOR_EMAIL;
  const originalPassword = process.env.EVALUADOR_PASSWORD;
  const originalNombre = process.env.EVALUADOR_NOMBRE;

  afterEach(() => {
    process.env.ALLOW_DESTRUCTIVE_DB = originalAllow;
    process.env.DATABASE_URL = originalDbUrl;
    process.env.DIRECT_URL = originalDirectUrl;
    process.env.CONFIRM_PROD_BACKFILL = originalConfirmProdBackfill;
    process.env.ENCRYPTION_KEY = originalEncryptionKey;
    process.env.EVALUADOR_EMAIL = originalEmail;
    process.env.EVALUADOR_PASSWORD = originalPassword;
    process.env.EVALUADOR_NOMBRE = originalNombre;
  });

  it('sin EVALUADOR_EMAIL, falla antes de tocar el gate de BD', async () => {
    delete process.env.EVALUADOR_EMAIL;
    process.env.EVALUADOR_PASSWORD = 'lo-que-sea-1234';

    await expect(main()).rejects.toThrow(/EVALUADOR_EMAIL/);
  });

  it('sin EVALUADOR_PASSWORD, falla antes de tocar el gate de BD', async () => {
    process.env.EVALUADOR_EMAIL = 'evaluador@example.com';
    delete process.env.EVALUADOR_PASSWORD;

    await expect(main()).rejects.toThrow(/EVALUADOR_PASSWORD/);
  });

  it('se rehúsa a correr sin ALLOW_DESTRUCTIVE_DB=1 (no llega a conectar a Prisma)', async () => {
    process.env.EVALUADOR_EMAIL = 'evaluador@example.com';
    process.env.EVALUADOR_PASSWORD = 'lo-que-sea-1234';
    delete process.env.ALLOW_DESTRUCTIVE_DB;
    process.env.DATABASE_URL = 'postgres://x@dev-host/db';
    delete process.env.DIRECT_URL;

    await expect(main()).rejects.toThrow(/ALLOW_DESTRUCTIVE_DB/);
  });

  it('rechaza cadenas de conexión de producción sin CONFIRM_PROD_BACKFILL correcto', async () => {
    process.env.EVALUADOR_EMAIL = 'evaluador@example.com';
    process.env.EVALUADOR_PASSWORD = 'lo-que-sea-1234';
    process.env.ALLOW_DESTRUCTIVE_DB = '1';
    process.env.DATABASE_URL = 'postgres://x@prod-db.example.com/production';
    delete process.env.DIRECT_URL;
    delete process.env.CONFIRM_PROD_BACKFILL;

    await expect(main()).rejects.toThrow(/producción/);
  });

  it('rechaza producción si CONFIRM_PROD_BACKFILL tiene el valor esperado por OTRO backfill (namespacing por operación)', async () => {
    process.env.EVALUADOR_EMAIL = 'evaluador@example.com';
    process.env.EVALUADOR_PASSWORD = 'lo-que-sea-1234';
    process.env.ALLOW_DESTRUCTIVE_DB = '1';
    process.env.DATABASE_URL = 'postgres://x@prod-db.example.com/production';
    delete process.env.DIRECT_URL;
    process.env.CONFIRM_PROD_BACKFILL = 'us-035-email-blind-index';

    await expect(main()).rejects.toThrow(/producción/);
  });

  it('sin DATABASE_URL/DIRECT_URL definidos, falla antes de intentar conectar', async () => {
    process.env.EVALUADOR_EMAIL = 'evaluador@example.com';
    process.env.EVALUADOR_PASSWORD = 'lo-que-sea-1234';
    process.env.ALLOW_DESTRUCTIVE_DB = '1';
    delete process.env.DATABASE_URL;
    delete process.env.DIRECT_URL;

    await expect(main()).rejects.toThrow(/DATABASE_URL|DIRECT_URL/);
  });

  it('con el gate de BD superado pero sin ENCRYPTION_KEY, falla antes de construir el crypto/blindIndex/hasher', async () => {
    process.env.EVALUADOR_EMAIL = 'evaluador@example.com';
    process.env.EVALUADOR_PASSWORD = 'lo-que-sea-1234';
    process.env.ALLOW_DESTRUCTIVE_DB = '1';
    process.env.DATABASE_URL = 'postgres://x@localhost:5432/dev';
    delete process.env.DIRECT_URL;
    delete process.env.ENCRYPTION_KEY;

    await expect(main()).rejects.toThrow(/ENCRYPTION_KEY/);
  });

  it('con ENCRYPTION_KEY inválida (no decodifica a 32 bytes), falla con el mismo mensaje', async () => {
    process.env.EVALUADOR_EMAIL = 'evaluador@example.com';
    process.env.EVALUADOR_PASSWORD = 'lo-que-sea-1234';
    process.env.ALLOW_DESTRUCTIVE_DB = '1';
    process.env.DATABASE_URL = 'postgres://x@localhost:5432/dev';
    delete process.env.DIRECT_URL;
    process.env.ENCRYPTION_KEY = Buffer.alloc(16, 1).toString('base64');

    await expect(main()).rejects.toThrow(/ENCRYPTION_KEY/);
  });
});

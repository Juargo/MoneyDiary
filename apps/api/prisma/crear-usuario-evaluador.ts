import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { assertDestructiveDbAllowed } from '../src/infrastructure/persistence/db-safety';
import { AesGcmCryptoService } from '../src/infrastructure/persistence/aes-gcm-crypto.service';
import { HmacBlindIndexService } from '../src/infrastructure/persistence/hmac-blind-index.service';
import { deriveBlindIndexKey } from '../src/composition/derive-blind-index-key';
import { isValid32ByteBase64Key } from '../src/config/env';
import { Argon2PasswordHasher } from '../src/infrastructure/http/auth/argon2-password-hasher';
import { Email } from '../src/domain/value-objects/email';
import { Password } from '../src/domain/value-objects/password';
import { copiarCatalogoTemplate } from '../src/infrastructure/persistence/catalogo-template';
import type { ICryptoService } from '../src/application/ports/crypto-service.port';
import type { IBlindIndexService } from '../src/application/ports/blind-index-service.port';
import type { IPasswordHasher } from '../src/application/ports/password-hasher.port';

/**
 * crear-usuario-evaluador.ts (TFM — creación de UN usuario normal, no-demo,
 * para que un evaluador pueda loguearse vía `POST /api/auth/login`).
 *
 * Script de UNA sola corrida, supervisado — NO idempotente por diseño (una
 * segunda corrida con el mismo email debe abortar por duplicado, ver más
 * abajo), a diferencia de los backfills batch de esta carpeta.
 *
 * Reusa exactamente los mismos bloques de infraestructura que el resto del
 * grafo de auth — nada de crypto/SQL hecho a mano:
 *   - `Email.crear`/`Password.crear` (dominio) para validar los inputs.
 *   - `AesGcmCryptoService`/`HmacBlindIndexService` (ADR-013/US-035) para
 *     cifrar el email y computar su blind index — misma derivación de clave
 *     (`deriveBlindIndexKey`) que `container.ts`/`prisma/seed.ts`.
 *   - `Argon2PasswordHasher` (mismos `ARGON2_OPTIONS` que el login real).
 *   - `copiarCatalogoTemplate` (US-037) para que el usuario nazca con su
 *     catálogo de categorías/patrones — igual que cualquier alta real
 *     (signup-on-first-login, ADR-041 — ver
 *     `PrismaIdentidadGoogleRepository.crearDesdeGoogle`, el modelo de esta
 *     transacción).
 *
 * Chequeo de identidad de clave (crítico — MoneyDiary ya tuvo un incidente
 * real de ENCRYPTION_KEY .env ≠ Render, ver memoria del proyecto): antes de
 * escribir, se lee como máximo UNA fila `User` con `email` no-nulo y se
 * intenta `crypto.decrypt(...)`. Si falla, se aborta — escribir con la clave
 * equivocada dejaría un usuario cuyo email nadie puede recuperar y que
 * ensuciaría en silencio el índice de blind index. Si NINGÚN usuario tiene
 * `email`, se continúa con un warning (no hay nada contra qué verificar).
 *
 * Estructurado igual que backfill-email-blind-index.ts: `runCrearUsuarioEvaluador`
 * es la lógica pura/testeable (fake client — ver
 * crear-usuario-evaluador.spec.ts), `main()` es el wiring de script real
 * (gate + PrismaClient + crypto/blindIndex/hasher reales), guardado tras
 * `require.main === module`.
 *
 * Nunca loguea la password cruda — ni en éxito ni en error (ver
 * `logCrearUsuarioEvaluadorFailure`/`scrubCredenciales`).
 *
 * Corrida real (desde `apps/api/`, con DATABASE_URL/DIRECT_URL/ENCRYPTION_KEY
 * del ambiente destino — el `dotenv/config` de arriba carga `apps/api/.env`,
 * pero las env vars pasadas inline en el comando GANAN sobre lo que haya en
 * ese `.env`):
 *
 *   ALLOW_DESTRUCTIVE_DB=1 CONFIRM_PROD_BACKFILL=crear-usuario-evaluador \
 *     EVALUADOR_EMAIL=evaluador@ejemplo.cl EVALUADOR_PASSWORD='...' \
 *     pnpm exec tsx prisma/crear-usuario-evaluador.ts
 */

const NOMBRE_DEFAULT = 'Evaluador TFM';

export interface CrearUsuarioEvaluadorInput {
  readonly email: string;
  readonly password: string;
  readonly nombre?: string;
}

export interface CrearUsuarioEvaluadorDeps {
  readonly crypto: ICryptoService;
  readonly blindIndex: IBlindIndexService;
  readonly hasher: IPasswordHasher;
}

export interface CrearUsuarioEvaluadorResultado {
  readonly userId: string;
  readonly email: string;
}

/**
 * runCrearUsuarioEvaluador — lógica completa de la creación (testeable sin
 * BD, ver el spec). `prisma` se tipa contra el `PrismaClient` real (no un
 * cliente mínimo hecho a mano, a diferencia de `EmailBackfillClient`) porque
 * la transacción necesita `categoria`/`patronClasificacion` con la forma
 * exacta que `copiarCatalogoTemplate` espera — mismo enfoque que
 * `PrismaIdentidadGoogleRepository.crearDesdeGoogle`, del que esta función
 * está modelada. Los specs fakean con `{...} as unknown as PrismaClient`
 * (mismo patrón que `prisma-identidad-google.repository.spec.ts`).
 */
export async function runCrearUsuarioEvaluador(
  prisma: PrismaClient,
  input: CrearUsuarioEvaluadorInput,
  deps: CrearUsuarioEvaluadorDeps,
): Promise<CrearUsuarioEvaluadorResultado> {
  const emailResult = Email.crear(input.email);
  if (emailResult.isFail()) {
    throw new Error(
      'EVALUADOR_EMAIL no tiene un formato de email válido — abortando sin escribir.',
    );
  }
  const email = emailResult.getValue();

  const passwordResult = Password.crear(input.password);
  if (passwordResult.isFail()) {
    // Mensaje fijo a propósito: no se interpola nada que venga de `passwordResult`.
    throw new Error(
      'EVALUADOR_PASSWORD inválida: no cumple la política de contraseñas. Abortando sin escribir.',
    );
  }
  const password = passwordResult.getValue();

  const nombre = input.nombre ?? NOMBRE_DEFAULT;

  // Chequeo de identidad de clave (ver docstring del módulo): lee como
  // máximo una fila con email no-nulo e intenta descifrarla bajo la
  // ENCRYPTION_KEY actual. `where: { email: { not: null } }` ya excluye los
  // null a nivel de query — el `existente.email === null` de abajo es solo
  // para satisfacer el tipo (mismo patrón que backfill-email-blind-index.ts),
  // nunca ocurre en la práctica.
  const existente = await prisma.user.findFirst({
    where: { email: { not: null } },
    select: { email: true },
  });

  if (existente === null || existente.email === null) {
    console.warn(
      'crear-usuario-evaluador: no hay ningún usuario existente con email cifrado contra el cual verificar ENCRYPTION_KEY — continuando sin esa verificación.',
    );
  } else {
    try {
      deps.crypto.decrypt(existente.email);
    } catch {
      throw new Error(
        'ENCRYPTION_KEY no coincide con la clave de la BD — abortando sin escribir.',
      );
    }
  }

  const emailBlindIndex = deps.blindIndex.compute(email.valor);

  const duplicado = await prisma.user.findUnique({
    where: { emailBlindIndex },
    select: { id: true },
  });
  if (duplicado !== null) {
    throw new Error(
      'Ya existe un usuario con ese email — abortando sin escribir (no se actualiza la fila existente).',
    );
  }

  // El hash de argon2id es CPU-bound y lento: se computa ANTES de abrir la
  // transacción para no mantenerla abierta más tiempo del necesario.
  const passwordHash = await deps.hasher.hash(password.valor);

  const user = await prisma.$transaction(async (tx) => {
    const nuevo = await tx.user.create({
      data: {
        nombre,
        email: deps.crypto.encrypt(email.valor),
        emailBlindIndex,
        passwordHash,
      },
    });

    // Signup-on-first-login (ADR-041): un usuario nunca existe sin su
    // catálogo — misma mecánica que crearDesdeGoogle.
    await copiarCatalogoTemplate(tx, nuevo.id);

    return nuevo;
  });

  // Nunca loguear `password`/`passwordHash` — solo id + email normalizado.
  console.log(
    `crear-usuario-evaluador: usuario creado id=${user.id} email=${email.valor}`,
  );

  return { userId: user.id, email: email.valor };
}

/**
 * Wiring de script real: gate de seguridad ANTES de cualquier conexión a
 * Prisma (ver assertDestructiveDbAllowed) + ejecución de
 * runCrearUsuarioEvaluador. Exportado para poder testear el gate sin BD (ver
 * crear-usuario-evaluador.spec.ts).
 */
export async function main(): Promise<void> {
  const email = process.env.EVALUADOR_EMAIL;
  if (!email) {
    throw new Error(
      'crear-usuario-evaluador requiere EVALUADOR_EMAIL en el entorno.',
    );
  }

  const password = process.env.EVALUADOR_PASSWORD;
  if (!password) {
    throw new Error(
      'crear-usuario-evaluador requiere EVALUADOR_PASSWORD en el entorno.',
    );
  }

  const nombre = process.env.EVALUADOR_NOMBRE;

  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      'crear-usuario-evaluador requiere DATABASE_URL o DIRECT_URL en el entorno.',
    );
  }

  // Misma postura que backfill-email-blind-index.ts: opt-in explícito
  // (ALLOW_DESTRUCTIVE_DB=1) + rechazo de cadenas de producción, con un
  // `expected` PROPIO de esta operación (namespacing) — confirmar esta
  // creación no habilita por accidente correr otro backfill contra prod.
  assertDestructiveDbAllowed({
    connectionString,
    allowProductionAck: {
      envVar: 'CONFIRM_PROD_BACKFILL',
      expected: 'crear-usuario-evaluador',
      operation:
        'Creación del usuario evaluador TFM (login manual vía POST /api/auth/login)',
    },
  });

  const rawKey = process.env.ENCRYPTION_KEY;
  if (!rawKey || !isValid32ByteBase64Key(rawKey)) {
    throw new Error(
      'crear-usuario-evaluador requiere ENCRYPTION_KEY (base64, 32 bytes exactos — AES-256, ADR-013) en el entorno.',
    );
  }
  const encryptionKey = Buffer.from(rawKey, 'base64');
  const crypto = new AesGcmCryptoService(encryptionKey);
  const blindIndex = new HmacBlindIndexService(
    deriveBlindIndexKey(encryptionKey),
  );
  const hasher = new Argon2PasswordHasher();

  const prisma = new PrismaClient({ adapter: new PrismaPg(connectionString) });
  try {
    await runCrearUsuarioEvaluador(
      prisma,
      { email, password, ...(nombre ? { nombre } : {}) },
      { crypto, blindIndex, hasher },
    );
  } finally {
    await prisma.$disconnect();
  }
}

/** Idéntico a backfill-email-blind-index.ts (ver ahí) — sin helper compartido reusable en el repo (deuda aceptada, ver ese docstring). */
export function scrubCredenciales(mensaje: string): string {
  return mensaje.replace(/:\/\/[^:@/\s]+:[^@/\s]+@/g, '://***:***@');
}

/** Idéntico a backfill-email-blind-index.ts (ver ahí). Nunca recibe la password: esta función solo scrubbea connection strings, la password nunca llega a un mensaje de error (ver runCrearUsuarioEvaluador). */
export function logCrearUsuarioEvaluadorFailure(error: unknown): void {
  const detalle =
    error instanceof Error
      ? scrubCredenciales(error.stack ?? error.message)
      : scrubCredenciales(String(error));
  console.error('crear-usuario-evaluador falló:', detalle);
}

// Ejecuta solo como script (tsx), no al importarse en tests.
if (require.main === module) {
  main()
    .then(() => {
      console.log('crear-usuario-evaluador completado.');
    })
    .catch((error) => {
      logCrearUsuarioEvaluadorFailure(error);
      process.exitCode = 1;
    });
}

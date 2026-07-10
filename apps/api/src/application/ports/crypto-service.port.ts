/**
 * ICryptoService — port de aplicación.
 *
 * Define el contrato de cifrado/descifrado para campos sensibles de una
 * transacción (por ejemplo, la descripción). La clave de cifrado NUNCA
 * proviene de variables de entorno (ver US-011 / diseño).
 *
 * La implementación por defecto (NoOpCryptoService) es identidad: no cifra.
 * fecha/cargo/abono/bucketId permanecen en texto plano y consultables.
 */
export interface ICryptoService {
  encrypt(plaintext: string): string;
  decrypt(ciphertext: string): string;
}

/** Token de inyección — las interfaces se borran en runtime. */
export const CRYPTO_SERVICE = 'ICryptoService';

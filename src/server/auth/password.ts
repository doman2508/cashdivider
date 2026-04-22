import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const PASSWORD_KEY_LENGTH = 64;

export type StoredPassword = {
  passwordHash: string;
  passwordSalt: string;
};

async function derivePasswordHash(password: string, salt: string) {
  const derivedKey = (await scrypt(password, salt, PASSWORD_KEY_LENGTH)) as Buffer;
  return derivedKey.toString("hex");
}

export async function createStoredPassword(password: string): Promise<StoredPassword> {
  const passwordSalt = randomBytes(16).toString("hex");
  const passwordHash = await derivePasswordHash(password, passwordSalt);

  return {
    passwordHash,
    passwordSalt,
  };
}

export async function verifyStoredPassword(password: string, storedPassword: StoredPassword) {
  const incomingHash = await derivePasswordHash(password, storedPassword.passwordSalt);
  const incomingBuffer = Buffer.from(incomingHash, "hex");
  const expectedBuffer = Buffer.from(storedPassword.passwordHash, "hex");

  if (incomingBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(incomingBuffer, expectedBuffer);
}

import argon2 from "argon2";

/** Argon2id: variante recomendada para hashing de senha (resistente a GPU e a side-channel). */
export function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, { type: argon2.argon2id });
}

export function verifyPassword(hash: string, plain: string): Promise<boolean> {
  return argon2.verify(hash, plain);
}

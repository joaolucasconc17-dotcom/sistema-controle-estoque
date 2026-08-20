import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { config } from "../config.js";

/**
 * Cifra/decifra a connection string de cada tenant em repouso no control
 * plane (AES-256-GCM). Formato de saida: "<iv>:<authTag>:<ciphertext>" em
 * hex, tudo em uma string para caber na coluna `encryptedUrl`.
 */
const ALGORITHM = "aes-256-gcm";

function getKey(): Buffer {
  return Buffer.from(config.DATASOURCE_ENCRYPTION_KEY, "hex");
}

export function encryptDatasourceUrl(plainUrl: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plainUrl, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${ciphertext.toString("hex")}`;
}

export function decryptDatasourceUrl(encrypted: string): string {
  const [ivHex, authTagHex, ciphertextHex] = encrypted.split(":");
  if (!ivHex || !authTagHex || !ciphertextHex) {
    throw new Error("Formato de connection string cifrada invalido");
  }
  const decipher = createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextHex, "hex")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}

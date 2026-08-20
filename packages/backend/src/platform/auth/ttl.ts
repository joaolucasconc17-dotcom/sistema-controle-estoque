/** Converte strings simples tipo "15m", "30d", "12h", "45s" em milissegundos. */
export function parseTtlToMs(ttl: string): number {
  const match = /^(\d+)(s|m|h|d)$/.exec(ttl.trim());
  if (!match) throw new Error(`TTL invalido: "${ttl}" (use algo como 15m, 12h, 30d)`);
  const value = Number(match[1]);
  const unitMs = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2] as "s" | "m" | "h" | "d"];
  return value * unitMs;
}

export function formatMoney(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "-";
  const n = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(n)) return "-";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatQuantity(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "-";
  const n = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(n)) return "-";
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 4 });
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "-";
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleDateString("pt-BR");
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "-";
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleString("pt-BR");
}

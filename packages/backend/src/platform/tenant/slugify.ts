export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove acentos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40);
}

/** Nome de banco Postgres valido a partir do slug: so [a-z0-9_], sempre com prefixo. */
export function tenantDatabaseName(slug: string): string {
  return `tenant_${slug.replace(/-/g, "_")}`;
}

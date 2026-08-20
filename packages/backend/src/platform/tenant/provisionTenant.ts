/**
 * CLI de provisionamento de empresa.
 *
 * Uso:
 *   npm run provision:tenant -- \
 *     --nome "Empresa Teste" \
 *     --owner-nome "Fulano" \
 *     --owner-email fulano@empresa.com \
 *     --owner-senha "SenhaForte123!" \
 *     [--slug empresa-teste]
 */
import { tenantProvisioningService } from "./TenantProvisioningService.js";
import { controlClient } from "../controlClient.js";
import { logger } from "../logger.js";

function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token?.startsWith("--")) {
      const key = token.slice(2);
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new Error(`Flag --${key} precisa de um valor`);
      }
      args[key] = value;
      i++;
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const companyName = args["nome"];
  const ownerName = args["owner-nome"];
  const ownerEmail = args["owner-email"];
  const ownerPassword = args["owner-senha"];

  if (!companyName || !ownerName || !ownerEmail || !ownerPassword) {
    console.error(
      "Uso: npm run provision:tenant -- --nome \"Empresa\" --owner-nome \"Nome\" --owner-email email@empresa.com --owner-senha \"SenhaForte123!\" [--slug empresa]",
    );
    process.exit(1);
  }

  const result = await tenantProvisioningService.provision({
    companyName,
    slug: args["slug"],
    ownerName,
    ownerEmail,
    ownerPassword,
  });

  logger.info(result, "empresa provisionada");
  console.log(`\nEmpresa "${companyName}" provisionada com sucesso.`);
  console.log(`  tenantId: ${result.tenantId}`);
  console.log(`  slug:     ${result.slug}`);
  console.log(`  banco:    ${result.databaseName}`);
  console.log(`\nLogin: ${ownerEmail} (senha informada) na empresa "${result.slug}"`);
}

main()
  .catch((err) => {
    logger.error({ err }, "falha no provisionamento");
    process.exitCode = 1;
  })
  .finally(async () => {
    await controlClient.$disconnect();
  });

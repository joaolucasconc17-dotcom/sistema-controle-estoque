import { spawn, type StdioOptions } from "node:child_process";

/**
 * Roda `prisma migrate deploy` como subprocesso contra um banco de tenant
 * especifico (via env var, nao via --schema-url — o Prisma CLI so le a
 * connection string do `env()` declarado no datasource do schema).
 *
 * No Windows, `npx` resolve para um `.cmd`, que o `spawn()` do Node so
 * consegue executar atraves de um shell (senao falha com EINVAL). Quando
 * `shell:true` e usado, o comando precisa ir como STRING UNICA — passar um
 * array de args nesse modo aciona o aviso de deprecacao DEP0190 do Node
 * sobre pre-processamento inseguro de argumentos.
 */
export function spawnPrismaMigrateDeploy(params: {
  schemaPath: string;
  cwd: string;
  databaseUrl: string;
  stdio: StdioOptions;
}): Promise<void> {
  const { schemaPath, cwd, databaseUrl, stdio } = params;
  const env = { ...process.env, TENANT_DATABASE_URL: databaseUrl };

  return new Promise((resolve, reject) => {
    const child =
      process.platform === "win32"
        ? spawn(`npx prisma migrate deploy --schema ${schemaPath}`, { cwd, env, stdio, shell: true })
        : spawn("npx", ["prisma", "migrate", "deploy", "--schema", schemaPath], { cwd, env, stdio });

    let stderr = "";
    if (stdio === "pipe") child.stderr?.on("data", (chunk) => (stderr += chunk.toString()));

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr || `prisma migrate deploy saiu com codigo ${code}`));
    });
  });
}

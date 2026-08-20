import type { FastifyInstance } from "fastify";
import { loginRequestSchema, refreshRequestSchema } from "@estoque/shared";
import { authService } from "../../platform/auth/AuthService.js";
import { authenticate } from "../../platform/http/authenticate.js";

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post("/auth/login", async (request, reply) => {
    const body = loginRequestSchema.parse(request.body);
    const result = await authService.login(body);
    reply.status(200).send(result);
  });

  app.post("/auth/refresh", async (request, reply) => {
    const body = refreshRequestSchema.parse(request.body);
    const result = await authService.refresh(body.refreshToken);
    reply.status(200).send(result);
  });

  app.post("/auth/logout", async (request, reply) => {
    const body = refreshRequestSchema.parse(request.body);
    await authService.logout(body.refreshToken);
    reply.status(204).send();
  });

  app.get("/auth/me", { preHandler: authenticate }, async (request, reply) => {
    reply.status(200).send({ auth: request.auth });
  });
}

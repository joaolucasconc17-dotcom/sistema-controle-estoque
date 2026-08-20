import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createReservationSchema } from "@estoque/shared";
import { authenticate } from "../../platform/http/authenticate.js";
import { requirePermission } from "../../platform/http/authorize.js";
import { reservationService } from "./ReservationService.js";

const idParamSchema = z.object({ id: z.string().uuid() });

export async function reservationRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authenticate);

  app.post(
    "/reservations",
    { preHandler: requirePermission("inventory.movement.create") },
    async (request, reply) => {
      const body = createReservationSchema.parse(request.body);
      const reservation = await reservationService.create(body, request.auth!.userId);
      reply.status(201).send(reservation);
    },
  );

  app.post(
    "/reservations/:id/cancel",
    { preHandler: requirePermission("inventory.movement.create") },
    async (request) => {
      const { id } = idParamSchema.parse(request.params);
      return reservationService.cancel(id);
    },
  );

  app.post(
    "/reservations/:id/fulfill",
    { preHandler: requirePermission("inventory.movement.create") },
    async (request) => {
      const { id } = idParamSchema.parse(request.params);
      return reservationService.fulfill(id, request.auth!.userId);
    },
  );
}

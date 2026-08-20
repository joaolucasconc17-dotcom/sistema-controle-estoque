import pino from "pino";
import { config } from "./config.js";

export const logger = pino({
  level: config.LOG_LEVEL,
  transport:
    config.NODE_ENV === "development"
      ? { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss" } }
      : undefined,
  redact: ["req.headers.authorization", "*.password", "*.passwordHash", "*.token"],
});

export function childLogger(bindings: Record<string, unknown>) {
  return logger.child(bindings);
}

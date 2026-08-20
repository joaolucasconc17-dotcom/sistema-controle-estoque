import { z } from "zod";
import { ROLE_CODES, type Permission } from "../enums.js";

export const loginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  // Necessario quando o e-mail existe em mais de uma empresa (mesmo dono,
  // multiplas empresas). Ausente, o backend resolve pelo unico tenant do email.
  tenantSlug: z.string().min(1).optional(),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: AuthenticatedUser;
}

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  tenantId: string;
  tenantSlug: string;
  roles: (typeof ROLE_CODES)[number][];
  permissions: Permission[];
}

export const refreshRequestSchema = z.object({
  refreshToken: z.string().min(1),
});
export type RefreshRequest = z.infer<typeof refreshRequestSchema>;

import jwt from "jsonwebtoken";
import type { Permission, RoleCode } from "@estoque/shared";
import { config } from "../config.js";

export interface AccessTokenPayload {
  sub: string; // userId
  tenantId: string;
  tenantSlug: string;
  roles: RoleCode[];
  permissions: Permission[];
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, config.JWT_ACCESS_SECRET, { expiresIn: config.JWT_ACCESS_TTL as jwt.SignOptions["expiresIn"] });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, config.JWT_ACCESS_SECRET) as AccessTokenPayload & jwt.JwtPayload;
}

/** Segundos de vida do access token — usado para preencher `expiresIn` na resposta de login. */
export function accessTokenTtlSeconds(): number {
  const decoded = jwt.decode(
    signAccessToken({ sub: "probe", tenantId: "probe", tenantSlug: "probe", roles: [], permissions: [] }),
  ) as jwt.JwtPayload;
  return (decoded.exp ?? 0) - (decoded.iat ?? 0);
}

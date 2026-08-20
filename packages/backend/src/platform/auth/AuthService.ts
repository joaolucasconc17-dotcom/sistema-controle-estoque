import { v4 as uuid } from "uuid";
import type { LoginResponse } from "@estoque/shared";
import type { Permission, RoleCode } from "@estoque/shared";
import { tenantRegistry } from "../tenant/TenantRegistry.js";
import { tenantConnectionManager } from "../tenant/TenantConnectionManager.js";
import { AppError } from "../errors.js";
import { config } from "../config.js";
import { childLogger } from "../logger.js";
import { verifyPassword } from "./password.js";
import { signAccessToken, accessTokenTtlSeconds } from "./jwt.js";
import { generateRefreshToken, hashRefreshToken, parseTenantIdFromRefreshToken } from "./refreshToken.js";
import { parseTtlToMs } from "./ttl.js";

const log = childLogger({ module: "AuthService" });

interface LoginParams {
  email: string;
  password: string;
  tenantSlug?: string;
}

export class AuthService {
  async login(params: LoginParams): Promise<LoginResponse> {
    const candidates = await tenantRegistry.resolveTenantsByEmail(params.email.toLowerCase());
    if (candidates.length === 0) throw AppError.unauthorized("Credenciais invalidas");

    const descriptor = params.tenantSlug
      ? candidates.find((c) => c.slug === params.tenantSlug)
      : candidates.length === 1
        ? candidates[0]
        : undefined;

    if (!descriptor) {
      if (candidates.length > 1) {
        throw AppError.validation(
          "Este e-mail existe em mais de uma empresa. Informe tenantSlug.",
          { tenants: candidates.map((c) => ({ slug: c.slug, name: c.name })) },
        );
      }
      throw AppError.unauthorized("Credenciais invalidas");
    }

    const db = await tenantConnectionManager.getClient(descriptor.id);
    const user = await db.user.findUnique({
      where: { email: params.email.toLowerCase() },
      include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } },
    });

    if (!user || !user.active || !(await verifyPassword(user.passwordHash, params.password))) {
      throw AppError.unauthorized("Credenciais invalidas");
    }

    const roles = user.roles.map((ur) => ur.role.code as RoleCode);
    const permissions = [
      ...new Set(
        user.roles.flatMap((ur) => ur.role.permissions.map((rp) => rp.permission.code as Permission)),
      ),
    ];

    const accessToken = signAccessToken({
      sub: user.id,
      tenantId: descriptor.id,
      tenantSlug: descriptor.slug,
      roles,
      permissions,
    });

    const { token: refreshToken, hash } = generateRefreshToken(descriptor.id);
    await db.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hash,
        familyId: uuid(),
        expiresAt: new Date(Date.now() + parseTtlToMs(config.JWT_REFRESH_TTL)),
      },
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: accessTokenTtlSeconds(),
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        tenantId: descriptor.id,
        tenantSlug: descriptor.slug,
        roles,
        permissions,
      },
    };
  }

  /**
   * Rotaciona o refresh token. Se o hash recebido ja tiver sido consumido
   * (revokedAt preenchido), trata como indicio de furto e derruba TODA a
   * familia — inclusive o token que acabou de ser apresentado.
   */
  async refresh(refreshToken: string): Promise<LoginResponse> {
    const tenantId = parseTenantIdFromRefreshToken(refreshToken);
    if (!tenantId) throw AppError.unauthorized("Refresh token invalido");

    const db = await tenantConnectionManager.getClient(tenantId);
    const hash = hashRefreshToken(refreshToken);
    const stored = await db.refreshToken.findUnique({
      where: { tokenHash: hash },
      include: {
        user: {
          include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } },
        },
      },
    });

    if (!stored || stored.expiresAt < new Date()) {
      throw AppError.unauthorized("Refresh token invalido ou expirado");
    }

    if (stored.revokedAt) {
      log.warn({ userId: stored.userId, familyId: stored.familyId }, "reuso de refresh token detectado — revogando familia inteira");
      await db.refreshToken.updateMany({
        where: { familyId: stored.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw AppError.unauthorized("Sessao invalidada por seguranca. Faca login novamente.");
    }

    const descriptor = await tenantRegistry.resolveById(tenantId);
    const { token: newRefreshToken, hash: newHash } = generateRefreshToken(tenantId);

    await db.$transaction([
      db.refreshToken.update({
        where: { id: stored.id },
        data: { revokedAt: new Date(), replacedByHash: newHash },
      }),
      db.refreshToken.create({
        data: {
          userId: stored.userId,
          tokenHash: newHash,
          familyId: stored.familyId,
          expiresAt: new Date(Date.now() + parseTtlToMs(config.JWT_REFRESH_TTL)),
        },
      }),
    ]);

    const roles = stored.user.roles.map((ur) => ur.role.code as RoleCode);
    const permissions = [
      ...new Set(
        stored.user.roles.flatMap((ur) => ur.role.permissions.map((rp) => rp.permission.code as Permission)),
      ),
    ];

    const accessToken = signAccessToken({
      sub: stored.userId,
      tenantId: descriptor.id,
      tenantSlug: descriptor.slug,
      roles,
      permissions,
    });

    return {
      accessToken,
      refreshToken: newRefreshToken,
      expiresIn: accessTokenTtlSeconds(),
      user: {
        id: stored.user.id,
        name: stored.user.name,
        email: stored.user.email,
        tenantId: descriptor.id,
        tenantSlug: descriptor.slug,
        roles,
        permissions,
      },
    };
  }

  async logout(refreshToken: string): Promise<void> {
    const tenantId = parseTenantIdFromRefreshToken(refreshToken);
    if (!tenantId) return;
    const db = await tenantConnectionManager.getClient(tenantId);
    const hash = hashRefreshToken(refreshToken);
    const stored = await db.refreshToken.findUnique({ where: { tokenHash: hash } });
    if (stored) {
      await db.refreshToken.updateMany({
        where: { familyId: stored.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
  }
}

export const authService = new AuthService();

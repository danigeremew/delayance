import {
  ConflictException,
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash, createPublicKey, randomBytes, verify as verifySignature } from 'node:crypto';
import { z } from 'zod';
import nodemailer from 'nodemailer';
import { eq } from 'drizzle-orm';
import { AppConfigService } from '../config/app-config.service';
import { DatabaseService } from '../database/database.service';
import { RedisService } from '../redis/redis.service';
import { auditEvents, users } from '../database/schema';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}
export interface AuthSession {
  accessToken: string;
  expiresIn: number;
  user: AuthUser;
}
interface Claims {
  sub: string;
  email?: string;
  name?: string;
  preferred_username?: string;
  iss: string;
  aud?: string | string[];
  exp: number;
  nonce?: string;
}
const tokenResponse = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expires_in: z.number().int().positive(),
  refresh_expires_in: z.number().int().nonnegative().optional(),
});
const adminTokenResponse = z.object({ access_token: z.string().min(1) });
const keycloakUserResponse = z.array(
  z.object({ id: z.string(), email: z.string().optional() }).passthrough(),
);
interface AuthTokens extends AuthSession {
  refreshToken: string;
  refreshExpiresIn?: number;
}

interface Jwk {
  kty: string;
  n?: string;
  e?: string;
  kid?: string;
  alg?: string;
  use?: string;
}

@Injectable()
export class AuthService {
  private jwks: { expiresAt: number; keys: Record<string, Jwk> } | null = null;
  constructor(
    private readonly database: DatabaseService,
    private readonly config: AppConfigService,
    private readonly redis: RedisService,
  ) {}
  private get issuer() {
    return this.config.env.KEYCLOAK_ISSUER_URL.replace(/\/$/, '');
  }
  private get tokenUrl() {
    return `${this.issuer}/protocol/openid-connect/token`;
  }
  private get adminUsersUrl() {
    return `${this.config.env.KEYCLOAK_BASE_URL.replace(/\/$/, '')}/admin/realms/${encodeURIComponent(this.config.env.KEYCLOAK_REALM)}/users`;
  }
  private async request(url: string, init?: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } catch {
      throw new ServiceUnavailableException('Identity provider unavailable');
    } finally {
      clearTimeout(timeout);
    }
  }
  private async json<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await this.request(url, init);
    if (!response.ok) throw new ServiceUnavailableException('Identity provider unavailable');
    try {
      return (await response.json()) as T;
    } catch {
      throw new ServiceUnavailableException('Invalid identity provider response');
    }
  }
  private async passwordGrant(email: string, password: string): Promise<AuthTokens> {
    const response = await this.request(this.tokenUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'password',
        client_id: this.config.env.KEYCLOAK_CLIENT_ID,
        client_secret: this.config.env.KEYCLOAK_CLIENT_SECRET,
        username: email,
        password,
        scope: 'openid profile email',
      }),
    });
    if (response.status === 400 || response.status === 401)
      throw new UnauthorizedException('Invalid email or password');
    if (!response.ok) throw new ServiceUnavailableException('Identity provider unavailable');
    let tokens: z.infer<typeof tokenResponse>;
    try {
      tokens = tokenResponse.parse(await response.json());
    } catch {
      throw new ServiceUnavailableException('Invalid identity provider response');
    }
    const user = await this.provision(await this.verifyToken(tokens.access_token));
    return {
      accessToken: tokens.access_token,
      expiresIn: tokens.expires_in,
      refreshToken: tokens.refresh_token,
      refreshExpiresIn: tokens.refresh_expires_in,
      user,
    };
  }
  async login(input: { email: string; password: string }) {
    return this.passwordGrant(input.email, input.password);
  }
  private async adminToken(): Promise<string> {
    const response = await this.request(this.tokenUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: this.config.env.KEYCLOAK_PROVISIONER_CLIENT_ID,
        client_secret: this.config.env.KEYCLOAK_PROVISIONER_CLIENT_SECRET,
      }),
    });
    if (!response.ok) throw new ServiceUnavailableException('Account management unavailable');
    try {
      return adminTokenResponse.parse(await response.json()).access_token;
    } catch {
      throw new ServiceUnavailableException('Invalid identity provider response');
    }
  }
  async register(input: { email: string; firstName: string; lastName: string; password: string }) {
    // Never attach an existing local account to a new identity on the basis of email.
    const existing = await this.database.db.query.users.findFirst({
      where: eq(users.email, input.email),
    });
    if (existing) throw new ConflictException('Email already belongs to a Delayance account');
    const adminToken = await this.adminToken();
    const response = await this.request(this.adminUsersUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: input.email,
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
        enabled: true,
        emailVerified: false,
        credentials: [{ type: 'password', value: input.password, temporary: false }],
      }),
    });
    if (response.status === 409)
      throw new ConflictException('An account with this email already exists');
    if (response.status === 400)
      throw new BadRequestException('Account details do not meet the identity provider policy');
    if (!response.ok) throw new ServiceUnavailableException('Account creation unavailable');
    return this.passwordGrant(input.email, input.password);
  }
  private async findIdentity(email: string, adminToken: string): Promise<string | null> {
    const url = new URL(this.adminUsersUrl);
    url.searchParams.set('email', email);
    url.searchParams.set('exact', 'true');
    const response = await this.request(url.toString(), {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    if (!response.ok) throw new ServiceUnavailableException('Account management unavailable');
    let identities: z.infer<typeof keycloakUserResponse>;
    try {
      identities = keycloakUserResponse.parse(await response.json());
    } catch {
      throw new ServiceUnavailableException('Invalid identity provider response');
    }
    return identities.find((user) => user.email?.toLowerCase() === email)?.id ?? null;
  }
  async forgotPassword(email: string): Promise<void> {
    // Always return the same response, including when identity lookup or mail delivery fails.
    try {
      const adminToken = await this.adminToken();
      const subject = await this.findIdentity(email, adminToken);
      if (!subject || !this.config.env.SMTP_HOST || !this.config.env.SMTP_FROM) return;
      const token = randomBytes(32).toString('base64url');
      const hash = createHash('sha256').update(token).digest('hex');
      await this.redis.client.set(`password-reset:${hash}`, subject, 'EX', 900, 'NX');
      const link = `${this.config.env.WEB_ORIGIN}/reset-password#token=${encodeURIComponent(token)}`;
      const transporter = nodemailer.createTransport({
        host: this.config.env.SMTP_HOST,
        port: this.config.env.SMTP_PORT,
        secure: this.config.env.SMTP_SECURE,
        auth:
          this.config.env.SMTP_USER && this.config.env.SMTP_PASSWORD
            ? { user: this.config.env.SMTP_USER, pass: this.config.env.SMTP_PASSWORD }
            : undefined,
      });
      await transporter.sendMail({
        from: this.config.env.SMTP_FROM,
        to: email,
        subject: 'Reset your Delayance password',
        text: `Open this link to reset your password. It expires in 15 minutes.\n\n${link}`,
      });
    } catch {
      /* intentionally identical response for all addresses and provider failures */
    }
  }
  async resetPassword(input: { token: string; password: string }): Promise<void> {
    const hash = createHash('sha256').update(input.token).digest('hex');
    const adminToken = await this.adminToken();
    const subject = await this.redis.client.getdel(`password-reset:${hash}`);
    if (!subject) throw new BadRequestException('Invalid or expired reset link');
    const response = await this.request(
      `${this.adminUsersUrl}/${encodeURIComponent(subject)}/reset-password`,
      {
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'password', value: input.password, temporary: false }),
      },
    );
    if (!response.ok) throw new ServiceUnavailableException('Password reset unavailable');
  }
  async refresh(
    refreshToken: string,
  ): Promise<AuthSession & { refreshToken: string; refreshExpiresIn?: number }> {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: this.config.env.KEYCLOAK_CLIENT_ID,
      client_secret: this.config.env.KEYCLOAK_CLIENT_SECRET,
      refresh_token: refreshToken,
    });
    const response = await this.request(this.tokenUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (response.status === 400 || response.status === 401)
      throw new UnauthorizedException('Invalid refresh session');
    if (!response.ok) throw new ServiceUnavailableException('Identity provider unavailable');
    let tokens: z.infer<typeof tokenResponse>;
    try {
      tokens = tokenResponse.parse(await response.json());
    } catch {
      throw new ServiceUnavailableException('Invalid identity provider response');
    }
    const claims = await this.verifyToken(tokens.access_token);
    const user = await this.provision(claims);
    return {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? refreshToken,
      expiresIn: tokens.expires_in,
      refreshExpiresIn: tokens.refresh_expires_in,
      user,
    };
  }
  async logout(refreshToken?: string) {
    if (!refreshToken) return { providerLogoutComplete: true };
    const body = new URLSearchParams({
      client_id: this.config.env.KEYCLOAK_CLIENT_ID,
      client_secret: this.config.env.KEYCLOAK_CLIENT_SECRET,
      refresh_token: refreshToken,
    });
    try {
      const response = await this.request(`${this.issuer}/protocol/openid-connect/revoke`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body,
      });
      return { providerLogoutComplete: response.ok };
    } catch {
      return { providerLogoutComplete: false };
    }
  }
  async me(userId: string) {
    const user = await this.database.db.query.users.findFirst({ where: eq(users.id, userId) });
    if (!user) throw new UnauthorizedException();
    return { id: user.id, email: user.email, name: user.name };
  }
  async updateProfile(userId: string, input: { name?: string }) {
    const name = input.name?.trim();
    if (!name) throw new BadRequestException('Name is required');
    const [user] = await this.database.db
      .update(users)
      .set({ name, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    if (!user) throw new UnauthorizedException();
    await this.database.db.insert(auditEvents).values({
      actorId: userId,
      action: 'user.profile_updated',
      entityType: 'user',
      entityId: userId,
    });
    return { id: user.id, email: user.email, name: user.name };
  }
  async authenticateAccessToken(token: string) {
    const claims = await this.verifyToken(token);
    const user = await this.database.db.query.users.findFirst({
      where: eq(users.keycloakSubject, claims.sub),
    });
    if (!user) throw new UnauthorizedException('Identity is not provisioned');
    return { userId: user.id, email: user.email, name: user.name };
  }
  private async provision(claims: Claims): Promise<AuthUser> {
    if (!claims.sub || !claims.email)
      throw new UnauthorizedException('Keycloak token has no usable identity');
    const email = claims.email.toLowerCase();
    const existing = await this.database.db.query.users.findFirst({
      where: eq(users.keycloakSubject, claims.sub),
    });
    if (existing) {
      if (existing.email !== email) {
        const conflict = await this.database.db.query.users.findFirst({
          where: eq(users.email, email),
        });
        if (conflict && conflict.id !== existing.id)
          throw new ConflictException('Email belongs to another user');
        await this.database.db
          .update(users)
          .set({ email, updatedAt: new Date() })
          .where(eq(users.id, existing.id));
      }
      return { id: existing.id, email, name: existing.name };
    }
    const emailOwner = await this.database.db.query.users.findFirst({
      where: eq(users.email, email),
    });
    if (emailOwner) throw new ConflictException('Email already belongs to a Delayance account');
    try {
      const [created] = await this.database.db
        .insert(users)
        .values({
          email,
          name: claims.name?.trim() || claims.preferred_username || email,
          keycloakSubject: claims.sub,
          passwordHash: null,
        })
        .returning();
      if (!created) throw new Error('User creation failed');
      await this.database.db.insert(auditEvents).values({
        actorId: created.id,
        action: 'user.registered',
        entityType: 'user',
        entityId: created.id,
      });
      return { id: created.id, email: created.email, name: created.name };
    } catch (error) {
      if (String(error).includes('users_keycloak_subject')) {
        const retry = await this.database.db.query.users.findFirst({
          where: eq(users.keycloakSubject, claims.sub),
        });
        if (retry) return { id: retry.id, email: retry.email, name: retry.name };
      }
      throw error;
    }
  }
  private async verifyToken(token: string): Promise<Claims> {
    const [h, p, s] = token.split('.');
    if (!h || !p || !s) throw new UnauthorizedException('Malformed access token');
    const header = JSON.parse(Buffer.from(h, 'base64url').toString()) as {
      alg?: string;
      kid?: string;
    };
    const claims = JSON.parse(Buffer.from(p, 'base64url').toString()) as Claims;
    if (
      header.alg !== 'RS256' ||
      !header.kid ||
      claims.iss !== this.issuer ||
      !claims.exp ||
      claims.exp <= Math.floor(Date.now() / 1000)
    )
      throw new UnauthorizedException('Invalid access token');
    const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!aud.includes(this.config.env.KEYCLOAK_CLIENT_ID))
      throw new UnauthorizedException('Invalid access token audience');
    const key = await this.getJwk(header.kid);
    const data = Buffer.from(`${h}.${p}`);
    const sig = Buffer.from(s, 'base64url');
    if (
      !key.n ||
      !key.e ||
      !verifySignature(
        'RSA-SHA256',
        data,
        createPublicKey({ key: { kty: key.kty, n: key.n, e: key.e }, format: 'jwk' }),
        sig,
      )
    )
      throw new UnauthorizedException('Invalid access token signature');
    return claims;
  }
  private async getJwk(kid: string): Promise<Jwk> {
    if (!this.jwks || this.jwks.expiresAt < Date.now() || !this.jwks.keys[kid]) {
      const data = await this.json<{ keys: Jwk[] }>(`${this.issuer}/protocol/openid-connect/certs`);
      this.jwks = {
        expiresAt: Date.now() + 300_000,
        keys: Object.fromEntries(data.keys.filter((k) => k.kid).map((k) => [k.kid as string, k])),
      };
    }
    const key = this.jwks.keys[kid];
    if (!key) throw new UnauthorizedException('Unknown token signing key');
    return key;
  }
}

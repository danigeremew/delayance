import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { z } from 'zod';
import nodemailer from 'nodemailer';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { AppConfigService } from '../config/app-config.service';
import { DatabaseService } from '../database/database.service';
import { RedisService } from '../redis/redis.service';
import { auditEvents, sessions, users } from '../database/schema';
import { hashPassword, verifyPassword } from './password';

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
interface AuthTokens extends AuthSession {
  refreshToken: string;
  refreshExpiresIn: number;
}
const ACCESS_SECONDS = 900;
const SESSION_SECONDS = 86400;
const claimsSchema = z.object({ sub: z.string().uuid(), sid: z.string().uuid() });
const refreshSchema = z.string().regex(/^[a-f0-9-]{36}\.[A-Za-z0-9_-]{43}$/);
const digest = (token: string) => createHash('sha256').update(token).digest('hex');
const publicUser = (user: AuthUser): AuthUser => ({
  id: user.id,
  email: user.email,
  name: user.name,
});
function refreshId(token: string): string | null {
  if (!refreshSchema.safeParse(token).success) return null;
  const id = token.split('.')[0];
  return z.string().uuid().safeParse(id).success ? id! : null;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly database: DatabaseService,
    private readonly config: AppConfigService,
    private readonly redis: RedisService,
  ) {}
  private findUser(email: string) {
    return this.database.db.query.users.findFirst({
      where: sql`lower(${users.email}) = ${email.trim().toLowerCase()}`,
    });
  }
  private async accessToken(userId: string, sessionId: string) {
    return new SignJWT({ sid: sessionId })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(userId)
      .setIssuer('delayance')
      .setAudience('delayance-api')
      .setIssuedAt()
      .setExpirationTime(`${ACCESS_SECONDS}s`)
      .sign(new TextEncoder().encode(this.config.env.AUTH_JWT_SECRET));
  }
  private async startSession(user: AuthUser): Promise<AuthTokens> {
    const sessionId = randomUUID();
    const refreshToken = `${sessionId}.${randomBytes(32).toString('base64url')}`;
    await this.database.db.insert(sessions).values({
      id: sessionId,
      userId: user.id,
      refreshTokenHash: digest(refreshToken),
      expiresAt: new Date(Date.now() + SESSION_SECONDS * 1000),
    });
    return {
      accessToken: await this.accessToken(user.id, sessionId),
      expiresIn: ACCESS_SECONDS,
      refreshToken,
      refreshExpiresIn: SESSION_SECONDS,
      user: publicUser(user),
    };
  }
  async login(input: { email: string; password: string }): Promise<AuthTokens> {
    const user = await this.findUser(input.email);
    const valid = await verifyPassword(input.password, user?.passwordHash ?? null);
    if (!user || !valid) throw new UnauthorizedException('Invalid email or password');
    return this.startSession(user);
  }
  async register(input: {
    email: string;
    firstName: string;
    lastName: string;
    password: string;
  }): Promise<AuthTokens> {
    const email = input.email.trim().toLowerCase();
    if (await this.findUser(email))
      throw new ConflictException('An account with this email already exists');
    const passwordHash = await hashPassword(input.password);
    const [user] = await this.database.db
      .insert(users)
      .values({
        email,
        name: `${input.firstName.trim()} ${input.lastName.trim()}`.trim(),
        passwordHash,
      })
      .onConflictDoNothing()
      .returning();
    if (!user) throw new ConflictException('An account with this email already exists');
    await this.database.db.insert(auditEvents).values({
      actorId: user.id,
      action: 'user.registered',
      entityType: 'user',
      entityId: user.id,
    });
    return this.startSession(user);
  }
  async refresh(refreshToken: string): Promise<AuthTokens> {
    const id = refreshId(refreshToken);
    if (!id) throw new UnauthorizedException('Invalid refresh session');
    const session = await this.database.db.query.sessions.findFirst({ where: eq(sessions.id, id) });
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      !/^[a-f0-9]{64}$/.test(session.refreshTokenHash) ||
      !timingSafeEqual(
        Buffer.from(session.refreshTokenHash, 'hex'),
        Buffer.from(digest(refreshToken), 'hex'),
      )
    )
      throw new UnauthorizedException('Invalid refresh session');
    const user = await this.me(session.userId);
    const next = `${id}.${randomBytes(32).toString('base64url')}`;
    const updated = await this.database.db
      .update(sessions)
      .set({ refreshTokenHash: digest(next) })
      .where(
        and(
          eq(sessions.id, id),
          eq(sessions.refreshTokenHash, digest(refreshToken)),
          isNull(sessions.revokedAt),
          gt(sessions.expiresAt, new Date()),
        ),
      )
      .returning({ id: sessions.id });
    if (!updated.length) throw new UnauthorizedException('Invalid refresh session');
    return {
      accessToken: await this.accessToken(user.id, id),
      expiresIn: ACCESS_SECONDS,
      refreshToken: next,
      refreshExpiresIn: Math.max(0, Math.floor((session.expiresAt.getTime() - Date.now()) / 1000)),
      user,
    };
  }
  async logout(refreshToken?: string) {
    const id = refreshToken ? refreshId(refreshToken) : null;
    if (id && refreshToken)
      await this.database.db
        .update(sessions)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(sessions.id, id),
            eq(sessions.refreshTokenHash, digest(refreshToken)),
            isNull(sessions.revokedAt),
          ),
        );
    return { ok: true };
  }
  async authenticateAccessToken(token: string) {
    let claims: z.infer<typeof claimsSchema>;
    try {
      if (token.length > 8192) throw new Error('Invalid token size');
      const { payload } = await jwtVerify(
        token,
        new TextEncoder().encode(this.config.env.AUTH_JWT_SECRET),
        {
          algorithms: ['HS256'],
          issuer: 'delayance',
          audience: 'delayance-api',
          requiredClaims: ['exp', 'iat', 'sub', 'sid'],
        },
      );
      claims = claimsSchema.parse(payload);
    } catch {
      throw new UnauthorizedException('Invalid access token');
    }
    const session = await this.database.db.query.sessions.findFirst({
      where: and(
        eq(sessions.id, claims.sid),
        eq(sessions.userId, claims.sub),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, new Date()),
      ),
    });
    if (
      !session ||
      session.userId !== claims.sub ||
      session.revokedAt ||
      session.expiresAt <= new Date()
    )
      throw new UnauthorizedException('Session expired or revoked');
    const user = await this.me(claims.sub);
    return { userId: user.id, email: user.email, name: user.name };
  }
  async me(userId: string): Promise<AuthUser> {
    const user = await this.database.db.query.users.findFirst({ where: eq(users.id, userId) });
    if (!user) throw new UnauthorizedException('Account unavailable');
    return publicUser(user);
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
    return publicUser(user);
  }
  async forgotPassword(email: string): Promise<void> {
    try {
      const user = await this.findUser(email);
      if (!user || !this.config.env.SMTP_HOST || !this.config.env.SMTP_FROM) return;
      const token = randomBytes(32).toString('base64url');
      await this.redis.client.set(
        `local-password-reset:${digest(token)}`,
        user.id,
        'EX',
        900,
        'NX',
      );
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
        to: user.email,
        subject: 'Reset your Delayance password',
        text: `Open this link to reset your password. It expires in 15 minutes.\n\n${link}`,
      });
    } catch {
      /* Recovery returns the same response for unknown accounts and delivery failures. */
    }
  }
  async resetPassword(input: { token: string; password: string }): Promise<void> {
    const userId = await this.redis.client.getdel(`local-password-reset:${digest(input.token)}`);
    if (!userId || !z.string().uuid().safeParse(userId).success)
      throw new BadRequestException('Invalid or expired reset link');
    await this.setPassword(userId, input.password);
  }
  async setLocalDevelopmentPassword(email: string, password: string) {
    if (this.config.env.NODE_ENV === 'production')
      throw new BadRequestException('Use email recovery in production');
    const user = await this.findUser(email);
    if (!user) throw new BadRequestException('Account not found');
    await this.setPassword(user.id, password);
  }
  private async setPassword(userId: string, password: string) {
    const passwordHash = await hashPassword(password);
    await this.database.db.transaction(async (tx) => {
      const updated = await tx
        .update(users)
        .set({ passwordHash, updatedAt: new Date() })
        .where(eq(users.id, userId))
        .returning({ id: users.id });
      if (!updated.length) throw new BadRequestException('Account not found');
      await tx
        .update(sessions)
        .set({ revokedAt: new Date() })
        .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
      await tx.insert(auditEvents).values({
        actorId: userId,
        action: 'user.password_changed',
        entityType: 'user',
        entityId: userId,
      });
    });
  }
}

import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { AppConfigService } from '../config/app-config.service';
import { DatabaseService } from '../database/database.service';
import { auditEvents, sessions, users } from '../database/schema';

@Injectable()
export class AuthService {
  constructor(
    private readonly database: DatabaseService,
    private readonly jwt: JwtService,
    private readonly config: AppConfigService,
  ) {}

  async register(input: { email: string; password: string; name: string }) {
    const existing = await this.database.db.query.users.findFirst({
      where: eq(users.email, input.email.toLowerCase()),
    });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(input.password, 12);
    const [user] = await this.database.db
      .insert(users)
      .values({
        email: input.email.toLowerCase(),
        name: input.name,
        passwordHash,
      })
      .returning();

    if (!user) {
      throw new Error('Failed to create user');
    }

    await this.database.db.insert(auditEvents).values({
      actorId: user.id,
      action: 'user.registered',
      entityType: 'user',
      entityId: user.id,
    });

    return this.issueTokens(user.id, user.email, user.name);
  }

  async login(input: { email: string; password: string }) {
    const user = await this.database.db.query.users.findFirst({
      where: eq(users.email, input.email.toLowerCase()),
    });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(input.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.database.db.insert(auditEvents).values({
      actorId: user.id,
      action: 'user.login',
      entityType: 'user',
      entityId: user.id,
    });

    return this.issueTokens(user.id, user.email, user.name);
  }

  async refresh(refreshToken: string) {
    const hash = hashToken(refreshToken);
    const session = await this.database.db.query.sessions.findFirst({
      where: and(eq(sessions.refreshTokenHash, hash), isNull(sessions.revokedAt)),
    });

    if (!session || session.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = await this.database.db.query.users.findFirst({
      where: eq(users.id, session.userId),
    });
    if (!user) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    await this.database.db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(eq(sessions.id, session.id));

    return this.issueTokens(user.id, user.email, user.name);
  }

  async logout(refreshToken: string) {
    const hash = hashToken(refreshToken);
    await this.database.db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(eq(sessions.refreshTokenHash, hash));
    return { ok: true as const };
  }

  async me(userId: string) {
    const user = await this.database.db.query.users.findFirst({
      where: eq(users.id, userId),
    });
    if (!user) {
      throw new UnauthorizedException();
    }
    return { id: user.id, email: user.email, name: user.name };
  }

  private async issueTokens(userId: string, email: string, name: string) {
    const accessToken = await this.jwt.signAsync({
      sub: userId,
      email,
      name,
    });

    const refreshToken = randomBytes(48).toString('hex');
    const expiresAt = new Date(
      Date.now() + parseDurationMs(this.config.env.JWT_REFRESH_EXPIRES_IN),
    );

    await this.database.db.insert(sessions).values({
      userId,
      refreshTokenHash: hashToken(refreshToken),
      expiresAt,
    });

    return {
      accessToken,
      refreshToken,
      user: { id: userId, email, name },
    };
  }
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function parseDurationMs(value: string): number {
  const match = /^(\d+)([smhd])$/.exec(value);
  if (!match) {
    return 7 * 24 * 60 * 60 * 1000;
  }
  const amount = Number(match[1]);
  const unit = match[2];
  switch (unit) {
    case 's':
      return amount * 1000;
    case 'm':
      return amount * 60 * 1000;
    case 'h':
      return amount * 60 * 60 * 1000;
    case 'd':
      return amount * 24 * 60 * 60 * 1000;
    default:
      return 7 * 24 * 60 * 60 * 1000;
  }
}

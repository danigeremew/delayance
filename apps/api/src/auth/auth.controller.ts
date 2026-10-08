import {
  Controller,
  Get,
  Patch,
  Post,
  Req,
  Res,
  Body,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import {
  updateProfileSchema,
  loginSchema,
  registerSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from '@delayance/validation';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';

@ApiTags('auth')
@Controller('auth')
@UseGuards(ThrottlerGuard)
@Throttle({ auth: { limit: 20, ttl: 60_000 } })
export class AuthController {
  constructor(private readonly auth: AuthService) {}
  @Post('login') async login(
    @Req() req: Request,
    @Res() res: Response,
    @Body(new ZodValidationPipe(loginSchema)) body: { email: string; password: string },
  ) {
    requireOrigin(req);
    const session = await this.auth.login(body);
    return sendSession(res, session);
  }
  @Post('register') async register(
    @Req() req: Request,
    @Res() res: Response,
    @Body(new ZodValidationPipe(registerSchema))
    body: {
      email: string;
      firstName: string;
      lastName: string;
      password: string;
      confirmPassword: string;
    },
  ) {
    requireOrigin(req);
    const session = await this.auth.register(body);
    return sendSession(res, session);
  }
  @Post('forgot-password') async forgotPassword(
    @Req() req: Request,
    @Res() res: Response,
    @Body(new ZodValidationPipe(forgotPasswordSchema)) body: { email: string },
  ) {
    requireOrigin(req);
    await this.auth.forgotPassword(body.email);
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ message: 'If an account exists, a reset link will be sent.' });
  }
  @Post('reset-password') async resetPassword(
    @Req() req: Request,
    @Res() res: Response,
    @Body(new ZodValidationPipe(resetPasswordSchema))
    body: { token: string; password: string; confirmPassword: string },
  ) {
    requireOrigin(req);
    await this.auth.resetPassword(body);
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ message: 'Password updated.' });
  }
  @Post('refresh') async refresh(@Req() req: Request, @Res() res: Response) {
    requireOrigin(req);
    const token = getCookie(req, 'delayance_refresh');
    if (!token) return res.status(401).json({ message: 'No refresh session' });
    const session = await this.auth.refresh(token);
    setRefreshCookie(res, session.refreshToken, session.refreshExpiresIn);
    res.setHeader('Cache-Control', 'no-store');
    return res.json({
      accessToken: session.accessToken,
      expiresIn: session.expiresIn,
      user: session.user,
    });
  }
  @Post('logout') async logout(@Req() req: Request, @Res() res: Response) {
    requireOrigin(req);
    const result = await this.auth.logout(getCookie(req, 'delayance_refresh'));
    res.clearCookie('delayance_refresh', {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/auth',
    });
    res.setHeader('Cache-Control', 'no-store');
    return res.json(result);
  }
  @Get('me') @ApiBearerAuth() @UseGuards(JwtAuthGuard) me(
    @Req() req: Request & { user: { userId: string } },
  ) {
    return this.auth.me(req.user.userId);
  }
  @Patch('profile') @ApiBearerAuth() @UseGuards(JwtAuthGuard) updateProfile(
    @Req() req: Request & { user: { userId: string } },
    @Body(new ZodValidationPipe(updateProfileSchema)) body: { name?: string },
  ) {
    return this.auth.updateProfile(req.user.userId, { name: body.name });
  }
}

function getCookie(req: Request, name: string) {
  return req.headers.cookie
    ?.split(';')
    .map((v) => v.trim())
    .find((v) => v.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}
function setRefreshCookie(res: Response, value: string, maxAgeSeconds?: number) {
  res.cookie('delayance_refresh', value, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/auth',
    maxAge: Math.max(0, maxAgeSeconds ?? 604800) * 1000,
  });
}
function requireOrigin(req: Request) {
  const origin = req.headers.origin;
  const expected = process.env.WEB_ORIGIN ?? 'http://localhost:48721';
  if (origin !== expected) throw new ForbiddenException('Invalid request origin');
}

function sendSession(
  res: Response,
  session: {
    accessToken: string;
    expiresIn: number;
    user: { id: string; email: string; name: string };
    refreshToken: string;
    refreshExpiresIn?: number;
  },
) {
  setRefreshCookie(res, session.refreshToken, session.refreshExpiresIn);
  res.setHeader('Cache-Control', 'no-store');
  return res.json({
    accessToken: session.accessToken,
    expiresIn: session.expiresIn,
    user: session.user,
  });
}

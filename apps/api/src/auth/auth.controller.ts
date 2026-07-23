import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import {
  changePasswordSchema,
  loginSchema,
  refreshSchema,
  registerSchema,
  updateProfileSchema,
} from '@delayance/validation';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import type { Request } from 'express';

@ApiTags('auth')
@Controller('auth')
@UseGuards(ThrottlerGuard)
@Throttle({ auth: { limit: 20, ttl: 60000 } })
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  register(@Body(new ZodValidationPipe(registerSchema)) body: unknown) {
    return this.auth.register(body as { email: string; password: string; name: string });
  }

  @Post('login')
  login(@Body(new ZodValidationPipe(loginSchema)) body: unknown) {
    return this.auth.login(body as { email: string; password: string });
  }

  @Post('refresh')
  refresh(@Body(new ZodValidationPipe(refreshSchema)) body: unknown) {
    return this.auth.refresh((body as { refreshToken: string }).refreshToken);
  }

  @Post('logout')
  logout(@Body(new ZodValidationPipe(refreshSchema)) body: unknown) {
    return this.auth.logout((body as { refreshToken: string }).refreshToken);
  }

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  me(@Req() req: Request & { user: { userId: string } }) {
    return this.auth.me(req.user.userId);
  }

  @Patch('profile')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  updateProfile(
    @Req() req: Request & { user: { userId: string } },
    @Body(new ZodValidationPipe(updateProfileSchema)) body: unknown,
  ) {
    return this.auth.updateProfile(
      req.user.userId,
      body as { name?: string; email?: string },
    );
  }

  @Post('change-password')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  changePassword(
    @Req() req: Request & { user: { userId: string } },
    @Body(new ZodValidationPipe(changePasswordSchema)) body: unknown,
  ) {
    return this.auth.changePassword(
      req.user.userId,
      body as { currentPassword: string; newPassword: string },
    );
  }

  @Get('sessions')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  getSessions(@Req() req: Request & { user: { userId: string } }) {
    return this.auth.getSessions(req.user.userId);
  }

  @Delete('sessions/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  revokeSession(
    @Req() req: Request & { user: { userId: string } },
    @Param('id') sessionId: string,
  ) {
    return this.auth.revokeSession(req.user.userId, sessionId);
  }

  @Post('sessions/revoke-all')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  revokeAllSessions(@Req() req: Request & { user: { userId: string } }) {
    return this.auth.revokeAllSessions(req.user.userId);
  }
}


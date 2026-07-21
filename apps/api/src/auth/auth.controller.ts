import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { loginSchema, refreshSchema, registerSchema } from '@delayance/validation';
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
}

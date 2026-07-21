import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AiService } from './ai.service';

@ApiTags('ai')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('ai')
export class AiInfraController {
  constructor(private readonly ai: AiService) {}

  @Get('ollama/models')
  listOllamaModels(@Query('baseUrl') baseUrl?: string) {
    return this.ai.listOllamaModels(baseUrl || undefined);
  }
}

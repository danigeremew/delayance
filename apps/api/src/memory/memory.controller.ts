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
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { createMemorySchema, updateMemorySchema } from '../common/dto';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ProjectRoleGuard, type ProjectRequestUser } from '../rbac/project-role.guard';
import { RequireProjectRoles } from '../rbac/roles';
import { MemoryService } from './memory.service';

@ApiTags('memory')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ProjectRoleGuard)
@Controller('projects/:projectId/memory')
export class MemoryController {
  constructor(private readonly memory: MemoryService) {}

  @Get()
  @RequireProjectRoles('viewer')
  list(@Param('projectId') projectId: string) {
    return this.memory.list(projectId);
  }

  @Post()
  @RequireProjectRoles('editor')
  create(
    @Param('projectId') projectId: string,
    @Req() req: { user: ProjectRequestUser },
    @Body(new ZodValidationPipe(createMemorySchema))
    body: {
      kind: 'instruction' | 'fact' | 'decision' | 'open_question';
      body: string;
      sortOrder?: number;
    },
  ) {
    return this.memory.create(projectId, req.user.userId, body);
  }

  @Patch(':memoryId')
  @RequireProjectRoles('editor')
  update(
    @Param('projectId') projectId: string,
    @Param('memoryId') memoryId: string,
    @Req() req: { user: ProjectRequestUser },
    @Body(new ZodValidationPipe(updateMemorySchema))
    body: {
      body?: string;
      sortOrder?: number;
      kind?: 'instruction' | 'fact' | 'decision' | 'open_question';
    },
  ) {
    return this.memory.update(projectId, memoryId, req.user.userId, body);
  }

  @Delete(':memoryId')
  @RequireProjectRoles('editor')
  remove(
    @Param('projectId') projectId: string,
    @Param('memoryId') memoryId: string,
    @Req() req: { user: ProjectRequestUser },
  ) {
    return this.memory.remove(projectId, memoryId, req.user.userId);
  }
}

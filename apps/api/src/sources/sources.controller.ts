import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ProjectRoleGuard, type ProjectRequestUser } from '../rbac/project-role.guard';
import { RequireProjectRoles } from '../rbac/roles';
import { SearchService } from './search.service';
import { SourcesService } from './sources.service';

const createSchema = z.object({
  title: z.string().min(1).max(500),
  sourceType: z.enum(['pdf', 'docx', 'md', 'txt', 'image', 'note']),
  textContent: z.string().optional(),
  fileId: z.string().uuid().optional(),
  aiMayUse: z.boolean().optional(),
});

const updateSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  outdated: z.boolean().optional(),
  aiMayUse: z.boolean().optional(),
  textContent: z.string().optional(),
});

@ApiTags('sources')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ProjectRoleGuard)
@Controller('projects/:projectId')
export class SourcesController {
  constructor(
    private readonly sources: SourcesService,
    private readonly search: SearchService,
  ) {}

  @Get('sources')
  @RequireProjectRoles('viewer')
  list(@Param('projectId') projectId: string) {
    return this.sources.list(projectId);
  }

  @Get('sources/search')
  @RequireProjectRoles('viewer')
  searchSources(
    @Param('projectId') projectId: string,
    @Query('q') q = '',
    @Query('semantic') semantic?: string,
  ) {
    return this.sources.search(projectId, q, semantic === '1' || semantic === 'true');
  }

  @Get('search')
  @RequireProjectRoles('viewer')
  searchProject(
    @Param('projectId') projectId: string,
    @Query('q') q = '',
    @Query('semantic') semantic?: string,
  ) {
    return this.search.searchProject(projectId, q, {
      semantic: semantic === '1' || semantic === 'true',
    });
  }

  @Post('sources')
  @RequireProjectRoles('contributor')
  create(
    @Param('projectId') projectId: string,
    @Req() req: { user: ProjectRequestUser },
    @Body(new ZodValidationPipe(createSchema)) body: z.infer<typeof createSchema>,
  ) {
    return this.sources.create({
      projectId,
      userId: req.user.userId,
      role: req.user.projectRole!,
      ...body,
    });
  }

  @Patch('sources/:sourceId')
  @RequireProjectRoles('contributor')
  update(
    @Param('projectId') projectId: string,
    @Param('sourceId') sourceId: string,
    @Req() req: { user: ProjectRequestUser },
    @Body(new ZodValidationPipe(updateSchema)) body: z.infer<typeof updateSchema>,
  ) {
    return this.sources.update(projectId, sourceId, req.user.projectRole!, body);
  }
}

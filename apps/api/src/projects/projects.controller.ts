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
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  addMemberSchema,
  createProjectSchema,
  updateMemberSchema,
  updateProjectSchema,
} from '../common/dto';
import { ProjectRoleGuard, type ProjectRequestUser } from '../rbac/project-role.guard';
import { RequireProjectRoles } from '../rbac/roles';
import { ProjectsService } from './projects.service';

@ApiTags('projects')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  list(@Req() req: { user: ProjectRequestUser }) {
    return this.projects.listForUser(req.user.userId);
  }

  @Post()
  create(
    @Req() req: { user: ProjectRequestUser },
    @Body(new ZodValidationPipe(createProjectSchema))
    body: {
      name: string;
      description?: string;
      ai?: {
        provider?: string;
        model: string;
        policy?: 'any' | 'local_only';
        baseUrl?: string | null;
        apiKey?: string | null;
      };
    },
  ) {
    return this.projects.create(req.user.userId, body);
  }

  @Get(':projectId')
  @UseGuards(ProjectRoleGuard)
  @RequireProjectRoles('viewer')
  get(@Param('projectId') projectId: string) {
    return this.projects.get(projectId);
  }

  @Patch(':projectId')
  @UseGuards(ProjectRoleGuard)
  @RequireProjectRoles('editor')
  update(
    @Param('projectId') projectId: string,
    @Req() req: { user: ProjectRequestUser },
    @Body(new ZodValidationPipe(updateProjectSchema))
    body: { name?: string; description?: string },
  ) {
    return this.projects.update(projectId, req.user.userId, req.user.projectRole!, body);
  }

  @Delete(':projectId')
  @UseGuards(ProjectRoleGuard)
  @RequireProjectRoles('owner')
  remove(@Param('projectId') projectId: string, @Req() req: { user: ProjectRequestUser }) {
    return this.projects.remove(projectId, req.user.userId, req.user.projectRole!);
  }

  @Get(':projectId/members')
  @UseGuards(ProjectRoleGuard)
  @RequireProjectRoles('viewer')
  listMembers(@Param('projectId') projectId: string) {
    return this.projects.listMembers(projectId);
  }

  @Post(':projectId/members')
  @UseGuards(ProjectRoleGuard)
  @RequireProjectRoles('owner')
  addMember(
    @Param('projectId') projectId: string,
    @Req() req: { user: ProjectRequestUser },
    @Body(new ZodValidationPipe(addMemberSchema))
    body: { email: string; role: 'owner' | 'editor' | 'contributor' | 'reviewer' | 'viewer' },
  ) {
    return this.projects.addMember(projectId, req.user.userId, req.user.projectRole!, body);
  }

  @Patch(':projectId/members/:memberId')
  @UseGuards(ProjectRoleGuard)
  @RequireProjectRoles('owner')
  updateMember(
    @Param('projectId') projectId: string,
    @Param('memberId') memberId: string,
    @Req() req: { user: ProjectRequestUser },
    @Body(new ZodValidationPipe(updateMemberSchema))
    body: { role: 'owner' | 'editor' | 'contributor' | 'reviewer' | 'viewer' },
  ) {
    return this.projects.updateMember(
      projectId,
      memberId,
      req.user.userId,
      req.user.projectRole!,
      body.role,
    );
  }

  @Delete(':projectId/members/:memberId')
  @UseGuards(ProjectRoleGuard)
  @RequireProjectRoles('owner')
  removeMember(
    @Param('projectId') projectId: string,
    @Param('memberId') memberId: string,
    @Req() req: { user: ProjectRequestUser },
  ) {
    return this.projects.removeMember(
      projectId,
      memberId,
      req.user.userId,
      req.user.projectRole!,
    );
  }
}

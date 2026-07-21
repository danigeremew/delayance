import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { and, eq } from 'drizzle-orm';
import type { ProjectRole } from '@delayance/shared-types';
import { DatabaseService } from '../database/database.service';
import { projectMembers, projects } from '../database/schema';
import { PROJECT_ROLES_KEY, ROLE_RANK } from './roles';

export interface ProjectRequestUser {
  userId: string;
  email: string;
  name: string;
  projectRole?: ProjectRole;
  projectId?: string;
}

@Injectable()
export class ProjectRoleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly database: DatabaseService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<ProjectRole[]>(PROJECT_ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest<{
      user?: ProjectRequestUser;
      params: Record<string, string>;
    }>();

    const user = request.user;
    if (!user?.userId) {
      throw new ForbiddenException('Authentication required');
    }

    const projectId = request.params.projectId;
    if (!projectId) {
      throw new ForbiddenException('Project id required');
    }

    const membership = await this.database.db.query.projectMembers.findFirst({
      where: and(
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.userId, user.userId),
      ),
    });

    if (!membership) {
      const project = await this.database.db.query.projects.findFirst({
        where: eq(projects.id, projectId),
      });
      if (!project) throw new NotFoundException('Project not found');
      throw new ForbiddenException('Not a project member');
    }

    user.projectRole = membership.role;
    user.projectId = projectId;

    if (!required || required.length === 0) {
      return true;
    }

    const ok = required.some((role) => ROLE_RANK[membership.role] >= ROLE_RANK[role]);
    if (!ok) {
      throw new ForbiddenException('Insufficient project role');
    }
    return true;
  }
}

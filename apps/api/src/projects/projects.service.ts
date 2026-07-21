import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, count, desc, eq, inArray } from 'drizzle-orm';
import type { ProjectRole } from '@delayance/shared-types';
import { DatabaseService } from '../database/database.service';
import {
  documents,
  projectAiSettings,
  projectMembers,
  projects,
  users,
} from '../database/schema';
import { AuditService } from '../rbac/audit.service';
import { canManageMembers, canManageProject } from '../rbac/roles';
import { AppConfigService } from '../config/app-config.service';
import { encryptSecret } from '../crypto/secrets';

const DEFAULT_AI = {
  provider: 'ollama',
  model: 'llama3.2',
  policy: 'local_only' as const,
  baseUrl: 'http://127.0.0.1:11434/v1',
};

@Injectable()
export class ProjectsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
    private readonly config: AppConfigService,
  ) {}

  async listForUser(userId: string) {
    const rows = await this.database.db
      .select({
        id: projects.id,
        name: projects.name,
        description: projects.description,
        ownerId: projects.ownerId,
        createdAt: projects.createdAt,
        updatedAt: projects.updatedAt,
        role: projectMembers.role,
      })
      .from(projectMembers)
      .innerJoin(projects, eq(projects.id, projectMembers.projectId))
      .where(eq(projectMembers.userId, userId))
      .orderBy(desc(projects.updatedAt));

    if (!rows.length) return [];

    const ids = rows.map((r) => r.id);
    const docCounts = await this.database.db
      .select({
        projectId: documents.projectId,
        documentCount: count(documents.id),
      })
      .from(documents)
      .where(inArray(documents.projectId, ids))
      .groupBy(documents.projectId);

    const countByProject = new Map(
      docCounts.map((d) => [d.projectId, Number(d.documentCount)]),
    );

    return rows.map((r) => ({
      ...r,
      documentCount: countByProject.get(r.id) ?? 0,
    }));
  }

  async create(
    userId: string,
    input: {
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
    const [project] = await this.database.db
      .insert(projects)
      .values({
        name: input.name,
        description: input.description ?? '',
        ownerId: userId,
      })
      .returning();
    if (!project) throw new Error('Failed to create project');

    await this.database.db.insert(projectMembers).values({
      projectId: project.id,
      userId,
      role: 'owner',
    });

    const ai = input.ai;
    const provider = ai?.provider ?? DEFAULT_AI.provider;
    const model = ai?.model ?? DEFAULT_AI.model;
    const policy = ai?.policy ?? DEFAULT_AI.policy;
    const baseUrl =
      ai?.baseUrl === undefined ? DEFAULT_AI.baseUrl : ai.baseUrl;
    const encryptedApiKey = ai?.apiKey
      ? encryptSecret(ai.apiKey, this.config.env.SECRETS_ENCRYPTION_KEY)
      : null;

    await this.database.db.insert(projectAiSettings).values({
      projectId: project.id,
      provider,
      model,
      policy,
      baseUrl,
      encryptedApiKey,
    });

    await this.audit.record({
      actorId: userId,
      action: 'project.created',
      entityType: 'project',
      entityId: project.id,
    });

    return {
      ...project,
      role: 'owner' as ProjectRole,
      documentCount: 0,
      ai: { provider, model, policy, baseUrl },
    };
  }

  async get(projectId: string) {
    const project = await this.database.db.query.projects.findFirst({
      where: eq(projects.id, projectId),
    });
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }

  async update(
    projectId: string,
    userId: string,
    role: ProjectRole,
    input: { name?: string; description?: string },
  ) {
    if (!canManageProject(role)) {
      throw new ForbiddenException('Insufficient role to update project');
    }
    const [updated] = await this.database.db
      .update(projects)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        updatedAt: new Date(),
      })
      .where(eq(projects.id, projectId))
      .returning();
    await this.audit.record({
      actorId: userId,
      action: 'project.updated',
      entityType: 'project',
      entityId: projectId,
    });
    return updated;
  }

  async remove(projectId: string, userId: string, role: ProjectRole) {
    if (role !== 'owner') {
      throw new ForbiddenException('Only owners can delete projects');
    }
    await this.database.db.delete(projects).where(eq(projects.id, projectId));
    await this.audit.record({
      actorId: userId,
      action: 'project.deleted',
      entityType: 'project',
      entityId: projectId,
    });
    return { ok: true as const };
  }

  async listMembers(projectId: string) {
    return this.database.db
      .select({
        id: projectMembers.id,
        role: projectMembers.role,
        userId: users.id,
        email: users.email,
        name: users.name,
        createdAt: projectMembers.createdAt,
      })
      .from(projectMembers)
      .innerJoin(users, eq(users.id, projectMembers.userId))
      .where(eq(projectMembers.projectId, projectId));
  }

  async addMember(
    projectId: string,
    actorId: string,
    actorRole: ProjectRole,
    input: { email: string; role: ProjectRole },
  ) {
    if (!canManageMembers(actorRole)) {
      throw new ForbiddenException('Only owners can add members');
    }
    const user = await this.database.db.query.users.findFirst({
      where: eq(users.email, input.email.toLowerCase()),
    });
    if (!user) throw new NotFoundException('User not found');

    const existing = await this.database.db.query.projectMembers.findFirst({
      where: and(
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.userId, user.id),
      ),
    });
    if (existing) {
      const [updated] = await this.database.db
        .update(projectMembers)
        .set({ role: input.role })
        .where(eq(projectMembers.id, existing.id))
        .returning();
      return updated;
    }

    const [created] = await this.database.db
      .insert(projectMembers)
      .values({ projectId, userId: user.id, role: input.role })
      .returning();
    await this.audit.record({
      actorId,
      action: 'member.added',
      entityType: 'project',
      entityId: projectId,
      metadata: { userId: user.id, role: input.role },
    });
    return created;
  }

  async updateMember(
    projectId: string,
    memberId: string,
    actorId: string,
    actorRole: ProjectRole,
    role: ProjectRole,
  ) {
    if (!canManageMembers(actorRole)) {
      throw new ForbiddenException('Only owners can update members');
    }
    const [updated] = await this.database.db
      .update(projectMembers)
      .set({ role })
      .where(and(eq(projectMembers.id, memberId), eq(projectMembers.projectId, projectId)))
      .returning();
    if (!updated) throw new NotFoundException('Member not found');
    await this.audit.record({
      actorId,
      action: 'member.updated',
      entityType: 'project',
      entityId: projectId,
      metadata: { memberId, role },
    });
    return updated;
  }

  async removeMember(
    projectId: string,
    memberId: string,
    actorId: string,
    actorRole: ProjectRole,
  ) {
    if (!canManageMembers(actorRole)) {
      throw new ForbiddenException('Only owners can remove members');
    }
    await this.database.db
      .delete(projectMembers)
      .where(and(eq(projectMembers.id, memberId), eq(projectMembers.projectId, projectId)));
    await this.audit.record({
      actorId,
      action: 'member.removed',
      entityType: 'project',
      entityId: projectId,
      metadata: { memberId },
    });
    return { ok: true as const };
  }
}

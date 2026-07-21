import { Injectable, NotFoundException } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import { projectMemoryItems } from '../database/schema';
import { AuditService } from '../rbac/audit.service';

@Injectable()
export class MemoryService {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  list(projectId: string) {
    return this.database.db
      .select()
      .from(projectMemoryItems)
      .where(eq(projectMemoryItems.projectId, projectId))
      .orderBy(asc(projectMemoryItems.sortOrder), asc(projectMemoryItems.createdAt));
  }

  async create(
    projectId: string,
    userId: string,
    input: {
      kind: 'instruction' | 'fact' | 'decision' | 'open_question';
      body: string;
      sortOrder?: number;
    },
  ) {
    const [row] = await this.database.db
      .insert(projectMemoryItems)
      .values({
        projectId,
        kind: input.kind,
        body: input.body,
        sortOrder: input.sortOrder ?? 0,
      })
      .returning();
    await this.audit.record({
      actorId: userId,
      action: 'memory.created',
      entityType: 'project',
      entityId: projectId,
      metadata: { memoryId: row?.id, kind: input.kind },
    });
    return row;
  }

  async update(
    projectId: string,
    memoryId: string,
    userId: string,
    input: {
      body?: string;
      sortOrder?: number;
      kind?: 'instruction' | 'fact' | 'decision' | 'open_question';
    },
  ) {
    const [row] = await this.database.db
      .update(projectMemoryItems)
      .set({
        ...(input.body !== undefined ? { body: input.body } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
        ...(input.kind !== undefined ? { kind: input.kind } : {}),
        updatedAt: new Date(),
      })
      .where(eq(projectMemoryItems.id, memoryId))
      .returning();
    if (!row || row.projectId !== projectId) {
      throw new NotFoundException('Memory item not found');
    }
    await this.audit.record({
      actorId: userId,
      action: 'memory.updated',
      entityType: 'memory',
      entityId: memoryId,
    });
    return row;
  }

  async remove(projectId: string, memoryId: string, userId: string) {
    const existing = await this.database.db.query.projectMemoryItems.findFirst({
      where: eq(projectMemoryItems.id, memoryId),
    });
    if (!existing || existing.projectId !== projectId) {
      throw new NotFoundException('Memory item not found');
    }
    await this.database.db.delete(projectMemoryItems).where(eq(projectMemoryItems.id, memoryId));
    await this.audit.record({
      actorId: userId,
      action: 'memory.deleted',
      entityType: 'memory',
      entityId: memoryId,
    });
    return { ok: true as const };
  }
}

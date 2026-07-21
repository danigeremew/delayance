import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { auditEvents } from '../database/schema';

@Injectable()
export class AuditService {
  constructor(private readonly database: DatabaseService) {}

  async record(input: {
    actorId?: string | null;
    action: string;
    entityType: string;
    entityId?: string;
    metadata?: Record<string, unknown>;
  }) {
    await this.database.db.insert(auditEvents).values({
      actorId: input.actorId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      metadata: input.metadata ?? {},
    });
  }
}

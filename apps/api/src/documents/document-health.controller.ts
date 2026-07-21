import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { and, desc, eq } from 'drizzle-orm';
import {
  findBrokenReferences,
  validateDocument,
} from '@delayance/document-engine';
import type { Document } from '@delayance/document-model';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DatabaseService } from '../database/database.service';
import { aiProposals } from '../database/schema';
import { DocumentsService } from '../documents/documents.service';
import { ProjectRoleGuard } from '../rbac/project-role.guard';
import { RequireProjectRoles } from '../rbac/roles';

@ApiTags('health')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ProjectRoleGuard)
@Controller('projects/:projectId/documents/:documentId/health')
export class DocumentHealthController {
  constructor(
    private readonly documents: DocumentsService,
    private readonly database: DatabaseService,
  ) {}

  @Get()
  @RequireProjectRoles('viewer')
  async get(
    @Param('projectId') projectId: string,
    @Param('documentId') documentId: string,
  ) {
    const doc = await this.documents.get(projectId, documentId);
    const content = doc.content as Document;
    const issues = validateDocument(content);
    const broken = findBrokenReferences(content);

    const reviews = await this.database.db
      .select({
        id: aiProposals.id,
        status: aiProposals.status,
        findings: aiProposals.findings,
        createdAt: aiProposals.createdAt,
      })
      .from(aiProposals)
      .where(
        and(
          eq(aiProposals.projectId, projectId),
          eq(aiProposals.documentId, documentId),
          eq(aiProposals.mode, 'review'),
        ),
      )
      .orderBy(desc(aiProposals.createdAt))
      .limit(10);

    const aiFindings = reviews.flatMap((r) =>
      (Array.isArray(r.findings) ? r.findings : []).map((f) => {
        const finding = f as {
          nodeId?: string;
          severity?: string;
          message?: string;
          suggestion?: string;
        };
        return {
          proposalId: r.id,
          proposalStatus: r.status,
          nodeId: finding.nodeId,
          severity: finding.severity ?? 'info',
          message: finding.message ?? '',
          suggestion: finding.suggestion,
        };
      }),
    );

    return {
      documentId,
      issueCount: issues.length,
      brokenRefCount: broken.length,
      issues,
      brokenRefs: broken,
      aiFindings,
      stubs: [
        { code: 'realtime_collab', status: 'deferred', message: 'Yjs real-time collaboration' },
        { code: 'agent_mode', status: 'deferred', message: 'Full Agent mode' },
        { code: 'research_web', status: 'deferred', message: 'Live web research' },
      ],
    };
  }
}

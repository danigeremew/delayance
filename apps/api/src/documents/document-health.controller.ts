import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { and, desc, eq } from 'drizzle-orm';
import { documentAnalysisSchema } from '@delayance/document-model';
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
    const analysis = doc.analysisContent ? documentAnalysisSchema.safeParse(doc.analysisContent) : null;
    const nodes = analysis?.success ? analysis.data.nodes : [];
    const headings = nodes.filter((node) => node.kind === 'heading');
    const seenHeadings = new Set<string>();
    const issues = [] as Array<{ code: string; severity: string; message: string; nodeId?: string }>;
    if (!analysis?.success) {
      issues.push({ code: 'analysis_pending', severity: 'info', message: 'Document analysis is pending.' });
    }
    if (analysis?.success && analysis.data.plainText.trim().length === 0) {
      issues.push({ code: 'empty_document', severity: 'info', message: 'The document has no extracted text yet.' });
    }
    for (const heading of headings) {
      const key = heading.text.trim().toLocaleLowerCase();
      if (key && seenHeadings.has(key)) {
        issues.push({
          code: 'duplicate_heading',
          severity: 'warning',
          message: `Duplicate heading: ${heading.text}`,
          nodeId: heading.location.value,
        });
      }
      if (key) seenHeadings.add(key);
    }
    // Cross-reference validation is intentionally deferred until the DOCX extractor
    // exposes relationship-level reference targets; no legacy JSON is consulted.
    const broken: Array<{ refId: string; targetId: string; display: string; broken: boolean }> = [];

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

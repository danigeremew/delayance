import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { DocumentOperation } from '@delayance/document-engine';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  applyDocumentOpSchema,
  createCommentSchema,
  createDocumentSchema,
  patchDocumentContentSchema,
  updateDocumentMetaSchema,
  upsertAssignmentSchema,
} from '../common/dto';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ProjectRoleGuard, type ProjectRequestUser } from '../rbac/project-role.guard';
import { RequireProjectRoles } from '../rbac/roles';
import { DocumentsService } from './documents.service';

@ApiTags('documents')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ProjectRoleGuard)
@Controller('projects/:projectId/documents')
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get()
  @RequireProjectRoles('viewer')
  list(@Param('projectId') projectId: string) {
    return this.documents.list(projectId);
  }

  @Post()
  @RequireProjectRoles('contributor')
  create(
    @Param('projectId') projectId: string,
    @Req() req: { user: ProjectRequestUser },
    @Body(new ZodValidationPipe(createDocumentSchema))
    body: { title: string; templateId?: string },
  ) {
    return this.documents.create(projectId, req.user.userId, body);
  }

  @Get(':documentId')
  @RequireProjectRoles('viewer')
  get(@Param('projectId') projectId: string, @Param('documentId') documentId: string) {
    return this.documents.get(projectId, documentId);
  }

  @Patch(':documentId')
  @RequireProjectRoles('contributor')
  updateMeta(
    @Param('projectId') projectId: string,
    @Param('documentId') documentId: string,
    @Req() req: { user: ProjectRequestUser },
    @Body(new ZodValidationPipe(updateDocumentMetaSchema))
    body: { title?: string; status?: 'draft' | 'in_review' | 'approved' },
  ) {
    return this.documents.updateMeta(
      projectId,
      documentId,
      req.user.userId,
      req.user.projectRole!,
      body,
    );
  }

  @Patch(':documentId/content')
  @RequireProjectRoles('contributor')
  patchContent(
    @Param('projectId') projectId: string,
    @Param('documentId') documentId: string,
    @Req() req: { user: ProjectRequestUser },
    @Body(new ZodValidationPipe(patchDocumentContentSchema))
    body: {
      content: unknown;
      createVersion?: boolean;
      versionName?: string;
      versionReason?: string;
    },
  ) {
    return this.documents.patchContent(
      projectId,
      documentId,
      req.user.userId,
      req.user.projectRole!,
      body,
    );
  }

  @Post(':documentId/operations')
  @RequireProjectRoles('contributor')
  applyOp(
    @Param('projectId') projectId: string,
    @Param('documentId') documentId: string,
    @Req() req: { user: ProjectRequestUser },
    @Body(new ZodValidationPipe(applyDocumentOpSchema))
    body: { operation: unknown; force?: boolean },
  ) {
    return this.documents.applyOp(
      projectId,
      documentId,
      req.user.userId,
      req.user.projectRole!,
      body.operation as DocumentOperation,
      body.force,
    );
  }

  @Get(':documentId/versions')
  @RequireProjectRoles('viewer')
  listVersions(
    @Param('projectId') projectId: string,
    @Param('documentId') documentId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.documents.listVersions(
      projectId,
      documentId,
      limit ? Number(limit) : 50,
      offset ? Number(offset) : 0,
    );
  }

  @Get(':documentId/versions/:versionId')
  @RequireProjectRoles('viewer')
  getVersion(
    @Param('projectId') projectId: string,
    @Param('documentId') documentId: string,
    @Param('versionId') versionId: string,
  ) {
    return this.documents.getVersion(projectId, documentId, versionId);
  }

  @Post(':documentId/versions/:versionId/restore')
  @RequireProjectRoles('contributor')
  restoreVersion(
    @Param('projectId') projectId: string,
    @Param('documentId') documentId: string,
    @Param('versionId') versionId: string,
    @Req() req: { user: ProjectRequestUser },
  ) {
    return this.documents.restoreVersion(
      projectId,
      documentId,
      versionId,
      req.user.userId,
      req.user.projectRole!,
    );
  }

  @Get(':documentId/comments')
  @RequireProjectRoles('viewer')
  listComments(
    @Param('projectId') projectId: string,
    @Param('documentId') documentId: string,
  ) {
    return this.documents.listComments(projectId, documentId);
  }

  @Post(':documentId/comments')
  @RequireProjectRoles('reviewer')
  createComment(
    @Param('projectId') projectId: string,
    @Param('documentId') documentId: string,
    @Req() req: { user: ProjectRequestUser },
    @Body(new ZodValidationPipe(createCommentSchema))
    body: { anchorNodeId: string; body: string; parentId?: string },
  ) {
    return this.documents.createComment(
      projectId,
      documentId,
      req.user.userId,
      req.user.projectRole!,
      body,
    );
  }

  @Post(':documentId/comments/:commentId/resolve')
  @RequireProjectRoles('reviewer')
  resolveComment(
    @Param('projectId') projectId: string,
    @Param('documentId') documentId: string,
    @Param('commentId') commentId: string,
    @Req() req: { user: ProjectRequestUser },
  ) {
    return this.documents.resolveComment(
      projectId,
      documentId,
      commentId,
      req.user.projectRole!,
    );
  }

  @Get(':documentId/assignments')
  @RequireProjectRoles('viewer')
  listAssignments(
    @Param('projectId') projectId: string,
    @Param('documentId') documentId: string,
  ) {
    return this.documents.listAssignments(projectId, documentId);
  }

  @Post(':documentId/assignments')
  @RequireProjectRoles('editor')
  upsertAssignment(
    @Param('projectId') projectId: string,
    @Param('documentId') documentId: string,
    @Req() req: { user: ProjectRequestUser },
    @Body(new ZodValidationPipe(upsertAssignmentSchema))
    body: {
      sectionId: string;
      assigneeId?: string | null;
      status:
        | 'not_started'
        | 'notes'
        | 'draft'
        | 'needs_review'
        | 'approved'
        | 'locked';
    },
  ) {
    return this.documents.upsertAssignment(
      projectId,
      documentId,
      req.user.userId,
      req.user.projectRole!,
      body,
    );
  }

  @Get(':documentId/sections/:sectionId/export-docx')
  @RequireProjectRoles('contributor')
  exportSection(
    @Param('projectId') projectId: string,
    @Param('documentId') documentId: string,
    @Param('sectionId') sectionId: string,
    @Req() req: { user: ProjectRequestUser },
  ) {
    return this.documents.exportSectionDocx(
      projectId,
      documentId,
      sectionId,
      req.user.userId,
    );
  }

  @Post(':documentId/sections/:sectionId/import-docx')
  @RequireProjectRoles('contributor')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 50 * 1024 * 1024 },
    }),
  )
  importSection(
    @Param('projectId') projectId: string,
    @Param('documentId') documentId: string,
    @Param('sectionId') sectionId: string,
    @Req() req: { user: ProjectRequestUser },
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw new Error('file required');
    return this.documents.importSectionDocx(
      projectId,
      documentId,
      sectionId,
      req.user.userId,
      req.user.projectRole!,
      file.buffer,
    );
  }
}

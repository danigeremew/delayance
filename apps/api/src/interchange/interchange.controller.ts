import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ProjectRoleGuard, type ProjectRequestUser } from '../rbac/project-role.guard';
import { RequireProjectRoles } from '../rbac/roles';
import { InterchangeService } from './interchange.service';

const importSchema = z.object({
  fileId: z.string().uuid(),
  mode: z.enum(['preserve', 'normalize']).default('normalize'),
  documentId: z.string().uuid().optional(),
});

const applyImportSchema = z.object({
  title: z.string().min(1).max(500).optional(),
});

const exportSchema = z.object({
  format: z.enum(['docx', 'pdf', 'markdown', 'html', 'plain']),
});

const cleanupSchema = z.object({
  content: z.unknown(),
});

@ApiTags('interchange')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ProjectRoleGuard)
@Controller('projects/:projectId')
export class InterchangeController {
  constructor(private readonly interchange: InterchangeService) {}

  @Post('files')
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
  upload(
    @Param('projectId') projectId: string,
    @Req() req: { user: ProjectRequestUser },
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw new Error('file required');
    return this.interchange.uploadFile({
      projectId,
      userId: req.user.userId,
      filename: file.originalname,
      contentType: file.mimetype,
      buffer: file.buffer,
    });
  }

  @Post('documents/import')
  @RequireProjectRoles('contributor')
  startImport(
    @Param('projectId') projectId: string,
    @Req() req: { user: ProjectRequestUser },
    @Body(new ZodValidationPipe(importSchema))
    body: z.infer<typeof importSchema>,
  ) {
    return this.interchange.startImport({
      projectId,
      userId: req.user.userId,
      role: req.user.projectRole!,
      fileId: body.fileId,
      mode: body.mode,
      documentId: body.documentId,
    });
  }

  @Get('imports/:importId')
  @RequireProjectRoles('viewer')
  getImport(
    @Param('projectId') projectId: string,
    @Param('importId') importId: string,
  ) {
    return this.interchange.getImport(projectId, importId);
  }

  @Post('imports/:importId/apply')
  @RequireProjectRoles('contributor')
  applyImport(
    @Param('projectId') projectId: string,
    @Param('importId') importId: string,
    @Req() req: { user: ProjectRequestUser },
    @Body(new ZodValidationPipe(applyImportSchema))
    body: z.infer<typeof applyImportSchema>,
  ) {
    return this.interchange.applyImport({
      projectId,
      importId,
      userId: req.user.userId,
      role: req.user.projectRole!,
      title: body.title,
    });
  }

  @Post('documents/:documentId/export')
  @RequireProjectRoles('viewer')
  export(
    @Param('projectId') projectId: string,
    @Param('documentId') documentId: string,
    @Req() req: { user: ProjectRequestUser },
    @Body(new ZodValidationPipe(exportSchema))
    body: z.infer<typeof exportSchema>,
  ) {
    return this.interchange.startExport({
      projectId,
      documentId,
      userId: req.user.userId,
      role: req.user.projectRole!,
      format: body.format,
    });
  }

  @Get('documents/:documentId/exports')
  @RequireProjectRoles('viewer')
  listExports(
    @Param('projectId') projectId: string,
    @Param('documentId') documentId: string,
  ) {
    return this.interchange.listExports(projectId, documentId);
  }

  @Get('exports/:exportId/download')
  @RequireProjectRoles('viewer')
  download(
    @Param('projectId') projectId: string,
    @Param('exportId') exportId: string,
  ) {
    return this.interchange.getExportDownload(projectId, exportId);
  }

  @Post('documents/:documentId/cleanup/preview')
  @RequireProjectRoles('contributor')
  cleanupPreview(
    @Body(new ZodValidationPipe(cleanupSchema)) body: { content: unknown },
  ) {
    return this.interchange.cleanupPreview(body.content);
  }

  @Post('documents/:documentId/cleanup/apply')
  @RequireProjectRoles('contributor')
  cleanupApply(
    @Body(new ZodValidationPipe(cleanupSchema)) body: { content: unknown },
  ) {
    return { content: this.interchange.cleanupApply(body.content) };
  }
}

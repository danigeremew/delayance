import { Controller, Get, Header, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ProjectRoleGuard, type ProjectRequestUser } from '../rbac/project-role.guard';
import { RequireProjectRoles } from '../rbac/roles';
import { OfficeService } from './office.service';

@ApiTags('office')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ProjectRoleGuard)
@Controller('projects/:projectId/documents/:documentId/office')
export class OfficeController {
  constructor(private readonly office: OfficeService) {}

  @Post('session')
  @RequireProjectRoles('viewer')
  createSession(
    @Param('projectId') projectId: string,
    @Param('documentId') documentId: string,
    @Req() req: { user: ProjectRequestUser },
  ) {
    return this.office.createBrowserSession({
      projectId,
      documentId,
      userId: req.user.userId,
      role: req.user.projectRole!,
    });
  }

  @Get('analysis')
  @RequireProjectRoles('viewer')
  analysis(@Param('projectId') projectId: string, @Param('documentId') documentId: string) {
    return this.office.getAnalysis(projectId, documentId);
  }

  @Get('download')
  @RequireProjectRoles('viewer')
  async download(
    @Param('projectId') projectId: string,
    @Param('documentId') documentId: string,
    @Res() response: Response,
  ) {
    const result = await this.office.download(projectId, documentId);
    response.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    response.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    response.send(result.file);
  }
}

@Controller('wopi/files')
export class WopiController {
  constructor(private readonly office: OfficeService) {}

  @Get(':documentId')
  async checkFileInfo(@Param('documentId') documentId: string, @Req() req: Request) {
    return this.office.checkFileInfo(await this.session(documentId, req));
  }

  @Get(':documentId/contents')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
  async getFile(
    @Param('documentId') documentId: string,
    @Req() req: Request,
    @Res() response: Response,
  ) {
    const file = await this.office.getFile(await this.session(documentId, req));
    response.status(200).send(file);
  }

  @Post(':documentId/contents')
  async putFile(
    @Param('documentId') documentId: string,
    @Req() req: Request,
    @Res() response: Response,
  ) {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    const result = await this.office.putFile(
      await this.session(documentId, req),
      Buffer.concat(chunks),
      req.header('x-wopi-lock'),
    );
    response.setHeader('X-WOPI-ItemVersion', String(result.version));
    response.status(200).json({ LastModifiedTime: result.LastModifiedTime });
  }

  @Post(':documentId')
  async fileOperation(
    @Param('documentId') documentId: string,
    @Req() req: Request,
    @Res() response: Response,
  ) {
    const session = await this.session(documentId, req);
    const operation = req.header('x-wopi-override')?.toUpperCase();
    const lock = req.header('x-wopi-lock') ?? '';
    if (operation === 'GET_LOCK') {
      const current = await this.office.getLock(documentId);
      if (current) response.setHeader('X-WOPI-Lock', current);
      return response.status(200).send();
    }
    if (session.permission !== 'write') return response.status(403).send();
    const result = operation === 'LOCK' || operation === 'REFRESH_LOCK'
      ? await this.office.lock(documentId, lock)
      : operation === 'UNLOCK'
        ? await this.office.unlock(documentId, lock)
        : null;
    if (!result) return response.status(501).send();
    if (!result.ok) {
      response.setHeader('X-WOPI-Lock', result.lock ?? '');
      response.setHeader('X-WOPI-LockFailureReason', 'The document is locked by another editor');
      return response.status(409).send();
    }
    return response.status(200).send();
  }

  private session(documentId: string, req: Request) {
    const token = typeof req.query.access_token === 'string' ? req.query.access_token : '';
    return this.office.sessionForToken(documentId, token);
  }
}

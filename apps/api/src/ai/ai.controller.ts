import {
  Body,
  BadRequestException,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { z } from 'zod';
import {
  aiSettingsSchema,
  officeAiRequestSchema,
  officeAiAcceptanceSchema,
} from '@delayance/validation';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ProjectRoleGuard, type ProjectRequestUser } from '../rbac/project-role.guard';
import { RequireProjectRoles } from '../rbac/roles';
import { AiService } from './ai.service';
import { OfficeAiService } from './office-ai.service';

const aiRequestSchema = z.object({
  instruction: z.string().min(1).max(20000),
  nodeIds: z.array(z.string()).optional(),
  chatId: z.string().uuid().optional(),
});

const autoRequestSchema = aiRequestSchema.extend({
  preferredMode: z.enum(['edit', 'write']).optional(),
});

const streamRequestSchema = z.object({
  instruction: z.string().min(1).max(20000),
  nodeIds: z.array(z.string()).optional(),
  chatId: z.string().uuid().optional(),
  mode: z.enum(['write', 'auto']).default('write'),
  preferredMode: z.enum(['edit', 'write']).optional(),
});

const createChatSchema = z.object({
  title: z.string().max(200).optional(),
});

const updateChatSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  archive: z.boolean().optional(),
});

@ApiTags('ai')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ProjectRoleGuard)
@Controller()
export class AiController {
  constructor(
    private readonly ai: AiService,
    private readonly officeAi: OfficeAiService,
  ) {}

  @Post('projects/:projectId/ai-settings/test')
  @RequireProjectRoles('editor')
  async testSettings(@Param('projectId') projectId: string) {
    const { adapter, model } = await this.ai.resolveProvider(projectId);
    try {
      await adapter.complete([{ role: 'user', content: 'Reply OK.' }], { model });
      return { ok: true, model };
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Gemini connection failed',
      );
    }
  }

  @Post('projects/:projectId/documents/:documentId/office/ai')
  @RequireProjectRoles('viewer')
  runOfficeAi(
    @Param('projectId') projectId: string,
    @Param('documentId') documentId: string,
    @Req() req: { user: ProjectRequestUser },
    @Body(new ZodValidationPipe(officeAiRequestSchema)) body: z.infer<typeof officeAiRequestSchema>,
  ) {
    return this.officeAi.run(projectId, documentId, req.user.userId, req.user.projectRole!, body);
  }

  @Post('projects/:projectId/ai/proposals/:proposalId/office-accept')
  @RequireProjectRoles('contributor')
  authorizeOfficeAi(
    @Param('projectId') projectId: string,
    @Param('proposalId') proposalId: string,
    @Req() req: { user: ProjectRequestUser },
    @Body(new ZodValidationPipe(officeAiAcceptanceSchema))
    body: z.infer<typeof officeAiAcceptanceSchema>,
  ) {
    return this.officeAi.authorize(
      projectId,
      proposalId,
      req.user.userId,
      req.user.projectRole!,
      body.accessToken,
    );
  }

  @Post('projects/:projectId/ai/proposals/:proposalId/office-complete')
  @RequireProjectRoles('contributor')
  completeOfficeAi(
    @Param('projectId') projectId: string,
    @Param('proposalId') proposalId: string,
    @Req() req: { user: ProjectRequestUser },
    @Body(new ZodValidationPipe(officeAiAcceptanceSchema))
    body: z.infer<typeof officeAiAcceptanceSchema>,
  ) {
    return this.officeAi.authorize(
      projectId,
      proposalId,
      req.user.userId,
      req.user.projectRole!,
      body.accessToken,
      true,
    );
  }

  @Get('projects/:projectId/ai-settings')
  @RequireProjectRoles('viewer')
  getSettings(@Param('projectId') projectId: string) {
    return this.ai.getSettings(projectId);
  }

  @Put('projects/:projectId/ai-settings')
  @RequireProjectRoles('editor')
  putSettings(
    @Param('projectId') projectId: string,
    @Body(new ZodValidationPipe(aiSettingsSchema)) body: z.infer<typeof aiSettingsSchema>,
  ) {
    return this.ai.putSettings(projectId, body);
  }

  @Get('projects/:projectId/documents/:documentId/ai/chats')
  @RequireProjectRoles('viewer')
  listChats(@Param('projectId') projectId: string, @Param('documentId') documentId: string) {
    return this.ai.listChats(projectId, documentId);
  }

  @Post('projects/:projectId/documents/:documentId/ai/chats')
  @RequireProjectRoles('viewer')
  createChat(
    @Param('projectId') projectId: string,
    @Param('documentId') documentId: string,
    @Req() req: { user: ProjectRequestUser },
    @Body(new ZodValidationPipe(createChatSchema)) body: z.infer<typeof createChatSchema>,
  ) {
    return this.ai.createChat({
      projectId,
      documentId,
      userId: req.user.userId,
      title: body.title,
    });
  }

  @Patch('projects/:projectId/ai/chats/:chatId')
  @RequireProjectRoles('viewer')
  updateChat(
    @Param('projectId') projectId: string,
    @Param('chatId') chatId: string,
    @Body(new ZodValidationPipe(updateChatSchema)) body: z.infer<typeof updateChatSchema>,
  ) {
    return this.ai.updateChat({
      projectId,
      chatId,
      title: body.title,
      archive: body.archive,
    });
  }

  @Post('projects/:projectId/documents/:documentId/ai/ask')
  @RequireProjectRoles('viewer')
  ask(
    @Param('projectId') projectId: string,
    @Param('documentId') documentId: string,
    @Req() req: { user: ProjectRequestUser },
    @Body(new ZodValidationPipe(aiRequestSchema)) body: z.infer<typeof aiRequestSchema>,
  ) {
    return this.ai.runMode({
      projectId,
      documentId,
      userId: req.user.userId,
      role: req.user.projectRole!,
      mode: 'ask',
      instruction: body.instruction,
      nodeIds: body.nodeIds,
      chatId: body.chatId,
    });
  }

  @Post('projects/:projectId/documents/:documentId/ai/auto')
  @RequireProjectRoles('viewer')
  auto(
    @Param('projectId') projectId: string,
    @Param('documentId') documentId: string,
    @Req() req: { user: ProjectRequestUser },
    @Body(new ZodValidationPipe(autoRequestSchema)) body: z.infer<typeof autoRequestSchema>,
  ) {
    return this.ai.runAuto({
      projectId,
      documentId,
      userId: req.user.userId,
      role: req.user.projectRole!,
      instruction: body.instruction,
      nodeIds: body.nodeIds,
      chatId: body.chatId,
      preferredMode: body.preferredMode,
    });
  }

  /** SSE stream for live Write typing (also used by Auto when it resolves to write). */
  @Post('projects/:projectId/documents/:documentId/ai/stream')
  @RequireProjectRoles('viewer')
  async stream(
    @Param('projectId') projectId: string,
    @Param('documentId') documentId: string,
    @Req() req: { user: ProjectRequestUser },
    @Body(new ZodValidationPipe(streamRequestSchema)) body: z.infer<typeof streamRequestSchema>,
    @Res() res: Response,
  ) {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const writeEvent = (payload: unknown) => {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    try {
      for await (const event of this.ai.streamWrite({
        projectId,
        documentId,
        userId: req.user.userId,
        role: req.user.projectRole!,
        instruction: body.instruction,
        nodeIds: body.nodeIds,
        chatId: body.chatId,
        mode: body.mode,
        preferredMode: body.preferredMode,
      })) {
        writeEvent(event);
      }
    } catch (err) {
      writeEvent({
        type: 'error',
        message: err instanceof Error ? err.message : 'Stream failed',
      });
    } finally {
      res.end();
    }
  }

  @Post('projects/:projectId/documents/:documentId/ai/edit')
  @RequireProjectRoles('contributor')
  edit(
    @Param('projectId') projectId: string,
    @Param('documentId') documentId: string,
    @Req() req: { user: ProjectRequestUser },
    @Body(new ZodValidationPipe(aiRequestSchema)) body: z.infer<typeof aiRequestSchema>,
  ) {
    return this.ai.runMode({
      projectId,
      documentId,
      userId: req.user.userId,
      role: req.user.projectRole!,
      mode: 'edit',
      instruction: body.instruction,
      nodeIds: body.nodeIds,
      chatId: body.chatId,
    });
  }

  @Post('projects/:projectId/documents/:documentId/ai/write')
  @RequireProjectRoles('contributor')
  write(
    @Param('projectId') projectId: string,
    @Param('documentId') documentId: string,
    @Req() req: { user: ProjectRequestUser },
    @Body(new ZodValidationPipe(aiRequestSchema)) body: z.infer<typeof aiRequestSchema>,
  ) {
    return this.ai.runMode({
      projectId,
      documentId,
      userId: req.user.userId,
      role: req.user.projectRole!,
      mode: 'write',
      instruction: body.instruction,
      nodeIds: body.nodeIds,
      chatId: body.chatId,
    });
  }

  @Post('projects/:projectId/documents/:documentId/ai/review')
  @RequireProjectRoles('reviewer')
  review(
    @Param('projectId') projectId: string,
    @Param('documentId') documentId: string,
    @Req() req: { user: ProjectRequestUser },
    @Body(new ZodValidationPipe(aiRequestSchema)) body: z.infer<typeof aiRequestSchema>,
  ) {
    return this.ai.runMode({
      projectId,
      documentId,
      userId: req.user.userId,
      role: req.user.projectRole!,
      mode: 'review',
      instruction: body.instruction,
      nodeIds: body.nodeIds,
      chatId: body.chatId,
    });
  }

  @Get('projects/:projectId/documents/:documentId/ai/proposals')
  @RequireProjectRoles('viewer')
  list(
    @Param('projectId') projectId: string,
    @Param('documentId') documentId: string,
    @Query('chatId') chatId?: string,
  ) {
    return this.ai.listProposals(projectId, documentId, chatId);
  }

  @Get('projects/:projectId/ai/proposals/:proposalId')
  @RequireProjectRoles('viewer')
  get(@Param('projectId') projectId: string, @Param('proposalId') proposalId: string) {
    return this.ai.getProposal(projectId, proposalId);
  }

  @Post('projects/:projectId/ai/proposals/:proposalId/accept')
  @RequireProjectRoles('contributor')
  accept(
    @Param('projectId') projectId: string,
    @Param('proposalId') proposalId: string,
    @Req() req: { user: ProjectRequestUser },
  ) {
    return this.ai.acceptProposal({
      projectId,
      proposalId,
      userId: req.user.userId,
      role: req.user.projectRole!,
    });
  }

  @Post('projects/:projectId/ai/proposals/:proposalId/reject')
  @RequireProjectRoles('contributor')
  reject(@Param('projectId') projectId: string, @Param('proposalId') proposalId: string) {
    return this.ai.rejectProposal(projectId, proposalId);
  }
}

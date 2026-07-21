import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ProjectRoleGuard, type ProjectRequestUser } from '../rbac/project-role.guard';
import { RequireProjectRoles } from '../rbac/roles';
import { AiService } from './ai.service';

const settingsSchema = z.object({
  policy: z.enum(['any', 'local_only']).optional(),
  provider: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
  baseUrl: z.string().nullable().optional(),
  apiKey: z.string().nullable().optional(),
});

const aiRequestSchema = z.object({
  instruction: z.string().min(1).max(20000),
  nodeIds: z.array(z.string()).optional(),
  chatId: z.string().uuid().optional(),
});

const autoRequestSchema = aiRequestSchema.extend({
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
  constructor(private readonly ai: AiService) {}

  @Get('projects/:projectId/ai-settings')
  @RequireProjectRoles('viewer')
  getSettings(@Param('projectId') projectId: string) {
    return this.ai.getSettings(projectId);
  }

  @Put('projects/:projectId/ai-settings')
  @RequireProjectRoles('editor')
  putSettings(
    @Param('projectId') projectId: string,
    @Body(new ZodValidationPipe(settingsSchema)) body: z.infer<typeof settingsSchema>,
  ) {
    return this.ai.putSettings(projectId, body);
  }

  @Get('projects/:projectId/documents/:documentId/ai/chats')
  @RequireProjectRoles('viewer')
  listChats(
    @Param('projectId') projectId: string,
    @Param('documentId') documentId: string,
  ) {
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
  get(
    @Param('projectId') projectId: string,
    @Param('proposalId') proposalId: string,
  ) {
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
  reject(
    @Param('projectId') projectId: string,
    @Param('proposalId') proposalId: string,
  ) {
    return this.ai.rejectProposal(projectId, proposalId);
  }
}

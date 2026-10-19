import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { buildOfficeMessages } from '@delayance/ai-core';
import { extractDocumentAnalysis } from '@delayance/docx-engine';
import { officeAiRequestSchema, officeTextRevisionSchema } from '@delayance/validation';
import type { ProjectRole } from '@delayance/shared-types';
import { DatabaseService } from '../database/database.service';
import { aiProposals, projectMemoryItems, projectSources } from '../database/schema';
import { DocumentsService } from '../documents/documents.service';
import { OfficeService } from '../office/office.service';
import { canEditContent, roleAtLeast } from '../rbac/roles';
import { AiService } from './ai.service';

const replySchema = z.object({
  answer: z.string().max(100000).default(''),
  text: z.string().max(100000).default(''),
  citedSourceIds: z.array(z.string().uuid()).max(100).default([]),
});

@Injectable()
export class OfficeAiService {
  constructor(
    private readonly database: DatabaseService,
    private readonly documents: DocumentsService,
    private readonly office: OfficeService,
    private readonly ai: AiService,
  ) {}

  async run(
    projectId: string,
    documentId: string,
    userId: string,
    role: ProjectRole,
    request: z.infer<typeof officeAiRequestSchema>,
  ) {
    await this.documents.get(projectId, documentId);
    const classification =
      request.mode === 'auto'
        ? request.preferredMode
          ? { mode: request.preferredMode, needsClarification: false }
          : await this.ai.resolveIntent(projectId, request.instruction)
        : { mode: request.mode, needsClarification: false };
    const mode = classification.mode;
    if (mode === 'review' && !roleAtLeast(role, 'reviewer'))
      throw new ForbiddenException('Reviewer role required');
    if ((mode === 'edit' || mode === 'write') && !canEditContent(role))
      throw new ForbiddenException('Contributor role required');
    if (mode === 'edit' && !request.selectedText.trim())
      throw new BadRequestException(
        'Select the text to edit in the document editor before sending the request.',
      );
    const chat = request.chatId
      ? (await this.ai.listChats(projectId, documentId)).find((item) => item.id === request.chatId)
      : await this.ai.createChat({
          projectId,
          documentId,
          userId,
          title: request.instruction.slice(0, 60),
        });
    if (!chat) throw new BadRequestException('Chat not found for this document');
    if (!mode || classification.needsClarification) {
      const [proposal] = await this.database.db
        .insert(aiProposals)
        .values({
          projectId,
          documentId,
          chatId: chat.id,
          mode: 'auto',
          provider: 'auto',
          model: 'intent',
          promptSummary: request.instruction,
          answer: 'Should I edit selected text or write new content?',
          createdBy: userId,
        })
        .returning();
      return {
        proposal,
        chatId: chat.id,
        applied: false,
        needsClarification: true,
        validation: { ok: true, errors: [] },
        externalProviderWarning: null,
      };
    }
    const { adapter, model } = await this.ai.resolveProvider(projectId);
    const snapshot = await this.office.download(projectId, documentId);
    const { file } = snapshot;
    const analysis = await extractDocumentAnalysis(file);
    if (analysis.fileHash !== snapshot.fileHash)
      throw new ConflictException('The document changed. Retry with the latest saved version.');
    const memories = await this.database.db
      .select()
      .from(projectMemoryItems)
      .where(eq(projectMemoryItems.projectId, projectId));
    const sources = await this.database.db
      .select()
      .from(projectSources)
      .where(
        and(
          eq(projectSources.projectId, projectId),
          eq(projectSources.aiMayUse, true),
          eq(projectSources.outdated, false),
        ),
      );
    const raw = await adapter
      .completeStructured(
        buildOfficeMessages({
          mode,
          instruction: request.instruction,
          title: snapshot.title,
          documentText: analysis.plainText,
          selectedText: request.selectedText,
          memory: memories.map((item) => `[${item.kind}] ${item.body}`),
          sources: sources.map(
            (item) => `[${item.id}] ${item.title}: ${item.textContent.slice(0, 1200)}`,
          ),
        }),
        { model, schemaHint: '{"answer":"...","text":"...","citedSourceIds":[]}' },
      )
      .catch((error: unknown) => {
        throw new BadRequestException(
          error instanceof Error ? error.message : 'Gemini request failed',
        );
      });
    const parsed = replySchema.safeParse(raw);
    if (!parsed.success)
      throw new BadRequestException('Gemini returned an invalid text proposal. Retry the request.');
    const reply = parsed.data;
    const editing = mode === 'write' || mode === 'edit';
    if (editing && !reply.text.trim())
      throw new BadRequestException('Gemini returned no proposed text. Retry the request.');
    const revision = editing
      ? officeTextRevisionSchema.parse({
          type: 'office-text',
          action: mode === 'edit' ? 'replace' : 'insert',
          originalText: mode === 'edit' ? request.selectedText : '',
          text: reply.text,
          fileHash: analysis.fileHash,
          version: snapshot.version,
        })
      : null;
    const allowedSources = new Set(sources.map((item) => item.id));
    const [proposal] = await this.database.db
      .insert(aiProposals)
      .values({
        projectId,
        documentId,
        chatId: chat.id,
        mode,
        model,
        provider: 'gemini',
        promptSummary: request.instruction,
        answer: reply.answer,
        ops: revision ? [revision] : [],
        findings: [],
        citedSourceIds: reply.citedSourceIds.filter((id) => allowedSources.has(id)),
        createdBy: userId,
      })
      .returning();
    return {
      proposal,
      chatId: chat.id,
      resolvedMode: mode,
      applied: false,
      validation: { ok: true, errors: [] },
      // Normal provider context is disclosed in AI settings, not treated as a warning.
      externalProviderWarning: null,
    };
  }

  async authorize(
    projectId: string,
    proposalId: string,
    userId: string,
    role: ProjectRole,
    accessToken: string,
    complete = false,
  ) {
    if (!canEditContent(role)) throw new ForbiddenException('Contributor role required');
    const proposal = await this.ai.getProposal(projectId, proposalId);
    if (proposal.status !== 'pending' || proposal.ops.length !== 1)
      throw new BadRequestException('Proposal cannot be applied');
    const parsed = officeTextRevisionSchema.safeParse(proposal.ops[0]);
    if (!parsed.success) throw new BadRequestException('This is not an office text proposal');
    const revision = parsed.data;
    const session = await this.office.sessionForToken(proposal.documentId, accessToken);
    if (
      session.userId !== userId ||
      session.projectId !== projectId ||
      session.permission !== 'write'
    )
      throw new ForbiddenException('A writable editor session is required');
    const document = await this.documents.get(projectId, proposal.documentId);
    if (!complete) {
      if (document.fileHash !== revision.fileHash || document.currentVersion !== revision.version)
        throw new ConflictException(
          'Document changed since this proposal. Generate a new proposal.',
        );
      return revision;
    }
    if (document.currentVersion <= revision.version || document.fileHash === revision.fileHash)
      throw new ConflictException('The editor has not saved the change yet.');
    const { file } = await this.office.download(projectId, proposal.documentId);
    const analysis = await extractDocumentAnalysis(file);
    const normalize = (text: string) => text.replace(/\s+/g, ' ').trim();
    if (
      analysis.fileHash !== document.fileHash ||
      !normalize(analysis.plainText).includes(normalize(revision.text))
    ) {
      throw new ConflictException('The saved document does not contain the proposed text yet.');
    }
    await this.database.db
      .update(aiProposals)
      .set({ status: 'accepted' })
      .where(
        and(
          eq(aiProposals.id, proposalId),
          eq(aiProposals.projectId, projectId),
          eq(aiProposals.status, 'pending'),
        ),
      );
    return { ok: true };
  }
}

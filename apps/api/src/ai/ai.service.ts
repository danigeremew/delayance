import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { applyOperation } from '@delayance/document-engine';
import {
  buildIntentClassificationMessages,
  buildMessages,
  classifyAiIntent,
  packContext,
  parseIntentClassification,
  resolveDocumentOps,
  validateAiProposal,
  type AiMode,
  type IntentClassification,
} from '@delayance/ai-core';
import { createProvider, listOllamaModels } from '@delayance/provider-adapters';
import { documentSchema, type Document } from '@delayance/document-model';
import type { ProjectRole } from '@delayance/shared-types';
import { AppConfigService } from '../config/app-config.service';
import { decryptSecret, encryptSecret } from '../crypto/secrets';
import { DatabaseService } from '../database/database.service';
import {
  aiChats,
  aiProposals,
  comments,
  projectAiSettings,
  projectMemoryItems,
  projectSources,
} from '../database/schema';
import { DocumentsService } from '../documents/documents.service';
import { canEditContent, roleAtLeast } from '../rbac/roles';

function asDocument(content: unknown): Document {
  return documentSchema.parse(content) as Document;
}

function titleFromInstruction(instruction: string) {
  const t = instruction.trim().replace(/\s+/g, ' ');
  return (t.slice(0, 60) || 'New chat') + (t.length > 60 ? '…' : '');
}

@Injectable()
export class AiService {
  constructor(
    private readonly database: DatabaseService,
    private readonly config: AppConfigService,
    private readonly documents: DocumentsService,
  ) {}

  async getSettings(projectId: string) {
    const row = await this.database.db.query.projectAiSettings.findFirst({
      where: eq(projectAiSettings.projectId, projectId),
    });
    if (!row) {
      return {
        projectId,
        policy: 'local_only' as const,
        provider: 'ollama',
        model: 'llama3.2',
        baseUrl: 'http://127.0.0.1:11434/v1',
        hasApiKey: false,
      };
    }
    return {
      projectId: row.projectId,
      policy: row.policy,
      provider: row.provider,
      model: row.model,
      baseUrl: row.baseUrl,
      hasApiKey: Boolean(row.encryptedApiKey),
    };
  }

  async listOllamaModels(baseUrl?: string | null) {
    try {
      const models = await listOllamaModels(baseUrl);
      return { ok: true as const, models, baseUrl: baseUrl ?? 'http://127.0.0.1:11434/v1' };
    } catch (err) {
      return {
        ok: false as const,
        models: [] as { name: string; size: number; modifiedAt: string | null }[],
        baseUrl: baseUrl ?? 'http://127.0.0.1:11434/v1',
        error: err instanceof Error ? err.message : 'Failed to list Ollama models',
      };
    }
  }

  async putSettings(
    projectId: string,
    input: {
      policy?: 'any' | 'local_only';
      provider?: string;
      model?: string;
      baseUrl?: string | null;
      apiKey?: string | null;
    },
  ) {
    const existing = await this.database.db.query.projectAiSettings.findFirst({
      where: eq(projectAiSettings.projectId, projectId),
    });
    const encryptedApiKey =
      input.apiKey === undefined
        ? existing?.encryptedApiKey
        : input.apiKey
          ? encryptSecret(input.apiKey, this.config.env.SECRETS_ENCRYPTION_KEY)
          : null;

    const values = {
      projectId,
      policy: input.policy ?? existing?.policy ?? ('local_only' as const),
      provider: input.provider ?? existing?.provider ?? 'ollama',
      model: input.model ?? existing?.model ?? 'llama3.2',
      baseUrl:
        input.baseUrl === undefined
          ? (existing?.baseUrl ?? 'http://127.0.0.1:11434/v1')
          : input.baseUrl,
      encryptedApiKey: encryptedApiKey ?? null,
      updatedAt: new Date(),
    };

    const [row] = await this.database.db
      .insert(projectAiSettings)
      .values(values)
      .onConflictDoUpdate({
        target: projectAiSettings.projectId,
        set: values,
      })
      .returning();

    void row;
    return this.getSettings(projectId);
  }

  private async resolveProvider(projectId: string) {
    const settings = await this.database.db.query.projectAiSettings.findFirst({
      where: eq(projectAiSettings.projectId, projectId),
    });
    const provider = settings?.provider ?? 'ollama';
    const policy = settings?.policy ?? 'local_only';
    const apiKey = settings?.encryptedApiKey
      ? decryptSecret(settings.encryptedApiKey, this.config.env.SECRETS_ENCRYPTION_KEY)
      : null;
    const adapter = createProvider({
      provider,
      apiKey,
      baseUrl: settings?.baseUrl ?? 'http://127.0.0.1:11434/v1',
    });
    if (policy === 'local_only' && !adapter.isLocal) {
      throw new ForbiddenException(
        'Project policy is local AI only; configure Ollama or a local OpenAI-compatible endpoint',
      );
    }
    return {
      adapter,
      model: settings?.model ?? 'llama3.2',
      provider,
      policy,
      external: !adapter.isLocal,
    };
  }

  async listChats(projectId: string, documentId: string) {
    await this.documents.get(projectId, documentId);
    const chats = await this.database.db
      .select()
      .from(aiChats)
      .where(
        and(
          eq(aiChats.projectId, projectId),
          eq(aiChats.documentId, documentId),
          isNull(aiChats.archivedAt),
        ),
      )
      .orderBy(desc(aiChats.updatedAt));

    return chats.map((c) => ({
      id: c.id,
      title: c.title,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));
  }

  async createChat(input: {
    projectId: string;
    documentId: string;
    userId: string;
    title?: string;
  }) {
    await this.documents.get(input.projectId, input.documentId);
    const [chat] = await this.database.db
      .insert(aiChats)
      .values({
        projectId: input.projectId,
        documentId: input.documentId,
        title: input.title?.trim() || 'New chat',
        createdBy: input.userId,
      })
      .returning();
    if (!chat) throw new BadRequestException('Failed to create chat');
    return chat;
  }

  async updateChat(input: {
    projectId: string;
    chatId: string;
    title?: string;
    archive?: boolean;
  }) {
    const chat = await this.database.db.query.aiChats.findFirst({
      where: and(eq(aiChats.id, input.chatId), eq(aiChats.projectId, input.projectId)),
    });
    if (!chat) throw new NotFoundException('Chat not found');

    const [updated] = await this.database.db
      .update(aiChats)
      .set({
        ...(input.title !== undefined ? { title: input.title.trim() || chat.title } : {}),
        ...(input.archive ? { archivedAt: new Date() } : {}),
        updatedAt: new Date(),
      })
      .where(eq(aiChats.id, chat.id))
      .returning();
    return updated;
  }

  private async resolveChatId(input: {
    projectId: string;
    documentId: string;
    userId: string;
    chatId?: string;
    instruction: string;
  }) {
    if (input.chatId) {
      const chat = await this.database.db.query.aiChats.findFirst({
        where: and(
          eq(aiChats.id, input.chatId),
          eq(aiChats.projectId, input.projectId),
          eq(aiChats.documentId, input.documentId),
        ),
      });
      if (!chat) throw new BadRequestException('Chat not found for this document');
      const isDefaultTitle = chat.title === 'New chat' || chat.title === 'Earlier conversations';
      await this.database.db
        .update(aiChats)
        .set({
          updatedAt: new Date(),
          ...(isDefaultTitle ? { title: titleFromInstruction(input.instruction) } : {}),
        })
        .where(eq(aiChats.id, chat.id));
      return chat.id;
    }

    const created = await this.createChat({
      projectId: input.projectId,
      documentId: input.documentId,
      userId: input.userId,
      title: titleFromInstruction(input.instruction),
    });
    return created.id;
  }

  async runMode(input: {
    projectId: string;
    documentId: string;
    userId: string;
    role: ProjectRole;
    mode: AiMode;
    instruction: string;
    nodeIds?: string[];
    chatId?: string;
  }) {
    this.assertModeAllowed(input.role, input.mode);
    return this.executeMode(input);
  }

  /**
   * Auto mode: classify intent, ask Edit vs Write when unclear, otherwise run the resolved mode.
   */
  async runAuto(input: {
    projectId: string;
    documentId: string;
    userId: string;
    role: ProjectRole;
    instruction: string;
    nodeIds?: string[];
    chatId?: string;
    /** When the user already answered an Edit vs Write clarification. */
    preferredMode?: 'edit' | 'write';
  }) {
    await this.documents.get(input.projectId, input.documentId);
    const chatId = await this.resolveChatId({
      projectId: input.projectId,
      documentId: input.documentId,
      userId: input.userId,
      chatId: input.chatId,
      instruction: input.instruction,
    });

    let classification: IntentClassification;

    if (input.preferredMode) {
      classification = {
        mode: input.preferredMode,
        needsClarification: false,
        reason: `User chose ${input.preferredMode}`,
        confidence: 'high',
      };
    } else {
      classification = await this.resolveIntent(input.projectId, input.instruction);
    }

    if (classification.needsClarification || !classification.mode) {
      const [proposal] = await this.database.db
        .insert(aiProposals)
        .values({
          projectId: input.projectId,
          documentId: input.documentId,
          chatId,
          mode: 'auto',
          model: 'intent',
          provider: 'auto',
          promptSummary: input.instruction.slice(0, 500),
          contextNodeIds: input.nodeIds ?? [],
          answer:
            'Should I Edit existing document content, or Write new content?\n\n' +
            (classification.reason ? `(${classification.reason})` : ''),
          ops: [],
          findings: [],
          citedSourceIds: [],
          status: 'pending',
          createdBy: input.userId,
        })
        .returning();

      return {
        proposal,
        chatId,
        applied: false,
        needsClarification: true as const,
        clarification: 'edit_or_write' as const,
        resolvedMode: null,
        classification,
        validation: { ok: true, errors: [] as string[] },
        externalProviderWarning: null as string | null,
      };
    }

    const result = await this.executeMode({
      ...input,
      chatId,
      mode: classification.mode,
    });

    return {
      ...result,
      needsClarification: false as const,
      clarification: null,
      resolvedMode: classification.mode,
      classification,
    };
  }

  private assertModeAllowed(role: ProjectRole, mode: AiMode) {
    if (mode === 'ask') return;
    if (mode === 'review') {
      if (!roleAtLeast(role, 'reviewer')) {
        throw new ForbiddenException('Reviewer role required for review mode');
      }
      return;
    }
    if (!canEditContent(role)) {
      throw new ForbiddenException('Contributor role required to edit or write');
    }
  }

  private async resolveIntent(
    projectId: string,
    instruction: string,
  ): Promise<IntentClassification> {
    const heuristic = classifyAiIntent(instruction);
    if (heuristic.needsClarification) return heuristic;
    if (heuristic.confidence === 'high') return heuristic;

    try {
      const { adapter, model } = await this.resolveProvider(projectId);
      const messages = buildIntentClassificationMessages(instruction);
      const raw = await adapter.completeStructured(messages, {
        model,
        schemaHint:
          '{"mode":"ask"|"edit"|"write"|"review"|null,"needsClarification":false,"reason":"..."}',
        temperature: 0,
        maxTokens: 200,
      });
      const parsed = parseIntentClassification(raw);
      if (parsed) return parsed;
    } catch {
      // Fall back to heuristics when classification call fails.
    }

    return heuristic;
  }

  private async executeMode(input: {
    projectId: string;
    documentId: string;
    userId: string;
    role: ProjectRole;
    mode: AiMode;
    instruction: string;
    nodeIds?: string[];
    chatId?: string;
  }) {
    const docRow = await this.documents.get(input.projectId, input.documentId);
    const content = asDocument(docRow.content);
    const chatId = await this.resolveChatId({
      projectId: input.projectId,
      documentId: input.documentId,
      userId: input.userId,
      chatId: input.chatId,
      instruction: input.instruction,
    });
    const { adapter, model, provider, external } = await this.resolveProvider(
      input.projectId,
    );

    const memories = await this.database.db
      .select()
      .from(projectMemoryItems)
      .where(eq(projectMemoryItems.projectId, input.projectId));
    const sources = await this.database.db
      .select()
      .from(projectSources)
      .where(
        and(
          eq(projectSources.projectId, input.projectId),
          eq(projectSources.aiMayUse, true),
          eq(projectSources.outdated, false),
        ),
      );

    const pack = packContext({
      document: content,
      memoryItems: memories.map((m) => ({ kind: m.kind, content: m.body })),
      sourceTexts: sources.map((s) => ({
        id: s.id,
        title: s.title,
        text: s.textContent,
      })),
      nodeIds: input.nodeIds,
      includeAllRootIds: input.mode === 'edit',
      maxNodes: input.mode === 'edit' ? 48 : 12,
    });

    const messages = buildMessages(input.mode, input.instruction, pack);

    let answer: string | undefined;
    let raw: unknown = { answer: '', ops: [], findings: [], citedSourceIds: [] };
    let citedSourceIds: string[] = [];

    if (input.mode === 'ask') {
      raw = await adapter.completeStructured(messages, {
        model,
        schemaHint:
          '{"answer":"markdown answer","citedSourceIds":["source-uuid"]}',
      });
      const parsed = raw as { answer?: string; citedSourceIds?: string[] };
      answer = parsed.answer;
      const allowed = new Set(pack.sourceIds);
      citedSourceIds = (parsed.citedSourceIds ?? []).filter((id) => allowed.has(id));
    } else {
      raw = await adapter.completeStructured(messages, {
        model,
        schemaHint:
          input.mode === 'review'
            ? '{"findings":[{"nodeId":"uuid","severity":"info","message":"..."}],"ops":[],"answer":"..."}'
            : input.mode === 'write'
              ? '{"answer":"short summary","ops":[{"type":"insert","parentId":null,"position":"into","node":{"id":"uuid","type":"section","children":[{"id":"uuid","type":"heading","level":1,"content":[{"type":"text","text":"..."}]},{"id":"uuid","type":"paragraph","content":[{"type":"text","text":"..."}]}]}}]}'
              : '{"answer":"...","ops":[{"type":"replace","targetId":"...","node":{"id":"...","type":"paragraph","content":[{"type":"text","text":"..."}]}}]}',
      });
      answer = (raw as { answer?: string }).answer;
    }

    const validated =
      input.mode === 'ask'
        ? { ok: true, payload: raw as never, ops: [], errors: [] as string[] }
        : resolveDocumentOps(raw, content, input.role, input.mode, input.instruction);

    const findings =
      validated.payload?.findings ??
      (raw as { findings?: { nodeId?: string; severity?: string; message: string; suggestion?: string }[] })
        .findings ??
      [];

    const shouldAutoApply =
      input.mode !== 'ask' &&
      validated.ok &&
      (validated.ops.length > 0 || (input.mode === 'review' && findings.length > 0));

    const [proposal] = await this.database.db
      .insert(aiProposals)
      .values({
        projectId: input.projectId,
        documentId: input.documentId,
        chatId,
        mode: input.mode,
        model,
        provider,
        promptSummary: input.instruction.slice(0, 500),
        contextNodeIds: pack.contextNodeIds,
        answer: answer ?? validated.payload?.answer ?? null,
        ops: validated.ops,
        findings,
        citedSourceIds,
        status: shouldAutoApply ? 'accepted' : 'pending',
        createdBy: input.userId,
      })
      .returning();

    if (shouldAutoApply) {
      await this.applyProposalOps({
        projectId: input.projectId,
        documentId: input.documentId,
        userId: input.userId,
        role: input.role,
        ops: validated.ops,
        findings,
        mode: input.mode,
      });
    }

    return {
      proposal,
      chatId,
      applied: shouldAutoApply,
      validation: { ok: validated.ok, errors: validated.errors },
      externalProviderWarning: external
        ? 'Document content may be sent to an external AI provider'
        : null,
    };
  }

  private async applyProposalOps(input: {
    projectId: string;
    documentId: string;
    userId: string;
    role: ProjectRole;
    ops: Parameters<typeof applyOperation>[1][];
    findings: { nodeId?: string; severity?: string; message: string; suggestion?: string }[];
    mode: string;
  }) {
    const docRow = await this.documents.get(input.projectId, input.documentId);
    let content = asDocument(docRow.content);

    for (const op of input.ops) {
      const result = applyOperation(content, op);
      if (!result.ok) {
        throw new BadRequestException(result.error ?? 'Failed to apply op');
      }
      content = result.document;
    }

    for (const finding of input.findings) {
      if (finding.nodeId && finding.message) {
        await this.database.db.insert(comments).values({
          documentId: input.documentId,
          anchorNodeId: finding.nodeId,
          body: `[AI Review:${finding.severity ?? 'info'}] ${finding.message}${finding.suggestion ? ` — ${finding.suggestion}` : ''}`,
          authorId: input.userId,
        });
      }
    }

    if (input.ops.length > 0) {
      await this.documents.patchContent(
        input.projectId,
        input.documentId,
        input.userId,
        input.role,
        {
          content,
          createVersion: true,
          versionReason: `ai.proposal.accept:${input.mode}`,
        },
      );
    }
  }

  async listProposals(projectId: string, documentId: string, chatId?: string) {
    const conditions = [
      eq(aiProposals.projectId, projectId),
      eq(aiProposals.documentId, documentId),
    ];
    if (chatId) conditions.push(eq(aiProposals.chatId, chatId));

    return this.database.db
      .select()
      .from(aiProposals)
      .where(and(...conditions))
      .orderBy(asc(aiProposals.createdAt));
  }

  async getProposal(projectId: string, proposalId: string) {
    const row = await this.database.db.query.aiProposals.findFirst({
      where: and(eq(aiProposals.id, proposalId), eq(aiProposals.projectId, projectId)),
    });
    if (!row) throw new NotFoundException('Proposal not found');
    return row;
  }

  async acceptProposal(input: {
    projectId: string;
    proposalId: string;
    userId: string;
    role: ProjectRole;
  }) {
    if (!canEditContent(input.role)) throw new ForbiddenException();
    const proposal = await this.getProposal(input.projectId, input.proposalId);
    if (proposal.status !== 'pending') {
      throw new BadRequestException('Proposal already resolved');
    }

    const docRow = await this.documents.get(input.projectId, proposal.documentId);
    const content = asDocument(docRow.content);

    const validated = validateAiProposal(
      { ops: proposal.ops, findings: proposal.findings, answer: proposal.answer ?? undefined },
      content,
      input.role,
    );
    if (!validated.ok) {
      throw new BadRequestException({ message: 'Invalid proposal', errors: validated.errors });
    }

    await this.applyProposalOps({
      projectId: input.projectId,
      documentId: proposal.documentId,
      userId: input.userId,
      role: input.role,
      ops: validated.ops,
      findings: validated.payload?.findings ?? [],
      mode: proposal.mode,
    });

    await this.database.db
      .update(aiProposals)
      .set({ status: 'accepted' })
      .where(eq(aiProposals.id, proposal.id));

    const updated = await this.documents.get(input.projectId, proposal.documentId);
    return { document: updated, proposalId: proposal.id };
  }

  async rejectProposal(projectId: string, proposalId: string) {
    const proposal = await this.getProposal(projectId, proposalId);
    if (proposal.status !== 'pending') {
      throw new BadRequestException('Proposal already resolved');
    }
    await this.database.db
      .update(aiProposals)
      .set({ status: 'rejected' })
      .where(eq(aiProposals.id, proposalId));
    return { ok: true };
  }
}

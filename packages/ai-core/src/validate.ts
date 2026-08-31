import {
  applyOperation,
  findNode,
  type DocumentOperation,
} from '@delayance/document-engine';
import type { Document } from '@delayance/document-model';
import {
  aiProposalPayloadSchema,
  type AiProposalPayload,
} from './types';
import {
  isClearDocumentIntent,
  normalizeProposedOp,
  synthesizeClearDocumentOps,
  synthesizeWriteOpsFromText,
} from './normalize';

export type RoleForAi = 'viewer' | 'reviewer' | 'contributor' | 'editor' | 'owner';

const ROLE_RANK: Record<RoleForAi, number> = {
  viewer: 1,
  reviewer: 2,
  contributor: 3,
  editor: 4,
  owner: 5,
};

function canEdit(role: RoleForAi) {
  return ROLE_RANK[role] >= ROLE_RANK.contributor;
}

export interface ValidateAiProposalResult {
  ok: boolean;
  payload?: AiProposalPayload;
  ops: DocumentOperation[];
  errors: string[];
}

export function parseAiProposal(raw: unknown): ValidateAiProposalResult {
  const parsed = aiProposalPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      ops: [],
      errors: parsed.error.issues.map((i) => i.message),
    };
  }
  const ops: DocumentOperation[] = [];
  const errors: string[] = [];
  for (const op of parsed.data.ops) {
    const coerced = normalizeProposedOp(op);
    if (!coerced) {
      errors.push(`Invalid node in ${op.type} operation`);
      continue;
    }
    ops.push(coerced);
  }
  return {
    ok: errors.length === 0,
    payload: parsed.data,
    ops,
    errors,
  };
}

export function validateAiProposal(
  raw: unknown,
  doc: Document,
  role: RoleForAi,
): ValidateAiProposalResult {
  const base = parseAiProposal(raw);
  if (!base.payload) return base;

  const errors = [...base.errors];
  if (base.ops.length > 0 && !canEdit(role)) {
    errors.push('Role cannot apply document edits');
  }

  let working = doc;
  const applied: DocumentOperation[] = [];
  for (const op of base.ops) {
    if (op.type === 'replace' || op.type === 'delete') {
      const node = findNode(working, op.targetId);
      if (!node) errors.push(`Target ${op.targetId} not found`);
    }
    if (op.type === 'moveSection') {
      const node = findNode(working, op.sectionId);
      if (!node) errors.push(`Section ${op.sectionId} not found`);
    }
    if (op.type === 'promoteHeading' || op.type === 'demoteHeading') {
      const node = findNode(working, op.headingId);
      if (!node) errors.push(`Heading ${op.headingId} not found`);
    }

    const trial = applyOperation(working, op);
    if (!trial.ok) {
      errors.push(trial.error ?? `Operation ${op.type} rejected`);
    } else {
      working = trial.document;
      applied.push(op);
    }
  }

  return {
    ok: errors.length === 0 && (applied.length > 0 || base.ops.length === 0),
    payload: base.payload,
    ops: applied.length ? applied : base.ops,
    errors,
  };
}

function opsClearDocument(ops: DocumentOperation[], doc: Document): boolean {
  if (!doc.children.length) return ops.length === 0;
  const deletes = new Set(
    ops.filter((o): o is Extract<DocumentOperation, { type: 'delete' }> => o.type === 'delete').map(
      (o) => o.targetId,
    ),
  );
  return doc.children.every((c) => deletes.has(c.id));
}

/** Prefer model ops; recover clear-all / write fallbacks when the model under-delivers. */
export function resolveDocumentOps(
  raw: unknown,
  doc: Document,
  role: RoleForAi,
  mode: 'ask' | 'edit' | 'write' | 'review',
  instruction = '',
): ValidateAiProposalResult {
  if (mode === 'ask') {
    return { ok: true, ops: [], errors: [] };
  }

  // Deterministic clear: don't trust the model to invent N deletes
  if (mode === 'edit' && isClearDocumentIntent(instruction) && doc.children.length > 0) {
    const clears = synthesizeClearDocumentOps(doc);
    const retry = validateAiProposal(
      {
        answer: 'Removed all content from the document.',
        ops: clears,
        findings: [],
      },
      doc,
      role,
    );
    if (retry.ok && retry.ops.length) return retry;
  }

  const validated = validateAiProposal(raw, doc, role);
  const answer =
    validated.payload?.answer ??
    (raw && typeof raw === 'object' && 'answer' in raw
      ? String((raw as { answer?: unknown }).answer ?? '')
      : '');

  // If edit claimed to clear but ops didn't, force clear
  if (
    mode === 'edit' &&
    isClearDocumentIntent(instruction) &&
    doc.children.length > 0 &&
    !opsClearDocument(validated.ops, doc)
  ) {
    const clears = synthesizeClearDocumentOps(doc);
    const retry = validateAiProposal(
      {
        answer: answer || 'Removed all content from the document.',
        ops: clears,
        findings: validated.payload?.findings ?? [],
      },
      doc,
      role,
    );
    if (retry.ok && retry.ops.length) return retry;
  }

  // Write-only fallback: never synthesize inserts for edit (that caused "clear" → add paragraph)
  if (mode === 'write' && (!validated.ok || validated.ops.length === 0) && answer.trim()) {
    const synth = synthesizeWriteOpsFromText(answer);
    if (synth.length) {
      const retry = validateAiProposal(
        { answer, ops: synth, findings: validated.payload?.findings ?? [] },
        doc,
        role,
      );
      if (retry.ok && retry.ops.length) {
        return retry;
      }
    }
  }

  if (mode === 'review' && validated.payload) {
    const hasFindings = (validated.payload.findings?.length ?? 0) > 0;
    if (hasFindings && validated.ops.length === 0) {
      return { ...validated, ok: true, ops: [] };
    }
  }

  return validated;
}

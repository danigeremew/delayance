import type { AiMode } from './types';

export type ClarificationKind = 'edit_or_write';

export interface IntentClassification {
  /** Resolved mode when no clarification is needed. */
  mode: AiMode | null;
  /** True when the user must choose between Edit and Write. */
  needsClarification: boolean;
  clarification?: ClarificationKind;
  reason: string;
  confidence: 'high' | 'medium' | 'low';
}

const ASK_RE =
  /\b(what|why|how|when|where|who|which|does|do|is|are|can|could|would|should|explain|summariz|tell me|help me understand|clarif)\b|\?$/i;

const REVIEW_RE =
  /\b(review|critique|audit|check (for|the|this)|find issues|proofread|quality check|flag (problems|issues)|look for (errors|problems|issues))\b/i;

const EDIT_RE =
  /\b(edit|rewrite|revis|rephras|fix|correct|update|change|modify|improve|tighten|shorten|expand (this|the|it)|replace|delete|remove|clear|rename|move|promote|demote|fix up|clean up)\b/i;

const WRITE_RE =
  /\b(write|draft|compose|create|generate|add (a |an |the )?(new )?(section|chapter|paragraph|intro|conclusion)|insert|append|start (a |the )?document|fill (in|out)|produce)\b/i;

const EDIT_ONLY_RE =
  /\b(delete|remove|clear|rename|move|promote|demote|fix (typo|grammar|spelling)|correct the|change .+ to)\b/i;

const WRITE_ONLY_RE =
  /\b(from scratch|blank|new (section|chapter|document)|start (writing|a document)|draft (a |an |the )?(whole|full|entire))\b/i;

/**
 * Classify user intent for Auto mode.
 * Returns clarification when Edit vs Write cannot be resolved confidently.
 */
export function classifyAiIntent(instruction: string): IntentClassification {
  const text = instruction.trim();
  if (!text) {
    return {
      mode: null,
      needsClarification: false,
      reason: 'Empty instruction',
      confidence: 'low',
    };
  }

  const asks = ASK_RE.test(text);
  const reviews = REVIEW_RE.test(text);
  const edits = EDIT_RE.test(text);
  const writes = WRITE_RE.test(text);
  const editOnly = EDIT_ONLY_RE.test(text);
  const writeOnly = WRITE_ONLY_RE.test(text);

  // Review is distinct and usually explicit.
  if (reviews && !edits && !writes) {
    return {
      mode: 'review',
      needsClarification: false,
      reason: 'Prompt asks for a review or quality check',
      confidence: 'high',
    };
  }

  // Pure questions with no mutation verbs → ask.
  if (asks && !edits && !writes && !reviews) {
    return {
      mode: 'ask',
      needsClarification: false,
      reason: 'Prompt is a question without document changes',
      confidence: 'high',
    };
  }

  // Strong write-only signals.
  if (writeOnly && !editOnly) {
    return {
      mode: 'write',
      needsClarification: false,
      reason: 'Prompt asks to create new content',
      confidence: 'high',
    };
  }

  // Strong edit-only signals.
  if (editOnly && !writeOnly) {
    return {
      mode: 'edit',
      needsClarification: false,
      reason: 'Prompt asks to change existing content',
      confidence: 'high',
    };
  }

  // Both edit and write signals (or vague mutation words used by both) → clarify.
  if (edits && writes) {
    return {
      mode: null,
      needsClarification: true,
      clarification: 'edit_or_write',
      reason: 'Prompt could mean editing existing content or writing new content',
      confidence: 'low',
    };
  }

  // "Add more…" / "include …" without naming a new section is often ambiguous.
  if (
    /\b(add more|add detail|add details|include more|expand on|go deeper|flesh out)\b/i.test(
      text,
    )
  ) {
    return {
      mode: null,
      needsClarification: true,
      clarification: 'edit_or_write',
      reason: 'Unclear whether to revise existing text or insert new content',
      confidence: 'low',
    };
  }

  if (edits) {
    return {
      mode: 'edit',
      needsClarification: false,
      reason: 'Prompt asks to change existing content',
      confidence: 'medium',
    };
  }

  if (writes) {
    return {
      mode: 'write',
      needsClarification: false,
      reason: 'Prompt asks to add new content',
      confidence: 'medium',
    };
  }

  if (reviews) {
    return {
      mode: 'review',
      needsClarification: false,
      reason: 'Prompt mentions review alongside other cues',
      confidence: 'medium',
    };
  }

  // Vague imperative like "make this better" / "do something about X"
  if (
    /\b(make|do|put|get|please)\b/i.test(text) &&
    !asks &&
    text.split(/\s+/).length <= 12
  ) {
    return {
      mode: null,
      needsClarification: true,
      clarification: 'edit_or_write',
      reason: 'Intent to change the document is unclear — edit existing or write new?',
      confidence: 'low',
    };
  }

  // Default: conversational / informational → ask.
  return {
    mode: 'ask',
    needsClarification: false,
    reason: 'No clear document-change intent; treating as a question',
    confidence: 'medium',
  };
}

/** System prompt for optional LLM-assisted classification. */
export function buildIntentClassificationMessages(instruction: string): {
  role: 'system' | 'user';
  content: string;
}[] {
  return [
    {
      role: 'system',
      content: [
        'Classify the user instruction for a document AI assistant.',
        'Modes: ask (answer only, no document changes), edit (change existing content), write (insert new content), review (findings/critique).',
        'If it is unclear whether they want to edit existing text or write new text, set needsClarification to true and mode to null.',
        'Respond JSON only: {"mode":"ask"|"edit"|"write"|"review"|null,"needsClarification":boolean,"reason":"short"}.',
      ].join(' '),
    },
    { role: 'user', content: instruction },
  ];
}

export function parseIntentClassification(raw: unknown): IntentClassification | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const needsClarification = Boolean(obj.needsClarification);
  const modeRaw = obj.mode;
  const mode =
    modeRaw === 'ask' || modeRaw === 'edit' || modeRaw === 'write' || modeRaw === 'review'
      ? modeRaw
      : null;
  const reason =
    typeof obj.reason === 'string' && obj.reason.trim()
      ? obj.reason.trim()
      : 'Classified by model';

  if (needsClarification || mode === null) {
    return {
      mode: null,
      needsClarification: true,
      clarification: 'edit_or_write',
      reason,
      confidence: 'low',
    };
  }

  return {
    mode,
    needsClarification: false,
    reason,
    confidence: 'medium',
  };
}

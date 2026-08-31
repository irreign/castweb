// The narrow interface every AI provider implements. ai-extract and
// ai-assistant depend on these interfaces, never on the concrete Claude
// client — swapping providers (or plugging in a mock for tests/evals) is a
// one-file change. See docs/04-technical-architecture.md §4.5.
import type { RawExtractionResult } from '../extraction.ts';

export interface ContextMessage {
  senderDisplayName: string;
  text: string;
  createdAt: string; // ISO 8601
}

export interface ContextEvent {
  id: string;
  title: string;
  category: string;
  startDate: string; // YYYY-MM-DD
  startTime: string | null; // HH:MM
}

export interface ExtractionRequest {
  triggeringMessage: ContextMessage;
  /** Oldest-first, excludes the triggering message. Bounded window — see docs/06 §6.6. */
  recentMessages: ContextMessage[];
  /** Upcoming family events, for duplicate/correction/reference resolution. */
  upcomingEvents: ContextEvent[];
  familyTimezone: string;
  /** Family-local "today", precomputed via dates.ts — never let the model guess this. */
  nowISODate: string;
}

export interface ExtractionResponse {
  raw: RawExtractionResult;
  model: string;
}

export interface ExtractionProvider {
  extract(input: ExtractionRequest): Promise<ExtractionResponse>;
}

export interface AssistantRequest {
  question: string;
  familyTimezone: string;
  nowISODate: string;
  relevantEvents: ContextEvent[];
  relevantMessages: ContextMessage[];
}

export interface AssistantResponse {
  text: string;
  model: string;
}

export interface AssistantProvider {
  answer(input: AssistantRequest): Promise<AssistantResponse>;
}

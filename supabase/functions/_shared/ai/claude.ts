// The only file in this codebase that talks to the Claude API. Deno-only
// (uses global fetch + Deno.env); not imported by the Node test suite.
// Implements ExtractionProvider and AssistantProvider from provider.ts —
// see docs/04-technical-architecture.md §4.5 for why the rest of the
// pipeline never imports this file's types directly.
import type {
  AssistantProvider, AssistantRequest, AssistantResponse,
  ExtractionProvider, ExtractionRequest, ExtractionResponse,
} from './provider.ts';
import { ASSISTANT_SYSTEM_PROMPT, buildAssistantUserPrompt, buildExtractionUserPrompt, EXTRACTION_SYSTEM_PROMPT } from './prompts.ts';
import { EVENT_CATEGORIES, type RawExtractionResult } from '../extraction.ts';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
// Configurable so a model swap or version pin never requires a code
// change — set CLAUDE_EXTRACTION_MODEL / CLAUDE_ASSISTANT_MODEL in the
// function's env. Defaults to Sonnet, Anthropic's balanced model, for
// both — extraction doesn't need the largest model, and keeping the pair
// on the same model avoids paying for two cold caches.
const DEFAULT_MODEL = 'claude-sonnet-5';
const REQUEST_TIMEOUT_MS = 20_000;

function apiKey(): string {
  const key = Deno.env.get('CLAUDE_API_KEY');
  if (!key) throw new Error('CLAUDE_API_KEY is not configured');
  return key;
}

async function callAnthropic(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey(),
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Anthropic API error ${res.status}: ${text.slice(0, 300)}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}

// Forcing tool use (rather than parsing free-form JSON out of prose) is
// what makes "structured data, not free-form text" (brief §6) reliable at
// the transport layer — validateExtraction() in extraction.ts is the real
// safety net regardless, but this avoids the common failure mode of the
// model wrapping JSON in markdown fences or commentary.
const EXTRACTION_TOOL = {
  name: 'record_extraction',
  description: 'Records the structured result of evaluating a message for calendar-event content.',
  input_schema: {
    type: 'object',
    properties: {
      is_event: { type: 'boolean' },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
      title: { type: ['string', 'null'] },
      date: { type: ['string', 'null'], description: 'YYYY-MM-DD' },
      end_date: { type: ['string', 'null'], description: 'YYYY-MM-DD, for date ranges' },
      start_time: { type: ['string', 'null'], description: 'HH:MM 24h, family-local' },
      end_time: { type: ['string', 'null'], description: 'HH:MM 24h, family-local' },
      all_day: { type: 'boolean' },
      location: { type: ['string', 'null'] },
      category: { type: 'string', enum: EVENT_CATEGORIES },
      recurrence: { type: ['string', 'null'] },
      participants: { type: 'array', items: { type: 'string' } },
      needs_clarification: { type: 'boolean' },
      clarification_question: { type: ['string', 'null'] },
      is_correction: { type: 'boolean' },
      reasoning: { type: 'string', description: 'One short sentence. Never shown to users — for debugging/provenance only.' },
    },
    required: ['is_event', 'confidence', 'category', 'all_day', 'needs_clarification', 'is_correction', 'reasoning'],
  },
};

function extractToolInput(response: Record<string, unknown>, toolName: string): Record<string, unknown> | null {
  const content = response.content;
  if (!Array.isArray(content)) return null;
  for (const block of content) {
    if (block && typeof block === 'object' && (block as { type?: string }).type === 'tool_use' && (block as { name?: string }).name === toolName) {
      const input = (block as { input?: unknown }).input;
      return input && typeof input === 'object' ? (input as Record<string, unknown>) : null;
    }
  }
  return null;
}

class ClaudeProvider implements ExtractionProvider, AssistantProvider {
  async extract(input: ExtractionRequest): Promise<ExtractionResponse> {
    const model = Deno.env.get('CLAUDE_EXTRACTION_MODEL') || DEFAULT_MODEL;
    const system = EXTRACTION_SYSTEM_PROMPT
      .replace('{{TIMEZONE}}', input.familyTimezone)
      .replace('{{TODAY}}', input.nowISODate);

    const response = await callAnthropic({
      model,
      max_tokens: 1024,
      system,
      messages: [{ role: 'user', content: buildExtractionUserPrompt(input) }],
      tools: [EXTRACTION_TOOL],
      tool_choice: { type: 'tool', name: 'record_extraction' },
    });

    const toolInput = extractToolInput(response, 'record_extraction');
    if (!toolInput) {
      throw new Error('Claude did not return a record_extraction tool call');
    }
    return { raw: toolInput as RawExtractionResult, model };
  }

  async answer(input: AssistantRequest): Promise<AssistantResponse> {
    const model = Deno.env.get('CLAUDE_ASSISTANT_MODEL') || DEFAULT_MODEL;
    const system = ASSISTANT_SYSTEM_PROMPT
      .replace('{{TIMEZONE}}', input.familyTimezone)
      .replace('{{TODAY}}', input.nowISODate);

    const response = await callAnthropic({
      model,
      max_tokens: 512,
      system,
      messages: [{ role: 'user', content: buildAssistantUserPrompt(input) }],
    });

    const content = response.content;
    const text = Array.isArray(content)
      ? content
          .filter((b): b is { type: string; text: string } => !!b && typeof b === 'object' && (b as { type?: string }).type === 'text')
          .map((b) => b.text)
          .join('\n')
          .trim()
      : '';

    if (!text) {
      throw new Error('Claude returned no text content for the assistant answer');
    }
    return { text, model };
  }
}

export const claudeProvider = new ClaudeProvider();

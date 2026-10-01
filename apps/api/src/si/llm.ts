import Anthropic from '@anthropic-ai/sdk';
import { checkGrounding, runTool, TOOLS, type ToolEnv, type ToolResult } from '@finance-buddy/core';

export interface LLMAnswer {
  text: string;
  bullets: string[];
  toolResults: ToolResult[];
}

/** Language layer for SI. It may only phrase facts returned by Finance Engine tools. */
export interface SILanguageModel {
  answer(question: string, history: { role: 'user' | 'assistant'; text: string }[], env: ToolEnv): Promise<LLMAnswer | null>;
}

const SYSTEM = `You are SI, the financial intelligence inside Finance Buddy, a personal finance app in India.
You explain the user's own finances in plain, friendly language.

Rules you must follow:
- Get every financial fact by calling the provided tools. They read the user's connected accounts through a deterministic Finance Engine.
- Only state numbers that appear in tool results, copied exactly as written there (for example "₹4,820"). Never calculate, estimate, round differently or invent amounts, dates or percentages.
- If a tool reports that there isn't enough data, say so plainly. Do not guess.
- Investments are not spending. Money lent is tracked separately. Transfers between the user's own accounts are neither income nor spending.
- Be calm and non-judgemental. No jargon. Do not give regulated investment advice or recommend specific products.
- If the question isn't about the user's money, briefly say you can only help with their finances.

Format: one short opening sentence, then at most 4 short lines that each start with "- ". No headings, no bold, no tables.`;

function toolDefs(): Anthropic.Beta.BetaTool[] {
  return TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: {
      type: 'object' as const,
      properties: Object.fromEntries(
        Object.entries(t.params).map(([k, p]) => [k, { type: p.type, description: p.description, ...(p.enum ? { enum: p.enum } : {}) }]),
      ),
      required: t.required ?? [],
    },
  }));
}

/** Validates model-supplied tool input against the tool's declared params before running it. */
function validInput(name: string, input: unknown): Record<string, unknown> | null {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool || typeof input !== 'object' || input === null || Array.isArray(input)) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    const p = tool.params[k];
    if (!p) continue;
    if (p.type === 'number' && typeof v === 'number' && Number.isFinite(v) && v >= 0) out[k] = v;
    else if (p.type === 'string' && typeof v === 'string' && (!p.enum || p.enum.includes(v))) out[k] = v;
    else return null;
  }
  for (const r of tool.required ?? []) if (!(r in out)) return null;
  if (typeof out.until === 'string' && !Number.isFinite(Date.parse(out.until))) return null;
  if (typeof out.month === 'string' && !/^\d{4}-\d{2}$/.test(out.month)) return null;
  return out;
}

export class ClaudeSI implements SILanguageModel {
  private client: Anthropic;
  constructor(
    apiKey: string,
    private model: string,
    private log: (msg: string, extra?: Record<string, unknown>) => void,
  ) {
    this.client = new Anthropic({ apiKey, timeout: 60_000, maxRetries: 2 });
  }

  async answer(question: string, history: { role: 'user' | 'assistant'; text: string }[], env: ToolEnv): Promise<LLMAnswer | null> {
    const messages: Anthropic.Beta.BetaMessageParam[] = [
      ...history.slice(-6).map((h) => ({ role: h.role, content: h.text })),
      { role: 'user', content: `${question}\n\n(Today is ${env.state.now.slice(0, 10)}.)` },
    ];
    const toolResults: ToolResult[] = [];
    const tools = toolDefs();
    for (let i = 0; i < 4; i++) {
      const response = await this.client.beta.messages.create({
        model: this.model,
        max_tokens: 16000,
        system: SYSTEM,
        tools,
        messages,
        output_config: { effort: 'low' },
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
      });
      if (response.stop_reason === 'refusal' || response.stop_reason === 'max_tokens') {
        this.log('SI model stopped early', { stop: response.stop_reason });
        return null;
      }
      if (response.stop_reason === 'tool_use') {
        messages.push({ role: 'assistant', content: response.content });
        const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
        for (const block of response.content) {
          if (block.type !== 'tool_use') continue;
          const input = validInput(block.name, block.input);
          if (!input) {
            results.push({ type: 'tool_result', tool_use_id: block.id, content: 'Invalid input for this tool.', is_error: true });
            continue;
          }
          const r = runTool(env, block.name, input);
          toolResults.push(r);
          // Only human-readable facts go to the model — never raw transactions or account numbers.
          results.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify({ facts: r.facts, insufficient: !!r.insufficient }) });
        }
        messages.push({ role: 'user', content: results });
        continue;
      }
      const text = response.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim();
      if (!text || toolResults.length === 0) return null;
      const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
      const bullets = lines.filter((l) => /^[-•]\s+/.test(l)).map((l) => l.replace(/^[-•]\s+/, ''));
      const lead = lines.filter((l) => !/^[-•]\s+/.test(l)).join(' ');
      const grounding = checkGrounding([lead, ...bullets].join(' '), toolResults, question);
      if (!grounding.ok) {
        this.log('SI answer rejected: ungrounded numbers', { unknown: grounding.unknown });
        return null;
      }
      return { text: lead || bullets.shift() || '', bullets, toolResults };
    }
    return null;
  }
}

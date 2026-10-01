import { answer, DEFAULT_SUGGESTIONS, detectIntent, forecastContext, makeEnv, weeklyBrief, type SIAskResponse, type SIHomeDTO } from '@finance-buddy/core';
import type { AppContext } from '../context';
import { getOrCreateConversation, listMessages, saveMessage } from '../repo/misc';
import { financialState } from '../services/finance';

export async function siHome(ctx: AppContext, userId: string): Promise<SIHomeDTO> {
  const state = await financialState(ctx, userId);
  const conversationId = await getOrCreateConversation(ctx, userId);
  return {
    conversationId,
    brief: weeklyBrief(state, forecastContext(state)),
    suggestions: DEFAULT_SUGGESTIONS,
    messages: await listMessages(ctx, userId, conversationId),
  };
}

/**
 * Blueprint §13: question → intent → Finance Engine tools → explanation.
 * With an API key, Claude phrases the answer from tool facts (and is rejected if it adds numbers);
 * otherwise, or on any failure, deterministic templates answer.
 */
export async function ask(ctx: AppContext, userId: string, text: string, conversationId?: string): Promise<SIAskResponse> {
  const state = await financialState(ctx, userId);
  const env = makeEnv(state);
  const conv = await getOrCreateConversation(ctx, userId, conversationId);
  const history = (await listMessages(ctx, userId, conv, 6)).map((m) => ({ role: m.role, text: [m.text, ...m.bullets.map((b) => `- ${b}`)].join('\n') }));
  const question = await saveMessage(ctx, userId, conv, { role: 'user', text, bullets: [], followUps: [], intent: null, insufficient: false, engine: null });
  const detected = detectIntent(text, state.now);
  const deterministic = answer(env, text, detected);

  let engine: 'rules' | 'llm' = 'rules';
  let body = { text: deterministic.text, bullets: deterministic.bullets };
  if (ctx.llm && detected.intent !== 'UNKNOWN') {
    try {
      const llm = await ctx.llm.answer(text, history, env);
      if (llm) {
        body = { text: llm.text, bullets: llm.bullets };
        engine = 'llm';
      }
    } catch (e) {
      ctx.log('warn', 'SI language model failed; using deterministic answer', { error: String(e) });
    }
  }
  const reply = await saveMessage(ctx, userId, conv, {
    role: 'assistant',
    text: body.text,
    bullets: body.bullets,
    followUps: deterministic.followUps,
    intent: deterministic.intent,
    insufficient: deterministic.insufficient,
    engine,
  });
  return { conversationId: conv, question, answer: reply };
}

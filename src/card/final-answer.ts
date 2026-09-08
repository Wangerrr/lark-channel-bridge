import type { Block, RunState } from './run-state';
import { renderText } from './text-renderer';

/** Shown when a run finished cleanly but the only model text was pre-tool
 * progress commentary (e.g. "先选几部…再找海报") with no later final message. */
export const EMPTY_FINAL_REPLY_NOTICE =
  '这次跑完了，但没有形成最终回复。中途的过程说明没有当作答案发出。请再发一句，我重新答。';

/**
 * Pick the user-visible final answer.
 *
 * Codex often emits a short progress `agent_message` ("先…", "正在…"), then
 * tools, then either a real last message (`finalText`) or nothing. The
 * translator flushes that progress into `blocks` when tools start. Using
 * every text block as the answer makes the progress sentence look like the
 * whole reply and "cuts off" the rest.
 *
 * Preference:
 *   1. `finalText` (last reserved agent message)
 *   2. text blocks after the last tool
 *   3. if there were no tools, all text blocks
 *   4. otherwise drop likely progress commentary rather than send it
 */
export function selectFinalAnswerBlocks(state: RunState): Block[] {
  const finalText = state.finalText?.trim();
  if (finalText) {
    return [{ kind: 'text', content: finalText, streaming: false }];
  }

  const lastToolIndex = lastIndexOf(state.blocks, (block) => block.kind === 'tool');
  if (lastToolIndex === -1) {
    return textBlocks(state.blocks);
  }

  const afterTools = textBlocks(state.blocks.slice(lastToolIndex + 1));
  if (afterTools.length > 0) return afterTools;

  const beforeTools = textBlocks(state.blocks.slice(0, lastToolIndex));
  const kept = beforeTools.filter((block) => !isLikelyProgressCommentary(block.content));
  return kept;
}

export function isLikelyProgressCommentary(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0) return true;
  // After a toolful run, a short opener is almost never the real answer.
  if (trimmed.length <= 80 && PROGRESS_PREFIX.test(trimmed)) return true;
  if (trimmed.length <= 40) return true;
  return false;
}

export function deliverableFinalReply(state: RunState): {
  state: RunState;
  body: string;
  kind: 'answer' | 'notice' | 'empty';
} {
  const next: RunState = {
    ...state,
    blocks: selectFinalAnswerBlocks(state),
    reasoning: { content: '', active: false },
    footer: null,
  };
  const body = renderText(next).trim();
  if (body) return { state: next, body, kind: 'answer' };
  if (state.terminal === 'done' || state.terminal === 'running') {
    return {
      state: {
        ...next,
        blocks: [{ kind: 'text', content: EMPTY_FINAL_REPLY_NOTICE, streaming: false }],
      },
      body: EMPTY_FINAL_REPLY_NOTICE,
      kind: 'notice',
    };
  }
  return { state: next, body: '', kind: 'empty' };
}

function textBlocks(blocks: readonly Block[]): Block[] {
  return blocks
    .filter((block): block is Extract<Block, { kind: 'text' }> => block.kind === 'text')
    .map((block) => ({
      kind: 'text' as const,
      content: block.content.trim(),
      streaming: false,
    }))
    .filter((block) => block.content.length > 0);
}

function lastIndexOf<T>(items: readonly T[], predicate: (item: T) => boolean): number {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (item !== undefined && predicate(item)) return i;
  }
  return -1;
}

const PROGRESS_PREFIX =
  /^(先|正在|我先|接着|然后|开始|去|选|Let me |I'll |I will |I am )/i;

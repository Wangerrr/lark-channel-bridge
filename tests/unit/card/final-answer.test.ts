import { describe, expect, it } from 'vitest';
import {
  EMPTY_FINAL_REPLY_NOTICE,
  deliverableFinalReply,
  isLikelyProgressCommentary,
  selectFinalAnswerBlocks,
} from '../../../src/card/final-answer.js';
import { finalAnswerOnlyState } from '../../../src/bot/cot.js';
import type { RunState } from '../../../src/card/run-state.js';

const tool = {
  kind: 'tool' as const,
  tool: { id: 'cmd-1', name: 'command_execution', input: { command: 'pwd' }, status: 'done' as const },
};

function state(partial: Partial<RunState>): RunState {
  return {
    blocks: [],
    reasoning: { content: '', active: false },
    footer: null,
    terminal: 'done',
    ...partial,
  };
}

describe('selectFinalAnswerBlocks', () => {
  it('prefers finalText over earlier progress blocks', () => {
    const blocks = selectFinalAnswerBlocks(
      state({
        blocks: [
          { kind: 'text', content: '先选几部公认的童年经典，再找海报图发到群里。', streaming: false },
          tool,
        ],
        finalText: '葫芦兄弟、哆啦A梦、数码宝贝。海报如下。',
      }),
    );
    expect(blocks).toEqual([
      { kind: 'text', content: '葫芦兄弟、哆啦A梦、数码宝贝。海报如下。', streaming: false },
    ]);
  });

  it('keeps text that arrived after tools when there is no finalText', () => {
    const blocks = selectFinalAnswerBlocks(
      state({
        blocks: [
          { kind: 'text', content: '先查一下。', streaming: false },
          tool,
          { kind: 'text', content: '查过了，没有这个号。', streaming: false },
        ],
      }),
    );
    expect(blocks.map((block) => block.kind === 'text' && block.content)).toEqual([
      '查过了，没有这个号。',
    ]);
  });

  it('drops pre-tool progress when the run ended with no later answer', () => {
    const blocks = selectFinalAnswerBlocks(
      state({
        blocks: [
          { kind: 'text', content: '先选几部公认的童年经典，再找海报图发到群里。', streaming: false },
          tool,
          tool,
        ],
      }),
    );
    expect(blocks).toEqual([]);
  });

  it('keeps a substantial pre-tool write if that was the only prose', () => {
    const answer = '推荐这五部：葫芦兄弟、黑猫警长、舒克贝塔、哆啦A梦、数码宝贝。各有经典海报。'.repeat(2);
    const blocks = selectFinalAnswerBlocks(
      state({
        blocks: [
          { kind: 'text', content: answer, streaming: false },
          tool,
        ],
      }),
    );
    expect(blocks).toEqual([{ kind: 'text', content: answer, streaming: false }]);
  });

  it('keeps all text when the run never used tools', () => {
    const blocks = selectFinalAnswerBlocks(
      state({
        blocks: [{ kind: 'text', content: '这张确实好看，靠着睡过去的感觉很安静。', streaming: false }],
      }),
    );
    expect(blocks[0]).toMatchObject({
      content: '这张确实好看，靠着睡过去的感觉很安静。',
    });
  });
});

describe('deliverableFinalReply', () => {
  it('posts a notice instead of the progress stub on a clean empty finish', () => {
    const delivered = deliverableFinalReply(
      state({
        blocks: [
          { kind: 'text', content: '先选几部公认的童年经典，再找海报图发到群里。', streaming: false },
          tool,
        ],
        terminal: 'done',
      }),
    );
    expect(delivered.kind).toBe('notice');
    expect(delivered.body).toBe(EMPTY_FINAL_REPLY_NOTICE);
  });

  it('stays silent when the run produced no text at all', () => {
    const delivered = deliverableFinalReply(state({ terminal: 'done' }));
    expect(delivered.kind).toBe('empty');
    expect(delivered.body).toBe('');
  });

  it('does not invent a notice when the run was interrupted', () => {
    const delivered = deliverableFinalReply(
      state({
        blocks: [
          { kind: 'text', content: '先查一下。', streaming: false },
          tool,
        ],
        terminal: 'interrupted',
      }),
    );
    expect(delivered.kind).toBe('answer');
    expect(delivered.body).toContain('已被中断');
  });
});

describe('isLikelyProgressCommentary', () => {
  it('treats short 先/正在 openers as progress', () => {
    expect(isLikelyProgressCommentary('先选几部公认的童年经典，再找海报图发到群里。')).toBe(true);
    expect(isLikelyProgressCommentary('正在把推荐文和 5 张封面按顺序发到群里。')).toBe(true);
  });
});

describe('finalAnswerOnlyState', () => {
  it('still derives the answer from post-tool text blocks', () => {
    const next = finalAnswerOnlyState(
      state({
        blocks: [
          tool,
          { kind: 'text', content: 'final', streaming: false },
        ],
        reasoning: { content: 'hidden', active: true },
        footer: 'streaming',
      }),
    );
    expect(next).toMatchObject({
      blocks: [{ kind: 'text', content: 'final' }],
      reasoning: { content: '', active: false },
      footer: null,
    });
  });
});

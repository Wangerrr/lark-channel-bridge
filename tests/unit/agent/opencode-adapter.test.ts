import { describe, expect, it } from 'vitest';
import { OpenCodeJsonTranslator } from '../../../src/agent/opencode/adapter.js';

describe('OpenCode JSON translator', () => {
  it('translates session, text, reasoning, tool, and terminal error events', () => {
    const translator = new OpenCodeJsonTranslator();
    const events = [
      ...translator.translate({ type: 'text', sessionID: 'ses_test', part: { id: 'p1', text: 'hello' } }),
      ...translator.translate({ type: 'reasoning', sessionID: 'ses_test', part: { id: 'r1', text: 'think' } }),
      ...translator.translate({
        type: 'tool_use', sessionID: 'ses_test',
        part: { id: 'part_tool', callID: 'call_1', tool: 'bash', state: { status: 'completed', input: { command: 'pwd' }, output: '/tmp' } },
      }),
      ...translator.translate({ type: 'error', sessionID: 'ses_test', error: { message: 'failed' } }),
    ];

    expect(events).toEqual([
      { type: 'system', sessionId: 'ses_test' },
      { type: 'text', delta: 'hello' },
      { type: 'thinking', delta: 'think' },
      { type: 'tool_use', id: 'call_1', name: 'bash', input: { command: 'pwd' } },
      { type: 'tool_result', id: 'call_1', output: '/tmp', isError: false },
      { type: 'error', message: 'failed', terminationReason: 'failed' },
    ]);
  });

  it('emits only appended text when OpenCode updates a part repeatedly', () => {
    const translator = new OpenCodeJsonTranslator();
    expect(translator.translate({ type: 'text', sessionID: 'ses_test', part: { id: 'p1', text: 'hel' } })).toContainEqual({ type: 'text', delta: 'hel' });
    expect(translator.translate({ type: 'text', sessionID: 'ses_test', part: { id: 'p1', text: 'hello' } })).toEqual([{ type: 'text', delta: 'lo' }]);
  });
});

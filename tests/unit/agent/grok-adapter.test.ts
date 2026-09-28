import { describe, expect, it } from 'vitest';
import { translateGrokEvent } from '../../../src/agent/grok/adapter.js';

describe('Grok event translator', () => {
  it('reuses the Claude stream shape for init, text, and tool results', () => {
    const events = [
      ...translateGrokEvent({ type: 'system', subtype: 'init', session_id: 'ses_grok', model: 'grok-4' }),
      ...translateGrokEvent({
        type: 'assistant',
        session_id: 'ses_grok',
        message: { content: [{ type: 'text', text: 'hello' }] },
      }),
      ...translateGrokEvent({
        type: 'user',
        message: { content: [{ type: 'tool_result', tool_use_id: 'call_1', content: 'ok', is_error: false }] },
      }),
      ...translateGrokEvent({ type: 'result', subtype: 'success', is_error: false, session_id: 'ses_grok' }),
    ];

    expect(events).toEqual([
      { type: 'system', sessionId: 'ses_grok', cwd: undefined, model: 'grok-4' },
      { type: 'text', delta: 'hello' },
      { type: 'tool_result', id: 'call_1', output: 'ok', isError: false },
      { type: 'done', sessionId: 'ses_grok', terminationReason: 'normal' },
    ]);
  });

  it('does not treat an error result as a successful done', () => {
    expect([...translateGrokEvent({
      type: 'result',
      subtype: 'error_during_execution',
      is_error: true,
      errors: [{ message: 'quota exceeded' }],
    })]).toEqual([
      { type: 'error', message: 'quota exceeded', terminationReason: 'failed' },
    ]);
  });
});

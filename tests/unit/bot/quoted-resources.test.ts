import { describe, expect, it } from 'vitest';
import { fetchQuotedContext } from '../../../src/bot/quote.js';

describe('quoted message resources', () => {
  it('keeps image resources from the quoted message instead of dropping them', async () => {
    const channel = {
      botIdentity: { openId: 'ou_bot', name: 'Bot' },
      fetchRawMessage: async () => [
        {
          message_id: 'om_img',
          msg_type: 'image',
          body: { content: JSON.stringify({ image_key: 'img_v3_abc' }) },
          sender: { id: 'ou_user', sender_type: 'user' },
          create_time: '1760000000000',
        },
      ],
    };

    const quoted = await fetchQuotedContext(channel as never, 'om_img');

    expect(quoted?.messageId).toBe('om_img');
    expect(quoted?.rawContentType).toBe('image');
    expect(quoted?.resources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'image', fileKey: 'img_v3_abc' }),
      ]),
    );
  });

  it('returns empty resources for plain text quotes', async () => {
    const channel = {
      botIdentity: { openId: 'ou_bot', name: 'Bot' },
      fetchRawMessage: async () => [
        {
          message_id: 'om_text',
          msg_type: 'text',
          body: { content: JSON.stringify({ text: 'hello' }) },
          sender: { id: 'ou_user', sender_type: 'user' },
          create_time: '1760000000000',
        },
      ],
    };

    const quoted = await fetchQuotedContext(channel as never, 'om_text');

    expect(quoted?.content).toContain('hello');
    expect(quoted?.resources).toEqual([]);
  });
});

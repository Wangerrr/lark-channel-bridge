import { describe, expect, it } from 'vitest';
import { annotateQuotedContent } from '../../../src/bot/quote.js';

describe('annotateQuotedContent', () => {
  it('replaces a Feishu image key with the downloaded local path', () => {
    const content = annotateQuotedContent(
      {
        content: '看这张图\n![image](img_v3_abc)',
        resources: [{ type: 'image', fileKey: 'img_v3_abc' }],
      },
      [{ kind: 'image', path: '/tmp/media/abc.png' }],
    );

    expect(content).not.toContain('img_v3_abc');
    expect(content).toContain('看这张图');
    expect(content).toContain('[local image] /tmp/media/abc.png');
    expect(content).toContain('不要请求飞书 file key');
  });

  it('leaves a text quote unchanged when nothing was downloaded', () => {
    expect(annotateQuotedContent({ content: 'hello', resources: [] }, [])).toBe('hello');
  });

  it('says the file was not downloaded instead of leaving a Feishu key', () => {
    const content = annotateQuotedContent(
      { content: '![image](img_v3_abc)', resources: [{ type: 'image', fileKey: 'img_v3_abc' }] },
      [],
    );
    expect(content).not.toContain('img_v3_abc');
    expect(content).toContain('没有下载成功');
  });
});

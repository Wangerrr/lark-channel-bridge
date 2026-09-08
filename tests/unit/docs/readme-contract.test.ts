import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('README runtime contract', () => {
  it('documents the WG1 CLI, quoted images, and how to run from source', async () => {
    const docs = await readDocs();

    for (const phrase of [
      'lark-channel-bridge-wg1',
      'Quoted images',
      '引用图片',
      '/invite user',
      '/invite group',
      '/cd',
      'pnpm test',
      'pnpm typecheck',
      'pnpm build',
      'git checkout dev',
      '~/.lark-channel',
    ]) {
      expect(docs).toContain(phrase);
    }
  });

  it('keeps CLI help aligned with profile-aware service and first-run workspace flags', async () => {
    const [cli, help, configCard] = await Promise.all([
      readFile(new URL('../../../src/cli/index.ts', import.meta.url), 'utf8'),
      readFile(new URL('../../../src/card/templates.ts', import.meta.url), 'utf8'),
      readFile(new URL('../../../src/card/config-card.ts', import.meta.url), 'utf8'),
    ]);

    expect(cli).toContain('--workspace <path>');
    expect(cli).toContain('profile name (defaults to active profile)');
    expect(cli).toContain('Archive a profile and its local state');
    expect(help).not.toContain('/doc ws');
    expect(configCard).not.toContain('`/doc`');
  });

  it('does not document trusted or allowed directory authorization', async () => {
    const docs = await readDocs();

    for (const phrase of [
      '允许访问目录',
      '可信目录',
      '安全目录',
      'trustedRoots',
      '/ws add',
      '/ws remove --root',
      'allowed directory',
      'allowed directories',
      'trusted directory',
      'safe directory',
    ]) {
      expect(docs).not.toContain(phrase);
    }
  });

  it('documents access control commands instead of config-only access management', async () => {
    const docs = await readDocs();

    expect(docs).toContain('/invite user');
    expect(docs).toContain('/invite group');
    expect(docs).not.toContain(
      '`/config` only adjusts presentation preferences. Manage access in the profile config.',
    );
    expect(docs).not.toContain(
      '`/config` 只调整展示偏好，不再维护访问名单。请在 profile config 里维护。',
    );
  });

  it('does not revive removed comment-binding or sandbox docs', async () => {
    const docs = await readDocs();

    expect(docs).not.toContain('comments.enabled');
    expect(docs).not.toContain('comments.rateLimit');
    expect(docs).not.toContain('/doc ws bind');
    expect(docs).not.toContain('"sandbox"');
    expect(docs).not.toContain('legacy `sandbox`');
  });
});

async function readDocs(): Promise<string> {
  const [en, zh] = await Promise.all([
    readFile(new URL('../../../README.md', import.meta.url), 'utf8'),
    readFile(new URL('../../../README.zh.md', import.meta.url), 'utf8'),
  ]);
  return `${en}\n${zh}`;
}

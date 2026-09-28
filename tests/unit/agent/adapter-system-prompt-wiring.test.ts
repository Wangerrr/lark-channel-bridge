import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { PassThrough } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const spawnMock = vi.hoisted(() => ({
  spawnProcess: vi.fn(),
}));

vi.mock('../../../src/platform/spawn', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/platform/spawn')>();
  return { ...actual, spawnProcess: spawnMock.spawnProcess };
});

import {
  buildBridgeSystemPrompt,
  prefixBridgeSystemPrompt,
} from '../../../src/agent/bridge-system-prompt';
import { ClaudeAdapter } from '../../../src/agent/claude/adapter';
import { CodexAdapter } from '../../../src/agent/codex/adapter';
import { GrokAdapter } from '../../../src/agent/grok/adapter';
import { OpenCodeAdapter } from '../../../src/agent/opencode/adapter';

interface FakeChild extends EventEmitter {
  pid: number;
  stdin: PassThrough;
  stdout: PassThrough;
  stderr: PassThrough;
  exitCode: number | null;
  signalCode: NodeJS.Signals | null;
  kill: ReturnType<typeof vi.fn>;
}

function fakeChild(): FakeChild {
  const child = new EventEmitter() as FakeChild;
  child.pid = 4242;
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.exitCode = 0;
  child.signalCode = null;
  child.kill = vi.fn();
  return child;
}

beforeEach(() => {
  spawnMock.spawnProcess.mockReset();
});

describe('ClaudeAdapter system prompt wiring', () => {
  it('appends the identity-aware bridge system prompt via a temp file after setBotIdentity', async () => {
    const child = fakeChild();
    spawnMock.spawnProcess.mockReturnValue(child);
    const adapter = new ClaudeAdapter();
    adapter.setBotIdentity({ openId: 'ou_bot_self', name: 'Bridge' });

    adapter.run({ runId: 'r1', prompt: 'hi', cwd: '/tmp' });

    // The prompt goes via stdin, never argv (cmd.exe would mangle it on Windows).
    expect(await readAll(child.stdin)).toBe('hi');
    expect(systemPromptFileContent()).toBe(
      buildBridgeSystemPrompt({ openId: 'ou_bot_self', name: 'Bridge' }),
    );
  });

  it('falls back to the base system prompt when no identity was set', async () => {
    const child = fakeChild();
    spawnMock.spawnProcess.mockReturnValue(child);
    const adapter = new ClaudeAdapter();

    adapter.run({ runId: 'r1', prompt: 'hi', cwd: '/tmp' });

    expect(await readAll(child.stdin)).toBe('hi');
    expect(systemPromptFileContent()).toBe(buildBridgeSystemPrompt(undefined));
  });

  function systemPromptFileContent(): string {
    const args = spawnMock.spawnProcess.mock.calls[0]?.[1] as string[];
    const flagIndex = args.indexOf('--append-system-prompt-file');
    expect(flagIndex).toBeGreaterThan(-1);
    expect(args).not.toContain('--append-system-prompt');
    return readFileSync(args[flagIndex + 1] as string, 'utf8');
  }
});

describe('CodexAdapter system prompt wiring', () => {
  function codexAdapter(): CodexAdapter {
    return new CodexAdapter({
      binary: '/usr/local/bin/codex',
      profileStateDir: '/tmp/codex-profile',
    });
  }

  it('prefixes stdin with the identity-aware bridge system prompt after setBotIdentity', async () => {
    const child = fakeChild();
    spawnMock.spawnProcess.mockReturnValue(child);
    const adapter = codexAdapter();
    adapter.setBotIdentity({ openId: 'ou_bot_self', name: 'Bridge' });

    adapter.run({ runId: 'r1', prompt: 'hi', cwd: '/tmp' });

    const stdin = await readAll(child.stdin);
    expect(stdin).toBe(
      prefixBridgeSystemPrompt('hi', { openId: 'ou_bot_self', name: 'Bridge' }),
    );
  });

  it('falls back to the base system prompt when no identity was set', async () => {
    const child = fakeChild();
    spawnMock.spawnProcess.mockReturnValue(child);
    const adapter = codexAdapter();

    adapter.run({ runId: 'r1', prompt: 'hi', cwd: '/tmp' });

    const stdin = await readAll(child.stdin);
    expect(stdin).toBe(prefixBridgeSystemPrompt('hi', undefined));
  });
});

describe('OpenCodeAdapter system prompt wiring', () => {
  it('sends the full bridge prompt through stdin instead of a positional argv message', async () => {
    const child = fakeChild();
    spawnMock.spawnProcess.mockReturnValue(child);
    const adapter = new OpenCodeAdapter({ binary: '/usr/local/bin/opencode' });
    const prompt = `${'user message with XML <bridge_context>\n'.repeat(200)}done`;

    adapter.run({ runId: 'r1', prompt, cwd: '/tmp' });

    expect(await readAll(child.stdin)).toBe(prefixBridgeSystemPrompt(prompt, undefined));
    const args = spawnMock.spawnProcess.mock.calls[0]?.[1] as string[];
    expect(args).toEqual(['run', '--format', 'json']);
    expect(args.join('\n')).not.toContain(prompt);
  });
});


describe('OpenCodeAdapter workspace permissions', () => {
  it('allows edits and denies shell for acceptEdits without --auto', () => {
    const child = fakeChild();
    spawnMock.spawnProcess.mockReturnValue(child);
    const adapter = new OpenCodeAdapter({ binary: '/usr/local/bin/opencode' });

    adapter.run({ runId: 'r1', prompt: 'hi', cwd: '/tmp', permissionMode: 'acceptEdits' });

    const args = spawnMock.spawnProcess.mock.calls[0]?.[1] as string[];
    const env = spawnMock.spawnProcess.mock.calls[0]?.[2]?.env as Record<string, string>;
    expect(args).not.toContain('--auto');
    const permission = env.OPENCODE_PERMISSION;
    expect(permission).toEqual(expect.any(String));
    expect(JSON.parse(permission ?? '')).toMatchObject({ edit: 'allow', bash: 'deny' });
  });
});

describe('GrokAdapter headless wiring', () => {
  it('sends the bridge prompt via --prompt-file and resumes with --resume', async () => {
    const child = fakeChild();
    spawnMock.spawnProcess.mockReturnValue(child);
    const adapter = new GrokAdapter({ binary: '/usr/local/bin/grok' });
    adapter.setBotIdentity({ openId: 'ou_bot', name: 'Bridge' });
    const prompt = 'user message with XML <bridge_context>';

    adapter.run({
      runId: 'r1',
      prompt,
      cwd: '/tmp/workspace',
      sessionId: 'ses_grok',
      permissionMode: 'bypassPermissions',
      model: 'grok-4',
    });

    const args = spawnMock.spawnProcess.mock.calls[0]?.[1] as string[];
    expect(args).toContain('--output-format');
    expect(args).toContain('streaming-messages-json');
    expect(args).toContain('--verbatim');
    expect(args).toContain('--resume');
    expect(args).toContain('ses_grok');
    expect(args).toContain('--permission-mode');
    expect(args).toContain('bypassPermissions');
    expect(args).toContain('--model');
    expect(args).toContain('grok-4');
    expect(args.join('\n')).not.toContain(prompt);
    const fileIndex = args.indexOf('--prompt-file');
    expect(fileIndex).toBeGreaterThan(-1);
    expect(readFileSync(args[fileIndex + 1]!, 'utf8')).toBe(
      prefixBridgeSystemPrompt(prompt, { openId: 'ou_bot', name: 'Bridge' }),
    );
    expect(await readAll(child.stdin)).toBe('');
  });
});
async function readAll(stream: PassThrough): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

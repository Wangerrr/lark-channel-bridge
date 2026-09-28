import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import type { Readable, Writable } from 'node:stream';
import { log } from '../../core/logger';
import { mergeProcessEnv, spawnProcess, type SpawnedProcessByStdio } from '../../platform/spawn';
import { SpawnFailed } from '../../runtime/errors';
import { prefixBridgeSystemPrompt } from '../bridge-system-prompt';
import { translateEvent } from '../claude/stream-json';
import { buildLarkChannelEnv, type LarkChannelEnvContext } from '../lark-channel-env';
import { checkAgentAvailability, type AgentAvailability } from '../preflight';
import {
  CLAUDE_DEFAULT_PERMISSION_MODE,
  type AgentAdapter,
  type AgentBotIdentity,
  type AgentEvent,
  type AgentRun,
  type AgentRunOptions,
} from '../types';

export interface GrokAdapterOptions {
  binary: string;
  larkChannel?: LarkChannelEnvContext;
  stopGraceMs?: number;
}

type GrokChild = SpawnedProcessByStdio<Writable, Readable, Readable>;

/**
 * Adapter for Grok Build's headless mode.
 *
 * `streaming-messages-json` is the same NDJSON shape Claude Code emits
 * (`system/init`, `assistant`, `user` tool results, `result`), so the Claude
 * translator is reused. Grok does not read a piped prompt — `--prompt-file`
 * is the headless channel, and it keeps the bridge XML off argv.
 */
export class GrokAdapter implements AgentAdapter {
  readonly id = 'grok';
  readonly displayName = 'Grok Build';

  private readonly binary: string;
  private readonly larkChannel: LarkChannelEnvContext | undefined;
  private readonly defaultStopGraceMs: number;
  private botIdentity: AgentBotIdentity | undefined;

  constructor(opts: GrokAdapterOptions) {
    this.binary = opts.binary;
    this.larkChannel = opts.larkChannel;
    this.defaultStopGraceMs = opts.stopGraceMs ?? 5000;
  }

  setBotIdentity(identity: AgentBotIdentity): void { this.botIdentity = identity; }

  async isAvailable(): Promise<boolean> { return (await this.checkAvailability()).ok; }

  async checkAvailability(): Promise<AgentAvailability> {
    return checkAgentAvailability({
      agentId: 'grok',
      agentName: 'Grok Build',
      command: this.binary,
      binaryPath: this.binary,
    });
  }

  async prepareRun(): Promise<void> {
    const availability = await this.checkAvailability();
    if (!availability.ok) {
      throw new SpawnFailed('grok binary check failed', availability.error, availability.diagnostic.code, availability.diagnostic);
    }
  }

  run(opts: AgentRunOptions): AgentRun {
    if (!opts.cwd) throw new Error('cwd is required for GrokAdapter.run');
    const promptFile = writePromptFile(prefixBridgeSystemPrompt(opts.prompt, this.botIdentity));
    const args = [
      '--prompt-file', promptFile.path,
      '--output-format', 'streaming-messages-json',
      '--verbatim',
      '--permission-mode', opts.permissionMode ?? CLAUDE_DEFAULT_PERMISSION_MODE,
      '--cwd', opts.cwd,
    ];
    if (opts.sessionId) args.push('--resume', opts.sessionId);
    if (opts.model) args.push('--model', opts.model);
    const child = spawnProcess(this.binary, args, {
      cwd: opts.cwd,
      env: mergeProcessEnv(process.env, buildLarkChannelEnv(this.larkChannel)),
      stdio: ['pipe', 'pipe', 'pipe'],
    }) as GrokChild;
    log.info('agent', 'spawn', {
      pid: child.pid ?? null, agent: this.id, cwd: opts.cwd,
      hasSession: Boolean(opts.sessionId), promptChars: opts.prompt.length, model: opts.model,
    });

    const stderrChunks: Buffer[] = [];
    let runtimeError: Error | null = null;
    child.stderr.on('data', (chunk: Buffer) => {
      stderrChunks.push(chunk);
      const line = chunk.toString('utf8').trim();
      if (line) log.warn('agent', 'stderr', { agent: this.id, line: line.slice(0, 1000) });
    });
    child.on('error', (err) => { runtimeError = err; promptFile.cleanup(); });
    child.on('exit', (code, signal) => {
      log.info('agent', 'exit', { agent: this.id, pid: child.pid ?? null, code, signal });
      promptFile.cleanup();
    });
    // Headless grok does not read stdin. Close it so a prompt-file run cannot
    // block waiting for a pipe that never ends.
    child.stdin.on('error', (err) => log.warn('agent', 'stdin-error', { agent: this.id, message: err.message }));
    child.stdin.end();

    const stopGraceMs = opts.stopGraceMs ?? this.defaultStopGraceMs;
    return {
      runId: opts.runId,
      events: createEventStream(child, stderrChunks, () => runtimeError),
      async stop() {
        if (child.exitCode !== null || child.signalCode !== null) return;
        child.kill('SIGTERM');
        await new Promise<void>((resolve) => {
          const timer = setTimeout(() => {
            if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
            resolve();
          }, stopGraceMs);
          child.once('exit', () => { clearTimeout(timer); resolve(); });
        });
      },
      waitForExit(timeoutMs: number): Promise<boolean> {
        if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);
        return new Promise<boolean>((resolve) => {
          const onExit = (): void => { clearTimeout(timer); resolve(true); };
          const timer = setTimeout(() => { child.removeListener('exit', onExit); resolve(false); }, timeoutMs);
          child.once('exit', onExit);
        });
      },
    };
  }
}

async function* createEventStream(
  child: GrokChild,
  stderrChunks: Buffer[],
  getError: () => Error | null,
): AsyncGenerator<AgentEvent> {
  if (!child.pid) {
    const err = getError();
    yield { type: 'error', message: err ? `failed to spawn grok: ${err.message}` : 'spawn returned no pid', terminationReason: 'failed' };
    return;
  }
  let sessionId: string | undefined;
  let terminal = false;
  const rl = createInterface({ input: child.stdout, crlfDelay: Infinity });
  try {
    for await (const line of rl) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let raw: unknown;
      try { raw = JSON.parse(trimmed); }
      catch { log.warn('grok', 'invalid-json-line', { line: trimmed.slice(0, 500) }); continue; }
      sessionId = sessionIdFrom(raw) ?? sessionId;
      for (const event of translateGrokEvent(raw)) {
        if (event.type === 'done' || event.type === 'error') terminal = true;
        if (event.type === 'system' && event.sessionId) sessionId = event.sessionId;
        yield event;
      }
    }
  } finally { rl.close(); }
  if (terminal) return;
  const exitCode = await waitForExitCode(child);
  const runtimeError = getError();
  if (runtimeError) { yield { type: 'error', message: `grok runtime error: ${runtimeError.message}`, terminationReason: 'failed' }; return; }
  if (exitCode !== 0 && exitCode !== null) {
    const stderr = Buffer.concat(stderrChunks).toString('utf8').trim();
    yield { type: 'error', message: `grok exited with code ${exitCode}${stderr ? `: ${stderr.slice(0, 500)}` : ''}`, terminationReason: 'failed' };
    return;
  }
  yield { type: 'done', sessionId, terminationReason: 'normal' };
}

/** Map Grok's failure lines before the Claude translator treats every `result` as success. */
export function* translateGrokEvent(raw: unknown): Generator<AgentEvent> {
  if (!isRecord(raw)) return;
  if (raw.type === 'error') {
    yield { type: 'error', message: grokFailureMessage(raw), terminationReason: 'failed' };
    return;
  }
  if (raw.type === 'result' && (raw.is_error === true || (typeof raw.subtype === 'string' && raw.subtype.startsWith('error')))) {
    yield { type: 'error', message: grokFailureMessage(raw), terminationReason: 'failed' };
    return;
  }
  yield* translateEvent(raw);
}

function grokFailureMessage(raw: Record<string, unknown>): string {
  if (Array.isArray(raw.errors)) {
    for (const item of raw.errors) {
      if (typeof item === 'string' && item) return item;
      if (isRecord(item) && typeof item.message === 'string' && item.message) return item.message;
    }
  }
  return stringValue(raw.message) ?? stringValue(raw.result) ?? stringValue(raw.subtype) ?? 'Grok run failed';
}

function sessionIdFrom(raw: unknown): string | undefined {
  if (!isRecord(raw)) return undefined;
  return stringValue(raw.session_id) ?? stringValue(raw.sessionId);
}

function writePromptFile(content: string): { path: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'lark-grok-'));
  const path = join(dir, 'prompt.md');
  writeFileSync(path, content, 'utf8');
  return {
    path,
    cleanup: () => {
      try { rmSync(dir, { recursive: true, force: true }); }
      catch { /* best-effort */ }
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}
async function waitForExitCode(child: GrokChild): Promise<number | null> {
  if (child.exitCode !== null || child.signalCode !== null) return child.exitCode;
  return new Promise<number | null>((resolve) => child.once('exit', (code) => resolve(code)));
}

import { createInterface } from 'node:readline';
import type { Readable, Writable } from 'node:stream';
import { log } from '../../core/logger';
import { mergeProcessEnv, spawnProcess, type SpawnedProcessByStdio } from '../../platform/spawn';
import { SpawnFailed } from '../../runtime/errors';
import { prefixBridgeSystemPrompt } from '../bridge-system-prompt';
import { buildLarkChannelEnv, type LarkChannelEnvContext } from '../lark-channel-env';
import { checkAgentAvailability, type AgentAvailability } from '../preflight';
import type { AgentAdapter, AgentBotIdentity, AgentEvent, AgentRun, AgentRunOptions } from '../types';

export interface OpenCodeAdapterOptions {
  binary: string;
  larkChannel?: LarkChannelEnvContext;
  stopGraceMs?: number;
}

type OpenCodeChild = SpawnedProcessByStdio<Writable, Readable, Readable>;

/** Adapter for OpenCode's non-interactive `run --format json` protocol. */
export class OpenCodeAdapter implements AgentAdapter {
  readonly id = 'opencode';
  readonly displayName = 'OpenCode';

  private readonly binary: string;
  private readonly larkChannel: LarkChannelEnvContext | undefined;
  private readonly defaultStopGraceMs: number;
  private botIdentity: AgentBotIdentity | undefined;

  constructor(opts: OpenCodeAdapterOptions) {
    this.binary = opts.binary;
    this.larkChannel = opts.larkChannel;
    this.defaultStopGraceMs = opts.stopGraceMs ?? 5000;
  }

  setBotIdentity(identity: AgentBotIdentity): void { this.botIdentity = identity; }

  async isAvailable(): Promise<boolean> { return (await this.checkAvailability()).ok; }

  async checkAvailability(): Promise<AgentAvailability> {
    return checkAgentAvailability({
      agentId: 'opencode',
      agentName: 'OpenCode',
      command: this.binary,
      binaryPath: this.binary,
    });
  }

  async prepareRun(): Promise<void> {
    const availability = await this.checkAvailability();
    if (!availability.ok) {
      throw new SpawnFailed('opencode binary check failed', availability.error, availability.diagnostic.code, availability.diagnostic);
    }
  }

  run(opts: AgentRunOptions): AgentRun {
    if (!opts.cwd) throw new Error('cwd is required for OpenCodeAdapter.run');
    const args = ['run', '--format', 'json'];
    if (opts.permissionMode === 'bypassPermissions') args.push('--auto');
    if (opts.permissionMode === 'plan') args.push('--agent', 'plan');
    if (opts.sessionId) args.push('--session', opts.sessionId);
    if (opts.model) args.push('--model', opts.model);
    for (const image of opts.images ?? []) args.push('--file', image);
    const child = spawnProcess(this.binary, args, {
      cwd: opts.cwd,
      env: mergeProcessEnv(process.env, buildLarkChannelEnv(this.larkChannel)),
      // OpenCode accepts the prompt from stdin when no positional message is
      // supplied. This is important on Windows: npm-installed `opencode.cmd`
      // shims route argv through cmd.exe, which can truncate or reinterpret a
      // large XML prompt. Keep the entire bridge prompt on stdin instead.
      stdio: ['pipe', 'pipe', 'pipe'],
    }) as OpenCodeChild;
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
    child.on('error', (err) => { runtimeError = err; });
    child.on('exit', (code, signal) => log.info('agent', 'exit', { agent: this.id, pid: child.pid ?? null, code, signal }));
    child.stdin.on('error', (err) => log.warn('agent', 'stdin-error', { agent: this.id, message: err.message }));
    child.stdin.end(prefixBridgeSystemPrompt(opts.prompt, this.botIdentity), 'utf8');

    let stopReason: 'interrupted' | 'timeout' | undefined;
    const stopGraceMs = opts.stopGraceMs ?? this.defaultStopGraceMs;
    return {
      runId: opts.runId,
      events: createEventStream(child, stderrChunks, () => runtimeError, () => stopReason),
      async stop() {
        if (child.exitCode !== null || child.signalCode !== null) return;
        stopReason = 'interrupted';
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
  child: OpenCodeChild,
  stderrChunks: Buffer[],
  getError: () => Error | null,
  getStopReason: () => 'interrupted' | 'timeout' | undefined,
): AsyncGenerator<AgentEvent> {
  if (!child.pid) {
    const err = getError();
    yield { type: 'error', message: err ? `failed to spawn opencode: ${err.message}` : 'spawn returned no pid', terminationReason: 'failed' };
    return;
  }
  const translator = new OpenCodeJsonTranslator();
  const rl = createInterface({ input: child.stdout, crlfDelay: Infinity });
  try {
    for await (const line of rl) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try { yield* translator.translate(JSON.parse(trimmed)); }
      catch { log.warn('opencode', 'invalid-json-line', { line: trimmed.slice(0, 500) }); }
    }
  } finally { rl.close(); }
  const stopReason = getStopReason();
  if (stopReason) { yield { type: 'done', sessionId: translator.sessionId, terminationReason: stopReason }; return; }
  const exitCode = await waitForExitCode(child);
  const runtimeError = getError();
  if (translator.terminalEmitted()) return;
  if (runtimeError) { yield { type: 'error', message: `opencode runtime error: ${runtimeError.message}`, terminationReason: 'failed' }; return; }
  if (exitCode !== 0 && exitCode !== null) {
    const stderr = Buffer.concat(stderrChunks).toString('utf8').trim();
    yield { type: 'error', message: `opencode exited with code ${exitCode}${stderr ? `: ${stderr.slice(0, 500)}` : ''}`, terminationReason: 'failed' };
    return;
  }
  yield { type: 'done', sessionId: translator.sessionId, terminationReason: 'normal' };
}

export class OpenCodeJsonTranslator {
  sessionId: string | undefined;
  private emittedSystem = false;
  private readonly tools = new Set<string>();
  private readonly textParts = new Map<string, string>();
  private readonly reasoningParts = new Map<string, string>();
  private terminal = false;

  translate(raw: unknown): AgentEvent[] {
    if (!isRecord(raw)) return [];
    const events: AgentEvent[] = [];
    const id = stringValue(raw.sessionID ?? raw.sessionId);
    if (id && !this.sessionId) this.sessionId = id;
    if (this.sessionId && !this.emittedSystem) { this.emittedSystem = true; events.push({ type: 'system', sessionId: this.sessionId }); }
    const part = recordValue(raw.part);
    if ((raw.type === 'text' || raw.type === 'reasoning') && part) {
      const partId = stringValue(part.id) ?? (raw.type === 'text' ? 'text' : 'reasoning');
      const text = stringValue(part.text) ?? '';
      const previousMap = raw.type === 'text' ? this.textParts : this.reasoningParts;
      const previous = previousMap.get(partId) ?? '';
      const delta = text.startsWith(previous) ? text.slice(previous.length) : text;
      if (delta) events.push({ type: raw.type === 'text' ? 'text' : 'thinking', delta });
      previousMap.set(partId, text);
    }
    if (raw.type === 'tool_use' && part) events.push(...this.toolEvents(part));
    if (raw.type === 'error' || raw.type === 'session.error') {
      this.terminal = true;
      events.push({ type: 'error', message: errorMessage(raw), terminationReason: 'failed' });
    }
    return events;
  }

  private toolEvents(part: Record<string, unknown>): AgentEvent[] {
    const id = stringValue(part.callID ?? part.callId ?? part.id);
    if (!id) return [];
    const state = recordValue(part.state);
    const events: AgentEvent[] = [];
    if (!this.tools.has(id)) {
      this.tools.add(id);
      events.push({ type: 'tool_use', id, name: stringValue(part.tool) ?? 'tool', input: state?.input ?? part.input ?? {} });
    }
    const status = stringValue(state?.status);
    if (status === 'completed' || status === 'error') {
      const output = state?.output ?? state?.error ?? '';
      events.push({ type: 'tool_result', id, output: typeof output === 'string' ? output : JSON.stringify(output), isError: status === 'error' });
    }
    return events;
  }

  terminalEmitted(): boolean { return this.terminal; }
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function recordValue(value: unknown): Record<string, unknown> | undefined { return isRecord(value) ? value : undefined; }
function stringValue(value: unknown): string | undefined { return typeof value === 'string' ? value : undefined; }
function errorMessage(raw: Record<string, unknown>): string {
  const error = recordValue(raw.error);
  return stringValue(raw.message) ?? stringValue(error?.message) ?? stringValue(raw.error) ?? 'OpenCode run failed';
}
async function waitForExitCode(child: OpenCodeChild): Promise<number | null> {
  if (child.exitCode !== null || child.signalCode !== null) return child.exitCode;
  return new Promise<number | null>((resolve) => child.once('exit', (code) => resolve(code)));
}

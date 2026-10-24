import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { logger } from "../util/logger.js";

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

export interface McpToolResult {
  content?: Array<{ type: string; text?: string; [key: string]: unknown }>;
  structuredContent?: unknown;
  isError?: boolean;
  [key: string]: unknown;
}

export interface McpToolDefinition {
  name: string;
  title?: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export class McpProtocolError extends Error {
  constructor(message: string, readonly code?: number, readonly data?: unknown) {
    super(message);
    this.name = "McpProtocolError";
  }
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: NodeJS.Timeout;
  method: string;
}

interface StdioClientOptions {
  command: string;
  args: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  startupTimeoutMs: number;
  callTimeoutMs: number;
  clientName: string;
  clientVersion: string;
}

const PROTOCOL_VERSION = "2024-11-05";

/** Quotes an executable path for the Windows command line. */
function quoteWindowsCommand(command: string): string {
  return /\s/.test(command) ? `"${command}"` : command;
}

/**
 * Escapes a single argument for CommandLineToArgvW, which every Node child
 * process on Windows uses. This keeps user-supplied paths from breaking out
 * of the argument when the shell is involved.
 */
function quoteWindowsArg(arg: string): string {
  if (arg.length === 0) return '""';
  if (!/[\s"]/.test(arg)) return arg;

  let result = "\"";
  let backslashes = 0;

  for (const char of arg) {
    if (char === "\\") {
      backslashes += 1;
      continue;
    }
    if (char === '"') {
      result += "\\".repeat(backslashes * 2 + 1) + '"';
      backslashes = 0;
      continue;
    }
    result += "\\".repeat(backslashes) + char;
    backslashes = 0;
  }

  result += "\\".repeat(backslashes * 2) + '"';
  return result;
}

/**
 * Minimal MCP client over stdio. Serializes requests, matches JSON-RPC ids and
 * keeps the REA server process alive across tool calls.
 */
export class StdioMcpClient {
  private child?: ChildProcessWithoutNullStreams;
  private buffer = "";
  private nextId = 1;
  private readonly pending = new Map<number, PendingRequest>();
  private starting?: Promise<void>;
  private closed = false;
  private stderrTail: string[] = [];

  constructor(private readonly options: StdioClientOptions) {}

  get isRunning(): boolean {
    return this.child !== undefined && this.child.exitCode === null && !this.closed;
  }

  async start(): Promise<void> {
    if (this.isRunning) return;
    if (this.closed) throw new Error("MCP client was shut down and cannot restart");
    if (this.starting) return this.starting;

    this.starting = this.spawnAndInitialize().finally(() => {
      this.starting = undefined;
    });
    return this.starting;
  }

  private async spawnAndInitialize(): Promise<void> {
    logger.info("Starting REA MCP server", {
      command: this.options.command,
      args: this.options.args.join(" "),
      cwd: this.options.cwd,
    });

    // On Windows, .cmd shims (npx.cmd, npm.cmd) are not directly executable
    // by CreateProcess, so they must run through the shell. Elsewhere we spawn
    // the binary directly to avoid shell injection with untrusted argv values.
    const useShell = process.platform === "win32";
    const child = spawn(useShell ? quoteWindowsCommand(this.options.command) : this.options.command, useShell ? this.options.args.map(quoteWindowsArg) : this.options.args, {
      cwd: this.options.cwd,
      env: this.options.env ?? process.env,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      windowsVerbatimArguments: useShell,
      shell: useShell,
    });

    this.child = child;
    this.stderrTail = [];

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => this.handleChunk(chunk));

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      for (const line of chunk.split(/\r?\n/)) {
        if (!line.trim()) continue;
        this.stderrTail.push(line);
        if (this.stderrTail.length > 40) this.stderrTail.shift();
        logger.debug(`rea stderr: ${line}`);
      }
    });

    child.on("exit", (code, signal) => {
      const detail = signal ? `signal ${signal}` : `code ${code}`;
      logger.warn(`REA MCP server exited (${detail})`);
      this.failPending(new McpProtocolError(`REA MCP server exited (${detail})`));
    });

    child.on("error", (error) => {
      logger.error("REA MCP server failed to spawn", { error: error.message });
      this.failPending(new McpProtocolError(`Failed to start REA MCP server: ${error.message}`));
    });

    await this.request(
      "initialize",
      {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: this.options.clientName, version: this.options.clientVersion },
      },
      this.options.startupTimeoutMs,
    );

    this.notify("notifications/initialized", {});
    logger.info("REA MCP server ready");
  }

  async listTools(): Promise<McpToolDefinition[]> {
    const tools: McpToolDefinition[] = [];
    let cursor: string | undefined;

    do {
      const result = (await this.request("tools/list", cursor ? { cursor } : {}, this.options.callTimeoutMs)) as {
        tools?: McpToolDefinition[];
        nextCursor?: string;
      };
      tools.push(...(result.tools ?? []));
      cursor = result.nextCursor;
    } while (cursor);

    return tools;
  }

  async callTool(name: string, args: Record<string, unknown>, timeoutMs = this.options.callTimeoutMs): Promise<McpToolResult> {
    const result = (await this.request("tools/call", { name, arguments: args }, timeoutMs)) as McpToolResult;
    return result;
  }

  async stop(): Promise<void> {
    this.closed = true;
    const child = this.child;
    if (!child) return;

    this.failPending(new McpProtocolError("MCP client stopped"));

    await new Promise<void>((resolve) => {
      const done = () => resolve();
      child.once("exit", done);
      try {
        child.stdin.end();
      } catch {
        // stdin may already be closed
      }
      child.kill();
      setTimeout(done, 5_000).unref();
    });

    this.child = undefined;
    logger.info("REA MCP server stopped");
  }

  private request(method: string, params: Record<string, unknown>, timeoutMs: number): Promise<unknown> {
    const child = this.child;
    if (!child || child.exitCode !== null || !child.stdin.writable) {
      return Promise.reject(new McpProtocolError("REA MCP server is not running"));
    }

    const id = this.nextId++;

    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        const tail = this.stderrTail.slice(-5).join(" | ");
        reject(
          new McpProtocolError(
            `MCP request '${method}' timed out after ${timeoutMs}ms${tail ? ` (stderr: ${tail})` : ""}`,
          ),
        );
      }, timeoutMs);
      timer.unref();

      this.pending.set(id, { resolve, reject, timer, method });
      this.write({ jsonrpc: "2.0", id, method, params });
    });
  }

  private notify(method: string, params: Record<string, unknown>): void {
    this.write({ jsonrpc: "2.0", method, params });
  }

  private write(payload: unknown): void {
    const child = this.child;
    if (!child || !child.stdin.writable) return;
    child.stdin.write(`${JSON.stringify(payload)}\n`);
  }

  private handleChunk(chunk: string): void {
    this.buffer += chunk;

    let newlineIndex = this.buffer.indexOf("\n");
    while (newlineIndex !== -1) {
      const line = this.buffer.slice(0, newlineIndex).trim();
      this.buffer = this.buffer.slice(newlineIndex + 1);
      if (line.length > 0) this.handleLine(line);
      newlineIndex = this.buffer.indexOf("\n");
    }
  }

  private handleLine(line: string): void {
    let message: Record<string, unknown>;
    try {
      message = JSON.parse(line) as Record<string, unknown>;
    } catch {
      logger.debug(`Ignoring non-JSON output from REA: ${line.slice(0, 200)}`);
      return;
    }

    const id = typeof message.id === "number" ? message.id : undefined;

    if (id === undefined) {
      // Server-initiated notification or request; nothing to correlate.
      if (typeof message.method === "string") {
        logger.debug(`REA notification: ${message.method}`);
      }
      return;
    }

    const pending = this.pending.get(id);
    if (!pending) return;
    this.pending.delete(id);
    clearTimeout(pending.timer);

    if (message.error) {
      const error = message.error as JsonRpcError;
      pending.reject(new McpProtocolError(error.message ?? "MCP error", error.code, error.data));
      return;
    }

    pending.resolve(message.result);
  }

  private failPending(error: Error): void {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(error);
      this.pending.delete(id);
    }
  }
}

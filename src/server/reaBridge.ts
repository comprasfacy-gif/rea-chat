import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { ReaService, describeError } from "../mcp/reaService.js";
import type { CatalogEntry } from "../mcp/toolCatalog.js";

const REA_SOURCE = resolve(process.cwd(), "rea-source");

/**
 * Prefers the locally built REA checkout (221 tools) and falls back to the
 * published npx entrypoint when the checkout is absent.
 */
export function resolveReaLaunch(): { command: string; args: string[]; cwd?: string } {
  const script = join(REA_SOURCE, "scripts", "rea.mjs");
  if (existsSync(script)) {
    return { command: process.execPath, args: [script, "--mcp"], cwd: REA_SOURCE };
  }
  return { command: "npx", args: ["-y", "rea-agents@latest", "--mcp"] };
}

export interface ToolSummary {
  name: string;
  title: string;
  group: string;
  description: string;
  required: string[];
  params: Array<{ name: string; type: string; required: boolean; enumValues?: string[] }>;
}

export interface ToolRunResult {
  ok: boolean;
  text: string;
  durationMs: number;
}

export class ReaBridge {
  private readonly service: ReaService;

  constructor(version: string) {
    const launch = resolveReaLaunch();
    process.env.REA_COMMAND = launch.command;
    process.env.REA_ARGS = launch.args.map((arg) => (arg.includes(" ") ? `"${arg}"` : arg)).join(" ");
    if (launch.cwd) process.env.REA_CWD = launch.cwd;
    this.service = new ReaService({ clientName: "rea-chat", clientVersion: version });
  }

  getCatalog(): Map<string, CatalogEntry> {
    return this.service.getCatalog();
  }

  listTools(): ToolSummary[] {
    return [...this.service.getCatalog().values()]
      .map((entry) => ({
        name: entry.name,
        title: entry.title,
        group: entry.group,
        description: entry.description,
        required: entry.params.filter((param) => param.required).map((param) => param.name),
        params: entry.params.map((param) => ({
          name: param.name,
          type: param.type,
          required: param.required,
          ...(param.enumValues ? { enumValues: param.enumValues } : {}),
        })),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  findTool(name: string): CatalogEntry | undefined {
    const catalog = this.service.getCatalog();
    return catalog.get(name) ?? catalog.get(name.toLowerCase());
  }

  async run(tool: string, args: Record<string, unknown>): Promise<ToolRunResult> {
    const started = Date.now();
    try {
      const result = await this.service.callTool(tool, args);
      return {
        ok: result.isError !== true,
        text: renderResult(result),
        durationMs: Date.now() - started,
      };
    } catch (error) {
      return { ok: false, text: describeError(error), durationMs: Date.now() - started };
    }
  }

  async warmup(): Promise<number> {
    const client = await this.service.ensureReady();
    const tools = await client.listTools();
    return tools.length;
  }

  async stop(): Promise<void> {
    await this.service.stop();
  }
}

function renderResult(result: { structuredContent?: unknown; content?: Array<{ type: string; text?: string }> }): string {
  if (result.structuredContent !== undefined) {
    try {
      return JSON.stringify(result.structuredContent, null, 2);
    } catch {
      return String(result.structuredContent);
    }
  }
  const parts: string[] = [];
  for (const block of result.content ?? []) {
    if (block.type === "text" && typeof block.text === "string") parts.push(block.text);
    else parts.push(JSON.stringify(block));
  }
  return parts.length > 0 ? parts.join("\n") : "(sem conteúdo)";
}

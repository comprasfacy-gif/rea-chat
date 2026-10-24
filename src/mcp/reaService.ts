import { getReaConfig } from "../config.js";
import { logger } from "../util/logger.js";
import type { CatalogEntry, ToolParam } from "./toolCatalog.js";
import { loadGeneratedCatalog } from "./toolCatalog.js";
import { PATH_PARAM_NAMES, checkLocalPath } from "./pathGuard.js";
import { McpProtocolError, StdioMcpClient, type McpToolResult } from "./stdioClient.js";

export class ReaService {
  private client?: StdioMcpClient;
  private catalog?: Map<string, CatalogEntry>;

  constructor(private readonly options: { clientName: string; clientVersion: string }) {}

  /**
   * Lazily starts the REA MCP server and loads the tool catalog. Concurrent
   * callers share the same startup promise inside the client.
   */
  async ensureReady(): Promise<StdioMcpClient> {
    if (!this.client) {
      const config = getReaConfig();
      this.client = new StdioMcpClient({
        command: config.command,
        args: config.args,
        cwd: config.cwd,
        startupTimeoutMs: config.startupTimeoutMs,
        callTimeoutMs: config.callTimeoutMs,
        clientName: this.options.clientName,
        clientVersion: this.options.clientVersion,
      });
    }

    await this.client.start();

    if (!this.catalog) {
      const tools = await this.client.listTools();
      this.catalog = new Map(loadGeneratedCatalog().map((entry) => [entry.name, entry]));
      for (const tool of tools) {
        if (!this.catalog.has(tool.name)) {
          logger.warn(`REA exposed a tool missing from the generated catalog: ${tool.name}`);
        }
      }
    }

    return this.client;
  }

  getCatalog(): Map<string, CatalogEntry> {
    if (!this.catalog) {
      this.catalog = new Map(loadGeneratedCatalog().map((entry) => [entry.name, entry]));
    }
    return this.catalog;
  }

  async callTool(toolName: string, rawArgs: Record<string, unknown>): Promise<McpToolResult> {
    const client = await this.ensureReady();
    const entry = this.getCatalog().get(toolName);

    const args = this.coerceArgs(entry, rawArgs);
    this.guardPaths(args);

    logger.debug(`Calling REA tool ${toolName}`, { args });
    return client.callTool(toolName, args);
  }

  /**
   * CLI input arrives as strings. Coerce them to the JSON schema types REA
   * expects and drop empty values so optional arguments are omitted rather
   * than sent as empty strings.
   */
  private coerceArgs(entry: CatalogEntry | undefined, rawArgs: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(rawArgs)) {
      if (value === undefined || value === null) continue;
      if (typeof value === "string" && value.trim().length === 0) continue;

      const param = entry?.params.find((candidate) => candidate.name === key);
      if (param) {
        result[key] = coerceValue(param, value);
        continue;
      }
      result[key] = value;
    }

    return result;
  }

  private guardPaths(args: Record<string, unknown>): void {
    for (const [key, value] of Object.entries(args)) {
      if (!PATH_PARAM_NAMES.has(key)) continue;
      const check = checkLocalPath(value);
      if (!check.ok) {
        throw new McpProtocolError(check.reason ?? "Caminho inválido");
      }
    }
  }

  async stop(): Promise<void> {
    await this.client?.stop();
    this.client = undefined;
  }
}

function coerceValue(param: ToolParam, value: unknown): unknown {
  switch (param.type) {
    case "number": {
      const num = typeof value === "number" ? value : Number(value);
      return Number.isFinite(num) ? num : value;
    }
    case "boolean": {
      if (typeof value === "boolean") return value;
      const lowered = String(value).toLowerCase();
      return lowered === "true" || lowered === "1" || lowered === "yes";
    }
    case "enum":
    case "string":
    default:
      return typeof value === "string" ? value : String(value);
  }
}

export function describeError(error: unknown): string {
  if (error instanceof McpProtocolError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

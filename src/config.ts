import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import { z } from "zod";
import type { LogLevel } from "./util/logger.js";

loadEnv();

const EnvSchema = z.object({
  REA_COMMAND: z.string().optional(),
  REA_ARGS: z.string().optional(),
  REA_CWD: z.string().optional(),
  REA_MCP_TIMEOUT_MS: z.coerce.number().int().positive().optional(),
  REA_CALL_TIMEOUT_MS: z.coerce.number().int().positive().optional(),
  REA_ALLOW_OPEN_BINARY_PATHS: z.string().optional(),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).optional(),
});

type Env = z.infer<typeof EnvSchema>;

let cachedEnv: Env | undefined;

/**
 * Validates the environment lazily so pure modules (MCP client, catalog) can be
 * imported and tested without any credentials present.
 */
function getEnv(): Env {
  if (cachedEnv) return cachedEnv;

  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(
      `Invalid environment configuration:\n${issues}\n\nCopy .env.example to .env and fill in the values.`,
    );
  }

  cachedEnv = parsed.data;
  return cachedEnv;
}

function splitCsv(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

/** Shell-like argument splitting that honours double and single quotes. */
export function splitArgs(value: string | undefined): string[] {
  if (!value || value.trim().length === 0) return [];
  const args: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;

  for (const char of value) {
    if (quote) {
      if (char === quote) quote = null;
      else current += char;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current.length > 0) {
        args.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }

  if (current.length > 0) args.push(current);
  return args;
}

export interface ReaConfig {
  command: string;
  args: string[];
  cwd?: string;
  startupTimeoutMs: number;
  callTimeoutMs: number;
  allowedOpenBinaryRoots: string[];
}

/** REA defaults. No third-party credentials are required. */
export function getReaConfig(): ReaConfig {
  const env = getEnv();
  const reaCwd = env.REA_CWD ? resolve(env.REA_CWD) : undefined;

  if (reaCwd && !existsSync(reaCwd)) {
    throw new Error(`REA_CWD points to a directory that does not exist: ${reaCwd}`);
  }

  const explicitArgs = splitArgs(env.REA_ARGS);

  return {
    // Defaults match REA's published stdio entrypoint.
    command: env.REA_COMMAND ?? "npx",
    args: explicitArgs.length > 0 ? explicitArgs : ["-y", "rea-agents@latest", "--mcp"],
    cwd: reaCwd,
    startupTimeoutMs: env.REA_MCP_TIMEOUT_MS ?? 120_000,
    callTimeoutMs: env.REA_CALL_TIMEOUT_MS ?? 300_000,
    allowedOpenBinaryRoots: splitCsv(env.REA_ALLOW_OPEN_BINARY_PATHS).map((entry) => resolve(entry)),
  };
}

export function getLogLevel(): LogLevel {
  return getEnv().LOG_LEVEL ?? "warn";
}

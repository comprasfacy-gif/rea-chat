import type { McpToolResult } from "../mcp/stdioClient.js";

export interface Palette {
  enabled: boolean;
}

const CODES = {
  reset: "\u001b[0m",
  bold: "\u001b[1m",
  dim: "\u001b[2m",
  red: "\u001b[31m",
  green: "\u001b[32m",
  yellow: "\u001b[33m",
  blue: "\u001b[34m",
  magenta: "\u001b[35m",
  cyan: "\u001b[36m",
  gray: "\u001b[90m",
} as const;

type ColorName = keyof typeof CODES;

/**
 * Colour is opt-out via --no-color, NO_COLOR, or a non-TTY stdout so piped
 * output stays clean.
 */
export function createPalette(noColor: boolean): Palette {
  const disabled = noColor || process.env.NO_COLOR !== undefined || !process.stdout.isTTY;
  return { enabled: !disabled };
}

export function paint(palette: Palette, color: ColorName, text: string): string {
  if (!palette.enabled) return text;
  return `${CODES[color]}${text}${CODES.reset}`;
}

export function bold(palette: Palette, text: string): string {
  if (!palette.enabled) return text;
  return `${CODES.bold}${text}${CODES.reset}`;
}

export function dim(palette: Palette, text: string): string {
  if (!palette.enabled) return text;
  return `${CODES.dim}${text}${CODES.reset}`;
}

function extractText(result: McpToolResult): string {
  const parts: string[] = [];
  for (const block of result.content ?? []) {
    if (block.type === "text" && typeof block.text === "string") {
      parts.push(block.text);
      continue;
    }
    parts.push(JSON.stringify(block));
  }
  return parts.join("\n");
}

export interface RenderedResult {
  text: string;
  isError: boolean;
}

/**
 * Renders an MCP tool result for the terminal. Structured content wins when
 * present because it is already normalised JSON; otherwise text blocks are
 * joined verbatim.
 */
export function renderToolResult(result: McpToolResult): RenderedResult {
  const isError = result.isError === true;

  if (result.structuredContent !== undefined) {
    try {
      return { text: JSON.stringify(result.structuredContent, null, 2), isError };
    } catch {
      return { text: String(result.structuredContent), isError };
    }
  }

  const text = extractText(result);
  return { text: text.length > 0 ? text : "(sem conteúdo)", isError };
}

/** Wraps text in a gutter so multi-line tool output stays readable. */
export function indentBlock(text: string, prefix = "  "): string {
  return text
    .split(/\r?\n/)
    .map((line) => `${prefix}${line}`)
    .join("\n");
}

export function formatDuration(ms: number): string {
  if (ms < 1_000) return `${ms} ms`;
  return `${(ms / 1_000).toFixed(2)} s`;
}

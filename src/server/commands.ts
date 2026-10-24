import type { CatalogEntry } from "../mcp/toolCatalog.js";
import type { ReaBridge } from "./reaBridge.js";

export interface CommandContext {
  bridge: ReaBridge;
  channelId: string;
}

export interface CommandOutcome {
  /** Reply text posted back into the channel. */
  reply: string;
  /** Structured payload for the web client (tool results, listings). */
  meta?: Record<string, unknown>;
}

const HELP_TEXT = [
  "**Comandos disponíveis**",
  "`/help` — esta ajuda",
  "`/tools [filtro]` — lista as ferramentas do REA",
  "`/describe <tool>` — mostra os parâmetros de uma ferramenta",
  "`/<tool> [--param valor ...]` — executa uma ferramenta do REA",
  "`/raw <tool> <json>` — executa com um objeto JSON de argumentos",
  "`/users` — usuários do servidor",
  "`/channels` — canais disponíveis",
  "`/create <nome>` — cria um canal",
].join("\n");

/** Splits a command line honouring double quotes. */
export function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote = false;

  for (const char of input) {
    if (char === '"') {
      quote = !quote;
      continue;
    }
    if (!quote && /\s/.test(char)) {
      if (current.length > 0) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }
  if (current.length > 0) tokens.push(current);
  return tokens;
}

function coerceArg(entry: CatalogEntry | undefined, key: string, raw: string): unknown {
  const param = entry?.params.find((candidate) => candidate.name === key);
  if (!param) return raw;
  if (param.type === "number") {
    const num = Number(raw);
    return Number.isFinite(num) ? num : raw;
  }
  if (param.type === "boolean") {
    const lowered = raw.toLowerCase();
    return lowered === "true" || lowered === "1" || lowered === "yes";
  }
  return raw;
}

/** Builds REA arguments from `--flag value`, `--flag=value` and bare switches. */
export function parseToolArgs(entry: CatalogEntry | undefined, tokens: string[]): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === undefined || !token.startsWith("--")) continue;
    const body = token.slice(2);
    const eq = body.indexOf("=");
    if (eq !== -1) {
      const key = body.slice(0, eq);
      args[key] = coerceArg(entry, key, body.slice(eq + 1));
      continue;
    }
    const next = tokens[index + 1];
    if (next !== undefined && !next.startsWith("--")) {
      args[body] = coerceArg(entry, body, next);
      index += 1;
    } else {
      args[body] = true;
    }
  }
  return args;
}

function truncate(text: string, max = 1_800): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n… (${text.length - max} caracteres omitidos)`;
}

/** Handles built-in chat commands and REA tool invocation. */
export async function handleCommand(context: CommandContext, raw: string): Promise<CommandOutcome> {
  const tokens = tokenize(raw.trim().replace(/^\//, ""));
  const name = tokens[0]?.toLowerCase() ?? "";
  const rest = tokens.slice(1);
  const { bridge } = context;

  if (name === "" || name === "help") return { reply: HELP_TEXT };

  if (name === "users") {
    return { reply: "Use o painel à direita para ver os usuários conectados." };
  }

  if (name === "channels") {
    return { reply: "Canais disponíveis na barra lateral esquerda." };
  }

  if (name === "tools") {
    const filter = rest.join(" ").toLowerCase();
    const tools = bridge.listTools();
    const matches = filter
      ? tools.filter(
          (tool) =>
            tool.name.includes(filter) ||
            tool.group.includes(filter) ||
            tool.title.toLowerCase().includes(filter),
        )
      : tools;
    const head = matches.slice(0, 60).map((tool) => `\`${tool.name}\` — ${tool.title}`);
    const suffix = matches.length > head.length ? `\n… e mais ${matches.length - head.length}` : "";
    return {
      reply: `**${matches.length} ferramenta(s)**\n${head.join("\n")}${suffix}`,
      meta: { kind: "tools", total: matches.length },
    };
  }

  if (name === "describe") {
    const target = rest[0];
    if (!target) return { reply: "Uso: `/describe <tool>`" };
    const entry = bridge.findTool(target);
    if (!entry) return { reply: `Ferramenta desconhecida: \`${target}\`` };
    const params = entry.params.length === 0
      ? "(nenhum)"
      : entry.params
          .map(
            (param) =>
              `\`${param.name}\` <${param.type}>${param.required ? " **obrigatório**" : ""}${param.enumValues ? ` (${param.enumValues.join(" | ")})` : ""}`,
          )
          .join("\n");
    return { reply: `**${entry.name}** — ${entry.title}\n${entry.description}\n\n**Parâmetros**\n${params}` };
  }

  if (name === "raw") {
    const target = rest[0];
    const json = rest.slice(1).join(" ");
    if (!target || !json) return { reply: "Uso: `/raw <tool> {\"param\":\"valor\"}`" };
    let args: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(json);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        return { reply: "Os argumentos precisam ser um objeto JSON." };
      }
      args = parsed as Record<string, unknown>;
    } catch (error) {
      return { reply: `JSON inválido: ${error instanceof Error ? error.message : String(error)}` };
    }
    const result = await bridge.run(target, args);
    return {
      reply: truncate(result.text),
      meta: { kind: "result", tool: target, ok: result.ok, durationMs: result.durationMs },
    };
  }

  const entry = bridge.findTool(name);
  if (!entry) {
    return { reply: `Comando desconhecido: \`/${name}\`\nUse \`/help\` ou \`/tools ${name}\` para buscar.` };
  }

  const args = parseToolArgs(entry, rest);
  const missing = entry.params.filter((param) => param.required && args[param.name] === undefined);
  if (missing.length > 0) {
    return {
      reply: `Faltam parâmetros obrigatórios: ${missing.map((param) => `\`${param.name}\``).join(", ")}\nUse \`/describe ${entry.name}\` para ver os detalhes.`,
    };
  }

  const result = await bridge.run(entry.name, args);
  return {
    reply: truncate(result.text),
    meta: { kind: "result", tool: entry.name, ok: result.ok, durationMs: result.durationMs },
  };
}

import type { CatalogEntry, ToolParam } from "../mcp/toolCatalog.js";

export interface ArgBuildResult {
  args: Record<string, unknown>;
  /** Human-readable notes about ignored or coerced values. */
  notes: string[];
}

/**
 * Turns `--name value` flags plus positional values into the JSON object REA
 * expects. Positional values fill required params first, then optional ones,
 * following the order declared by the tool schema.
 */
export function buildToolArgs(
  entry: CatalogEntry,
  flags: Record<string, string>,
  switches: Set<string>,
  positional: string[],
): ArgBuildResult {
  const notes: string[] = [];
  const args: Record<string, unknown> = {};
  const known = new Map(entry.params.map((param) => [param.name, param]));

  const orderedParams = [
    ...entry.params.filter((param) => param.required),
    ...entry.params.filter((param) => !param.required),
  ];

  for (let index = 0; index < positional.length; index += 1) {
    const param = orderedParams[index];
    const raw = positional[index] ?? "";
    if (!param) {
      notes.push(`posicional ignorado (sem parâmetro correspondente): ${raw}`);
      continue;
    }
    args[param.name] = coerce(param, raw);
  }

  for (const [name, value] of Object.entries(flags)) {
    const param = known.get(name);
    if (!param) {
      notes.push(`flag desconhecida para ${entry.name}: --${name}`);
      args[name] = value;
      continue;
    }
    args[name] = coerce(param, value);
  }

  for (const name of switches) {
    const param = known.get(name);
    if (!param) {
      notes.push(`flag desconhecida para ${entry.name}: --${name}`);
      args[name] = true;
      continue;
    }
    if (param.type === "boolean") args[name] = true;
    else notes.push(`--${name} não é booleano em ${entry.name}; use --${name} <valor>`);
  }

  for (const param of entry.params) {
    const value = args[param.name];
    if (value !== undefined && value !== "") continue;
    if (param.required) {
      notes.push(`parâmetro obrigatório ausente: ${param.name}`);
      continue;
    }
    if (param.defaultValue !== undefined) args[param.name] = param.defaultValue;
  }

  return { args, notes };
}

function coerce(param: ToolParam, raw: string): unknown {
  if (param.type === "number") {
    const num = Number(raw);
    return Number.isFinite(num) ? num : raw;
  }
  if (param.type === "boolean") {
    const lowered = raw.toLowerCase();
    if (["true", "1", "yes", "y", "on"].includes(lowered)) return true;
    if (["false", "0", "no", "n", "off"].includes(lowered)) return false;
    return raw;
  }
  return raw;
}

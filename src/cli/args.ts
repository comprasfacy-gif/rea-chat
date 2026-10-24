import { readFileSync } from "node:fs";

export interface ParsedArgs {
  /** First positional token (tool name, or nothing for subcommands). */
  tool?: string;
  /** Extra positional values, mapped onto schema-ordered params. */
  positional: string[];
  /** `--key=value` / `--key value` pairs. */
  flags: Record<string, string>;
  /** `--flag` without a value (treated as boolean true). */
  switches: Set<string>;
  json?: string;
  jsonFile?: string;
  help: boolean;
  list: boolean;
  describe: boolean;
  doctor: boolean;
  serve: boolean;
  noColor: boolean;
  quiet: boolean;
}

/**
 * Parses the CLI surface:
 *
 *   rea <tool> [positional...] [--param=value ...] [--json '{...}'] [--json-file f]
 *   rea list [filter]
 *   rea describe <tool>
 *   rea doctor
 */
export function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    positional: [],
    flags: {},
    switches: new Set(),
    help: false,
    list: false,
    describe: false,
    doctor: false,
    serve: false,
    noColor: false,
    quiet: false,
  };

  let index = 0;
  const first = argv[0];
  if (first === "list") parsed.list = true;
  else if (first === "describe") parsed.describe = true;
  else if (first === "doctor") parsed.doctor = true;
  else if (first === "serve") parsed.serve = true;
  if (parsed.list || parsed.describe || parsed.doctor || parsed.serve) index = 1;

  // `--` ends option parsing: everything after it is positional, verbatim.
  let endOfOptions = false;

  for (; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;

    if (endOfOptions) {
      if (parsed.tool === undefined) parsed.tool = arg;
      else parsed.positional.push(arg);
      continue;
    }

    if (arg === "--") {
      endOfOptions = true;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
      continue;
    }
    if (arg === "--no-color") {
      parsed.noColor = true;
      continue;
    }
    if (arg === "--quiet" || arg === "-q") {
      parsed.quiet = true;
      continue;
    }

    if (arg === "--json" || arg === "--json-file") {
      const value = argv[index + 1];
      if (value === undefined) throw new Error(`${arg} requires a value`);
      index += 1;
      if (arg === "--json") parsed.json = value;
      else parsed.jsonFile = value;
      continue;
    }

    if (arg.startsWith("--json=")) {
      parsed.json = arg.slice("--json=".length);
      continue;
    }
    if (arg.startsWith("--json-file=")) {
      parsed.jsonFile = arg.slice("--json-file=".length);
      continue;
    }

    if (arg.startsWith("--")) {
      const body = arg.slice(2);
      const eq = body.indexOf("=");
      if (eq !== -1) {
        parsed.flags[body.slice(0, eq)] = body.slice(eq + 1);
        continue;
      }

      const next = argv[index + 1];
      // A following token is a value unless it looks like another option or
      // the tool is mid-consumption of its positional list. `--flag value`
      // therefore binds, while `--flag` alone becomes a boolean switch.
      if (next !== undefined && !next.startsWith("-")) {
        parsed.flags[body] = next;
        index += 1;
        continue;
      }
      parsed.switches.add(body);
      continue;
    }

    if (parsed.tool === undefined) {
      parsed.tool = arg;
      continue;
    }

    parsed.positional.push(arg);
  }

  return parsed;
}

/** Reads JSON arguments from `--json` or `--json-file`. */
export function readJsonArgs(parsed: ParsedArgs): Record<string, unknown> | undefined {
  let text: string | undefined;
  if (parsed.jsonFile) text = readFileSync(parsed.jsonFile, "utf8");
  else if (parsed.json) text = parsed.json;
  if (text === undefined) return undefined;

  const value: unknown = JSON.parse(text);
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("JSON arguments must be an object");
  }
  return value as Record<string, unknown>;
}

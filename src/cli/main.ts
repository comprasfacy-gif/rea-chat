import { getReaConfig } from "../config.js";
import { describeError, ReaService } from "../mcp/reaService.js";
import type { CatalogEntry } from "../mcp/toolCatalog.js";
import { setLogLevel } from "../util/logger.js";
import { parseArgs, readJsonArgs } from "./args.js";
import { startServer } from "../server/index.js";
import { runDoctor } from "./doctor.js";
import { renderToolHelp, renderToolList, renderUsage } from "./help.js";
import { bold, createPalette, dim, formatDuration, indentBlock, paint, renderToolResult } from "./render.js";
import { buildToolArgs } from "./session.js";

const VERSION = "2.0.0";

export async function run(argv: string[]): Promise<number> {
  const parsed = parseArgs(argv);
  const palette = createPalette(parsed.noColor);

  if (parsed.help && parsed.tool === undefined && !parsed.list && !parsed.describe) {
    process.stdout.write(`${renderUsage(palette)}\n`);
    return 0;
  }

  if (!parsed.quiet) setLogLevel("warn");
  else setLogLevel("error");

  const rea = new ReaService({ clientName: "rea-cli", clientVersion: VERSION });

  try {
    if (parsed.doctor) {
      return await runDoctor(palette, VERSION);
    }

    if (parsed.serve) {
      const port = Number(parsed.flags.port ?? process.env.PORT ?? 3000);
      const host = parsed.flags.host ?? process.env.HOST ?? "0.0.0.0";
      const dataDir = parsed.flags["data-dir"] ?? process.env.DATA_DIR ?? "data";
      await startServer({ port, host, dataDir });
      return await new Promise<number>(() => {
        // Keeps the process alive until the server receives a shutdown signal.
      });
    }

    if (parsed.list) {
      const filter = parsed.tool ?? parsed.positional[0];
      const all = [...rea.getCatalog().values()];
      const entries = filter
        ? all.filter(
            (entry) =>
              entry.name.toLowerCase().includes(filter.toLowerCase()) ||
              entry.group.toLowerCase().includes(filter.toLowerCase()) ||
              entry.description.toLowerCase().includes(filter.toLowerCase()),
          )
        : all;
      process.stdout.write(`${renderToolList(palette, entries, all.length, filter)}\n`);
      return entries.length > 0 ? 0 : 1;
    }

    if (parsed.describe) {
      const name = parsed.tool ?? parsed.positional[0];
      if (!name) {
        process.stderr.write(`Uso: rea describe <tool>\n`);
        return 1;
      }
      const entry = findTool(rea, name);
      if (!entry) {
        process.stderr.write(`Tool desconhecida: ${name}\n`);
        return 1;
      }
      process.stdout.write(`${renderToolHelp(palette, entry)}\n`);
      return 0;
    }

    if (!parsed.tool) {
      process.stdout.write(`${renderUsage(palette)}\n`);
      return 0;
    }

    const entry = findTool(rea, parsed.tool);
    if (!entry) {
      process.stderr.write(`${paint(palette, "red", `Tool desconhecida: ${parsed.tool}`)}\n`);
      const suggestions = [...rea.getCatalog().values()]
        .filter((candidate) => candidate.name.includes(parsed.tool ?? ""))
        .slice(0, 5)
        .map((candidate) => candidate.name);
      if (suggestions.length > 0) {
        process.stderr.write(dim(palette, `Você quis dizer: ${suggestions.join(", ")}\n`));
      }
      process.stderr.write(dim(palette, `Rode 'rea list' para ver todas as ferramentas.\n`));
      return 1;
    }

    if (parsed.help) {
      process.stdout.write(`${renderToolHelp(palette, entry)}\n`);
      return 0;
    }

    const jsonArgs = readJsonArgs(parsed);
    let args: Record<string, unknown>;
    if (jsonArgs) {
      args = jsonArgs;
    } else {
      const built = buildToolArgs(entry, parsed.flags, parsed.switches, parsed.positional);
      args = built.args;
      const blocking = built.notes.filter((note) => note.startsWith("parâmetro obrigatório ausente"));
      if (blocking.length > 0) {
        process.stderr.write(`${paint(palette, "red", "Argumentos incompletos:")}\n`);
        for (const note of blocking) process.stderr.write(`  - ${note}\n`);
        process.stderr.write(dim(palette, `Use 'rea describe ${entry.name}' para ver os parâmetros.\n`));
        return 1;
      }
      if (!parsed.quiet) {
        for (const note of built.notes) process.stderr.write(dim(palette, `aviso: ${note}\n`));
      }
    }

    if (!parsed.quiet) {
      const rendered = Object.keys(args).length > 0 ? JSON.stringify(args) : "{}";
      process.stderr.write(dim(palette, `→ ${entry.name} ${rendered}\n`));
    }

    const started = Date.now();
    const result = await rea.callTool(entry.name, args);
    const elapsed = Date.now() - started;
    const output = renderToolResult(result);

    process.stdout.write(`${output.text}\n`);

    if (!parsed.quiet) {
      const status = output.isError
        ? paint(palette, "red", "falhou")
        : paint(palette, "green", "ok");
      process.stderr.write(
        dim(palette, `← ${status} em ${formatDuration(elapsed)}${output.isError ? "" : ` • ${output.text.length} caracteres`}\n`),
      );
    }

    return output.isError ? 1 : 0;
  } catch (error) {
    process.stderr.write(`${paint(palette, "red", "erro:")} ${describeError(error)}\n`);
    return 1;
  } finally {
    await rea.stop();
  }
}

function findTool(rea: ReaService, name: string): CatalogEntry | undefined {
  const catalog = rea.getCatalog();
  return catalog.get(name) ?? catalog.get(name.toLowerCase());
}

export { renderToolHelp, renderUsage, indentBlock, bold };

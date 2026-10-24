import type { CatalogEntry } from "../mcp/toolCatalog.js";
import { bold, dim, paint, type Palette } from "./render.js";

export const CLI_NAME = "rea";

export function renderUsage(palette: Palette): string {
  const lines = [
    bold(palette, "REA — Reverse Engineer Anything (CLI)"),
    "",
    bold(palette, "USO"),
    `  ${CLI_NAME} <tool> [args...] [opções]`,
    `  ${CLI_NAME} list [filtro]`,
    `  ${CLI_NAME} describe <tool>`,
    `  ${CLI_NAME} doctor`,
    `  ${CLI_NAME} serve [--port 3000] [--host 0.0.0.0]`,
    "",
    bold(palette, "PASSAGEM DE ARGUMENTOS"),
    `  ${dim(palette, "--nome valor")}        argumento nomeado`,
    `  ${dim(palette, "--nome=valor")}        idem, forma compacta`,
    `  ${dim(palette, "--flag")}              booleano true`,
    `  ${dim(palette, "--json '{...}'")}      objeto JSON completo (sobrepõe os demais)`,
    `  ${dim(palette, "--json-file f.json")}  lê os argumentos de um arquivo`,
    `  ${dim(palette, "posicionais")}         preenchem os parâmetros na ordem do schema`,
    "",
    bold(palette, "OPÇÕES GLOBAIS"),
    `  ${dim(palette, "--help, -h")}          mostra esta ajuda`,
    `  ${dim(palette, "--no-color")}          desliga cores`,
    `  ${dim(palette, "--quiet, -q")}         mostra só o resultado`,
    "",
    bold(palette, "EXEMPLOS"),
    `  ${CLI_NAME} list inspect`,
    `  ${CLI_NAME} describe open_binary`,
    `  ${CLI_NAME} open_binary --path C:\\targets\\app.exe`,
    `  ${CLI_NAME} list_strings --limit 50`,
    `  ${CLI_NAME} binary_session`,
    `  ${CLI_NAME} open_binary --json '{"path":"C:\\\\targets\\\\app.exe"}'`,
  ];

  return lines.join("\n");
}

export function renderToolHelp(palette: Palette, entry: CatalogEntry): string {
  const lines = [
    bold(palette, entry.name),
    entry.title !== entry.name ? `  ${entry.title}` : "",
    "",
    entry.description.length > 0 ? entry.description : dim(palette, "(sem descrição)"),
    "",
    bold(palette, "PARÂMETROS"),
  ].filter((line) => line !== "");

  if (entry.params.length === 0) {
    lines.push(`  ${dim(palette, "nenhum")}`);
  } else {
    for (const param of entry.params) {
      const required = param.required ? paint(palette, "red", " *") : "";
      const type = dim(palette, `<${param.type}>`);
      const values = param.enumValues ? dim(palette, ` (${param.enumValues.join(" | ")})`) : "";
      lines.push(`  ${paint(palette, "cyan", param.name)} ${type}${required}${values}`);
      if (param.description.length > 0) lines.push(`      ${param.description}`);
    }
  }

  if (entry.complexSchema) {
    lines.push("", dim(palette, "Schema complexo: use --json com o objeto completo."));
  }

  return lines.join("\n");
}

export function renderToolList(
  palette: Palette,
  entries: CatalogEntry[],
  total: number,
  filter: string | undefined,
): string {
  const header = filter
    ? `${entries.length} de ${total} ferramentas (filtro: ${filter})`
    : `${total} ferramentas`;

  const lines = [bold(palette, header), ""];

  const byGroup = new Map<string, CatalogEntry[]>();
  for (const entry of entries) {
    const list = byGroup.get(entry.group) ?? [];
    list.push(entry);
    byGroup.set(entry.group, list);
  }

  const groups = [...byGroup.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  for (const [group, groupEntries] of groups) {
    lines.push(paint(palette, "magenta", `${group} (${groupEntries.length})`));
    for (const entry of groupEntries) {
      const required = entry.params.filter((param) => param.required).length;
      const suffix = required > 0 ? dim(palette, ` [${required} obrigatório${required > 1 ? "s" : ""}]`) : "";
      lines.push(`  ${entry.name}${suffix}`);
      if (entry.title !== entry.name && entry.title.length > 0) {
        lines.push(dim(palette, `      ${entry.title}`));
      }
    }
    lines.push("");
  }

  if (entries.length === 0) lines.push(dim(palette, "nenhuma ferramenta corresponde ao filtro"));

  return lines.join("\n").trimEnd();
}

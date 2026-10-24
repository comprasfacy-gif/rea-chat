import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getReaConfig } from "../config.js";
import { describeError, ReaService } from "../mcp/reaService.js";
import { bold, dim, formatDuration, paint, type Palette } from "./render.js";

const MIN_NODE = [20, 10] as const;
const EXPECTED_TOOLS = 207;

export interface DoctorCheck {
  label: string;
  status: "ok" | "warn" | "fail";
  detail: string;
}

function parseNodeVersion(version: string): number[] {
  return version
    .replace(/^v/, "")
    .split(".")
    .map((part) => Number.parseInt(part, 10))
    .filter((part) => Number.isFinite(part));
}

function checkNodeVersion(): DoctorCheck {
  const parts = parseNodeVersion(process.version);
  const major = parts[0] ?? 0;
  const minor = parts[1] ?? 0;
  const ok = major > MIN_NODE[0] || (major === MIN_NODE[0] && minor >= MIN_NODE[1]);
  return {
    label: "Node.js",
    status: ok ? "ok" : "fail",
    detail: `${process.version} (mínimo v${MIN_NODE[0]}.${MIN_NODE[1]})`,
  };
}

function checkBuild(): DoctorCheck {
  // doctor.ts compiles to dist/cli/doctor.js, so the entrypoint sits one level up.
  const here = dirname(fileURLToPath(import.meta.url));
  const mainJs = resolve(here, "..", "main.js");
  return {
    label: "Build",
    status: existsSync(mainJs) ? "ok" : "fail",
    detail: existsSync(mainJs) ? mainJs : `não encontrado: ${mainJs} (rode 'npm run build')`,
  };
}

function checkCommand(command: string): DoctorCheck {
  const probe = process.platform === "win32" ? "where" : "which";
  const result = spawnSync(probe, [command], { encoding: "utf8", shell: true });
  const firstLine = (result.stdout ?? "").split(/\r?\n/).find((line) => line.trim().length > 0);
  const found = result.status === 0 && firstLine !== undefined;
  return {
    label: `Comando '${command}'`,
    status: found ? "ok" : "fail",
    detail: found ? firstLine.trim() : "não encontrado no PATH",
  };
}

function checkConfig(): DoctorCheck {
  try {
    const config = getReaConfig();
    return {
      label: "Configuração",
      status: "ok",
      detail: `${config.command} ${config.args.join(" ")}`,
    };
  } catch (error) {
    return { label: "Configuração", status: "fail", detail: describeError(error) };
  }
}

function checkCatalog(rea: ReaService): DoctorCheck {
  const size = rea.getCatalog().size;
  if (size === 0) return { label: "Catálogo", status: "fail", detail: "nenhuma ferramenta carregada" };
  const status = size === EXPECTED_TOOLS ? "ok" : "warn";
  return {
    label: "Catálogo",
    status,
    detail: `${size} ferramentas${size === EXPECTED_TOOLS ? "" : ` (esperado ${EXPECTED_TOOLS})`}`,
  };
}

async function checkServer(rea: ReaService): Promise<DoctorCheck> {
  const started = Date.now();
  try {
    const client = await rea.ensureReady();
    const tools = await client.listTools();
    const elapsed = formatDuration(Date.now() - started);
    if (tools.length === 0) {
      return { label: "Servidor REA", status: "fail", detail: `respondeu sem ferramentas em ${elapsed}` };
    }
    const status = tools.length === EXPECTED_TOOLS ? "ok" : "warn";
    return {
      label: "Servidor REA",
      status,
      detail: `conectado em ${elapsed} • ${tools.length} ferramentas expostas`,
    };
  } catch (error) {
    return { label: "Servidor REA", status: "fail", detail: describeError(error) };
  }
}

function renderCheck(palette: Palette, check: DoctorCheck): string {
  const icon =
    check.status === "ok"
      ? paint(palette, "green", "✓")
      : check.status === "warn"
        ? paint(palette, "yellow", "!")
        : paint(palette, "red", "✗");
  return `  ${icon} ${check.label}: ${check.detail}`;
}

/** Runs local prerequisite checks and a live MCP handshake. */
export async function runDoctor(palette: Palette, version: string): Promise<number> {
  const configCheck = checkConfig();
  const checks: DoctorCheck[] = [checkNodeVersion(), checkBuild(), configCheck];

  if (configCheck.status === "ok") {
    const command = getReaConfig().command;
    checks.push(checkCommand(command));
  }

  const rea = new ReaService({ clientName: "rea-cli", clientVersion: version });
  try {
    checks.push(checkCatalog(rea));
    checks.push(await checkServer(rea));
  } finally {
    await rea.stop();
  }

  const lines = [bold(palette, `rea doctor (v${version})`), ""];
  for (const check of checks) lines.push(renderCheck(palette, check));

  const failures = checks.filter((check) => check.status === "fail").length;
  const warnings = checks.filter((check) => check.status === "warn").length;
  lines.push("");
  if (failures > 0) {
    lines.push(paint(palette, "red", `${failures} verificação(ões) falharam.`));
  } else if (warnings > 0) {
    lines.push(paint(palette, "yellow", `Tudo funcional, ${warnings} aviso(s).`));
  } else {
    lines.push(paint(palette, "green", "Tudo pronto para usar."));
  }

  process.stdout.write(`${lines.join("\n")}\n`);
  return failures > 0 ? 1 : 0;
}

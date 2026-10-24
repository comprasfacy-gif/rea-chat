import { isAbsolute, resolve, sep } from "node:path";
import { getReaConfig } from "../config.js";

export interface PathCheck {
  ok: boolean;
  reason?: string;
}

/**
 * Guards local filesystem paths passed to REA tools such as open_binary and
 * close_binary. When REA_ALLOW_OPEN_BINARY_PATHS is unset the guard is disabled.
 */
export function checkLocalPath(candidate: unknown): PathCheck {
  if (typeof candidate !== "string" || candidate.length === 0) {
    return { ok: false, reason: "O caminho precisa ser uma string não vazia." };
  }

  if (!isAbsolute(candidate)) {
    return { ok: false, reason: "O caminho precisa ser absoluto (ex.: C:\\targets\\app.exe)." };
  }

  const roots = getReaConfig().allowedOpenBinaryRoots;
  if (roots.length === 0) return { ok: true };

  const normalized = resolve(candidate);

  const insideRoot = roots.some((root) => {
    const normalizedRoot = resolve(root);
    return normalized === normalizedRoot || normalized.startsWith(`${normalizedRoot}${sep}`);
  });

  if (!insideRoot) {
    return {
      ok: false,
      reason: `Caminho fora das raízes permitidas (REA_ALLOW_OPEN_BINARY_PATHS): ${roots.join(", ")}`,
    };
  }

  return { ok: true };
}

/** Tools that accept local filesystem paths and therefore need the guard. */
export const PATH_PARAM_NAMES = new Set(["path", "snapshot_path"]);

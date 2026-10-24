export type LogLevel = "debug" | "info" | "warn" | "error";

const levels: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

let threshold = levels.info;

/** Called once during startup so the logger stays free of config imports. */
export function setLogLevel(level: LogLevel): void {
  threshold = levels[level];
}

function timestamp(): string {
  return new Date().toISOString();
}

function write(level: LogLevel, message: string, context?: Record<string, unknown>): void {
  if (levels[level] < threshold) return;
  const suffix = context ? ` ${JSON.stringify(context)}` : "";
  const line = `[${timestamp()}] ${level.toUpperCase().padEnd(5)} ${message}${suffix}`;
  if (level === "error" || level === "warn") console.error(line);
  else console.log(line);
}

export const logger = {
  debug: (message: string, context?: Record<string, unknown>) => write("debug", message, context),
  info: (message: string, context?: Record<string, unknown>) => write("info", message, context),
  warn: (message: string, context?: Record<string, unknown>) => write("warn", message, context),
  error: (message: string, context?: Record<string, unknown>) => write("error", message, context),
};

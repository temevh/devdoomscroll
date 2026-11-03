const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;
type Level = keyof typeof LEVELS;

const minLevel = LEVELS[(process.env.LOG_LEVEL as Level | undefined) ?? "info"] ?? LEVELS.info;

function write(level: Level, msg: string, data?: Record<string, unknown>) {
  if (LEVELS[level] < minLevel) return;
  const line = JSON.stringify({ time: new Date().toISOString(), level, msg, ...data });
  (level === "warn" || level === "error" ? console.error : console.log)(line);
}

/** One JSON line per entry on stdout/stderr, so hosted log viewers can filter on fields. */
export const log = {
  debug: (msg: string, data?: Record<string, unknown>) => write("debug", msg, data),
  info: (msg: string, data?: Record<string, unknown>) => write("info", msg, data),
  warn: (msg: string, data?: Record<string, unknown>) => write("warn", msg, data),
  error: (msg: string, data?: Record<string, unknown>) => write("error", msg, data),
};

/** pg reports connection failures as an AggregateError with an empty message, so unpack it. */
export function describeError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const code = (err as { code?: string }).code;
  const nested = err instanceof AggregateError ? err.errors.map(describeError).join("; ") : "";
  return [err.name, code, err.message, nested].filter(Boolean).join(": ");
}

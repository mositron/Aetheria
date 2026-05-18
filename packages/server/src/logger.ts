// Lightweight structured logger. Pino-style JSON in production, pretty in dev.
// Zero external dep — we're not shipping pino because the bundle is tiny and
// console.log is good enough as long as we have consistent fields.

type Level = "debug" | "info" | "warn" | "error";

const LEVEL_RANK: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const MIN_LEVEL: Level = (process.env.LOG_LEVEL as Level) ?? (process.env.NODE_ENV === "production" ? "info" : "debug");
const JSON_OUT = process.env.NODE_ENV === "production";

function log(level: Level, event: string, ctx?: Record<string, unknown>) {
  if (LEVEL_RANK[level] < LEVEL_RANK[MIN_LEVEL]) return;
  const ts = new Date().toISOString();
  if (JSON_OUT) {
    process.stdout.write(JSON.stringify({ ts, level, event, ...ctx }) + "\n");
    return;
  }
  // dev: pretty
  const sym = level === "error" ? "✗" : level === "warn" ? "⚠" : level === "info" ? "ℹ" : "·";
  const parts = ctx ? " " + Object.entries(ctx).map(([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v) : v}`).join(" ") : "";
  console.log(`${sym} [${level}] ${event}${parts}`);
}

export const logger = {
  debug: (event: string, ctx?: Record<string, unknown>) => log("debug", event, ctx),
  info:  (event: string, ctx?: Record<string, unknown>) => log("info", event, ctx),
  warn:  (event: string, ctx?: Record<string, unknown>) => log("warn", event, ctx),
  error: (event: string, ctx?: Record<string, unknown>) => log("error", event, ctx),
};

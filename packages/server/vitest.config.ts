import { defineConfig } from "vitest/config";
import { config as loadEnv } from "dotenv";
import { existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

// Load .env so DATABASE_URL + JWT_SECRET are available to Prisma during tests.
// Vitest does NOT load .env automatically (unlike Vite app builds).
// Prefer the local packages/server/.env, fall back to the monorepo-root .env.
const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_CANDIDATES = [
  resolve(__dirname, ".env"),
  resolve(__dirname, "../../.env"),
];
for (const p of ENV_CANDIDATES) {
  if (existsSync(p)) { loadEnv({ path: p }); break; }
}

// Prisma's SQLite `file:./prisma/dev.db` is resolved relative to CWD, which
// can differ across vitest forks. Pin it to an absolute path so every fork
// hits the same DB file.
if (process.env.DATABASE_URL?.startsWith("file:")) {
  const rel = process.env.DATABASE_URL.replace(/^file:/, "").replace(/^\.\/?/, "");
  process.env.DATABASE_URL = "file:" + resolve(__dirname, rel).replace(/\\/g, "/");
}

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: true
      }
    },
    server: {
      deps: {
        inline: [/@game\/shared/, /packages\/shared/]
      }
    }
  },
  esbuild: {
    tsconfigRaw: {
      compilerOptions: {
        experimentalDecorators: true,
        useDefineForClassFields: false
      }
    }
  }
});

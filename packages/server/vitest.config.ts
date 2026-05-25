import { defineConfig } from "vitest/config";
import { config as loadEnv } from "dotenv";
import { existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

// Load .env so DATABASE_URL + JWT_SECRET are available to Prisma during tests.
// Vitest does NOT load .env automatically (unlike Vite app builds).
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, ".env");
if (existsSync(envPath)) loadEnv({ path: envPath });

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

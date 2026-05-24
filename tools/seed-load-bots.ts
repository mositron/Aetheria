/**
 * Seed N test users + characters into the dev database and write their
 * JWT tokens to tools/.load-bots.json, ready for harness-runner.ts.
 *
 * Idempotent: upserts users by username so running twice doesn't duplicate.
 *
 *   pnpm seed:load-bots                 # defaults to 50 bots
 *   BOT_COUNT=100 pnpm seed:load-bots
 *
 * Requires: server's .env (for DATABASE_URL + JWT_SECRET).
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const BOT_COUNT = parseInt(process.env.BOT_COUNT ?? "50", 10);
const SECRET    = process.env.JWT_SECRET ?? "dev-only-insecure-fallback-DO-NOT-USE-IN-PROD";
const PASSWORD  = "harness-bot-password-X9";

async function main() {
  const prisma = new PrismaClient();
  const hash = await bcrypt.hash(PASSWORD, 10);
  const out: Array<{ token: string; characterId: string; name: string }> = [];

  console.log(`[seed] upserting ${BOT_COUNT} bot users + characters`);

  for (let i = 0; i < BOT_COUNT; i++) {
    const username = `loadbot_${String(i).padStart(4, "0")}`;
    const user = await prisma.user.upsert({
      where:  { username },
      update: {},
      create: { username, passwordHash: hash },
    });

    let char = await prisma.character.findFirst({ where: { userId: user.id } });
    if (!char) {
      char = await prisma.character.create({
        data: {
          userId: user.id,
          name: username,
          job: "swordsman",
          level: 1, exp: 0,
          hp: 100, maxHp: 100, mp: 50, maxMp: 50,
          atk: 10, def: 5,
          weapon: "", armor: "",
          mapId: "field",
          posX: 0, posY: 0, posZ: 0,
          inventoryJson: "[]",
        },
      });
    }

    const token = jwt.sign({ uid: user.id, username }, SECRET, { expiresIn: "1d" });
    out.push({ token, characterId: char.id, name: char.name });
  }

  const path = resolve(import.meta.dirname ?? __dirname, ".load-bots.json");
  writeFileSync(path, JSON.stringify(out, null, 2));
  console.log(`[seed] wrote ${out.length} bot credentials to ${path}`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("[seed] FATAL", err);
  process.exit(1);
});

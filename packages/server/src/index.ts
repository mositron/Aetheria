import "dotenv/config";
import express from "express";
import cors from "cors";
import http from "http";
import { Server } from "@colyseus/core";
import { Encoder } from "@colyseus/schema";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { MAPS } from "@game/shared";
import { GameRoom } from "./rooms/GameRoom.js";
import { authRouter } from "./auth.js";
import { getTop } from "./leaderboard.js";

// World grew large with new biomes/items — bump Colyseus encode buffer.
Encoder.BUFFER_SIZE = 64 * 1024;

const PORT = Number(process.env.PORT ?? 2567);

const app = express();
app.use(cors());
app.use(express.json());
app.use("/auth", authRouter);
app.get("/", (_req, res) => res.json({ ok: true, name: "game-v1 server" }));
app.get("/leaderboard", (_req, res) => res.json({ entries: getTop(10) }));

const httpServer = http.createServer(app);
const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

// one room per map
for (const id of Object.keys(MAPS)) {
  gameServer.define(`map_${id}`, GameRoom, { mapId: id }).filterBy(["mapId"]);
}

gameServer.listen(PORT).then(() => {
  console.log(`[server] listening on http://localhost:${PORT}`);
});

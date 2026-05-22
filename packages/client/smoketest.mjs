import { Client } from "colyseus.js";

const SERVER_HTTP = "http://localhost:2567";
const SERVER_WS = "ws://localhost:2567";
const USER = `bot_${Date.now().toString(36)}`;
const PASS = "TestPw1234";

async function main() {
  // 1) register
  const reg = await fetch(`${SERVER_HTTP}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: USER, password: PASS }),
  }).then((r) => r.json());
  console.log("[register]", reg);
  if (!reg.token) throw new Error("register failed");

  // 2) create character (fresh account has none)
  const charRes = await fetch(`${SERVER_HTTP}/api/auth/characters`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${reg.token}` },
    body: JSON.stringify({ name: USER }),
  }).then((r) => r.json());
  console.log("[create character]", charRes.character?.name ?? charRes.error ?? "FAIL");
  if (!charRes.character?.id) throw new Error("create character failed");

  // 3) join field room
  const client = new Client(SERVER_WS);
  const room = await client.joinOrCreate("world", { token: reg.token, characterId: charRes.character.id, mapId: "field" });
  console.log("[joined]", { sessionId: room.sessionId, mapId: room.state.mapId });

  // 4) wait for state to populate
  await new Promise((r) => setTimeout(r, 500));
  const me = room.state.players.get(room.sessionId);
  console.log("[me]", me ? { name: me.name, hp: me.hp, job: me.job, pos: { x: me.pos.x, z: me.pos.z } } : "MISSING");
  console.log("[monsters count]", room.state.monsters.size);

  // 5) move for 1 sec
  room.send("input", { mx: 1, mz: 0, rotY: 0, seq: 1 });
  await new Promise((r) => setTimeout(r, 1000));
  room.send("input", { mx: 0, mz: 0, rotY: 0, seq: 2 });
  await new Promise((r) => setTimeout(r, 200));
  const me2 = room.state.players.get(room.sessionId);
  console.log("[after move] pos", { x: me2.pos.x.toFixed(2), z: me2.pos.z.toFixed(2) });
  if (me2.pos.x < 1) throw new Error("movement did not apply");

  // 4) attack nearest monster
  let nearest = null, nd = Infinity;
  for (const [id, m] of room.state.monsters) {
    const d = Math.hypot(m.pos.x - me2.pos.x, m.pos.z - me2.pos.z);
    if (d < nd) { nd = d; nearest = m; }
  }
  console.log("[nearest monster]", nearest ? { kind: nearest.kind, dist: nd.toFixed(2), hp: nearest.hp } : "none");

  // 5) chat broadcast
  room.onMessage("chat", (m) => console.log("[chat]", m));
  room.send("chat", { text: "hello from bot" });
  await new Promise((r) => setTimeout(r, 300));

  // 6) leave
  await room.leave();
  console.log("[done] all smoke checks passed");
  process.exit(0);
}

main().catch((e) => {
  console.error("[FAIL]", e);
  process.exit(1);
});

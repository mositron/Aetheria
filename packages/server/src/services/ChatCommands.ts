// Slash command parser. Pure data + a routing function.
//
// WorldRoom keeps the wiring (rate limit, broadcasting, whisper plumbing).
// This service just owns the *grammar* — what commands exist and what they
// do to the player + what reply to emit.
//
// Returns a list of side-effect descriptors instead of doing them, so the
// caller stays in control of broadcast/client.send + DB writes.

export type ChatCommand = {
  cmd: string;
  args: string[];
};

export type ChatEffect =
  | { kind: "system"; text: string; toSelf: true }
  | { kind: "broadcast"; text: string }
  | { kind: "togglePvp" }
  | { kind: "warpHome" }
  | { kind: "listOnline" }
  | { kind: "whisper"; to: string; body: string }
  | { kind: "help"; text: string };

export function parseCommand(text: string): ChatCommand | null {
  if (!text.startsWith("/")) return null;
  const [cmd, ...args] = text.slice(1).split(/\s+/);
  return { cmd: cmd.toLowerCase(), args };
}

export function routeCommand(c: ChatCommand): ChatEffect | null {
  switch (c.cmd) {
    case "help":
      return {
        kind: "help",
        text: "📜 คำสั่ง: /help · /w ชื่อ ข้อความ · /pvp · /home · /who",
      };
    case "pvp":
      return { kind: "togglePvp" };
    case "home":
      return { kind: "warpHome" };
    case "who":
      return { kind: "listOnline" };
    case "w":
      if (c.args.length < 2) return null;
      return { kind: "whisper", to: c.args[0], body: c.args.slice(1).join(" ") };
    default:
      return null; // unknown command → falls through to broadcast as chat
  }
}

/** Spawn a random "home" coord near the village center (avoids fountain). */
export function randomHomeCoord(): { x: number; z: number } {
  const a = Math.random() * Math.PI * 2;
  const r = 3 + Math.random() * 3;
  return { x: Math.cos(a) * r, z: Math.sin(a) * r };
}

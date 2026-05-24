import { describe, it, expect } from "vitest";
import { parseCommand, routeCommand, randomHomeCoord } from "./ChatCommands.js";

describe("ChatCommands", () => {
  describe("parseCommand", () => {
    it("returns null for non-slash text", () => {
      expect(parseCommand("hello world")).toBeNull();
    });
    it("parses /help with no args", () => {
      expect(parseCommand("/help")).toEqual({ cmd: "help", args: [] });
    });
    it("parses /w with target + message", () => {
      expect(parseCommand("/w bob hi how are you")).toEqual({
        cmd: "w", args: ["bob", "hi", "how", "are", "you"],
      });
    });
    it("lowercases the command", () => {
      expect(parseCommand("/HELP")).toEqual({ cmd: "help", args: [] });
    });
  });

  describe("routeCommand", () => {
    it("/help returns help text", () => {
      const r = routeCommand({ cmd: "help", args: [] });
      expect(r?.kind).toBe("help");
    });
    it("/pvp returns togglePvp effect", () => {
      expect(routeCommand({ cmd: "pvp", args: [] })).toEqual({ kind: "togglePvp" });
    });
    it("/home returns warpHome effect", () => {
      expect(routeCommand({ cmd: "home", args: [] })).toEqual({ kind: "warpHome" });
    });
    it("/who returns listOnline effect", () => {
      expect(routeCommand({ cmd: "who", args: [] })).toEqual({ kind: "listOnline" });
    });
    it("/w bob hi returns whisper effect", () => {
      expect(routeCommand({ cmd: "w", args: ["bob", "hi"] })).toEqual({
        kind: "whisper", to: "bob", body: "hi",
      });
    });
    it("/w with no body returns null (gracefully ignored)", () => {
      expect(routeCommand({ cmd: "w", args: ["bob"] })).toBeNull();
    });
    it("unknown commands return null (caller falls through to broadcast)", () => {
      expect(routeCommand({ cmd: "nonsense", args: [] })).toBeNull();
    });
  });

  describe("randomHomeCoord", () => {
    it("always returns a coordinate within radius [3, 6]", () => {
      for (let i = 0; i < 100; i++) {
        const c = randomHomeCoord();
        const r = Math.hypot(c.x, c.z);
        expect(r).toBeGreaterThanOrEqual(3);
        expect(r).toBeLessThanOrEqual(6);
      }
    });
  });
});

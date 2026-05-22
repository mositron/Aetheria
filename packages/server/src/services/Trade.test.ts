import { describe, it, expect } from "vitest";
import { Trade } from "./Trade";
import { Player, ItemStack } from "@game/shared";

describe("Trade service unit tests", () => {
  const mockState = {
    players: new Map<string, Player>()
  };
  const mockCallbacks = {
    sendToClient: () => {},
    addToInventory: (p: Player, itemId: string, qty: number) => {
      // simple mock
      const stack = new ItemStack();
      stack.itemId = itemId;
      stack.qty = qty;
      p.inventory.push(stack);
      return true;
    }
  };

  const trade = new Trade(mockState, mockCallbacks);

  it("handles request and acceptance, establishing sessions", () => {
    const a = new Player();
    a.name = "Alice";
    const b = new Player();
    b.name = "Bob";

    mockState.players.set("p1", a);
    mockState.players.set("p2", b);

    expect(trade.sessions.has("p1")).toBe(false);

    trade.handleRequest("p1", "p2");
    trade.handleAccept("p2", "p1");

    expect(trade.sessions.has("p1")).toBe(true);
    expect(trade.sessions.has("p2")).toBe(true);
    expect(trade.sessions.get("p1")?.partnerSid).toBe("p2");
    expect(trade.sessions.get("p2")?.partnerSid).toBe("p1");
  });
});

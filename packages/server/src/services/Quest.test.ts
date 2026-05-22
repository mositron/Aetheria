import { describe, it, expect } from "vitest";
import { Quest } from "./Quest";
import { Player, PlayerQuestState } from "@game/shared";

describe("Quest service unit tests", () => {
  const mockState = {
    players: new Map<string, Player>()
  };
  const mockPlayerQuests = new Map<string, PlayerQuestState>();
  const mockCallbacks = {
    sendToClient: () => {},
    grantExp: () => {},
    addToInventoryOrMail: async () => {}
  };

  const questService = new Quest(mockState, mockPlayerQuests, mockCallbacks);

  it("handles quest acceptance", () => {
    const p = new Player();
    p.level = 10;
    mockState.players.set("p1", p);

    const qs: PlayerQuestState = { active: {}, completed: [] };
    mockPlayerQuests.set("p1", qs);

    // Accept slime starter quest
    questService.handleQuestAccept("p1", "q_slime_starter");
    expect(qs.active["q_slime_starter"]).toBe(0);
  });
});

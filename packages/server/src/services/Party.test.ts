import { describe, it, expect } from "vitest";
import { Party, MAX_PARTY_SIZE } from "./Party";

describe("Party state machine", () => {
  it("invite + accept forms a 2-member party", () => {
    const p = new Party();
    expect(p.invite("a", "b")).toBe(true);
    const change = p.accept("b", "a");
    expect(change.kind).toBe("joined");
    if (change.kind === "joined") {
      expect(change.members.sort()).toEqual(["a", "b"]);
    }
  });

  it("rejects self-invite", () => {
    const p = new Party();
    expect(p.invite("a", "a")).toBe(false);
  });

  it("rejects invite to someone already in a party", () => {
    const p = new Party();
    p.invite("a", "b"); p.accept("b", "a");
    expect(p.invite("c", "b")).toBe(false);
  });

  it("accept without pending invite is noop", () => {
    const p = new Party();
    expect(p.accept("b", "a").kind).toBe("noop");
  });

  it("accept from wrong inviter is rejected", () => {
    const p = new Party();
    p.invite("a", "c");
    expect(p.accept("c", "b").kind).toBe("noop"); // b never invited c
  });

  it("caps at MAX_PARTY_SIZE", () => {
    const p = new Party();
    p.invite("a", "b"); p.accept("b", "a");
    p.invite("a", "c"); p.accept("c", "a");
    p.invite("a", "d"); p.accept("d", "a");
    // 4 members now (a, b, c, d). 5th should fail.
    expect(p.members(p.partyOf("a")!).length).toBe(MAX_PARTY_SIZE);
    p.invite("a", "e");
    expect(p.accept("e", "a").kind).toBe("noop");
  });

  it("leave below 2 disbands the party", () => {
    const p = new Party();
    p.invite("a", "b"); p.accept("b", "a");
    const change = p.leave("a");
    expect(change.kind).toBe("disbanded");
    if (change.kind === "disbanded") {
      expect(change.formerMembers.sort()).toEqual(["a", "b"]);
    }
    expect(p.partyOf("b")).toBeNull(); // solo member also kicked out
  });

  it("leave with 3+ members keeps party alive", () => {
    const p = new Party();
    p.invite("a", "b"); p.accept("b", "a");
    p.invite("a", "c"); p.accept("c", "a");
    const change = p.leave("c");
    expect(change.kind).toBe("left");
    if (change.kind === "left") expect(change.members.sort()).toEqual(["a", "b"]);
  });

  it("forget(sid) clears pending invites and outgoing invites", () => {
    const p = new Party();
    p.invite("a", "b");
    p.invite("a", "c");
    p.forget("a");
    expect(p.pendingInviteFor("b")).toBeNull();
    expect(p.pendingInviteFor("c")).toBeNull();
  });
});

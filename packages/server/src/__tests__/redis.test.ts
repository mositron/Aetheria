import { describe, it, expect, beforeAll, afterAll } from "vitest";

/**
 * Redis pub/sub smoke test.
 *
 * Uses ioredis-mock for basic pub/sub API validation without a live Redis.
 * Also optionally tests against a real Redis when TEST_REDIS_URL is set.
 *
 * Run with real Redis: TEST_REDIS_URL=redis://localhost:6379 pnpm test
 * Or without Redis (mock only): pnpm test
 */
let RedisMock: any;
try {
   
  RedisMock = require("ioredis-mock");
} catch {
  // ioredis-mock not installed
}

const TEST_REDIS_URL = process.env.TEST_REDIS_URL;

// ── Raw pub/sub tests using ioredis-mock ────────────────────────────────────
describe("Redis pub/sub (ioredis-mock)", () => {
  let pubClient: any;
  let subClient: any;

  beforeAll(async () => {
    if (!RedisMock) return;
    pubClient = new RedisMock();
    subClient = new RedisMock();
  });

  afterAll(async () => {
    await pubClient?.quit?.();
    await subClient?.quit?.();
  });

  it("connects without error", async () => {
    if (!RedisMock) return;
    const pong = await pubClient.ping();
    expect(pong).toBe("PONG");
  });

  it("pub/sub relays a message to a subscribed channel", async () => {
    if (!RedisMock) return;
    const channel = "test:relay:" + Math.random().toString(36).slice(2);
    const received: string[] = [];

    await new Promise<void>((resolve) => {
      subClient.subscribe(channel, () => resolve());
    });

    subClient.on("message", (ch: string, msg: string) => {
      if (ch === channel) received.push(msg);
    });

    await pubClient.publish(channel, "hello from publisher");
    await new Promise((r) => setTimeout(r, 50));

    expect(received).toContain("hello from publisher");
    await subClient.unsubscribe(channel);
  });

  it("two mock clients share state via set/get", async () => {
    if (!RedisMock) return;
    const client1 = new RedisMock();
    const client2 = new RedisMock();

    await client1.set("shared:key", "server1-value");
    const val = await client2.get("shared:key");
    expect(val).toBe("server1-value");

    await client1.set("shared:counter", "1");
    await client2.incr("shared:counter");
    const finalVal = await client1.get("shared:counter");
    expect(Number(finalVal)).toBe(2);

    await client1.quit();
    await client2.quit();
  });

  it("mock sadd/smembers simulates session registry across server instances", async () => {
    if (!RedisMock) return;
    const presence1 = new RedisMock();
    const presence2 = new RedisMock();

    const SESSION_KEY = "game:sessions";
    const SESSION_1 = JSON.stringify({ sessionId: "abc", serverId: "server1" });
    const SESSION_2 = JSON.stringify({ sessionId: "def", serverId: "server2" });

    await presence1.sadd(SESSION_KEY, SESSION_1);
    await presence2.sadd(SESSION_KEY, SESSION_2);

    const members = await presence1.smembers(SESSION_KEY);
    const parsed = (members as string[]).map((s) => JSON.parse(s));
    expect(parsed).toContainEqual(expect.objectContaining({ sessionId: "abc" }));
    expect(parsed).toContainEqual(expect.objectContaining({ sessionId: "def" }));

    await presence1.quit();
    await presence2.quit();
  });
});

// ── Real Redis integration (requires TEST_REDIS_URL) ───────────────────────
const describeRealRedis = TEST_REDIS_URL ? describe : describe.skip;

describeRealRedis("Redis pub/sub (real instance)", () => {
  let pubClient: any;
  let subClient: any;

  beforeAll(async () => {
     
    const IORedis = require("ioredis");
    pubClient = new IORedis(TEST_REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 3 });
    subClient = new IORedis(TEST_REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 3 });
    await Promise.all([pubClient.connect(), subClient.connect()]);
  }, 15_000);

  afterAll(async () => {
    await pubClient?.quit();
    await subClient?.quit();
  });

  it("connects to Redis without error", async () => {
    const pong = await pubClient.ping();
    expect(pong).toBe("PONG");
  });

  it("pub/sub relays a message to a subscribed channel", async () => {
    const channel = "test:relay:" + Math.random().toString(36).slice(2);
    const received: string[] = [];

    await new Promise<void>((resolve) => {
      subClient.subscribe(channel, () => resolve());
    });

    subClient.on("message", (ch: string, msg: string) => {
      if (ch === channel) received.push(msg);
    });

    await pubClient.publish(channel, "hello from publisher");
    await new Promise((r) => setTimeout(r, 300));

    expect(received).toContain("hello from publisher");
    await subClient.unsubscribe(channel);
  });

  it("RedisPresence coordinates room registry across two presences", async () => {
    const { RedisPresence } = await import("@colyseus/redis-presence");

    const presence1: any = new RedisPresence(TEST_REDIS_URL);
    const presence2: any = new RedisPresence(TEST_REDIS_URL);

    const ROOM_KEY = "room:__test_world__";
    const SESSION_ID_1 = "session-server1-abc";
    const SESSION_ID_2 = "session-server2-def";

    await presence1.set(ROOM_KEY, JSON.stringify({ roomId: "room-1", hostSessionId: SESSION_ID_1 }));

    const raw = await presence2.get(ROOM_KEY);
    const roomInfo = JSON.parse(raw as string);
    expect(roomInfo.roomId).toBe("room-1");
    expect(roomInfo.hostSessionId).toBe(SESSION_ID_1);

    await presence2.sadd("sessions", JSON.stringify({ sessionId: SESSION_ID_2, serverId: "server-2" }));

    const rawSessions = await presence1.smembers("sessions");
    const sessions: any[] = (rawSessions as string[]).map((s) => JSON.parse(s));
    expect(sessions).toContainEqual(expect.objectContaining({ sessionId: SESSION_ID_2 }));

    await presence1.quit?.();
    await presence2.quit?.();
  });

  it("two presence instances share and increment a counter", async () => {
    const { RedisPresence } = await import("@colyseus/redis-presence");

    const presenceA: any = new RedisPresence(TEST_REDIS_URL);
    const presenceB: any = new RedisPresence(TEST_REDIS_URL);

    const COUNTER_KEY = "test:counter:" + Math.random().toString(36).slice(2);

    await presenceA.set(COUNTER_KEY, "1");
    const current = await presenceB.get(COUNTER_KEY);
    await presenceB.set(COUNTER_KEY, String(Number(current) + 1));

    const finalVal = await presenceA.get(COUNTER_KEY);
    expect(Number(finalVal)).toBe(2);

    await presenceA.quit?.();
    await presenceB.quit?.();
  });
});
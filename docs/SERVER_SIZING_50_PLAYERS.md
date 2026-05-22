# Server Sizing & Load‑Test Plan — 50 Players per Room

เอกสารนี้สรุปสเปคเซิร์ฟเวอร์ที่แนะนำ และแผนการทดสอบโหลดสำหรับห้องขนาด 50 ผู้เล่น (authoritative server model).

## สมมติฐานหลัก
- ห้องเป็น authoritative server (Colyseus / Node.js) รับผิดชอบตำแหน่ง, state, rules
- Tick rate: 20 Hz (configurable)
- ข้อมูลตำแหน่ง/สถานะที่ส่งโดยเฉลี่ย: 32–64 bytes / player / tick
- ไม่มี physics หนักบน server (physics ทำบน client หรือเป็น simplified checks)

## เป้าหมาย
- ให้ server รองรับห้องขนาด 50 ผู้เล่นแบบเสถียร (low latency)
- ระบุสเปคเครื่อง baseline และแนวทาง scale‑out
- ให้แผนทดสอบโหลดที่สามารถวัด CPU / RAM / Network ต่อห้อง

## ค่าประเมินเชิงปริมาณ (คร่าว)
- Tick rate: 20 Hz → 20 updates/second
- Outgoing bandwidth (server → all clients):
  - หาก broadcast full snapshot ทุก tick: ~32–64 bytes * 50 players * 20Hz = 32–64 KB/s * 50 * 20 = ~32–64 *1000 bytes/s? (use simplified estimate below)
  - ประมาณการปิงก์จริง: 10–15 Mbps outgoing (worst‑case, full broadcasts)
- Incoming bandwidth (clients → server): ~0.2–0.5 Mbps aggregate

> หมายเหตุ: การใช้ interest management/area culling จะลด outgoing bandwidth ได้มาก (3x–10x)

## Recommended baseline VM (single instance)
- CPU: 8 vCPU
- RAM: 16 GB
- Network: 1 Gbps NIC
- Disk: SSD 100+ GB (for DB/logs); most game state kept in memory/Redis
- OS: Linux (Ubuntu/CentOS)

## Per‑room resource estimates (approx)
- CPU: 0.3–0.8 vCPU (ขึ้นกับ logic/AI/serialize cost)
- RAM: 20–80 MB (state, buffers, js heap)
- Bandwidth: 10–15 Mbps outgoing (worst), less with interest management

## Deployment pattern (recommended)
- Matchmaker / API: small instances (2–4 vCPU, 4–8 GB)
- Room servers: autoscaled pool of instances (8 vCPU / 16 GB baseline)
- Redis: for pub/sub and ephemeral shared state (clustered as needed)
- Postgres (or managed DB): metadata (worlds, users, avatar metadata)
- CDN: host GLB/textures (not on game servers)
- Load balancer + service discovery for room allocation

## Scaling strategies
- Horizontal scale: run multiple room server instances and allocate rooms across pool
- Region sharding: split large world into region servers if one world >100 players
- Interest management: sync only nearby actors to each client
- Tick rate tuning: lower tick for distant players
- Delta encoding / binary serialization (msgpack/protobuf) to reduce bandwidth

## Load test plan
1. Tooling options
   - `k6` (HTTP/WebSocket load testing) — good for signaling, auth
   - custom headless clients (Node.js / Playwright / puppeteer) to simulate real client sockets and message patterns
   - `artillery` or `locust` as alternatives

2. Scenario
   - Simulate 50 concurrent clients connecting to a single room
   - Each client sends position updates at 20Hz (payload ~40 bytes)
   - Server replies with snapshots according to normal broadcast logic
   - Run for 5–15 minutes and capture metrics (CPU, memory, network, latency, packet loss)

3. k6 WebSocket example (simple sketch)

```javascript
import ws from 'k6/ws';
import { check } from 'k6';
import { sleep } from 'k6';

export default function() {
  const url = 'wss://your-game-server/room/ws?roomId=ROOM123';
  const response = ws.connect(url, null, function(socket) {
    socket.on('open', function() {
      // send initial auth/join payload
      socket.send(JSON.stringify({ op: 'join', token: 'TEST' }));

      // send position updates at ~20Hz
      const interval = setInterval(() => {
        const posUpdate = { op: 'pos', x: Math.random()*100, y:0, z: Math.random()*100 };
        socket.send(JSON.stringify(posUpdate));
      }, 50);

      socket.setInterval(() => {
        // keepalive / ping
        socket.ping();
      }, 30000);

      socket.on('close', () => clearInterval(interval));
    });

    socket.on('message', (data) => {
      // optional: validate snapshot
    });
  });

  check(response, { 'connected': (r) => r && r.status === 101 });
  sleep(1);
}
```

4. Metrics to collect
   - CPU usage, per‑process and system
   - Memory (RSS / heap)
   - Network throughput (tx/rx)
   - Latency (message round‑trip), packet loss
   - Server GC / event loop stalls (Node.js event loop lag)

5. Acceptance criteria
   - p95 latency < 200 ms for position updates
   - CPU usage per instance < 70% under sustained load
   - Memory stable (no uncontrolled leaks)
   - No significant packet loss

## Optimization checklist
- Implement interest management (area-based subscriptions)
- Use binary encoding (msgpack/protobuf) instead of JSON
- Aggregate snapshots & delta compression
- Tune server GC and Node options (if Node.js)
- Use Redis for pub/sub and offload some event processing

## Next steps I can do for you
- Produce a complete `k6` script (ready to run) that simulates 50 clients/room at 20Hz
- Build a small Node.js headless client harness to mimic real client traffic (ws messages and message sizes)
- Run a smoke load test locally (if you permit running tests here) and report results

---

File created by assistant. If you want, I can add a ready-to-run `k6` script into `tools/` or create a `loadtest/` folder with scripts and instructions for running tests against your current server stack.

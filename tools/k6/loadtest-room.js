// k6 WebSocket load test for Aetheria.
//   $ k6 run tools/k6/loadtest-room.js
// Override via env: K6_VUS=100 ROOM_URL=ws://localhost:2567 k6 run ...
import ws from "k6/ws";
import { check } from "k6";

const ROOM_URL = __ENV.ROOM_URL || "ws://localhost:2567";

export const options = {
  vus: parseInt(__ENV.K6_VUS || "50"),
  duration: __ENV.K6_DURATION || "60s",
  thresholds: {
    ws_session_duration: ["p(95)<60000"],
    ws_connecting: ["p(95)<200"],
  },
};

export default function () {
  const res = ws.connect(`${ROOM_URL}/`, {}, function (socket) {
    socket.on("open", () => {
      const tick = setInterval(() => {
        const x = Math.random() * 200 - 100;
        const z = Math.random() * 200 - 100;
        socket.send(JSON.stringify({ t: "input", x, z }));
      }, 50);
      setTimeout(() => { clearInterval(tick); socket.close(); }, 55_000);
    });
    socket.on("error", (e) => { console.error("ws error", e.error()); });
  });

  check(res, { "status is 101": (r) => r && r.status === 101 });
}

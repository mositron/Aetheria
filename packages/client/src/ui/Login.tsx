import { useState } from "react";
import { Canvas } from "@react-three/fiber";
import { useStore } from "../store";
import { MenuScene } from "./MenuScene";
import { GameFrame } from "./GameFrame";

export function Login() {
  const setAuth = useStore((s) => s.setAuth);
  const [username, setU] = useState("");
  const [password, setP] = useState("");
  const [mode, setMode] = useState<"login" | "register">("login");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch(`/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "failed");
      setAuth(data.token, data.username, data.characters ?? []);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full h-full relative overflow-hidden">
      {/* 3D game backdrop */}
      <div className="absolute inset-0">
        <Canvas camera={{ position: [0, 2, 10], fov: 50 }} dpr={[1, 1.5]} gl={{ antialias: true }}>
          <MenuScene variant="twilight" />
        </Canvas>
      </div>

      {/* vignette overlay */}
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_center,transparent_30%,rgba(0,0,0,0.7)_100%)]" />

      {/* title */}
      <div className="absolute top-10 left-0 right-0 text-center pointer-events-none">
        <div className="text-xs text-cyan-300/70 uppercase tracking-[0.4em] mb-2">A blocky MMORPG · survival</div>
        <h1 className="text-6xl font-black tracking-wider bg-gradient-to-b from-white via-cyan-200 to-indigo-400 text-transparent bg-clip-text drop-shadow-[0_0_18px_rgba(34,211,238,0.5)]">
          GAME-V1
        </h1>
        <div className="mt-2 text-amber-200/80 text-sm italic">
          ผจญภัย · ล่าสัตว์ · เพาะปลูก · เอาตัวรอด
        </div>
      </div>

      {/* form */}
      <div className="absolute inset-0 flex items-center justify-center">
        <form onSubmit={submit} className="w-[26rem]">
          <GameFrame title={mode === "login" ? "เข้าสู่โลก" : "ผู้กล้าหน้าใหม่"}>
            <div className="space-y-4 pt-2">
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setMode("login")}
                  className={`flex-1 py-2 text-xs uppercase tracking-widest transition border-2 ${mode === "login" ? "bg-cyan-500/20 border-cyan-400 text-cyan-100" : "bg-slate-900/60 border-slate-700 text-slate-400 hover:border-cyan-400/40"}`}
                >
                  ⚔ ลงชื่อ
                </button>
                <button
                  type="button"
                  onClick={() => setMode("register")}
                  className={`flex-1 py-2 text-xs uppercase tracking-widest transition border-2 ${mode === "register" ? "bg-cyan-500/20 border-cyan-400 text-cyan-100" : "bg-slate-900/60 border-slate-700 text-slate-400 hover:border-cyan-400/40"}`}
                >
                  ✦ สมัครใหม่
                </button>
              </div>
              <div>
                <div className="game-label">⛨ ชื่อผู้ใช้</div>
                <input className="game-input" placeholder="username" value={username} onChange={(e) => setU(e.target.value)} />
              </div>
              <div>
                <div className="game-label">⚿ รหัสผ่าน</div>
                <input className="game-input" placeholder="••••••" type="password" value={password} onChange={(e) => setP(e.target.value)} />
              </div>
              {err && (
                <div className="text-rose-300 text-sm border-l-2 border-rose-400 pl-2 bg-rose-900/20 py-1">
                  ⚠ {err}
                </div>
              )}
              <button disabled={busy} className="btn-game w-full">
                {busy ? "กำลังเชื่อมต่อ…" : mode === "login" ? "▶ เข้าสู่โลก" : "✦ สร้างบัญชี"}
              </button>
            </div>
          </GameFrame>
        </form>
      </div>

      {/* bottom hint */}
      <div className="absolute bottom-4 left-0 right-0 text-center text-[10px] text-slate-400/70 pointer-events-none">
        เซิร์ฟเวอร์ local · เล่นคนเดียวหรือชวนเพื่อน
      </div>
    </div>
  );
}

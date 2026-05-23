import { useState } from "react";
import { Canvas } from "@react-three/fiber";
import { useStore } from "../store";
import { MenuScene } from "./MenuScene";
import { GameFrame } from "./GameFrame";
import { AccountRecovery } from "./AccountRecovery";
import { useT } from "../locales/useT";

/** Compute strength 0-3 from password string. */
function passwordStrength(password: string): number {
  if (password.length === 0) return 0;
  let score = 0;
  if (password.length >= 8) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  return Math.min(3, score);
}

function PasswordStrength({ password }: { password: string }) {
  const score = passwordStrength(password);
  const colors = ["bg-rose-500", "bg-orange-500", "bg-yellow-400", "bg-green-500"];
  const labels = ["", "Weak", "Fair", "Strong"];
  if (!password) return null;
  return (
    <div className="mt-1">
      <div className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded transition-colors ${
              i < score ? colors[score] : "bg-slate-700"
            }`}
          />
        ))}
      </div>
      <div className={`text-xs mt-0.5 ${score <= 1 ? "text-rose-400" : score === 2 ? "text-orange-400" : "text-green-400"}`}>
        {labels[score]}
      </div>
    </div>
  );
}

export function Login() {
  const t = useT();
  const setAuth = useStore((s) => s.setAuth);
  // Pre-fill from saved credentials if "remember me" was previously checked.
  const saved = (() => {
    try {
      const raw = localStorage.getItem("savedCreds");
      if (!raw) return null;
      return JSON.parse(raw) as { u: string; p: string };
    } catch { return null; }
  })();
  const [username, setU] = useState(saved?.u ?? "");
  const [password, setP] = useState(saved?.p ?? "");
  const [remember, setRemember] = useState(saved !== null);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showRecovery, setShowRecovery] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "failed");
      // Persist or wipe credentials depending on the checkbox state.
      if (remember) {
        localStorage.setItem("savedCreds", JSON.stringify({ u: username, p: password }));
      } else {
        localStorage.removeItem("savedCreds");
      }
      setAuth(data.token, data.username, data.characters ?? []);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
}
  }

  if (showRecovery) {
    return (
      <div className="w-full h-full relative overflow-hidden">
        <AccountRecovery onBack={() => setShowRecovery(false)} />
      </div>
    );
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

      {/* title — scales down on small screens */}
      <div className="absolute top-4 sm:top-8 left-0 right-0 text-center pointer-events-none px-2">
        <div className="text-[9px] sm:text-xs text-cyan-300/70 uppercase tracking-[0.4em] mb-1 sm:mb-2">A cute MMORPG · survival</div>
        <h1 className="text-5xl sm:text-7xl md:text-8xl font-black tracking-[0.15em] bg-gradient-to-b from-white via-cyan-200 to-indigo-400 text-transparent bg-clip-text drop-shadow-[0_0_18px_rgba(34,211,238,0.5)]">
          AETHERIA
        </h1>
        <div className="mt-1 sm:mt-2 text-amber-200/80 text-[10px] sm:text-sm italic">
          {t("auth.subtitle")}
        </div>
      </div>

      {/* form — full-width on mobile, constrained on tablet+ */}
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <form onSubmit={submit} className="w-full max-w-[26rem]">
<GameFrame title={mode === "login" ? t("auth.login") : t("auth.register")}>
            <div className="space-y-3 sm:space-y-4 pt-2">
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setMode("login")}
                  className={`flex-1 py-2 text-xs uppercase tracking-widest transition border-2 ${mode === "login" ? "bg-cyan-500/20 border-cyan-400 text-cyan-100" : "bg-slate-900/60 border-slate-700 text-slate-400 hover:border-cyan-400/40"}`}
                >
                  {t("auth.signIn")}
                </button>
                <button
                  type="button"
                  onClick={() => setMode("register")}
                  className={`flex-1 py-2 text-xs uppercase tracking-widest transition border-2 ${mode === "register" ? "bg-cyan-500/20 border-cyan-400 text-cyan-100" : "bg-slate-900/60 border-slate-700 text-slate-400 hover:border-cyan-400/40"}`}
                >
                  {t("auth.signUp")}
                </button>
              </div>
              <div>
                <div className="game-label">{t("auth.username")}</div>
                <input className="game-input text-sm" placeholder="username" value={username} onChange={(e) => setU(e.target.value)} />
              </div>
              <div>
                <div className="game-label">{t("auth.password")}</div>
                <input className="game-input text-sm" placeholder="••••••" type="password" value={password} onChange={(e) => setP(e.target.value)} />
                {mode === "register" && <PasswordStrength password={password} />}
              </div>
              <label className="flex items-center gap-2 text-xs text-cyan-100 cursor-pointer select-none">
                <input
                  type="checkbox" checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="w-4 h-4 accent-cyan-400"
                />
                {t("auth.rememberMe")}
              </label>
              {err && (
                <div className="text-rose-300 text-sm border-l-2 border-rose-400 pl-2 bg-rose-900/20 py-1">
                  ⚠ {err}
                </div>
              )}
              <button disabled={busy} className="btn-game w-full">
                {busy ? t("auth.connecting") : mode === "login" ? t("auth.loginButton") : t("auth.registerButton")}
              </button>
              {mode === "login" && (
                <button
                  type="button"
                  onClick={() => setShowRecovery(true)}
                  className="w-full text-xs text-cyan-400/70 hover:text-cyan-300 transition py-1"
                >
                  {t("auth.forgotPassword")}
                </button>
              )}
            </div>
          </GameFrame>
        </form>
      </div>

      {/* bottom hint */}
      <div className="absolute bottom-2 sm:bottom-4 left-0 right-0 text-center text-[9px] sm:text-[10px] text-slate-400/70 pointer-events-none">
        {t("auth.localServer")}
      </div>
    </div>
  );
}

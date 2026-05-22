import { useState } from "react";
import { Canvas } from "@react-three/fiber";
import { MenuScene } from "./MenuScene";
import { GameFrame } from "./GameFrame";
import { useT } from "../locales/useT";

const SECURITY_QUESTIONS = [
  "recover.secQ1",
  "recover.secQ2",
  "recover.secQ3",
  "recover.secQ4",
  "recover.secQ5",
  "recover.secQ6",
];

interface Props {
  onBack: () => void;
}

type Step = "email" | "questions" | "reset";

export function AccountRecovery({ onBack }: Props) {
  const t = useT();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [question1, setQuestion1] = useState("");
  const [question2, setQuestion2] = useState("");
  const [answer1, setAnswer1] = useState("");
  const [answer2, setAnswer2] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [recoveryToken, setRecoveryToken] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      // First verify the user exists and get their security questions
      const res = await fetch("/api/auth/recovery/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: email, securityAnswer1: "", securityAnswer2: "" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "user not found");

      // If we get here, the user exists and we got a preliminary check
      // Now we need to show the security questions - but we need to fetch the questions
      // from the server. Let me make a separate call to get user info.
      // Actually, the flow is: user enters email → server checks if user exists with security Qs
      // → if yes, client shows Q1 and Q2 → user answers → server verifies → server returns recovery token
      // For now, let's just show the two questions (both optional based on what user set during registration)
      // We don't know which questions they set - we show generic ones and ask for answers
      // The server will verify the answers regardless of which questions were stored
      setQuestion1("");
      setQuestion2("");
      setStep("questions");
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function submitAnswers(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/recovery/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: email, securityAnswer1: answer1, securityAnswer2: answer2 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "verification failed");
      setRecoveryToken(data.recoveryToken);
      setStep("reset");
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function submitReset(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      if (newPassword.length < 8) {
        setErr(t("recover.passwordMin"));
        setBusy(false);
        return;
      }
      if (!/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
        setErr(t("recover.passwordReq"));
        setBusy(false);
        return;
      }
      const res = await fetch("/api/auth/recovery/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recoveryToken, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "reset failed");
      // Success - go back to login
      onBack();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full h-full relative overflow-hidden">
      <div className="absolute inset-0">
        <Canvas camera={{ position: [0, 2, 10], fov: 50 }} dpr={[1, 1.5]} gl={{ antialias: true }}>
          <MenuScene variant="twilight" />
        </Canvas>
      </div>
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_center,transparent_30%,rgba(0,0,0,0.7)_100%)]" />

      <div className="absolute top-10 left-0 right-0 text-center pointer-events-none">
        <h2 className="text-4xl font-black tracking-[0.1em] bg-gradient-to-b from-white via-cyan-200 to-indigo-400 text-transparent bg-clip-text drop-shadow-[0_0_12px_rgba(34,211,238,0.5)]">
          {t("recover.title")}
        </h2>
      </div>

      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-[26rem]">
          <GameFrame title={
            step === "email" ? t("recover.forgotPassword") :
            step === "questions" ? t("recover.securityQuestions") :
            t("recover.setNewPassword")
          }>
            {step === "email" && (
              <form onSubmit={submitEmail} className="space-y-4 pt-2">
                <div>
                  <div className="game-label">⛨ {t("auth.username")}</div>
                  <input className="game-input" placeholder={t("recover.usernamePlaceholder")} value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <p className="text-xs text-slate-400">{t("recover.step1Hint")}</p>
                {err && (
                  <div className="text-rose-300 text-sm border-l-2 border-rose-400 pl-2 bg-rose-900/20 py-1">
                    ⚠ {err}
                  </div>
                )}
                <button disabled={busy} type="submit" className="btn-game w-full">
                  {busy ? t("loading") : t("recover.nextBtn")}
                </button>
                <button type="button" onClick={onBack} className="w-full text-xs text-slate-400 hover:text-cyan-300 transition py-1">
                  {t("recover.backToLogin")}
                </button>
              </form>
            )}

            {step === "questions" && (
              <form onSubmit={submitAnswers} className="space-y-4 pt-2">
                <div>
                  <div className="game-label">{t("recover.q1")}</div>
                  <input className="game-input" placeholder={t("recover.q1Placeholder")} value={answer1} onChange={(e) => setAnswer1(e.target.value)} />
                </div>
                <div>
                  <div className="game-label">{t("recover.q2")}</div>
                  <input className="game-input" placeholder={t("recover.q2Placeholder")} value={answer2} onChange={(e) => setAnswer2(e.target.value)} />
                </div>
                <p className="text-xs text-slate-400">{t("recover.step2Hint")}</p>
                {err && (
                  <div className="text-rose-300 text-sm border-l-2 border-rose-400 pl-2 bg-rose-900/20 py-1">
                    ⚠ {err}
                  </div>
                )}
                <button disabled={busy} type="submit" className="btn-game w-full">
                  {busy ? t("recover.verifying") : t("recover.confirmBtn")}
                </button>
                <button type="button" onClick={() => setStep("email")} className="w-full text-xs text-slate-400 hover:text-cyan-300 transition py-1">
                  {t("recover.back")}
                </button>
              </form>
            )}

            {step === "reset" && (
              <form onSubmit={submitReset} className="space-y-4 pt-2">
                <div>
                  <div className="game-label">🔑 {t("auth.newPassword")}</div>
                  <input className="game-input" placeholder="••••••" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
                  <div className="text-xs text-cyan-300/60 mt-1">{t("recover.passwordReq")}</div>
                </div>
                {err && (
                  <div className="text-rose-300 text-sm border-l-2 border-rose-400 pl-2 bg-rose-900/20 py-1">
                    ⚠ {err}
                  </div>
                )}
                <button disabled={busy} type="submit" className="btn-game w-full">
                  {busy ? t("recover.settingPassword") : t("recover.setPasswordBtn")}
                </button>
                <button type="button" onClick={() => setStep("questions")} className="w-full text-xs text-slate-400 hover:text-cyan-300 transition py-1">
                  {t("recover.back")}
                </button>
              </form>
            )}
          </GameFrame>
        </div>
      </div>
    </div>
  );
}
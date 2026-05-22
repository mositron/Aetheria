import { useState, useEffect } from "react";
import type { Room } from "colyseus.js";
import type { WorldState } from "@game/shared";
import FocusTrap from "focus-trap-react";
import { GameFrame } from "./GameFrame";
import { ConfirmDialog } from "./ConfirmDialog";

export function MarriageUI({ room }: { room: Room<WorldState> }) {
  const [open, setOpen] = useState(false);
  const [targetName, setTargetName] = useState("");
  const [confirmDivorce, setConfirmDivorce] = useState(false);

  useEffect(() => {
    const handler = () => setOpen(o => !o);
    window.addEventListener("toggle-marriage", handler);
    return () => window.removeEventListener("toggle-marriage", handler);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const me = room.state.players.get(room.sessionId);
  const spouse = me?.spouseId
    ? Array.from(room.state.players.values()).find(p => p.sessionId === me.spouseId)
    : null;

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm"
        onClick={() => setOpen(false)}
      >
        <FocusTrap focusTrapOptions={{ allowOutsideClick: true }}>
          <div
            className="relative"
            role="dialog"
            aria-modal="true"
            aria-label="ทะเบียนสมรส"
            onClick={e => e.stopPropagation()}
          >
            <GameFrame title="💍 ทะเบียนสมรส" variant="violet" className="w-80 max-w-[94vw]">
              <button
                onClick={() => setOpen(false)}
                className="absolute -top-3 -right-3 w-9 h-9 rounded-full bg-rose-700 hover:bg-rose-600 border-2 border-rose-300 text-white font-bold z-10 flex items-center justify-center"
                aria-label="ปิด"
              >
                ✕
              </button>

              {spouse ? (
                <div className="space-y-3 p-3">
                  <div className="text-center">
                    <div className="text-4xl mb-2">💍</div>
                    <div className="text-amber-200 font-bold text-lg">{me?.name} ❤️ {spouse.name}</div>
                    <div className="text-cyan-300 text-xs mt-1">
                      แต่งงานเมื่อ: {me?.marriageDate ? new Date(me.marriageDate).toLocaleDateString("th-TH") : "N/A"}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1 text-center p-2 rounded-lg bg-violet-900/30 border border-violet-400/30">
                      <div className="text-cyan-100 font-bold">{spouse.name}</div>
                      <div className="text-slate-400 text-[10px]">คู่สมรส</div>
                      <div className="text-[9px] text-slate-500 mt-1">Lv.{spouse.level} {spouse.job}</div>
                    </div>
                  </div>
                  <button
                    onClick={() => setConfirmDivorce(true)}
                    className="w-full py-2 rounded-xl bg-rose-700/60 hover:bg-rose-600 text-rose-200 text-sm font-bold"
                  >
                    💔 หย่าขาด
                  </button>
                </div>
              ) : (
                <div className="space-y-3 p-3">
                  <div className="text-center text-slate-300 text-sm">ยังไม่ได้แต่งงาน</div>
                  <input
                    value={targetName}
                    onChange={e => setTargetName(e.target.value)}
                    placeholder="ชื่อคู่สมรสที่ต้องการ"
                    className="w-full bg-slate-900 border border-violet-400/40 rounded-xl px-3 py-2 text-white text-sm"
                  />
                  <button
                    disabled={!targetName.trim()}
                    onClick={() => { room.send("propose", { targetName: targetName.trim() }); setTargetName(""); }}
                    className="w-full py-2 rounded-xl bg-pink-500 hover:bg-pink-400 disabled:opacity-40 text-white font-bold"
                  >
                    💍 ขอแต่งงาน
                  </button>
                </div>
              )}
            </GameFrame>
          </div>
        </FocusTrap>
      </div>

      <ConfirmDialog
        open={confirmDivorce}
        title="หย่าขาด?"
        message="การหย่าจะตัดความสัมพันธ์แต่งงาน คุณแน่ใจหรือไม่?"
        severity="danger"
        confirmLabel="หย่า"
        onConfirm={() => { room.send("divorce", {}); setConfirmDivorce(false); setOpen(false); }}
        onCancel={() => setConfirmDivorce(false)}
      />
    </>
  );
}
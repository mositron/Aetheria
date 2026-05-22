import { useEffect, useState } from "react";
import type { Room } from "colyseus.js";
import FocusTrap from "focus-trap-react";
import type { Player, WorldState } from "@game/shared";
import { GameFrame } from "./GameFrame";
import { ConfirmDialog } from "./ConfirmDialog";

const KIND_ICONS: Record<string, string> = {
  chicken: "🐔", pig: "🐷", cow: "🐮",
};
const KIND_NAMES: Record<string, string> = {
  chicken: "ไก่", pig: "หมู", cow: "วัว",
};

export function PetBox({ room }: { room: Room<WorldState> }) {
  const [open, setOpen] = useState(false);
  const [, setTick] = useState(0);
  const [breedA, setBreedA] = useState<string | null>(null);
  const [breedB, setBreedB] = useState<string | null>(null);
  const [confirmPet, setConfirmPet] = useState<{ id: string; kind: string } | null>(null);

  useEffect(() => {
    const onToggle = () => setOpen((o) => !o);
    window.addEventListener("toggle-pets", onToggle);
    return () => window.removeEventListener("toggle-pets", onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => setTick((t) => t + 1), 300);
    return () => clearInterval(id);
  }, [open]);

  if (!open) return null;
  const me: Player | undefined = room.state.players.get(room.sessionId);
  if (!me) return null;

  let pets: any[] = [];
  try { pets = JSON.parse(me.petsJson || "[]"); } catch {}

  return (
    <div onClick={() => setOpen(false)}>
      <FocusTrap focusTrapOptions={{ allowOutsideClick: true }}>
        <div
          data-no-screen-joy
          role="dialog"
          aria-modal="true"
          className="absolute inset-0 z-40 flex items-center justify-center bg-black/65 backdrop-blur-sm py-16 px-4"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="w-[26rem] max-w-[94vw] flex flex-col min-h-0" style={{ maxHeight: "calc(100vh - 8rem)" }}>
            <GameFrame
              title={`สวนสัตว์ ${pets.length}/8`}
              variant="violet"
              className="flex flex-col min-h-0"
              innerClassName="flex flex-col flex-1 min-h-0"
            >
              <button
                onClick={() => setOpen(false)}
                aria-label="ปิด"
                className="absolute -top-3 -right-3 min-w-[44px] min-h-[44px] w-11 h-11 rounded-full bg-rose-700 hover:bg-rose-600 border-2 border-rose-300 text-white font-bold z-10 flex items-center justify-center"
              >
                ✕
              </button>

            {pets.length >= 2 && (
              <div className="mb-2 p-2 rounded-xl bg-violet-900/30 border border-violet-400/40">
                <div className="text-[10px] text-violet-200 font-bold mb-1 uppercase tracking-wider">🥚 ผสมพันธุ์ (200 zeny)</div>
                <div className="flex items-center gap-1">
                  <select
                    value={breedA ?? ""}
                    onChange={(e) => setBreedA(e.target.value || null)}
                    className="flex-1 bg-slate-900 border border-violet-400/40 rounded px-1.5 py-1 text-xs text-white"
                  >
                    <option value="">— เลือกตัวที่ 1 —</option>
                    {pets.map((p) => (
                      <option key={p.id} value={p.id}>{KIND_ICONS[p.kind]} {KIND_NAMES[p.kind]}{p.rare ? " ✨" : ""} ({p.id.slice(-4)})</option>
                    ))}
                  </select>
                  <span className="text-violet-300">+</span>
                  <select
                    value={breedB ?? ""}
                    onChange={(e) => setBreedB(e.target.value || null)}
                    className="flex-1 bg-slate-900 border border-violet-400/40 rounded px-1.5 py-1 text-xs text-white"
                  >
                    <option value="">— เลือกตัวที่ 2 —</option>
                    {pets.filter((p) => p.id !== breedA && (!breedA || p.kind === pets.find((q) => q.id === breedA)?.kind)).map((p) => (
                      <option key={p.id} value={p.id}>{KIND_ICONS[p.kind]} {KIND_NAMES[p.kind]}{p.rare ? " ✨" : ""} ({p.id.slice(-4)})</option>
                    ))}
                  </select>
                  <button
                    disabled={!breedA || !breedB || me.zeny < 200}
                    onClick={() => { room.send("breedPets", { aId: breedA, bId: breedB }); setBreedA(null); setBreedB(null); }}
                    className="px-2 py-1 rounded-full bg-pink-500 hover:bg-pink-400 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs"
                  >
                    ผสม
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-2 overflow-y-auto game-scroll violet flex-1 pr-1 pt-1" style={{ minHeight: 0 }}>
              {pets.length === 0 && (
                <div className="text-center text-slate-400 py-6 text-sm">
                  ยังไม่มีสัตว์เลี้ยง — หาไก่/หมู/วัวแล้วป้อนเบอร์รี่!
                </div>
              )}
              {pets.map((p) => {
                const isActive = me.petKind === p.kind && me.petRare === !!p.rare;
                return (
                  <div
                    key={p.id}
                    className={`flex items-center gap-3 p-2.5 rounded-2xl border-2 ${isActive ? "border-amber-300 bg-amber-500/15" : "border-violet-400/30 bg-slate-900/60"}`}
                  >
                    <div
                      className="w-12 h-12 rounded-full flex items-center justify-center text-2xl"
                      style={{
                        background: p.rare ? "radial-gradient(circle at 30% 30%, #fde68a, #fbbf24)" : "rgba(255,255,255,0.1)",
                        boxShadow: p.rare ? "0 0 16px rgba(251,191,36,0.7)" : undefined,
                        border: p.rare ? "2px solid #fbbf24" : "2px solid rgba(255,255,255,0.1)",
                      }}
                    >
                      {KIND_ICONS[p.kind] ?? "🐾"}
                    </div>
                    <div className="flex-1">
                      <div className="font-bold text-white text-sm">
                        {p.rare && "✨ "}{KIND_NAMES[p.kind] ?? p.kind}{p.rare && " (พิเศษ)"}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        ID: {p.id.slice(-6)}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <button
                        onClick={() => room.send("setActivePet", { petId: p.id })}
                        className={`text-[10px] px-2.5 py-1 rounded-full font-bold border-2 ${isActive ? "border-amber-300 bg-amber-500/40 text-white" : "border-emerald-400 bg-emerald-500/30 hover:bg-emerald-500/50 text-white"}`}
                      >
                        {isActive ? "✓ ใช้อยู่" : "ใช้ตัวนี้"}
                      </button>
                      <button
                        onClick={() => { setConfirmPet({ id: p.id, kind: p.kind }); }}
                        className="text-[10px] px-2 py-0.5 rounded-full bg-rose-700/60 hover:bg-rose-600 text-white"
                      >ปล่อย</button>
                    </div>
                  </div>
                );
              })}
            </div>
</GameFrame>
          </div>
        </div>
      </FocusTrap>
      <ConfirmDialog
        open={confirmPet !== null}
        title="ปล่อยเพื่อน?"
        message={`${KIND_NAMES[confirmPet?.kind ?? ""] ?? "สัตว์เลี้ยง"} จะถูกปล่อยไป คุณแน่ใจหรือไม่?`}
        severity="danger"
        confirmLabel="ปล่อย"
        onConfirm={() => {
          if (confirmPet) room.send("releasePet", { petId: confirmPet.id });
          setConfirmPet(null);
        }}
        onCancel={() => setConfirmPet(null)}
      />
    </div>
  );
}
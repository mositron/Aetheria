import { useEffect, useState } from "react";
import type { Room } from "colyseus.js";
import type { WorldState } from "@game/shared";
import { useT } from "../locales/useT";

type Member = { id: string; name: string; hp: number; maxHp: number; level: number };
type Invite = { fromId: string; fromName: string };

export function PartyPanel({ room }: { room: Room<WorldState> }) {
  const t = useT();
  const [members, setMembers] = useState<Member[]>([]);
  const [leaderId, setLeaderId] = useState("");
  const [invite, setInvite] = useState<Invite | null>(null);
  const [inviteName, setInviteName] = useState("");
  const [showInviteBox, setShowInviteBox] = useState(false);

  useEffect(() => {
    const off1 = room.onMessage("partyUpdate" as any, (m: any) => {
      setMembers(m.members ?? []);
      setLeaderId(m.leaderId ?? "");
    });
    const off2 = room.onMessage("partyInvite" as any, (m: any) => {
      setInvite({ fromId: m.fromId, fromName: m.fromName });
    });
    const onToggle = () => setShowInviteBox((s) => !s);
    window.addEventListener("toggle-party", onToggle);
    return () => { off1?.(); off2?.(); window.removeEventListener("toggle-party", onToggle); };
  }, [room]);

  return (
    <>
      {invite && (
        <div className="panel absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 z-50">
          <div className="panel-corners" />
          <div className="panel-title">{t('party.inviteTitle')}</div>
          <div className="text-sm py-2">
            {t('party.invitesYou', { name: invite.fromName })}
          </div>
          <div className="flex gap-2">
            <button onClick={() => { room.send("partyAccept", { fromId: invite.fromId }); setInvite(null); }} className="btn-3d btn-emerald flex-1">{t('party.accept')}</button>
            <button onClick={() => setInvite(null)} className="btn-3d btn-rose flex-1">{t('party.decline')}</button>
          </div>
        </div>
      )}

      {members.length > 0 && (
        <div className="panel absolute left-2 top-32 w-44 sm:w-56">
          <div className="panel-corners" />
          <div className="panel-title">
            <span>👥 {t('party.party')} ({members.length}/4)</span>
            <button onClick={() => room.send("partyLeave", {})}>{t('party.leave')}</button>
          </div>
          <div className="space-y-1">
            {members.map((m) => (
              <div key={m.id} className="text-[11px]">
                <div className="flex justify-between">
                  <span className="font-semibold">{m.id === leaderId && "👑"} {m.name}</span>
                  <span className="text-amber-200">Lv{m.level}</span>
                </div>
                <div className="h-1.5 bg-black/60 border border-black/50">
                  <div className="h-full bg-gradient-to-b from-emerald-400 to-emerald-600" style={{ width: `${Math.max(0, Math.min(100, (m.hp / m.maxHp) * 100))}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {showInviteBox && (
        <div className="panel absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-64 z-40">
          <div className="panel-corners" />
          <div className="panel-title">
            <span>👥 {t('party.invitePlayer')}</span>
            <button onClick={() => setShowInviteBox(false)}>✕</button>
          </div>
          <input
            value={inviteName}
            onChange={(e) => setInviteName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && inviteName.trim()) {
                room.send("partyInvite", { targetName: inviteName.trim() });
                setInviteName(""); setShowInviteBox(false);
              }
            }}
            autoFocus
            placeholder={t('party.playerName')}
            className="w-full bg-slate-800 px-2 py-1 text-xs border border-slate-600 mb-2 rounded"
          />
          <button
            onClick={() => { if (inviteName.trim()) { room.send("partyInvite", { targetName: inviteName.trim() }); setInviteName(""); setShowInviteBox(false); } }}
            className="btn-3d btn-emerald w-full"
          >{t('party.sendInvite')}</button>
        </div>
      )}
    </>
  );
}

// Guild panel — create / join / leave / chat.
// Opens via toggle-guild event from MenuBar.

import { useEffect, useRef, useState } from "react";
import type { Room } from "colyseus.js";
import type { WorldState } from "@game/shared";
import { GameFrame } from "./GameFrame";
import { useT } from "../../locales/useT";

type GuildInfo = { id: string; name: string; tag: string; leader: string; members: string[] } | null;
type ChatMsg = { from: string; text: string; ts: number };

export function GuildPanel({ room }: { room: Room<WorldState> }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState<GuildInfo>(null);
  const [createName, setCreateName] = useState("");
  const [createTag, setCreateTag] = useState("");
  const [joinName, setJoinName] = useState("");
  const [chatText, setChatText] = useState("");
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onToggle = () => setOpen((o) => !o);
    window.addEventListener("toggle-guild", onToggle);
    const offInfo = room.onMessage("guild:info" as any, (m: any) => setInfo(m || null));
    const offChat = room.onMessage("guild:chat" as any, (m: any) => {
      setChat((prev) => [...prev.slice(-49), m]);
    });
    // Auto-fetch on connect so player knows their current guild
    room.send("guild:info" as any, {});
    return () => {
      window.removeEventListener("toggle-guild", onToggle);
      offInfo?.(); offChat?.();
    };
  }, [room]);

  useEffect(() => {
    if (open) room.send("guild:info" as any, {});
  }, [open, room]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [chat.length]);

  if (!open) return null;
  return (
    <div data-no-screen-joy role="dialog" aria-modal="true" className="absolute inset-0 z-40 flex items-center justify-center bg-black/65 backdrop-blur-sm py-12 px-4" onClick={() => setOpen(false)}>
      <div className="w-[24rem] max-w-[94vw]" onClick={(e) => e.stopPropagation()}>
        <GameFrame title={info ? `⚔ ${info.tag ? `[${info.tag}] ` : ""}${info.name}` : `⚔ ${t("guild.title")}`}>
          <button onClick={() => setOpen(false)} className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-rose-700 hover:bg-rose-600 border-2 border-rose-300 text-white font-bold z-10">✕</button>

          {!info ? (
            <div className="space-y-3 pt-1">
              <div className="text-xs text-slate-300">
                {t("guild.noGuild")}
              </div>

              <form
                onSubmit={(e) => { e.preventDefault(); if (!createName.trim()) return; room.send("guild:create" as any, { name: createName.trim(), tag: createTag.trim() }); setCreateName(""); setCreateTag(""); }}
                className="space-y-1.5 bg-cyan-900/30 border border-cyan-400/30 rounded p-2"
              >
                <div className="text-[11px] text-cyan-300 font-bold">🛡 {t("guild.create")}</div>
                <input value={createName} onChange={(e) => setCreateName(e.target.value)} maxLength={24} placeholder={t("guild.name")} className="w-full bg-slate-900/80 border border-cyan-400/40 rounded px-2 py-1 text-xs text-white" />
                <input value={createTag} onChange={(e) => setCreateTag(e.target.value)} maxLength={4} placeholder={t("guild.tag")} className="w-full bg-slate-900/80 border border-cyan-400/40 rounded px-2 py-1 text-xs text-white uppercase" />
                <button type="submit" className="w-full bg-cyan-600 hover:bg-cyan-500 rounded px-3 py-1 text-xs font-bold text-white">{t("guild.createBtn")}</button>
              </form>

              <form
                onSubmit={(e) => { e.preventDefault(); if (!joinName.trim()) return; room.send("guild:join" as any, { name: joinName.trim() }); setJoinName(""); }}
className="space-y-1.5 bg-violet-900/30 border border-violet-400/30 rounded p-2"
              >
                <div className="text-[11px] text-violet-300 font-bold">🤝 {t("guild.join")}</div>
                <input value={joinName} onChange={(e) => setJoinName(e.target.value)} maxLength={24} placeholder={t("guild.name")} className="w-full bg-slate-900/80 border border-violet-400/40 rounded px-2 py-1 text-xs text-white" />
                <button type="submit" className="w-full bg-violet-600 hover:bg-violet-500 rounded px-3 py-1 text-xs font-bold text-white">{t("guild.joinBtn")}</button>
              </form>
</div>
          ) : (
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-amber-300">{t("guild.leader")}: <span className="font-bold">{info.leader}</span></span>
                <span className="text-slate-400">{info.members.length} {t("guild.members")}</span>
              </div>

              <div className="bg-slate-900/60 border border-white/10 rounded p-1.5 max-h-24 overflow-y-auto game-scroll text-[11px]">
                {info.members.map((m) => (
                  <div key={m} className={`px-1 py-0.5 ${m === info.leader ? "text-amber-200 font-bold" : "text-white"}`}>
                    {m === info.leader ? "👑 " : "• "}{m}
                  </div>
                ))}
              </div>

              {/* Guild chat */}
              <div className="bg-slate-900/60 border border-cyan-400/20 rounded p-1.5 space-y-1">
                <div className="text-[10px] text-cyan-300 font-bold">{t("guild.title")}</div>
                <div ref={scrollRef} className="max-h-28 overflow-y-auto game-scroll text-[10px] space-y-0.5">
                  {chat.length === 0 && <div className="text-slate-500 italic">{t("guild.chatEmpty")}</div>}
                  {chat.map((m, i) => (
                    <div key={i}><span className="text-amber-300 font-bold">{m.from}:</span> <span className="text-white/90">{m.text}</span></div>
                  ))}
                </div>
                <form onSubmit={(e) => { e.preventDefault(); if (!chatText.trim()) return; room.send("guild:chat" as any, { text: chatText.trim() }); setChatText(""); }} className="flex gap-1">
                  <input value={chatText} onChange={(e) => setChatText(e.target.value)} placeholder={t("guild.chatPlaceholder")} maxLength={200} className="flex-1 bg-slate-900/80 border border-cyan-400/40 rounded px-2 py-1 text-xs text-white" />
                  <button type="submit" className="bg-cyan-600 hover:bg-cyan-500 rounded px-3 text-xs font-bold text-white">{t("guild.send")}</button>
                </form>
</div>

              <button
                onClick={() => { if (confirm(t("confirm.warning") + " " + t("guild.leave") + "?")) room.send("guild:leave" as any, {}); }}
                className="w-full bg-rose-700 hover:bg-rose-600 rounded px-3 py-1 text-xs font-bold text-white"
              >🚪 {t("guild.leave")}</button>
            </div>
          )}
        </GameFrame>
      </div>
    </div>
  );
}

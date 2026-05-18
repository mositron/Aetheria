import { useEffect, useState } from "react";
import type { Room } from "colyseus.js";
import { ITEMS, type Player, type WorldState } from "@game/shared";
import { useStore } from "../store";
import { GameFrame } from "./GameFrame";

type Mail = {
  id: string;
  toName: string;
  fromName: string;
  subject: string;
  body: string;
  zeny: number;
  itemId: string;
  itemQty: number;
  read: number;
  claimed: number;
  createdAt: string;
};

export function Mailbox({ room }: { room: Room<WorldState> }) {
  const token = useStore((s) => s.token);
  const [open, setOpen] = useState(false);
  const [mails, setMails] = useState<Mail[]>([]);
  const [mode, setMode] = useState<"inbox" | "send">("inbox");
  const [, setTick] = useState(0);

  useEffect(() => {
    const onToggle = () => setOpen((o) => !o);
    window.addEventListener("toggle-mail", onToggle);
    return () => window.removeEventListener("toggle-mail", onToggle);
  }, []);

  const me: Player | undefined = room.state.players.get(room.sessionId);

  function reload() {
    if (!token || !me) return;
    fetch(`/auth/mailbox/${encodeURIComponent(me.name)}`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then((r) => r.json()).then((d) => setMails(d.mails ?? [])).catch(() => {});
  }

  useEffect(() => {
    if (!open) return;
    reload();
    const off = room.onMessage("mailUpdated" as any, reload);
    const id = setInterval(() => setTick((t) => t + 1), 600);
    return () => { off?.(); clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, room]);

  if (!open) return null;
  if (!me) return null;

  const unread = mails.filter((m) => !m.read).length;

  return (
    <div data-no-screen-joy role="dialog" aria-modal="true" className="absolute inset-0 z-40 flex items-center justify-center bg-black/65 backdrop-blur-sm py-16 px-4" onClick={() => setOpen(false)}>
      <div className="w-[26rem] max-w-[94vw] flex flex-col min-h-0" style={{ maxHeight: "calc(100vh - 8rem)" }} onClick={(e) => e.stopPropagation()}>
        <GameFrame
          title={`กล่องจดหมาย ${unread > 0 ? `· ${unread} ใหม่` : ""}`}
          className="flex flex-col min-h-0"
          innerClassName="flex flex-col flex-1 min-h-0"
        >
          <button onClick={() => setOpen(false)} className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-rose-700 hover:bg-rose-600 border-2 border-rose-300 text-white font-bold z-10">✕</button>

          <div className="flex gap-1 mb-2 flex-shrink-0">
            <button onClick={() => setMode("inbox")} className={`flex-1 py-1.5 text-xs font-bold rounded-lg border-2 ${mode === "inbox" ? "border-cyan-300 bg-cyan-500/30 text-white" : "border-slate-700 bg-slate-900/60 text-slate-300"}`}>📥 กล่องจดหมาย</button>
            <button onClick={() => setMode("send")} className={`flex-1 py-1.5 text-xs font-bold rounded-lg border-2 ${mode === "send" ? "border-cyan-300 bg-cyan-500/30 text-white" : "border-slate-700 bg-slate-900/60 text-slate-300"}`}>✏ เขียนใหม่</button>
          </div>

          {mode === "inbox" ? (
            <div className="overflow-y-auto game-scroll flex-1 pr-1 space-y-1.5">
              {mails.length === 0 && <div className="text-center text-slate-400 py-6 text-sm">ยังไม่มีจดหมาย</div>}
              {mails.map((m) => (
                <MailRow key={m.id} mail={m} room={room} />
              ))}
            </div>
          ) : (
            <ComposeMail room={room} me={me} onSent={() => { setMode("inbox"); }} />
          )}
        </GameFrame>
      </div>
    </div>
  );
}

function MailRow({ mail, room }: { mail: Mail; room: Room<WorldState> }) {
  const [expanded, setExpanded] = useState(false);
  const hasGift = mail.zeny > 0 || (mail.itemId && mail.itemQty > 0);
  const itemDef = mail.itemId ? ITEMS[mail.itemId] : null;
  return (
    <div className={`border-2 rounded-xl p-2 ${mail.read ? "border-slate-700 bg-slate-900/40" : "border-cyan-400 bg-cyan-500/15"}`}>
      <div
        className="flex items-center gap-2 cursor-pointer"
        onClick={() => {
          if (!expanded) room.send("readMail", { id: mail.id });
          setExpanded((e) => !e);
        }}
      >
        <span className="text-xl">{mail.claimed ? "📭" : hasGift ? "🎁" : (mail.read ? "📨" : "✉")}</span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-white truncate">{mail.subject}</div>
          <div className="text-[10px] text-slate-400 truncate">จาก {mail.fromName}</div>
        </div>
        {!mail.read && <span className="text-[9px] bg-rose-500 px-1.5 py-0.5 rounded text-white font-bold">ใหม่</span>}
      </div>
      {expanded && (
        <div className="mt-2 pt-2 border-t border-slate-600/50 space-y-2">
          {mail.body && <div className="text-xs text-slate-200 whitespace-pre-wrap">{mail.body}</div>}
          {hasGift && !mail.claimed && (
            <div className="bg-amber-900/30 border border-amber-400/40 rounded-lg p-2">
              <div className="text-[10px] text-amber-300 font-bold mb-1">🎁 ของแถม</div>
              <div className="flex items-center gap-2 text-sm">
                {mail.zeny > 0 && <span className="text-yellow-300">💰 {mail.zeny}z</span>}
                {itemDef && <span>{itemDef.icon} {itemDef.name} ×{mail.itemQty}</span>}
              </div>
              <button
                onClick={() => room.send("claimMail", { id: mail.id })}
                className="mt-2 w-full py-1 rounded-full bg-amber-500 hover:bg-amber-400 text-amber-900 font-bold text-xs"
              >📦 รับของ</button>
            </div>
          )}
          {mail.claimed && <div className="text-[10px] text-emerald-300">✓ รับของแล้ว</div>}
        </div>
      )}
    </div>
  );
}

function ComposeMail({ room, me, onSent }: { room: Room<WorldState>; me: Player; onSent: () => void }) {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [zeny, setZeny] = useState(0);
  const [itemIdx, setItemIdx] = useState<number>(-1);
  const [itemQty, setItemQty] = useState(1);

  function send() {
    if (!to.trim()) return;
    room.send("sendMail", { to: to.trim(), subject, body, zeny, itemInvIdx: itemIdx >= 0 ? itemIdx : undefined, itemQty });
    setTimeout(onSent, 200);
  }

  const items = Array.from(me.inventory.values());

  return (
    <div className="overflow-y-auto game-scroll flex-1 pr-1 space-y-2">
      <div>
        <div className="text-[10px] text-cyan-300 uppercase font-bold mb-1">ส่งถึง</div>
        <input value={to} onChange={(e) => setTo(e.target.value)} className="game-input" placeholder="ชื่อผู้รับ" />
      </div>
      <div>
        <div className="text-[10px] text-cyan-300 uppercase font-bold mb-1">หัวข้อ</div>
        <input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={60} className="game-input" placeholder="หัวข้อสั้นๆ" />
      </div>
      <div>
        <div className="text-[10px] text-cyan-300 uppercase font-bold mb-1">ข้อความ</div>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={500} rows={3} className="game-input resize-none" placeholder="พิมพ์ข้อความ..." />
      </div>
      <div>
        <div className="text-[10px] text-cyan-300 uppercase font-bold mb-1">แนบเงิน (zeny)</div>
        <input type="number" value={zeny} onChange={(e) => setZeny(Math.max(0, parseInt(e.target.value) || 0))} className="game-input" min={0} max={me.zeny} />
        <div className="text-[9px] text-slate-400">มีอยู่: {me.zeny}</div>
      </div>
      <div>
        <div className="text-[10px] text-cyan-300 uppercase font-bold mb-1">แนบของ</div>
        <select value={itemIdx} onChange={(e) => setItemIdx(parseInt(e.target.value))} className="game-input">
          <option value={-1}>— ไม่แนบ —</option>
          {items.map((s, i) => {
            const def = ITEMS[s.itemId];
            return <option key={i} value={i}>{def?.icon} {def?.name} ×{s.qty}</option>;
          })}
        </select>
        {itemIdx >= 0 && (
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[10px] text-slate-300">จำนวน:</span>
            <input type="number" value={itemQty} onChange={(e) => setItemQty(Math.max(1, parseInt(e.target.value) || 1))} className="game-input flex-1" min={1} max={items[itemIdx]?.qty ?? 1} />
          </div>
        )}
      </div>
      <button onClick={send} className="btn-game w-full">📬 ส่ง</button>
    </div>
  );
}

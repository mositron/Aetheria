import { useEffect, useState } from "react";
import FocusTrap from "focus-trap-react";
import { useStore } from "../store";
import { keyEq } from "../utils/keyMatch";
import { useTooltip } from "../hooks/useTooltip";
import { useT } from "../locales/useT";

/** Tiny icon row top-right (next to map/gold) — opens panels as overlays. */
export function MenuBar() {
  const t = useT();
  const toggleInv = useStore((s) => s.toggleInventory);
  const exitToSelect = useStore((s) => s.exitToSelect);
  const logout = useStore((s) => s.logout);
  const botMode = useStore((s) => s.botMode);

  // Mobile-style layout always (per user request — desktop uses same UI).
  const collapsed = true;

  // B key shortcut
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT" || (e.target as HTMLElement)?.tagName === "TEXTAREA") return;
      if (keyEq(e, "b")) useStore.setState({ botMode: !useStore.getState().botMode });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const [open, setOpen] = useState(false);

  // ── Mobile: burger stays at SAME anchor (right:8rem top:0.5rem) for both
  //    collapsed (☰) AND expanded (✕). Map (110px) sits to its right.
  //    Open: grid uses direction:rtl so ✕ lands at TOP-RIGHT (same spot as ☰).
  const ANCHOR = { top: "0.5rem", right: "8rem" };
if (collapsed) {
    if (!open) {
      return (
        <div className="absolute select-none touch-none z-30" style={ANCHOR} data-no-screen-joy>
          <IconBtn label="☰" title={t("menu.open")} onClick={() => setOpen(true)} ariaLabel={t("menu.open")} />
        </div>
      );
    }
    return (
      <FocusTrap focusTrapOptions={{ allowOutsideClick: true }}>
      <div
        className="absolute select-none touch-none grid grid-cols-5 gap-1 z-30"
        style={{ ...ANCHOR, direction: "rtl" }}
        data-no-screen-joy
      >
<IconBtn label="✕" title={t("menu.close")} onClick={() => setOpen(false)} variant="rose" ariaLabel={t("menu.close")} />
        <IconBtn label="📦" name={t("menu.inventory")} title="Inventory (I)" onClick={toggleInv} />
        <IconBtn label="🔨" name={t("menu.crafting")} title="Crafting (K)" onClick={() => window.dispatchEvent(new Event("toggle-craft"))} />
        <IconBtn label="📊" name={t("menu.status")} title="Stats (C)" onClick={() => window.dispatchEvent(new Event("toggle-stats"))} />
        <IconBtn label="📜" name={t("menu.quests")} title="Quest (Q)" onClick={() => window.dispatchEvent(new Event("toggle-quest"))} />
        <IconBtn label="🏅" name={t("menu.achievements")} title="Achievements" onClick={() => window.dispatchEvent(new Event("toggle-achievements"))} />
        <IconBtn label="🏆" name={t("menu.leaderboard")} title="Leaderboard" onClick={() => window.dispatchEvent(new Event("toggle-leaderboard"))} />
        <IconBtn label="📬" name={t("menu.mail")} title="Mailbox" onClick={() => window.dispatchEvent(new Event("toggle-mail"))} />
        <IconBtn label="🐾" name={t("menu.pets")} title="Pets" onClick={() => window.dispatchEvent(new Event("toggle-pets"))} />
        <IconBtn label="👥" name={t("menu.party")} title="Party" onClick={() => window.dispatchEvent(new Event("toggle-party"))} />
        <IconBtn label="🤝" name={t("menu.friends")} title="Friends" onClick={() => window.dispatchEvent(new Event("toggle-friends"))} />
        <IconBtn label="🟢" name={t("menu.online") || "Online"} title="Online players" onClick={() => window.dispatchEvent(new Event("toggle-online"))} />
        <IconBtn label="⚔" name={t("menu.guild")} title="Guild" onClick={() => window.dispatchEvent(new Event("toggle-guild"))} />
        <IconBtn label="🏛" name={t("menu.auction")} title="Auction House" onClick={() => window.dispatchEvent(new Event("toggle-auction"))} />
        <IconBtn label="🌍" name={t("menu.worlds")} title={t("world.title")} onClick={() => window.dispatchEvent(new Event("toggle-worlds"))} />
        <IconBtn label="📍" name={t("menu.waypoints")} title="Waypoints" onClick={() => window.dispatchEvent(new Event("toggle-waypoints"))} />
        <IconBtn label="💬" name={t("menu.chat")} title="Chat (Enter)" onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }))} />
<IconBtn label="😊" name={t("menu.emote")} title="Emote (T)" onClick={() => window.dispatchEvent(new Event("toggle-emote"))} />
        <IconBtn label="💍" name={t("menu.marriage")} title={t("marriage.title")} onClick={() => window.dispatchEvent(new Event("toggle-marriage"))} />
        <IconBtn label="📸" name={t("menu.photo")} title="Photo (P)" onClick={() => window.dispatchEvent(new Event("toggle-photo"))} />
        <IconBtn label="⚙" name={t("menu.settings")} title="Settings" onClick={() => window.dispatchEvent(new Event("toggle-settings"))} />
<IconBtn label="👤" name={t("menu.character")} title={t("charsel.title")} onClick={exitToSelect} variant="violet" ariaLabel={t("menu.character")} />
        <IconBtn label="⏻" name={t("menu.logout")} title={t("menu.logout")} onClick={logout} variant="rose" ariaLabel={t("menu.logout")} />
      </div>
      </FocusTrap>
    );
  }

// Desktop: always-shown grid on the right (original layout)
  return (
    <div className="absolute right-3 grid grid-cols-3 gap-1 select-none touch-none" style={{ bottom: "12rem" }} data-no-screen-joy>
      <IconBtn label="📦" name={t("menu.inventory")} title="Inventory (I)" onClick={toggleInv} />
      <IconBtn label="🔨" name={t("menu.crafting")} title="Crafting (K)" onClick={() => window.dispatchEvent(new Event("toggle-craft"))} />
      <IconBtn label="📊" name={t("menu.status")} title="Stats (C)" onClick={() => window.dispatchEvent(new Event("toggle-stats"))} />
      <IconBtn label="📜" name={t("menu.quests")} title="Quest (Q)" onClick={() => window.dispatchEvent(new Event("toggle-quest"))} />
      <IconBtn label="🏅" name={t("menu.achievements")} title="Achievements" onClick={() => window.dispatchEvent(new Event("toggle-achievements"))} />
      <IconBtn label="🏆" name={t("menu.leaderboard")} title="Leaderboard" onClick={() => window.dispatchEvent(new Event("toggle-leaderboard"))} />
      <IconBtn label="📬" name={t("menu.mail")} title="Mailbox" onClick={() => window.dispatchEvent(new Event("toggle-mail"))} />
      <IconBtn label="🐾" name={t("menu.pets")} title="Pets" onClick={() => window.dispatchEvent(new Event("toggle-pets"))} />
      <IconBtn label="👥" name={t("menu.party")} title="Party" onClick={() => window.dispatchEvent(new Event("toggle-party"))} />
      <IconBtn label="💬" name={t("menu.chat")} title="Chat (Enter)" onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }))} />
<IconBtn label="😊" name={t("menu.emote")} title="Emote (T)" onClick={() => window.dispatchEvent(new Event("toggle-emote"))} />
      <IconBtn label="💍" name={t("menu.marriage")} title={t("marriage.title")} onClick={() => window.dispatchEvent(new Event("toggle-marriage"))} />
      <IconBtn label="📸" name={t("menu.photo")} title="Photo (P)" onClick={() => window.dispatchEvent(new Event("toggle-photo"))} />
      <IconBtn label="⚙" name={t("menu.settings")} title="Settings" onClick={() => window.dispatchEvent(new Event("toggle-settings"))} />
      <IconBtn label="👤" name={t("menu.character")} title={t("charsel.title")} onClick={exitToSelect} variant="violet" />
      <IconBtn label="⏻" name={t("menu.logout")} title={t("menu.logout")} onClick={logout} variant="rose" />
    </div>
  );
}

function IconBtn({ label, name, title, onClick, variant, active, ariaLabel }: { label: string; name?: string; title: string; onClick: () => void; variant?: "violet" | "rose" | "emerald"; active?: boolean; ariaLabel?: string }) {
  const { tooltip, handlers } = useTooltip(title);
  // More-transparent background (text stays opaque because we lower the bg alpha
  // rather than setting opacity on the whole button).
  const palette: Record<string, { bg: string }> = {
    rose:     { bg: "linear-gradient(180deg, rgba(225, 29, 72, 0.28), rgba(159, 18, 57, 0.38))" },
    violet:   { bg: "linear-gradient(180deg, rgba(124, 58, 237, 0.28), rgba(76, 29, 149, 0.38))" },
    emerald:  { bg: "rgba(16, 185, 129, 0.15)" },
    default:  { bg: "linear-gradient(180deg, rgba(15, 23, 42, 0.32), rgba(2, 6, 23, 0.42))" },
  };
  const p = palette[variant ?? "default"];
  return (
    <>
      <button
        {...handlers}
        onClick={onClick}
        onTouchStart={(e) => { e.preventDefault(); onClick(); }}
        title={title}
        aria-label={ariaLabel || title}
        className={`mobile-icon-btn relative w-12 h-12 flex flex-col items-center justify-center backdrop-blur-md active:scale-90 transition ${active ? "ring-2 ring-emerald-400/60" : ""}`}
        style={{
          background: active ? "rgba(16, 185, 129, 0.2)" : p.bg,
          border: "none",
          borderRadius: 7,
          boxShadow: "0 1px 3px rgba(0,0,0,0.28), 0 1px 1px rgba(0,0,0,0.32)",
        }}
      >
        <span className={`text-base leading-none ${active ? "animate-pulse" : ""}`}>{label}</span>
        {name && <span className="text-[8px] text-white/85 font-bold leading-tight mt-0.5 tracking-tighter">{name}</span>}
        {active && <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-[8px] text-emerald-300 font-bold tracking-widest">ON</span>}
      </button>
      {tooltip.visible && (
        <div
          className="fixed z-[9999] pointer-events-none px-2 py-1 rounded bg-slate-800 border border-cyan-400/40 text-cyan-100 text-xs whitespace-nowrap shadow-lg"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          {tooltip.content}
        </div>
      )}
    </>
  );
}

import { useEffect, useState } from "react";
import FocusTrap from "focus-trap-react";
import { useStore } from "../store";
import { keyEq } from "../utils/keyMatch";
import { useTooltip } from "../hooks/useTooltip";
import { useT } from "../locales/useT";
import { KeybindLegend } from "./KeybindLegend";

/** Tiny icon row top-right (next to map/gold) — opens panels as overlays. */
export function MenuBar() {
  const t = useT();
  const toggleInv = useStore((s) => s.toggleInventory);
  const exitToSelect = useStore((s) => s.exitToSelect);
  const logout = useStore((s) => s.logout);
  const botMode = useStore((s) => s.botMode);
  const mailUnread = useStore((s) => s.mailUnread);

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
  const [showMore, setShowMore] = useState(false);
  const [showKeys, setShowKeys] = useState(false);
  function closeMenu() { setOpen(false); setShowMore(false); }
  // Burger menu is also a modal — listen for any other modal opening and close ourselves.
  useEffect(() => {
    const onOpened = (e: Event) => {
      const detail = (e as CustomEvent<{ id: string }>).detail;
      // Close burger when ANY other modal opens (we don't have our own panel id).
      if (detail?.id && open) setOpen(false);
    };
    window.addEventListener("modal-opened", onOpened);
    return () => window.removeEventListener("modal-opened", onOpened);
  }, [open]);

  // ── Mobile: burger stays at SAME anchor (right:8rem top:0.5rem) for both
  //    collapsed (☰) AND expanded (✕). Map (110px) sits to its right.
  //    Open: grid uses direction:rtl so ✕ lands at TOP-RIGHT (same spot as ☰).
  const ANCHOR = { top: "0.5rem", right: "8rem" };
if (collapsed) {
    if (!open) {
      return (
        <div className="absolute select-none touch-none z-30" style={ANCHOR} data-no-screen-joy data-tutorial-target="menu-open">
          <IconBtn label="☰" title={t("menu.open")} onClick={() => setOpen(true)} ariaLabel={t("menu.open")} />
        </div>
      );
    }
    return (
      <>
      <FocusTrap focusTrapOptions={{ allowOutsideClick: true }}>
      <div
        role="dialog"
        aria-modal="true"
        className="absolute inset-0 z-40 select-none flex items-start justify-center bg-black/55 backdrop-blur-sm"
        style={{
          paddingTop: "var(--side-panel-top)",
          paddingBottom: "calc(var(--bottom-safe) + 0.5rem)",
          paddingLeft: "var(--hud-side)",
          paddingRight: "var(--hud-side)",
        }}
        onClick={(e) => { if (e.target === e.currentTarget) closeMenu(); }}
        data-no-screen-joy
      >
      <div
        className="touch-none"
        style={{ width: "min(420px, 96vw)", maxHeight: "100%", overflowY: "auto" }}
      >
        {/* Core row — the handful of actions a new player reaches for most;
            always visible so the first glance isn't 23 buttons at once. */}
        <div className="grid grid-cols-5 gap-1 mb-1.5">
          <IconBtn label="✕" title={t("menu.close")} onClick={closeMenu} variant="rose" ariaLabel={t("menu.close")} />
          <IconBtn label="📦" name={t("menu.inventory")} title="Inventory (I)" onClick={toggleInv} />
          <IconBtn label="📜" name={t("menu.quests")} title="Quest (Q)" onClick={() => window.dispatchEvent(new Event("toggle-quest"))} />
          <IconBtn label="🗺" name={t("menu.worldMap") || "Map"} title="World Map (M)" onClick={() => window.dispatchEvent(new Event("toggle-world-map"))} />
          <IconBtn label="⚙" name={t("menu.settings")} title="Settings" onClick={() => window.dispatchEvent(new Event("toggle-settings"))} />
        </div>
        <div className="grid grid-cols-2 gap-1 mb-1.5">
          <IconBtn label="❓" name={t("keybinds.title")} title={t("keybinds.title")} onClick={() => setShowKeys(true)} />
          <IconBtn label={showMore ? "▲" : "▼"} name={t(showMore ? "menu.less" : "menu.more")} title={t(showMore ? "menu.less" : "menu.more")} onClick={() => setShowMore((v) => !v)} />
        </div>
        {showMore && (
        <div className="grid grid-cols-5 gap-1">
          <IconBtn label="🔨" name={t("menu.crafting")} title="Crafting (K)" onClick={() => window.dispatchEvent(new Event("toggle-craft"))} />
          <IconBtn label="📊" name={t("menu.status")} title="Stats (C)" onClick={() => window.dispatchEvent(new Event("toggle-stats"))} />
          <IconBtn label="🏅" name={t("menu.achievements")} title="Achievements" onClick={() => window.dispatchEvent(new Event("toggle-achievements"))} />
          <IconBtn label="🏆" name={t("menu.leaderboard")} title="Leaderboard" onClick={() => window.dispatchEvent(new Event("toggle-leaderboard"))} />
          <IconBtn label="📬" name={t("menu.mail")} title="Mailbox" badge={mailUnread} onClick={() => window.dispatchEvent(new Event("toggle-mail"))} />
          <IconBtn label="🐾" name={t("menu.pets")} title="Pets" onClick={() => window.dispatchEvent(new Event("toggle-pets"))} />
          <IconBtn label="👥" name={t("menu.party")} title="Party" onClick={() => window.dispatchEvent(new Event("toggle-party"))} />
          <IconBtn label="🤝" name={t("menu.friends")} title="Friends" onClick={() => window.dispatchEvent(new Event("toggle-friends"))} />
          <IconBtn label="🟢" name={t("menu.online") || "Online"} title="Online players" onClick={() => window.dispatchEvent(new Event("toggle-online"))} />
          <IconBtn label="⚔" name={t("menu.combatLog") || "Log"} title="Combat log" onClick={() => window.dispatchEvent(new Event("toggle-combat-log"))} />
          <IconBtn label="⚔" name={t("menu.guild")} title="Guild" onClick={() => window.dispatchEvent(new Event("toggle-guild"))} />
          <IconBtn label="🏛" name={t("menu.auction")} title="Auction House" onClick={() => window.dispatchEvent(new Event("toggle-auction"))} />
          <IconBtn label="🌍" name={t("menu.worlds")} title={t("world.title")} onClick={() => window.dispatchEvent(new Event("toggle-worlds"))} />
          <IconBtn label="📍" name={t("menu.waypoints")} title="Waypoints" onClick={() => window.dispatchEvent(new Event("toggle-waypoints"))} />
          <IconBtn label="💬" name={t("menu.chat")} title="Chat (Enter)" onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }))} />
          <IconBtn label="😊" name={t("menu.emote")} title="Emote (T)" onClick={() => window.dispatchEvent(new Event("toggle-emote"))} />
          <IconBtn label="💍" name={t("menu.marriage")} title={t("marriage.title")} onClick={() => window.dispatchEvent(new Event("toggle-marriage"))} />
          <IconBtn label="📸" name={t("menu.photo")} title="Photo (P)" onClick={() => window.dispatchEvent(new Event("toggle-photo"))} />
          <IconBtn label="👤" name={t("menu.character")} title={t("charsel.title")} onClick={exitToSelect} variant="violet" ariaLabel={t("menu.character")} />
          <IconBtn label="⏻" name={t("menu.logout")} title={t("menu.logout")} onClick={logout} variant="rose" ariaLabel={t("menu.logout")} />
        </div>
        )}
      </div>
      </div>
      </FocusTrap>
      {showKeys && <KeybindLegend onClose={() => setShowKeys(false)} />}
      </>
    );
  }
}

function IconBtn({ label, name, title, onClick, variant, active, ariaLabel, badge }: { label: string; name?: string; title: string; onClick: () => void; variant?: "violet" | "rose" | "emerald"; active?: boolean; ariaLabel?: string; badge?: number }) {
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
        {!!badge && badge > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center border border-rose-200 shadow-md">
            {badge > 9 ? "9+" : badge}
          </span>
        )}
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

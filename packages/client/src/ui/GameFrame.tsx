import type { CSSProperties, ReactNode } from "react";

type Props = {
  title?: string;
  variant?: "cyan" | "violet" | "gold";
  className?: string;
  /** Extra classes for the inner content wrapper (use for flex layouts). */
  innerClassName?: string;
  style?: CSSProperties;
  children: ReactNode;
};

/**
 * Themed window frame — chiseled stone border, corner gems, runic studs,
 * hanging banner with title. Use instead of plain divs for menu panels.
 */
export function GameFrame({ title, variant = "cyan", className = "", innerClassName = "", style, children }: Props) {
  return (
    <div className={`game-frame ${variant === "violet" ? "violet" : ""} ${className}`} style={style}>
      {title && <div className="frame-banner">{title}</div>}
      <span className="frame-corner tl" />
      <span className="frame-corner tr" />
      <span className="frame-corner bl" />
      <span className="frame-corner br" />
      <span className="frame-rivets" />
      <span className="frame-foot" />
      <div className={`relative z-[1] ${innerClassName}`}>{children}</div>
    </div>
  );
}

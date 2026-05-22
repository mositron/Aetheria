/**
 * Procedural sprite drawing utilities for the 2D top-down view.
 * All sprites are drawn with Canvas 2D API — no external images.
 */

/** 4 cardinal directions for sprite facing */
export type Direction = "down" | "up" | "left" | "right";

/** Base unit for pixel-art sprites */
export const TILE = 32;

const DIRS: Direction[] = ["down", "up", "left", "right"];

/**
 * Draw a humanoid character sprite facing `direction` with optional walk animation frame.
 * `animFrame` 0 = idle / standing, 1 = walk-step.
 * Body is a rounded rectangle, head is a circle, limbs shift with animation.
 */
export function drawCharacter(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  direction: Direction,
  animFrame: 0 | 1,
  color: string,
  scale = 1
): void {
  const s = TILE * scale;
  const cx = x;
  const cy = y;

  ctx.save();
  ctx.translate(cx, cy);

  // body
  const bw = s * 0.5;
  const bh = s * 0.45;
  const bx = -bw / 2;
  const by = -bh * 0.15;

  // shadow
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.beginPath();
  ctx.ellipse(0, bh * 0.5 + s * 0.05, bw * 0.6, s * 0.06, 0, 0, Math.PI * 2);
  ctx.fill();

  // torso
  ctx.fillStyle = color;
  roundRect(ctx, bx, by, bw, bh, 4);

  // head
  const hw = s * 0.28;
  const hh = s * 0.28;
  let hx = -hw / 2;
  let hy = -bh * 0.15 - hh - 2;

  if (direction === "up") {
    // hide face when going up — show back of head
    ctx.fillStyle = shadeColor(color, -20);
  } else {
    ctx.fillStyle = shadeColor(color, 20);
  }
  ctx.beginPath();
  ctx.arc(hx + hw / 2, hy + hh / 2, hw / 2, 0, Math.PI * 2);
  ctx.fill();

  // eyes on front-facing
  if (direction === "down" || direction === "left" || direction === "right") {
    const eyeY = hy + hh * 0.45;
    ctx.fillStyle = "#fff";
    if (direction === "left" || direction === "right") {
      // side face — one eye
      const ex = direction === "right" ? hx + hw * 0.65 : hx + hw * 0.25;
      ctx.beginPath();
      ctx.arc(ex, eyeY, hw * 0.12, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(hx + hw * 0.35, eyeY, hw * 0.12, 0, Math.PI * 2);
      ctx.arc(hx + hw * 0.65, eyeY, hw * 0.12, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // limbs — animate based on direction + walk frame
  const legSwing = animFrame === 1 ? s * 0.12 : 0;
  ctx.fillStyle = shadeColor(color, -30);

  const lx = bx + bw * 0.15;
  const rx = bx + bw * 0.65;
  const ly = by + bh - 2;
  const lh = s * 0.3;

  // left leg
  ctx.beginPath();
  ctx.roundRect(lx - (direction === "left" ? legSwing : direction === "right" ? -legSwing : 0), ly, bw * 0.28, lh, 3);
  ctx.fill();
  // right leg
  ctx.beginPath();
  ctx.roundRect(rx + (direction === "left" ? legSwing : direction === "right" ? -legSwing : 0), ly, bw * 0.28, lh, 3);
  ctx.fill();

  // arms
  const armW = bw * 0.2;
  const armH = bh * 0.55;
  const ay = by + bh * 0.05;
  const armSwing = animFrame === 1 ? s * 0.06 : 0;
  const leftArmDir = direction === "right" ? 1 : -1;
  const rightArmDir = direction === "left" ? -1 : 1;

  ctx.fillStyle = shadeColor(color, -15);
  ctx.beginPath();
  ctx.roundRect(bx - armW - 2, ay + leftArmDir * armSwing, armW, armH, 3);
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(bx + bw + 2, ay + rightArmDir * armSwing, armW, armH, 3);
  ctx.fill();

  ctx.restore();
}

/**
 * Draw a monster sprite based on `type` (simple color-coded shapes).
 */
export function drawMonster(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  type: number,
  animFrame: 0 | 1,
  scale = 1
): void {
  const s = TILE * scale;
  const cx = x;
  const cy = y;

  // Monster color based on type (index into palette)
  const palette = ["#8b0000", "#4b0082", "#006400", "#8b4513", "#2f4f4f", "#4a4a8a"];
  const color = palette[type % palette.length];

  ctx.save();
  ctx.translate(cx, cy);

  // shadow
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.beginPath();
  ctx.ellipse(0, s * 0.42, s * 0.35, s * 0.07, 0, 0, Math.PI * 2);
  ctx.fill();

  // body bounce for animation
  const bounce = animFrame === 1 ? -s * 0.04 : 0;
  ctx.translate(0, bounce);

  // Different monster shapes by type mod 4
  const shape = type % 4;
  if (shape === 0) {
    // blob
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(0, s * 0.1, s * 0.38, s * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    // eyes
    ctx.fillStyle = "#ff0";
    ctx.beginPath();
    ctx.arc(-s * 0.15, s * 0.02, s * 0.07, 0, Math.PI * 2);
    ctx.arc(s * 0.15, s * 0.02, s * 0.07, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.arc(-s * 0.15, s * 0.02, s * 0.035, 0, Math.PI * 2);
    ctx.arc(s * 0.15, s * 0.02, s * 0.035, 0, Math.PI * 2);
    ctx.fill();
  } else if (shape === 1) {
    // snake/serpent — elongated
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 0.25, s * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ff0";
    ctx.beginPath();
    ctx.arc(0, -s * 0.22, s * 0.08, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.arc(0, -s * 0.22, s * 0.04, 0, Math.PI * 2);
    ctx.fill();
  } else if (shape === 2) {
    // four-legged beast
    ctx.fillStyle = color;
    roundRect(ctx, -s * 0.35, -s * 0.2, s * 0.7, s * 0.45, 6);
    ctx.fill();
    // head
    ctx.beginPath();
    ctx.arc(0, -s * 0.3, s * 0.2, 0, Math.PI * 2);
    ctx.fill();
    // eyes
    ctx.fillStyle = "#f00";
    ctx.beginPath();
    ctx.arc(-s * 0.09, -s * 0.33, s * 0.05, 0, Math.PI * 2);
    ctx.arc(s * 0.09, -s * 0.33, s * 0.05, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // insect — wide flat
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(0, s * 0.05, s * 0.45, s * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
    // legs
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(i * s * 0.18, s * 0.2);
      ctx.lineTo(i * s * 0.28, s * 0.4);
      ctx.stroke();
    }
    // eyes
    ctx.fillStyle = "#f0f";
    ctx.beginPath();
    ctx.arc(-s * 0.2, -s * 0.05, s * 0.06, 0, Math.PI * 2);
    ctx.arc(s * 0.2, -s * 0.05, s * 0.06, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

/**
 * Draw a ground tile with `color` and optional `variant` (0-3) pattern.
 * Tiles are 32×32 world units.
 */
export function drawTile(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  variant: number,
  size = TILE
): void {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, size, size);

  // subtle grid lines
  ctx.strokeStyle = shadeColor(color, -15);
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);

  // random dots for texture based on variant
  ctx.fillStyle = shadeColor(color, 10);
  const seed = variant;
  const dotPositions = [
    [0.2, 0.3], [0.7, 0.2], [0.5, 0.6], [0.15, 0.7], [0.8, 0.65],
    [0.4, 0.15], [0.6, 0.8], [0.25, 0.5],
  ];
  const count = (seed % 4) + 2;
  for (let i = 0; i < count; i++) {
    const [px, py] = dotPositions[(seed + i) % dotPositions.length];
    ctx.beginPath();
    ctx.arc(x + px * size, y + py * size, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Draw an entity name label above the sprite.
 */
export function drawName(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  name: string,
  isPlayer: boolean,
  scale = 1
): void {
  const s = TILE * scale;
  ctx.save();
  ctx.font = `bold ${Math.round(s * 0.28)}px monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";

  const label = name.length > 10 ? name.slice(0, 9) + "…" : name;
  const tw = ctx.measureText(label).width;
  const tx = x - tw / 2;
  const ty = y - s * 0.55;

  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(tx - 2, ty - 1, tw + 4, s * 0.3 + 2);

  ctx.fillStyle = isPlayer ? "#60a5fa" : "#f87171";
  ctx.fillText(label, x, ty);
  ctx.restore();
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();
}

function shadeColor(hex: string, amount: number): string {
  // Simple luminance shift for canvas colors
  // Parse #rrggbb
  const m = hex.match(/^#?([a-f0-9]{2})([a-f0-9]{2})([a-f0-9]{2})$/i);
  if (!m) return hex;
  const r = Math.max(0, Math.min(255, parseInt(m[1], 16) + amount));
  const g = Math.max(0, Math.min(255, parseInt(m[2], 16) + amount));
  const b = Math.max(0, Math.min(255, parseInt(m[3], 16) + amount));
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}
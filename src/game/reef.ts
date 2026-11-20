// ============================================================================
// 16-BIT PIXEL-ART REEF BIOTA
// Every coral / sea creature is generated procedurally as a small pixel sprite
// with an 8-frame animation loop (polyps feeding, tentacles waving, fans swaying,
// crystals glinting, clams breathing ...). Shy animals also get "retract" frames.
// ============================================================================
import { Pix, C, P, rng, sway, hash2, bayer } from "./pixel";
import type { Rnd } from "./pixel";

export const NF = 8;
const TAU = Math.PI * 2;
type Pal = number[]; // [outline, shadow, base, light, highlight]

export const PAL = {
  coral: P("#3b0d24", "#9c2440", "#e4524e", "#ff8f66", "#ffd9a8"),
  pink: P("#40103e", "#a02c7c", "#e860a8", "#ff9fd0", "#ffe2f2"),
  orange: P("#4a1c0a", "#b4501c", "#f08a28", "#ffc04e", "#fff2a8"),
  yellow: P("#4a3608", "#a8841c", "#e8c234", "#ffe870", "#fffcc8"),
  purple: P("#221048", "#56309c", "#8a5cd8", "#b698f6", "#e8dcff"),
  teal: P("#06323c", "#127870", "#2cb8a0", "#72e8c8", "#d4fff2"),
  blue: P("#0c1f58", "#2250ac", "#3e8ae4", "#78c4ff", "#d6f2ff"),
  green: P("#0a3020", "#1e7438", "#44b450", "#8ee070", "#e2ffb0"),
  lime: P("#1c3408", "#4c8414", "#8cc828", "#c8f060", "#f4ffc0"),
  bone: P("#2c3858", "#7c8cb0", "#c4d0e8", "#eef4ff", "#ffffff"),
  magenta: P("#30083e", "#84189a", "#d044d4", "#f690f2", "#ffdcff"),
  cyan: P("#052c44", "#0c7aa0", "#24c8e2", "#8cf4ff", "#eaffff"),
  red: P("#3a0810", "#981820", "#e03830", "#ff7858", "#ffd0b0"),
  kelp: P("#06281c", "#126044", "#249868", "#58cc88", "#b4f0a8"),
  olive: P("#1c2a08", "#48601c", "#7c9830", "#b4cc58", "#e8f4a0"),
  indigo: P("#0e0c3a", "#2a2888", "#5450d0", "#8c8cf8", "#d8dcff"),
  dark: P("#06040e", "#1a1230", "#3c2a5c", "#7a5aa8", "#c8b0f0"),
  gold: P("#3c2204", "#946010", "#e0a020", "#ffd84a", "#fff8c0"),
  wood: P("#200e04", "#4c2410", "#7c4420", "#a86832", "#d09858"),
  basalt: P("#05050f", "#11112a", "#1e1e44", "#30305e", "#4a4a84"),
  ember: P("#3a0a04", "#a02808", "#ff5a1c", "#ffa030", "#ffe070"),
  // Saturated, glowing high-contrast foreground palettes
  fireOrange: P("#260600", "#901c02", "#ff4600", "#ffa228", "#fff4a4"),
  sunGold: P("#281000", "#843a02", "#f29210", "#ffd43c", "#fffaac"),
  royalViolet: P("#20042e", "#5e0680", "#b022d4", "#ee6af4", "#ffdeff"),
};

export interface Bio {
  f: HTMLCanvasElement[]; // animation loop
  shy?: HTMLCanvasElement[]; // [half retracted, fully retracted]
  f2d?: HTMLCanvasElement[]; // 2D clean vector-painted frames
  shy2d?: HTMLCanvasElement[]; // 2D clean retracted frames
  f3d?: HTMLCanvasElement[]; // 3D Three.js rendered frames
  shy3d?: HTMLCanvasElement[]; // 3D Three.js retracted frames
  anim?: "sway" | "pulse" | "frames" | "shimmer";
  w: number;
  h: number;
  foot: number; // half-width of the holdfast that must sit on solid ground
  fps: number;
  mode: number; // 0 rooted on ground · 1 hanging from a ceiling · 2 bracket on a wall
  glow?: string;
  gy?: number; // glow centre (fraction of sprite height above the base)
}
export type BioSet = Record<string, Bio[]>;

function twinkle(p: Pix, r: Rnd, ph: number, n: number, c: number, every = 4) {
  const fr = Math.floor(ph * NF);
  for (let i = 0; i < n; i++) {
    const x = (r() * p.w) | 0,
      y = (r() * p.h) | 0;
    if (p.get(x, y) && (i + fr) % every === 0) p.set(x, y, c);
  }
}

// ---------------------------------------------------------------- Staghorn / branching Acropora
export function genBranch(seed: number, pal: Pal, ph: number, w: number, h: number, len: number, th: number, depth: number, knob = false): Pix {
  const r = rng(seed),
    p = new Pix(w, h),
    cx = w >> 1,
    by = h - 1;
  const tips: number[] = [];
  const grow = (x: number, y: number, a: number, l: number, t: number, d: number) => {
    const x2 = x + Math.cos(a) * l,
      y2 = y + Math.sin(a) * l;
    p.line(x, y, x2, y2, pal[2], t);
    if (d > 0 && l > 4) {
      const n = d >= 2 && r() < 0.4 ? 3 : 2;
      for (let i = 0; i < n; i++) {
        const sp = n === 3 ? (i - 1) * (0.5 + r() * 0.2) : (i ? 1 : -1) * (0.3 + r() * 0.3);
        const na = Math.max(-Math.PI + 0.3, Math.min(-0.3, a + sp));
        grow(x2, y2, na, l * (0.62 + r() * 0.2), Math.max(1, t - 0.9), d - 1);
      }
    } else tips.push(x2, y2);
  };
  p.ell(cx, by - 1, th + 2.5, 2, pal[2]);
  const trunks = 1 + (r() < 0.65 ? 1 : 0);
  for (let i = 0; i < trunks; i++) {
    const o = i - (trunks - 1) / 2;
    grow(cx + o * 5, by - 2, -Math.PI / 2 + (r() - 0.5) * 0.5 + o * 0.5, len * (0.85 + r() * 0.3), th, depth);
  }
  p.bevel(pal[2], pal[3], pal[1]);
  twinkle(p, r, ph, 14, pal[4]);
  const fr = Math.floor(ph * NF);
  for (let i = 0; i < tips.length; i += 2) {
    const tx = tips[i],
      ty = tips[i + 1],
      k = (fr + i * 3) % NF;
    if (knob) p.disc(tx, ty, 1.3, pal[3]);
    p.set(tx, ty, pal[4]);
    // feeding polyp waving at every growth tip
    p.set(tx + (k < 3 ? -1 : k < 5 ? 0 : 1), ty - 1, k & 1 ? pal[4] : pal[3]);
  }
  p.outline(pal[0]);
  return p;
}

// ---------------------------------------------------------------- Table coral (Acropora hyacinthus)
export function genTable(seed: number, pal: Pal, ph: number, w: number, h: number): Pix {
  const r = rng(seed),
    p = new Pix(w, h),
    cx = w >> 1,
    by = h - 1,
    fr = Math.floor(ph * NF);
  const tiers = r() < 0.5 ? 2 : 1;
  let sy = by,
    ox = 0,
    R = (w >> 1) - 3;
  for (let t = 0; t < tiers; t++) {
    const sh = 6 + ((r() * 5) | 0);
    for (let i = 0; i <= sh; i++) {
      const hw = Math.round(2 + (i < 2 ? 2 - i : 0) + Math.max(0, i - (sh - 4)) * 1.7);
      for (let x = -hw; x <= hw; x++) p.set(cx + ox + x, sy - i, x < -hw * 0.3 ? pal[2] : pal[1]);
    }
    const py = sy - sh - 1;
    p.ell(cx + ox, py + 1, R, 2.6, pal[1]);
    p.ell(cx + ox, py, R, 2.2, pal[2]);
    const band = ph * (2 * R + 14) - 7;
    for (let x = -R + 1; x <= R - 1; x++) {
      const hh = Math.round(1.7 * Math.sqrt(1 - (x / R) ** 2));
      for (let y = -hh; y <= 0; y++) {
        const X = cx + ox + x,
          Y = py - 1 + y;
        let c = hash2(X, Y, seed) < 0.22 ? pal[4] : pal[3];
        if (Math.abs(x + R - band) < 2.5) c = pal[4]; // sun caustic sliding across the plate
        p.set(X, Y, c);
      }
      if ((x + 300) % 3 === 0 && ((x + 300 + fr) & 3) < 2) p.set(cx + ox + x, py - 2 - hh, pal[4]); // rim polyps
    }
    sy = py - 2;
    ox = Math.round((r() - 0.5) * R * 0.7);
    R = Math.round(R * (0.55 + r() * 0.12));
  }
  p.outline(pal[0]);
  return p;
}

// ---------------------------------------------------------------- Brain coral (maze grooves)
export function genBrain(seed: number, pal: Pal, ph: number, w: number, h: number): Pix {
  const r = rng(seed),
    p = new Pix(w, h),
    cx = w / 2 - 0.5,
    by = h - 1,
    R = w / 2 - 2,
    H = h - 3;
  const k1 = 0.75 + r() * 0.4,
    k2 = 0.75 + r() * 0.4,
    o1 = r() * 9,
    o2 = r() * 9,
    fr = Math.floor(ph * NF);
  const sweep = ph * (w + h + 12) - 6;
  for (let y = 0; y <= by; y++)
    for (let x = 0; x < w; x++) {
      const nx = (x - cx) / R,
        ny = (y - by) / H;
      if (nx * nx + ny * ny > 1) continue;
      const g = Math.sin(x * k1 + Math.sin(y * 0.9 + o1) * 1.7 + o2) * Math.cos(y * k2 + Math.sin(x * 0.8 + o2) * 1.5 + o1);
      const l = 0.55 - nx * 0.4 - (ny + 0.55) * 0.75;
      const groove = Math.abs(g) < 0.2;
      let ci = groove ? (l > 0.5 ? 2 : 1) : l > 0.72 ? 4 : l > 0.3 ? 3 : 2;
      if (!groove && Math.abs(x + y - sweep) < 2) ci = 4;
      if (groove && hash2(x, y, fr >> 1) < 0.1) ci = 3;
      p.set(x, y, pal[ci]);
    }
  p.outline(pal[0]);
  return p;
}

// ---------------------------------------------------------------- Pillar coral with fuzzy day-feeding polyps
export function genPillar(seed: number, pal: Pal, ph: number, w: number, h: number): Pix {
  const r = rng(seed),
    p = new Pix(w, h),
    by = h - 1,
    fr = Math.floor(ph * NF);
  const n = 3 + ((r() * 3) | 0);
  p.rect(3, by - 1, w - 6, 2, pal[1]);
  for (let i = 0; i < n; i++) {
    const f = n > 1 ? i / (n - 1) : 0.5;
    const px = Math.round(5 + f * (w - 11) + (r() - 0.5) * 2),
      wd = 2 + ((r() * 2) | 0);
    const ht = Math.round((h - 5) * (0.42 + (1 - Math.abs(f - 0.5) * 1.6) * 0.45 + r() * 0.13));
    for (let j = 0; j <= ht; j++) {
      const y = by - j,
        hw = Math.max(0, j > ht - 2 ? wd - (j - (ht - 2)) : wd);
      for (let x = -hw; x <= hw; x++) p.set(px + x, y, x === -hw ? pal[3] : x === hw && hw > 0 ? pal[1] : pal[2]);
      if (j > 1 && j < ht - 1) {
        if ((j + fr + i) % 3 === 0) p.set(px - hw - 1, y, pal[3]);
        if ((j + fr + i + 1) % 3 === 0) p.set(px + hw + 1, y, pal[2]);
      }
      if (j > 2 && j < ht - 2 && hash2(px, j, seed) < 0.25) p.set(px, y, pal[3]);
    }
    p.set(px - 1, by - ht, pal[4]);
    p.set(px, by - ht, pal[4]);
  }
  p.outline(pal[0]);
  return p;
}

// ---------------------------------------------------------------- Lettuce / cabbage coral (nested ruffled plates)
function genLettuce(seed: number, pal: Pal, ph: number, w: number, h: number): Pix {
  const r = rng(seed),
    p = new Pix(w, h),
    cx = w >> 1,
    by = h - 1,
    fr = Math.floor(ph * NF);
  const layers = 4 + ((r() * 2) | 0);
  for (let i = 0; i < layers; i++) {
    const f = i / (layers - 1);
    const rx = (w / 2 - 2) * (1 - f * 0.55),
      ry = (h - 3) * (1 - f * 0.62);
    const ox = Math.round((r() - 0.5) * 6 * f),
      wob = r() * 6;
    for (let x = -Math.ceil(rx); x <= Math.ceil(rx); x++) {
      const u = x / rx;
      if (Math.abs(u) > 1) continue;
      const top = Math.round(by - ry * Math.sqrt(1 - u * u) * (0.86 + 0.14 * Math.sin(u * 7 + wob)));
      if (i > 0) p.set(cx + ox + x, top - 1, pal[1]);
      for (let y = top; y <= by; y++) {
        const d = y - top;
        let c = d === 0 ? ((((x + fr * 2 + i * 3) % 9) + 9) % 9 < 3 ? pal[4] : pal[3]) : d < 3 ? pal[2] : i & 1 ? pal[1] : pal[2];
        if (d >= 3 && d < 6 && (x + y) & 1) c = pal[1];
        p.set(cx + ox + x, y, c);
      }
    }
  }
  p.outline(pal[0]);
  return p;
}

// ---------------------------------------------------------------- Gorgonian sea fan (lace mesh + veins) — swayed by row shear
export function genFan(seed: number, pal: Pal, w: number, h: number): Pix {
  const r = rng(seed),
    p = new Pix(w, h),
    cx = w >> 1,
    by = h - 1;
  const RX = w / 2 - 5,
    RY = h - 10,
    cy = by - 5,
    lob = r() * 6;
  const hull = (x: number, y: number) => {
    if (y - cy > 1) return false;
    const dx = (x - cx) / RX,
      dy = (y - cy) / RY;
    const a = Math.atan2(dy, dx);
    const rr = (0.84 + 0.14 * Math.sin(a * 5 + lob)) * (0.8 + 0.2 * Math.sin(-a));
    return dx * dx + dy * dy < rr * rr;
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (hull(x, y) && ((x + y) & 1) === 0) p.set(x, y, pal[1]);
  const grow = (x: number, y: number, a: number, l: number, d: number) => {
    const x2 = x + Math.cos(a) * l,
      y2 = y + Math.sin(a) * l;
    if (!hull(x2, y2) && d < 4) {
      p.set(x, y, pal[4]);
      return;
    }
    p.line(x, y, x2, y2, d >= 3 ? pal[2] : pal[3], d >= 4 ? 2 : 1);
    if (d > 0) {
      grow(x2, y2, a - 0.22 - r() * 0.25, l * (0.7 + r() * 0.2), d - 1);
      grow(x2, y2, a + 0.22 + r() * 0.25, l * (0.7 + r() * 0.2), d - 1);
      if (r() < 0.35) grow(x2, y2, a + (r() - 0.5) * 0.2, l * 0.8, d - 1);
    } else p.set(x2, y2, pal[4]);
  };
  p.line(cx, by, cx, cy, pal[2], 3);
  p.rect(cx - 3, by - 1, 7, 2, pal[1]);
  for (const a of [-2.15, -1.8, -1.35, -1.0]) grow(cx, cy, a + (r() - 0.5) * 0.15, RY * 0.3, 4);
  p.outline(pal[0]);
  return p;
}

// ---------------------------------------------------------------- Sea whips / bamboo coral — swayed by row shear
export function genWhip(seed: number, pal: Pal, w: number, h: number, glow = false): Pix {
  const r = rng(seed),
    p = new Pix(w, h),
    cx = w >> 1,
    by = h - 1;
  const n = 3 + ((r() * 3) | 0);
  for (let i = 0; i < n; i++) {
    const f = n > 1 ? i / (n - 1) - 0.5 : 0,
      len = (h - 6) * (0.55 + r() * 0.45),
      curv = f * 0.9 + (r() - 0.5) * 0.3,
      wv = r() * 6;
    for (let s = 0; s < len; s++) {
      const t = s / len,
        x = Math.round(cx + f * 7 + curv * t * t * 11 + Math.sin(t * 6 + wv) * 1.2),
        y = by - 1 - s;
      p.set(x, y, pal[2]);
      p.set(x + 1, y, pal[1]);
      if (s > 3 && s % 3 === 0) p.set(x + (s % 6 === 0 ? -1 : 2), y, glow ? pal[4] : pal[3]);
      if (glow && s % 6 === 3) p.set(x, y, pal[4]);
    }
  }
  p.rect(cx - 5, by - 1, 11, 2, pal[1]);
  p.outline(pal[0]);
  return p;
}

// ---------------------------------------------------------------- Tube sponges / giant barrel sponge (exhaling plumes)
export function genTubes(seed: number, pal: Pal, ph: number, w: number, h: number, barrel = false): Pix {
  const r = rng(seed),
    p = new Pix(w, h),
    by = h - 1;
  const n = barrel ? 1 : 2 + ((r() * 3) | 0);
  const tops: number[] = [];
  for (let i = 0; i < n; i++) {
    const f = n > 1 ? i / (n - 1) - 0.5 : 0;
    const wd = barrel ? w / 2 - 5 : 3 + r() * 1.6,
      ht = Math.max(8, Math.round((h - 12) * (barrel ? 0.95 : 0.5 + r() * 0.5 - Math.abs(f) * 0.2))),
      tx = Math.round(w / 2 + f * (w - 14) + (r() - 0.5) * 2),
      lean = (r() - 0.5) * (barrel ? 0 : 4);
    let hwTop = wd,
      xTop = tx;
    for (let j = 0; j <= ht; j++) {
      const t = j / ht,
        hw = wd * (0.7 + 0.3 * t + (barrel ? Math.sin(t * Math.PI) * 0.22 : 0)),
        xc = Math.round(tx + lean * t * t),
        ih = Math.round(hw);
      for (let x = -ih; x <= ih; x++) {
        const u = (x + ih) / (2 * ih + 0.01);
        let ci = u < 0.25 ? 3 : u < 0.7 ? 2 : 1;
        if (barrel && (x + 40) % 4 === 0) ci = Math.max(1, ci - 1);
        if (hash2(xc + x, j, seed) < 0.1) ci = Math.max(1, ci - 1);
        p.set(xc + x, by - j, pal[ci]);
      }
      hwTop = hw;
      xTop = xc;
    }
    p.ell(xTop, by - ht, hwTop, barrel ? 2.4 : 1.5, pal[4]);
    p.ell(xTop, by - ht, hwTop - 1.2, barrel ? 1.5 : 0.7, pal[0]);
    tops.push(Math.round(xTop), by - ht);
  }
  p.outline(pal[0]);
  for (let i = 0; i < tops.length; i += 2)
    for (let j = 0; j < 3; j++) {
      const q = (ph + j / 3 + i * 0.17) % 1;
      if (q < 0.85) p.set(tops[i] + Math.round(Math.sin(q * 7 + j * 2) * 1.6), tops[i + 1] - 2 - q * 8, q < 0.5 ? pal[4] : pal[3]);
    }
  return p;
}

// ---------------------------------------------------------------- Anemone (thick tentacles) / crinoid feather star (thin pinnate arms)
function genAnemone(seed: number, pal: Pal, tip: number, ph: number, w: number, h: number, n: number, len: number, thin = false): Pix {
  const r = rng(seed),
    p = new Pix(w, h),
    cx = w >> 1,
    by = h - 1;
  if (!thin) {
    p.rect(cx - 5, by - 5, 11, 6, pal[1]);
    p.rect(cx - 5, by - 5, 3, 6, pal[2]);
    p.rect(cx - 6, by - 1, 13, 2, pal[1]);
  } else p.rect(cx - 2, by - 3, 5, 4, pal[1]);
  const y0 = by - (thin ? 3 : 5);
  for (let pass = 0; pass < 2; pass++)
    for (let i = pass; i < n; i += 2) {
      const f = i / (n - 1) - 0.5,
        a = -Math.PI / 2 + f * (thin ? 2.3 : 2.0),
        L = len * (0.72 + r() * 0.36) * (1 - Math.abs(f) * 0.25);
      const wv = Math.sin(TAU * ph + i * 1.3 + r() * 6);
      let x = cx + f * (thin ? 4 : 9),
        y = y0,
        ang = a;
      const c = pass ? pal[3] : pal[2];
      for (let s = 0; s <= L; s++) {
        const t = s / L;
        ang = a + f * (thin ? 2.2 : 1.2) * t * t + wv * t * (thin ? 0.5 : 0.45);
        x += Math.cos(ang);
        y += Math.sin(ang);
        if (thin) {
          p.set(x, y, c);
          if (s % 2 === 0 && s > 2) {
            p.set(x - Math.sin(ang) * 1.6, y + Math.cos(ang) * 1.6, pal[pass ? 2 : 1]);
            p.set(x + Math.sin(ang) * 1.6, y - Math.cos(ang) * 1.6, pal[pass ? 2 : 1]);
          }
        } else p.disc(x, y, t < 0.75 ? 1.15 : 0.8, c);
      }
      if (thin) p.set(x, y, tip);
      else p.disc(x, y, 1.25, tip);
    }
  p.outline(pal[0]);
  return p;
}

// ---------------------------------------------------------------- Giant kelp with gas bladders — swayed by row shear
export function genKelp(seed: number, pal: Pal, w: number, h: number, bl = 1): Pix {
  const r = rng(seed),
    p = new Pix(w, h),
    cx = w >> 1,
    by = h - 1,
    wv = r() * 6;
  const sx = (y: number) => Math.round(cx + Math.sin((by - y) * 0.09 + wv) * 2.2 * bl);
  let side = r() < 0.5 ? 1 : -1;
  for (let y = by; y > 6; y--) {
    const x = sx(y);
    p.set(x, y, pal[2]);
    p.set(x + 1, y, pal[1]);
    if (bl > 1.5) p.set(x - 1, y, pal[3]);
  }
  for (let y = by - 8; y > 10 * bl; y -= Math.round((6 + r() * 3) * bl)) {
    const x = sx(y),
      L = (8 + r() * 5) * bl,
      dx = side * L * 0.85,
      dy = -L * 0.5;
    p.line(x + side, y, x + dx, y + dy, pal[2], 2.6 * bl);
    p.line(x + side * 2, y - 1, x + dx * 0.9, y + dy * 0.9, pal[3], 1);
    p.set(x + dx, y + dy, pal[4]);
    p.disc(x + side * 1.5, y, 1.2 * bl, pal[4]);
    side = -side;
  }
  const tx = sx(7);
  p.line(tx, 8, tx - 4 * bl, 1, pal[3], 2 * bl);
  p.line(tx, 8, tx + 4 * bl, 2, pal[2], 2 * bl);
  p.rect(cx - 3, by - 1, 8, 2, pal[1]);
  p.outline(pal[0]);
  return p;
}

// ---------------------------------------------------------------- Seagrass tuft — swayed by row shear
function genGrass(seed: number, pal: Pal, w: number, h: number): Pix {
  const r = rng(seed),
    p = new Pix(w, h),
    cx = w >> 1,
    by = h - 1;
  const n = 5 + ((r() * 5) | 0);
  for (let i = 0; i < n; i++) {
    const bx = cx + Math.round((i - n / 2) * 1.8) + ((r() * 2) | 0),
      L = (h - 3) * (0.5 + r() * 0.5),
      curv = (r() - 0.5) * 8;
    const c = pal[i % 3 === 0 ? 3 : 2];
    for (let s = 0; s < L; s++) {
      const t = s / L;
      p.set(Math.round(bx + curv * t * t), by - s, s > L - 2 ? pal[4] : c);
    }
  }
  p.outline(pal[0]);
  return p;
}

// ---------------------------------------------------------------- Christmas-tree worms & feather-duster worms (retract when you come close!)
function genWorm(seed: number, pal: Pal, tube: Pal, ph: number, hide: number, w: number, h: number): Pix {
  const r = rng(seed),
    p = new Pix(w, h),
    by = h - 1;
  const n = 2 + ((r() * 2) | 0);
  for (let i = 0; i < n; i++) {
    const tx = Math.round(w / 2 + (i - (n - 1) / 2) * 9 + (r() - 0.5) * 3),
      th = 3 + ((r() * 4) | 0),
      spiral = r() < 0.5,
      ext = 1 - hide,
      ws = r() * 6;
    p.rect(tx - 1, by - th, 3, th + 1, tube[2]);
    p.rect(tx + 1, by - th, 1, th + 1, tube[1]);
    p.set(tx, by - th, tube[0]);
    if (ext <= 0.05) continue;
    const ty = by - th - 1;
    if (spiral) {
      const lv = Math.round(5 * ext);
      for (let k = 0; k < lv; k++) {
        const hw = Math.round((lv - k) * 0.9),
          wob = Math.round(Math.sin(TAU * ph + k * 0.9 + ws) * 0.7);
        p.rect(tx - hw + wob, ty - k * 2, hw * 2 + 1, 1, k & 1 ? pal[4] : pal[2]);
        p.rect(tx - Math.max(0, hw - 1) + wob, ty - k * 2 - 1, Math.max(1, hw * 2 - 1), 1, pal[3]);
      }
    } else {
      for (let k = 0; k < 9; k++) {
        const a = -Math.PI * (0.08 + (k / 8) * 0.84) + Math.sin(TAU * ph + k + ws) * 0.1,
          L = (6 + (k % 2)) * ext;
        for (let s = 1; s <= L; s++) p.set(tx + Math.cos(a) * s, ty + 1 + Math.sin(a) * s, s > L * 0.6 ? pal[4] : s > L * 0.3 ? pal[2] : pal[3]);
      }
    }
  }
  p.outline(pal[0]);
  return p;
}

// ---------------------------------------------------------------- Giant clam (Tridacna) with 3D hinged upper valve, ruffled mantle & luminous pearl
function genClam(shell: Pal, mant: Pal, ph: number, hide: number, w: number, h: number): Pix {
  const p = new Pix(w, h),
    cx = w >> 1,
    by = h - 2,
    R = (w >> 1) - 3,
    H = Math.round(h * 0.36);
  const open = (0.58 + 0.42 * Math.sin(TAU * ph)) * (1 - hide);
  const gape = Math.round(open * 8.5);
  const lip = (x: number) => by - H - Math.round(Math.abs(Math.sin(((x - cx) / R) * Math.PI * 2.5)) * 2.6);

  // Hinged upper shell lid (swings upward & back when open, settles over lower rim when closed)
  const topLift = Math.round(gape * 1.28) + 3;
  const topR = Math.round(R * 0.94);
  for (let x = cx - topR; x <= cx + topR; x++) {
    const u = (x - cx) / topR;
    const arch = Math.sqrt(Math.max(0, 1 - u * u));
    const upperTop = by - H - topLift - Math.round(arch * (4 + open * 3.5));
    const upperBot = lip(x) - gape + Math.round((1 - arch) * 1.5);
    for (let y = upperTop; y <= upperBot; y++) {
      const fl = Math.sin(u * Math.PI * 5);
      const isInner = open > 0.25 && y > upperTop + Math.round((upperBot - upperTop) * 0.58);
      p.set(
        x,
        y,
        isInner
          ? y >= upperBot - 1
            ? shell[4]
            : shell[1]
          : y <= upperTop + 1
            ? shell[4]
            : fl > 0.32
              ? shell[3]
              : fl < -0.32
                ? shell[1]
                : shell[2]
      );
    }
  }

  // Deep inner cavity between valves
  if (gape >= 2) {
    p.ell(cx, by - H - gape * 0.42, R * 0.8, Math.max(1.5, gape * 0.55), C("#0d1532"));
  }

  // Ruffled iridescent mantle + centered luminous pearl
  if (open > 0.14) {
    const mThick = Math.max(1, Math.round(open * 3.2));
    for (let x = cx - R + 2; x <= cx + R - 2; x++) {
      const u = (x - cx) / R;
      const arch = Math.sqrt(Math.max(0, 1 - u * u));
      const ly = lip(x);
      const wv = Math.round(Math.sin(x * 0.75 + TAU * ph) * 0.9);
      for (let k = 0; k <= mThick + 1; k++) {
        const y = ly + 1 - Math.round(k * arch) + (k >= mThick ? wv : 0);
        const c = k >= mThick ? mant[4] : hash2(x, k, 5) < 0.26 ? mant[3] : mant[2];
        p.set(x, y, c);
      }
      p.set(x, ly + 1, mant[1]);
    }
    if (open > 0.3) {
      const py = by - H - Math.round(gape * 0.45) - 1;
      const pr = 2.6 + open * 0.9;
      p.disc(cx, py, pr + 0.8, C("#e8d4f0"));
      p.disc(cx, py, pr, C("#fff4ea"));
      p.set(cx - 1, py - 1, C("#ffffff"));
      p.set(cx, py - 1, C("#ffffff"));
      if (((ph * NF) | 0) % 4 === 0) {
        p.set(cx, py - 3, C("#ffffff"));
        p.set(cx + 2, py - 1, C("#ffffff"));
      }
    }
  }

  // Scalloped lower shell base in front
  for (let x = cx - R; x <= cx + R; x++) {
    const u = (x - cx) / R;
    const bot = by - Math.round((1 - Math.sqrt(Math.max(0, 1 - u * u))) * H * 0.88);
    const top = lip(x);
    for (let y = top; y <= bot; y++) {
      const fl = Math.sin(Math.atan2(by + 3 - y, x - cx) * 9);
      p.set(x, y, y === top ? shell[4] : fl > 0.35 ? shell[3] : fl < -0.35 ? shell[1] : shell[2]);
    }
  }
  p.outline(shell[0]);
  return p;
}

// ---------------------------------------------------------------- Sea urchin (wiggling spines)
function genUrchin(seed: number, pal: Pal, ph: number): Pix {
  const r = rng(seed),
    p = new Pix(21, 14),
    cx = 10,
    by = 13;
  for (let i = 0; i < 13; i++) {
    const a = -Math.PI * (0.04 + (i / 12) * 0.92) + Math.sin(TAU * ph + i * 2.1) * 0.13,
      L = 6 + r() * 2.5;
    for (let s = 2; s <= L; s++) p.set(cx + Math.cos(a) * s, by - 2 + Math.sin(a) * s, s > L - 1.5 ? pal[3] : pal[1]);
  }
  p.ell(cx, by - 1, 4, 3.4, pal[0]);
  p.set(cx - 2, by - 3, pal[3]);
  p.set(cx - 1, by - 4, pal[2]);
  return p;
}

// ---------------------------------------------------------------- Starfish (curling arm tips)
function genStar(pal: Pal, ph: number): Pix {
  const p = new Pix(15, 14),
    cx = 7,
    cy = 7;
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i * TAU) / 5,
      b = a + Math.sin(TAU * ph + i * 1.7) * 0.3;
    const mx = cx + Math.cos(a) * 3,
      my = cy + Math.sin(a) * 3;
    p.line(cx, cy, mx, my, pal[2], 2.6);
    p.line(mx, my, mx + Math.cos(b) * 3.2, my + Math.sin(b) * 3.2, pal[2], 1.6);
  }
  p.bevel(pal[2], pal[3], pal[1]);
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i * TAU) / 5;
    p.set(cx + Math.cos(a) * 2.6, cy + Math.sin(a) * 2.6, pal[4]);
  }
  p.set(cx, cy, pal[4]);
  p.outline(pal[0]);
  return p;
}

// ---------------------------------------------------------------- Hydrothermal Riftia tube worms (red plumes, retract when disturbed)
function genRiftia(seed: number, tube: Pal, pal: Pal, ph: number, hide: number, w: number, h: number): Pix {
  const r = rng(seed),
    p = new Pix(w, h),
    by = h - 1,
    n = 4 + ((r() * 4) | 0);
  const heads: number[] = [];
  for (let i = 0; i < n; i++) {
    const f = i / (n - 1) - 0.5,
      bx = w / 2 + f * (w - 14),
      L = (h - 8) * (0.45 + r() * 0.55),
      lean = f * 5 + (r() - 0.5) * 3,
      ws = r() * 6;
    let x = bx,
      y = by;
    for (let s = 0; s <= L; s++) {
      const t = s / L;
      x = Math.round(bx + lean * t * t);
      y = by - s;
      p.set(x, y, tube[3]);
      p.set(x + 1, y, s % 4 === 3 ? tube[1] : tube[2]);
    }
    heads.push(x, y, ws);
  }
  p.outline(tube[0]);
  const e = 1 - hide;
  for (let i = 0; i < heads.length; i += 3) {
    const x = heads[i],
      y = heads[i + 1];
    if (e < 0.1) {
      p.set(x, y - 1, pal[1]);
      continue;
    }
    const pl = Math.round(4 * e),
      wob = Math.round(Math.sin(TAU * ph + heads[i + 2]));
    for (let k = 1; k <= pl; k++) {
      const o = k > 2 ? wob : 0;
      p.set(x + o, y - k, k === pl ? pal[4] : pal[3]);
      p.set(x + 1 + o, y - k, pal[2]);
    }
    if (pl > 2) {
      p.set(x - 1 + wob, y - 3, pal[2]);
      p.set(x + 2 + wob, y - 3, pal[1]);
    }
  }
  return p;
}

// ---------------------------------------------------------------- Bioluminescent sea pen (light pulse travels up the feather)
function genPen(seed: number, pal: Pal, ph: number, w: number, h: number): Pix {
  const r = rng(seed),
    p = new Pix(w, h),
    cx = w >> 1,
    by = h - 1,
    L = h - 4,
    fr = Math.floor(ph * NF),
    sd = r() * 6;
  for (let s = 0; s <= L; s++) {
    const t = s / L,
      x = Math.round(cx + Math.sin(TAU * ph - t * 1.6 + sd) * t * 2.5),
      y = by - s;
    p.set(x, y, pal[2]);
    if (s > L * 0.22 && s % 2 === 0) {
      const ll = Math.round((1 - Math.abs(t - 0.6) * 1.9) * 6 + 1.5);
      const lit = ((s >> 1) + NF * 8 - fr) % NF < 2;
      for (let k = 1; k <= ll; k++) {
        const c = k === ll || lit ? pal[4] : pal[3];
        p.set(x - k, y - (k >> 1), c);
        p.set(x + k, y - (k >> 1), c);
      }
    }
  }
  p.rect(cx - 1, by - 2, 3, 3, pal[1]);
  p.outline(pal[0]);
  return p;
}

// ---------------------------------------------------------------- Bluebell tunicates (glowing glass bulbs pulsing in sequence)
function genTunicate(seed: number, pal: Pal, ph: number, w: number, h: number): Pix {
  const r = rng(seed),
    p = new Pix(w, h),
    by = h - 1,
    n = 4 + ((r() * 4) | 0),
    fr = Math.floor(ph * NF);
  for (let i = 0; i < n; i++) {
    const f = i / (n - 1) - 0.5,
      bx = Math.round(w / 2 + f * (w - 12) + (r() - 0.5) * 2),
      st = 2 + ((r() * (h - 13)) | 0),
      rr = 2 + r() * 1.3;
    p.rect(bx, by - st, 1, st + 1, pal[1]);
    const cy = by - st - rr;
    p.ell(bx, cy, rr, rr + 1, pal[2]);
    p.ell(bx - 0.5, cy - 0.5, rr - 1, rr - 0.5, (i + fr) % NF < 3 ? pal[4] : pal[3]);
    p.set(bx, cy - rr - 1, pal[1]);
    p.set(bx - 1, cy - 1, pal[4]);
  }
  p.outline(pal[0]);
  return p;
}

// ---------------------------------------------------------------- Deep-sea crystal cluster (travelling shine + star glints)
function genCrystal(seed: number, pal: Pal, ph: number, w: number, h: number): Pix {
  const r = rng(seed),
    p = new Pix(w, h),
    cx = w >> 1,
    by = h - 1,
    n = 4 + ((r() * 3) | 0),
    fr = Math.floor(ph * NF);
  const tips: number[] = [];
  const idx = Array.from({ length: n }, (_, i) => i).sort((a, b) => Math.abs(b - (n - 1) / 2) - Math.abs(a - (n - 1) / 2));
  for (const i of idx) {
    const f = n > 1 ? i / (n - 1) - 0.5 : 0,
      a = -Math.PI / 2 + f * 1.25 + (r() - 0.5) * 0.15,
      L = (h - 6) * (1 - Math.abs(f) * 0.9) * (0.75 + r() * 0.25),
      hw = 2 + (1 - Math.abs(f) * 1.4) * 2.2;
    const bx = cx + f * 10,
      ux = Math.cos(a),
      uy = Math.sin(a),
      nx = -uy,
      ny = ux;
    const tx = bx + ux * L,
      ty = by - 1 + uy * L,
      sx = bx + ux * L * 0.78,
      sy = by - 1 + uy * L * 0.78;
    p.poly([bx - nx * hw, by - 1 - ny * hw, sx - nx * hw, sy - ny * hw, tx, ty, sx, sy, bx, by - 1], pal[3]);
    p.poly([bx, by - 1, sx, sy, tx, ty, sx + nx * hw, sy + ny * hw, bx + nx * hw, by - 1 + ny * hw], pal[1]);
    p.line(bx, by - 1, tx, ty, pal[2], 1);
    const q = ((ph + i * 0.21) % 1) * L;
    p.set(bx + ux * q, by - 1 + uy * q, pal[4]);
    p.set(bx + ux * (q + 1), by - 1 + uy * (q + 1), pal[4]);
    p.set(bx - nx * (hw - 1) + ux * q * 0.8, by - 1 - ny * (hw - 1) + uy * q * 0.8, pal[4]);
    p.set(tx, ty, pal[4]);
    tips.push(tx, ty);
  }
  p.outline(pal[0]);
  const k = (fr >> 1) % (n + 1);
  if (k < n) {
    const gx = Math.round(tips[k * 2]),
      gy = Math.round(tips[k * 2 + 1]),
      W = C("#ffffff");
    p.set(gx, gy, W);
    if (fr & 1) for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-2, 0], [2, 0], [0, -2], [0, 2]]) p.set(gx + dx, gy + dy, W);
    else for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) p.set(gx + dx, gy + dy, pal[4]);
  }
  return p;
}

// ---------------------------------------------------------------- Bracket / shelf coral growing out of a cliff wall (x = 0 is inside the rock)
function genShelf(seed: number, pal: Pal, ph: number, w: number, h: number): Pix {
  const r = rng(seed),
    p = new Pix(w, h),
    fr = Math.floor(ph * NF),
    n = 2 + ((r() * 2) | 0);
  for (let i = 0; i < n; i++) {
    const cy = 4 + i * Math.floor((h - 7) / n) + ((r() * 2) | 0),
      R = Math.round((w - 3) * (0.6 + r() * 0.4) * (1 - i * 0.12));
    for (let x = 0; x <= R; x++) {
      const u = x / R,
        hh = Math.sqrt(1 - u * u);
      const t0 = Math.round(cy - 1.6 * hh),
        b0 = Math.round(cy + 2.4 * hh);
      for (let y = t0; y <= b0; y++) p.set(x, y, y <= cy ? (hash2(x, y, seed) < 0.2 ? pal[4] : pal[3]) : y === cy + 1 ? pal[2] : pal[1]);
      if ((x + fr) % 5 < 2) p.set(x, t0, pal[4]);
    }
  }
  p.outline(pal[0]);
  return p;
}

// ---------------------------------------------------------------- Hanging sea-grape vines (anchored at the top) — swayed by row shear
function genVine(seed: number, pal: Pal, w: number, h: number, glow = false): Pix {
  const r = rng(seed),
    p = new Pix(w, h),
    n = 2 + ((r() * 2) | 0);
  for (let i = 0; i < n; i++) {
    const bx = Math.round(w / 2 + (i - (n - 1) / 2) * 4 + (r() - 0.5) * 2),
      L = (h - 4) * (0.5 + r() * 0.5),
      wv = r() * 6;
    let x = bx;
    for (let s = 0; s < L; s++) {
      x = Math.round(bx + Math.sin(s * 0.35 + wv) * 1.2);
      p.set(x, s, pal[2]);
      if (s % 3 === 1) p.set(x + (s % 6 === 1 ? 1 : -1), s, pal[3]);
    }
    p.disc(x, L, glow ? 1.3 : 1, pal[4]);
  }
  p.outline(pal[0]);
  return p;
}

// ---------------------------------------------------------------- Jellyfish (pulsing bell, trailing tentacles)
function genJelly(seed: number, pal: Pal, ph: number, R: number): Pix {
  const r = rng(seed),
    w = R * 2 + 8,
    h = Math.round(R * 3.7) + 6,
    p = new Pix(w, h),
    cx = w >> 1,
    k = Math.sin(TAU * ph);
  const rx = R * (1 + 0.13 * k),
    ry = R * 0.82 * (1 - 0.15 * k),
    cy = Math.round(R * 0.95) + 2 - Math.round(k);
  for (const o of [-1, 1])
    for (let s = 0; s < R * 1.2; s++) {
      const x = cx + o * 1.5 + Math.sin(TAU * ph - s * 0.5 + o) * 1.3;
      p.set(x, cy + s, pal[3]);
      p.set(x + o, cy + s, s % 2 ? pal[4] : pal[3]);
    }
  for (let x = -Math.ceil(rx); x <= Math.ceil(rx); x++) {
    const u = x / rx;
    if (Math.abs(u) > 1) continue;
    const top = Math.round(cy - ry * Math.sqrt(1 - u * u));
    for (let y = top; y <= cy; y++) {
      const d = y - top,
        v = (cy - y) / ry;
      p.set(cx + x, y, d === 0 ? pal[4] : u < -0.15 && v > 0.4 && d < 3 ? pal[4] : y >= cy - 1 ? pal[2] : pal[3]);
    }
    if ((x & 1) === 0) p.set(cx + x, cy + 1, pal[2]);
  }
  for (const gx of [-0.42, 0.42]) p.ell(cx + gx * rx, cy - ry * 0.42, rx * 0.2, ry * 0.2, pal[2]);
  p.outline(pal[1]);
  const nt = R > 7 ? 7 : 5;
  for (let i = 0; i < nt; i++) {
    const f = i / (nt - 1) - 0.5,
      x0 = cx + f * rx * 1.7,
      L = R * (1.5 + r() * 1.1),
      ws = r() * 6;
    for (let s = 0; s < L; s++) p.set(x0 + Math.sin(TAU * ph - s * 0.45 + ws) * 1.6 * (s / L) - f * (s / L) * 2 * k, cy + 2 + s, s % 3 === 2 ? pal[3] : pal[2]);
  }
  return p;
}

// ---------------------------------------------------------------- Tiny scuttling crab
function genCrab(pal: Pal, ph: number): Pix {
  const p = new Pix(19, 11),
    cx = 9,
    by = 10,
    st = Math.floor(ph * NF) & 1,
    K = C("#10101c");
  for (const s of [-1, 1])
    for (let i = 0; i < 3; i++) {
      const up = (i + st + (s > 0 ? 1 : 0)) & 1;
      p.set(cx + s * (4 + i), by - 3, pal[2]);
      p.set(cx + s * (5 + i), by - 2 - up, pal[2]);
      p.set(cx + s * (6 + i), by - up, pal[1]);
    }
  p.ell(cx, by - 4, 4.4, 2.6, pal[2]);
  p.rect(cx - 3, by - 6, 7, 1, pal[3]);
  p.set(cx - 2, by - 5, pal[4]);
  for (const s of [-1, 1]) {
    p.rect(cx + s * 6 - (s < 0 ? 1 : 0), by - 7 - (st ^ (s > 0 ? 1 : 0)), 2, 2, pal[3]);
    p.set(cx + s * 2, by - 7, pal[4]);
    p.set(cx + s * 2, by - 8, K);
  }
  p.outline(pal[0]);
  return p;
}

// ---------------------------------------------------------------- Underwater Volcanic Caldera Cone ("Volcano Air") with thermal fissures & aerated plumes
function genVent(seed: number, ph: number): Pix {
  const r = rng(seed),
    w = 74,
    h = 96,
    p = new Pix(w, h),
    cx = w >> 1,
    by = h - 1,
    R = PAL.basalt,
    E = PAL.ember,
    ht = 34 + ((r() * 9) | 0);

  const cone = (bx: number, hh: number, bw: number, tw: number) => {
    let topX = bx;
    for (let j = 0; j <= hh; j++) {
      const t = j / hh;
      // Flaring concave volcanic mountain profile
      const profile = Math.pow(1 - t, 1.35);
      const hw = Math.max(tw, Math.round(tw + (bw - tw) * profile + Math.sin(j * 0.65 + seed) * 1.1));
      const xc = Math.round(bx + Math.sin(t * 2.2 + seed) * 1.2);
      for (let x = -hw; x <= hw; x++) {
        const u = (x + hw) / (2 * hw + 0.01);
        const ridge = Math.sin((x + t * 5) * 0.55 + seed);
        let c = u < 0.28 ? R[4] : u < 0.66 ? (ridge > 0.2 ? R[4] : R[3]) : R[2];
        if (u > 0.8) c = R[1];
        const hs = hash2(xc + x, j, seed);
        if (hs < 0.05) c = R[4];
        else if (hs < 0.09) c = R[1];
        // Glowing magma fissures running up the volcanic slope
        if (Math.abs(x - Math.sin(j * 0.35 + seed) * hw * 0.4) < 1.1 && t > 0.18 && t < 0.88 && ((j + Math.floor(ph * 4)) % 3 !== 0)) {
          c = t > 0.6 ? E[3] : E[2];
        }
        if (j >= hh - 2 && Math.abs(x) <= tw - 1) c = j === hh ? E[4] : E[3];
        p.set(xc + x, by - j, c);
      }
      topX = xc;
    }
    return topX;
  };

  // Secondary parasitic side cone + main broad volcano caldera
  cone(cx - 17, Math.round(ht * 0.48), 11, 3.2);
  const topX = cone(cx + 2, ht, 26, 7);
  // Sculpted glowing crater mouth rim
  p.ell(topX, by - ht, 7.2, 2.2, E[3]);
  p.ell(topX, by - ht, 4.4, 1.3, E[4]);
  p.outline(R[0]);

  // Aerated underwater water-volcano plumes (aqua mist + crisp bright bubbles!)
  const PL = P("#ffffff", "#baf4ff", "#66d8f2", "#348cb8");
  for (let j = 0; j < 7; j++) {
    const q = (ph + j / 7) % 1;
    const yy = by - ht - 3 - q * 48;
    const xx = topX + Math.sin(q * 6 + j * 1.9) * (2.5 + q * 6.5);
    const rad = 2.0 + q * 6.2;
    const c = q < 0.14 ? E[4] : q < 0.38 ? PL[1] : q < 0.72 ? PL[2] : PL[3];
    for (let y = Math.floor(yy - rad); y <= yy + rad; y++) {
      for (let x = Math.floor(xx - rad); x <= xx + rad; x++) {
        const dd = ((x - xx) ** 2 + (y - yy) ** 2) / (rad * rad);
        if (dd <= 1 && bayer(x, y) > (q - 0.35) * 1.45 + dd * 0.42 - 0.32) p.set(x, y, c);
      }
    }
    // Crisp rising volcano bubbles inside plume
    if (j % 2 === 0) {
      const bx = Math.round(xx + Math.cos(j * 3 + q * 9) * (rad * 0.65));
      const byb = Math.round(yy - 2 - q * 5);
      p.disc(bx, byb, 1.3, PL[0]);
    }
  }
  return p;
}

// ---------------------------------------------------------------- Sunken treasure chest with sparkling gold
function genChest(ph: number): Pix {
  const p = new Pix(42, 32),
    by = 31,
    W = PAL.wood,
    G = PAL.gold,
    fr = Math.floor(ph * NF);
  for (const [x, y] of [[3, by], [7, by - 1], [11, by], [32, by], [35, by - 1], [38, by], [30, by - 1]]) {
    p.rect(x, y - 1, 3, 2, G[3]);
    p.set(x, y, G[2]);
    p.set(x + 1, y - 1, G[4]);
  }
  p.poly([9, by - 13, 32, by - 13, 34, by - 23, 11, by - 25], W[1]);
  p.line(11, by - 25, 34, by - 23, W[3], 1);
  p.line(11, by - 24, 34, by - 22, G[2], 1);
  p.ell(21, by - 13, 10, 3.4, G[3]);
  p.ell(18, by - 15, 5, 2.2, G[4]);
  p.ell(25, by - 14, 4, 1.8, G[2]);
  p.disc(25, by - 17, 2.3, C("#eef4ff"));
  p.set(24, by - 18, C("#ffffff"));
  p.set(26, by - 16, C("#b0c0e0"));
  p.rect(10, by - 12, 22, 13, W[2]);
  p.rect(10, by - 12, 22, 2, W[3]);
  p.rect(10, by - 3, 22, 4, W[1]);
  for (let x = 14; x < 32; x += 5) p.rect(x, by - 10, 1, 11, W[1]);
  for (const x of [12, 28]) {
    p.rect(x, by - 12, 2, 13, G[2]);
    p.rect(x, by - 12, 1, 13, G[3]);
  }
  p.rect(19, by - 9, 4, 5, G[3]);
  p.rect(20, by - 7, 2, 2, W[0]);
  p.outline(W[0]);
  const S = C("#ffffff"),
    pts = [[15, by - 18], [27, by - 20], [21, by - 22], [5, by - 4], [36, by - 5], [22, by - 16]];
  const s = pts[fr % pts.length];
  p.set(s[0], s[1], S);
  if (fr & 1) for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-2, 0], [2, 0], [0, -2], [0, 2]]) p.set(s[0] + dx, s[1] + dy, S);
  else for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) p.set(s[0] + dx, s[1] + dy, G[4]);
  return p;
}

// ============================================================================
// REGISTRY — builds every animated sprite set (optionally tinted for far planes)
// ============================================================================
// Static pixel sprite dimensions for meta-only startup (matches genUrchin, genStar, genJelly, genCrab, genVent, genChest)
function metaDims(name: string, idx: number): [number, number] {
  if (name === "urchin" || name === "urchin2") return [21, 14];
  if (name === "star" || name === "star2") return [15, 14];
  if (name === "crab") return [19, 11];
  if (name === "vent") return [74, 96];
  if (name === "chest") return [42, 32];
  if (name === "jelly") {
    const R = 6 + (idx % 2) * 3;
    return [R * 2 + 8, Math.round(R * 3.7) + 6];
  }
  if (name === "jelly2") {
    const R = 7 + (idx % 2) * 3;
    return [R * 2 + 8, Math.round(R * 3.7) + 6];
  }
  return [32, 32];
}

/**
 * Builds every animated sprite set. When `metaOnly` is true, returns zero-pixel metadata (`f: []`, exact `w`/`h`)
 * instantaneously so 2D/3D modes never waste startup time rasterizing 16-bit pixel art unless Pixel Mode is active.
 */
export function* buildBiota(tint?: [number, number], only?: string[], metaOnly = false): Generator<void, BioSet, void> {
  const out: BioSet = {};
  const jobs: [string, () => Bio[]][] = [];
  const cv = (p: Pix) => {
    if (tint) p.tint(tint[0], tint[1]);
    return p.toCanvas();
  };
  const A = (mk: (ph: number) => Pix, mw?: number, mh?: number) =>
    metaOnly ? { f: [] as HTMLCanvasElement[], w: mw ?? 0, h: mh ?? 0 } : Array.from({ length: NF }, (_, i) => cv(mk(i / NF)));
  const S = (src: () => Pix, amp: number, pw: number, lag: number, top = false, mw?: number, mh?: number) => {
    if (metaOnly) return { f: [] as HTMLCanvasElement[], w: mw ?? 0, h: mh ?? 0 };
    const base = src();
    return Array.from({ length: NF }, (_, i) => cv(sway(base, i / NF, amp, pw, lag, top)));
  };
  const B = (
    res: HTMLCanvasElement[] | { f: HTMLCanvasElement[]; w: number; h: number },
    foot: number,
    fps: number,
    ex: Partial<Bio> = {}
  ): Bio => {
    if (Array.isArray(res)) return { f: res, w: res[0].width, h: res[0].height, foot, fps, mode: 0, ...ex };
    return { f: res.f, w: res.w, h: res.h, foot, fps, mode: 0, ...ex };
  };
  const def = (name: string, mk: () => Bio[]) => {
    if (!only || only.includes(name)) jobs.push([name, mk]);
  };
  const L = PAL;
  const G = { cyan: "rgba(60, 220, 255, 0.5)", mag: "rgba(240, 110, 250, 0.5)", vio: "rgba(150, 130, 255, 0.5)", amber: "rgba(255, 170, 70, 0.5)", pinkG: "rgba(255, 130, 190, 0.45)" };

  // ---------- sunlit reef ----------
  def("staghorn", () => [L.coral, L.orange, L.blue, L.yellow, L.pink].map((pl, i) => B(A((ph) => genBranch(11 + i * 7, pl, ph, 58, 56, 14 + (i % 3), 3.6, 3), 58, 56), 6, 5)));
  def("table", () => [L.teal, L.purple, L.yellow, L.pink].map((pl, i) => B(A((ph) => genTable(31 + i * 5, pl, ph, i % 2 ? 44 : 54, 32), i % 2 ? 44 : 54, 32), 4, 6)));
  def("brain", () => [L.yellow, L.green, L.orange].map((pl, i) => B(A((ph) => genBrain(51 + i * 3, pl, ph, 32 + i * 6, 19 + i * 3), 32 + i * 6, 19 + i * 3), 11 + i * 2, 6)));
  def("pillar", () => [L.yellow, L.lime, L.pink].map((pl, i) => B(A((ph) => genPillar(61 + i * 9, pl, ph, 34, 40 + i * 5), 34, 40 + i * 5), 11, 5)));
  def("lettuce", () => [L.green, L.purple, L.orange].map((pl, i) => B(A((ph) => genLettuce(71 + i * 3, pl, ph, 42 + (i % 2) * 8, 25 + (i % 2) * 4), 42 + (i % 2) * 8, 25 + (i % 2) * 4), 13, 6)));
  def("fan", () => [L.purple, L.pink, L.red, L.orange].map((pl, i) => B(S(() => genFan(81 + i * 11, pl, 62 - (i % 2) * 12, 64 - (i % 2) * 12), 3, 1.3, 0.9, false, 62 - (i % 2) * 12, 64 - (i % 2) * 12), 3, 7)));
  def("whip", () => [L.orange, L.red, L.yellow].map((pl, i) => B(S(() => genWhip(91 + i * 5, pl, 46, 60 + i * 5), 3.4, 1.6, 1.7, false, 46, 60 + i * 5), 5, 7)));
  def("tubes", () => [L.yellow, L.purple, L.orange, L.blue].map((pl, i) => B(A((ph) => genTubes(101 + i * 7, pl, ph, 38, 50), 38, 50), 10, 7)));
  def("barrel", () => [L.red, L.pink].map((pl, i) => B(A((ph) => genTubes(111 + i, pl, ph, 40, 48, true), 40, 48), 10, 7)));
  def("anemone", () =>
    ([[L.pink, L.bone[4]], [L.green, L.pink[3]], [L.orange, L.bone[4]], [L.purple, L.yellow[3]]] as [Pal, number][]).map(([pl, tp], i) =>
      B(A((ph) => genAnemone(121 + i * 3, pl, tp, ph, 52, 31, 15, 15), 52, 31), 6, 8)
    )
  );
  def("clam", () =>
    [L.blue, L.purple, L.teal, L.green].map((m) =>
      B(A((ph) => genClam(L.bone, m, ph, 0, 48, 34), 48, 34), 10, 6, {
        shy: metaOnly ? [] : [cv(genClam(L.bone, m, 0, 0.58, 48, 34)), cv(genClam(L.bone, m, 0, 1, 48, 34))],
        glow: "rgba(255, 240, 200, 0.36)",
        gy: 0.46,
      })
    )
  );
  def("worm", () =>
    [L.red, L.yellow, L.blue, L.pink, L.orange].map((pl, i) =>
      B(A((ph) => genWorm(131 + i * 7, pl, L.bone, ph, 0, 30, 24), 30, 24), 7, 8, {
        shy: metaOnly ? [] : [cv(genWorm(131 + i * 7, pl, L.bone, 0, 0.6, 30, 24)), cv(genWorm(131 + i * 7, pl, L.bone, 0, 1, 30, 24))],
      })
    )
  );
  def("grass", () => [L.green, L.kelp, L.lime].map((pl, i) => B(S(() => genGrass(141 + i, pl, 28, 22 + i * 3), 2.2, 1.4, 1.2, false, 28, 22 + i * 3), 5, 8)));
  def("kelp", () => [L.kelp, L.olive, L.kelp].map((pl, i) => B(S(() => genKelp(151 + i * 3, pl, 50, 74 + i * 22), 4.5 + i, 1.4, 2.4, false, 50, 74 + i * 22), 3, 7)));
  def("kelpBig", () => [L.kelp, L.olive].map((pl, i) => B(S(() => genKelp(191 + i * 3, pl, 84, 170 + i * 40, 2), 9, 1.4, 2.4, false, 84, 170 + i * 40), 4, 7)));
  def("urchin", () => [L.dark, L.red, L.purple].map((pl, i) => { const [w, h] = metaDims("urchin", i); return B(A((ph) => genUrchin(161 + i, pl, ph), w, h), 4, 6); }));
  def("star", () => [L.orange, L.red, L.blue].map((pl, i) => { const [w, h] = metaDims("star", i); return B(A((ph) => genStar(pl, ph), w, h), 4, 3); }));
  def("shelf", () => [L.pink, L.teal, L.orange].map((pl, i) => B(A((ph) => genShelf(171 + i * 3, pl, ph, 22, 24), 22, 24), 0, 6, { mode: 2 })));
  def("vine", () => [L.kelp, L.green].map((pl, i) => B(S(() => genVine(181 + i * 3, pl, 16, 30 + i * 8), 3, 1.5, 1.8, true, 16, 30 + i * 8), 0, 7, { mode: 1 })));

  // ---------- twilight wall ----------
  def("staghorn2", () => [L.purple, L.indigo, L.teal].map((pl, i) => B(A((ph) => genBranch(211 + i * 7, pl, ph, 58, 56, 15, 3.6, 3), 58, 56), 6, 5)));
  def("brain2", () => [L.purple, L.indigo].map((pl, i) => B(A((ph) => genBrain(221 + i * 3, pl, ph, 38, 22), 38, 22), 13, 6)));
  def("lettuce2", () => [L.indigo, L.teal].map((pl, i) => B(A((ph) => genLettuce(231 + i * 3, pl, ph, 48, 28), 48, 28), 14, 6)));
  def("fan2", () => [L.indigo, L.magenta, L.blue].map((pl, i) => B(S(() => genFan(241 + i * 11, pl, 66, 68), 3.2, 1.3, 0.9, false, 66, 68), 3, 7)));
  def("whip2", () => [L.purple, L.teal].map((pl, i) => B(S(() => genWhip(251 + i * 5, pl, 46, 68), 3.4, 1.6, 1.7, false, 46, 68), 5, 7)));
  def("barrel2", () => [L.indigo, L.purple].map((pl, i) => B(A((ph) => genTubes(261 + i, pl, ph, 42, 52, true), 42, 52), 10, 7)));
  def("anemone2", () =>
    ([[L.magenta, L.cyan[3]], [L.cyan, L.bone[4]]] as [Pal, number][]).map(([pl, tp], i) =>
      B(A((ph) => genAnemone(271 + i * 3, pl, tp, ph, 52, 31, 15, 15), 52, 31), 6, 8, { glow: i ? G.cyan : G.mag, gy: 0.5 })
    )
  );
  def("crinoid", () => ([[L.yellow, L.orange[4]], [L.red, L.yellow[3]], [L.orange, L.bone[4]]] as [Pal, number][]).map(([pl, tp], i) => B(A((ph) => genAnemone(281 + i * 3, pl, tp, ph, 56, 36, 9, 20, true), 56, 36), 3, 7)));
  def("tunicate", () => [L.blue, L.cyan, L.purple].map((pl, i) => B(A((ph) => genTunicate(291 + i * 3, pl, ph, 30, 24), 30, 24), 8, 5, { glow: i === 2 ? G.vio : G.cyan, gy: 0.6 })));
  def("shelf2", () => [L.purple, L.indigo, L.cyan].map((pl, i) => B(A((ph) => genShelf(301 + i * 3, pl, ph, 22, 24), 22, 24), 0, 6, { mode: 2 })));
  def("vine2", () => [L.cyan, L.magenta].map((pl, i) => B(S(() => genVine(311 + i * 3, pl, 16, 34 + i * 8, true), 3, 1.5, 1.8, true, 16, 34 + i * 8), 0, 7, { mode: 1, glow: i ? G.mag : G.cyan, gy: 0.85 })));

  // ---------- midnight garden & abyss ----------
  def("crinoid2", () => ([[L.bone, L.cyan[3]], [L.magenta, L.bone[4]]] as [Pal, number][]).map(([pl, tp], i) => B(A((ph) => genAnemone(321 + i * 3, pl, tp, ph, 56, 36, 9, 20, true), 56, 36), 3, 7)));
  def("pen", () => [L.magenta, L.cyan, L.ember].map((pl, i) => B(A((ph) => genPen(331 + i * 3, pl, ph, 22, 40 + i * 4), 22, 40 + i * 4), 2, 8, { glow: [G.mag, G.cyan, G.amber][i], gy: 0.6 })));
  def("bamboo", () => [L.cyan, L.bone].map((pl, i) => B(S(() => genWhip(341 + i * 5, pl, 44, 64, true), 3.2, 1.6, 1.7, false, 44, 64), 5, 7, { glow: G.cyan, gy: 0.6 })));
  def("crystal", () => [L.cyan, L.magenta, L.indigo].map((pl, i) => B(A((ph) => genCrystal(351 + i * 3, pl, ph, 46, 52 - i * 7), 46, 52 - i * 7), 9, 7, { glow: [G.cyan, G.mag, G.vio][i], gy: 0.45 })));
  def("bubblegum", () => [L.pink, L.red, L.magenta].map((pl, i) => B(A((ph) => genBranch(361 + i * 7, pl, ph, 58, 54, 14, 3.6, 3, true), 58, 54), 6, 5, { glow: G.pinkG, gy: 0.6 })));
  def("riftia", () =>
    [0, 1, 2].map((i) =>
      B(A((ph) => genRiftia(371 + i * 3, L.bone, L.red, ph, 0, 34, 36), 34, 36), 9, 7, {
        shy: metaOnly ? [] : [cv(genRiftia(371 + i * 3, L.bone, L.red, 0, 0.5, 34, 36)), cv(genRiftia(371 + i * 3, L.bone, L.red, 0, 1, 34, 36))],
      })
    )
  );
  def("urchin2", () => [L.dark, L.indigo].map((pl, i) => { const [w, h] = metaDims("urchin2", i); return B(A((ph) => genUrchin(381 + i, pl, ph), w, h), 4, 6); }));
  def("star2", () => [L.bone, L.pink].map((pl, i) => { const [w, h] = metaDims("star2", i); return B(A((ph) => genStar(pl, ph), w, h), 4, 3); }));

  // ---------- drifters & set pieces ----------
  def("jelly", () => [L.blue, L.indigo, L.pink].map((pl, i) => { const [w, h] = metaDims("jelly", i); return B(A((ph) => genJelly(401 + i, pl, ph, 6 + (i % 2) * 3), w, h), 0, 7); }));
  def("jelly2", () => [L.magenta, L.cyan, L.purple].map((pl, i) => { const [w, h] = metaDims("jelly2", i); return B(A((ph) => genJelly(411 + i, pl, ph, 7 + (i % 2) * 3), w, h), 0, 7, { glow: [G.mag, G.cyan, G.vio][i], gy: 0.75 }); }));
  def("crab", () => [L.red, L.orange].map((pl, i) => { const [w, h] = metaDims("crab", i); return B(A((ph) => genCrab(pl, ph), w, h), 4, 10); }));
  def("vent", () => [0, 1, 2].map((i) => { const [w, h] = metaDims("vent", i); return B(A((ph) => genVent(421 + i * 5, ph), w, h), 14, 8, { glow: "rgba(110, 225, 255, 0.42)", gy: 0.42 }); }));
  def("chest", () => { const [w, h] = metaDims("chest", 0); return [B(A((ph) => genChest(ph), w, h), 12, 6)]; });
  for (const [name, mk] of jobs) {
    out[name] = mk();
    if (!metaOnly) yield;
  }
  return out;
}

/** Lazily populates pixel-art `f` and `shy` frames onto an already-created BioSet in-place. */
export function hydratePixelBiota(target: BioSet, tint?: [number, number], only?: string[]) {
  const gen = buildBiota(tint, only, false);
  let built: BioSet = {};
  for (;;) {
    const r = gen.next();
    if (r.done) {
      built = r.value;
      break;
    }
  }
  for (const [k, list] of Object.entries(built)) {
    const dst = target[k];
    if (!dst) {
      target[k] = list;
      continue;
    }
    for (let i = 0; i < list.length && i < dst.length; i++) {
      dst[i].f = list[i].f;
      if (list[i].shy) dst[i].shy = list[i].shy;
    }
  }
}

// ============================================================================
// FOREGROUND FRAMING DIORAMA BOULDERS ("Karang oranye dan batu besar di depan")
// High contrast, saturated warm orange staghorns, layered golden-orange table
// corals, deep royal-purple sea fans & chiseled dark boulders framing the view!
// ============================================================================
export function* genForegroundOutcrops(): Generator<void, HTMLCanvasElement[], void> {
  const list: HTMLCanvasElement[] = [];
  const W = 280,
    H = 128;
  // High-contrast dark obsidian rock ramp with warm sunlit rim & deep violet-navy shadow
  const RK = P("#040614", "#0b1128", "#161f42", "#263664", "#3c548c");
  const RIM = P("#3c1b18", "#7a3622", "#c86c34"); // warm golden-amber bounce light on top ledges

  for (let v = 0; v < 4; v++) {
    const p = new Pix(W, H);
    const r = rng(5555 + v * 419);
    const by = H - 1;

    // 1. Stepped boulder / cliff mound profile (tall left/right framing corners, low middle clusters)
    const rockH = (x: number) => {
      const u = (x - W * 0.5) / (W * 0.49);
      if (Math.abs(u) > 1) return 0;
      const arc = Math.sqrt(1 - u * u);
      const tall =
        v === 0
          ? 24 + (1 - x / W) * 32
          : v === 1
            ? 20 + (x / W) * 30
            : v === 2
              ? 18 + Math.sin((x / W) * Math.PI) * 18
              : 22 + Math.cos(((x / W) - 0.5) * 4) * 10;
      const step = Math.round((arc * (tall + Math.sin(x * 0.09 + v * 2) * 6 + Math.cos(x * 0.21) * 2)) / 2) * 2;
      return Math.max(0, step);
    };

    // Draw chiseled dark rock body with strata & warm sunlit rim
    for (let x = 0; x < W; x++) {
      const rh = rockH(x);
      if (rh <= 0) continue;
      const ty = by - rh;
      for (let y = ty; y <= by; y++) {
        const d = y - ty;
        const n = hash2(x >> 1, y >> 1, 91 + v);
        let c: number;
        if (d <= 1) c = x % 5 < 3 ? RIM[2] : RK[4];
        else if (d < 4) c = bayer(x, y) < 0.5 ? RIM[1] : RK[3];
        else if (d < 10) c = n < 0.3 ? RK[3] : RK[2];
        else if ((y + ((Math.sin(x * 0.06 + v) * 4) | 0)) % 13 === 0) c = RK[2];
        else c = bayer(x, y) < 0.35 && d < 22 ? RK[2] : RK[1];
        p.set(x, y, c);
      }
    }
    p.outline(RK[0]);
    // Erase artificial flat cut outline on the very bottom row (keep interior rock flush to viewport bottom)
    for (let x = 0; x < W; x++) {
      if (rockH(x) > 0) {
        p.set(x, by, RK[1]);
      } else {
        p.set(x, by, 0);
      }
    }

    // 2. Crown the dark rock with saturated, high-contrast orange, gold & deep purple corals
    const crown: { x: number; type: string; pal: Pal; w: number; h: number }[] =
      v === 0
        ? [
            { x: 38, type: "branch", pal: PAL.fireOrange, w: 62, h: 64 },
            { x: 86, type: "table", pal: PAL.sunGold, w: 58, h: 36 },
            { x: 132, type: "tubes", pal: PAL.fireOrange, w: 38, h: 46 },
            { x: 175, type: "fan", pal: PAL.royalViolet, w: 54, h: 52 },
            { x: 226, type: "branch", pal: PAL.orange, w: 48, h: 46 },
            { x: 64, type: "anemone", pal: PAL.royalViolet, w: 46, h: 28 },
          ]
        : v === 1
          ? [
              { x: 52, type: "fan", pal: PAL.royalViolet, w: 52, h: 50 },
              { x: 96, type: "tubes", pal: PAL.sunGold, w: 38, h: 46 },
              { x: 148, type: "branch", pal: PAL.fireOrange, w: 60, h: 60 },
              { x: 198, type: "table", pal: PAL.fireOrange, w: 56, h: 34 },
              { x: 242, type: "branch", pal: PAL.sunGold, w: 52, h: 56 },
              { x: 174, type: "grass", pal: PAL.teal, w: 28, h: 26 },
            ]
          : v === 2
            ? [
                { x: 46, type: "tubes", pal: PAL.fireOrange, w: 36, h: 44 },
                { x: 94, type: "brain", pal: PAL.royalViolet, w: 40, h: 24 },
                { x: 142, type: "table", pal: PAL.sunGold, w: 56, h: 34 },
                { x: 194, type: "branch", pal: PAL.fireOrange, w: 54, h: 52 },
                { x: 238, type: "fan", pal: PAL.purple, w: 48, h: 48 },
              ]
            : [
                { x: 48, type: "branch", pal: PAL.fireOrange, w: 56, h: 56 },
                { x: 98, type: "anemone", pal: PAL.fireOrange, w: 48, h: 30 },
                { x: 144, type: "fan", pal: PAL.royalViolet, w: 54, h: 54 },
                { x: 196, type: "tubes", pal: PAL.sunGold, w: 36, h: 46 },
                { x: 236, type: "table", pal: PAL.fireOrange, w: 50, h: 32 },
              ];

    for (const c of crown) {
      const rh = rockH(c.x);
      if (rh <= 3) continue;
      const cy = by - rh + 4;
      const sd = (r() * 999) | 0;
      let sp: Pix | null = null;
      if (c.type === "branch") sp = genBranch(sd, c.pal, 0, c.w, c.h, 15, 3.8, 3);
      else if (c.type === "table") sp = genTable(sd, c.pal, 0, c.w, c.h);
      else if (c.type === "tubes") sp = genTubes(sd, c.pal, 0, c.w, c.h);
      else if (c.type === "fan") sp = genFan(sd, c.pal, c.w, c.h);
      else if (c.type === "grass") sp = genGrass(sd, c.pal, c.w, c.h);
      else if (c.type === "brain") sp = genBrain(sd, c.pal, 0, c.w, c.h);
      else if (c.type === "anemone") sp = genAnemone(sd, c.pal, PAL.sunGold[4], 0, c.w, c.h, 14, 14);
      if (sp) {
        p.blit(sp, c.x - (sp.w >> 1), cy - sp.h + 2);
      }
    }

    list.push(p.toCanvas());
    yield;
  }
  return list;
}

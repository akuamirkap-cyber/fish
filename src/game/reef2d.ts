// ============================================================================
// 2D CLEAN VECTOR-PAINTED REEF BIOTA, ROCKS & PARALLAX LAYERS
// High-resolution Canvas2D illustrations matching the 2D Clean fish style,
// while preserving exact world footprints & colliders for instant toggle back
// to 16-bit Pixel Style whenever desired.
// ============================================================================
import { PAL, NF } from "./reef";
import type { Bio, BioSet } from "./reef";
import { rng, hash2, C } from "./pixel";

type Pal = number[];

export const BIO_2D_SCALE = 2.5;
const TAU = Math.PI * 2;

export function abgrCss(c: number, alpha = 1): string {
  const r = c & 255;
  const g = (c >> 8) & 255;
  const b = (c >> 16) & 255;
  return alpha >= 0.999 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${alpha})`;
}

function mkCv(w: number, h: number, scale = BIO_2D_SCALE): { cv: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const cv = document.createElement("canvas");
  cv.width = Math.max(2, Math.round(w * scale));
  cv.height = Math.max(2, Math.round(h * scale));
  const ctx = cv.getContext("2d")!;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  return { cv, ctx };
}

function tintCv(src: HTMLCanvasElement, col: number, alpha: number): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = src.width;
  cv.height = src.height;
  const c = cv.getContext("2d")!;
  c.drawImage(src, 0, 0);
  c.globalCompositeOperation = "source-atop";
  c.fillStyle = abgrCss(col, alpha);
  c.fillRect(0, 0, cv.width, cv.height);
  return cv;
}

function blurCanvas2d(src: HTMLCanvasElement, radiusPx: number): HTMLCanvasElement {
  const w = src.width;
  const h = src.height;
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const c = cv.getContext("2d")!;
  if (typeof c.filter === "string") {
    const pad = Math.min(w >> 1, Math.max(8, Math.ceil(radiusPx * 4)));
    const tmp = document.createElement("canvas");
    tmp.width = w + pad * 2;
    tmp.height = h;
    const tc = tmp.getContext("2d")!;
    tc.drawImage(src, w - pad, 0, pad, h, 0, 0, pad, h);
    tc.drawImage(src, 0, 0, w, h, pad, 0, w, h);
    tc.drawImage(src, 0, 0, pad, h, pad + w, 0, pad, h);
    c.filter = `blur(${radiusPx.toFixed(2)}px)`;
    c.drawImage(tmp, -pad, 0);
    c.filter = "none";
    return cv;
  }
  const r = Math.max(1, Math.round(radiusPx * 1.45));
  c.drawImage(src, 0, 0);
  const img = c.getImageData(0, 0, w, h);
  const d = img.data;
  const prem = new Float32Array(w * h * 4);
  const tmp = new Float32Array(w * h * 4);

  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3] / 255;
    prem[i] = d[i] * a;
    prem[i + 1] = d[i + 1] * a;
    prem[i + 2] = d[i + 2] * a;
    prem[i + 3] = d[i + 3];
  }

  const inv = 1 / (r * 2 + 1);
  for (let pass = 0; pass < 2; pass++) {
    // Horizontal sliding sum (wraps horizontally so tiling ridges have zero seam)
    for (let y = 0; y < h; y++) {
      const row = y * w * 4;
      let sr = 0,
        sg = 0,
        sb = 0,
        sa = 0;
      for (let k = -r; k <= r; k++) {
        const wx = ((k % w) + w) % w;
        const xi = row + wx * 4;
        sr += prem[xi];
        sg += prem[xi + 1];
        sb += prem[xi + 2];
        sa += prem[xi + 3];
      }
      for (let x = 0; x < w; x++) {
        const oi = row + x * 4;
        tmp[oi] = sr * inv;
        tmp[oi + 1] = sg * inv;
        tmp[oi + 2] = sb * inv;
        tmp[oi + 3] = sa * inv;
        const addX = ((x + r + 1) % w) * 4 + row;
        const remX = (((x - r) % w) + w) % w * 4 + row;
        sr += prem[addX] - prem[remX];
        sg += prem[addX + 1] - prem[remX + 1];
        sb += prem[addX + 2] - prem[remX + 2];
        sa += prem[addX + 3] - prem[remX + 3];
      }
    }
    // Vertical sliding sum (clamped vertically)
    for (let x = 0; x < w; x++) {
      let sr = 0,
        sg = 0,
        sb = 0,
        sa = 0;
      for (let k = -r; k <= r; k++) {
        const wy = Math.max(0, Math.min(h - 1, k));
        const yi = (wy * w + x) * 4;
        sr += tmp[yi];
        sg += tmp[yi + 1];
        sb += tmp[yi + 2];
        sa += tmp[yi + 3];
      }
      for (let y = 0; y < h; y++) {
        const oi = (y * w + x) * 4;
        prem[oi] = sr * inv;
        prem[oi + 1] = sg * inv;
        prem[oi + 2] = sb * inv;
        prem[oi + 3] = sa * inv;
        const addY = (Math.min(h - 1, y + r + 1) * w + x) * 4;
        const remY = (Math.max(0, y - r) * w + x) * 4;
        sr += tmp[addY] - tmp[remY];
        sg += tmp[addY + 1] - tmp[remY + 1];
        sb += tmp[addY + 2] - tmp[remY + 2];
        sa += tmp[addY + 3] - tmp[remY + 3];
      }
    }
  }

  for (let i = 0; i < d.length; i += 4) {
    const a = prem[i + 3];
    if (a > 0.5) {
      const invA = 255 / a;
      d[i] = Math.min(255, Math.round(prem[i] * invA));
      d[i + 1] = Math.min(255, Math.round(prem[i + 1] * invA));
      d[i + 2] = Math.min(255, Math.round(prem[i + 2] * invA));
      d[i + 3] = Math.min(255, Math.round(a));
    } else {
      d[i] = d[i + 1] = d[i + 2] = d[i + 3] = 0;
    }
  }
  c.putImageData(img, 0, 0);
  return cv;
}

// ---------------------------------------------------------------------------
// 2D CORAL & SEA CREATURE GENERATORS (exact same world w, h as reef.ts!)
// ---------------------------------------------------------------------------

function drawBranch2d(ctx: CanvasRenderingContext2D, seed: number, pal: Pal, w: number, h: number, len: number, th: number, depth: number, knob = false) {
  const r = rng(seed);
  const cx = w * 0.5;
  const by = h - 1;
  const segs: { x1: number; y1: number; x2: number; y2: number; t: number; tip: boolean }[] = [];
  const collect = (x: number, y: number, a: number, l: number, t: number, d: number) => {
    const x2 = x + Math.cos(a) * l;
    const y2 = y + Math.sin(a) * l;
    const clampedY2 = Math.max(3, Math.min(by - 1, y2));
    const clampedX2 = Math.max(3, Math.min(w - 3, x2));
    segs.push({ x1: x, y1: y, x2: clampedX2, y2: clampedY2, t, tip: d <= 0 || l <= 4 });
    if (d > 0 && l > 4) {
      const n = d >= 2 && r() < 0.4 ? 3 : 2;
      for (let i = 0; i < n; i++) {
        const sp = n === 3 ? (i - 1) * (0.5 + r() * 0.2) : (i ? 1 : -1) * (0.3 + r() * 0.3);
        const na = Math.max(-Math.PI + 0.3, Math.min(-0.3, a + sp));
        collect(clampedX2, clampedY2, na, l * (0.62 + r() * 0.2), Math.max(1.3, t * 0.72), d - 1);
      }
    }
  };
  const trunks = 1 + (r() < 0.65 ? 1 : 0);
  for (let i = 0; i < trunks; i++) {
    const o = i - (trunks - 1) / 2;
    collect(cx + o * 5, by - 2, -Math.PI / 2 + (r() - 0.5) * 0.45 + o * 0.45, len * (0.85 + r() * 0.3), th, depth);
  }
  // 1. Holdfast + thin refined outline pass
  ctx.strokeStyle = abgrCss(pal[0], 0.72);
  ctx.fillStyle = abgrCss(pal[0], 0.72);
  ctx.beginPath();
  ctx.ellipse(cx, by - 1.5, th + 2.8, 2.3, 0, 0, TAU);
  ctx.fill();
  for (const s of segs) {
    ctx.lineWidth = s.t * 2 + 0.9;
    ctx.beginPath();
    ctx.moveTo(s.x1, s.y1);
    ctx.lineTo(s.x2, s.y2);
    ctx.stroke();
    if (knob && s.tip) {
      ctx.beginPath();
      ctx.arc(s.x2, s.y2, s.t + 0.75, 0, TAU);
      ctx.fill();
    }
  }
  // 2. Shadow + base body
  ctx.strokeStyle = abgrCss(pal[1]);
  for (const s of segs) {
    ctx.lineWidth = s.t * 2;
    ctx.beginPath();
    ctx.moveTo(s.x1 + 0.5, s.y1 + 0.5);
    ctx.lineTo(s.x2 + 0.5, s.y2 + 0.5);
    ctx.stroke();
  }
  ctx.fillStyle = abgrCss(pal[2]);
  ctx.beginPath();
  ctx.ellipse(cx, by - 1.5, th + 2.4, 2, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = abgrCss(pal[2]);
  for (const s of segs) {
    ctx.lineWidth = s.t * 1.75;
    ctx.beginPath();
    ctx.moveTo(s.x1, s.y1);
    ctx.lineTo(s.x2, s.y2);
    ctx.stroke();
  }
  // 3. Upper-left lit rim + glowing tips
  ctx.strokeStyle = abgrCss(pal[3]);
  for (const s of segs) {
    ctx.lineWidth = Math.max(0.8, s.t * 0.85);
    ctx.beginPath();
    ctx.moveTo(s.x1 - 0.5, s.y1 - 0.5);
    ctx.lineTo(s.x2 - 0.5, s.y2 - 0.5);
    ctx.stroke();
    if (s.tip) {
      ctx.fillStyle = abgrCss(pal[4]);
      ctx.beginPath();
      ctx.arc(s.x2, s.y2, knob ? s.t + 0.5 : Math.max(1.2, s.t * 0.85), 0, TAU);
      ctx.fill();
    }
  }
}

function drawTable2d(ctx: CanvasRenderingContext2D, seed: number, pal: Pal, w: number, h: number) {
  const r = rng(seed);
  const cx = w * 0.5;
  const by = h - 1;
  const tiers = r() < 0.5 ? 2 : 1;
  let sy = by;
  let ox = 0;
  let R = w * 0.5 - 3;
  for (let t = 0; t < tiers; t++) {
    const sh = 6 + ((r() * 5) | 0);
    const py = sy - sh - 1;
    // Pedestal stem
    ctx.fillStyle = abgrCss(pal[1]);
    ctx.strokeStyle = abgrCss(pal[0], 0.72);
    ctx.lineWidth = 0.72;
    ctx.beginPath();
    ctx.moveTo(cx + ox - 4, sy);
    ctx.quadraticCurveTo(cx + ox - 2, sy - sh * 0.5, cx + ox - R * 0.3, py + 1);
    ctx.lineTo(cx + ox + R * 0.3, py + 1);
    ctx.quadraticCurveTo(cx + ox + 2, sy - sh * 0.5, cx + ox + 4, sy);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Plate shadow + top disc
    ctx.fillStyle = abgrCss(pal[1]);
    ctx.beginPath();
    ctx.ellipse(cx + ox, py + 1.4, R, 3.1, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();

    const grad = ctx.createLinearGradient(cx + ox - R, py - 2, cx + ox + R, py + 2);
    grad.addColorStop(0, abgrCss(pal[4]));
    grad.addColorStop(0.55, abgrCss(pal[3]));
    grad.addColorStop(1, abgrCss(pal[2]));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(cx + ox, py, R, 2.6, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();

    // Tiny polyp rim dots
    ctx.fillStyle = abgrCss(pal[4]);
    for (let k = -R + 3; k <= R - 3; k += 4) {
      ctx.beginPath();
      ctx.arc(cx + ox + k, py - 0.6, 0.75, 0, TAU);
      ctx.fill();
    }
    sy = py - 2;
    ox = Math.round((r() - 0.5) * R * 0.7);
    R = Math.round(R * (0.55 + r() * 0.12));
  }
}

function drawBrain2d(ctx: CanvasRenderingContext2D, seed: number, pal: Pal, w: number, h: number) {
  const r = rng(seed);
  const cx = w * 0.5;
  const by = h - 1;
  const R = w * 0.5 - 2;
  const H = h - 3;

  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, by, R, H, 0, Math.PI, TAU);
  ctx.closePath();

  const grad = ctx.createRadialGradient(cx - R * 0.32, by - H * 0.65, 1, cx, by - H * 0.2, R * 1.1);
  grad.addColorStop(0, abgrCss(pal[4]));
  grad.addColorStop(0.45, abgrCss(pal[3]));
  grad.addColorStop(0.85, abgrCss(pal[2]));
  grad.addColorStop(1, abgrCss(pal[1]));
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.clip();
  // Smooth organic maze grooves
  ctx.strokeStyle = abgrCss(pal[1], 0.8);
  ctx.lineWidth = 1.6;
  const rows = 4;
  for (let j = 0; j < rows; j++) {
    const yy = by - (j + 0.65) * (H / rows);
    ctx.beginPath();
    for (let x = cx - R; x <= cx + R; x += 3) {
      const ny = yy + Math.sin(x * 0.45 + j * 1.9 + r() * 0.2) * 2.1;
      if (x === cx - R) ctx.moveTo(x, ny);
      else ctx.lineTo(x, ny);
    }
    ctx.stroke();
    ctx.strokeStyle = abgrCss(pal[4], 0.45);
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.strokeStyle = abgrCss(pal[1], 0.8);
    ctx.lineWidth = 1.6;
  }
  ctx.restore();

  ctx.strokeStyle = abgrCss(pal[0], 0.72);
  ctx.lineWidth = 0.75;
  ctx.beginPath();
  ctx.ellipse(cx, by, R, H, 0, Math.PI, TAU);
  ctx.closePath();
  ctx.stroke();
}

function drawPillar2d(ctx: CanvasRenderingContext2D, seed: number, pal: Pal, w: number, h: number) {
  const r = rng(seed);
  const by = h - 1;
  const n = 3 + ((r() * 3) | 0);
  ctx.fillStyle = abgrCss(pal[1]);
  ctx.strokeStyle = abgrCss(pal[0], 0.72);
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.ellipse(w * 0.5, by - 1, w * 0.36, 2.2, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();

  for (let i = 0; i < n; i++) {
    const f = n > 1 ? i / (n - 1) : 0.5;
    const px = 5 + f * (w - 11) + (r() - 0.5) * 2;
    const wd = 2.6 + r() * 1.4;
    const ht = (h - 5) * (0.44 + (1 - Math.abs(f - 0.5) * 1.6) * 0.44 + r() * 0.12);
    const g = ctx.createLinearGradient(px - wd, 0, px + wd, 0);
    g.addColorStop(0, abgrCss(pal[3]));
    g.addColorStop(0.6, abgrCss(pal[2]));
    g.addColorStop(1, abgrCss(pal[1]));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect(px - wd, by - ht, wd * 2, ht, [wd, wd, 1, 1]);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = abgrCss(pal[4]);
    ctx.beginPath();
    ctx.arc(px - wd * 0.25, by - ht + wd * 0.6, wd * 0.38, 0, TAU);
    ctx.fill();
  }
}

function drawLettuce2d(ctx: CanvasRenderingContext2D, seed: number, pal: Pal, w: number, h: number) {
  const r = rng(seed);
  const cx = w * 0.5;
  const by = h - 1;
  const layers = 4;
  ctx.strokeStyle = abgrCss(pal[0], 0.72);
  ctx.lineWidth = 0.68;
  for (let i = 0; i < layers; i++) {
    const f = i / (layers - 1);
    const rx = (w * 0.5 - 2.5) * (1 - f * 0.48);
    const ry = (h - 3.5) * (1 - f * 0.54);
    const ox = (r() - 0.5) * 6 * f;
    ctx.beginPath();
    ctx.moveTo(cx + ox - rx, by);
    for (let s = 0; s <= 18; s++) {
      const u = -1 + (s / 18) * 2;
      const top = by - ry * Math.sqrt(Math.max(0, 1 - u * u)) * (0.86 + 0.14 * Math.sin(u * 8 + i * 1.7));
      ctx.lineTo(cx + ox + u * rx, top);
    }
    ctx.lineTo(cx + ox + rx, by);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, by - ry, 0, by);
    g.addColorStop(0, abgrCss(pal[4]));
    g.addColorStop(0.28, abgrCss(pal[3]));
    g.addColorStop(0.7, abgrCss(pal[2]));
    g.addColorStop(1, abgrCss(pal[1]));
    ctx.fillStyle = g;
    ctx.fill();
    ctx.stroke();
  }
}

function drawFan2d(ctx: CanvasRenderingContext2D, seed: number, pal: Pal, w: number, h: number) {
  const r = rng(seed);
  const cx = w * 0.5;
  const by = h - 1;
  const RX = w * 0.5 - 5;
  const RY = h - 10;
  const cy = by - 5;
  const lob = r() * 6;

  // Soft lacy fan membrane glow
  ctx.save();
  ctx.beginPath();
  for (let s = 0; s <= 36; s++) {
    const a = -Math.PI + (s / 36) * Math.PI;
    const rr = (0.84 + 0.12 * Math.sin(a * 5 + lob)) * (0.8 + 0.2 * Math.sin(-a));
    const px = cx + Math.cos(a) * RX * rr;
    const py = cy + Math.sin(a) * RY * rr;
    if (s === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = abgrCss(pal[2], 0.28);
  ctx.fill();
  ctx.restore();

  const branches: { x1: number; y1: number; x2: number; y2: number; d: number }[] = [];
  const grow = (x: number, y: number, a: number, l: number, d: number) => {
    const x2 = x + Math.cos(a) * l;
    const y2 = y + Math.sin(a) * l;
    branches.push({ x1: x, y1: y, x2, y2, d });
    if (d > 0) {
      grow(x2, y2, a - 0.22 - r() * 0.22, l * (0.72 + r() * 0.18), d - 1);
      grow(x2, y2, a + 0.22 + r() * 0.22, l * (0.72 + r() * 0.18), d - 1);
    }
  };
  for (const a of [-2.15, -1.8, -1.35, -1.0]) grow(cx, cy, a + (r() - 0.5) * 0.14, RY * 0.3, 4);

  // Thin refined outline pass
  ctx.strokeStyle = abgrCss(pal[0], 0.72);
  ctx.lineWidth = 3.1;
  ctx.beginPath();
  ctx.moveTo(cx, by);
  ctx.lineTo(cx, cy);
  ctx.stroke();
  for (const b of branches) {
    ctx.lineWidth = (b.d >= 3 ? 1.85 : 1.0) + 0.65;
    ctx.beginPath();
    ctx.moveTo(b.x1, b.y1);
    ctx.lineTo(b.x2, b.y2);
    ctx.stroke();
  }
  // Colored veins
  ctx.strokeStyle = abgrCss(pal[2]);
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(cx, by);
  ctx.lineTo(cx, cy);
  ctx.stroke();
  for (const b of branches) {
    ctx.strokeStyle = abgrCss(b.d >= 3 ? pal[2] : b.d >= 1 ? pal[3] : pal[4]);
    ctx.lineWidth = b.d >= 3 ? 1.8 : b.d >= 1 ? 1.1 : 0.8;
    ctx.beginPath();
    ctx.moveTo(b.x1, b.y1);
    ctx.lineTo(b.x2, b.y2);
    ctx.stroke();
  }
}

function drawWhip2d(ctx: CanvasRenderingContext2D, seed: number, pal: Pal, w: number, h: number, glow = false) {
  const r = rng(seed);
  const cx = w * 0.5;
  const by = h - 1;
  const n = 3 + ((r() * 3) | 0);
  const stalks: { pts: [number, number][] }[] = [];
  for (let i = 0; i < n; i++) {
    const f = n > 1 ? i / (n - 1) - 0.5 : 0;
    const len = (h - 6) * (0.55 + r() * 0.45);
    const curv = f * 0.9 + (r() - 0.5) * 0.3;
    const wv = r() * 6;
    const pts: [number, number][] = [];
    for (let s = 0; s <= 12; s++) {
      const t = s / 12;
      const x = cx + f * 7 + curv * t * t * 11 + Math.sin(t * 6 + wv) * 1.4;
      const y = by - 1 - t * len;
      pts.push([x, y]);
    }
    stalks.push({ pts });
  }
  for (const st of stalks) {
    ctx.strokeStyle = abgrCss(pal[0], 0.72);
    ctx.lineWidth = 2.45;
    ctx.beginPath();
    st.pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.stroke();

    ctx.strokeStyle = abgrCss(pal[2]);
    ctx.lineWidth = 1.8;
    ctx.stroke();

    ctx.fillStyle = abgrCss(glow ? pal[4] : pal[3]);
    for (let k = 2; k < st.pts.length; k += 2) {
      const [px, py] = st.pts[k];
      ctx.beginPath();
      ctx.arc(px + (k % 4 === 0 ? -1.4 : 1.4), py, 0.9, 0, TAU);
      ctx.fill();
    }
  }
}

function drawTubes2d(ctx: CanvasRenderingContext2D, seed: number, pal: Pal, w: number, h: number, barrel = false) {
  const r = rng(seed);
  const by = h - 1;
  const n = barrel ? 1 : 2 + ((r() * 3) | 0);
  ctx.strokeStyle = abgrCss(pal[0], 0.72);
  ctx.lineWidth = 0.72;
  for (let i = 0; i < n; i++) {
    const f = n > 1 ? i / (n - 1) - 0.5 : 0;
    const wd = barrel ? w * 0.5 - 5.5 : 3.2 + r() * 1.5;
    const ht = Math.max(8, (h - 12) * (barrel ? 0.95 : 0.5 + r() * 0.5 - Math.abs(f) * 0.2));
    const tx = w * 0.5 + f * (w - 14) + (r() - 0.5) * 2;
    const lean = (r() - 0.5) * (barrel ? 0 : 4);
    const xTop = tx + lean;
    const yTop = by - ht;
    const hwTop = barrel ? wd * 0.9 : wd * 1.08;
    const hwMid = barrel ? wd * 1.15 : wd * 0.95;

    const g = ctx.createLinearGradient(tx - hwMid, 0, tx + hwMid, 0);
    g.addColorStop(0, abgrCss(pal[3]));
    g.addColorStop(0.55, abgrCss(pal[2]));
    g.addColorStop(1, abgrCss(pal[1]));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(tx - wd * 0.8, by);
    ctx.quadraticCurveTo(tx - hwMid, by - ht * 0.5, xTop - hwTop, yTop);
    ctx.lineTo(xTop + hwTop, yTop);
    ctx.quadraticCurveTo(tx + hwMid, by - ht * 0.5, tx + wd * 0.8, by);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Rim & dark opening
    ctx.fillStyle = abgrCss(pal[4]);
    ctx.beginPath();
    ctx.ellipse(xTop, yTop, hwTop, barrel ? 3.2 : 1.9, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = abgrCss(pal[0]);
    ctx.beginPath();
    ctx.ellipse(xTop, yTop + 0.2, Math.max(1, hwTop - 1.5), barrel ? 1.8 : 1.0, 0, 0, TAU);
    ctx.fill();
  }
}

function drawAnemone2d(ctx: CanvasRenderingContext2D, seed: number, pal: Pal, tip: number, w: number, h: number, n: number, len: number, thin = false) {
  const r = rng(seed);
  const cx = w * 0.5;
  const by = h - 1;
  const y0 = by - (thin ? 3 : 5.5);

  if (!thin) {
    const g = ctx.createLinearGradient(cx - 6, 0, cx + 6, 0);
    g.addColorStop(0, abgrCss(pal[2]));
    g.addColorStop(1, abgrCss(pal[1]));
    ctx.fillStyle = g;
    ctx.strokeStyle = abgrCss(pal[0], 0.72);
    ctx.lineWidth = 0.68;
    ctx.beginPath();
    ctx.roundRect(cx - 6, by - 6, 12, 6, 2);
    ctx.fill();
    ctx.stroke();
  }
  for (let pass = 0; pass < 2; pass++) {
    for (let i = pass; i < n; i += 2) {
      const f = i / (n - 1) - 0.5;
      const a = -Math.PI / 2 + f * (thin ? 2.2 : 1.95);
      const L = len * (0.75 + r() * 0.34) * (1 - Math.abs(f) * 0.22);
      const sx = cx + f * (thin ? 4 : 9);
      const mx = sx + Math.cos(a) * L * 0.55;
      const my = y0 + Math.sin(a) * L * 0.55;
      const ex = sx + Math.cos(a + f * 0.35) * L;
      const ey = y0 + Math.sin(a + f * 0.35) * L;

      ctx.strokeStyle = abgrCss(pal[0], 0.72);
      ctx.lineWidth = thin ? 1.55 : 2.45;
      ctx.beginPath();
      ctx.moveTo(sx, y0);
      ctx.quadraticCurveTo(mx, my, ex, ey);
      ctx.stroke();

      ctx.strokeStyle = abgrCss(pass ? pal[3] : pal[2]);
      ctx.lineWidth = thin ? 1.0 : 1.85;
      ctx.stroke();

      ctx.fillStyle = abgrCss(tip);
      ctx.beginPath();
      ctx.arc(ex, ey, thin ? 0.9 : 1.35, 0, TAU);
      ctx.fill();
    }
  }
}

function drawKelp2d(ctx: CanvasRenderingContext2D, seed: number, pal: Pal, w: number, h: number, bl = 1) {
  const r = rng(seed);
  const cx = w * 0.5;
  const by = h - 1;
  const wv = r() * 6;
  const sx = (y: number) => cx + Math.sin((by - y) * 0.08 + wv) * 2.4 * bl;

  // Stem outline & fill
  ctx.beginPath();
  for (let y = by; y >= 6; y -= 4) {
    const x = sx(y);
    if (y === by) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = abgrCss(pal[0], 0.72);
  ctx.lineWidth = 2.15 * bl + 0.75;
  ctx.stroke();
  ctx.strokeStyle = abgrCss(pal[2]);
  ctx.lineWidth = 1.85 * bl;
  ctx.stroke();

  // Translucent curved leaves + gas bladders
  let side = r() < 0.5 ? 1 : -1;
  for (let y = by - 9; y > 10 * bl; y -= (7 + r() * 3) * bl) {
    const x = sx(y);
    const L = (9 + r() * 5) * bl;
    const dx = side * L * 0.85;
    const dy = -L * 0.52;
    ctx.fillStyle = abgrCss(pal[2]);
    ctx.strokeStyle = abgrCss(pal[0], 0.72);
    ctx.lineWidth = 0.65 * bl;
    ctx.beginPath();
    ctx.moveTo(x + side, y);
    ctx.quadraticCurveTo(x + dx * 0.45, y + dy - 3 * bl, x + dx, y + dy);
    ctx.quadraticCurveTo(x + dx * 0.55, y + dy + 3.2 * bl, x + side, y + 1.2 * bl);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Leaf highlight + gas bladder
    ctx.fillStyle = abgrCss(pal[4]);
    ctx.beginPath();
    ctx.arc(x + side * 1.6 * bl, y, 1.3 * bl, 0, TAU);
    ctx.fill();
    side = -side;
  }
}

function drawGrass2d(ctx: CanvasRenderingContext2D, seed: number, pal: Pal, w: number, h: number) {
  const r = rng(seed);
  const cx = w * 0.5;
  const by = h - 1;
  const n = 5 + ((r() * 4) | 0);
  for (let i = 0; i < n; i++) {
    const bx = cx + (i - n * 0.5) * 2.1;
    const L = (h - 4) * (0.55 + r() * 0.45);
    const curv = (r() - 0.5) * 9;
    ctx.strokeStyle = abgrCss(pal[0], 0.72);
    ctx.lineWidth = 1.95;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.quadraticCurveTo(bx + curv * 0.3, by - L * 0.55, bx + curv, by - L);
    ctx.stroke();

    ctx.strokeStyle = abgrCss(i % 2 === 0 ? pal[3] : pal[2]);
    ctx.lineWidth = 1.35;
    ctx.stroke();
  }
}

function drawWorm2d(ctx: CanvasRenderingContext2D, seed: number, pal: Pal, tube: Pal, ph: number, hide: number, w: number, h: number) {
  const r = rng(seed);
  const by = h - 1;
  const n = 2 + ((r() * 2) | 0);
  const ext = 1 - hide;
  for (let i = 0; i < n; i++) {
    const tx = w * 0.5 + (i - (n - 1) / 2) * 9 + (r() - 0.5) * 2.5;
    const th = 4 + ((r() * 3) | 0);
    ctx.fillStyle = abgrCss(tube[2]);
    ctx.strokeStyle = abgrCss(tube[0], 0.72);
    ctx.lineWidth = 0.65;
    ctx.beginPath();
    ctx.roundRect(tx - 1.8, by - th, 3.6, th + 1, 1);
    ctx.fill();
    ctx.stroke();
    if (ext <= 0.08) continue;
    const ty = by - th;
    for (let k = 0; k < 7; k++) {
      const a = -Math.PI * (0.1 + (k / 6) * 0.8) + Math.sin(TAU * ph + k) * 0.12;
      const L = (6.5 + (k % 2) * 1.4) * ext;
      ctx.strokeStyle = abgrCss(pal[0], 0.72);
      ctx.lineWidth = 1.45;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(tx + Math.cos(a) * L, ty + Math.sin(a) * L);
      ctx.stroke();
      ctx.strokeStyle = abgrCss(k % 2 ? pal[3] : pal[4]);
      ctx.lineWidth = 0.95;
      ctx.stroke();
    }
  }
}

function drawClam2d(ctx: CanvasRenderingContext2D, shell: Pal, mant: Pal, ph: number, hide: number, w: number, h: number) {
  const cx = w * 0.5;
  const by = h - 1.5;
  const R = w * 0.5 - 3;
  const H = h * 0.36;
  const open = (0.58 + 0.42 * Math.sin(TAU * ph)) * (1 - hide);
  const gape = open * 9.5;
  const lipY = (u: number) => by - H - Math.abs(Math.sin(u * Math.PI * 2.5)) * 2.4;

  // 1) Hinged upper shell lid (swings upward & back when open, closes tightly onto lower rim when shut)
  const hingeY = by - H * 0.55;
  const topR = R * 0.96;
  const topPeak = by - H - gape * 1.48 - 4.2;
  const topRimY = (u: number) => lipY(u) - gape * 0.92 + (1 - Math.sqrt(Math.max(0, 1 - u * u))) * 1.2;

  const ug = ctx.createLinearGradient(cx - topR, topPeak, cx + topR, hingeY);
  ug.addColorStop(0, abgrCss(shell[4]));
  ug.addColorStop(0.55, abgrCss(shell[3]));
  ug.addColorStop(1, abgrCss(shell[1]));
  ctx.fillStyle = ug;
  ctx.strokeStyle = abgrCss(shell[0], 0.72);
  ctx.lineWidth = 0.75;
  ctx.beginPath();
  ctx.moveTo(cx - topR, topRimY(-1));
  ctx.quadraticCurveTo(cx - topR * 0.55, topPeak, cx, topPeak);
  ctx.quadraticCurveTo(cx + topR * 0.55, topPeak, cx + topR, topRimY(1));
  for (let s = 12; s >= 0; s--) {
    const u = -1 + (s / 12) * 2;
    ctx.lineTo(cx + u * topR, topRimY(u));
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Fluted ribs on upper shell outer dome
  ctx.strokeStyle = abgrCss(shell[2], 0.55);
  ctx.lineWidth = 0.9;
  for (let k = -3; k <= 3; k++) {
    const u = k / 3.6;
    ctx.beginPath();
    ctx.moveTo(cx + u * topR * 0.28, topPeak + 1.5);
    ctx.quadraticCurveTo(cx + u * topR * 0.72, (topPeak + topRimY(u)) * 0.5, cx + u * topR, topRimY(u));
    ctx.stroke();
  }

  // Mother-of-pearl inner concave ceiling visible under the lifted lid
  if (open > 0.16) {
    const nacre = ctx.createLinearGradient(cx, topPeak + 2, cx, by - H - gape * 0.25);
    nacre.addColorStop(0, "rgba(255, 240, 248, 0.92)");
    nacre.addColorStop(0.6, "rgba(218, 232, 255, 0.85)");
    nacre.addColorStop(1, "rgba(38, 42, 82, 0.95)");
    ctx.fillStyle = nacre;
    ctx.beginPath();
    ctx.ellipse(cx, by - H - gape * 0.78, R * 0.76, Math.max(1.2, gape * 0.42), 0, Math.PI, TAU);
    ctx.fill();
  }

  // 2) Deep dark inner cavity + glowing nacreous Pearl + undulating bi-color mantle
  if (open > 0.12) {
    ctx.fillStyle = "rgba(10, 14, 34, 0.94)";
    ctx.beginPath();
    ctx.ellipse(cx, by - H - gape * 0.36, R * 0.84, Math.max(1.8, gape * 0.52), 0, 0, TAU);
    ctx.fill();

    // Soft pearl aura inside cavity
    const py = by - H - gape * 0.38 - 0.8;
    const pr = 2.6 + open * 1.45;
    if (open > 0.25) {
      const aura = ctx.createRadialGradient(cx, py, 0.5, cx, py, pr * 2.8);
      aura.addColorStop(0, "rgba(255, 248, 228, 0.75)");
      aura.addColorStop(0.5, "rgba(215, 245, 255, 0.28)");
      aura.addColorStop(1, "rgba(215, 245, 255, 0)");
      ctx.fillStyle = aura;
      ctx.beginPath();
      ctx.arc(cx, py, pr * 2.8, 0, TAU);
      ctx.fill();
    }

    // Wavy ruffled clam mantle hugging the lower lip
    const mH = open * 3.4;
    const mg = ctx.createLinearGradient(cx, by - H - mH, cx, by - H + 2);
    mg.addColorStop(0, abgrCss(mant[4]));
    mg.addColorStop(0.55, abgrCss(mant[3]));
    mg.addColorStop(1, abgrCss(mant[1]));
    ctx.fillStyle = mg;
    ctx.strokeStyle = abgrCss(mant[0]);
    ctx.lineWidth = 1.05;
    ctx.beginPath();
    for (let s = 0; s <= 16; s++) {
      const u = -1 + (s / 16) * 2;
      const arch = Math.sqrt(Math.max(0, 1 - u * u));
      const wave = Math.sin(u * 10 + ph * TAU) * 1.15 * open;
      const px = cx + u * R * 0.92;
      const ppy = lipY(u) - arch * mH + wave;
      if (s === 0) ctx.moveTo(px, ppy);
      else ctx.lineTo(px, ppy);
    }
    for (let s = 16; s >= 0; s--) {
      const u = -1 + (s / 16) * 2;
      ctx.lineTo(cx + u * R * 0.92, lipY(u) + 1.4);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Iridescent spots along mantle fold
    ctx.fillStyle = abgrCss(mant[4], 0.85);
    for (let k = -3; k <= 3; k++) {
      const u = k / 4.2;
      const sx = cx + u * R * 0.78;
      const sy = lipY(u) - mH * 0.42 + Math.sin(u * 10 + ph * TAU) * 0.7;
      ctx.beginPath();
      ctx.arc(sx, sy, 0.85, 0, TAU);
      ctx.fill();
    }

    // 3D Luminous Nacre Pearl centered on cushion
    if (open > 0.25) {
      const pg = ctx.createRadialGradient(cx - pr * 0.34, py - pr * 0.34, pr * 0.14, cx, py, pr);
      pg.addColorStop(0, "#ffffff");
      pg.addColorStop(0.45, "#fff5eb");
      pg.addColorStop(0.78, "#f3d9f5");
      pg.addColorStop(1, "#a9bede");
      ctx.fillStyle = pg;
      ctx.strokeStyle = "rgba(110, 130, 175, 0.75)";
      ctx.lineWidth = 0.75;
      ctx.beginPath();
      ctx.arc(cx, py, pr, 0, TAU);
      ctx.fill();
      ctx.stroke();

      // Specular crescent & twinkle glint
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(cx - pr * 0.34, py - pr * 0.34, pr * 0.3, 0, TAU);
      ctx.fill();

      const glint = Math.max(0, Math.sin(ph * TAU * 2));
      if (glint > 0.35) {
        const gs = pr * (0.55 + glint * 0.35);
        ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
        ctx.lineWidth = 0.85;
        ctx.beginPath();
        ctx.moveTo(cx - gs, py - pr * 0.35);
        ctx.lineTo(cx + gs, py - pr * 0.35);
        ctx.moveTo(cx, py - pr * 0.35 - gs);
        ctx.lineTo(cx, py - pr * 0.35 + gs);
        ctx.stroke();
      }
    }
  }

  // 3) Scalloped fluted lower shell base (in front, resting cleanly on seabed)
  const lg = ctx.createLinearGradient(cx - R, by - H, cx + R, by);
  lg.addColorStop(0, abgrCss(shell[4]));
  lg.addColorStop(0.5, abgrCss(shell[3]));
  lg.addColorStop(1, abgrCss(shell[1]));
  ctx.fillStyle = lg;
  ctx.strokeStyle = abgrCss(shell[0], 0.72);
  ctx.lineWidth = 0.78;
  ctx.beginPath();
  ctx.moveTo(cx - R, lipY(-1));
  for (let s = 0; s <= 12; s++) {
    const u = -1 + (s / 12) * 2;
    ctx.lineTo(cx + u * R, lipY(u));
  }
  ctx.quadraticCurveTo(cx + R * 0.82, by, cx, by);
  ctx.quadraticCurveTo(cx - R * 0.82, by, cx - R, lipY(-1));
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Radial flutes + rim highlight on lower shell
  ctx.strokeStyle = abgrCss(shell[4], 0.65);
  ctx.lineWidth = 1.0;
  for (let k = -3; k <= 3; k++) {
    const u = k / 3.5;
    ctx.beginPath();
    ctx.moveTo(cx + u * 2.2, by - 1.2);
    ctx.quadraticCurveTo(cx + u * R * 0.62, by - H * 0.45, cx + u * R, lipY(u) + 0.6);
    ctx.stroke();
  }
}

function drawUrchin2d(ctx: CanvasRenderingContext2D, seed: number, pal: Pal, w: number, h: number) {
  const r = rng(seed);
  const cx = w * 0.5;
  const by = h - 1;
  for (let i = 0; i < 13; i++) {
    const a = -Math.PI * (0.04 + (i / 12) * 0.92);
    const L = 6.2 + r() * 2.5;
    ctx.strokeStyle = abgrCss(pal[0], 0.72);
    ctx.lineWidth = 1.45;
    ctx.beginPath();
    ctx.moveTo(cx, by - 2);
    ctx.lineTo(cx + Math.cos(a) * L, by - 2 + Math.sin(a) * L);
    ctx.stroke();
    ctx.strokeStyle = abgrCss(pal[3]);
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }
  ctx.fillStyle = abgrCss(pal[0]);
  ctx.beginPath();
  ctx.ellipse(cx, by - 1.5, 4.2, 3.4, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = abgrCss(pal[3]);
  ctx.beginPath();
  ctx.arc(cx - 1.3, by - 3.0, 1.1, 0, TAU);
  ctx.fill();
}

function drawStar2d(ctx: CanvasRenderingContext2D, pal: Pal, w: number, h: number) {
  const cx = w * 0.5;
  const cy = h * 0.5;
  ctx.fillStyle = abgrCss(pal[2]);
  ctx.strokeStyle = abgrCss(pal[0], 0.72);
  ctx.lineWidth = 0.72;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 === 0 ? 6.2 : 2.7;
    const px = cx + Math.cos(a) * rad;
    const py = cy + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = abgrCss(pal[4]);
  ctx.beginPath();
  ctx.arc(cx, cy, 1.1, 0, TAU);
  ctx.fill();
}

function drawRiftia2d(ctx: CanvasRenderingContext2D, seed: number, tube: Pal, pal: Pal, ph: number, hide: number, w: number, h: number) {
  const r = rng(seed);
  const by = h - 1;
  const n = 4 + ((r() * 3) | 0);
  const ext = 1 - hide;
  for (let i = 0; i < n; i++) {
    const f = i / (n - 1) - 0.5;
    const bx = w * 0.5 + f * (w - 14);
    const L = (h - 9) * (0.48 + r() * 0.5);
    const lean = f * 5 + (r() - 0.5) * 3;
    const hx = bx + lean;
    const hy = by - L;

    ctx.strokeStyle = abgrCss(tube[0], 0.72);
    ctx.lineWidth = 2.75;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.quadraticCurveTo(bx + lean * 0.3, by - L * 0.5, hx, hy);
    ctx.stroke();
    ctx.strokeStyle = abgrCss(tube[3]);
    ctx.lineWidth = 1.95;
    ctx.stroke();

    if (ext > 0.12) {
      const wob = Math.sin(TAU * ph + i) * 1.2;
      ctx.fillStyle = abgrCss(pal[3]);
      ctx.strokeStyle = abgrCss(pal[0], 0.72);
      ctx.lineWidth = 0.65;
      ctx.beginPath();
      ctx.ellipse(hx + wob * 0.5, hy - 2.6 * ext, 1.9, 3.2 * ext, wob * 0.15, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }
  }
}

function drawPen2d(ctx: CanvasRenderingContext2D, seed: number, pal: Pal, w: number, h: number) {
  const r = rng(seed);
  const cx = w * 0.5;
  const by = h - 1;
  const L = h - 5;
  const lean = (r() - 0.5) * 4;
  ctx.strokeStyle = abgrCss(pal[0], 0.72);
  ctx.lineWidth = 2.0;
  ctx.beginPath();
  ctx.moveTo(cx, by);
  ctx.quadraticCurveTo(cx + lean * 0.4, by - L * 0.5, cx + lean, by - L);
  ctx.stroke();
  ctx.strokeStyle = abgrCss(pal[3]);
  ctx.lineWidth = 1.3;
  ctx.stroke();

  for (let s = 8; s < L; s += 3.2) {
    const t = s / L;
    const px = cx + lean * t * t;
    const py = by - s;
    const span = (1 - Math.abs(t - 0.6) * 1.7) * 6.5 + 1.5;
    ctx.strokeStyle = abgrCss(pal[4]);
    ctx.lineWidth = 1.15;
    ctx.beginPath();
    ctx.moveTo(px - span, py - 1.5);
    ctx.lineTo(px, py);
    ctx.lineTo(px + span, py - 1.5);
    ctx.stroke();
  }
}

function drawTunicate2d(ctx: CanvasRenderingContext2D, seed: number, pal: Pal, w: number, h: number) {
  const r = rng(seed);
  const by = h - 1;
  const n = 4 + ((r() * 3) | 0);
  for (let i = 0; i < n; i++) {
    const f = i / (n - 1) - 0.5;
    const bx = w * 0.5 + f * (w - 12) + (r() - 0.5) * 2;
    const st = 3 + r() * (h - 14);
    const rr = 2.2 + r() * 1.3;
    ctx.strokeStyle = abgrCss(pal[0], 0.72);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(bx, by - st);
    ctx.stroke();
    ctx.strokeStyle = abgrCss(pal[1]);
    ctx.lineWidth = 1.0;
    ctx.stroke();

    const cy = by - st - rr;
    ctx.fillStyle = abgrCss(pal[3], 0.88);
    ctx.strokeStyle = abgrCss(pal[0], 0.72);
    ctx.lineWidth = 0.65;
    ctx.beginPath();
    ctx.ellipse(bx, cy, rr, rr + 1.1, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = abgrCss(pal[4]);
    ctx.beginPath();
    ctx.arc(bx - rr * 0.25, cy - rr * 0.25, rr * 0.42, 0, TAU);
    ctx.fill();
  }
}

function drawCrystal2d(ctx: CanvasRenderingContext2D, seed: number, pal: Pal, w: number, h: number) {
  const r = rng(seed);
  const cx = w * 0.5;
  const by = h - 1;
  const n = 4 + ((r() * 3) | 0);
  const idx = Array.from({ length: n }, (_, i) => i).sort((a, b) => Math.abs(b - (n - 1) / 2) - Math.abs(a - (n - 1) / 2));
  for (const i of idx) {
    const f = n > 1 ? i / (n - 1) - 0.5 : 0;
    const a = -Math.PI / 2 + f * 1.2 + (r() - 0.5) * 0.14;
    const L = (h - 6) * (1 - Math.abs(f) * 0.85) * (0.76 + r() * 0.24);
    const hw = 2.2 + (1 - Math.abs(f) * 1.3) * 2.2;
    const bx = cx + f * 10;
    const ux = Math.cos(a);
    const uy = Math.sin(a);
    const nx = -uy;
    const ny = ux;
    const tx = bx + ux * L;
    const ty = by - 1 + uy * L;
    const sx = bx + ux * L * 0.78;
    const sy = by - 1 + uy * L * 0.78;

    // Lit left facet
    ctx.fillStyle = abgrCss(pal[3]);
    ctx.beginPath();
    ctx.moveTo(bx - nx * hw, by - 1 - ny * hw);
    ctx.lineTo(sx - nx * hw, sy - ny * hw);
    ctx.lineTo(tx, ty);
    ctx.lineTo(sx, sy);
    ctx.lineTo(bx, by - 1);
    ctx.closePath();
    ctx.fill();

    // Shaded right facet
    ctx.fillStyle = abgrCss(pal[1]);
    ctx.beginPath();
    ctx.moveTo(bx, by - 1);
    ctx.lineTo(sx, sy);
    ctx.lineTo(tx, ty);
    ctx.lineTo(sx + nx * hw, sy + ny * hw);
    ctx.lineTo(bx + nx * hw, by - 1 + ny * hw);
    ctx.closePath();
    ctx.fill();

    // Specular edge & crisp thin outline
    ctx.strokeStyle = abgrCss(pal[4]);
    ctx.lineWidth = 0.95;
    ctx.beginPath();
    ctx.moveTo(bx, by - 1);
    ctx.lineTo(tx, ty);
    ctx.stroke();

    ctx.strokeStyle = abgrCss(pal[0], 0.72);
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(bx - nx * hw, by - 1 - ny * hw);
    ctx.lineTo(sx - nx * hw, sy - ny * hw);
    ctx.lineTo(tx, ty);
    ctx.lineTo(sx + nx * hw, sy + ny * hw);
    ctx.lineTo(bx + nx * hw, by - 1 + ny * hw);
    ctx.closePath();
    ctx.stroke();

    // Tip sparkle
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(tx, ty, 1.0, 0, TAU);
    ctx.fill();
  }
}

function drawShelf2d(ctx: CanvasRenderingContext2D, seed: number, pal: Pal, w: number, h: number) {
  const r = rng(seed);
  const n = 2 + ((r() * 2) | 0);
  ctx.lineJoin = "round";
  for (let i = 0; i < n; i++) {
    const cy = 5 + i * ((h - 9) / n) + r() * 1.5;
    const R = (w - 4) * (0.58 + r() * 0.32) * (1 - i * 0.14);
    const th = 2.8 + r() * 1.1;
    const g = ctx.createLinearGradient(0, cy - th, R, cy + th);
    g.addColorStop(0, abgrCss(pal[2]));
    g.addColorStop(0.55, abgrCss(pal[3]));
    g.addColorStop(1, abgrCss(pal[4]));
    ctx.fillStyle = g;
    ctx.strokeStyle = abgrCss(pal[0], 0.62);
    ctx.lineWidth = 0.65;
    ctx.beginPath();
    ctx.moveTo(0, cy - th * 0.65);
    ctx.bezierCurveTo(R * 0.35, cy - th * 1.1, R * 0.85, cy - th * 0.9, R, cy - th * 0.15);
    ctx.quadraticCurveTo(R * 1.04, cy + th * 0.55, R * 0.72, cy + th * 0.85);
    ctx.quadraticCurveTo(R * 0.35, cy + th * 0.95, 0, cy + th * 0.55);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Scalloped growth ring highlight on bracket plate
    ctx.strokeStyle = abgrCss(pal[4], 0.55);
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(2, cy - th * 0.2);
    ctx.quadraticCurveTo(R * 0.65, cy - th * 0.4, R * 0.85, cy);
    ctx.stroke();
  }
}

function drawVine2d(ctx: CanvasRenderingContext2D, seed: number, pal: Pal, w: number, h: number, glow = false) {
  const r = rng(seed);
  const n = 2 + ((r() * 2) | 0);
  for (let i = 0; i < n; i++) {
    const bx = w * 0.5 + (i - (n - 1) / 2) * 4 + (r() - 0.5) * 2;
    const L = (h - 4) * (0.55 + r() * 0.45);
    const wv = r() * 6;
    ctx.strokeStyle = abgrCss(pal[0], 0.72);
    ctx.lineWidth = 1.75;
    ctx.beginPath();
    let lx = bx;
    for (let s = 0; s <= L; s += 2) {
      lx = bx + Math.sin(s * 0.32 + wv) * 1.4;
      if (s === 0) ctx.moveTo(lx, s);
      else ctx.lineTo(lx, s);
    }
    ctx.stroke();
    ctx.strokeStyle = abgrCss(pal[2]);
    ctx.lineWidth = 1.15;
    ctx.stroke();

    ctx.fillStyle = abgrCss(pal[4]);
    ctx.beginPath();
    ctx.arc(lx, L, glow ? 1.6 : 1.2, 0, TAU);
    ctx.fill();
  }
}

function drawJelly2d(ctx: CanvasRenderingContext2D, seed: number, pal: Pal, ph: number, R: number, w: number) {
  const r = rng(seed);
  const cx = w * 0.5;
  const k = Math.sin(TAU * ph);
  const rx = R * (1 + 0.13 * k);
  const ry = R * 0.82 * (1 - 0.15 * k);
  const cy = R * 0.95 + 2 - k;

  // Tentacles
  const nt = R > 7 ? 7 : 5;
  for (let i = 0; i < nt; i++) {
    const f = i / (nt - 1) - 0.5;
    const x0 = cx + f * rx * 1.55;
    const L = R * (1.55 + r() * 1.0);
    const ws = r() * 6;
    ctx.strokeStyle = abgrCss(i % 2 ? pal[3] : pal[2], 0.82);
    ctx.lineWidth = 1.0;
    ctx.beginPath();
    ctx.moveTo(x0, cy + 1);
    for (let s = 2; s <= L; s += 2) {
      const t = s / L;
      ctx.lineTo(x0 + Math.sin(TAU * ph - s * 0.45 + ws) * 1.7 * t - f * t * 2 * k, cy + 1 + s);
    }
    ctx.stroke();
  }

  // Translucent dome bell
  const g = ctx.createRadialGradient(cx - rx * 0.25, cy - ry * 0.55, 1, cx, cy - ry * 0.2, rx * 1.1);
  g.addColorStop(0, abgrCss(pal[4], 0.92));
  g.addColorStop(0.55, abgrCss(pal[3], 0.8));
  g.addColorStop(1, abgrCss(pal[2], 0.88));
  ctx.fillStyle = g;
  ctx.strokeStyle = abgrCss(pal[1]);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, Math.PI, TAU);
  ctx.quadraticCurveTo(cx + rx * 0.5, cy + 1.5, cx, cy);
  ctx.quadraticCurveTo(cx - rx * 0.5, cy + 1.5, cx - rx, cy);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function drawCrab2d(ctx: CanvasRenderingContext2D, pal: Pal, ph: number, w: number, h: number) {
  const cx = w * 0.5;
  const by = h - 1.0;
  const st = Math.sin(TAU * ph);
  const stepAlt = st > 0 ? 1 : 0;

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // 1. Six articulated slender walking legs (3 per side)
  for (const s of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const lift = ((i + stepAlt + (s > 0 ? 1 : 0)) & 1) * 0.85;
      const hipX = cx + s * (3.1 + i * 0.45);
      const hipY = by - 2.6 + i * 0.35;
      const kneeX = cx + s * (5.2 + i * 0.9);
      const kneeY = by - 3.0 - lift * 0.6 + i * 0.3;
      const tipX = cx + s * (6.3 + i * 1.05);
      const tipY = by - 0.1 - lift;

      ctx.strokeStyle = abgrCss(pal[0], 0.7);
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.moveTo(hipX, hipY);
      ctx.lineTo(kneeX, kneeY);
      ctx.lineTo(tipX, tipY);
      ctx.stroke();

      ctx.strokeStyle = abgrCss(pal[2]);
      ctx.lineWidth = 0.75;
      ctx.stroke();
    }
  }

  // 2. Sculpted glossy crab carapace with thin refined outline
  const shellG = ctx.createRadialGradient(cx - 1.2, by - 4.4, 0.5, cx, by - 3.3, 5.2);
  shellG.addColorStop(0, abgrCss(pal[4]));
  shellG.addColorStop(0.45, abgrCss(pal[3]));
  shellG.addColorStop(0.85, abgrCss(pal[2]));
  shellG.addColorStop(1, abgrCss(pal[1]));
  ctx.fillStyle = shellG;
  ctx.strokeStyle = abgrCss(pal[0], 0.72);
  ctx.lineWidth = 0.55;
  ctx.beginPath();
  ctx.moveTo(cx - 4.5, by - 3.2);
  ctx.bezierCurveTo(cx - 4.8, by - 5.4, cx - 2.5, by - 6.0, cx, by - 5.8);
  ctx.bezierCurveTo(cx + 2.5, by - 6.0, cx + 4.8, by - 5.4, cx + 4.5, by - 3.2);
  ctx.quadraticCurveTo(cx + 3.2, by - 1.3, cx, by - 1.3);
  ctx.quadraticCurveTo(cx - 3.2, by - 1.3, cx - 4.5, by - 3.2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Warm cream underbelly lip & specular shell arc
  ctx.fillStyle = "rgba(255, 240, 215, 0.72)";
  ctx.beginPath();
  ctx.ellipse(cx, by - 2.05, 2.5, 0.65, 0, 0, TAU);
  ctx.fill();

  ctx.strokeStyle = "rgba(255, 255, 255, 0.55)";
  ctx.lineWidth = 0.55;
  ctx.beginPath();
  ctx.arc(cx - 0.6, by - 3.9, 2.3, Math.PI * 1.15, Math.PI * 1.78);
  ctx.stroke();

  // 3. Articulated arms + V-shaped snapping pincer claws
  for (const s of [-1, 1]) {
    const snap = Math.max(0, Math.sin(TAU * ph + (s > 0 ? 0 : 1.5))) * 0.28;
    const armY = by - 5.6 - (stepAlt ^ (s > 0 ? 1 : 0)) * 0.45;
    const clX = cx + s * 5.6;
    const clY = armY;

    // Arm segment
    ctx.strokeStyle = abgrCss(pal[0], 0.68);
    ctx.lineWidth = 1.35;
    ctx.beginPath();
    ctx.moveTo(cx + s * 3.6, by - 4.1);
    ctx.quadraticCurveTo(cx + s * 5.4, by - 4.5, clX, clY + 0.6);
    ctx.stroke();
    ctx.strokeStyle = abgrCss(pal[2]);
    ctx.lineWidth = 0.85;
    ctx.stroke();

    // Pincer claw (two curved jaws)
    ctx.save();
    ctx.translate(clX, clY);
    ctx.scale(s, 1);
    ctx.fillStyle = abgrCss(pal[3]);
    ctx.strokeStyle = abgrCss(pal[0], 0.72);
    ctx.lineWidth = 0.5;
    // Lower jaw
    ctx.beginPath();
    ctx.moveTo(-0.4, 0.6);
    ctx.quadraticCurveTo(1.3, 0.9, 1.9, -0.3 + snap);
    ctx.quadraticCurveTo(0.8, -0.3, -0.5, 0.0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Upper jaw
    ctx.fillStyle = abgrCss(pal[4]);
    ctx.beginPath();
    ctx.moveTo(-0.5, 0.2);
    ctx.quadraticCurveTo(0.4, -1.5, 1.8, -1.1 - snap);
    ctx.quadraticCurveTo(0.8, -0.4, -0.3, 0.3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // 4. Expressive eye stalks with white eyeballs + dark pupils + catchlights
  for (const s of [-1, 1]) {
    const ex = cx + s * 1.65;
    const ey = by - 6.95;
    ctx.strokeStyle = abgrCss(pal[1]);
    ctx.lineWidth = 0.75;
    ctx.beginPath();
    ctx.moveTo(cx + s * 1.2, by - 5.5);
    ctx.lineTo(ex, ey);
    ctx.stroke();

    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = abgrCss(pal[0], 0.7);
    ctx.lineWidth = 0.4;
    ctx.beginPath();
    ctx.arc(ex, ey, 0.95, 0, TAU);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#0e1222";
    ctx.beginPath();
    ctx.arc(ex + s * 0.15, ey, 0.52, 0, TAU);
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(ex - 0.18, ey - 0.25, 0.22, 0, TAU);
    ctx.fill();
  }

  ctx.restore();
}

function drawVent2d(ctx: CanvasRenderingContext2D, seed: number, ph: number, w: number, h: number) {
  const r = rng(seed);
  const cx = w * 0.5;
  const by = h - 1;
  const R = PAL.basalt;
  const E = PAL.ember;
  const ht = 35 + ((r() * 8) | 0);

  const drawVolcanoCone = (bx: number, hh: number, bw: number, tw: number, hasFissure: boolean) => {
    const topX = bx + Math.sin(seed * 1.3) * 1.4;
    const topY = by - hh;

    // Sculpted basalt slope gradient
    const g = ctx.createLinearGradient(bx - bw, topY, bx + bw, by);
    g.addColorStop(0, abgrCss(R[4]));
    g.addColorStop(0.5, abgrCss(R[3]));
    g.addColorStop(0.82, abgrCss(R[2]));
    g.addColorStop(1, abgrCss(R[1]));

    ctx.fillStyle = g;
    ctx.strokeStyle = abgrCss(R[0], 0.72);
    ctx.lineWidth = 0.85;
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(bx - bw, by);
    // Jagged flaring concave volcanic silhouette
    ctx.bezierCurveTo(
      bx - bw * 0.64,
      by - hh * 0.24,
      bx - tw * 1.8,
      by - hh * 0.66,
      topX - tw,
      topY + 1.2
    );
    // Irregular caldera crater rim notch
    ctx.lineTo(topX - tw * 0.45, topY - 1.2);
    ctx.lineTo(topX, topY + 0.5);
    ctx.lineTo(topX + tw * 0.52, topY - 1.1);
    ctx.lineTo(topX + tw, topY + 1.2);
    ctx.bezierCurveTo(
      bx + tw * 1.85,
      by - hh * 0.66,
      bx + bw * 0.66,
      by - hh * 0.24,
      bx + bw,
      by
    );
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Faceted volcanic rock ridge highlights
    ctx.strokeStyle = abgrCss(R[4], 0.45);
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(topX - tw * 0.45, topY + 2);
    ctx.quadraticCurveTo(bx - bw * 0.28, by - hh * 0.45, bx - bw * 0.56, by - 1);
    ctx.stroke();

    ctx.strokeStyle = abgrCss(R[1], 0.55);
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(topX + tw * 0.4, topY + 2);
    ctx.quadraticCurveTo(bx + bw * 0.28, by - hh * 0.42, bx + bw * 0.54, by - 1);
    ctx.stroke();

    // Pulsing glowing thermal magma fissures along rock cracks
    if (hasFissure) {
      const pulse = 0.65 + 0.35 * Math.sin(ph * TAU * 2);
      ctx.strokeStyle = abgrCss(E[2], 0.85 * pulse);
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(topX - 1.2, topY + 3);
      ctx.lineTo(bx - 3.6, by - hh * 0.56);
      ctx.lineTo(bx - 1.5, by - hh * 0.34);
      ctx.lineTo(bx - 5.2, by - hh * 0.14);
      ctx.stroke();

      ctx.strokeStyle = abgrCss(E[4], 0.9 * pulse);
      ctx.lineWidth = 0.75;
      ctx.stroke();

      ctx.strokeStyle = abgrCss(E[2], 0.72 * pulse);
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.moveTo(topX + 2.2, topY + 4);
      ctx.lineTo(bx + 5.8, by - hh * 0.52);
      ctx.lineTo(bx + 4.0, by - hh * 0.3);
      ctx.stroke();
    }

    // Recessed volcanic crater bowl with warm glowing core
    ctx.fillStyle = abgrCss(R[0]);
    ctx.beginPath();
    ctx.ellipse(topX, topY + 0.8, tw * 0.92, Math.max(1.4, tw * 0.34), 0, 0, TAU);
    ctx.fill();

    const cg = ctx.createRadialGradient(topX, topY + 0.6, 0.5, topX, topY + 0.6, tw * 0.95);
    cg.addColorStop(0, abgrCss(E[4]));
    cg.addColorStop(0.55, abgrCss(E[3], 0.92));
    cg.addColorStop(1, "rgba(180, 50, 20, 0)");
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.ellipse(topX, topY + 0.6, tw * 0.82, Math.max(1.2, tw * 0.28), 0, 0, TAU);
    ctx.fill();

    return { topX, topY };
  };

  // Secondary parasitic side cone + broad central underwater volcano cone
  drawVolcanoCone(cx - 17, ht * 0.48, 12.5, 3.6, false);
  const { topX, topY } = drawVolcanoCone(cx + 2, ht, 28, 7.6, true);

  // Soft warm thermal upwelling glow just over the crater mouth
  const mouthGlow = ctx.createRadialGradient(topX, topY - 2, 1, topX, topY - 4, 15);
  mouthGlow.addColorStop(0, "rgba(255, 195, 95, 0.45)");
  mouthGlow.addColorStop(0.5, "rgba(95, 225, 255, 0.25)");
  mouthGlow.addColorStop(1, "rgba(95, 225, 255, 0)");
  ctx.fillStyle = mouthGlow;
  ctx.beginPath();
  ctx.arc(topX, topY - 4, 15, 0, TAU);
  ctx.fill();

  // Energetic underwater "volcano air" billowing aqua-white plumes & crisp bubbles
  for (let j = 0; j < 7; j++) {
    const q = (ph + j / 7) % 1;
    const yy = topY - 2 - q * 50;
    const xx = topX + Math.sin(q * 6 + j * 1.9) * (2.5 + q * 7.5);
    const rad = 2.4 + q * 6.8;
    const alpha = Math.sin(q * Math.PI) * 0.62;
    const pg = ctx.createRadialGradient(xx - rad * 0.25, yy - rad * 0.25, rad * 0.1, xx, yy, rad);
    if (q < 0.18) {
      pg.addColorStop(0, `rgba(255, 225, 150, ${(0.75 - q * 2).toFixed(3)})`);
      pg.addColorStop(1, "rgba(110, 230, 255, 0)");
    } else {
      pg.addColorStop(0, `rgba(225, 252, 255, ${alpha.toFixed(3)})`);
      pg.addColorStop(0.55, `rgba(115, 224, 248, ${(alpha * 0.65).toFixed(3)})`);
      pg.addColorStop(1, "rgba(60, 165, 220, 0)");
    }
    ctx.fillStyle = pg;
    ctx.beginPath();
    ctx.arc(xx, yy, rad, 0, TAU);
    ctx.fill();

    // Crisp translucent air bubble inside the rising water-volcano jet
    const bx = xx + Math.cos(j * 2.7 + q * 8) * (rad * 0.55);
    const byb = yy - 1.5 - q * 4;
    const br = 1.0 + (1 - q) * 1.35;
    ctx.strokeStyle = `rgba(235, 252, 255, ${((1 - q) * 0.85).toFixed(3)})`;
    ctx.lineWidth = 0.85;
    ctx.beginPath();
    ctx.arc(bx, byb, br, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = `rgba(255, 255, 255, ${((1 - q) * 0.75).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(bx - br * 0.3, byb - br * 0.3, br * 0.32, 0, TAU);
    ctx.fill();
  }
}

function drawChest2d(ctx: CanvasRenderingContext2D, ph: number) {
  const by = 31;
  const W = PAL.wood;
  const G = PAL.gold;
  // Open lid
  ctx.fillStyle = abgrCss(W[1]);
  ctx.strokeStyle = abgrCss(W[0]);
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(9, by - 13);
  ctx.lineTo(32, by - 13);
  ctx.lineTo(34, by - 23);
  ctx.lineTo(11, by - 25);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Gold pile + pearl
  ctx.fillStyle = abgrCss(G[3]);
  ctx.beginPath();
  ctx.ellipse(21, by - 13, 10, 3.8, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "#eef6ff";
  ctx.beginPath();
  ctx.arc(25, by - 16.5, 2.4, 0, TAU);
  ctx.fill();
  // Base box
  ctx.fillStyle = abgrCss(W[2]);
  ctx.beginPath();
  ctx.roundRect(10, by - 12, 22, 12, 1.5);
  ctx.fill();
  ctx.stroke();
  // Brass straps & lock
  ctx.fillStyle = abgrCss(G[3]);
  ctx.fillRect(12.5, by - 12, 2.2, 12);
  ctx.fillRect(27.5, by - 12, 2.2, 12);
  ctx.beginPath();
  ctx.roundRect(19, by - 9, 4.2, 5, 1);
  ctx.fill();
  ctx.stroke();
  // Animated glint star
  const spX = 16 + Math.sin(ph * TAU) * 8;
  const spY = by - 19;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(spX, spY, 1.4, 0, TAU);
  ctx.fill();
}

export function* attach2dBiotaGen(out: BioSet, tint?: [number, number]): Generator<void, void, void> {
  const L = PAL;
  const make = (w: number, h: number, fn: (ctx: CanvasRenderingContext2D) => void): HTMLCanvasElement => {
    const { cv, ctx } = mkCv(w, h);
    fn(ctx);
    return tint ? tintCv(cv, tint[0], tint[1]) : cv;
  };
  const set1 = (list: Bio[] | undefined, anim: Bio["anim"], drawFn: (ctx: CanvasRenderingContext2D, b: Bio, idx: number) => void): boolean => {
    if (!list) return false;
    list.forEach((b, i) => {
      b.f2d = [make(b.w, b.h, (ctx) => drawFn(ctx, b, i))];
      b.anim = anim;
    });
    return true;
  };
  const setFrames = (
    list: Bio[] | undefined,
    nFrames: number,
    drawFn: (ctx: CanvasRenderingContext2D, b: Bio, idx: number, ph: number) => void,
    shyFn?: (ctx: CanvasRenderingContext2D, b: Bio, idx: number, hide: number) => void
  ): boolean => {
    if (!list) return false;
    list.forEach((b, i) => {
      b.f2d = Array.from({ length: nFrames }, (_, f) => make(b.w, b.h, (ctx) => drawFn(ctx, b, i, f / nFrames)));
      if (shyFn) {
        b.shy2d = [
          make(b.w, b.h, (ctx) => shyFn(ctx, b, i, 0.58)),
          make(b.w, b.h, (ctx) => shyFn(ctx, b, i, 1)),
        ];
      }
      b.anim = "frames";
    });
    return true;
  };

  if (set1(out.staghorn, "shimmer", (ctx, b, i) => drawBranch2d(ctx, 11 + i * 7, [L.coral, L.orange, L.blue, L.yellow, L.pink][i], b.w, b.h, 14 + (i % 3), 3.6, 3))) yield;
  if (set1(out.table, "pulse", (ctx, b, i) => drawTable2d(ctx, 31 + i * 5, [L.teal, L.purple, L.yellow, L.pink][i], b.w, b.h))) yield;
  if (set1(out.brain, "shimmer", (ctx, b, i) => drawBrain2d(ctx, 51 + i * 3, [L.yellow, L.green, L.orange][i], b.w, b.h))) yield;
  if (set1(out.pillar, "shimmer", (ctx, b, i) => drawPillar2d(ctx, 61 + i * 9, [L.yellow, L.lime, L.pink][i], b.w, b.h))) yield;
  if (set1(out.lettuce, "shimmer", (ctx, b, i) => drawLettuce2d(ctx, 71 + i * 3, [L.green, L.purple, L.orange][i], b.w, b.h))) yield;
  if (set1(out.fan, "sway", (ctx, b, i) => drawFan2d(ctx, 81 + i * 11, [L.purple, L.pink, L.red, L.orange][i], b.w, b.h))) yield;
  if (set1(out.whip, "sway", (ctx, b, i) => drawWhip2d(ctx, 91 + i * 5, [L.orange, L.red, L.yellow][i], b.w, b.h))) yield;
  if (set1(out.tubes, "pulse", (ctx, b, i) => drawTubes2d(ctx, 101 + i * 7, [L.yellow, L.purple, L.orange, L.blue][i], b.w, b.h))) yield;
  if (set1(out.barrel, "pulse", (ctx, b, i) => drawTubes2d(ctx, 111 + i, [L.red, L.pink][i], b.w, b.h, true))) yield;
  if (
    set1(out.anemone, "pulse", (ctx, b, i) => {
      const pairs: [Pal, number][] = [[L.pink, L.bone[4]], [L.green, L.pink[3]], [L.orange, L.bone[4]], [L.purple, L.yellow[3]]];
      const [pl, tp] = pairs[i];
      drawAnemone2d(ctx, 121 + i * 3, pl, tp, b.w, b.h, 15, 15);
    })
  )
    yield;
  if (
    setFrames(
      out.clam,
      8,
      (ctx, b, i, ph) => drawClam2d(ctx, L.bone, [L.blue, L.purple, L.teal, L.green][i], ph, 0, b.w, b.h),
      (ctx, b, i, hide) => drawClam2d(ctx, L.bone, [L.blue, L.purple, L.teal, L.green][i], 0, hide, b.w, b.h)
    )
  )
    yield;
  if (
    setFrames(
      out.worm,
      4,
      (ctx, b, i, ph) => drawWorm2d(ctx, 131 + i * 7, [L.red, L.yellow, L.blue, L.pink, L.orange][i], L.bone, ph, 0, b.w, b.h),
      (ctx, b, i, hide) => drawWorm2d(ctx, 131 + i * 7, [L.red, L.yellow, L.blue, L.pink, L.orange][i], L.bone, 0, hide, b.w, b.h)
    )
  )
    yield;
  if (set1(out.grass, "sway", (ctx, b, i) => drawGrass2d(ctx, 141 + i, [L.green, L.kelp, L.lime][i], b.w, b.h))) yield;
  if (set1(out.kelp, "sway", (ctx, b, i) => drawKelp2d(ctx, 151 + i * 3, [L.kelp, L.olive, L.kelp][i], b.w, b.h))) yield;
  if (set1(out.kelpBig, "sway", (ctx, b, i) => drawKelp2d(ctx, 191 + i * 3, [L.kelp, L.olive][i], b.w, b.h, 2))) yield;
  if (set1(out.urchin, "pulse", (ctx, b, i) => drawUrchin2d(ctx, 161 + i, [L.dark, L.red, L.purple][i], b.w, b.h))) yield;
  if (set1(out.star, "shimmer", (ctx, b, i) => drawStar2d(ctx, [L.orange, L.red, L.blue][i], b.w, b.h))) yield;
  if (set1(out.shelf, "shimmer", (ctx, b, i) => drawShelf2d(ctx, 171 + i * 3, [L.pink, L.teal, L.orange][i], b.w, b.h))) yield;
  if (set1(out.vine, "sway", (ctx, b, i) => drawVine2d(ctx, 181 + i * 3, [L.kelp, L.green][i], b.w, b.h))) yield;

  // Twilight & Midnight
  if (set1(out.staghorn2, "shimmer", (ctx, b, i) => drawBranch2d(ctx, 211 + i * 7, [L.purple, L.indigo, L.teal][i], b.w, b.h, 15, 3.6, 3))) yield;
  if (set1(out.brain2, "shimmer", (ctx, b, i) => drawBrain2d(ctx, 221 + i * 3, [L.purple, L.indigo][i], b.w, b.h))) yield;
  if (set1(out.lettuce2, "shimmer", (ctx, b, i) => drawLettuce2d(ctx, 231 + i * 3, [L.indigo, L.teal][i], b.w, b.h))) yield;
  if (set1(out.fan2, "sway", (ctx, b, i) => drawFan2d(ctx, 241 + i * 11, [L.indigo, L.magenta, L.blue][i], b.w, b.h))) yield;
  if (set1(out.whip2, "sway", (ctx, b, i) => drawWhip2d(ctx, 251 + i * 5, [L.purple, L.teal][i], b.w, b.h))) yield;
  if (set1(out.barrel2, "pulse", (ctx, b, i) => drawTubes2d(ctx, 261 + i, [L.indigo, L.purple][i], b.w, b.h, true))) yield;
  if (
    set1(out.anemone2, "pulse", (ctx, b, i) => {
      const pairs: [Pal, number][] = [[L.magenta, L.cyan[3]], [L.cyan, L.bone[4]]];
      const [pl, tp] = pairs[i];
      drawAnemone2d(ctx, 271 + i * 3, pl, tp, b.w, b.h, 15, 15);
    })
  )
    yield;
  if (
    set1(out.crinoid, "pulse", (ctx, b, i) => {
      const pairs: [Pal, number][] = [[L.yellow, L.orange[4]], [L.red, L.yellow[3]], [L.orange, L.bone[4]]];
      const [pl, tp] = pairs[i];
      drawAnemone2d(ctx, 281 + i * 3, pl, tp, b.w, b.h, 9, 20, true);
    })
  )
    yield;
  if (set1(out.tunicate, "pulse", (ctx, b, i) => drawTunicate2d(ctx, 291 + i * 3, [L.blue, L.cyan, L.purple][i], b.w, b.h))) yield;
  if (set1(out.shelf2, "shimmer", (ctx, b, i) => drawShelf2d(ctx, 301 + i * 3, [L.purple, L.indigo, L.cyan][i], b.w, b.h))) yield;
  if (set1(out.vine2, "sway", (ctx, b, i) => drawVine2d(ctx, 311 + i * 3, [L.cyan, L.magenta][i], b.w, b.h, true))) yield;
  if (
    set1(out.crinoid2, "pulse", (ctx, b, i) => {
      const pairs: [Pal, number][] = [[L.bone, L.cyan[3]], [L.magenta, L.bone[4]]];
      const [pl, tp] = pairs[i];
      drawAnemone2d(ctx, 321 + i * 3, pl, tp, b.w, b.h, 9, 20, true);
    })
  )
    yield;
  if (set1(out.pen, "sway", (ctx, b, i) => drawPen2d(ctx, 331 + i * 3, [L.magenta, L.cyan, L.ember][i], b.w, b.h))) yield;
  if (set1(out.bamboo, "sway", (ctx, b, i) => drawWhip2d(ctx, 341 + i * 5, [L.cyan, L.bone][i], b.w, b.h, true))) yield;
  if (set1(out.crystal, "shimmer", (ctx, b, i) => drawCrystal2d(ctx, 351 + i * 3, [L.cyan, L.magenta, L.indigo][i], b.w, b.h))) yield;
  if (set1(out.bubblegum, "shimmer", (ctx, b, i) => drawBranch2d(ctx, 361 + i * 7, [L.pink, L.red, L.magenta][i], b.w, b.h, 14, 3.6, 3, true))) yield;
  if (
    setFrames(
      out.riftia,
      4,
      (ctx, b, i, ph) => drawRiftia2d(ctx, 371 + i * 3, L.bone, L.red, ph, 0, b.w, b.h),
      (ctx, b, i, hide) => drawRiftia2d(ctx, 371 + i * 3, L.bone, L.red, 0, hide, b.w, b.h)
    )
  )
    yield;
  if (set1(out.urchin2, "pulse", (ctx, b, i) => drawUrchin2d(ctx, 381 + i, [L.dark, L.indigo][i], b.w, b.h))) yield;
  if (set1(out.star2, "shimmer", (ctx, b, i) => drawStar2d(ctx, [L.bone, L.pink][i], b.w, b.h))) yield;

  if (setFrames(out.jelly, NF, (ctx, b, i, ph) => drawJelly2d(ctx, 401 + i, [L.blue, L.indigo, L.pink][i], ph, 6 + (i % 2) * 3, b.w))) yield;
  if (setFrames(out.jelly2, NF, (ctx, b, i, ph) => drawJelly2d(ctx, 411 + i, [L.magenta, L.cyan, L.purple][i], ph, 7 + (i % 2) * 3, b.w))) yield;
  if (setFrames(out.crab, 4, (ctx, b, i, ph) => drawCrab2d(ctx, [L.red, L.orange][i], ph, b.w, b.h))) yield;
  if (setFrames(out.vent, 8, (ctx, b, i, ph) => drawVent2d(ctx, 421 + i * 5, ph, b.w, b.h))) yield;
  if (setFrames(out.chest, 4, (ctx, _b, _i, ph) => drawChest2d(ctx, ph))) yield;
}

export function attach2dBiota(out: BioSet, tint?: [number, number]) {
  const gen = attach2dBiotaGen(out, tint);
  while (!gen.next().done) {
    /* run synchronously when called directly */
  }
}

export function copy2dBiotaTint(target: BioSet, src: BioSet, tint: [number, number]) {
  for (const key of Object.keys(target)) {
    const list = target[key];
    const srcList = src[key];
    if (!list || !srcList) continue;
    for (let i = 0; i < list.length && i < srcList.length; i++) {
      const b = list[i];
      const sb = srcList[i];
      if (sb.f2d?.length) b.f2d = sb.f2d.map((cv) => tintCv(cv, tint[0], tint[1]));
      if (sb.shy2d?.length) b.shy2d = sb.shy2d.map((cv) => tintCv(cv, tint[0], tint[1]));
      if (sb.anim) b.anim = sb.anim;
    }
  }
}

// ---------------------------------------------------------------------------
// 2D FOREGROUND FRAMING BOULDERS + CORALS
// ---------------------------------------------------------------------------
export function genForegroundOutcrops2d(): HTMLCanvasElement[] {
  const list: HTMLCanvasElement[] = [];
  const W = 280;
  const H = 128;
  const RK = ["#040614", "#0b1128", "#161f42", "#263664", "#3c548c"];
  const RIM = ["#3c1b18", "#7a3622", "#d87c3c"];

  for (let v = 0; v < 4; v++) {
    const { cv, ctx } = mkCv(W, H, 2);
    const r = rng(5555 + v * 419);
    const by = H - 1;
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
      return Math.max(0, arc * (tall + Math.sin(x * 0.09 + v * 2) * 6 + Math.cos(x * 0.21) * 2));
    };

    // Draw background corals behind rock rim first, then rock over base!
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
      const cy = by - rh + 5;
      const sd = (r() * 999) | 0;
      ctx.save();
      ctx.translate(c.x - c.w * 0.5, cy - c.h + 2);
      if (c.type === "branch") drawBranch2d(ctx, sd, c.pal, c.w, c.h, 15, 3.8, 3);
      else if (c.type === "table") drawTable2d(ctx, sd, c.pal, c.w, c.h);
      else if (c.type === "tubes") drawTubes2d(ctx, sd, c.pal, c.w, c.h);
      else if (c.type === "fan") drawFan2d(ctx, sd, c.pal, c.w, c.h);
      else if (c.type === "grass") drawGrass2d(ctx, sd, c.pal, c.w, c.h);
      else if (c.type === "brain") drawBrain2d(ctx, sd, c.pal, c.w, c.h);
      else if (c.type === "anemone") drawAnemone2d(ctx, sd, c.pal, PAL.sunGold[4], c.w, c.h, 14, 14);
      ctx.restore();
    }

    // Smooth dark obsidian boulder mound
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(4, by);
    for (let x = 4; x <= W - 4; x += 4) ctx.lineTo(x, by - rockH(x));
    ctx.lineTo(W - 4, by);
    ctx.closePath();

    const rg = ctx.createLinearGradient(0, by - 58, 0, by);
    rg.addColorStop(0, RK[3]);
    rg.addColorStop(0.22, RK[2]);
    rg.addColorStop(1, RK[1]);
    ctx.fillStyle = rg;
    ctx.fill();

    ctx.clip();
    // Smooth rock strata bands
    ctx.fillStyle = "rgba(38, 54, 100, 0.35)";
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      const y0 = by - 12 - k * 14;
      ctx.ellipse(W * (0.28 + k * 0.22), y0, 70, 12, (k - 1) * 0.1, 0, TAU);
      ctx.fill();
    }
    // Warm sunlit bounce rim along upper crest
    ctx.strokeStyle = RIM[2];
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    for (let x = 6; x <= W - 6; x += 4) {
      const y = by - rockH(x) + 1;
      if (x === 6) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();

    ctx.strokeStyle = "rgba(4, 6, 20, 0.72)";
    ctx.lineWidth = 1.05;
    ctx.beginPath();
    for (let x = 4; x <= W - 4; x += 4) {
      const y = by - rockH(x);
      if (x === 4) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    list.push(cv);
  }
  return list;
}

// ---------------------------------------------------------------------------
// 2D CLEAN ROCKS, FORMATIONS, SEAFLOOR & PARALLAX CLIFFS
// ---------------------------------------------------------------------------
export interface RockPal2d {
  ramp: number[];
  crust: number[];
}

export interface CaveSpec2d {
  kind: "alcove" | "tunnel";
  dir: number; // -1 opens left, 1 opens right, 0 tunnel both sides
  gx: number;
  gy: number;
  grx: number;
  gry: number;
}

function smooth01(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

function evalCaveProfile(
  c: CaveSpec2d,
  seed: number,
  f: number
): { ceilY: number; floorY: number; damp: number } {
  const sA = ((seed * 17) % 113) * 0.11;
  const sB = ((seed * 31) % 97) * 0.14;
  const sC = ((seed * 47) % 83) * 0.19;

  if (c.kind === "tunnel") {
    const arch = Math.sin(f * Math.PI);
    const edgeFlare = Math.pow(1 - arch, 2.2) * 0.14;
    const damp = smooth01(Math.min(f, 1 - f) * 5.5);
    const axisShift = Math.sin(f * Math.PI * 1.15 + sA * 0.5) * Math.sin(sB) * c.gry * 0.12;
    const ceilRelief =
      (Math.sin(f * 6.8 + sA) * 0.12 +
        Math.cos(f * 13.7 + sB) * 0.055 +
        Math.sin(f * 23.1 + sC) * 0.022) *
      (0.35 + 0.65 * damp);
    const floorRelief =
      (Math.sin(f * 5.9 + sC) * 0.085 +
        Math.cos(f * 11.8 + sA) * 0.04 +
        Math.sin(f * 19.4 + sB) * 0.016) *
      (0.35 + 0.65 * damp);
    const ceilY = c.gy + axisShift - c.gry * (0.76 + 0.24 * arch + edgeFlare + ceilRelief);
    const floorY = c.gy + axisShift + c.gry * (0.78 + 0.15 * arch + edgeFlare * 0.7 + floorRelief);
    return { ceilY, floorY, damp };
  }

  // Natural eroded sea-cave alcove: cozy rounded back pocket, organic sculpted throat, flared entrance
  const openK = Math.pow(Math.sin(Math.min(1, f * 1.02) * Math.PI * 0.5), 0.44);
  const dome = Math.sin(Math.pow(f, 0.86) * Math.PI) * 0.15;
  const throatDip = -Math.exp(-Math.pow((f - 0.77) / 0.11, 2)) * 0.085;
  const mouthFlare = Math.pow(Math.max(0, (f - 0.8) / 0.2), 1.55) * 0.16;
  const damp = smooth01(f * 2.4);
  const axisShift = Math.sin(f * Math.PI * 0.92 + sA * 0.35) * Math.sin(sB) * c.gry * 0.13 * damp;
  const ceilRelief =
    (Math.sin(f * 6.4 + sA) * 0.125 +
      Math.cos(f * 13.6 + sB) * 0.055 +
      Math.sin(f * 22.8 + sC) * 0.022) *
    damp;
  const floorRelief =
    (Math.sin(f * 5.4 + sC) * 0.085 +
      Math.cos(f * 11.2 + sA) * 0.04 +
      Math.sin(f * 18.6 + sB) * 0.015) *
    damp;
  const ceilY = c.gy + axisShift - c.gry * (openK * 0.92 + dome + throatDip + mouthFlare + ceilRelief);
  const floorY = c.gy + axisShift + c.gry * (openK * 0.88 + dome * 0.38 + mouthFlare * 0.65 + floorRelief);
  return { ceilY, floorY, damp };
}

/** Exact per-column cave ceiling and floor Y coordinates (in formation canvas local coords, -1 outside span). */
export function sampleCaveBounds(
  c: CaveSpec2d,
  seed: number,
  W: number
): { ceil: Int16Array; floor: Int16Array; xMin: number; xMax: number } {
  const ceil = new Int16Array(W).fill(-1);
  const floor = new Int16Array(W).fill(-1);
  let xMin = W;
  let xMax = -1;

  if (c.kind === "tunnel") {
    const x0 = c.gx - c.grx * 1.12;
    const x1 = c.gx + c.grx * 1.12;
    const xa = Math.max(1, Math.floor(x0));
    const xb = Math.min(W - 2, Math.ceil(x1));
    xMin = xa;
    xMax = xb;
    for (let x = xa; x <= xb; x++) {
      const f = Math.max(0, Math.min(1, (x - x0) / Math.max(1, x1 - x0)));
      const { ceilY, floorY } = evalCaveProfile(c, seed, f);
      ceil[x] = Math.round(ceilY);
      floor[x] = Math.round(Math.max(ceilY + 8, floorY));
    }
  } else {
    const d = c.dir >= 0 ? 1 : -1;
    const bx = c.gx - d * c.grx * 0.86; // rounded deep chamber back wall
    const mx = c.gx + d * c.grx * 1.24; // opens organically into surrounding reef water
    const xa = Math.max(1, Math.floor(Math.min(bx, mx)));
    const xb = Math.min(W - 2, Math.ceil(Math.max(bx, mx)));
    xMin = xa;
    xMax = xb;
    for (let x = xa; x <= xb; x++) {
      const f = Math.max(0, Math.min(1, (x - bx) / (mx - bx)));
      const { ceilY, floorY } = evalCaveProfile(c, seed, f);
      ceil[x] = Math.round(ceilY);
      floor[x] = Math.round(Math.max(ceilY + 4, floorY));
    }
  }
  return { ceil, floor, xMin, xMax };
}

function buildCaveGeom(c: CaveSpec2d, seed: number) {
  const ceilPts: [number, number][] = [];
  const floorPts: [number, number][] = [];
  const steps = 36;
  if (c.kind === "tunnel") {
    const x0 = c.gx - c.grx * 1.12;
    const x1 = c.gx + c.grx * 1.12;
    for (let i = 0; i <= steps; i++) {
      const f = i / steps;
      const x = x0 + (x1 - x0) * f;
      const { ceilY, floorY } = evalCaveProfile(c, seed, f);
      ceilPts.push([x, ceilY]);
      floorPts.push([x, Math.max(ceilY + 8, floorY)]);
    }
  } else {
    const d = c.dir >= 0 ? 1 : -1;
    const bx = c.gx - d * c.grx * 0.86;
    const mx = c.gx + d * c.grx * 1.24;
    for (let i = 0; i <= steps; i++) {
      const f = i / steps;
      const x = bx + (mx - bx) * f;
      const { ceilY, floorY } = evalCaveProfile(c, seed, f);
      ceilPts.push([x, ceilY]);
      floorPts.push([x, Math.max(ceilY + 4, floorY)]);
    }
  }
  return { ceilPts, floorPts };
}

function traceCaveOutline(ctx: CanvasRenderingContext2D, ceilPts: [number, number][], floorPts: [number, number][]) {
  ctx.beginPath();
  ctx.moveTo(ceilPts[0][0], ceilPts[0][1]);
  for (let i = 1; i < ceilPts.length - 1; i++) {
    const mx = (ceilPts[i][0] + ceilPts[i + 1][0]) * 0.5;
    const my = (ceilPts[i][1] + ceilPts[i + 1][1]) * 0.5;
    ctx.quadraticCurveTo(ceilPts[i][0], ceilPts[i][1], mx, my);
  }
  const cEnd = ceilPts[ceilPts.length - 1];
  ctx.lineTo(cEnd[0], cEnd[1]);
  const fEnd = floorPts[floorPts.length - 1];
  ctx.lineTo(fEnd[0], fEnd[1]);
  for (let i = floorPts.length - 2; i > 0; i--) {
    const mx = (floorPts[i][0] + floorPts[i - 1][0]) * 0.5;
    const my = (floorPts[i][1] + floorPts[i - 1][1]) * 0.5;
    ctx.quadraticCurveTo(floorPts[i][0], floorPts[i][1], mx, my);
  }
  ctx.lineTo(floorPts[0][0], floorPts[0][1]);
  ctx.closePath();
}

export function paintPinnacle2d(
  top: Int16Array,
  bot: Int16Array,
  W: number,
  H: number,
  st: RockPal2d,
  seed: number,
  rx: number,
  ry: number,
  cxl: number,
  cyl: number,
  zone = 0,
  cave?: CaveSpec2d
): HTMLCanvasElement {
  const { cv, ctx } = mkCv(W, H, 2);
  const r = rng(seed);
  const ptsT: [number, number][] = [];
  const ptsB: [number, number][] = [];
  let first = -1;
  let last = -1;
  for (let x = 0; x < W; x++) {
    if (top[x] >= 0) {
      if (first < 0) first = x;
      last = x;
    }
  }
  if (first < 0) return cv;
  const step = 6;
  for (let x = first; x <= last; x += step) {
    ptsT.push([x, top[x]]);
    ptsB.push([x, bot[x]]);
  }
  if (ptsT[ptsT.length - 1][0] !== last) {
    ptsT.push([last, top[last]]);
    ptsB.push([last, bot[last]]);
  }

  const traceSmoothSpline = (pts: [number, number][], forward: boolean, startMove: boolean) => {
    if (forward) {
      if (startMove) ctx.moveTo(pts[0][0], pts[0][1]);
      else ctx.lineTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length - 1; i++) {
        const mx = (pts[i][0] + pts[i + 1][0]) * 0.5;
        const my = (pts[i][1] + pts[i + 1][1]) * 0.5;
        ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
      }
      ctx.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
    } else {
      const end = pts.length - 1;
      if (startMove) ctx.moveTo(pts[end][0], pts[end][1]);
      else ctx.lineTo(pts[end][0], pts[end][1]);
      for (let i = end - 1; i > 0; i--) {
        const mx = (pts[i][0] + pts[i - 1][0]) * 0.5;
        const my = (pts[i][1] + pts[i - 1][1]) * 0.5;
        ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
      }
      ctx.lineTo(pts[0][0], pts[0][1]);
    }
  };

  const traceSilhouette = () => {
    ctx.beginPath();
    traceSmoothSpline(ptsT, true, true);
    traceSmoothSpline(ptsB, false, false);
    ctx.closePath();
  };

  ctx.save();
  traceSilhouette();
  const g = ctx.createLinearGradient(cxl - rx * 0.35, cyl - ry, cxl + rx * 0.45, cyl + ry);
  g.addColorStop(0, abgrCss(st.ramp[4]));
  g.addColorStop(0.28, abgrCss(st.ramp[3]));
  g.addColorStop(0.7, abgrCss(st.ramp[2]));
  g.addColorStop(1, abgrCss(st.ramp[1]));
  ctx.fillStyle = g;
  ctx.fill();
  ctx.clip();

  // Soft painterly sedimentary rock strata bands (NO circular outlines!)
  for (let b = 0; b < 5; b++) {
    const y0 = cyl - ry * 0.48 + b * (ry * 0.32);
    const bandH = ry * (0.2 + r() * 0.14);
    const tilt = (r() - 0.5) * 26;
    ctx.fillStyle = b % 2 === 0 ? abgrCss(st.ramp[2], 0.38) : abgrCss(st.ramp[4], 0.14);
    ctx.beginPath();
    ctx.moveTo(first - 10, y0 - tilt);
    ctx.bezierCurveTo(
      cxl - rx * 0.35,
      y0 - 12 + r() * 16,
      cxl + rx * 0.35,
      y0 + 10 - r() * 14,
      last + 10,
      y0 + tilt
    );
    ctx.lineTo(last + 10, y0 + bandH + tilt);
    ctx.bezierCurveTo(
      cxl + rx * 0.3,
      y0 + bandH + 8,
      cxl - rx * 0.3,
      y0 + bandH - 8,
      first - 10,
      y0 + bandH - tilt
    );
    ctx.closePath();
    ctx.fill();
  }

  // Soft sculpted stone facets along the upper sunlit cliff face
  for (let i = 0; i < 6; i++) {
    const fx = cxl + (i / 5 - 0.5) * rx * 1.35 + (r() - 0.5) * 14;
    const fy = cyl - ry * 0.12 + r() * ry * 0.45;
    const fw = 22 + r() * 28;
    const fh = 12 + r() * 14;
    ctx.fillStyle = i < 3 ? abgrCss(st.ramp[4], 0.16) : abgrCss(st.ramp[1], 0.22);
    ctx.beginPath();
    ctx.moveTo(fx - fw, fy);
    ctx.quadraticCurveTo(fx - fw * 0.3, fy - fh, fx + fw * 0.4, fy - fh * 0.4);
    ctx.quadraticCurveTo(fx + fw, fy + fh * 0.3, fx + fw * 0.5, fy + fh);
    ctx.quadraticCurveTo(fx - fw * 0.4, fy + fh * 0.7, fx - fw, fy);
    ctx.closePath();
    ctx.fill();
  }

  const caveBounds = cave ? sampleCaveBounds(cave, seed, W) : null;

  // Carved Enterable Reef Cave Chamber (Gua / Lobang Karang)
  if (cave) {
    const { ceilPts, floorPts } = buildCaveGeom(cave, seed);
    const bx = ceilPts[0][0];
    const mx = ceilPts[ceilPts.length - 1][0];
    const leftX = Math.min(bx, mx);
    const rightX = Math.max(bx, mx);

    ctx.save();
    traceCaveOutline(ctx, ceilPts, floorPts);
    ctx.clip();

    // 1. Deep organic cavern back-wall gradient that feathers smoothly into the cliff face at the mouth
    if (cave.kind === "alcove") {
      const cg = ctx.createLinearGradient(bx, cave.gy, mx, cave.gy);
      cg.addColorStop(0, "rgba(2, 5, 18, 0.96)");
      cg.addColorStop(0.38, "rgba(4, 10, 28, 0.92)");
      cg.addColorStop(0.68, abgrCss(st.ramp[0], 0.78));
      cg.addColorStop(0.86, abgrCss(st.ramp[1], 0.36));
      cg.addColorStop(1, abgrCss(st.ramp[1], 0));
      ctx.fillStyle = cg;
      ctx.fillRect(0, 0, W, H);
    } else {
      const cg = ctx.createLinearGradient(leftX, cave.gy, rightX, cave.gy);
      cg.addColorStop(0, abgrCss(st.ramp[1], 0));
      cg.addColorStop(0.14, abgrCss(st.ramp[0], 0.58));
      cg.addColorStop(0.5, "rgba(3, 8, 24, 0.92)");
      cg.addColorStop(0.86, abgrCss(st.ramp[0], 0.58));
      cg.addColorStop(1, abgrCss(st.ramp[1], 0));
      ctx.fillStyle = cg;
      ctx.fillRect(0, 0, W, H);
    }

    // Natural top-to-bottom cavern ambient shading (deeper recess under roof overhang, slightly softer floor)
    const vg = ctx.createLinearGradient(0, cave.gy - cave.gry * 1.15, 0, cave.gy + cave.gry * 1.15);
    vg.addColorStop(0, "rgba(1, 3, 12, 0.72)");
    vg.addColorStop(0.45, "rgba(3, 7, 20, 0.22)");
    vg.addColorStop(0.82, abgrCss(st.ramp[1], 0.16));
    vg.addColorStop(1, abgrCss(st.ramp[0], 0.42));
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);

    // 2. Organic sculpted inner rock strata & shadowed ceiling ledges (NO concentric tunnel rings!)
    for (let k = 0; k < 3; k++) {
      const tPos = 0.22 + k * 0.22 + (hash2(k, seed, 7) - 0.5) * 0.08;
      const idx = Math.max(2, Math.min(ceilPts.length - 3, Math.round(tPos * (ceilPts.length - 1))));
      const [lx, ly] = ceilPts[idx];
      const lw = cave.grx * (0.24 + hash2(k, seed, 13) * 0.16);
      const lh = cave.gry * (0.22 + hash2(k, seed, 19) * 0.14);
      ctx.fillStyle = k % 2 === 0 ? "rgba(2, 5, 16, 0.42)" : abgrCss(st.ramp[0], 0.34);
      ctx.beginPath();
      ctx.moveTo(lx - lw, ly - 8);
      ctx.quadraticCurveTo(lx - lw * 0.35, ly + lh * 0.85, lx + lw * 0.15, ly + lh * 0.45);
      ctx.quadraticCurveTo(lx + lw * 0.65, ly + lh * 0.15, lx + lw, ly - 8);
      ctx.closePath();
      ctx.fill();
    }

    // Subtle organic floor rock ledges inside the cavern
    for (let k = 0; k < 2; k++) {
      const tPos = 0.32 + k * 0.28;
      const idx = Math.max(2, Math.min(floorPts.length - 3, Math.round(tPos * (floorPts.length - 1))));
      const [fx, fy] = floorPts[idx];
      const fw = cave.grx * (0.24 + k * 0.06);
      const fh = cave.gry * 0.18;
      ctx.fillStyle = abgrCss(st.ramp[1], 0.36);
      ctx.beginPath();
      ctx.moveTo(fx - fw, fy + 10);
      ctx.quadraticCurveTo(fx - fw * 0.2, fy - fh * 0.65, fx + fw * 0.35, fy - fh * 0.3);
      ctx.quadraticCurveTo(fx + fw * 0.75, fy - fh * 0.1, fx + fw, fy + 10);
      ctx.closePath();
      ctx.fill();
    }

    // 3. Soft diffused bioluminescent sanctuary ambiance inside the cavern floor
    const glowCol = zone >= 2 ? "rgba(167, 139, 250, 0.26)" : "rgba(94, 234, 212, 0.24)";
    const crystalCol = zone >= 2 ? "#c4b5fd" : "#7af0ff";
    const gxGlow = cave.kind === "alcove" ? cave.gx - cave.dir * cave.grx * 0.12 : cave.gx;
    const mg = ctx.createRadialGradient(gxGlow, cave.gy + cave.gry * 0.32, 2, gxGlow, cave.gy + cave.gry * 0.1, cave.gry * 1.15);
    mg.addColorStop(0, glowCol);
    mg.addColorStop(0.5, zone >= 2 ? "rgba(103, 232, 249, 0.08)" : "rgba(94, 234, 212, 0.07)");
    mg.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = mg;
    ctx.fillRect(0, 0, W, H);

    // Naturally clustered uneven stones & tiny moss/mineral specks along 3 rocky floor pockets
    const clusterOffsets = cave.kind === "alcove" ? [0.28, 0.54, 0.76] : [0.22, 0.48, 0.74];
    for (let cIdx = 0; cIdx < clusterOffsets.length; cIdx++) {
      const fBase = clusterOffsets[cIdx] + (hash2(cIdx, seed, 31) - 0.5) * 0.08;
      const ptIdx = Math.max(2, Math.min(floorPts.length - 3, Math.round(fBase * (floorPts.length - 1))));
      const [px, py] = floorPts[ptIdx];
      const stoneCount = 2 + (Math.round(hash2(cIdx, seed, 37) * 2) % 2);
      for (let s = 0; s < stoneCount; s++) {
        const ox = (hash2(cIdx * 5 + s, seed, 41) - 0.5) * 14;
        const sw = 3.2 + hash2(cIdx * 5 + s, seed, 43) * 4.2;
        const sh = 1.8 + hash2(cIdx * 5 + s, seed, 47) * 1.8;
        const ang = (hash2(cIdx * 5 + s, seed, 53) - 0.5) * 0.35;
        ctx.fillStyle = s % 2 === 0 ? abgrCss(st.ramp[2], 0.58) : abgrCss(st.ramp[1], 0.65);
        ctx.beginPath();
        ctx.ellipse(px + ox, py - 1.2 + s * 0.5, sw, sh, ang, 0, TAU);
        ctx.fill();
      }
      if (hash2(cIdx, seed, 59) < 0.78) {
        ctx.fillStyle = crystalCol;
        ctx.globalAlpha = 0.72;
        ctx.beginPath();
        ctx.arc(px + (hash2(cIdx, seed, 61) - 0.5) * 8, py - 2.6, 1.3 + hash2(cIdx, seed, 67) * 0.9, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    // Soft ceiling undercut shadow fading smoothly near the cave mouth
    const undGrad =
      cave.kind === "alcove"
        ? ctx.createLinearGradient(bx, 0, mx, 0)
        : ctx.createLinearGradient(leftX, 0, rightX, 0);
    if (cave.kind === "alcove") {
      undGrad.addColorStop(0, "rgba(1, 3, 12, 0.85)");
      undGrad.addColorStop(0.7, "rgba(1, 3, 12, 0.72)");
      undGrad.addColorStop(1, "rgba(1, 3, 12, 0)");
    } else {
      undGrad.addColorStop(0, "rgba(1, 3, 12, 0)");
      undGrad.addColorStop(0.18, "rgba(1, 3, 12, 0.75)");
      undGrad.addColorStop(0.82, "rgba(1, 3, 12, 0.75)");
      undGrad.addColorStop(1, "rgba(1, 3, 12, 0)");
    }
    ctx.strokeStyle = undGrad;
    ctx.lineWidth = 6.5;
    ctx.beginPath();
    traceSmoothSpline(ceilPts, true, true);
    ctx.stroke();

    ctx.restore();

    // 4. Tapered, organic rocky arch highlight & floor sill rim that melt into the cliff face
    const rimGrad =
      cave.kind === "alcove"
        ? ctx.createLinearGradient(bx, 0, mx, 0)
        : ctx.createLinearGradient(leftX, 0, rightX, 0);
    if (cave.kind === "alcove") {
      rimGrad.addColorStop(0, abgrCss(st.ramp[3], 0));
      rimGrad.addColorStop(0.28, abgrCss(st.ramp[4], 0.34));
      rimGrad.addColorStop(0.74, abgrCss(st.ramp[4], 0.42));
      rimGrad.addColorStop(1, abgrCss(st.ramp[3], 0));
    } else {
      rimGrad.addColorStop(0, abgrCss(st.ramp[3], 0));
      rimGrad.addColorStop(0.18, abgrCss(st.ramp[4], 0.38));
      rimGrad.addColorStop(0.82, abgrCss(st.ramp[4], 0.38));
      rimGrad.addColorStop(1, abgrCss(st.ramp[3], 0));
    }
    ctx.strokeStyle = rimGrad;
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    traceSmoothSpline(ceilPts, true, true);
    ctx.stroke();

    const sillGrad =
      cave.kind === "alcove"
        ? ctx.createLinearGradient(bx, 0, mx, 0)
        : ctx.createLinearGradient(leftX, 0, rightX, 0);
    if (cave.kind === "alcove") {
      sillGrad.addColorStop(0, abgrCss(st.ramp[2], 0));
      sillGrad.addColorStop(0.32, abgrCss(st.ramp[3], 0.42));
      sillGrad.addColorStop(0.78, abgrCss(st.ramp[3], 0.46));
      sillGrad.addColorStop(1, abgrCss(st.ramp[2], 0));
    } else {
      sillGrad.addColorStop(0, abgrCss(st.ramp[2], 0));
      sillGrad.addColorStop(0.2, abgrCss(st.ramp[3], 0.44));
      sillGrad.addColorStop(0.8, abgrCss(st.ramp[3], 0.44));
      sillGrad.addColorStop(1, abgrCss(st.ramp[2], 0));
    }
    ctx.strokeStyle = sillGrad;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    traceSmoothSpline(floorPts, true, true);
    ctx.stroke();
  } else {
    // Shadowed grotto crevices nestled naturally into cliff overhangs (non-cave fallback)
    for (let k = 0; k < 2; k++) {
      const gx = cxl + (k === 0 ? -0.35 : 0.32) * rx + (r() - 0.5) * 18;
      const gy = cyl + ry * (0.14 + r() * 0.26);
      const grx = 12 + r() * 9;
      const gry = 4.5 + r() * 3.5;
      const cg = ctx.createRadialGradient(gx, gy - 1, 1, gx, gy, grx);
      cg.addColorStop(0, abgrCss(st.ramp[0], 0.85));
      cg.addColorStop(0.65, abgrCss(st.ramp[1], 0.55));
      cg.addColorStop(1, abgrCss(st.ramp[2], 0));
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.ellipse(gx, gy, grx, gry, 0, 0, TAU);
      ctx.fill();
    }
  }

  // Soft warm golden tropical sea-sand drifts on top of shallow coral islands (Zona Cahaya)
  if (zone === 0) {
    // 1. Soft contact shadow right below the sand skirt on rock
    ctx.beginPath();
    traceSmoothSpline(ptsT, true, true);
    const sandBot: [number, number][] = ptsT.map(([px, py]) => {
      const u = Math.abs((px - cxl) / Math.max(1, rx));
      const dome = Math.pow(Math.max(0, 1 - u * u * 0.78), 0.7);
      const wave = Math.sin(px * 0.055 + seed) * 3.5 + Math.cos(px * 0.12 - seed * 0.7) * 1.8;
      let sy = py + 4 + dome * 13 + wave;
      if (caveBounds) {
        const xi = Math.max(0, Math.min(W - 1, Math.round(px)));
        const cy = caveBounds.ceil[xi];
        if (cy >= 0) sy = Math.min(sy, cy - 8);
        sy = Math.max(py + 1.5, sy);
      }
      return [px, sy];
    });
    const shadowBot: [number, number][] = sandBot.map(([px, py]) => [px, py + 5.0]);
    traceSmoothSpline(shadowBot, false, false);
    ctx.closePath();
    ctx.fillStyle = "rgba(8, 22, 48, 0.28)";
    ctx.fill();

    // 2. Smooth organic sand cap with layered cream-gold-ochre shading
    ctx.beginPath();
    traceSmoothSpline(ptsT, true, true);
    traceSmoothSpline(sandBot, false, false);
    ctx.closePath();

    const sg = ctx.createLinearGradient(0, cyl - ry * 0.95, 0, cyl - ry * 0.35);
    sg.addColorStop(0, "#fff8dc");
    sg.addColorStop(0.32, "#f5db94");
    sg.addColorStop(0.72, "#d8b466");
    sg.addColorStop(1, "#ad8945");
    ctx.fillStyle = sg;
    ctx.fill();

    // Soft curved sand dune shadow inside the bank
    ctx.save();
    ctx.clip();
    ctx.fillStyle = "rgba(255, 251, 228, 0.5)";
    ctx.beginPath();
    traceSmoothSpline(ptsT, true, true);
    const highlightMid: [number, number][] = ptsT.map(([px, py]) => [px, py + 4.5 + Math.sin(px * 0.06 + 1.1) * 1.6]);
    traceSmoothSpline(highlightMid, false, false);
    ctx.closePath();
    ctx.fill();

    // Delicate sunken tiny shells & rounded mineral grains inside sand
    for (let i = 1; i < ptsT.length - 1; i++) {
      const [px, py] = ptsT[i];
      const h = hash2(px, seed, 19);
      if (h < 0.7) {
        ctx.fillStyle = h < 0.35 ? "rgba(255, 252, 232, 0.68)" : "rgba(162, 124, 58, 0.42)";
        ctx.beginPath();
        ctx.arc(px + (h - 0.35) * 8, py + 3 + (h * 19) % 8, 0.75 + (i % 2) * 0.35, 0, TAU);
        ctx.fill();
      }
      if (hash2(px, seed + 5, 31) < 0.16) {
        ctx.fillStyle = "#fff5dc";
        ctx.beginPath();
        ctx.ellipse(px, py + 5.5 + (i % 3), 2.1, 1.15, (i % 3) * 0.4, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();

    // Gentle cream-white sunlit top sand rim
    ctx.strokeStyle = "rgba(255, 250, 228, 0.85)";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    traceSmoothSpline(ptsT, true, true);
    ctx.stroke();
  } else {
    // Lush living crust / bioluminescent mineral sediment along deep reef crests
    ctx.strokeStyle = abgrCss(st.crust[0], 0.85);
    ctx.lineWidth = 4.6;
    ctx.beginPath();
    traceSmoothSpline(ptsT, true, true);
    ctx.stroke();

    ctx.strokeStyle = abgrCss(st.crust[1], 0.9);
    ctx.lineWidth = 2.6;
    ctx.stroke();

    ctx.strokeStyle = abgrCss(st.crust[2], 0.85);
    ctx.lineWidth = 1.1;
    ctx.stroke();
  }
  ctx.restore();

  // Silky thin island outline
  ctx.strokeStyle = abgrCss(st.ramp[0], 0.56);
  ctx.lineWidth = 0.85;
  traceSilhouette();
  ctx.stroke();

  return cv;
}

/**
 * Renders the foreground cave arch eyebrow + sculpted organic limestone formations so fish inside
 * appear genuinely tucked underneath the overhanging rock rim without sharp bars or stiff spikes.
 */
export function paintCaveRim2d(
  top: Int16Array,
  bot: Int16Array,
  W: number,
  H: number,
  st: RockPal2d,
  seed: number,
  cave: CaveSpec2d
): HTMLCanvasElement {
  const { cv, ctx } = mkCv(W, H, 2);
  let first = -1;
  let last = -1;
  for (let x = 0; x < W; x++) {
    if (top[x] >= 0) {
      if (first < 0) first = x;
      last = x;
    }
  }
  if (first < 0) return cv;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(first, top[first]);
  for (let x = first + 4; x <= last; x += 4) ctx.lineTo(x, top[x]);
  ctx.lineTo(last, top[last]);
  for (let x = last; x >= first; x -= 4) ctx.lineTo(x, bot[x]);
  ctx.lineTo(first, bot[first]);
  ctx.closePath();
  ctx.clip();

  const { ceilPts } = buildCaveGeom(cave, seed);
  // Keep the foreground overhang along the high ceiling arch (skipping deep back pocket so it never cuts across tucked fish)
  const startIdx = cave.kind === "alcove" ? Math.round((ceilPts.length - 1) * 0.24) : 2;
  const endIdx = cave.kind === "alcove" ? ceilPts.length - 2 : ceilPts.length - 3;
  const archPts = ceilPts.slice(startIdx, endIdx + 1);

  if (archPts.length >= 4) {
    // Organic overhanging rock brow ribbon above the ceiling rim
    const topEdge: [number, number][] = [];
    const botEdge: [number, number][] = [];
    for (let i = 0; i < archPts.length; i++) {
      const t = i / (archPts.length - 1);
      const taper = Math.sin(t * Math.PI);
      const crag = Math.sin(t * 17 + seed) * 1.1;
      const thick = (2.6 + taper * 4.2 + crag * taper);
      const [px, py] = archPts[i];
      topEdge.push([px, py - 2.2 - thick]);
      botEdge.push([px, py - 1.2 + taper * 1.1]);
    }

    const x0 = archPts[0][0];
    const x1 = archPts[archPts.length - 1][0];
    const browGrad = ctx.createLinearGradient(x0, 0, x1, 0);
    browGrad.addColorStop(0, abgrCss(st.ramp[1], 0));
    browGrad.addColorStop(0.2, abgrCss(st.ramp[1], 0.85));
    browGrad.addColorStop(0.8, abgrCss(st.ramp[2], 0.85));
    browGrad.addColorStop(1, abgrCss(st.ramp[1], 0));

    ctx.fillStyle = browGrad;
    ctx.beginPath();
    ctx.moveTo(topEdge[0][0], topEdge[0][1]);
    for (let i = 1; i < topEdge.length - 1; i++) {
      const mx = (topEdge[i][0] + topEdge[i + 1][0]) * 0.5;
      const my = (topEdge[i][1] + topEdge[i + 1][1]) * 0.5;
      ctx.quadraticCurveTo(topEdge[i][0], topEdge[i][1], mx, my);
    }
    ctx.lineTo(topEdge[topEdge.length - 1][0], topEdge[topEdge.length - 1][1]);
    ctx.lineTo(botEdge[botEdge.length - 1][0], botEdge[botEdge.length - 1][1]);
    for (let i = botEdge.length - 2; i > 0; i--) {
      const mx = (botEdge[i][0] + botEdge[i - 1][0]) * 0.5;
      const my = (botEdge[i][1] + botEdge[i - 1][1]) * 0.5;
      ctx.quadraticCurveTo(botEdge[i][0], botEdge[i][1], mx, my);
    }
    ctx.closePath();
    ctx.fill();

    // Subtle sunlit ridge along upper brow edge
    const hiGrad = ctx.createLinearGradient(x0, 0, x1, 0);
    hiGrad.addColorStop(0, abgrCss(st.ramp[3], 0));
    hiGrad.addColorStop(0.25, abgrCss(st.ramp[3], 0.65));
    hiGrad.addColorStop(0.75, abgrCss(st.ramp[3], 0.65));
    hiGrad.addColorStop(1, abgrCss(st.ramp[3], 0));
    ctx.strokeStyle = hiGrad;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(topEdge[0][0], topEdge[0][1] + 0.6);
    for (let i = 1; i < topEdge.length - 1; i++) {
      const mx = (topEdge[i][0] + topEdge[i + 1][0]) * 0.5;
      const my = (topEdge[i][1] + topEdge[i + 1][1]) * 0.5 + 0.6;
      ctx.quadraticCurveTo(topEdge[i][0], topEdge[i][1] + 0.6, mx, my);
    }
    ctx.stroke();

    // Organic sculpted limestone stalactite formations (varied spacing, curved sides, rounded natural tips)
    const count = cave.kind === "tunnel" ? 4 : 3;
    for (let i = 0; i < count; i++) {
      const frac = 0.22 + (i / Math.max(1, count - 1)) * 0.56 + (hash2(i, seed, 37) - 0.5) * 0.1;
      const idx = Math.min(archPts.length - 2, Math.max(1, Math.round(frac * (archPts.length - 1))));
      const [sx, sy] = archPts[idx];
      const h = 4.2 + hash2(sx, seed, 41) * 5.6;
      const w = 3.2 + hash2(sx, seed, 53) * 2.4;
      const lean = (hash2(sx, seed, 59) - 0.5) * 2.4;
      const tipX = sx + lean;
      const tipY = sy + h;

      ctx.fillStyle = abgrCss(st.ramp[1], 0.9);
      ctx.beginPath();
      ctx.moveTo(sx - w, sy - 2.2);
      ctx.quadraticCurveTo(sx - w * 0.55, sy + h * 0.45, tipX - 0.8, tipY - 0.6);
      ctx.quadraticCurveTo(tipX, tipY + 0.8, tipX + 0.8, tipY - 0.6);
      ctx.quadraticCurveTo(sx + w * 0.45, sy + h * 0.4, sx + w, sy - 2.2);
      ctx.closePath();
      ctx.fill();

      // Subtle shaded side for 3D limestone depth
      ctx.fillStyle = abgrCss(st.ramp[0], 0.42);
      ctx.beginPath();
      ctx.moveTo(sx + lean * 0.2, sy - 1.5);
      ctx.quadraticCurveTo(sx + w * 0.2, sy + h * 0.5, tipX + 0.2, tipY);
      ctx.quadraticCurveTo(sx + w * 0.45, sy + h * 0.4, sx + w * 0.85, sy - 2.0);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();

  return cv;
}

export function paintColumn2d(
  W: number,
  H: number,
  yTop: number,
  hw0: number,
  rooted: boolean,
  st: RockPal2d,
  seed: number,
  waterRgbFn: (y: number) => [number, number, number]
): HTMLCanvasElement {
  const { cv, ctx } = mkCv(W, H, 1);
  const r = rng(seed);
  const s1 = r() * 9;
  const s2 = r() * 9;
  const s4 = r() * 9;
  const lean = (r() - 0.5) * 30;

  const leftPts: [number, number][] = [];
  const rightPts: [number, number][] = [];
  for (let y = 0; y <= H; y += 8) {
    const yy = Math.min(H, y);
    const t = yy / H;
    let hw = hw0 * (0.92 + 0.5 * Math.pow(t, 1.4)) + Math.sin(yy * 0.043 + s1) * 5 + Math.sin(yy * 0.13 + s2) * 2.2;
    if (rooted) hw += Math.pow(Math.max(0, (t - 0.7) / 0.3), 2) * 38;
    const cx = W * 0.5 + Math.sin(yy * 0.017 + s4) * 7 + lean * t;
    leftPts.push([cx - hw, yy]);
    rightPts.push([cx + hw, yy]);
  }

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(leftPts[0][0], leftPts[0][1]);
  for (let i = 1; i < leftPts.length; i++) ctx.lineTo(leftPts[i][0], leftPts[i][1]);
  for (let i = rightPts.length - 1; i >= 0; i--) ctx.lineTo(rightPts[i][0], rightPts[i][1]);
  ctx.closePath();

  const hg = ctx.createLinearGradient(W * 0.25, 0, W * 0.75, 0);
  hg.addColorStop(0, abgrCss(st.ramp[3]));
  hg.addColorStop(0.55, abgrCss(st.ramp[2]));
  hg.addColorStop(1, abgrCss(st.ramp[1]));
  ctx.fillStyle = hg;
  ctx.fill();
  ctx.clip();

  // Atmospheric water-color blend gradient
  const wg = ctx.createLinearGradient(0, 0, 0, H);
  for (let s = 0; s <= 4; s++) {
    const f = s / 4;
    const [wr, wgC, wb] = waterRgbFn(yTop + f * H);
    const a = rooted ? 0.36 : Math.min(0.95, 0.32 + Math.pow(f, 0.75) * 0.65);
    wg.addColorStop(f, `rgba(${wr},${wgC},${wb},${a})`);
  }
  ctx.fillStyle = wg;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();

  if (!rooted) {
    // Smooth fade out at bottom
    ctx.save();
    ctx.globalCompositeOperation = "destination-out";
    const fg = ctx.createLinearGradient(0, H * 0.55, 0, H);
    fg.addColorStop(0, "rgba(0,0,0,0)");
    fg.addColorStop(1, "rgba(0,0,0,1)");
    ctx.fillStyle = fg;
    ctx.fillRect(0, H * 0.55, W, H * 0.45);
    ctx.restore();
  }
  return cv;
}

export function paintFloor2d(top: Int16Array, W: number, H: number, st: RockPal2d): HTMLCanvasElement {
  // Keep canvas width <= 3800 (< 4096px GPU texture limit!) to avoid software readback lag
  const { cv, ctx } = mkCv(W, H, 1);
  const fPts: [number, number][] = [];
  for (let x = 0; x < W; x += 8) fPts.push([x, top[x]]);
  if (fPts[fPts.length - 1][0] !== W - 1) fPts.push([W - 1, top[W - 1]]);

  const traceFloorSpline = () => {
    ctx.moveTo(0, fPts[0][1]);
    for (let i = 1; i < fPts.length - 1; i++) {
      const mx = (fPts[i][0] + fPts[i + 1][0]) * 0.5;
      const my = (fPts[i][1] + fPts[i + 1][1]) * 0.5;
      ctx.quadraticCurveTo(fPts[i][0], fPts[i][1], mx, my);
    }
    ctx.lineTo(W - 1, fPts[fPts.length - 1][1]);
  };

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(0, H);
  ctx.lineTo(0, fPts[0][1]);
  traceFloorSpline();
  ctx.lineTo(W, H);
  ctx.closePath();

  const g = ctx.createLinearGradient(0, 170, 0, H);
  g.addColorStop(0, abgrCss(st.ramp[3]));
  g.addColorStop(0.35, abgrCss(st.ramp[2]));
  g.addColorStop(0.75, abgrCss(st.ramp[1]));
  g.addColorStop(1, abgrCss(st.ramp[0]));
  ctx.fillStyle = g;
  ctx.fill();
  ctx.clip();

  // Rolling smooth deep-ocean sand bed (Pasir Laut) sweeping gently across the trench floor
  const r = rng(771);
  const sandGrad = ctx.createLinearGradient(0, 175, 0, H);
  sandGrad.addColorStop(0, "#e8d5a3");
  sandGrad.addColorStop(0.18, "#bfa877");
  sandGrad.addColorStop(0.45, "#7e7058");
  sandGrad.addColorStop(1, "#1e2038");
  ctx.fillStyle = sandGrad;
  ctx.beginPath();
  ctx.moveTo(0, H);
  ctx.lineTo(0, fPts[0][1]);
  traceFloorSpline();
  for (let x = W - 1; x >= 0; x -= 12) {
    const sandMask = 0.55 + 0.45 * Math.sin(x * 0.0042 + 0.6);
    ctx.lineTo(x, top[Math.min(W - 1, x)] + 32 + sandMask * 86);
  }
  ctx.closePath();
  ctx.fill();

  // Soft curved ocean-floor sand dunes (no harsh oval rings!)
  for (let i = 0; i < 22; i++) {
    const dx = i * (W / 22) + r() * 80;
    const dy = top[Math.min(W - 1, Math.max(0, dx | 0))] + 10 + r() * 28;
    const dw = 95 + r() * 85;
    ctx.fillStyle = i % 2 === 0 ? "rgba(255, 244, 208, 0.16)" : "rgba(75, 68, 52, 0.22)";
    ctx.beginPath();
    ctx.moveTo(dx - dw, dy + 22);
    ctx.bezierCurveTo(dx - dw * 0.4, dy - 10, dx + dw * 0.4, dy - 8, dx + dw, dy + 24);
    ctx.closePath();
    ctx.fill();
  }

  // Soft wavy sand current ripples
  for (let row = 0; row < 3; row++) {
    ctx.strokeStyle = row === 0 ? "rgba(255, 246, 214, 0.34)" : "rgba(218, 198, 152, 0.18)";
    ctx.lineWidth = row === 0 ? 1.4 : 1.05;
    ctx.beginPath();
    for (let x = 0; x < W; x += 8) {
      const yBase = top[Math.min(W - 1, x)] + 8 + row * 12 + Math.sin(x * 0.042 + row * 1.9) * 2.1;
      if (x === 0) ctx.moveTo(x, yBase);
      else ctx.lineTo(x, yBase);
    }
    ctx.stroke();
  }

  // Fine sand grains & pale shells tucked into dunes
  for (let x = 10; x < W - 10; x += 10) {
    const h = hash2(x, 11, 7);
    const ty = top[x];
    if (h < 0.55) {
      ctx.fillStyle = h < 0.28 ? "rgba(255, 248, 222, 0.55)" : "rgba(128, 108, 72, 0.48)";
      ctx.beginPath();
      ctx.arc(x, ty + 4 + (h * 26) % 24, 0.9, 0, TAU);
      ctx.fill();
    }
    if (hash2(x, 23, 9) < 0.055) {
      ctx.fillStyle = "#f4dfb8";
      ctx.beginPath();
      ctx.ellipse(x, ty + 6 + hash2(x, 3, 2) * 10, 3.0, 1.5, hash2(x, 5, 1) * 0.7, 0, TAU);
      ctx.fill();
    }
  }

  // Soft illuminated sand & mineral crest
  ctx.strokeStyle = "rgba(252, 238, 196, 0.72)";
  ctx.lineWidth = 2.0;
  ctx.beginPath();
  traceFloorSpline();
  ctx.stroke();

  // Subtle glowing bioluminescent specks resting in the deep sand
  const sp = ["#62e8ff", "#f48af0", "#ffe896"];
  for (let x = 12; x < W - 12; x += 18) {
    if (hash2(x, 9, 4) < 0.45) {
      ctx.fillStyle = sp[(hash2(x, 5, 4) * 3) | 0];
      ctx.beginPath();
      ctx.arc(x, top[x] + 3 + hash2(x, 2, 4) * 6, 1.15, 0, TAU);
      ctx.fill();
    }
  }
  ctx.restore();

  // Thin smooth seabed contour line
  ctx.strokeStyle = abgrCss(st.ramp[0], 0.58);
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  traceFloorSpline();
  ctx.stroke();
  return cv;
}

export function makeFar1_2d(): HTMLCanvasElement {
  const w = 1800;
  const h = 540;
  const { cv, ctx } = mkCv(w, h, 1);
  const ridge = (x: number) => {
    const t = (x / w) * TAU;
    return (
      182 -
      Math.sin(t * 2 + 0.4) * 44 -
      Math.cos(t * 3 - 0.9) * 26 -
      Math.pow(Math.max(0, Math.sin(t * 2 - 0.7)), 3) * 58 -
      Math.sin(t * 7 + 1.1) * 10
    );
  };

  ctx.save();
  ctx.fillStyle = "#56d2e6";
  ctx.strokeStyle = "#56d2e6";

  // Smooth sunken galleon silhouette
  const gx = 520;
  const gy = ridge(gx) + 8;
  ctx.beginPath();
  ctx.moveTo(gx - 52, gy - 14);
  ctx.quadraticCurveTo(gx, gy + 18, gx + 58, gy - 22);
  ctx.lineTo(gx + 28, gy - 18);
  ctx.lineTo(gx + 16, gy - 9);
  ctx.lineTo(gx - 27, gy - 8);
  ctx.lineTo(gx - 38, gy - 22);
  ctx.closePath();
  ctx.fill();
  ctx.lineWidth = 2.2;
  for (const [x0, y0, x1, y1] of [
    [gx + 46, gy - 16, gx + 76, gy - 28],
    [gx - 8, gy - 8, gx - 4, gy - 66],
    [gx + 20, gy - 9, gx + 24, gy - 54],
    [gx - 24, gy - 46, gx + 14, gy - 50],
    [gx - 18, gy - 30, gx + 10, gy - 33],
    [gx + 8, gy - 38, gx + 36, gy - 42],
  ]) {
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }

  // Smooth temple spires
  const tx = 1360;
  const ty = ridge(tx) + 8;
  for (const [cx, ch] of [[-36, 38], [-15, 48], [8, 32], [28, 44]]) {
    ctx.fillRect(tx + cx - 3, ty - ch, 6, ch + 10);
    ctx.fillRect(tx + cx - 5, ty - ch - 3, 10, 3);
  }
  ctx.beginPath();
  ctx.moveTo(tx - 44, ty - 52);
  ctx.lineTo(tx - 8, ty - 56);
  ctx.lineTo(tx - 8, ty - 50);
  ctx.lineTo(tx - 44, ty - 46);
  ctx.closePath();
  ctx.fill();

  // Distant kelp silhouettes
  for (let x = 80; x < w - 80; x += 95) {
    const y = ridge(x) + 4;
    const hS = 14 + hash2(x, 3, 11) * 20;
    ctx.beginPath();
    ctx.roundRect(x - 3, y - hS, 6, hS + 8, 3);
    ctx.fill();
  }

  // Smooth ridge fill fading softly into water
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let x = 0; x <= w; x += 8) ctx.lineTo(x, ridge(x));
  ctx.lineTo(w, h);
  ctx.closePath();
  const rg = ctx.createLinearGradient(0, 90, 0, h);
  rg.addColorStop(0, "rgba(156, 247, 255, 0.9)");
  rg.addColorStop(0.25, "rgba(114, 230, 245, 0.85)");
  rg.addColorStop(0.65, "rgba(86, 210, 230, 0.55)");
  rg.addColorStop(1, "rgba(66, 190, 214, 0)");
  ctx.fillStyle = rg;
  ctx.fill();
  ctx.restore();
  return blurCanvas2d(cv, 2.2);
}

export function makeFar2_2d(): HTMLCanvasElement {
  const w = 1900;
  const h = 540;
  const { cv, ctx } = mkCv(w, h, 1);
  const r = rng(303);
  const ridge = (x: number) => {
    const t = (x / w) * TAU;
    return (
      225 -
      Math.sin(t * 2 + 1.4) * 52 -
      Math.sin(t * 5) * 24 -
      Math.pow(Math.max(0, Math.cos(t * 2 - 0.5)), 3) * 78 -
      Math.cos(t * 8) * 14
    );
  };
  const FP = [C("#2184b4"), C("#2184b4"), C("#34a2cb"), C("#156799"), C("#56c4e2")];
  ctx.save();
  for (let x = 28; x < w - 28; x += 26 + r() * 28) {
    const y = ridge(x) + 4;
    const k = r();
    const sd = (r() * 999) | 0;
    ctx.save();
    if (k < 0.3) {
      ctx.translate(x - 21, y - 40);
      drawBranch2d(ctx, sd, FP, 42, 42, 10, 3, 3);
    } else if (k < 0.52) {
      ctx.translate(x - 20, y - 24);
      drawTable2d(ctx, sd, FP, 40, 26);
    } else if (k < 0.72) {
      ctx.translate(x - 21, y - 40);
      drawFan2d(ctx, sd, FP, 42, 42);
    } else if (k < 0.86) {
      ctx.translate(x - 16, y - 36);
      drawTubes2d(ctx, sd, FP, 32, 38);
    } else {
      ctx.translate(x - 23, y - 72);
      drawKelp2d(ctx, sd, FP, 46, 74);
    }
    ctx.restore();
  }

  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let x = 0; x <= w; x += 8) ctx.lineTo(x, ridge(x));
  ctx.lineTo(w, h);
  ctx.closePath();
  const rg = ctx.createLinearGradient(0, 80, 0, h);
  rg.addColorStop(0, "#34a2cb");
  rg.addColorStop(0.55, "#2184b4");
  rg.addColorStop(0.85, "rgba(21, 103, 153, 0.55)");
  rg.addColorStop(1, "rgba(21, 103, 153, 0)");
  ctx.fillStyle = rg;
  ctx.fill();

  ctx.strokeStyle = "#56c4e2";
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  for (let x = 0; x <= w; x += 8) {
    const y = ridge(x);
    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Smooth canyon arches (clean cutout, no ctx.filter active)
  ctx.globalCompositeOperation = "destination-out";
  for (const [ax, aw, ah] of [[380, 86, 58], [980, 105, 66], [1560, 84, 56]]) {
    const ay = ridge(ax) + 98;
    ctx.beginPath();
    ctx.ellipse(ax, ay, aw, ah, 0, Math.PI, TAU);
    ctx.lineTo(ax + aw, ay + ah * 0.4);
    ctx.lineTo(ax - aw, ay + ah * 0.4);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  return blurCanvas2d(cv, 0.9);
}

export function makeFar3_2d(st: RockPal2d): HTMLCanvasElement {
  const w = 2100;
  const h = 540;
  const { cv, ctx } = mkCv(w, h, 1);
  const ridge = (x: number) => {
    const t = (x / w) * TAU;
    return 256 - Math.sin(t * 3 + 0.4) * 58 - Math.cos(t * 6 + 2) * 30 + Math.sin(t * 23) * 6;
  };
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let x = 0; x <= w; x += 4) ctx.lineTo(x, ridge(x));
  ctx.lineTo(w, h);
  ctx.closePath();
  const rg = ctx.createLinearGradient(0, 150, 0, h);
  rg.addColorStop(0, abgrCss(st.ramp[3]));
  rg.addColorStop(0.45, abgrCss(st.ramp[2]));
  rg.addColorStop(0.75, abgrCss(st.ramp[1], 0.85));
  rg.addColorStop(1, abgrCss(st.ramp[1], 0));
  ctx.fillStyle = rg;
  ctx.fill();

  ctx.clip();
  const r = rng(509);
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = abgrCss(st.ramp[i % 2 ? 4 : 1], 0.18);
    const ex = r() * w;
    const ey = 240 + r() * 140;
    const erx = 45 + r() * 65;
    const ery = 14 + r() * 18;
    for (const dx of [-w, 0, w]) {
      ctx.beginPath();
      ctx.ellipse(ex + dx, ey, erx, ery, 0, 0, TAU);
      ctx.fill();
    }
  }
  ctx.restore();

  ctx.strokeStyle = abgrCss(st.crust[1]);
  ctx.lineWidth = 3.0;
  ctx.beginPath();
  for (let x = 0; x <= w; x += 4) {
    const y = ridge(x);
    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  return cv;
}

export function makeDeep1_2d(): HTMLCanvasElement {
  const w = 1800;
  const h = 1460;
  const { cv, ctx } = mkCv(w, h, 1);
  const r = rng(777);
  const sg = ctx.createLinearGradient(0, 60, 0, h);
  sg.addColorStop(0, "#283890");
  sg.addColorStop(0.45, "#1d2a7c");
  sg.addColorStop(1, "#151d5e");
  ctx.fillStyle = sg;
  for (let i = 0; i < 9; i++) {
    const cx = ((i + 0.3 + r() * 0.4) * w) / 9;
    const ty = 60 + r() * 680;
    const R = 34 + r() * 46;
    const ch = R * (0.3 + r() * 0.14);
    const neck = R * (0.3 + r() * 0.1);
    const lean = (r() - 0.5) * 40;
    for (const dx of [-w, 0, w]) {
      ctx.beginPath();
      ctx.moveTo(cx + dx - neck, ty);
      ctx.lineTo(cx + dx + lean - neck * 1.9, h);
      ctx.lineTo(cx + dx + lean + neck * 1.9, h);
      ctx.lineTo(cx + dx + neck, ty);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cx + dx, ty, R, ch, 0, 0, TAU);
      ctx.fill();
    }
  }
  return cv;
}

export function makeDeep2_2d(st: RockPal2d): HTMLCanvasElement {
  const w = 2000;
  const h = 1420;
  const { cv, ctx } = mkCv(w, h, 1);
  const r = rng(1414);
  const caps: [number, number, number, number][] = [];
  for (let i = 0; i < 7; i++) {
    const cx = ((i + 0.3 + r() * 0.4) * w) / 7;
    const ty = 90 + r() * 680;
    const R = 46 + r() * 50;
    const ch = R * (0.3 + r() * 0.14);
    caps.push([cx, ty, R, ch]);
  }

  // Distant coral silhouettes on caps before foreground rock paint
  const DP = [C("#0c1040"), C("#1a2068"), C("#2c3a98"), C("#4658c0"), C("#7ad8f0")];
  for (const [cx, ty, R, ch] of caps) {
    for (let k = 0; k < 3; k++) {
      const x = cx + (r() - 0.5) * R * 1.1;
      if (x < 35 || x > w - 35) continue;
      const sd = (r() * 999) | 0;
      const q = r();
      ctx.save();
      if (q < 0.4) {
        ctx.translate(x - 22, ty - ch - 42);
        drawBranch2d(ctx, sd, DP, 44, 44, 11, 3.2, 3);
      } else if (q < 0.72) {
        ctx.translate(x - 22, ty - ch - 42);
        drawFan2d(ctx, sd, DP, 44, 44);
      } else {
        ctx.translate(x - 16, ty - ch - 38);
        drawTubes2d(ctx, sd, DP, 32, 40);
      }
      ctx.restore();
    }
  }

  // Draw unified spire + bridge arch silhouettes
  const bodyGrad = ctx.createLinearGradient(0, 60, 0, h);
  bodyGrad.addColorStop(0, abgrCss(st.ramp[3]));
  bodyGrad.addColorStop(0.45, abgrCss(st.ramp[2]));
  bodyGrad.addColorStop(1, abgrCss(st.ramp[1]));
  ctx.fillStyle = bodyGrad;
  ctx.strokeStyle = abgrCss(st.ramp[0], 0.7);
  ctx.lineWidth = 1.0;

  for (let i = 0; i < caps.length; i++) {
    const [cx, ty, R, ch] = caps[i];
    const neck = R * (0.3 + r() * 0.1);
    const lean = (r() - 0.5) * 40;
    for (const dx of [-w, 0, w]) {
      ctx.beginPath();
      ctx.moveTo(cx + dx - neck, ty);
      ctx.lineTo(cx + dx + lean - neck * 1.9, h);
      ctx.lineTo(cx + dx + lean + neck * 1.9, h);
      ctx.lineTo(cx + dx + neck, ty);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cx + dx, ty, R, ch, 0, 0, TAU);
      ctx.fill();
    }
  }

  for (const i of [1, 4]) {
    const a = caps[i];
    const b = caps[i + 1];
    ctx.strokeStyle = abgrCss(st.ramp[2]);
    ctx.lineWidth = 22;
    ctx.beginPath();
    ctx.moveTo(a[0] + a[2] * 0.4, a[1] + 8);
    ctx.quadraticCurveTo((a[0] + b[0]) * 0.5, Math.min(a[1], b[1]) - 42, b[0] - b[2] * 0.4, b[1] + 8);
    ctx.stroke();
  }

  // CRITICAL: keep haze AND mineral veins strictly inside the rock silhouette (source-atop)!
  ctx.save();
  ctx.globalCompositeOperation = "source-atop";
  ctx.fillStyle = "rgba(23, 27, 92, 0.38)";
  ctx.fillRect(0, 0, w, h);

  const veins = ["#52e6ff", "#f07af6", "#9c8cff"];
  for (const [cx, ty, R] of caps) {
    for (let k = 0; k < 3; k++) {
      let x = cx + (r() - 0.5) * R * 1.2;
      let y = ty - 2 + r() * 10;
      const vi = (r() * 3) | 0;
      ctx.strokeStyle = veins[vi];
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(x, y);
      const len = 30 + r() * 90;
      for (let s = 0; s < len; s += 6) {
        x += (r() - 0.5) * 6;
        y += 4 + r() * 4;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }
  ctx.restore();
  return cv;
}

export function makeWaves2d(): HTMLCanvasElement[] {
  const waves: HTMLCanvasElement[] = [];
  for (let v = 0; v < 2; v++) {
    const W = 256;
    const H = 16;
    const { cv, ctx } = mkCv(W, H, 2);
    const K = TAU / W;
    const grad = ctx.createLinearGradient(0, 2, 0, 14);
    grad.addColorStop(0, "#ffffff");
    grad.addColorStop(0.35, "#d6fcff");
    grad.addColorStop(1, "rgba(162, 242, 255, 0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(0, 14);
    for (let x = 0; x <= W; x += 4) {
      const y0 = 4 + (v ? 1.6 * Math.sin(x * K * 5 + 1) + 1.1 * Math.sin(x * K * 11) : 2.2 * Math.sin(x * K * 3) + Math.sin(x * K * 8 + 2));
      ctx.lineTo(x, y0);
    }
    ctx.lineTo(W, 14);
    ctx.closePath();
    ctx.fill();
    waves.push(cv);
  }
  return waves;
}

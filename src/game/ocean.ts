// ============================================================================
// THE OCEAN — four depth levels rendered as 16-bit pixel art
//
//   0  ZONA CAHAYA    sunlit coral gardens on top of reef pinnacles
//   1  ZONA SENJA     twilight gorgonian walls
//   2  ZONA MALAM     midnight bioluminescent garden & crystals
//   3  PALUNG ABISAL  abyssal plain with black-smoker vents
//
// Nothing floats any more: every rock is the crown of a pinnacle whose stem runs
// down into the haze / the sea floor, and every coral is planted by scanning the
// real rock surface so its holdfast is embedded in solid rock.
// ============================================================================
import { Pix, C, P, rng, bayer, hash2, mixC } from "./pixel";
import type { Rnd } from "./pixel";
import { buildBiota, hydratePixelBiota, NF, genBranch, genTable, genFan, genKelp, genTubes, genWhip, genForegroundOutcrops } from "./reef";
import type { Bio, BioSet } from "./reef";
import {
  attach2dBiota,
  attach2dBiotaGen,
  copy2dBiotaTint,
  genForegroundOutcrops2d,
  paintPinnacle2d,
  paintCaveRim2d,
  paintColumn2d,
  paintFloor2d,
  makeFar1_2d,
  makeFar2_2d,
  makeFar3_2d,
  makeDeep1_2d,
  makeDeep2_2d,
  makeWaves2d,
  sampleCaveBounds,
} from "./reef2d";
import type { CaveSpec2d } from "./reef2d";
import {
  attach3dBiotaGen,
  copy3dBiotaTint,
  disposeReef3DRenderer,
  genForegroundOutcrops3d,
  makeDeep2_3d,
  makeFar3_3d,
  paintCaveRim3d,
  paintColumn3d,
  paintFloor3d,
  paintPinnacle3d,
} from "./reef3d";

export const WORLD_W = 3800;
export const WORLD_H = 2650;
export const DEEP_START = 1040;
export const FLOOR_TOP = WORLD_H - 340;
const WPAD = 60;
const TAU = Math.PI * 2;

export function floorY(x: number) {
  return WORLD_H - 86 + Math.sin(x * 0.0035) * 28 + Math.sin(x * 0.011 + 1.2) * 15 + Math.sin(x * 0.029) * 5;
}

function hexToRgb(h: string): [number, number, number] {
  const s = h.startsWith("#") ? h.slice(1) : h;
  const n = parseInt(s, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbaHex(h: string, a: number): string {
  const [r, g, b] = hexToRgb(h);
  return `rgba(${r},${g},${b},${a})`;
}

// Cached pre-rendered soft radial glow sprites
const glowCache = new Map<string, HTMLCanvasElement>();
export function glowOrb(color: string, whiteCore = true): HTMLCanvasElement {
  const key = color + (whiteCore ? "|w" : "|n");
  let cv = glowCache.get(key);
  if (cv) return cv;
  const S = 64;
  cv = document.createElement("canvas");
  cv.width = S;
  cv.height = S;
  const c = cv.getContext("2d")!;
  let zeroCol = "rgba(190, 248, 255, 0)";
  if (color.startsWith("#")) zeroCol = rgbaHex(color, 0);
  else if (color.startsWith("rgba(")) zeroCol = color.replace(/,[^,]+\)$/, ", 0)");
  const rg = c.createRadialGradient(S / 2, S / 2, 0.5, S / 2, S / 2, S / 2);
  if (whiteCore) {
    rg.addColorStop(0, "#ffffff");
    rg.addColorStop(0.32, color);
    rg.addColorStop(0.68, color.startsWith("#") ? rgbaHex(color, 0.25) : "rgba(150, 238, 255, 0.2)");
    rg.addColorStop(1, zeroCol);
  } else {
    rg.addColorStop(0, color);
    rg.addColorStop(1, zeroCol);
  }
  c.fillStyle = rg;
  c.fillRect(0, 0, S, S);
  glowCache.set(key, cv);
  return cv;
}

type Ctx = CanvasRenderingContext2D;

export interface RockCollider {
  x: number;
  y: number;
  r: number;
  /** Fish with f.r <= maxPassR pass freely through this mouth gate; bigger predators bounce off! */
  maxPassR?: number;
}

export interface ReefCave {
  id: number;
  x: number;
  y: number;
  rx: number;
  ry: number;
  maxR: number;
  kind: "alcove" | "tunnel";
  dir: number; // -1 opens left, 1 opens right, 0 tunnel both sides
  zone: number;
}

export interface RockSDF {
  sw: number;
  sh: number;
  pad: number;
  step: number;
  data: Float32Array;
}

function edt1d(f: Float32Array, n: number, out: Float32Array, v: Int32Array, z: Float32Array) {
  let k = 0;
  v[0] = 0;
  z[0] = -1e20;
  z[1] = 1e20;
  for (let q = 1; q < n; q++) {
    let s: number;
    for (;;) {
      const r = v[k];
      s = (f[q] + q * q - (f[r] + r * r)) / (2 * q - 2 * r);
      if (k === 0 || s > z[k]) break;
      k--;
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = 1e20;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    const r = v[k];
    const d = q - r;
    out[q] = d * d + f[r];
  }
}

let _edtTmp = new Float32Array(0);
let _edtF = new Float32Array(0);
let _edtD1 = new Float32Array(0);
let _edtV = new Int32Array(0);
let _edtZ = new Float32Array(0);
let _edtSolid = new Uint8Array(0);

function computeBinaryEDT(mask: Uint8Array, targetVal: number, sw: number, sh: number, out: Float32Array) {
  const INF = 1e10;
  const n = sw * sh;
  if (_edtTmp.length < n) _edtTmp = new Float32Array(n);
  const maxDim = Math.max(sw, sh);
  if (_edtF.length < maxDim) {
    _edtF = new Float32Array(maxDim);
    _edtD1 = new Float32Array(maxDim);
    _edtV = new Int32Array(maxDim);
    _edtZ = new Float32Array(maxDim + 1);
  }
  const tmp = _edtTmp;
  const f = _edtF;
  const d1 = _edtD1;
  const v = _edtV;
  const z = _edtZ;

  for (let y = 0; y < sh; y++) {
    const row = y * sw;
    for (let x = 0; x < sw; x++) f[x] = mask[row + x] === targetVal ? 0 : INF;
    edt1d(f, sw, d1, v, z);
    for (let x = 0; x < sw; x++) tmp[row + x] = d1[x];
  }
  for (let x = 0; x < sw; x++) {
    for (let y = 0; y < sh; y++) f[y] = tmp[y * sw + x];
    edt1d(f, sh, d1, v, z);
    for (let y = 0; y < sh; y++) out[y * sw + x] = d1[y];
  }
}

let _edtDist0 = new Float32Array(0);
let _edtDist1 = new Float32Array(0);

function buildRockSDF(
  W: number,
  H: number,
  top: Int16Array,
  bot: Int16Array,
  caveBounds: { ceil: Int16Array; floor: Int16Array } | null,
  pad = 52,
  step = 3
): RockSDF {
  const sw = Math.ceil((W + pad * 2) / step) + 1;
  const sh = Math.ceil((H + pad * 2) / step) + 1;
  const n = sw * sh;
  if (_edtSolid.length < n) _edtSolid = new Uint8Array(n);
  if (_edtDist0.length < n) _edtDist0 = new Float32Array(n);
  if (_edtDist1.length < n) _edtDist1 = new Float32Array(n);
  const solid = _edtSolid;
  solid.fill(0, 0, n);
  for (let gy = 0; gy < sh; gy++) {
    const ly = Math.round(gy * step - pad);
    if (ly < 0 || ly >= H) continue;
    const row = gy * sw;
    for (let gx = 0; gx < sw; gx++) {
      const lx = Math.round(gx * step - pad);
      if (lx < 0 || lx >= W || top[lx] < 0) continue;
      if (ly >= top[lx] && ly <= bot[lx]) {
        if (caveBounds && caveBounds.ceil[lx] >= 0 && ly >= caveBounds.ceil[lx] && ly <= caveBounds.floor[lx]) {
          continue;
        }
        solid[row + gx] = 1;
      }
    }
  }
  computeBinaryEDT(solid, 0, sw, sh, _edtDist0);
  computeBinaryEDT(solid, 1, sw, sh, _edtDist1);
  const data = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    data[i] = solid[i]
      ? -(Math.max(0.5, Math.sqrt(_edtDist0[i])) - 0.5) * step
      : (Math.max(0.5, Math.sqrt(_edtDist1[i])) - 0.5) * step;
  }
  return { sw, sh, pad, step, data };
}

// ---------------------------------------------------------------- depth levels
export const ZONES = [
  { y: 0, name: "ZONA CAHAYA", sub: "Taman Karang & Pasir Dangkal", m0: 0, m1: 1000, col: "#7af0ff" },
  { y: 820, name: "ZONA SENJA", sub: "Tebing Gorgonia & Koral", m0: 1000, m1: 3000, col: "#8aa8ff" },
  { y: 1540, name: "ZONA MALAM", sub: "Taman Bioluminesens", m0: 3000, m1: 5000, col: "#d890ff" },
  { y: 2150, name: "PALUNG ABISAL", sub: "Ladang Cerobong & Pasir Laut", m0: 5000, m1: 8000, col: "#ffa05c" },
];
export function zoneAt(y: number): number {
  return y < ZONES[1].y ? 0 : y < ZONES[2].y ? 1 : y < ZONES[3].y ? 2 : 3;
}
export function depthMeters(y: number): number {
  const yy = Math.max(0, Math.min(WORLD_H, y));
  const z = zoneAt(yy),
    Z = ZONES[z],
    y1 = z < 3 ? ZONES[z + 1].y : WORLD_H;
  return Math.round(Z.m0 + ((yy - Z.y) / (y1 - Z.y)) * (Z.m1 - Z.m0));
}

const WATER: [number, number][] = (
  [
    [-60, "#f4feff"],
    [-8, "#d4fcff"],
    [0, "#86f7ff"],
    [110, "#4ce4f6"],
    [280, "#24bce3"],
    [490, "#1694d0"],
    [730, "#106eb8"],
    [980, "#0e4d9e"],
    [1260, "#11378c"],
    [1560, "#162472"],
    [1880, "#141856"],
    [2180, "#0e0d3a"],
    [2440, "#080723"],
    [2720, "#040414"],
  ] as [number, string][]
).map(([y, h]) => [y, C(h)]);

function blurCanvas(src: HTMLCanvasElement, radiusPx: number): HTMLCanvasElement {
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

function waterC(y: number): number {
  for (let i = 1; i < WATER.length; i++)
    if (y <= WATER[i][0]) {
      const a = WATER[i - 1],
        b = WATER[i];
      return mixC(a[1], b[1], Math.max(0, (y - a[0]) / (b[0] - a[0])));
    }
  return WATER[WATER.length - 1][1];
}

// ---------------------------------------------------------------- pixel rock painter
interface RockStyle {
  ramp: number[]; // outline, deep shadow, shadow, base, light, highlight
  crust: number[]; // dark, mid, light  (living turf / sediment on every up-facing surface)
}
const ROCK: RockStyle[] = [
  { ramp: P("#0a1c3c", "#12305c", "#1a4a80", "#2a6ca4", "#4496c4", "#7cc8e0"), crust: P("#b89652", "#e6cb86", "#faeab8") },
  { ramp: P("#0a1238", "#141e58", "#1e3080", "#2c48a4", "#4868c4", "#7c98e4"), crust: P("#3a4cb0", "#6a84e0", "#b0c8ff") },
  { ramp: P("#070722", "#100e3a", "#1a1858", "#2a2678", "#3e3a9c", "#6460c4"), crust: P("#3a2a90", "#7a50c8", "#c89cf4") },
  { ramp: P("#04040f", "#0a0a22", "#12123a", "#1c1c54", "#2c2c74", "#48489c"), crust: P("#786c58", "#b4a27b", "#e3d3a6") },
];
const FAR_ROCK: RockStyle = { ramp: P("#0a2452", "#10346e", "#164988", "#1f61a2", "#2e7db8", "#50a5d6"), crust: P("#267ca8", "#42a8c4", "#82d8e0") };
const DEEP_ROCK: RockStyle = { ramp: P("#080a2a", "#0e1242", "#161c5e", "#20287a", "#2e3a98", "#4a58bc"), crust: P("#2a3a9a", "#4a5cc0", "#8a9cf0") };

/**
 * Shades a rock mask as chiselled 16-bit boulders: Voronoi blocks lit from the upper-left,
 * strata bands, ordered dithering between tones, pores, a living crust on every up-facing
 * surface and a dark outline on walls & undersides.
 */
function* paintRock(p: Pix, m: Uint8Array, st: RockStyle, seed: number, cell: number, dim = 0, crustOn = true): Generator<void, void, void> {
  const w = p.w,
    h = p.h;
  const cellY = Math.max(6, Math.round(cell * 0.62)); // flat sedimentary slabs
  const gw = Math.ceil(w / cell) + 2,
    gh = Math.ceil(h / cellY) + 4;
  const sx = new Float32Array(gw * gh),
    sy = new Float32Array(gw * gh),
    tn = new Float32Array(gw * gh);
  for (let j = 0; j < gh; j++)
    for (let i = 0; i < gw; i++) {
      const k = j * gw + i;
      sx[k] = (i - 1 + hash2(i, j, seed)) * cell;
      sy[k] = (j - 2 + hash2(i, j, seed + 7)) * cellY;
      tn[k] = hash2(i, j, seed + 13);
    }
  // large-scale tone patches so the wall is not one uniform cobble pattern
  const big = cell * 3.4,
    bigY = big * 0.7;
  // value-noise lattice, precomputed once (was 4 hashes per pixel)
  const lw = Math.ceil(w / big) + 2,
    lh = Math.ceil(h / bigY) + 2;
  const lat = new Float64Array(lw * lh);
  for (let j = 0; j < lh; j++) for (let i = 0; i < lw; i++) lat[j * lw + i] = hash2(i, j, seed + 51);
  const dep = new Int32Array(h);
  for (let x = 0; x < w; x++) {
    if (x > 0 && (x & 31) === 0) yield; // let the page breathe: the caller resumes us on a later frame
    const fx = x / big,
      ix = fx | 0,
      ux = fx - ix,
      mx = ux * ux * (3 - 2 * ux);
    const cd = crustOn ? 2 + (hash2(x, 3, seed) < 0.3 ? 1 : 0) + (hash2(x >> 1, 5, seed) < 0.14 ? 2 : 0) : 0;
    let run = 0;
    for (let y = h - 1; y >= 0; y--) {
      run = m[y * w + x] ? run + 1 : 0;
      dep[y] = run;
    }
    let d = -1;
    for (let y = 0; y < h; y++) {
      const i = y * w + x;
      if (!m[i]) {
        d = -1;
        continue;
      }
      d++;
      const u = dep[y] - 1;
      const ci0 = Math.floor(x / cell) + 1,
        cj0 = Math.floor(y / cellY) + 2;
      let d1 = 1e9,
        d2 = 1e9,
        kk = 0;
      for (let dj = -2; dj <= 2; dj++)
        for (let di = -1; di <= 1; di++) {
          const k = (cj0 + dj) * gw + ci0 + di;
          const ex = sx[k] - x,
            ey = sy[k] - y;
          const dd = ex * ex + ey * ey;
          if (dd < d1) {
            d2 = d1;
            d1 = dd;
            kk = k;
          } else if (dd < d2) d2 = dd;
        }
      const edge = Math.sqrt(d2) - Math.sqrt(d1);
      const fy = y / bigY,
        iy = fy | 0,
        uy = fy - iy,
        my = uy * uy * (3 - 2 * uy),
        l0 = iy * lw + ix;
      const na = lat[l0],
        nb = lat[l0 + 1],
        nc = lat[l0 + lw],
        nd = lat[l0 + lw + 1];
      const vnv = na + (nb - na) * mx + (nc - na) * my + (na - nb - nc + nd) * mx * my;
      let v = 3 + (tn[kk] - 0.5) * 1.1 + (vnv - 0.5) * 2.0;
      v += Math.max(-1, Math.min(1, (sx[kk] - x) / cell + ((sy[kk] - y) / cellY) * 0.9)) * 0.75;
      v += 1.0 - (d / (d + u + 1)) * 2.4 - Math.min(1, d / 46) * 0.5;
      if (u < 6) v -= (6 - u) * 0.22;
      if (edge < 1.0) v -= 1.15;
      else if (edge < 2.1 && sx[kk] - x + (sy[kk] - y) * 1.4 > cell * 0.25) v += 0.55; // lit lip of each slab
      let ci = Math.floor(v + (bayer(x, y) - 0.5) * 0.8 + (hash2(x, y, seed + 3) - 0.5) * 0.45) - dim;
      ci = ci < 1 ? 1 : ci > 5 ? 5 : ci;
      let c = st.ramp[ci];
      if (crustOn) {
        if (d < cd) c = d === 0 ? st.crust[2] : d === 1 ? st.crust[1] : bayer(x, y) < 0.6 ? st.crust[0] : c;
      } else if (d === 0) c = st.ramp[Math.min(5, ci + 2)];
      if (d > 5 && hash2(x, y, seed + 31) < 0.008) c = st.ramp[1];
      else if (d > 6 && hash2(x, y - 1, seed + 31) < 0.008) c = st.ramp[Math.min(5, ci + 1)];
      if (d > 0 && ((u === 0 && y < h - 1) || (x > 0 && !m[i - 1]) || (x < w - 1 && !m[i + 1]))) c = st.ramp[0];
      p.d[i] = c;
    }
  }
}

/** flat 4-tone silhouette shading for the farthest planes */
function* paintFlat(p: Pix, m: Uint8Array, col: number[], seed: number): Generator<void, void, void> {
  const { w, h } = p;
  for (let x = 0; x < w; x++) {
    if (x > 0 && (x & 63) === 0) yield;
    let d = -1;
    for (let y = 0; y < h; y++) {
      const i = y * w + x;
      if (!m[i]) {
        d = -1;
        continue;
      }
      d++;
      const lit = !m[y * w + ((x + w - 1) % w)] || !m[y * w + ((x + w - 2) % w)];
      const shade = !m[y * w + ((x + 1) % w)] || !m[y * w + ((x + 3) % w)];
      let c = d < 2 ? col[0] : lit ? col[3] : shade ? col[2] : col[1];
      if (d >= 2 && !lit && bayer(x, y) < Math.min(0.8, d / 110)) c = col[2];
      if (d > 4 && (y + ((Math.sin(x * 0.04 + seed) * 5) | 0)) % 27 === 0 && hash2(x >> 2, y, seed) < 0.55) c = col[3];
      p.d[i] = c;
    }
  }
}

/** fills everything below a ridge line with banded/dithered silhouette tones and dithers the bottom away */
function* fillRidge(p: Pix, ridge: (x: number) => number, col: number[], seed: number, fade: number): Generator<void, void, void> {
  const { w, h } = p;
  for (let x = 0; x < w; x++) {
    if (x > 0 && (x & 127) === 0) yield;
    const ty = Math.round(ridge(x));
    for (let y = Math.max(0, ty); y < h; y++) {
      const d = y - ty;
      const fb = (y - (h - fade)) / fade;
      if (fb > 0 && bayer(x + 2, y + 1) < fb) {
        p.d[y * w + x] = 0;
        continue;
      }
      let c = d < 2 ? col[0] : col[1];
      if (d >= 2 && bayer(x, y) < Math.min(1, (d - 2) / 80)) c = col[2];
      if (d > 5 && (d + ((Math.sin(x * 0.03 + seed) * 6) | 0)) % 23 === 0 && hash2(x >> 2, d, seed) < 0.6) c = col[3];
      p.d[y * w + x] = c;
    }
  }
}

function fadeBottom(p: Pix, fade: number) {
  for (let y = p.h - fade; y < p.h; y++) {
    const fb = (y - (p.h - fade)) / fade;
    for (let x = 0; x < p.w; x++) if (bayer(x + 2, y + 1) < fb) p.d[y * p.w + x] = 0;
  }
}

/** silhouette mask of mushroom-capped pinnacles that rise from the bottom edge (tiles horizontally) */
function* spireMask(
  w: number,
  h: number,
  r: Rnd,
  n: number,
  topMin: number,
  topMax: number,
  capMin: number,
  capMax: number
): Generator<void, { m: Uint8Array; caps: [number, number, number, number][] }, void> {
  const m = new Uint8Array(w * h);
  const caps: [number, number, number, number][] = [];
  for (let i = 0; i < n; i++) {
    const cx = ((i + 0.3 + r() * 0.4) * w) / n,
      ty = topMin + r() * (topMax - topMin),
      R = capMin + r() * (capMax - capMin),
      ch = R * (0.3 + r() * 0.14),
      neck = R * (0.3 + r() * 0.1),
      s1 = r() * 9,
      lean = (r() - 0.5) * 40;
    caps.push([cx, ty, R, ch]);
    for (let y = Math.max(0, Math.floor(ty - ch)); y < h; y++) {
      const v = (y - ty) / ch;
      let hw = v < 0.9 ? R * Math.sqrt(Math.max(0, 1 - v * v)) : 0;
      if (v < 0) hw = Math.round(hw / 3) * 3;
      const t = Math.max(0, (y - ty) / (h - ty));
      if (y > ty) hw = Math.max(hw, neck * (1 + 0.9 * Math.pow(t, 1.3)) + Math.sin(y * 0.05 + s1) * 4 + (Math.floor(y / 37 + s1) & 1) * 3);
      const xc = cx + lean * t;
      for (let x = Math.round(xc - hw); x <= Math.round(xc + hw); x++) m[y * w + (((x % w) + w) % w)] = 1;
    }
    yield;
  }
  return { m, caps };
}

// ---------------------------------------------------------------- biota planting
type Tbl = [string, number][];
function pick(r: Rnd, t: Tbl): string {
  let tot = 0;
  for (const e of t) tot += e[1];
  let k = r() * tot;
  for (const e of t) {
    k -= e[1];
    if (k <= 0) return e[0];
  }
  return t[0][0];
}

// what grows at each depth level
const TOP_BIO: Tbl[] = [
  [["staghorn", 5], ["table", 4], ["brain", 3], ["pillar", 3], ["lettuce", 3], ["fan", 4], ["whip", 2], ["tubes", 3], ["barrel", 1.5], ["anemone", 3], ["clam", 2.5], ["worm", 3], ["grass", 3], ["kelp", 1.6], ["urchin", 1.5]],
  [["fan2", 5], ["whip2", 3], ["staghorn2", 3], ["brain2", 2], ["lettuce2", 3], ["barrel2", 2], ["anemone2", 3], ["crinoid", 3.5], ["tunicate", 3], ["worm", 2.5], ["tubes", 1.5], ["urchin2", 1]],
  [["crystal", 4], ["pen", 4], ["bamboo", 3], ["bubblegum", 3], ["crinoid2", 3], ["tunicate", 3], ["anemone2", 2.5], ["fan2", 2], ["urchin2", 1]],
  [["pen", 4], ["bamboo", 3.5], ["crystal", 3], ["bubblegum", 3], ["anemone2", 3], ["crinoid2", 3], ["tunicate", 2.5], ["riftia", 1.5], ["urchin2", 1.5], ["star2", 1.5]],
];
// small creatures that fill the gaps between the big corals
const FILL_BIO: Tbl[] = [
  [["grass", 4], ["worm", 3], ["urchin", 2], ["anemone", 2], ["clam", 1.5], ["brain", 1]],
  [["tunicate", 3], ["worm", 3], ["urchin2", 2], ["anemone2", 2], ["grass", 1]],
  [["tunicate", 3], ["urchin2", 2], ["anemone2", 2], ["pen", 2], ["star2", 1]],
  [["tunicate", 3], ["urchin2", 2], ["anemone2", 2], ["pen", 2.5], ["star2", 1.5], ["riftia", 1]],
];
const FAR_TBL: Tbl = [["kelp", 3], ["fan", 3], ["whip", 2], ["staghorn", 3], ["table", 2.5], ["tubes", 2], ["grass", 2], ["brain", 1.5], ["pillar", 1.5]];
const SIDE_BIO = ["shelf", "shelf2", "shelf2", "shelf2"];
const HANG_BIO = ["vine", "vine2", "vine2", "vine2"];
const STAR_BIO = ["star", "star", "star2", "star2"];

interface Inst {
  s: Bio;
  x: number;
  y: number;
  ph: number;
  flip: boolean;
  hide: number;
}

/**
 * Walks along a surface profile (top[x] = first solid row, -1 = no ground) and plants biota only where
 * the whole holdfast rests on solid, nearly level rock. The base is put on the LOWEST point under the
 * foot, so a coral can be slightly buried but never hover.
 */
function plant(r: Rnd, set: BioSet, tbl: Tbl, top: Int16Array, x0: number, x1: number, ox: number, oy: number, out: Inst[], tol: number, shade?: (x: number, y: number, f: number) => void, occ?: Uint8Array, filler = false) {
  let x = x0;
  while (x < x1) {
    const vs = set[pick(r, tbl)];
    if (!vs) {
      x += 3;
      continue;
    }
    const s = vs[(r() * vs.length) | 0],
      f = s.foot;
    let ok = -1,
      base = 0;
    for (let t = 0; t <= 12 && ok < 0; t += 2) {
      const xc = Math.round(x + f + t);
      let lo = -1e9,
        hi = 1e9,
        valid = xc + f < x1;
      for (let k = -f; k <= f && valid; k++) {
        const ty = top[xc + k];
        if (ty === undefined || ty < 0 || (occ && occ[xc + k])) valid = false;
        else {
          if (ty > lo) lo = ty;
          if (ty < hi) hi = ty;
        }
      }
      if (valid && lo - hi <= tol) {
        ok = xc;
        base = lo;
      }
    }
    if (ok < 0) {
      x += 8;
      continue;
    }
    out.push({ s, x: ox + ok, y: oy + base, ph: r() * NF, flip: r() < 0.5, hide: 0 });
    if (shade) shade(ok, base, f);
    if (occ) for (let k = -f - 1; k <= f + 1; k++) if (ok + k >= 0 && ok + k < occ.length) occ[ok + k] = 1;
    x = filler ? ok + f + 2 + r() * 9 : ok + Math.max(f + 2, s.w * 0.4) + r() * 5;
  }
}

export interface Formation {
  x: number;
  y: number;
  w: number;
  h: number;
  cv?: HTMLCanvasElement;
  cv2d?: HTMLCanvasElement;
  cv3d?: HTMLCanvasElement;
  caveRim?: HTMLCanvasElement;
  caveRim2d?: HTMLCanvasElement;
  caveRim3d?: HTMLCanvasElement;
  cave?: ReefCave;
  sdfCave: RockSDF;
  sdfSolid: RockSDF;
  col?: HTMLCanvasElement;
  col2d?: HTMLCanvasElement;
  col3d?: HTMLCanvasElement;
  colW: number;
  colH: number;
  colTop: number;
  colHw0: number;
  colRooted: boolean;
  colSeed: number;
  colX: number;
  colY: number;
  top: Int16Array;
  bot: Int16Array;
  zone: number;
  seed: number;
  rx: number;
  ry: number;
  cxl: number;
  cyl: number;
  caveSpec: CaveSpec2d;
  shades: { x: number; y: number; f: number }[];
  insts: Inst[];
  colliders: RockCollider[];
}
interface Crab {
  top: Int16Array;
  ox: number;
  oy: number;
  x0: number;
  range: number;
  sp: number;
  ph: number;
  v: number;
}
interface Jelly {
  s: Bio;
  x: number;
  y: number;
  p: number;
  ph: number;
}
interface DistantPelagic {
  x: number;
  y: number;
  scale: number;
  dir: number;
  speed: number;
  kind: "manta" | "whaleshark" | "bluewhale" | "submarine";
  ph: number;
  period?: number;
  par?: number;
  yPar?: number;
}
interface Ray {
  x: number;
  w: number;
  len: number;
  ph: number;
  a: number;
  layer: number; // 0 = far behind the reef, 1 = between the distant ridges and the reef, 2 = in front
  v: number;
}

const SUN_X = WORLD_W * 0.56; // where the sun stands above the sea
const RAY_PERIOD = 1080;
const RAY_PAR = [0.3, 0.62, 1.0]; // parallax of the three planes of light shafts
const D1_Y = 1140;
const D2_Y = 1210;
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

export class Ocean {
  pixelMode = false;
  reef3D = true;
  bio!: BioSet;
  farBio!: BioSet;
  fgBio!: BioSet;
  water?: HTMLCanvasElement;
  water2d?: HTMLCanvasElement;
  far1?: HTMLCanvasElement;
  far1_2d?: HTMLCanvasElement;
  far2?: HTMLCanvasElement;
  far2_2d?: HTMLCanvasElement;
  far3?: HTMLCanvasElement;
  far3_2d?: HTMLCanvasElement;
  far3_3d?: HTMLCanvasElement;
  deep1?: HTMLCanvasElement;
  deep1_2d?: HTMLCanvasElement;
  deep2?: HTMLCanvasElement;
  deep2_2d?: HTMLCanvasElement;
  deep2_3d?: HTMLCanvasElement;
  floor?: HTMLCanvasElement;
  floor2d?: HTMLCanvasElement;
  floor3d?: HTMLCanvasElement;

  private builtPixel = false;
  private built2d = false;
  private built3d = false;
  private floorTop?: Int16Array;
  private floorShades: { x: number; y: number; f: number }[] = [];
  private floorW = WORLD_W;
  private floorH = WORLD_H + 75 - FLOOR_TOP;

  /** false until the whole world has been generated — nothing may be drawn before that */
  ready = false;
  /** 0..1 generation progress */
  progress = 0;
  private gen: Generator<number | void, void, void> | null;
  // pre-rendered light art (nothing here is rebuilt per frame)
  private beams: HTMLCanvasElement[] = [];
  private caust: HTMLCanvasElement[] = [];
  private waves: HTMLCanvasElement[] = [];
  private waves2d: HTMLCanvasElement[] = [];
  private mist: HTMLCanvasElement[] = [];
  private fgBubble!: HTMLCanvasElement;
  private vig!: HTMLCanvasElement;
  private shallowBloom!: HTMLCanvasElement;
  private abyssWarm!: HTMLCanvasElement;
  private neb!: HTMLCanvasElement;
  private bloom!: HTMLCanvasElement;
  private lb: HTMLCanvasElement[] = []; // world-resolution light buffers
  private lbc: Ctx[] = [];
  private pelagicBuf: HTMLCanvasElement | null = null;
  private pelagicBlurA: HTMLCanvasElement | null = null;
  private pelagicBlurB: HTMLCanvasElement | null = null;
  private hudTxt = new Map<string, { cv: HTMLCanvasElement; w: number; h: number }>();

  formations: Formation[] = [];
  colliders: RockCollider[] = [];
  caves: ReefCave[] = [];
  farInsts: Inst[] = [];
  floorInsts: Inst[] = [];
  fgInsts: Inst[] = [];
  fgDioramas: HTMLCanvasElement[] = [];
  fgDioramas2d: HTMLCanvasElement[] = [];
  fgDioramas3d: HTMLCanvasElement[] = [];
  crabs: Crab[] = [];
  deepGlows: { x: number; y: number; c: string; ph: number }[] = [];
  jellies: Jelly[] = [];
  pelagics: DistantPelagic[] = [];
  rays: Ray[] = [];
  vents: { x: number; y: number }[] = [];
  chestPos = { x: 0, y: 0 };
  schools: { x: number; y: number; dir: number; speed: number; n: number; p: number; seed: number; deep: boolean }[] = [];

  time = 0;
  pxs = 1; // device pixels per world unit (set by the engine) — used to snap pixel art to the device grid
  focusX = -9999; // player position: shy animals retract when it gets close
  focusY = -9999;
  private dt = 0;
  private lastT = 0;
  private hudZone = -1;
  private hudT = -99;

  constructor(opts?: { pixelMode?: boolean; reef3D?: boolean }) {
    if (opts?.pixelMode !== undefined) this.pixelMode = opts.pixelMode;
    if (opts?.reef3D !== undefined) this.reef3D = opts.reef3D;
    // Incremental generator runs in small time-sliced steps so opening the page never blocks the UI thread.
    this.gen = this.build();
  }

  /** Runs world generation for about `budgetMs`. Returns true once the ocean is complete. */
  step(budgetMs: number): boolean {
    if (this.ready || !this.gen) return true;
    const t0 = performance.now();
    do {
      const r = this.gen.next();
      if (r.done) {
        this.gen = null;
        this.ready = true;
        this.progress = 1;
        return true;
      }
      if (typeof r.value === "number") this.progress = r.value;
    } while (performance.now() - t0 < budgetMs);
    return false;
  }

  /** runs one generation stage while reporting progress from p0 to p1 (`est` = expected step count) */
  private *sub<T>(g: Generator<void, T, void>, p0: number, p1: number, est: number): Generator<number, T, void> {
    let n = 0;
    for (;;) {
      const r = g.next();
      if (r.done) return r.value;
      yield p0 + (p1 - p0) * Math.min(1, ++n / est);
    }
  }

  private *build(): Generator<number | void, void, void> {
    const wantPixel = this.pixelMode;
    const want3d = !wantPixel && this.reef3D;
    const want2d = !wantPixel && !want3d;

    this.bio = yield* this.sub(buildBiota(undefined, undefined, !wantPixel), 0, wantPixel ? 0.05 : 0.01, wantPixel ? 46 : 1);
    this.farBio = yield* this.sub(
      buildBiota([C("#1b6ab4"), 0.45], ["kelp", "fan", "whip", "staghorn", "table", "tubes", "grass", "brain", "pillar"], !wantPixel),
      wantPixel ? 0.05 : 0.01,
      wantPixel ? 0.07 : 0.015,
      wantPixel ? 9 : 1
    );
    this.fgBio = yield* this.sub(
      buildBiota([C("#030a1e"), 0.8], ["kelpBig", "fan2", "bamboo", "staghorn2", "whip2"], !wantPixel),
      wantPixel ? 0.07 : 0.015,
      wantPixel ? 0.09 : 0.02,
      wantPixel ? 5 : 1
    );

    if (want3d) {
      yield* this.sub(attach3dBiotaGen(this.bio), 0.02, 0.2, 82);
      if (!this.bio.staghorn?.[0]?.f3d?.length) {
        // Software/WebGL fallback to crisp 2D vectors
        yield* this.sub(attach2dBiotaGen(this.bio), 0.2, 0.24, 44);
        copy2dBiotaTint(this.farBio, this.bio, [C("#1b6ab4"), 0.45]);
        copy2dBiotaTint(this.fgBio, this.bio, [C("#030a1e"), 0.8]);
        this.fgDioramas2d = genForegroundOutcrops2d();
        this.built2d = true;
      } else {
        copy3dBiotaTint(this.farBio, this.bio, [C("#1b6ab4"), 0.45]);
        copy3dBiotaTint(this.fgBio, this.bio, [C("#030a1e"), 0.8]);
        this.fgDioramas3d = genForegroundOutcrops3d();
        this.built3d = true;
      }
      this.builtPixel = false;
    } else if (want2d) {
      yield* this.sub(attach2dBiotaGen(this.bio), 0.02, 0.16, 44);
      copy2dBiotaTint(this.farBio, this.bio, [C("#1b6ab4"), 0.45]);
      copy2dBiotaTint(this.fgBio, this.bio, [C("#030a1e"), 0.8]);
      this.fgDioramas2d = genForegroundOutcrops2d();
      this.built2d = true;
    } else {
      this.fgDioramas = yield* this.sub(genForegroundOutcrops(), 0.09, 0.14, 4);
      this.builtPixel = true;
    }

    yield 0.22;
    this.makeLightArt(wantPixel);
    if (wantPixel) {
      this.water = this.makeWater();
      this.far1 = yield* this.sub(this.makeFar1(), 0.22, 0.25, 16);
      this.far2 = yield* this.sub(this.makeFar2(), 0.25, 0.29, 24);
      this.far3 = yield* this.sub(this.makeFar3(true), 0.29, 0.35, 66);
      this.deep1 = yield* this.sub(this.makeDeep1(), 0.35, 0.4, 38);
      this.deep2 = yield* this.sub(this.makeDeep2(true), 0.4, 0.49, 78);
    } else {
      this.water2d = this.makeWater2d();
      this.waves2d = makeWaves2d();
      this.far1_2d = makeFar1_2d();
      yield 0.25;
      this.far2_2d = makeFar2_2d();
      yield 0.29;
      yield* this.makeFar3(false);
      if (want3d) this.far3_3d = makeFar3_3d(FAR_ROCK);
      if (want2d || !this.far3_3d) this.far3_2d = makeFar3_2d(FAR_ROCK);
      yield 0.35;
      this.deep1_2d = makeDeep1_2d();
      yield 0.4;
      yield* this.makeDeep2(false);
      if (want3d) this.deep2_3d = makeDeep2_3d(DEEP_ROCK);
      if (want2d || !this.deep2_3d) this.deep2_2d = makeDeep2_2d(DEEP_ROCK);
    }

    yield 0.49;
    yield* this.buildFormations(0.49, 0.88, wantPixel, want3d, want2d);
    this.floor = yield* this.sub(this.makeFloor(wantPixel, want3d, want2d), 0.88, 0.99, wantPixel ? 120 : 1);
    if (want3d) disposeReef3DRenderer();

    const r = rng(99);
    // drifting pixel/2D jellyfish: moon jellies up high, glowing ones in the dark
    for (let i = 0; i < 38; i++) {
      const deep = i >= 14;
      const vs = this.bio[deep ? "jelly2" : "jelly"];
      this.jellies.push({ s: vs[i % vs.length], x: r() * 3400, y: deep ? 1160 + r() * 1060 : 280 + r() * 640, p: 0.44 + (i % 3) * 0.12, ph: r() * 6.28 });
    }
    for (let i = 0; i < 6; i++)
      this.pelagics.push({ x: r() * 2600, y: 120 + r() * 440, scale: 0.75 + r() * 0.6, dir: i % 2 === 0 ? 1 : -1, speed: 7 + r() * 6, kind: i % 3 === 0 ? "whaleshark" : "manta", ph: r() * 6.28, period: 2600, par: 0.16, yPar: 0.16 });
    // Distant Giant Blue Whales: graceful, wide, high in upper water and deep abyssal chasm
    this.pelagics.push(
      { x: 460, y: 88, scale: 1.06, dir: 1, speed: 15, kind: "bluewhale", ph: 0.6, period: 1750, par: 0.12, yPar: 0.12 },
      { x: 1080, y: 1080, scale: 1.12, dir: -1, speed: 14, kind: "bluewhale", ph: 2.9, period: 1950, par: 0.25, yPar: 0.85 },
      { x: 240, y: 1580, scale: 1.18, dir: 1, speed: 12, kind: "bluewhale", ph: 4.5, period: 2050, par: 0.22, yPar: 0.88 }
    );
    // Distant Research Submarines: softly blurred & clearly visible cruising mid-water and deep trench
    this.pelagics.push(
      { x: 640, y: 195, scale: 0.98, dir: -1, speed: 18, kind: "submarine", ph: 1.2, period: 1650, par: 0.14, yPar: 0.14 },
      { x: 520, y: 1240, scale: 1.06, dir: 1, speed: 16, kind: "submarine", ph: 4.1, period: 1800, par: 0.27, yPar: 0.85 },
      { x: 1320, y: 1780, scale: 1.08, dir: -1, speed: 15, kind: "submarine", ph: 2.1, period: 1880, par: 0.28, yPar: 0.88 }
    );
    for (let i = 0; i < 26; i++) {
      const deep = i >= 12;
      this.schools.push({ x: r() * 3000, y: deep ? 1150 + r() * 1050 : 90 + r() * 720, dir: r() < 0.5 ? 1 : -1, speed: 9 + r() * 15, n: 9 + Math.floor(r() * 15), p: i % 2 === 0 ? 0.32 : 0.58, seed: r() * 100, deep });
    }
    const RAY_N = [9, 9, 6];
    for (let L = 0; L < 3; L++)
      for (let i = 0; i < RAY_N[L]; i++)
        this.rays.push({
          x: ((i + 0.12 + r() * 0.76) * RAY_PERIOD) / RAY_N[L],
          w: [185, 112, 62][L] * (0.72 + r() * 0.68),
          len: [1340, 1180, 940][L] * (0.85 + r() * 0.3),
          ph: r() * 6.28,
          a: [0.66, 0.52, 0.32][L] * (0.75 + r() * 0.5),
          layer: L,
          v: i % 3,
        });
    const span = WORLD_W * 1.24;
    for (let x = 30; x < span; x += 170 + r() * 260) {
      const big = r() < 0.45;
      const vs = this.fgBio[big ? "kelpBig" : (["fan2", "bamboo", "staghorn2", "whip2"] as const)[(r() * 4) | 0]];
      this.fgInsts.push({ s: vs[(r() * vs.length) | 0], x, y: big ? r() * 26 : -8 - r() * 10, ph: r() * NF, flip: r() < 0.5, hide: 0 });
    }
  }

  /** Lazily hydrates unbuilt render mode assets (Pixel, 2D, or 3D) if the user switches mode after startup. */
  ensureMode(pixelMode: boolean, reef3D: boolean) {
    if (!this.ready) return;
    if (pixelMode && !this.builtPixel) {
      this.builtPixel = true;
      hydratePixelBiota(this.bio);
      hydratePixelBiota(this.farBio, [C("#1b6ab4"), 0.45], ["kelp", "fan", "whip", "staghorn", "table", "tubes", "grass", "brain", "pillar"]);
      hydratePixelBiota(this.fgBio, [C("#030a1e"), 0.8], ["kelpBig", "fan2", "bamboo", "staghorn2", "whip2"]);
      const exhaust = <T,>(g: Generator<void, T, void>): T => {
        for (;;) {
          const res = g.next();
          if (res.done) return res.value;
        }
      };
      if (!this.fgDioramas.length) this.fgDioramas = exhaust(genForegroundOutcrops());
      if (!this.waves.length) this.makeWavesPixel();
      if (!this.water) this.water = this.makeWater();
      if (!this.far1) this.far1 = exhaust(this.makeFar1());
      if (!this.far2) this.far2 = exhaust(this.makeFar2());
      if (!this.far3) this.far3 = exhaust(this.makeFar3(true, false));
      if (!this.deep1) this.deep1 = exhaust(this.makeDeep1());
      if (!this.deep2) this.deep2 = exhaust(this.makeDeep2(true, false));
      for (const f of this.formations) {
        if (!f.cv || !f.col) this.hydrateFormationPixel(f);
      }
      if (!this.floor) this.floor = this.hydrateFloorPixel();
    } else if (!pixelMode && !reef3D && !this.built2d) {
      this.built2d = true;
      attach2dBiota(this.bio);
      copy2dBiotaTint(this.farBio, this.bio, [C("#1b6ab4"), 0.45]);
      copy2dBiotaTint(this.fgBio, this.bio, [C("#030a1e"), 0.8]);
      if (!this.fgDioramas2d.length) this.fgDioramas2d = genForegroundOutcrops2d();
      if (!this.water2d) this.water2d = this.makeWater2d();
      if (!this.waves2d.length) this.waves2d = makeWaves2d();
      if (!this.far1_2d) this.far1_2d = makeFar1_2d();
      if (!this.far2_2d) this.far2_2d = makeFar2_2d();
      if (!this.far3_2d) this.far3_2d = makeFar3_2d(FAR_ROCK);
      if (!this.deep1_2d) this.deep1_2d = makeDeep1_2d();
      if (!this.deep2_2d) this.deep2_2d = makeDeep2_2d(DEEP_ROCK);
      const waterRgbFn = (yPos: number): [number, number, number] => {
        const c = waterC(yPos);
        return [c & 255, (c >> 8) & 255, (c >> 16) & 255];
      };
      for (const f of this.formations) {
        const st = ROCK[f.zone];
        if (!f.cv2d) f.cv2d = paintPinnacle2d(f.top, f.bot, f.w, f.h, st, f.seed, f.rx, f.ry, f.cxl, f.cyl, f.zone, f.caveSpec);
        if (!f.caveRim2d) f.caveRim2d = paintCaveRim2d(f.top, f.bot, f.w, f.h, st, f.seed, f.caveSpec);
        if (!f.col2d) f.col2d = paintColumn2d(f.colW, f.colH, f.colTop, f.colHw0, f.colRooted, st, f.colSeed, waterRgbFn);
      }
      if (!this.floor2d && this.floorTop) this.floor2d = paintFloor2d(this.floorTop, this.floorW, this.floorH, ROCK[3]);
    } else if (!pixelMode && reef3D && !this.built3d) {
      this.built3d = true;
      const g3 = attach3dBiotaGen(this.bio);
      while (!g3.next().done) { /* sync */ }
      copy3dBiotaTint(this.farBio, this.bio, [C("#1b6ab4"), 0.45]);
      copy3dBiotaTint(this.fgBio, this.bio, [C("#030a1e"), 0.8]);
      if (!this.fgDioramas3d.length) this.fgDioramas3d = genForegroundOutcrops3d();
      if (!this.water2d) this.water2d = this.makeWater2d();
      if (!this.waves2d.length) this.waves2d = makeWaves2d();
      if (!this.far1_2d) this.far1_2d = makeFar1_2d();
      if (!this.far2_2d) this.far2_2d = makeFar2_2d();
      if (!this.far3_3d) this.far3_3d = makeFar3_3d(FAR_ROCK);
      if (!this.deep1_2d) this.deep1_2d = makeDeep1_2d();
      if (!this.deep2_3d) this.deep2_3d = makeDeep2_3d(DEEP_ROCK);
      const waterRgbFn = (yPos: number): [number, number, number] => {
        const c = waterC(yPos);
        return [c & 255, (c >> 8) & 255, (c >> 16) & 255];
      };
      for (const f of this.formations) {
        const st = ROCK[f.zone];
        if (!f.cv3d) f.cv3d = paintPinnacle3d(f.top, f.bot, f.w, f.h, st, f.seed, f.rx, f.ry, f.cxl, f.cyl, f.zone, f.caveSpec);
        if (!f.caveRim3d) f.caveRim3d = paintCaveRim3d(f.top, f.bot, f.w, f.h, st, f.seed, f.caveSpec);
        if (!f.col3d) f.col3d = paintColumn3d(f.colW, f.colH, f.colTop, f.colHw0, f.colRooted, st, f.colSeed, waterRgbFn);
      }
      if (!this.floor3d && this.floorTop) this.floor3d = paintFloor3d(this.floorTop, this.floorW, this.floorH, ROCK[3]);
      disposeReef3DRenderer();
    }
  }

  // ==========================================================================
  // WATER COLUMN — dithered 16-bit depth bands from sunlit aqua to abyssal black
  // ==========================================================================
  private makeWavesPixel() {
    if (this.waves.length) return;
    const px = (a: number, r: number, g: number, b: number) => ((Math.max(0, Math.min(255, Math.round(a))) << 24) | (b << 16) | (g << 8) | r) >>> 0;
    void px;
    for (let v = 0; v < 2; v++) {
      const W = 256,
        H = 16,
        p = new Pix(W, H),
        K = TAU / W;
      const FO = C("#ffffff"),
        L1 = C("#d6fcff"),
        L2 = C("#a2f2ff");
      for (let x = 0; x < W; x++) {
        const y0 = Math.round(4 + (v ? 1.6 * Math.sin(x * K * 5 + 1) + 1.1 * Math.sin(x * K * 11) : 2.2 * Math.sin(x * K * 3) + Math.sin(x * K * 8 + 2)));
        p.set(x, y0, FO);
        p.set(x, y0 + 1, FO);
        p.set(x, y0 + 2, L1);
        p.set(x, y0 + 3, L1);
        for (let d = 4; d < 10; d++) if (bayer(x, y0 + d) > (d - 3) / 7) p.set(x, y0 + d, L2);
        if (hash2(x, v, 7) < 0.05) p.set(x, y0 + 6 + ((hash2(x, v, 9) * 4) | 0), FO);
      }
      this.waves.push(p.toCanvas());
    }
  }

  /** Builds the small sprites the lighting is made of: light shafts, caustic nets, surface waves, mist, vignette. */
  private makeLightArt(buildPixelWaves = true) {
    const px = (a: number, r: number, g: number, b: number) => ((Math.max(0, Math.min(255, Math.round(a))) << 24) | (b << 16) | (g << 8) | r) >>> 0;
    // ---- light shafts: 3 optical dispersion beams (golden sunlit core, prism aqua, deep twilight cobalt) ----
    for (let v = 0; v < 3; v++) {
      const W = 112,
        H = 360,
        p = new Pix(W, H);
      const s1 = 1.2 + v * 2.1,
        s2 = 4.4 - v * 1.4;
      for (let y = 0; y < H; y++) {
        const t = y / (H - 1);
        const half = (0.14 + 0.36 * t) * W;
        const fall = Math.min(1, t / 0.022) * Math.pow(1 - t, 0.88);
        const cr = v === 0 ? Math.round(255 - 120 * t) : v === 1 ? Math.round(220 - 115 * t) : Math.round(135 - 75 * t);
        const cg = v === 0 ? Math.round(252 - 52 * t) : v === 1 ? Math.round(250 - 54 * t) : Math.round(198 - 68 * t);
        const cb = 255;
        for (let x = 0; x < W; x++) {
          const u = (x + 0.5 - W / 2) / half;
          if (u <= -1 || u >= 1) continue;
          const streak = (0.5 + 0.5 * Math.sin(u * 7.8 + s1 + t * 1.6)) * (0.5 + 0.5 * Math.sin(u * 18 + s2 - t * 2.1));
          const prism = v === 1 ? Math.pow(1 - Math.abs(u), 1.3) : 1;
          const a = Math.pow(1 - u * u, 1.65) * prism * (0.54 + 0.46 * Math.min(1, streak * (v ? 1.75 : 1.15))) * fall;
          if (a > 0.004) p.d[y * W + x] = px(255 * a, cr, cg, cb);
        }
      }
      this.beams.push(p.toCanvas());
    }
    // ---- caustic nets: wavering lines of focused sunlight just under the surface (tile horizontally) ----
    for (let v = 0; v < 2; v++) {
      const W = 384,
        H = 144,
        p = new Pix(W, H),
        K = TAU / W;
      const o1 = v * 1.9 + 0.4,
        o2 = v * 2.7 + 1.1;
      for (let y = 0; y < H; y++) {
        const fade = Math.pow(1 - y / H, 1.25) * Math.min(1, y / 5);
        for (let x = 0; x < W; x++) {
          const a1 = Math.sin(x * K * 3 + Math.sin(y * 0.073 + o1) * 1.6 + Math.sin(x * K * 5 + o2) * 0.9 + y * 0.033);
          const a2 = Math.sin(x * K * 4 - y * 0.057 + Math.sin(x * K * 2 + y * 0.047 + o2) * 1.8 + o1);
          const a = Math.min(1, Math.pow(1 - Math.abs(a1), 5) + Math.pow(1 - Math.abs(a2), 5) * 0.8) * fade;
          if (a > 0.012) p.d[y * W + x] = px(235 * a, 214, 252, 255);
        }
      }
      this.caust.push(p.toCanvas());
    }
    if (buildPixelWaves) this.makeWavesPixel();
    // ---- soft luminous mist bands that mark where one depth zone hands over to the next ----
    for (const col of ["140, 224, 255", "146, 128, 255", "255, 138, 84"]) {
      const cv = document.createElement("canvas");
      cv.width = 4;
      cv.height = 80;
      const c = cv.getContext("2d")!;
      const lg = c.createLinearGradient(0, 0, 0, 80);
      lg.addColorStop(0, `rgba(${col}, 0)`);
      lg.addColorStop(0.5, `rgba(${col}, 0.34)`);
      lg.addColorStop(1, `rgba(${col}, 0)`);
      c.fillStyle = lg;
      c.fillRect(0, 0, 4, 80);
      this.mist.push(cv);
    }
    // ---- vignette: deep-water darkness closing in from the edges ----
    const vg = document.createElement("canvas");
    vg.width = 320;
    vg.height = 180;
    const vc = vg.getContext("2d")!;
    vc.setTransform(1, 0, 0, 180 / 320, 0, 0);
    const rg = vc.createRadialGradient(160, 150, 62, 160, 160, 238);
    rg.addColorStop(0, "rgba(3, 5, 26, 0)");
    rg.addColorStop(0.52, "rgba(3, 8, 36, 0.28)");
    rg.addColorStop(1, "rgba(2, 4, 22, 0.96)");
    vc.fillStyle = rg;
    vc.fillRect(0, 0, 320, 320);
    this.vig = vg;

    // ---- pre-cached top sunlit scatter & bottom abyssal thermal scatter overlays ----
    const sb = document.createElement("canvas");
    sb.width = 320;
    sb.height = 180;
    const sc = sb.getContext("2d")!;
    const sgTop = sc.createLinearGradient(0, 0, 0, 115);
    sgTop.addColorStop(0, "rgba(185, 252, 255, 0.38)");
    sgTop.addColorStop(0.42, "rgba(95, 232, 255, 0.14)");
    sgTop.addColorStop(1, "rgba(80, 210, 255, 0)");
    sc.fillStyle = sgTop;
    sc.fillRect(0, 0, 320, 180);
    this.shallowBloom = sb;

    const aw = document.createElement("canvas");
    aw.width = 320;
    aw.height = 180;
    const ac = aw.getContext("2d")!;
    const agBot = ac.createRadialGradient(160, 185, 16, 160, 185, 165);
    agBot.addColorStop(0, "rgba(255, 138, 62, 0.32)");
    agBot.addColorStop(0.48, "rgba(56, 185, 235, 0.14)");
    agBot.addColorStop(1, "rgba(10, 18, 52, 0)");
    ac.fillStyle = agBot;
    ac.fillRect(0, 0, 320, 180);
    this.abyssWarm = aw;

    // ---- far-off clouds of bioluminescence behind the deep pinnacles (tiles horizontally, half resolution) ----
    const nb = document.createElement("canvas");
    nb.width = 920;
    nb.height = 460;
    const nc = nb.getContext("2d")!;
    const NEB = ["rgba(120, 92, 255, 0.56)", "rgba(44, 196, 255, 0.5)", "rgba(226, 92, 224, 0.46)"];
    const nr = rng(4242);
    for (let i = 0; i < 11; i++) {
      const x = (i + nr() * 0.8) * 84,
        y = 65 + nr() * 340,
        rx = 84 + nr() * 84,
        ry = 48 + nr() * 48;
      nc.globalAlpha = 0.52 + nr() * 0.42;
      for (const dx of [-920, 0, 920]) nc.drawImage(glowOrb(NEB[i % 3], false), x + dx - rx, y - ry, rx * 2, ry * 2);
    }
    this.neb = nb;

    // ---- the sun seen through the surface: a wide warm bloom with Snell's Window dispersion halo ----
    const bl = document.createElement("canvas");
    bl.width = 520;
    bl.height = 340;
    const bc = bl.getContext("2d")!;
    const sunOuter = glowOrb("rgba(110, 238, 255, 0.45)", false);
    const sunOrb = glowOrb("rgba(255, 250, 208, 0.72)", false);
    bc.globalCompositeOperation = "lighter";
    bc.globalAlpha = 0.65;
    bc.drawImage(sunOuter, 0, 0, 520, 340);
    bc.globalAlpha = 0.85;
    bc.drawImage(sunOrb, 45, 20, 430, 260);
    bc.globalAlpha = 0.98;
    bc.drawImage(sunOrb, 168, 76, 184, 120);
    this.bloom = bl;

    // ---- pre-rendered crisp pearl bubble sprite for foreground crevices ----
    const fb = document.createElement("canvas");
    fb.width = 32;
    fb.height = 32;
    const fc = fb.getContext("2d")!;
    const rgB = fc.createRadialGradient(16, 16, 2, 16, 16, 15);
    rgB.addColorStop(0, "rgba(210, 248, 255, 0.14)");
    rgB.addColorStop(0.55, "rgba(180, 244, 255, 0.25)");
    rgB.addColorStop(0.75, "rgba(220, 252, 255, 0.65)");
    rgB.addColorStop(1, "rgba(180, 244, 255, 0)");
    fc.fillStyle = rgB;
    fc.fillRect(0, 0, 32, 32);
    fc.strokeStyle = "rgba(195, 248, 255, 0.95)";
    fc.lineWidth = 1.6;
    fc.beginPath();
    fc.arc(16, 16, 10, 0, Math.PI * 2);
    fc.stroke();
    fc.fillStyle = "rgba(255, 255, 255, 0.95)";
    fc.beginPath();
    fc.arc(12.5, 12.5, 2.7, 0, Math.PI * 2);
    fc.fill();
    this.fgBubble = fb;
  }

  // No screen-glued overhangs: all rocks & corals belong naturally to the ocean world!

  private makeWater(): HTMLCanvasElement {
    const pw = 64,
      w = 512, // pre-tiled 8x horizontally so drawWater needs only 1-2 blits per frame
      h = WORLD_H + WPAD * 2,
      p = new Pix(w, h),
      BAND = 16;
    for (let y = 0; y < h; y++) {
      const wy = y - WPAD,
        k = Math.floor(wy / BAND),
        f = (wy - k * BAND) / BAND;
      const c0 = waterC(k * BAND),
        c1 = waterC((k + 1) * BAND);
      const th = (f - 0.45) / 0.55;
      for (let x = 0; x < pw; x++) {
        const col = th > 0 && bayer(x, y) < th ? c1 : c0;
        for (let tx = x; tx < w; tx += pw) p.d[y * w + tx] = col;
      }
    }
    return p.toCanvas();
  }

  private makeWater2d(): HTMLCanvasElement {
    const w = 16,
      h = WORLD_H + WPAD * 2;
    const cv = document.createElement("canvas");
    cv.width = w;
    cv.height = h;
    const c = cv.getContext("2d")!;
    const g = c.createLinearGradient(0, 0, 0, h);
    for (const [wy, col] of WATER) {
      const stop = Math.max(0, Math.min(1, (wy + WPAD) / h));
      const r = col & 255;
      const gr = (col >> 8) & 255;
      const b = (col >> 16) & 255;
      g.addColorStop(stop, `rgb(${r},${gr},${b})`);
    }
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    return cv;
  }

  // ==========================================================================
  // LAYER 0 (0.09x): Ultra-Far Seamounts, Sunken Galleon & Temple Spires
  // Highest in the frame, smallest silhouettes, lowest contrast, zero texture
  // detail, palest sunlit turquoise-cyan colors — softly blurred into water haze!
  // ==========================================================================
  private *makeFar1(): Generator<void, HTMLCanvasElement, void> {
    const w = 1800,
      h = 540,
      p = new Pix(w, h);
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
    // Pale sunlit cyan-turquoise tones close to water background (low contrast!)
    const K = P("#9cf7ff", "#72e6f5", "#56d2e6", "#42bed6"),
      D = K[2];

    // Small, high-horizon sunken galleon silhouette resting far in the distance
    const gx = 520,
      gy = Math.round(ridge(gx)) + 8;
    p.poly([gx - 50, gy - 14, gx - 20, gy + 10, gx + 40, gy + 8, gx + 58, gy - 22, gx + 28, gy - 18, gx + 16, gy - 9, gx - 27, gy - 8, gx - 38, gy - 22], D);
    const spars = [
      [gx + 46, gy - 16, gx + 76, gy - 28, 2],
      [gx - 8, gy - 8, gx - 4, gy - 66, 2],
      [gx + 20, gy - 9, gx + 24, gy - 54, 2],
      [gx - 24, gy - 46, gx + 14, gy - 50, 1.5],
      [gx - 18, gy - 30, gx + 10, gy - 33, 1.5],
      [gx + 8, gy - 38, gx + 36, gy - 42, 1.5],
    ];
    for (const [x0, y0, x1, y1, th] of spars) p.line(x0, y0, x1, y1, D, th);

    // Small distant temple spires & broken lintel
    const tx = 1360,
      ty = Math.round(ridge(tx)) + 8;
    for (const [cx, ch] of [[-36, 38], [-15, 48], [8, 32], [28, 44]]) {
      p.rect(tx + cx - 3, ty - ch, 6, ch + 10, D);
      p.rect(tx + cx - 5, ty - ch - 3, 10, 3, D);
    }
    p.poly([tx - 44, ty - 52, tx - 8, ty - 56, tx - 8, ty - 50, tx - 44, ty - 46], D);

    // Simple distant kelp & pillar silhouettes (zero fine texture)
    for (let x = 80; x < w - 80; x += 95) {
      const y = Math.round(ridge(x)) + 4;
      const hS = 14 + ((hash2(x, 3, 11) * 20) | 0);
      p.rect(x - 3, y - hS, 6, hS + 6, D);
      p.ell(x, y - hS, 10, 4, D);
    }
    yield;
    yield* fillRidge(p, ridge, K, 5, 165);
    return blurCanvas(p.toCanvas(), 2.2);
  }

  // ==========================================================================
  // LAYER 1 (0.20x): Far-Mid Canyon Shelves, Natural Stone Arches & Coral Silhouettes
  // Medium-pale oceanic teal tones overlapping Layer 0 with light optical blur
  // ==========================================================================
  private *makeFar2(): Generator<void, HTMLCanvasElement, void> {
    const w = 1900,
      h = 540,
      p = new Pix(w, h),
      r = rng(303);
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
    const K = P("#56c4e2", "#34a2cb", "#2184b4", "#156799");
    const FP = [K[2], K[2], K[1], K[3], K[0]];
    let nCoral = 0;
    for (let x = 28; x < w - 28; x += 26 + r() * 28) {
      if ((++nCoral & 7) === 0) yield;
      const y = Math.round(ridge(x)) + 4,
        k = r(),
        sd = (r() * 999) | 0;
      const s =
        k < 0.3
          ? genBranch(sd, FP, 0, 42, 42, 10, 3, 3)
          : k < 0.52
            ? genTable(sd, FP, 0, 40, 26)
            : k < 0.72
              ? genFan(sd, FP, 42, 42)
              : k < 0.86
                ? genTubes(sd, FP, 0, 32, 38)
                : genKelp(sd, FP, 46, 74);
      p.blit(s, x - (s.w >> 1), y - s.h + 2);
    }
    yield;
    yield* fillRidge(p, ridge, K, 9, 160);
    yield;
    // Sculpted stone canyon arches in the far-mid ridge
    for (const [ax, aw, ah] of [[380, 86, 58], [980, 105, 66], [1560, 84, 56]]) {
      const ay = Math.round(ridge(ax)) + 98;
      for (let y = ay - ah - 3; y <= ay + ah * 0.4; y++)
        for (let x = ax - aw - 3; x <= ax + aw + 3; x++) {
          const u = (x - ax) / aw,
            v = (y - ay) / ah;
          const inside = v <= 0 ? u * u + v * v < 1 : Math.abs(u) < 1 && v < 0.38 * (1 - u * u);
          if (inside) p.set(x, y, 0);
          else if (v <= 0 && u * u + v * v < 1.08 && p.get(x, y)) p.set(x, y, K[0]);
        }
    }
    return blurCanvas(p.toCanvas(), 0.9);
  }

  // ==========================================================================
  // LAYER 2 (0.42x): Midground Stone Formations & Coral Terraces
  // Deeper oceanic blue-teal rock formations with visible fans & sponges
  // ==========================================================================
  private *makeFar3(buildPixel = true, plantInsts = true): Generator<void, HTMLCanvasElement | undefined, void> {
    const w = 2100,
      h = 540,
      r = rng(509);
    const top = new Int16Array(w);
    for (let x = 0; x < w; x++) {
      const t = (x / w) * TAU;
      top[x] =
        Math.round(
          (256 - Math.sin(t * 3 + 0.4) * 58 - Math.cos(t * 6 + 2) * 30 + Math.sin(t * 23) * 6) / 3
        ) * 3;
    }
    if (plantInsts) {
      plant(r, this.farBio, FAR_TBL, top, 8, w - 8, 0, 0, this.farInsts, 4);
      this.farInsts.sort((a, b) => b.s.h - a.s.h);
    }
    if (!buildPixel) return undefined;
    const p = new Pix(w, h),
      m = new Uint8Array(w * h);
    for (let x = 0; x < w; x++) for (let yy = top[x]; yy < h; yy++) m[yy * w + x] = 1;
    yield* paintRock(p, m, FAR_ROCK, 509, 17);
    fadeBottom(p, 150);
    return p.toCanvas();
  }

  // ==========================================================================
  // DEEP LAYERS (0.24x / 0.48x): forests of rooted pinnacles, arches & glowing veins
  // ==========================================================================
  private *makeDeep1(): Generator<void, HTMLCanvasElement, void> {
    const w = 1800,
      h = 1460,
      p = new Pix(w, h);
    const { m } = yield* spireMask(w, h, rng(777), 9, 60, 740, 34, 80);
    yield* paintFlat(p, m, P("#3c4eb0", "#1d2a7c", "#151d5e", "#283890"), 3);
    return p.toCanvas();
  }

  private *makeDeep2(buildPixel = true, addGlows = true): Generator<void, HTMLCanvasElement | undefined, void> {
    const w = 2000,
      h = 1420,
      r = rng(1414);
    const glows = ["rgba(60, 220, 255, 0.5)", "rgba(240, 110, 250, 0.5)", "rgba(150, 130, 255, 0.5)"];
    if (!buildPixel) {
      if (addGlows) {
        const caps: [number, number, number][] = [];
        for (let i = 0; i < 7; i++) {
          const cx = ((i + 0.3 + r() * 0.4) * w) / 7;
          const ty = 90 + r() * (770 - 90);
          const R = 46 + r() * (96 - 46);
          r(); r(); r(); // align s1, lean + ch consumption
          caps.push([cx, ty, R]);
        }
        for (const [cx, ty, R] of caps) {
          for (let k = 0; k < 3; k++) {
            const vi = (k + ((r() * 3) | 0)) % 3;
            this.deepGlows.push({ x: cx + (r() - 0.5) * R, y: ty + r() * 30, c: glows[vi], ph: r() * 6 });
          }
        }
      }
      return undefined;
    }

    const p = new Pix(w, h);
    const { m, caps } = yield* spireMask(w, h, r, 7, 90, 770, 46, 96);
    for (const i of [1, 4]) {
      const a = caps[i],
        b = caps[i + 1];
      const x0 = Math.round(a[0] + a[2] * 0.4),
        x1 = Math.round(b[0] - b[2] * 0.4),
        y0 = a[1] + 8,
        y1 = b[1] + 8;
      for (let x = x0; x <= x1; x++) {
        const f = (x - x0) / (x1 - x0),
          yc = y0 + (y1 - y0) * f - Math.sin(f * Math.PI) * 44,
          th = 9 + Math.abs(f - 0.5) * 16 + Math.sin(x * 0.2) * 1.5;
        for (let y = Math.round(yc - th * 0.4); y <= yc + th * 0.6; y++) if (y >= 0 && y < h) m[y * w + x] = 1;
      }
    }
    const DP = P("#0c1040", "#1a2068", "#2c3a98", "#4658c0", "#7ad8f0");
    for (const [cx, ty, R, ch] of caps) {
      for (let k = 0; k < 4; k++) {
        const x = Math.round(cx + (r() - 0.5) * R * 1.3),
          xi = ((x % w) + w) % w;
        let sy = Math.max(0, Math.floor(ty - ch - 2));
        while (sy < h - 1 && !m[sy * w + xi]) sy++;
        const sd = (r() * 999) | 0,
          q = r();
        const s = q < 0.35 ? genBranch(sd, DP, 0, 46, 46, 11, 3.2, 3) : q < 0.6 ? genFan(sd, DP, 46, 46) : q < 0.8 ? genWhip(sd, DP, 44, 58, true) : genTubes(sd, DP, 0, 34, 42);
        if (x > 30 && x < w - 30) p.blit(s, x - (s.w >> 1), sy - s.h + 2);
      }
      yield;
    }
    yield* paintRock(p, m, DEEP_ROCK, 1414, 17);
    p.tint(C("#171b5c"), 0.4);
    yield;
    const veins = [C("#52e6ff"), C("#f07af6"), C("#9c8cff")];
    for (const [cx, ty, R] of caps) {
      for (let k = 0; k < 3; k++) {
        let x = cx + (r() - 0.5) * R * 1.2,
          y = ty - 4 + r() * 10;
        const vi = (r() * 3) | 0,
          len = 30 + r() * 100;
        for (let s = 0; s < len; s++) {
          x += (r() - 0.5) * 1.7;
          y += 0.6 + r() * 0.8;
          const xi = ((Math.round(x) % w) + w) % w;
          if (p.get(xi, Math.round(y)) && s % 5 !== 4) p.set(xi, Math.round(y), veins[vi]);
        }
        if (addGlows) this.deepGlows.push({ x: cx + (r() - 0.5) * R, y: ty + r() * 30, c: glows[vi], ph: r() * 6 });
      }
    }
    return p.toCanvas();
  }

  // ==========================================================================
  // MAIN PLANE: reef pinnacles (collidable crown + rooted stem) at three depth levels
  // ==========================================================================
  private *buildFormations(p0: number, p1: number, wantPixel: boolean, want3d: boolean, want2d: boolean): Generator<number | void, void, void> {
    const r = rng(2026);
    const specs: [number, number, number, number, number][] = [
      // Zona Cahaya — sunlit sandy coral islands
      [540, 450, 174, 76, 0],
      [1420, 535, 192, 82, 0],
      [2340, 445, 176, 76, 0],
      [3220, 520, 182, 80, 0],
      // Zona Senja — gorgonian canyon cliffs
      [400, 1020, 212, 94, 1],
      [1060, 1140, 198, 90, 1],
      [1780, 1010, 224, 96, 1],
      [2540, 1130, 208, 92, 1],
      [3320, 1025, 216, 94, 1],
      // Zona Malam — midnight bioluminescent coral terraces
      [640, 1590, 186, 88, 2],
      [1380, 1680, 202, 94, 2],
      [2120, 1570, 192, 90, 2],
      [2940, 1670, 204, 94, 2],
      [3480, 1560, 172, 82, 2],
      // Palung Abisal — deep rooted trench pillars before the sand seabed
      [520, 2040, 176, 84, 3],
      [1320, 2075, 188, 88, 3],
      [2260, 2030, 178, 84, 3],
      [3080, 2065, 186, 88, 3],
    ];
    let done = 0;
    for (const [x, y, rx, ry, z] of specs) {
      const f = yield* this.makePinnacle(r, x, y, rx, ry, z, done, wantPixel, want3d, want2d);
      this.formations.push(f);
      if (f.cave) this.caves.push(f.cave);
      yield p0 + ((p1 - p0) * ++done) / specs.length;
    }
    for (const f of this.formations) this.colliders.push(...f.colliders);
  }

  private paintPinnacleMaskAndPixel(
    W: number,
    H: number,
    top: Int16Array,
    bot: Int16Array,
    zone: number,
    seed: number,
    caveSpec: CaveSpec2d,
    shades: { x: number; y: number; f: number }[]
  ): { cv: HTMLCanvasElement; caveRim: HTMLCanvasElement } {
    const p = new Pix(W, H),
      m = new Uint8Array(W * H);
    for (let x = 0; x < W; x++) if (top[x] >= 0) for (let y = top[x]; y <= bot[x]; y++) m[y * W + x] = 1;
    const st = ROCK[zone];
    const g = paintRock(p, m, st, seed, 15);
    while (!g.next().done) { /* sync */ }
    const caveBounds = sampleCaveBounds(caveSpec, seed, W);
    const rimPix = new Pix(W, H);
    const deepVoid = C("#020410");
    const crystalPix = zone >= 2 ? C("#c4b5fd") : C("#7af0ff");
    for (let x = caveBounds.xMin; x <= caveBounds.xMax; x++) {
      const cy0 = caveBounds.ceil[x];
      const cy1 = caveBounds.floor[x];
      if (cy0 < 0 || cy1 < cy0) continue;
      const f =
        caveSpec.kind === "tunnel"
          ? Math.abs((x - caveSpec.gx) / Math.max(1, caveSpec.grx * 1.12))
          : clamp01((x - (caveSpec.gx - caveSpec.dir * caveSpec.grx * 0.86)) / Math.max(1, caveSpec.dir * caveSpec.grx * 2.1));
      for (let y = Math.max(1, cy0); y <= Math.min(H - 2, cy1); y++) {
        if (!m[y * W + x]) continue;
        if (caveSpec.kind === "tunnel") {
          const v = (y - cy0) / Math.max(1, cy1 - cy0);
          p.d[y * W + x] = v < 0.28 ? deepVoid : v < 0.82 ? st.ramp[0] : st.ramp[1];
        } else {
          p.d[y * W + x] = f < 0.45 ? deepVoid : f < 0.78 ? st.ramp[0] : st.ramp[1];
        }
        if (y === cy1 - 2 && bayer(x, y) > 0.82 && x % 7 === 0) p.d[y * W + x] = crystalPix;
      }
      if (cy1 - cy0 > caveSpec.gry * 0.72) {
        for (let dy = -3; dy <= 0; dy++) {
          const ry0 = cy0 + dy;
          if (ry0 >= 1 && ry0 < H - 1 && m[ry0 * W + x]) {
            const col = dy < -1 ? st.ramp[3] : st.ramp[1];
            p.d[ry0 * W + x] = dy === -3 ? st.ramp[4] : col;
            rimPix.d[ry0 * W + x] = col;
          }
        }
      }
    }
    for (const s of shades) {
      for (let dx = -s.f - 2; dx <= s.f + 2; dx++) {
        const xi = s.x + dx;
        if (xi < 0 || xi >= W) continue;
        for (let dy = 0; dy < 3; dy++) {
          const yi = s.y + dy;
          if (yi < H && m[yi * W + xi] && (dy < 2 || bayer(xi, yi) < 0.55)) p.d[yi * W + xi] = dy === 0 ? st.crust[0] : st.ramp[2];
        }
      }
    }
    return { cv: p.toCanvas(), caveRim: rimPix.toCanvas() };
  }

  private hydrateFormationPixel(f: Formation) {
    const res = this.paintPinnacleMaskAndPixel(f.w, f.h, f.top, f.bot, f.zone, f.seed, f.caveSpec, f.shades);
    f.cv = res.cv;
    f.caveRim = res.caveRim;
    const g = this.makeColumn(rng(f.colSeed), f.colTop, f.colTop + f.colH, f.colHw0, f.colRooted, f.zone, f.colSeed);
    for (;;) {
      const r = g.next();
      if (r.done) {
        f.col = r.value;
        break;
      }
    }
  }

  private *makePinnacle(
    r: Rnd,
    wx: number,
    wy: number,
    rx: number,
    ry: number,
    zone: number,
    idx = 0,
    wantPixel = true,
    want3d = false,
    want2d = false
  ): Generator<void, Formation, void> {
    const seed = (r() * 1e6) | 0;
    const padX = 12,
      padT = 6,
      padB = Math.round(ry * 0.5) + 8;
    const W = Math.round(rx * 2) + padX * 2,
      H = Math.round(ry * 1.72) + padT + padB;
    const cxl = W >> 1,
      cyl = padT + Math.round(ry * 0.84);
    const ox = Math.round(wx) - cxl,
      oy = Math.round(wy) - cyl;
    const top = new Int16Array(W).fill(-1),
      bot = new Int16Array(W).fill(-1);
    const s1 = r() * 9,
      s2 = r() * 9,
      s3 = r() * 9,
      s4 = r() * 9;
    let firstX = -1,
      lastX = 0;
    for (let x = 0; x < W; x++) {
      const u = (x - cxl) / rx;
      if (Math.abs(u) >= 1) continue;
      const ty = Math.max(1, Math.round(cyl - ry * 0.8 * Math.pow(1 - Math.pow(Math.abs(u), 2.6), 0.6) + Math.sin(x * 0.047 + s1) * 4.5 + Math.sin(x * 0.11 + s2) * 1.8));
      const cragBase = Math.sin(x * 0.055 + s4) * 0.5 + Math.cos(x * 0.115 + s2 * 1.3) * 0.35 + Math.sin(x * 0.025 + s1) * 0.25;
      const drip = Math.max(0, cragBase) * ry * (zone > 0 ? 0.14 : 0.08);
      const by = Math.min(H - 2, Math.round(cyl + ry * 0.84 * Math.sqrt(1 - u * u) * (0.85 + 0.15 * Math.sin(x * 0.06 + s3)) + drip));
      if (by - ty < 6) continue;
      top[x] = ty;
      bot[x] = by;
      if (firstX < 0) firstX = x;
      lastX = x;
    }
    const st = ROCK[zone];

    const caveKind: "alcove" | "tunnel" = idx % 3 === 1 ? "tunnel" : "alcove";
    const caveDir = caveKind === "tunnel" ? 0 : idx % 3 === 0 ? 1 : -1;
    const gy = Math.round(cyl + ry * 0.03);
    const gry = Math.round(ry * 0.32);
    const gx = caveKind === "tunnel" ? cxl : Math.round(cxl + caveDir * rx * 0.36);
    const grx = caveKind === "tunnel" ? Math.round(rx * 0.95) : Math.round(rx * 0.58);
    const caveSpec: CaveSpec2d = { kind: caveKind, dir: caveDir, gx, gy, grx, gry };
    const maxPassR = Math.round(ry * 0.23);
    const cave: ReefCave = {
      id: idx + 1,
      x: ox + gx,
      y: oy + gy,
      rx: grx,
      ry: gry,
      maxR: maxPassR,
      kind: caveKind,
      dir: caveDir,
      zone,
    };
    const caveBounds = sampleCaveBounds(caveSpec, seed, W);

    const insts: Inst[] = [];
    const shades: { x: number; y: number; f: number }[] = [];
    const shade = (x: number, y: number, f: number) => {
      shades.push({ x, y, f });
    };
    const occ = new Uint8Array(W);
    const px0 = Math.max(firstX + 5, Math.round(cxl - rx * 0.9)),
      px1 = Math.min(lastX - 5, Math.round(cxl + rx * 0.9));
    plant(r, this.bio, TOP_BIO[zone], top, px0, px1, ox, oy, insts, 4, shade, occ);
    plant(r, this.bio, FILL_BIO[zone], top, px0, px1, ox, oy, insts, 4, shade, occ, true);
    insts.sort((a, b) => b.s.h - a.s.h);

    const stars = this.bio[STAR_BIO[zone]];
    for (let k = 0; k < 2; k++) {
      const x = Math.round(firstX + 30 + r() * (lastX - firstX - 60));
      if (top[x] >= 0 && top[x] + 18 < gy - gry) {
        insts.push({ s: stars[(r() * stars.length) | 0], x: ox + x, y: oy + top[x] + 10 + ((r() * 5) | 0), ph: r() * NF, flip: false, hide: 0 });
      }
    }
    const shelf = this.bio[SIDE_BIO[zone]];
    const isSolidAt = (x: number, y: number) => top[x] >= 0 && y >= top[x] && y <= bot[x];
    for (const fy of [-0.36, -0.02, 0.34]) {
      const yy = Math.round(cyl + ry * fy);
      const inCaveMouthY = yy >= gy - gry - 6 && yy <= gy + gry + 6;
      let xl = 0;
      while (xl < W && !isSolidAt(xl, yy)) xl++;
      let xr = W - 1;
      while (xr > 0 && !isSolidAt(xr, yy)) xr--;
      if (xl >= xr) continue;
      const openLeft = caveKind === "tunnel" || caveDir === -1;
      const openRight = caveKind === "tunnel" || caveDir === 1;
      if (r() < 0.8 && !(inCaveMouthY && openLeft)) {
        insts.push({ s: shelf[(r() * shelf.length) | 0], x: ox + xl + 3, y: oy + yy, ph: r() * NF, flip: true, hide: 0 });
      }
      if (r() < 0.8 && !(inCaveMouthY && openRight)) {
        insts.push({ s: shelf[(r() * shelf.length) | 0], x: ox + xr - 3, y: oy + yy, ph: r() * NF, flip: false, hide: 0 });
      }
    }
    const vines = this.bio[HANG_BIO[zone]];
    for (let x = firstX + 16 + r() * 20; x < lastX - 16; x += 24 + r() * 34) {
      const xi = Math.round(x);
      if (bot[xi] > 0 && Math.abs(xi - cxl) > rx * 0.34) {
        insts.push({ s: vines[(r() * vines.length) | 0], x: ox + xi, y: oy + bot[xi], ph: r() * NF, flip: r() < 0.5, hide: 0 });
      }
    }
    if (zone < 2) this.crabs.push({ top, ox, oy, x0: cxl + (r() - 0.5) * rx * 0.6, range: rx * 0.32, sp: 0.22 + r() * 0.15, ph: r() * 6, v: (r() * 2) | 0 });

    const colTop = Math.round(wy + ry * 0.25);
    const rooted = zone >= 2;
    const colBot = rooted ? Math.round(floorY(wx)) + 18 : Math.round(wy + ry + 350 + r() * 120);
    const colHw0 = rx * 0.3;
    const colSeed = seed + 5;
    const colH = Math.max(40, colBot - colTop);
    const colW = Math.round(colHw0 * 3.4 + (rooted ? 140 : 54));

    let cv: HTMLCanvasElement | undefined;
    let caveRim: HTMLCanvasElement | undefined;
    let col: HTMLCanvasElement | undefined;
    if (wantPixel) {
      const pxRes = this.paintPinnacleMaskAndPixel(W, H, top, bot, zone, seed, caveSpec, shades);
      cv = pxRes.cv;
      caveRim = pxRes.caveRim;
      col = yield* this.makeColumn(r, colTop, colBot, colHw0, rooted, zone, colSeed);
    } else {
      // keep RNG state aligned with makeColumn's initial 5 draws
      r(); r(); r(); r(); r();
    }

    const waterRgbFn = (yPos: number): [number, number, number] => {
      const c = waterC(yPos);
      return [c & 255, (c >> 8) & 255, (c >> 16) & 255];
    };
    const cv3d = want3d ? paintPinnacle3d(top, bot, W, H, st, seed, rx, ry, cxl, cyl, zone, caveSpec) : undefined;
    const caveRim3d = want3d ? paintCaveRim3d(top, bot, W, H, st, seed, caveSpec) : undefined;
    const col3d = want3d ? paintColumn3d(colW, colH, colTop, colHw0, rooted, st, colSeed, waterRgbFn) : undefined;
    const need2d = want2d || (want3d && (!cv3d || !col3d));
    const cv2d = need2d ? paintPinnacle2d(top, bot, W, H, st, seed, rx, ry, cxl, cyl, zone, caveSpec) : undefined;
    const caveRim2d = need2d ? paintCaveRim2d(top, bot, W, H, st, seed, caveSpec) : undefined;
    const col2d = need2d ? paintColumn2d(colW, colH, colTop, colHw0, rooted, st, colSeed, waterRgbFn) : undefined;

    const caveWorldY = wy + ry * 0.08;
    const colliders: RockCollider[] = [];
    if (caveKind === "tunnel") {
      colliders.push(
        { x: wx - rx * 0.58, y: wy - ry * 0.42, r: ry * 0.22 },
        { x: wx - rx * 0.22, y: wy - ry * 0.52, r: ry * 0.26 },
        { x: wx + rx * 0.22, y: wy - ry * 0.52, r: ry * 0.26 },
        { x: wx + rx * 0.58, y: wy - ry * 0.42, r: ry * 0.22 },
        { x: wx - rx * 0.58, y: wy + ry * 0.54, r: ry * 0.18 },
        { x: wx - rx * 0.22, y: wy + ry * 0.62, r: ry * 0.20 },
        { x: wx + rx * 0.22, y: wy + ry * 0.62, r: ry * 0.20 },
        { x: wx + rx * 0.58, y: wy + ry * 0.54, r: ry * 0.18 },
        { x: wx - rx * 0.76, y: caveWorldY, r: gry * 0.96, maxPassR },
        { x: wx + rx * 0.76, y: caveWorldY, r: gry * 0.96, maxPassR }
      );
    } else {
      const d = caveDir;
      colliders.push(
        { x: wx - d * rx * 0.54, y: wy, r: ry * 0.64 },
        { x: wx - d * rx * 0.24, y: wy, r: ry * 0.56 },
        { x: wx + d * rx * 0.16, y: wy - ry * 0.50, r: ry * 0.24 },
        { x: wx + d * rx * 0.46, y: wy - ry * 0.46, r: ry * 0.23 },
        { x: wx + d * rx * 0.74, y: wy - ry * 0.38, r: ry * 0.20 },
        { x: wx + d * rx * 0.16, y: wy + ry * 0.62, r: ry * 0.20 },
        { x: wx + d * rx * 0.46, y: wy + ry * 0.59, r: ry * 0.19 },
        { x: wx + d * rx * 0.74, y: wy + ry * 0.52, r: ry * 0.17 },
        { x: wx + d * rx * 0.76, y: caveWorldY, r: gry * 0.96, maxPassR }
      );
    }
    const sdfCave = buildRockSDF(W, H, top, bot, caveBounds, 52, 3);
    const sdfSolid = buildRockSDF(W, H, top, bot, null, 52, 4);

    return {
      x: ox,
      y: oy,
      w: W,
      h: H,
      cv,
      cv2d,
      cv3d,
      caveRim,
      caveRim2d,
      caveRim3d,
      cave,
      sdfCave,
      sdfSolid,
      col,
      col2d,
      col3d,
      colW,
      colH,
      colTop,
      colHw0,
      colRooted: rooted,
      colSeed,
      colX: Math.round(wx) - (colW >> 1),
      colY: colTop,
      top,
      bot,
      zone,
      seed,
      rx,
      ry,
      cxl,
      cyl,
      caveSpec,
      shades,
      insts,
      colliders,
    };
  }

  private *makeColumn(r: Rnd, yTop: number, yBot: number, hw0: number, rooted: boolean, zone: number, seed: number): Generator<void, HTMLCanvasElement, void> {
    const H = Math.max(40, yBot - yTop),
      W = Math.round(hw0 * 3.4 + (rooted ? 140 : 54));
    const p = new Pix(W, H),
      m = new Uint8Array(W * H);
    const s1 = r() * 9,
      s2 = r() * 9,
      s3 = r() * 9,
      s4 = r() * 9,
      lean = (r() - 0.5) * 30;
    for (let y = 0; y < H; y++) {
      const t = y / H;
      let hw = hw0 * (0.92 + 0.5 * Math.pow(t, 1.4)) + Math.sin(y * 0.043 + s1) * 5 + Math.sin(y * 0.13 + s2) * 2.2 + (Math.floor(y / 41 + s3) & 1) * 4;
      if (rooted) hw += Math.pow(Math.max(0, (t - 0.7) / 0.3), 2) * 38;
      const cx = W / 2 + Math.sin(y * 0.017 + s4) * 7 + lean * t;
      const a = Math.max(0, Math.round(cx - hw)),
        b = Math.min(W - 1, Math.round(cx + hw));
      for (let x = a; x <= b; x++) m[y * W + x] = 1;
    }
    yield* paintRock(p, m, ROCK[zone], seed, 19, 1, false);
    for (let y = 0; y < H; y++) {
      const t = y / H,
        wc = waterC(yTop + y),
        a = rooted ? 0.3 : Math.min(0.97, 0.3 + Math.pow(t, 0.75) * 0.7),
        cut = rooted ? -1 : (t - 0.58) / 0.42;
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (!p.d[i]) continue;
        if (cut > 0 && bayer(x, y) < cut) p.d[i] = 0;
        else p.d[i] = mixC(p.d[i], wc, a);
      }
    }
    return p.toCanvas();
  }

  private hydrateFloorPixel(): HTMLCanvasElement {
    const W = this.floorW,
      H = this.floorH,
      top = this.floorTop!;
    const p = new Pix(W, H),
      m = new Uint8Array(W * H);
    for (let x = 0; x < W; x++) for (let y = top[x]; y < H; y++) m[y * W + x] = 1;
    const st = ROCK[3];
    const g = paintRock(p, m, st, 77, 22);
    while (!g.next().done) { /* sync */ }
    const sp = [C("#62e8ff"), C("#f48af0"), C("#9c8cff")];
    for (let x = 2; x < W - 2; x++) if (hash2(x, 9, 4) < 0.035) p.set(x, top[x] + 1 + ((hash2(x, 2, 4) * 3) | 0), sp[(hash2(x, 5, 4) * 3) | 0]);
    for (const s of this.floorShades) {
      for (let dx = -s.f - 2; dx <= s.f + 2; dx++) {
        const xi = s.x + dx;
        if (xi < 0 || xi >= W) continue;
        for (let dy = 0; dy < 3; dy++) {
          const yi = s.y + dy;
          if (yi >= top[xi] && yi < H && (dy < 2 || bayer(xi, yi) < 0.55)) p.d[yi * W + xi] = dy === 0 ? st.crust[0] : st.ramp[2];
        }
      }
    }
    return p.toCanvas();
  }

  // ==========================================================================
  // ABYSSAL FLOOR: boulders, sediment, black smokers, tube-worm colonies, treasure
  // ==========================================================================
  private *makeFloor(wantPixel = true, want3d = false, want2d = false): Generator<void, HTMLCanvasElement | undefined, void> {
    const W = WORLD_W,
      H = WORLD_H + 75 - FLOOR_TOP,
      O = FLOOR_TOP;
    const top = new Int16Array(W),
      r = rng(1234);
    for (let x = 0; x < W; x++) top[x] = Math.round(floorY(x)) - O;
    for (let i = 0; i < 46; i++) {
      const bx = (r() * W) | 0,
        brx = 9 + r() * 20,
        bry = 4 + r() * 9,
        b0 = floorY(bx) - O + 2;
      for (let x = Math.max(0, Math.floor(bx - brx)); x <= Math.min(W - 1, bx + brx); x++) {
        const u = (x - bx) / brx,
          yy = Math.round(b0 - bry * Math.sqrt(Math.max(0, 1 - u * u)));
        if (yy < top[x]) top[x] = yy;
      }
    }
    this.floorTop = top;
    this.floorW = W;
    this.floorH = H;
    const st = ROCK[3];

    const shade = (x: number, y: number, f: number) => {
      this.floorShades.push({ x, y, f });
    };
    const ptop = top.slice();
    const reserve = (x: number, hw: number) => {
      for (let k = Math.max(0, x - hw); k <= Math.min(W - 1, x + hw); k++) ptop[k] = -1;
    };
    const lowest = (x: number, f: number) => {
      let lo = 0;
      for (let k = -f; k <= f; k++) lo = Math.max(lo, top[Math.max(0, Math.min(W - 1, x + k))]);
      return lo;
    };
    const chestX = Math.round(W * 0.62);
    const vents = this.bio.vent,
      rift = this.bio.riftia;
    for (let i = 0; i < 9; i++) {
      const x = Math.round(190 + i * 415 + r() * 110);
      if (Math.abs(x - chestX) < 90) continue;
      const base = lowest(x, 14);
      this.floorInsts.push({ s: vents[i % vents.length], x, y: O + base, ph: r() * NF, flip: false, hide: 0 });
      shade(x, base, 18);
      this.vents.push({ x: x + 2, y: O + base - 40 });
      reserve(x, 28);
      for (const dx of [-34, 36, 62]) {
        if (r() < 0.25) continue;
        const rx = x + dx + ((r() * 8) | 0),
          rb = lowest(rx, 9);
        this.floorInsts.push({ s: rift[(r() * rift.length) | 0], x: rx, y: O + rb, ph: r() * NF, flip: r() < 0.5, hide: 0 });
        shade(rx, rb, 9);
        reserve(rx, 14);
      }
    }
    const cb = lowest(chestX, 12);
    this.floorInsts.push({ s: this.bio.chest[0], x: chestX, y: O + cb, ph: 0, flip: false, hide: 0 });
    shade(chestX, cb, 14);
    reserve(chestX, 24);
    this.chestPos = { x: chestX, y: O + cb - 14 };

    const occ = new Uint8Array(W);
    plant(r, this.bio, TOP_BIO[3], ptop, 6, W - 6, 0, O, this.floorInsts, 6, shade, occ);
    plant(r, this.bio, FILL_BIO[3], ptop, 6, W - 6, 0, O, this.floorInsts, 6, shade, occ, true);
    this.floorInsts.sort((a, b) => b.s.h - a.s.h);
    const wtop = new Int16Array(W);
    for (let x = 0; x < W; x++) wtop[x] = top[x];
    for (let i = 0; i < 9; i++) this.crabs.push({ top: wtop, ox: 0, oy: O, x0: 200 + r() * (W - 400), range: 60 + r() * 80, sp: 0.12 + r() * 0.12, ph: r() * 6, v: (r() * 2) | 0 });

    if (want3d) this.floor3d = paintFloor3d(top, W, H, st);
    if (want2d || (want3d && !this.floor3d)) this.floor2d = paintFloor2d(top, W, H, st);
    if (!wantPixel) {
      yield;
      return undefined;
    }

    const p = new Pix(W, H),
      m = new Uint8Array(W * H);
    for (let x = 0; x < W; x++) for (let y = top[x]; y < H; y++) m[y * W + x] = 1;
    yield* paintRock(p, m, st, 77, 22);
    yield;
    const sp = [C("#62e8ff"), C("#f48af0"), C("#9c8cff")];
    for (let x = 2; x < W - 2; x++) if (hash2(x, 9, 4) < 0.035) p.set(x, top[x] + 1 + ((hash2(x, 2, 4) * 3) | 0), sp[(hash2(x, 5, 4) * 3) | 0]);
    for (const s of this.floorShades) {
      for (let dx = -s.f - 2; dx <= s.f + 2; dx++) {
        const xi = s.x + dx;
        if (xi < 0 || xi >= W) continue;
        for (let dy = 0; dy < 3; dy++) {
          const yi = s.y + dy;
          if (yi >= top[xi] && yi < H && (dy < 2 || bayer(xi, yi) < 0.55)) p.d[yi * W + xi] = dy === 0 ? st.crust[0] : st.ramp[2];
        }
      }
    }
    return p.toCanvas();
  }

  // ==========================================================================
  // BLIT HELPERS (snap to device pixel grid in pixel mode, smooth in 2D mode)
  // ==========================================================================
  private sn(v: number) {
    return this.pixelMode ? Math.round(v * this.pxs) / this.pxs : v;
  }

  private blit(ctx: Ctx, cv: HTMLCanvasElement, sx: number, sy: number, sw: number, sh: number, dx: number, dy: number) {
    if (this.pixelMode) {
      const s = this.pxs;
      const x0 = Math.round(dx * s) / s,
        y0 = Math.round(dy * s) / s,
        x1 = Math.round((dx + sw) * s) / s,
        y1 = Math.round((dy + sh) * s) / s;
      ctx.drawImage(cv, sx, sy, sw, sh, x0, y0, x1 - x0, y1 - y0);
    } else {
      ctx.drawImage(cv, sx, sy, sw, sh, dx, dy, sw, sh);
    }
  }

  private frame(f: HTMLCanvasElement[], phase: number): HTMLCanvasElement | undefined {
    const len = f.length;
    if (len === 0) return undefined;
    const raw = Number.isFinite(phase) ? Math.floor(phase) : 0;
    return f[((raw % len) + len) % len];
  }

  private spr(ctx: Ctx, cv: HTMLCanvasElement | undefined, x: number, y: number, flip = false, drawW?: number, drawH?: number) {
    if (!cv) return;
    const tw = drawW ?? cv.width;
    const th = drawH ?? cv.height;
    if (this.pixelMode) {
      const s = this.pxs;
      const x0 = Math.round(x * s) / s,
        y0 = Math.round(y * s) / s,
        w = Math.round(tw * s) / s,
        h = Math.round(th * s) / s;
      if (flip) {
        ctx.save();
        ctx.translate(x0 + w, y0);
        ctx.scale(-1, 1);
        ctx.drawImage(cv, 0, 0, w, h);
        ctx.restore();
      } else ctx.drawImage(cv, x0, y0, w, h);
    } else {
      if (flip) {
        ctx.save();
        ctx.translate(x + tw, y);
        ctx.scale(-1, 1);
        ctx.drawImage(cv, 0, 0, tw, th);
        ctx.restore();
      } else ctx.drawImage(cv, x, y, tw, th);
    }
  }

  private tile(ctx: Ctx, cv: HTMLCanvasElement, scroll: number, dy: number, vw: number, vh: number): number {
    const W = cv.width,
      H = cv.height;
    dy = this.sn(dy);
    const off = (((this.sn(scroll) % W) + W) % W);
    if (dy > vh || dy + H < 0) return off;
    const sy0 = Math.max(0, -dy),
      sh = Math.min(H - sy0, vh + 1 - Math.max(0, dy));
    if (sh <= 0) return off;
    for (let dx = -off; dx < vw; dx += W) {
      const sx0 = Math.max(0, -dx),
        sw = Math.min(W - sx0, vw + 1 - (dx + sx0));
      if (sw > 0) this.blit(ctx, cv, sx0, sy0, sw, sh, dx + sx0, dy + sy0);
    }
    return off;
  }

  private drawInst(ctx: Ctx, b: Inst, sx: number, sy: number, t: number) {
    const s = b.s;
    const use3d = !this.pixelMode && this.reef3D && !!s.f3d?.length;
    const use2d = !this.pixelMode && !use3d && !!s.f2d?.length;
    let cv: HTMLCanvasElement | undefined;
    if (s.shy) {
      const near = Math.abs(b.x - this.focusX) < 44 && Math.abs(b.y - 12 - this.focusY) < 46;
      b.hide = clamp01(b.hide + (near ? 7 : -1.5) * this.dt);
    }
    if (use3d) {
      if (s.shy3d && b.hide > 0.25) cv = b.hide > 0.7 ? s.shy3d[1] : s.shy3d[0];
      else cv = this.frame(s.f3d!, t * s.fps + b.ph);
    } else if (use2d) {
      if (s.shy2d && b.hide > 0.25) cv = b.hide > 0.7 ? s.shy2d[1] : s.shy2d[0];
      else cv = this.frame(s.f2d!, t * s.fps + b.ph);
    } else {
      if (s.shy && b.hide > 0.25) cv = b.hide > 0.7 ? s.shy[1] : s.shy[0];
      else cv = this.frame(s.f, t * s.fps + b.ph);
    }
    if (!cv) return;

    const smooth = use3d || use2d;
    if (smooth && s.anim === "sway" && s.mode !== 2) {
      const skew = Math.sin(t * 1.85 + b.ph) * 0.06 * (b.flip ? -1 : 1);
      ctx.save();
      ctx.translate(sx, sy);
      ctx.transform(1, 0, s.mode === 0 ? -skew : skew, 1, 0, 0);
      if (s.mode === 0) this.spr(ctx, cv, -(s.w >> 1), -s.h + 2, b.flip, s.w, s.h);
      else this.spr(ctx, cv, -(s.w >> 1), -2, b.flip, s.w, s.h);
      ctx.restore();
      return;
    }
    if (smooth && s.anim === "pulse" && s.mode === 0) {
      const sc = 1 + Math.sin(t * 2.5 + b.ph) * 0.032;
      ctx.save();
      ctx.translate(sx, sy);
      ctx.scale(2 - sc, sc);
      this.spr(ctx, cv, -(s.w >> 1), -s.h + 2, b.flip, s.w, s.h);
      ctx.restore();
      return;
    }

    if (s.mode === 0) this.spr(ctx, cv, sx - (s.w >> 1), sy - s.h + 2, b.flip, s.w, s.h);
    else if (s.mode === 1) this.spr(ctx, cv, sx - (s.w >> 1), sy - 2, b.flip, s.w, s.h);
    else this.spr(ctx, cv, b.flip ? sx - s.w + 1 : sx, sy - (s.h >> 1), b.flip, s.w, s.h);
  }

  private glowInst(ctx: Ctx, b: Inst, sx: number, sy: number, t: number) {
    const s = b.s;
    if (!s.glow) return;
    const rad = Math.max(s.w, s.h) * 0.9;
    ctx.globalAlpha = (0.55 + 0.45 * Math.sin(t * 2.2 + b.ph * 1.7)) * (b.hide > 0.5 ? 0.3 : 1);
    const gy = s.mode === 1 ? sy + s.h * (s.gy ?? 0.5) : s.mode === 2 ? sy : sy - s.h * (s.gy ?? 0.5);
    ctx.drawImage(glowOrb(s.glow, false), sx - rad, gy - rad, rad * 2, rad * 2);
  }

  // ==========================================================================
  // RUNTIME RENDERING
  // ==========================================================================
  drawWater(ctx: Ctx, camLeft: number, camTop: number, vw: number, vh: number) {
    this.dt = Math.min(0.05, Math.max(0, this.time - this.lastT));
    this.lastT = this.time;
    const sm = ctx.imageSmoothingEnabled;
    if (!this.pixelMode && this.water2d) {
      ctx.imageSmoothingEnabled = true;
      const T = this.water2d;
      const sh = Math.min(T.height, vh + 1);
      const sy = Math.max(0, Math.min(T.height - sh, camTop + WPAD));
      if (sh < vh + 1) {
        ctx.fillStyle = "#040414";
        ctx.fillRect(0, 0, vw + 1, vh + 1);
      }
      ctx.drawImage(T, 4, sy, 8, sh, 0, 0, vw + 1, sh);

      // 3D Volumetric Water-Column Directional Scatter (changes dynamically with horizontal sun parallax & depth zone!)
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const sunX = vw * 0.5 + (SUN_X - (camLeft + vw * 0.5)) * 0.16;
      const shallowK = clamp01(1 - (camTop - 80) / 880);
      if (shallowK > 0.02) {
        ctx.globalAlpha = 0.24 * shallowK;
        ctx.drawImage(glowOrb("rgba(115, 244, 255, 0.52)", false), sunX - vw * 0.55, -camTop * 0.38 - vh * 0.2, vw * 1.1, vh * 1.25);
      }
      const twilightK = clamp01(1 - Math.abs(camTop + vh * 0.5 - 1140) / 560);
      if (twilightK > 0.02) {
        ctx.globalAlpha = 0.22 * twilightK;
        ctx.drawImage(glowOrb("rgba(65, 138, 255, 0.48)", false), vw * 0.12, -vh * 0.05, vw * 0.76, vh * 0.85);
      }
      const abyssK = clamp01((camTop + vh - (FLOOR_TOP - 140)) / 420);
      if (abyssK > 0.02) {
        ctx.globalAlpha = 0.28 * abyssK;
        ctx.drawImage(this.abyssWarm, 0, 0, vw + 1, vh + 1);
      }
      ctx.restore();

      ctx.imageSmoothingEnabled = sm;
      return;
    }
    if (!this.water) return;
    ctx.imageSmoothingEnabled = false;
    const T = this.water,
      TW = T.width;
    const sy = Math.max(0, Math.min(T.height - vh - 1, this.sn(camTop) + WPAD));
    const off = (((this.sn(camLeft) % TW) + TW) % TW);
    for (let dx = -off; dx < vw; dx += TW) this.blit(ctx, T, 0, sy, TW, vh + 1, dx, 0);
    ctx.imageSmoothingEnabled = sm;
  }

  /** a cleared off-screen buffer covering the view at half world resolution (4x less fill-rate for soft rays) */
  private lightBuf(i: number, vw: number, vh: number): Ctx {
    const w = Math.max(2, Math.ceil(vw * 0.5) + 1),
      h = Math.max(2, Math.ceil(vh * 0.5) + 1);
    let cv = this.lb[i];
    if (!cv) {
      cv = this.lb[i] = document.createElement("canvas");
      this.lbc[i] = cv.getContext("2d")!;
    }
    const c = this.lbc[i];
    if (cv.width !== w || cv.height !== h) {
      cv.width = w; // (resizing also clears)
      cv.height = h;
    } else {
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, w, h);
    }
    c.setTransform(0.5, 0, 0, 0.5, 0, 0);
    c.globalCompositeOperation = "lighter";
    c.imageSmoothingEnabled = true;
    return c;
  }

  /**
   * SUNLIGHT & TWILIGHT SHAFTS: 3-plane 3D volumetric god rays + dual depth caustic lattices + sunlit dust motes
   *   set 0 (behind distant ridges): sun bloom, Snell's Window glow, wide far shafts, and layered caustic nets
   *   set 2 (mid-canyon between Layer 1 & Layer 2): medium shafts
   *   set 1 (in front of reef and fish): crisp foreground shafts + sparkling sunlit water motes
   */
  drawLight(ctx: Ctx, set: number, camLeft: number, camTop: number, vw: number, vh: number, t: number) {
    const fade = clamp01(1 - (camTop - 180) / 1280); // extends gracefully through Zona Cahaya & Zona Senja
    if (fade <= 0.01) return;
    const twilightShift = clamp01((camTop - 420) / 680);
    const top = -camTop;
    const sunX = vw * 0.5 + (SUN_X - (camLeft + vw * 0.5)) * 0.14;

    if (set === 2) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.imageSmoothingEnabled = true;
      for (const r of this.rays) {
        if (r.layer !== 1) continue;
        const sx = ((((r.x - camLeft * RAY_PAR[1] + Math.sin(t * 0.19 + r.ph) * 8) % RAY_PERIOD) + RAY_PERIOD) % RAY_PERIOD) - 300;
        const ang = Math.max(-0.52, Math.min(0.52, (sx - sunX) / 920)) + Math.sin(t * 0.24 + r.ph) * 0.036;
        const xm = sx + Math.tan(ang) * Math.max(0, vh * 0.5 - top);
        if ((sx < -r.w && xm < -r.w) || (sx > vw + r.w && xm > vw + r.w)) continue;
        const pulse = (0.7 + 0.3 * Math.sin(t * 0.68 + r.ph * 2.3)) * (0.86 + 0.14 * Math.sin(t * 1.65 + r.ph));
        const a = r.a * fade * pulse;
        if (a < 0.015) continue;
        const cs = Math.cos(ang);
        const y0 = Math.max(0, (3 - top) / cs - r.w),
          y1 = Math.min(r.len, (vh + 3 - top) / cs + r.w);
        if (y1 - y0 < 2) continue;
        const beamIdx = twilightShift > 0.55 ? 2 : r.v % this.beams.length;
        const beam = this.beams[beamIdx];
        ctx.save();
        ctx.globalAlpha = a;
        ctx.translate(sx, top - 3);
        ctx.rotate(-ang);
        ctx.drawImage(beam, 0, (y0 / r.len) * beam.height, beam.width, ((y1 - y0) / r.len) * beam.height, -r.w * 0.5, y0, r.w, y1 - y0);
        ctx.restore();
      }
      ctx.restore();
      return;
    }

    const c = this.lightBuf(set, vw, vh);
    let drawn = false;
    if (set === 0 && top > -280) {
      c.globalAlpha = fade * (0.88 + 0.12 * Math.sin(t * 0.8));
      c.drawImage(this.bloom, Math.round(sunX - this.bloom.width * 0.5), Math.round(top - 125));
      drawn = true;
    }
    const targetLayer = set === 0 ? 0 : 2;
    for (const r of this.rays) {
      if (r.layer !== targetLayer) continue;
      const sx = ((((r.x - camLeft * RAY_PAR[r.layer] + Math.sin(t * 0.18 + r.ph) * 7) % RAY_PERIOD) + RAY_PERIOD) % RAY_PERIOD) - 300;
      const ang = Math.max(-0.52, Math.min(0.52, (sx - sunX) / 920)) + Math.sin(t * 0.24 + r.ph) * 0.036;
      const xm = sx + Math.tan(ang) * Math.max(0, vh * 0.5 - top);
      if ((sx < -r.w && xm < -r.w) || (sx > vw + r.w && xm > vw + r.w)) continue;
      const a = r.a * fade * (0.7 + 0.3 * Math.sin(t * 0.68 + r.ph * 2.3)) * (0.84 + 0.16 * Math.sin(t * 1.7 + r.ph));
      if (a < 0.015) continue;
      c.globalAlpha = a;
      const cs = Math.cos(ang),
        sn = Math.sin(ang);
      const y0 = Math.max(0, (3 - top) / cs - r.w),
        y1 = Math.min(r.len, (vh + 3 - top) / cs + r.w);
      if (y1 - y0 < 2) continue;
      const beamIdx = twilightShift > 0.52 ? 2 : r.v % this.beams.length;
      const beam = this.beams[beamIdx];
      c.setTransform(cs * 0.5, -sn * 0.5, sn * 0.5, cs * 0.5, sx * 0.5, (top - 3) * 0.5);
      c.drawImage(beam, 0, (y0 / r.len) * beam.height, beam.width, ((y1 - y0) / r.len) * beam.height, -r.w * 0.5, y0, r.w, y1 - y0);
      drawn = true;
    }
    c.setTransform(0.5, 0, 0, 0.5, 0, 0);
    if (set === 0 && camTop < 360) {
      // Multi-layered surface & upper-water caustic nets drifting smoothly against each other
      const W = 384;
      const cFade = fade * clamp01(1 - camTop / 360);
      for (let k = 0; k < 2; k++) {
        const scroll = camLeft * (k ? 0.92 : 0.78) + t * (k ? -11 : 15);
        const off = Math.round(((scroll % W) + W) % W);
        const y = Math.round(top + 3 + k * 28 + Math.sin(t * 0.95 + k * 2) * 3);
        c.globalAlpha = (k ? 0.38 : 0.48) * cFade * (0.8 + 0.2 * Math.sin(t * 1.3 + k * 1.7));
        for (let dx = -off; dx < vw; dx += W) c.drawImage(this.caust[k], dx, y);
      }
      drawn = true;
    }
    // Sparkling volumetric dust motes caught inside foreground light shafts
    if (set === 1 && !this.pixelMode && fade > 0.25) {
      const moteOrb = glowOrb("rgba(225, 252, 255, 0.78)", true);
      for (let i = 0; i < 14; i++) {
        const mx = ((((i * 157 - camLeft * 0.85 + Math.sin(t * 0.7 + i * 2.1) * 18) % (vw + 60)) + vw + 60) % (vw + 60)) - 30;
        const my = ((((i * 93 - camTop * 0.9 + t * (4 + (i % 3) * 2)) % (vh + 40)) + vh + 40) % (vh + 40)) - 20;
        const tw = Math.max(0, Math.sin(t * 2.4 + i * 1.9));
        if (tw < 0.2) continue;
        const mr = 1.4 + (i % 3) * 0.75;
        c.globalAlpha = tw * 0.42 * fade;
        c.drawImage(moteOrb, mx - mr, my - mr, mr * 2, mr * 2);
        drawn = true;
      }
    }
    if (!drawn) return;
    const sm = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.lb[set], 0, 0, this.lb[set].width * 2, this.lb[set].height * 2);
    ctx.imageSmoothingEnabled = sm;
  }

  drawSurface(ctx: Ctx, camLeft: number, camTop: number, vw: number, t: number) {
    if (camTop > 28) return;
    const sm = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = !this.pixelMode;
    const y = -camTop - 5;
    // Soft shimmering under-surface Snell's window & sun sparkles
    if (!this.pixelMode) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const sunX = vw * 0.5 + (SUN_X - (camLeft + vw * 0.5)) * 0.14;
      const sg = ctx.createLinearGradient(0, Math.max(-12, y + 2), 0, y + 48);
      sg.addColorStop(0, "rgba(225, 254, 255, 0.52)");
      sg.addColorStop(0.42, "rgba(145, 240, 255, 0.2)");
      sg.addColorStop(1, "rgba(120, 230, 255, 0)");
      ctx.fillStyle = sg;
      ctx.fillRect(0, y + 2, vw + 1, 46);
      // Focused Snell's Window solar halo right below surface ripples
      ctx.globalAlpha = 0.55;
      ctx.drawImage(glowOrb("rgba(255, 252, 224, 0.78)", false), sunX - 180, y - 8, 360, 44);
      const glintOrb = glowOrb("rgba(255, 252, 210, 0.78)", false);
      for (let i = 0; i < 10; i++) {
        const gx = ((((i * 97 - camLeft * 0.92 + t * (14 + (i % 3) * 5)) % (vw + 80)) + vw + 80) % (vw + 80)) - 40;
        const pulse = Math.max(0, Math.sin(t * 2.8 + i * 2.1));
        if (pulse > 0.1) {
          ctx.globalAlpha = pulse * 0.62;
          ctx.drawImage(glintOrb, gx - 20, y - 2, 40, 13);
        }
      }
      ctx.restore();
    }
    const list = !this.pixelMode && this.waves2d.length === 2 ? this.waves2d : this.waves;
    for (let k = 1; k >= 0; k--) {
      const cv = list[k],
        W = 256,
        H = 16;
      const off = (((this.sn(camLeft + t * (k ? -11 : 16)) % W) + W) % W);
      ctx.globalAlpha = k ? 0.55 : 1;
      for (let dx = -off; dx < vw; dx += W) this.spr(ctx, cv, dx, y + k * 2, false, W, H);
    }
    ctx.globalAlpha = 1;
    ctx.imageSmoothingEnabled = sm;
  }

  /** 4-Stage Dynamic Depth Atmosphere: sunlit zenith sheen -> twilight cobalt scatter -> midnight depth chiaroscuro -> abyssal thermal bounce */
  drawVignette(ctx: Ctx, camTop: number, vw: number, vh: number) {
    const sm = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = !this.pixelMode;
    const midY = camTop + vh * 0.5;

    // 1. Zona Cahaya zenith luminosity near surface
    if (!this.pixelMode && camTop < 460) {
      const shallowK = clamp01(1 - camTop / 460);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.28 * shallowK;
      ctx.drawImage(this.shallowBloom, 0, 0, vw + 1, vh + 1);
      ctx.restore();
    }

    // 2. Progressive depth framing vignette (light aqua rim in twilight -> deep chiaroscuro in abyss)
    const vigA = 0.12 + clamp01((midY - 220) / 2050) * 0.72;
    ctx.globalAlpha = vigA;
    ctx.drawImage(this.vig, 0, 0, vw + 1, vh + 1);

    // 3. Palung Abisal warm hydrothermal bounce light rising softly from the floor
    if (!this.pixelMode && camTop + vh > FLOOR_TOP - 100) {
      const botK = clamp01((camTop + vh - (FLOOR_TOP - 100)) / 320);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.34 * botK;
      ctx.drawImage(this.abyssWarm, 0, 0, vw + 1, vh + 1);
      ctx.restore();
    }

    ctx.globalAlpha = 1;
    ctx.imageSmoothingEnabled = sm;
  }

  /** cached text sprites must be rebuilt once the pixel font has loaded */
  clearText() {
    this.hudTxt.clear();
  }

  private ensurePelagicScratch(): {
    buf: HTMLCanvasElement;
    bc: Ctx;
    blurA: HTMLCanvasElement;
    ac: Ctx;
    blurB: HTMLCanvasElement;
    b2c: Ctx;
  } {
    const W = 520;
    const H = 260;
    const BW = 300;
    const BH = 150;
    if (!this.pelagicBuf) {
      this.pelagicBuf = document.createElement("canvas");
      this.pelagicBuf.width = W;
      this.pelagicBuf.height = H;
    }
    if (!this.pelagicBlurA) {
      this.pelagicBlurA = document.createElement("canvas");
      this.pelagicBlurA.width = BW;
      this.pelagicBlurA.height = BH;
    }
    if (!this.pelagicBlurB) {
      this.pelagicBlurB = document.createElement("canvas");
      this.pelagicBlurB.width = BW;
      this.pelagicBlurB.height = BH;
    }
    return {
      buf: this.pelagicBuf,
      bc: this.pelagicBuf.getContext("2d")!,
      blurA: this.pelagicBlurA,
      ac: this.pelagicBlurA.getContext("2d")!,
      blurB: this.pelagicBlurB,
      b2c: this.pelagicBlurB.getContext("2d")!,
    };
  }

  /**
   * High-resolution multi-pass additive Kawase/Gaussian blur (zero downscale pixelation).
   * Uses 4 energy-conserving 0.25-alpha taps per pass across 300x150 ping-pong buffers.
   */
  private blurPelagic(passes: number): HTMLCanvasElement {
    const { buf, blurA, ac, blurB, b2c } = this.ensurePelagicScratch();
    const W = blurA.width;
    const H = blurA.height;
    const taps: [number, number][][] = [
      [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]],
      [[-2.2, 0], [2.2, 0], [0, -2.2], [0, 2.2]],
    ];
    const count = Math.min(2, passes);
    let src: HTMLCanvasElement = buf;
    for (let p = 0; p < count; p++) {
      const dst = p % 2 === 0 ? blurA : blurB;
      const dc = p % 2 === 0 ? ac : b2c;
      dc.globalCompositeOperation = "source-over";
      dc.globalAlpha = 1;
      dc.clearRect(0, 0, W, H);
      dc.imageSmoothingEnabled = true;
      dc.imageSmoothingQuality = "medium";
      dc.globalCompositeOperation = "lighter";
      dc.globalAlpha = 0.25;
      for (const [ox, oy] of taps[p % taps.length]) {
        dc.drawImage(src, ox, oy, W, H);
      }
      dc.globalCompositeOperation = "source-over";
      dc.globalAlpha = 1;
      src = dst;
    }
    return src;
  }

  private drawDistantPelagics(ctx: Ctx, camLeft: number, camTop: number, vw: number, vh: number, deepPass: boolean) {
    const t = this.time;
    const baseAlpha = ctx.globalAlpha;
    for (const m of this.pelagics) {
      const isDeepEntity = m.y >= 720;
      if (isDeepEntity !== deepPass) continue;
      const period = m.period ?? 2600;
      const par = m.par ?? 0.16;
      const yPar = m.yPar ?? (deepPass ? 0.85 : par);
      const sx = ((((m.x + m.dir * m.speed * t - camLeft * par) % period) + period) % period) - 420;
      const bobAmp = m.kind === "submarine" ? 3.5 : m.kind === "bluewhale" ? 6 : 9;
      const bobFreq = m.kind === "bluewhale" || m.kind === "submarine" ? 0.45 : 0.7;
      const sy = m.y - camTop * yPar + Math.sin(t * bobFreq + m.ph) * bobAmp;
      if (sx < -440 || sx > vw + 440 || sy < -200 || sy > vh + 200) continue;

      if (m.kind === "bluewhale") {
        // Composite whale 100% opaque onto scratch buffer, then apply silky high-res Kawase Gaussian blur
        const { buf, bc } = this.ensurePelagicScratch();
        const BW = buf.width;
        const BH = buf.height;
        bc.setTransform(1, 0, 0, 1, 0, 0);
        bc.clearRect(0, 0, BW, BH);
        bc.save();
        bc.translate(BW * 0.5, BH * 0.48);

        const pitch = Math.cos(t * bobFreq + m.ph) * 0.035;
        bc.rotate(pitch);

        const wavePhase = t * 1.9 + m.ph;
        const segs = 22;
        const len = 264;
        const halfL = len * 0.5;
        const spine: { x: number; y: number; topR: number; botR: number }[] = [];

        for (let i = 0; i <= segs; i++) {
          const s = i / segs;
          const px = halfL - s * len;
          const flex = s <= 0.22 ? 0 : Math.pow((s - 0.22) / 0.78, 1.5);
          const py = Math.sin(wavePhase - s * 3.7) * 14 * flex;

          let topR = 0;
          let botR = 0;
          if (s < 0.26) {
            const p = s / 0.26;
            topR = 23 * Math.pow(p, 0.56);
            botR = 30 * Math.pow(p, 0.62);
          } else if (s < 0.58) {
            const p = (s - 0.26) / 0.32;
            topR = 23 + Math.sin(p * Math.PI) * 4.5;
            botR = 30 + Math.sin(p * Math.PI * 0.85) * 4.5 - p * 6;
          } else {
            const p = (s - 0.58) / 0.42;
            topR = 23 * (1 - Math.pow(p, 0.82) * 0.88);
            botR = 24 * (1 - Math.pow(p, 0.78) * 0.89);
          }
          spine.push({ x: px, y: py, topR, botR });
        }

        // 1. Far-side pectoral flipper (opaque)
        const farFinAnchor = spine[6];
        const finWave = Math.sin(wavePhase - 1.05) * 0.13;
        bc.save();
        bc.translate(farFinAnchor.x + 4, farFinAnchor.y + farFinAnchor.botR * 0.46);
        bc.rotate(-0.18 + finWave * 0.65);
        bc.fillStyle = deepPass ? "#12326b" : "#11477d";
        bc.beginPath();
        bc.moveTo(0, 0);
        bc.bezierCurveTo(-14, 18, -36, 36, -60, 34);
        bc.bezierCurveTo(-40, 21, -22, 9, -10, -2);
        bc.closePath();
        bc.fill();
        bc.restore();

        // 2. Main smooth-spline whale silhouette (quadratic midpoint curves = zero polygon edges!)
        bc.beginPath();
        bc.moveTo(spine[0].x, spine[0].y);
        const topPts = spine.map((pt, i) => {
          const dorsalFin = i === 14 ? 9 : i === 13 || i === 15 ? 3.5 : 0;
          return { x: pt.x, y: pt.y - pt.topR - dorsalFin };
        });
        for (let i = 1; i < topPts.length - 1; i++) {
          const mx = (topPts[i].x + topPts[i + 1].x) * 0.5;
          const my = (topPts[i].y + topPts[i + 1].y) * 0.5;
          bc.quadraticCurveTo(topPts[i].x, topPts[i].y, mx, my);
        }
        const lastTop = topPts[topPts.length - 1];
        bc.lineTo(lastTop.x, lastTop.y);

        // Crescent tail fluke synced with traveling spine wave
        const tail = spine[spine.length - 1];
        const prevTail = spine[spine.length - 2];
        const tailAng = Math.atan2(prevTail.y - tail.y, prevTail.x - tail.x);
        const flukeFlex = Math.sin(wavePhase - 3.9) * 0.26;
        const cosA = Math.cos(tailAng + flukeFlex);
        const sinA = Math.sin(tailAng + flukeFlex);
        const toBody = (lx: number, ly: number) => ({
          x: tail.x + lx * cosA - ly * sinA,
          y: tail.y + lx * sinA + ly * cosA,
        });

        const topTip = toBody(-38, -36);
        const topCtrl = toBody(-10, -24);
        const notch = toBody(-21, 0);
        const botTip = toBody(-38, 34);
        const botCtrl = toBody(-10, 22);

        bc.quadraticCurveTo(topCtrl.x, topCtrl.y, topTip.x, topTip.y);
        bc.quadraticCurveTo(notch.x + 4, (topTip.y + notch.y) * 0.5, notch.x, notch.y);
        bc.quadraticCurveTo(notch.x + 4, (botTip.y + notch.y) * 0.5, botTip.x, botTip.y);
        bc.quadraticCurveTo(botCtrl.x, botCtrl.y, tail.x, tail.y + tail.botR);

        // Smooth spline ventral belly back to nose
        const botPts = [...spine].reverse().map((pt) => ({ x: pt.x, y: pt.y + pt.botR }));
        for (let i = 1; i < botPts.length - 1; i++) {
          const mx = (botPts[i].x + botPts[i + 1].x) * 0.5;
          const my = (botPts[i].y + botPts[i + 1].y) * 0.5;
          bc.quadraticCurveTo(botPts[i].x, botPts[i].y, mx, my);
        }
        bc.closePath();

        // Solid opaque oceanic shading inside scratch buffer (no X-ray alpha!)
        const whaleGrad = bc.createLinearGradient(0, -32, 0, 34);
        if (deepPass) {
          whaleGrad.addColorStop(0, "#3a7cc2");
          whaleGrad.addColorStop(0.36, "#1f539b");
          whaleGrad.addColorStop(0.76, "#163b7a");
          whaleGrad.addColorStop(1, "#4e8ed0");
        } else {
          whaleGrad.addColorStop(0, "#4ea8db");
          whaleGrad.addColorStop(0.34, "#1c67a8");
          whaleGrad.addColorStop(0.74, "#154e8a");
          whaleGrad.addColorStop(1, "#7cc8eb");
        }
        bc.fillStyle = whaleGrad;
        bc.fill();

        // Sunlit dorsal edge & throat grooves clipped cleanly inside opaque body
        bc.save();
        bc.clip();
        bc.beginPath();
        bc.moveTo(topPts[0].x, topPts[0].y);
        for (let i = 1; i < topPts.length - 1; i++) {
          const mx = (topPts[i].x + topPts[i + 1].x) * 0.5;
          const my = (topPts[i].y + topPts[i + 1].y) * 0.5;
          bc.quadraticCurveTo(topPts[i].x, topPts[i].y, mx, my);
        }
        bc.strokeStyle = deepPass ? "#72b4eb" : "#9fe3fb";
        bc.lineWidth = 3;
        bc.stroke();

        // Ventral throat pleats
        bc.strokeStyle = deepPass ? "#2960a8" : "#3a89be";
        bc.lineWidth = 1.2;
        for (let g = 0; g < 4; g++) {
          bc.beginPath();
          const offR = 0.5 + g * 0.11;
          for (let i = 1; i <= 8; i++) {
            const pt = spine[i];
            if (i === 1) bc.moveTo(pt.x, pt.y + pt.botR * offR);
            else bc.lineTo(pt.x, pt.y + pt.botR * offR);
          }
          bc.stroke();
        }
        bc.restore();

        // 3. Foreground pectoral flipper — 100% opaque so body NEVER bleeds through transparently!
        const fgFinAnchor = spine[6];
        bc.save();
        bc.translate(fgFinAnchor.x + 2, fgFinAnchor.y + fgFinAnchor.botR * 0.52);
        bc.rotate(0.06 + finWave);
        const finGrad = bc.createLinearGradient(0, 0, -64, 48);
        finGrad.addColorStop(0, deepPass ? "#194b8c" : "#15548f");
        finGrad.addColorStop(0.6, deepPass ? "#3272b8" : "#388bc4");
        finGrad.addColorStop(1, deepPass ? "#6aaae0" : "#8fd4f2");
        bc.fillStyle = finGrad;
        bc.beginPath();
        bc.moveTo(4, 0);
        bc.bezierCurveTo(-13, 27, -42, 52, -74, 49);
        bc.bezierCurveTo(-53, 33, -28, 15, -11, -3);
        bc.closePath();
        bc.fill();
        bc.restore();

        // Eye glint
        const eyePt = spine[4];
        bc.fillStyle = "#bceeff";
        bc.beginPath();
        bc.arc(eyePt.x - 2, eyePt.y + 3, 2, 0, TAU);
        bc.fill();

        // Gentle blowhole bubble plume drifting upward on sunlit whales
        if (!deepPass) {
          const cycle = (t * 0.14 + m.ph) % 1;
          if (cycle < 0.65) {
            const p = cycle / 0.65;
            const bx0 = eyePt.x + 8;
            const by0 = eyePt.y - spine[4].topR - 4;
            for (let b = 0; b < 5; b++) {
              const bp = p - b * 0.08;
              if (bp <= 0) continue;
              bc.globalAlpha = Math.sin(Math.min(1, bp) * Math.PI) * 0.72;
              bc.fillStyle = "#dcf8ff";
              bc.beginPath();
              bc.arc(bx0 - bp * 24 + Math.sin(t * 3 + b) * 3, by0 - bp * 44, 1.8 + bp * 2.2, 0, TAU);
              bc.fill();
            }
            bc.globalAlpha = 1;
          }
        }
        bc.restore();

        // Silky high-res 4-pass Kawase Gaussian blur (zero blocky pixels)
        const blurredWhale = this.blurPelagic(4);

        ctx.save();
        ctx.translate(sx, sy);
        ctx.scale(m.dir * m.scale, m.scale);
        ctx.globalAlpha = baseAlpha * (deepPass ? 0.34 : 0.32);
        const prevSm = ctx.imageSmoothingEnabled;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "medium";
        ctx.drawImage(blurredWhale, -BW * 0.5, -BH * 0.48, BW, BH);
        ctx.imageSmoothingEnabled = prevSm;
        ctx.restore();
      } else if (m.kind === "submarine") {
        // Composite submarine opaque onto scratch buffer, then apply silky 3-pass distant blur
        const { buf, bc } = this.ensurePelagicScratch();
        const BW = buf.width;
        const BH = buf.height;
        bc.setTransform(1, 0, 0, 1, 0, 0);
        bc.clearRect(0, 0, BW, BH);
        bc.save();
        bc.translate(BW * 0.40, BH * 0.54);

        const pitch = Math.cos(t * bobFreq + m.ph) * 0.02;
        bc.rotate(pitch);

        // Soft searchlight cone gently sweeping the ocean mist
        const beamSweep = Math.sin(t * 0.85 + m.ph) * 0.14;
        bc.save();
        bc.translate(86, 1);
        bc.rotate(beamSweep);
        const lg = bc.createLinearGradient(0, 0, 149, 0);
        lg.addColorStop(0, deepPass ? "rgba(255, 238, 168, 0.72)" : "rgba(255, 246, 195, 0.52)");
        lg.addColorStop(0.5, deepPass ? "rgba(255, 230, 145, 0.24)" : "rgba(225, 250, 255, 0.18)");
        lg.addColorStop(1, "rgba(220, 248, 255, 0)");
        bc.fillStyle = lg;
        bc.beginPath();
        bc.moveTo(0, -5);
        bc.lineTo(149, -37);
        bc.lineTo(149, 35);
        bc.lineTo(0, 5);
        bc.closePath();
        bc.fill();
        bc.restore();

        // Solid opaque hull
        const bodyGrad = bc.createLinearGradient(0, -18, 0, 18);
        bodyGrad.addColorStop(0, "#d8a436");
        bodyGrad.addColorStop(0.36, "#b98422");
        bodyGrad.addColorStop(0.4, deepPass ? "#183769" : "#174880");
        bodyGrad.addColorStop(1, deepPass ? "#0b1c3d" : "#0e2d57");
        bc.fillStyle = bodyGrad;

        bc.beginPath();
        bc.moveTo(88, 0);
        bc.bezierCurveTo(88, -14, 58, -17, 26, -17);
        bc.lineTo(-42, -16);
        bc.quadraticCurveTo(-70, -14, -84, -4);
        bc.lineTo(-84, 4);
        bc.quadraticCurveTo(-70, 14, -42, 16);
        bc.lineTo(26, 17);
        bc.bezierCurveTo(58, 17, 88, 14, 88, 0);
        bc.closePath();
        bc.fill();

        // Conning tower (sail)
        bc.fillStyle = "#d49c2e";
        bc.beginPath();
        bc.moveTo(-6, -16);
        bc.lineTo(-2, -37);
        bc.quadraticCurveTo(0, -40, 4, -40);
        bc.lineTo(24, -40);
        bc.quadraticCurveTo(30, -40, 32, -33);
        bc.lineTo(35, -16);
        bc.closePath();
        bc.fill();

        const trimCol = deepPass ? "#14305c" : "#153d70";
        bc.fillStyle = trimCol;
        bc.fillRect(10, -30, 18, 3.2);

        // Periscope, radio mast & nav beacon
        bc.strokeStyle = "#8abbe6";
        bc.lineWidth = 2.2;
        bc.beginPath();
        bc.moveTo(16, -40);
        bc.lineTo(16, -54);
        bc.lineTo(22, -54);
        bc.moveTo(6, -40);
        bc.lineTo(6, -50);
        bc.stroke();

        bc.fillStyle = "#ffe680";
        bc.beginPath();
        bc.arc(6, -51, 2.2, 0, TAU);
        bc.fill();

        // Stern stabilizers
        bc.fillStyle = trimCol;
        bc.beginPath();
        bc.moveTo(-66, -9);
        bc.lineTo(-78, -21);
        bc.lineTo(-83, -21);
        bc.lineTo(-77, -6);
        bc.closePath();
        bc.fill();
        bc.beginPath();
        bc.moveTo(-66, 9);
        bc.lineTo(-78, 21);
        bc.lineTo(-83, 21);
        bc.lineTo(-77, 6);
        bc.closePath();
        bc.fill();

        // Spinning propeller
        const spin = Math.cos(t * 14 + m.ph);
        bc.fillStyle = "#b8cce0";
        bc.fillRect(-88, -2.5, 5, 5);
        bc.beginPath();
        bc.ellipse(-89, 0, 2.2, 3 + Math.abs(spin) * 10, 0, 0, TAU);
        bc.fill();

        // 4 glowing portholes
        for (const px of [-20, 2, 24, 46]) {
          bc.fillStyle = "#112447";
          bc.beginPath();
          bc.arc(px, 1, 3.8, 0, TAU);
          bc.fill();
          bc.fillStyle = "#fff199";
          bc.beginPath();
          bc.arc(px, 1, 2.5, 0, TAU);
          bc.fill();
        }

        // Wake bubbles
        bc.fillStyle = "#d4f6ff";
        for (let b = 0; b < 4; b++) {
          const prog = (t * 0.85 + b * 0.24 + m.ph) % 1;
          bc.globalAlpha = 0.75 * (1 - prog);
          bc.beginPath();
          bc.arc(-94 - prog * 54, Math.sin(t * 5 + b * 2) * 3 - prog * 8, 1.6 + prog * 1.6, 0, TAU);
          bc.fill();
        }
        bc.globalAlpha = 1;
        bc.restore();

        // Silky high-res 3-pass distant depth-of-field blur (zero pixelation)
        const blurredSub = this.blurPelagic(3);

        ctx.save();
        ctx.translate(sx, sy);
        ctx.scale(m.dir * m.scale, m.scale);
        ctx.globalAlpha = baseAlpha * (deepPass ? 0.56 : 0.48);
        const prevSm = ctx.imageSmoothingEnabled;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "medium";
        ctx.drawImage(blurredSub, -BW * 0.40, -BH * 0.54, BW, BH);
        ctx.imageSmoothingEnabled = prevSm;
        ctx.restore();
      } else {
        ctx.save();
        ctx.translate(sx, sy);
        ctx.scale(m.dir * m.scale, m.scale);
        ctx.globalAlpha = baseAlpha * 0.7;
        ctx.fillStyle = "rgba(16, 72, 128, 0.42)";
        const flap = Math.sin(t * 2.1 + m.ph) * 6;
        ctx.beginPath();
        if (m.kind === "manta") {
          ctx.moveTo(22, 0);
          ctx.quadraticCurveTo(6, -16 - flap, -10, -22 - flap * 1.2);
          ctx.quadraticCurveTo(-8, -6, -18, -2);
          ctx.lineTo(-42, -1);
          ctx.lineTo(-18, 2);
          ctx.quadraticCurveTo(-8, 6, -10, 18 + flap * 0.9);
          ctx.quadraticCurveTo(6, 12 + flap * 0.7, 22, 0);
        } else {
          ctx.ellipse(0, 0, 38, 10, 0, 0, Math.PI * 2);
          ctx.moveTo(-4, -8);
          ctx.lineTo(-14, -20);
          ctx.lineTo(-18, -8);
          ctx.moveTo(-34, 0);
          ctx.lineTo(-50, -14 + flap * 0.3);
          ctx.lineTo(-44, 0);
          ctx.lineTo(-48, 11 + flap * 0.3);
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }
    ctx.globalAlpha = baseAlpha;
  }

  private drawJellyfish(ctx: Ctx, camLeft: number, camTop: number, vw: number, vh: number) {
    const t = this.time;
    for (const j of this.jellies) {
      const period = 3400;
      const sx = ((((j.x - camLeft * j.p + Math.sin(t * 0.4 + j.ph) * 24) % period) + period) % period) - 100;
      const sy = j.y - camTop * (0.72 + j.p * 0.28) - Math.sin(t * 0.88 + j.ph) * 9;
      const s = j.s;
      if (sx < -60 || sx > vw + 60 || sy < -70 || sy > vh + 60) continue;
      if (s.glow) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = 0.5 + 0.3 * Math.sin(t * 1.76 + j.ph);
        const rad = s.h * 0.95;
        ctx.drawImage(glowOrb(s.glow, false), sx - rad, sy - s.h * 0.75 - rad, rad * 2, rad * 2);
        ctx.restore();
      }
      ctx.globalAlpha = 0.86;
      const frames = !this.pixelMode && this.reef3D && s.f3d?.length
        ? s.f3d
        : !this.pixelMode && s.f2d?.length
          ? s.f2d
          : s.f;
      this.spr(ctx, this.frame(frames, t * s.fps + j.ph * 3), sx - (s.w >> 1), sy - s.h, false, s.w, s.h);
      ctx.globalAlpha = 1;
    }
  }

  drawLayers(ctx: Ctx, camLeft: number, camTop: number, vw: number, vh: number) {
    const t = this.time;
    const sm = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = !this.pixelMode;
    const deepBlend = clamp01((camTop - 680) / 560);

    const far1 = !this.pixelMode && this.far1_2d ? this.far1_2d : this.far1;
    const far2 = !this.pixelMode && this.far2_2d ? this.far2_2d : this.far2;
    const far3 = !this.pixelMode && this.reef3D && this.far3_3d
      ? this.far3_3d
      : !this.pixelMode && this.far3_2d
        ? this.far3_2d
        : this.far3;
    const deep1 = !this.pixelMode && this.deep1_2d ? this.deep1_2d : this.deep1;
    const deep2 = !this.pixelMode && this.reef3D && this.deep2_3d
      ? this.deep2_3d
      : !this.pixelMode && this.deep2_2d
        ? this.deep2_2d
        : this.deep2;

    // ---------- sunlit & twilight planes (5-Layer Atmospheric Perspective!) ----------
    if (deepBlend < 1) {
      const fade = 1 - deepBlend * 0.85;
      ctx.save();

      // Layer 0 (Ultra-Far 0.09x Parallax): Highest, smallest, pale cyan silhouettes softly blurred
      if (far1) {
        ctx.globalAlpha = 0.56 * fade;
        const yFar1 = this.sn(18 - camTop * 0.09);
        this.tile(ctx, far1, camLeft * 0.09, yFar1, vw, vh);
      }

      ctx.globalAlpha = fade;
      this.drawDistantPelagics(ctx, camLeft, camTop, vw, vh, false);

      // Layer 1 (Far-Mid 0.20x Parallax): Soft teal canyon arches & simplified coral silhouettes
      if (far2) {
        ctx.globalAlpha = 0.78 * fade;
        const yFar2 = this.sn(64 - camTop * 0.2);
        this.tile(ctx, far2, camLeft * 0.2, yFar2, vw, vh);
      }

      ctx.globalAlpha = fade;
      this.drawSchools(ctx, camLeft, camTop, vw, vh, 0.32, false);
      this.drawLight(ctx, 2, camLeft, camTop, vw, vh, t);

      // Layer 2 (Midground 0.42x Parallax): Deeper oceanic blue cliffs & animated silhouetted sea fans
      if (far3) {
        ctx.globalAlpha = 0.94 * fade;
        const y3 = this.sn(126 - camTop * 0.42);
        const W3 = far3.width;
        const off = this.tile(ctx, far3, camLeft * 0.42, y3, vw, vh);
        if (y3 < vh && y3 + 320 > -130) {
          for (const b of this.farInsts) {
            let sx = (((b.x - off) % W3) + W3) % W3;
            if (sx > vw + 60) sx -= W3;
            if (sx < -60 || sx > vw + 60) continue;
            this.drawInst(ctx, b, sx, y3 + b.y, t);
          }
        }
      }
      ctx.globalAlpha = fade;
      this.drawSchools(ctx, camLeft, camTop, vw, vh, 0.58, false);
      ctx.restore();
    }

    // ---------- midnight & abyss planes: rooted pinnacle forests ----------
    if (camTop + vh > DEEP_START - 240) {
      const alpha = Math.max(0.18, Math.min(1, (camTop + vh - (DEEP_START - 140)) / 360));
      ctx.save();
      {
        // far-off clouds of bioluminescence, pulsing slowly behind everything
        const off = ((((camLeft * 0.16) % 1840) + 1840) % 1840);
        ctx.globalAlpha = alpha * (0.62 + 0.2 * Math.sin(t * 0.4));
        // only the visible part of each tile is blitted (source texels are 2 world units)
        const ny = 1260 - camTop,
          y0 = Math.max(0, -ny),
          y1 = Math.min(920, vh - ny);
        if (y1 - y0 > 2)
          for (let dx = -off; dx < vw; dx += 1840) {
            const x0 = Math.max(0, -dx),
              x1 = Math.min(1840, vw - dx);
            if (x1 - x0 > 2) ctx.drawImage(this.neb, x0 / 2, y0 / 2, (x1 - x0) / 2, (y1 - y0) / 2, dx + x0, ny + y0, x1 - x0, y1 - y0);
          }
      }
      if (deep1) {
        ctx.globalAlpha = alpha * 0.5;
        this.tile(ctx, deep1, camLeft * 0.24, D1_Y - camTop, vw, vh);
      }
      ctx.globalAlpha = alpha;
      this.drawDistantPelagics(ctx, camLeft, camTop, vw, vh, true);
      this.drawSchools(ctx, camLeft, camTop, vw, vh, 0.32, true);
      if (deep2) {
        ctx.globalAlpha = alpha * 0.86;
        const off = this.tile(ctx, deep2, camLeft * 0.48, D2_Y - camTop, vw, vh);
        ctx.globalCompositeOperation = "lighter";
        const W2 = deep2.width;
        for (const g of this.deepGlows) {
          let sx = (((g.x - off) % W2) + W2) % W2;
          if (sx > vw + 60) sx -= W2;
          const sy = D2_Y + g.y - camTop;
          if (sx < -60 || sx > vw + 60 || sy < -60 || sy > vh + 60) continue;
          ctx.globalAlpha = alpha * (0.4 + 0.35 * Math.sin(t * 1.6 + g.ph));
          ctx.drawImage(glowOrb(g.c, false), sx - 34, sy - 34, 68, 68);
        }
        ctx.globalCompositeOperation = "source-over";
      }
      ctx.globalAlpha = alpha;
      this.drawSchools(ctx, camLeft, camTop, vw, vh, 0.58, true);
      ctx.restore();
    }

    // luminous mist where one depth zone gives way to the next
    for (let i = 1; i < 4; i++) {
      const y = ZONES[i].y - camTop;
      if (y < -70 || y > vh + 70) continue;
      ctx.globalAlpha = 0.55 + 0.25 * Math.sin(t * 0.8 + i * 2);
      ctx.drawImage(this.mist[i - 1], 0, y - 55 + Math.sin(t * 0.5 + i) * 4, vw + 1, 110);
    }
    ctx.globalAlpha = 1;

    this.drawJellyfish(ctx, camLeft, camTop, vw, vh);
    ctx.imageSmoothingEnabled = sm;
  }

  drawSchools(ctx: Ctx, camLeft: number, camTop: number, vw: number, vh: number, layer: number, deep: boolean) {
    const t = this.time;
    ctx.fillStyle = deep ? "rgba(68, 212, 248, 0.36)" : layer < 0.45 ? "rgba(24, 96, 156, 0.44)" : "rgba(32, 118, 182, 0.5)";
    for (const s of this.schools) {
      if (s.p !== layer || s.deep !== deep) continue;
      const period = 3000;
      const bx = ((((s.x + s.dir * s.speed * t - camLeft * s.p) % period) + period) % period) - 300;
      const by = s.y - camTop * (deep ? 0.95 : s.p * 0.85) + Math.sin(t * 0.5 + s.seed) * 10;
      if (bx < -120 || bx > vw + 120 || by < -60 || by > vh + 60) continue;
      const big = s.p > 0.45 ? 1.3 : 1;
      ctx.beginPath();
      for (let i = 0; i < s.n; i++) {
        const ox = Math.sin(s.seed + i * 12.9) * 42 + Math.sin(t * 1.3 + i) * 3;
        const oy = Math.cos(s.seed + i * 7.3) * 16 + Math.sin(t * 2 + i * 0.7) * 2;
        const x = bx + ox,
          y = by + oy;
        ctx.moveTo(x + 2.8 * big, y);
        ctx.ellipse(x, y, 2.8 * big, 1.4 * big, 0, 0, Math.PI * 2);
        const tx = x - s.dir * 3.2 * big;
        ctx.moveTo(x - s.dir * 1.8 * big, y);
        ctx.lineTo(tx - s.dir * 1.8 * big, y - 1.8 * big);
        ctx.lineTo(tx - s.dir * 1.8 * big, y + 1.8 * big);
        ctx.closePath();
      }
      ctx.fill();
    }
  }

  private drawCrabs(ctx: Ctx, floorOnly: boolean, cl: number, ct: number, vw: number, vh: number, t: number) {
    const cr = this.bio.crab;
    for (const c of this.crabs) {
      if ((c.oy === FLOOR_TOP) !== floorOnly) continue;
      const a = t * c.sp + c.ph,
        lx = c.x0 + Math.sin(a) * c.range,
        ty = c.top[Math.round(lx)];
      if (ty === undefined || ty < 0) continue;
      const sx = c.ox + lx - cl,
        sy = c.oy + ty - ct;
      if (sx < -20 || sx > vw + 20 || sy < -20 || sy > vh + 20) continue;
      const s = cr[c.v],
        v = Math.cos(a);
      const frames = !this.pixelMode && this.reef3D && s.f3d?.length
        ? s.f3d
        : !this.pixelMode && s.f2d?.length
          ? s.f2d
          : s.f;
      this.spr(ctx, Math.abs(v) > 0.2 ? this.frame(frames, t * s.fps + c.ph) : frames[0], sx - 9, sy - s.h + 1, v < 0, s.w, s.h);
    }
  }

  drawRockFormations(ctx: Ctx, camLeft: number, camTop: number, vw: number, vh: number, t: number) {
    const sm = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = !this.pixelMode;
    const cl = this.sn(camLeft),
      ct = this.sn(camTop);
    // rooted stems first (back plane) ...
    for (const f of this.formations) {
      const sx = f.colX - cl,
        sy = f.colY - ct;
      if (sx + f.colW < 0 || sx > vw || sy + f.colH < 0 || sy > vh) continue;
      const colCv = !this.pixelMode && this.reef3D && f.col3d
        ? f.col3d
        : !this.pixelMode && f.col2d
          ? f.col2d
          : f.col;
      this.spr(ctx, colCv, sx, sy, false, f.colW, f.colH);
    }
    // ... then the collidable crowns with their living reef + 3D overhang shadows
    const vis: Formation[] = [];
    const underShadow = glowOrb("rgba(3, 8, 30, 0.78)", false);
    for (const f of this.formations) {
      const sx = f.x - cl,
        sy = f.y - ct;
      if (sx + f.w < -70 || sx > vw + 70 || sy + f.h < -70 || sy - 130 > vh) continue;
      vis.push(f);
      // Soft 3D overhang drop-shadow beneath each pinnacle arch
      if (!this.pixelMode) {
        ctx.globalAlpha = 0.34;
        ctx.drawImage(underShadow, sx + f.w * 0.1, sy + f.h * 0.62, f.w * 0.84, f.h * 0.36);
        ctx.globalAlpha = 1;
      }
      const rockCv = !this.pixelMode && this.reef3D && f.cv3d
        ? f.cv3d
        : !this.pixelMode && f.cv2d
          ? f.cv2d
          : f.cv;
      this.spr(ctx, rockCv, sx, sy, false, f.w, f.h);
      for (const b of f.insts) this.drawInst(ctx, b, b.x - cl, b.y - ct, t);
    }
    this.drawCrabs(ctx, false, cl, ct, vw, vh, t);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const f of vis) for (const b of f.insts) this.glowInst(ctx, b, b.x - cl, b.y - ct, t);

    // 3D Zone-Responsive Pinnacle Top-Rim & Caustic Light Projections
    const caustOrb = glowOrb("rgba(190, 252, 255, 0.48)", false);
    const rimShallow = glowOrb("rgba(155, 245, 255, 0.38)", false);
    const rimTwilight = glowOrb("rgba(98, 152, 255, 0.36)", false);
    const rimMidnight = glowOrb("rgba(145, 118, 255, 0.38)", false);
    for (const f of vis) {
      const sx = f.x - cl;
      const sy = f.y - ct;
      if (f.y < 820) {
        // Stage 1: Sunlit dappled caustic ribbons + warm sunlit top-ledge glow
        const depthFade = clamp01(1 - (f.y - 160) / 680);
        if (depthFade > 0.04) {
          ctx.globalAlpha = 0.34 * depthFade;
          ctx.drawImage(rimShallow, sx + f.w * 0.08, sy - 8, f.w * 0.82, 26);
          const count = Math.max(3, Math.floor(f.w / 52));
          for (let i = 0; i < count; i++) {
            const wave = Math.sin(t * 2.1 + f.x * 0.03 + i * 1.65);
            const cx = sx + ((i + 0.5) / count) * f.w + wave * 12;
            const cy = sy + 9 + Math.cos(t * 1.6 + i * 2.1) * 4.5;
            ctx.globalAlpha = (0.3 + 0.2 * wave) * depthFade;
            ctx.drawImage(caustOrb, cx - 26, cy - 7, 52, 14);
          }
        }
      } else if (f.y < 1520) {
        // Stage 2: Twilight cool sapphire top-edge scatter rim
        ctx.globalAlpha = 0.28 + Math.sin(t * 1.1 + f.x) * 0.06;
        ctx.drawImage(rimTwilight, sx + f.w * 0.08, sy - 6, f.w * 0.84, 24);
      } else {
        // Stage 3: Midnight bioluminescent crystal bounce along crown ledges
        ctx.globalAlpha = 0.24 + Math.sin(t * 1.4 + f.x * 0.02) * 0.08;
        ctx.drawImage(rimMidnight, sx + f.w * 0.1, sy - 6, f.w * 0.8, 24);
      }
    }
    ctx.restore();
    ctx.imageSmoothingEnabled = sm;
  }

  /**
   * Draws foreground rocky cave overhang brows + stalactites OVER fish inside caves, plus
   * subtle sanctuary shimmer when the player is safely hidden from predators.
   */
  drawCaveForeground(ctx: Ctx, camLeft: number, camTop: number, vw: number, vh: number, t: number, activeCaveId: number | null) {
    const sm = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = !this.pixelMode;
    const cl = this.sn(camLeft),
      ct = this.sn(camTop);
    const safeOrb = glowOrb("rgba(94, 234, 212, 0.56)", false);
    const deepSafeOrb = glowOrb("rgba(167, 139, 250, 0.52)", false);

    for (const f of this.formations) {
      const sx = f.x - cl,
        sy = f.y - ct;
      if (sx + f.w < -40 || sx > vw + 40 || sy + f.h < -40 || sy > vh + 40) continue;
      const rim = !this.pixelMode && this.reef3D && f.caveRim3d
        ? f.caveRim3d
        : !this.pixelMode && f.caveRim2d
          ? f.caveRim2d
          : f.caveRim;
      if (rim) this.spr(ctx, rim, sx, sy, false, f.w, f.h);

      if (f.cave) {
        const cx = f.cave.x - cl;
        const cy = f.cave.y - ct;
        const isHere = activeCaveId === f.cave.id;
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = isHere ? 0.16 + Math.sin(t * 3.0) * 0.04 : 0.08 + Math.sin(t * 2.0 + f.cave.id) * 0.025;
        const orb = f.cave.zone >= 2 ? deepSafeOrb : safeOrb;
        const rx = f.cave.rx * (isHere ? 0.82 : 0.72);
        const ry = f.cave.ry * (isHere ? 0.92 : 0.78);
        ctx.drawImage(orb, cx - rx, cy - ry, rx * 2, ry * 2);
        ctx.restore();
      }
    }
    ctx.imageSmoothingEnabled = sm;
  }

  drawFloor(ctx: Ctx, camLeft: number, camTop: number, vw: number, vh: number) {
    const cl = this.sn(camLeft),
      ct = this.sn(camTop);
    if (FLOOR_TOP - ct > vh) return;
    const use3d = !this.pixelMode && this.reef3D && !!this.floor3d;
    const use2d = !this.pixelMode && !use3d && !!this.floor2d;
    const F = use3d ? this.floor3d! : use2d ? this.floor2d! : this.floor;
    if (!F) return;
    const sx = Math.max(0, cl),
      sw = Math.min(F.width - sx, vw + 2);
    const sy = Math.max(0, ct - FLOOR_TOP),
      dy = FLOOR_TOP + sy - ct,
      sh = Math.min(F.height - sy, vh + 1 - dy);
    if (sw <= 0 || sh <= 0) return;
    const sm = ctx.imageSmoothingEnabled;
    if (use3d || use2d) {
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(F, sx, sy, sw, sh, sx - cl, dy, sw, sh);
      // Warm underwater sand caustic glints & hydrothermal shimmer resting along the sand crest
      const sandOrb = glowOrb("rgba(252, 232, 174, 0.35)", false);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const t = this.time;
      for (let gx = Math.floor(cl / 140) * 140; gx <= cl + vw + 140; gx += 140) {
        if (gx < 20 || gx > WORLD_W - 20) continue;
        const pulse = 0.45 + 0.4 * Math.sin(t * 1.6 + gx * 0.023);
        const fy = floorY(gx) - ct;
        if (fy < -30 || fy > vh + 40) continue;
        ctx.globalAlpha = 0.22 * pulse;
        ctx.drawImage(sandOrb, gx - cl - 58, fy - 12, 116, 28);
      }
      ctx.restore();
    } else {
      ctx.imageSmoothingEnabled = false;
      this.blit(ctx, F, sx, sy, sw, sh, sx - cl, dy);
    }
    ctx.imageSmoothingEnabled = sm;
  }

  drawBackDecor(ctx: Ctx, camLeft: number, camTop: number, vw: number, vh: number, t: number) {
    const cl = this.sn(camLeft),
      ct = this.sn(camTop);
    if (FLOOR_TOP - 140 - ct > vh) return;
    const sm = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = !this.pixelMode;
    for (const b of this.floorInsts) {
      const sx = b.x - cl;
      if (sx < -60 || sx > vw + 60) continue;
      this.drawInst(ctx, b, sx, b.y - ct, t);
    }
    this.drawCrabs(ctx, true, cl, ct, vw, vh, t);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const b of this.floorInsts) {
      const sx = b.x - cl;
      if (sx < -80 || sx > vw + 80) continue;
      this.glowInst(ctx, b, sx, b.y - ct, t);
    }
    // Stage 4: Dynamic 3D hydrothermal volcano crater magma & aqua plume uplighting
    const magmaGlow = glowOrb("rgba(255, 138, 52, 0.62)", false);
    const plumeGlow = glowOrb("rgba(105, 232, 255, 0.42)", false);
    for (let i = 0; i < this.vents.length; i++) {
      const v = this.vents[i];
      const vx = v.x - cl;
      const vy = v.y - ct;
      if (vx < -95 || vx > vw + 95) continue;
      const pulse = 0.78 + 0.22 * Math.sin(t * 2.8 + i * 1.9);
      ctx.globalAlpha = 0.46 * pulse;
      ctx.drawImage(magmaGlow, vx - 34, vy - 18, 68, 52);
      ctx.globalAlpha = 0.34 * pulse;
      ctx.drawImage(plumeGlow, vx - 42, vy - 78, 84, 82);
    }
    const cx = this.chestPos.x - cl,
      cy = this.chestPos.y - ct;
    if (cx > -80 && cx < vw + 80) {
      ctx.globalAlpha = 0.56 + Math.sin(t * 3) * 0.14;
      ctx.drawImage(glowOrb("rgba(255, 226, 110, 0.68)", false), cx - 52, cy - 52, 104, 104);
    }
    ctx.restore();
    ctx.imageSmoothingEnabled = sm;
  }

  // ==========================================================================
  // FOREGROUND (1.22x Parallax): Karang oranye dan batu besar di depan!
  // Massive dark rock boulders with saturated glowing orange staghorns, table
  // corals & deep purple sea fans framing the viewport, plus crisp bubble streams!
  // ==========================================================================
  drawForegroundParallax(ctx: Ctx, camLeft: number, camTop: number, vw: number, vh: number, t: number) {
    const sm = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = !this.pixelMode;

    // 1. World-anchored foreground orange corals & dark boulders seated flush at the seafloor bottom (never floating!)
    const dioramas = !this.pixelMode && this.reef3D && this.fgDioramas3d.length > 0
      ? this.fgDioramas3d
      : !this.pixelMode && this.fgDioramas2d.length > 0
        ? this.fgDioramas2d
        : this.fgDioramas;
    const dW = 280;
    const dH = 128;
    const floorBaseY = this.sn(WORLD_H + 42 - dH - camTop);
    if (dioramas.length > 0 && floorBaseY <= vh + 24) {
      const period = 310;
      const wrapW = period * dioramas.length;
      const off = this.sn(camLeft * 1.16);
      for (let i = 0; i < dioramas.length + 2; i++) {
        const sx = ((((i * period - off) % wrapW) + wrapW) % wrapW) - 240;
        if (sx < -300 || sx > vw + 60) continue;
        this.spr(ctx, dioramas[i % dioramas.length], sx, floorBaseY, false, dW, dH);
      }
      // Illuminated bubbles rising naturally from the seafloor coral crevices
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      for (let b = 0; b < 12; b++) {
        const bx =
          ((((b * 107 - off * 1.04) % (period * 2)) + period * 2) % (period * 2)) +
          Math.sin(t * 2.4 + b * 1.7) * 4;
        if (bx < -20 || bx > vw + 20) continue;
        const prog = (t * (0.42 + (b % 3) * 0.14) + b * 0.29) % 1;
        const by = floorBaseY + dH - 24 - prog * 120;
        if (by < -16 || by > vh + 16) continue;
        const size = (1.8 + (b % 4) * 0.9 + prog * 1.1) * 2.8;
        ctx.globalAlpha = Math.sin(prog * Math.PI) * 0.9;
        ctx.drawImage(this.fgBubble, bx - size * 0.5, by - size * 0.5, size, size);
      }
      ctx.restore();
    }

    // 2. Giant deep kelp silhouettes rooted firmly on the ocean floor
    const baseY = this.sn(WORLD_H + 42 - camTop);
    if (baseY - 215 <= vh) {
      const span = WORLD_W * 1.24,
        off = this.sn(camLeft * 1.24);
      for (const b of this.fgInsts) {
        const sx = ((((b.x - off) % span) + span) % span) - 60;
        if (sx > vw + 60) continue;
        this.drawInst(ctx, b, sx, baseY + b.y, t);
      }
    }

    ctx.imageSmoothingEnabled = sm;
  }

  // ==========================================================================
  // DEPTH-LEVEL HUD: gauge on the left + title card whenever a new zone is entered
  // ==========================================================================
  drawHud(ctx: Ctx, vw: number, vh: number, py: number, t: number) {
    const z = zoneAt(py);
    if (z !== this.hudZone) {
      this.hudZone = z;
      this.hudT = t;
    }
    const Z = ZONES[z];
    const gh = Math.min(92, vh * 0.34),
      gx = 6,
      gy = vh * 0.54 - gh / 2;
    ctx.fillStyle = "rgba(3, 8, 28, 0.62)";
    ctx.fillRect(gx - 1.5, gy - 1.5, 6, gh + 3);
    for (let i = 0; i < 4; i++) {
      const a = gy + (ZONES[i].y / WORLD_H) * gh,
        b = gy + ((i < 3 ? ZONES[i + 1].y : WORLD_H) / WORLD_H) * gh;
      ctx.globalAlpha = i === z ? 1 : 0.38;
      ctx.fillStyle = ZONES[i].col;
      ctx.fillRect(gx, a, 3, b - a - 0.8);
    }
    ctx.globalAlpha = 1;
    const my = gy + clamp01(py / WORLD_H) * gh;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(gx - 1.5, my - 0.8, 6, 1.6);
    const sm = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = true;
    const D = this.hudLabel(String(depthMeters(py)).replace(/\B(?=(\d{3})+(?!\d))/g, ".") + " m", 4.5, Z.col);
    ctx.drawImage(D.cv, gx + 6, my - D.h / 2, D.w, D.h);
    const k = t - this.hudT;
    if (k < 3.8) {
      const cy = vh * 0.79 + (1 - Math.min(1, k / 0.35)) * 6;
      ctx.globalAlpha = Math.min(1, k / 0.35) * Math.min(1, (3.8 - k) / 0.9);
      const N = this.hudLabel(Z.name, 9, Z.col);
      ctx.drawImage(N.cv, vw / 2 - N.w / 2, cy - N.h / 2, N.w, N.h);
      ctx.fillStyle = Z.col;
      for (const sd of [-1, 1]) {
        ctx.fillRect(vw / 2 + sd * (N.w / 2 + 3) - (sd < 0 ? 14 : 0), cy - 0.6, 14, 1.2);
        ctx.fillRect(vw / 2 + sd * (N.w / 2 + 20) - 1, cy - 1.6, 2, 3.2);
      }
      const S = this.hudLabel(`${Z.sub} · ${Z.m0}-${Z.m1} m`, 4.5, "#eaf6ff");
      ctx.drawImage(S.cv, vw / 2 - S.w / 2, cy + 10 - S.h / 2, S.w, S.h);
      ctx.globalAlpha = 1;
    }
    ctx.imageSmoothingEnabled = sm;
  }

  /** HUD text drawn once into a small canvas (with a cheap offset-fill outline) and reused as a sprite */
  private hudLabel(text: string, size: number, col: string): { cv: HTMLCanvasElement; w: number; h: number } {
    const q = Math.min(5, Math.max(1, Math.ceil(this.pxs)));
    const key = text + "|" + size + "|" + col + "|" + q;
    let e = this.hudTxt.get(key);
    if (!e) {
      const font = `${size}px 'Press Start 2P', monospace`;
      const cv = document.createElement("canvas");
      const c = cv.getContext("2d")!;
      c.font = font;
      const o = size * 0.13,
        pad = o + 1;
      const w = c.measureText(text).width + pad * 2,
        h = size * 1.4 + pad * 2;
      cv.width = Math.max(2, Math.ceil(w * q));
      cv.height = Math.max(2, Math.ceil(h * q));
      c.setTransform(q, 0, 0, q, 0, 0);
      c.font = font;
      c.textAlign = "left";
      c.textBaseline = "middle";
      c.fillStyle = "rgba(4, 10, 34, 0.9)";
      for (const [dx, dy] of [[-o, -o], [o, -o], [-o, o], [o, o], [0, o * 1.7]]) c.fillText(text, pad + dx, h / 2 + dy);
      c.fillStyle = col;
      c.fillText(text, pad, h / 2);
      e = { cv, w: cv.width / q, h: cv.height / q };
      if (this.hudTxt.size > 90) this.hudTxt.clear();
      this.hudTxt.set(key, e);
    }
    return e;
  }

  /**
   * Exact gap-free Signed Distance Field query on a reef formation:
   * - dist > 0 in open water or inside carved cave chamber
   * - dist < 0 inside solid rock walls/ceiling/floor
   * - (nx, ny) points strictly outward from solid rock
   */
  sampleRockSDF(f: Formation, wx: number, wy: number, useCave: boolean): { dist: number; nx: number; ny: number } {
    const sdf = useCave ? f.sdfCave : f.sdfSolid;
    const gx = (wx - f.x + sdf.pad) / sdf.step;
    const gy = (wy - f.y + sdf.pad) / sdf.step;
    if (gx < 0 || gx > sdf.sw - 1 || gy < 0 || gy > sdf.sh - 1) {
      return { dist: 999, nx: 0, ny: -1 };
    }
    const sample = (sx: number, sy: number) => {
      const cx = Math.max(0, Math.min(sdf.sw - 1.0001, sx));
      const cy = Math.max(0, Math.min(sdf.sh - 1.0001, sy));
      const x0 = cx | 0;
      const y0 = cy | 0;
      const fx = cx - x0;
      const fy = cy - y0;
      const i = y0 * sdf.sw + x0;
      const a = sdf.data[i];
      const b = sdf.data[i + 1];
      const c = sdf.data[i + sdf.sw];
      const d = sdf.data[i + sdf.sw + 1];
      return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
    };
    const dist = sample(gx, gy);
    let dx = sample(gx + 0.75, gy) - sample(gx - 0.75, gy);
    let dy = sample(gx, gy + 0.75) - sample(gx, gy - 0.75);
    let len = Math.hypot(dx, dy);
    if (len < 1e-4) {
      dx = wx - (f.x + f.w * 0.5);
      dy = wy - (f.y + f.h * 0.5);
      len = Math.hypot(dx, dy) || 1;
    }
    return { dist, nx: dx / len, ny: dy / len };
  }
}

// ============================================================================
// Tiny 16-bit pixel-art toolkit: packed-colour pixel buffers, ordered dithering,
// bevel + outline passes and row-shear "sway" animation.
// ============================================================================

export type Rnd = () => number;

export function rng(seed: number): Rnd {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const colCache = new Map<string, number>();

/** "#rrggbb" -> packed little-endian ABGR (ready for a Uint32 view over ImageData) */
export function C(h: string): number {
  let v = colCache.get(h);
  if (v === undefined) {
    const n = parseInt(h.slice(1), 16);
    v = (0xff000000 | ((n & 255) << 16) | (n & 0xff00) | ((n >> 16) & 255)) >>> 0;
    colCache.set(h, v);
  }
  return v;
}

export const P = (...h: string[]): number[] => h.map(C);

export function mixC(a: number, b: number, t: number): number {
  const ar = a & 255,
    ag = (a >> 8) & 255,
    ab = (a >> 16) & 255;
  const br = b & 255,
    bg = (b >> 8) & 255,
    bb = (b >> 16) & 255;
  return (
    (0xff000000 |
      (Math.round(ab + (bb - ab) * t) << 16) |
      (Math.round(ag + (bg - ag) * t) << 8) |
      Math.round(ar + (br - ar) * t)) >>>
    0
  );
}

const B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
/** 4x4 ordered-dither threshold in 0..1 */
export const bayer = (x: number, y: number) => (B4[((y & 3) << 2) | (x & 3)] + 0.5) / 16;

export function hash2(x: number, y: number, s = 0): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 974634777)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export class Pix {
  w: number;
  h: number;
  d: Uint32Array;

  constructor(w: number, h: number) {
    this.w = Math.max(1, Math.round(w));
    this.h = Math.max(1, Math.round(h));
    this.d = new Uint32Array(this.w * this.h);
  }

  set(x: number, y: number, c: number) {
    x = Math.round(x);
    y = Math.round(y);
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.d[y * this.w + x] = c;
  }

  get(x: number, y: number): number {
    return x >= 0 && y >= 0 && x < this.w && y < this.h ? this.d[y * this.w + x] : 0;
  }

  rect(x: number, y: number, w: number, h: number, c: number) {
    x = Math.round(x);
    y = Math.round(y);
    w = Math.round(w);
    h = Math.round(h);
    for (let j = Math.max(0, y); j < Math.min(this.h, y + h); j++)
      for (let i = Math.max(0, x); i < Math.min(this.w, x + w); i++) this.d[j * this.w + i] = c;
  }

  disc(cx: number, cy: number, r: number, c: number) {
    const r2 = r * r + 0.3;
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const dx = x - cx,
          dy = y - cy;
        if (dx * dx + dy * dy <= r2) this.set(x, y, c);
      }
  }

  ell(cx: number, cy: number, rx: number, ry: number, c: number) {
    if (rx <= 0 || ry <= 0) return;
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x - cx) / rx,
          dy = (y - cy) / ry;
        if (dx * dx + dy * dy <= 1.06) this.set(x, y, c);
      }
  }

  line(x0: number, y0: number, x1: number, y1: number, c: number, th = 1) {
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n,
        y = y0 + ((y1 - y0) * i) / n;
      if (th <= 1.5) this.set(x, y, c);
      else this.disc(x, y, th / 2, c);
    }
  }

  /** scanline polygon fill, pts = [x0,y0,x1,y1,...] */
  poly(pts: number[], c: number) {
    const n = pts.length >> 1;
    let lo = 1e9,
      hi = -1e9;
    for (let i = 0; i < n; i++) {
      lo = Math.min(lo, pts[i * 2 + 1]);
      hi = Math.max(hi, pts[i * 2 + 1]);
    }
    for (let y = Math.max(0, Math.floor(lo)); y <= Math.min(this.h - 1, Math.ceil(hi)); y++) {
      const xs: number[] = [];
      const yc = y + 0.001;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const ay = pts[i * 2 + 1],
          by = pts[j * 2 + 1];
        if ((ay <= yc && by > yc) || (by <= yc && ay > yc))
          xs.push(pts[i * 2] + ((yc - ay) / (by - ay)) * (pts[j * 2] - pts[i * 2]));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2)
        for (let x = Math.round(xs[k]); x <= Math.round(xs[k + 1]); x++) this.set(x, y, c);
    }
  }

  /** classic pixel-art bevel: lit on the upper-left rim, shaded on the lower-right rim */
  bevel(base: number, light: number, dark: number) {
    const { w, h, d } = this;
    const src = d.slice();
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (src[i] !== base) continue;
        const up = y > 0 ? src[i - w] : 0,
          lf = x > 0 ? src[i - 1] : 0;
        const dn = y < h - 1 ? src[i + w] : 0,
          rt = x < w - 1 ? src[i + 1] : 0;
        if (!up || !lf) d[i] = light;
        else if (!dn || !rt) d[i] = dark;
      }
  }

  /** 1px dark outline around every opaque shape (the signature 16-bit sprite look) */
  outline(c: number) {
    const { w, h, d } = this;
    const src = d.slice();
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (src[i]) continue;
        if ((x > 0 && src[i - 1]) || (x < w - 1 && src[i + 1]) || (y > 0 && src[i - w]) || (y < h - 1 && src[i + w]))
          d[i] = c;
      }
  }

  /** atmospheric tint of all opaque pixels toward a colour */
  tint(c: number, amt: number) {
    const d = this.d;
    for (let i = 0; i < d.length; i++) if (d[i]) d[i] = mixC(d[i], c, amt);
  }

  /** copy opaque pixels of another buffer (bottom-left friendly: dx,dy = top-left) */
  blit(src: Pix, dx: number, dy: number) {
    dx = Math.round(dx);
    dy = Math.round(dy);
    for (let y = 0; y < src.h; y++) {
      const ty = y + dy;
      if (ty < 0 || ty >= this.h) continue;
      for (let x = 0; x < src.w; x++) {
        const v = src.d[y * src.w + x];
        const tx = x + dx;
        if (v && tx >= 0 && tx < this.w) this.d[ty * this.w + tx] = v;
      }
    }
  }

  toCanvas(): HTMLCanvasElement {
    const cv = document.createElement("canvas");
    cv.width = this.w;
    cv.height = this.h;
    const ctx = cv.getContext("2d")!;
    const img = ctx.createImageData(this.w, this.h);
    new Uint32Array(img.data.buffer, img.data.byteOffset, this.w * this.h).set(this.d);
    ctx.putImageData(img, 0, 0);
    return cv;
  }
}

/**
 * Row-shear sway frame: every row slides sideways following a travelling sine wave,
 * anchored at the bottom (rooted organisms) or at the top (hanging organisms).
 */
export function sway(src: Pix, ph: number, amp: number, pow: number, lag: number, fromTop = false): Pix {
  const o = new Pix(src.w, src.h);
  const hm = Math.max(1, src.h - 1);
  for (let y = 0; y < src.h; y++) {
    const hf = fromTop ? y / hm : 1 - y / hm;
    const off = Math.round(amp * Math.pow(hf, pow) * Math.sin(ph * Math.PI * 2 - hf * lag));
    for (let x = 0; x < src.w; x++) {
      const sx = x - off;
      if (sx >= 0 && sx < src.w) o.d[y * src.w + x] = src.d[y * src.w + sx];
    }
  }
  return o;
}

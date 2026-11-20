import type { Species } from "./species";

/**
 * Hand-modelled fish drawn from reference art:
 *   clown   — chubby 3D clownfish (Si Oren)
 *   idol    — Gill the Moorish idol
 *   shark   — Bruce the cartoon great white
 *   leopard — Toto the spotted leopard shark
 *
 * Every fish is drawn in a normalised space: 1 unit = sprite width, origin = sprite centre,
 * +x = forward (the fish faces right), +y = down.
 */
export type CustomStyle = "clown" | "idol" | "shark" | "shark_sleek" | "leopard" | "boris" | "andy" | "tang" | "leon" | "orca" | "barracuda" | "sailfish" | "eddy" | "stingray" | "mandarin" | "aurora" | "narwhal" | "seadragon" | "axolotl" | "whaleshark" | "tuna" | "hammerhead" | "butterfly" | "snapper" | "lumba" | "snapturtle";
type Expr = "normal" | "happy" | "panic";
type Ctx = CanvasRenderingContext2D;

const ASPECT: Record<CustomStyle, number> = { clown: 0.72, idol: 0.96, shark: 0.62, shark_sleek: 0.62, leopard: 0.44, boris: 0.84, andy: 0.92, tang: 0.82, leon: 0.94, orca: 0.56, barracuda: 0.50, sailfish: 0.64, eddy: 0.92, stingray: 0.56, mandarin: 0.78, aurora: 0.88, narwhal: 0.56, seadragon: 0.84, axolotl: 0.70, whaleshark: 0.62, tuna: 0.58, hammerhead: 0.62, butterfly: 0.88, snapper: 0.68, lumba: 0.64, snapturtle: 0.62 };
/** mouth position as a fraction of the sprite width, measured from the sprite centre */
const MOUTH: Record<CustomStyle, [number, number]> = {
  clown: [0.34, 0.055],
  idol: [0.42, 0.0],
  shark: [0.365, 0.08],
  shark_sleek: [0.385, 0.055],
  leopard: [0.41, 0.05],
  boris: [0.355, 0.085],
  andy: [0.345, -0.004],
  tang: [0.33, 0.075],
  leon: [0.37, 0.068],
  orca: [0.37, 0.065],
  barracuda: [0.39, -0.015],
  sailfish: [0.34, 0.048],
  eddy: [0.32, 0.045],
  stingray: [0.32, 0.054],
  mandarin: [0.34, 0.032],
  aurora: [0.35, 0.025],
  narwhal: [0.275, 0.072],
  seadragon: [0.438, -0.003],
  axolotl: [0.355, 0.03],
  whaleshark: [0.385, 0.028],
  tuna: [0.41, 0.022],
  hammerhead: [0.285, 0.072],
  butterfly: [0.41, 0.018],
  snapper: [0.39, 0.034],
  lumba: [0.405, 0.035],
  snapturtle: [0.33, 0.032],
};

// (plain boolean on purpose: the legacy renderer keeps its own style checks type-valid)
export const isCustomStyle = (st: string): boolean =>
  st === "clown" || st === "idol" || st === "shark" || st === "shark_sleek" || st === "leopard" || st === "boris" || st === "andy" || st === "tang" || st === "leon" || st === "orca" || st === "barracuda" || st === "sailfish" || st === "eddy" || st === "stingray" || st === "mandarin" || st === "aurora" || st === "narwhal" || st === "seadragon" || st === "axolotl" || st === "whaleshark" || st === "tuna" || st === "hammerhead" || st === "butterfly" || st === "snapper" || st === "lumba" || st === "snapturtle";
export const customMouthOffset = (st: string, drawW: number): [number, number] => {
  const m = MOUTH[st as CustomStyle];
  return [m[0] * drawW, m[1] * drawW];
};

const TAU = Math.PI * 2;

function hexRgb(h: string): [number, number, number] {
  const n = parseInt(h.startsWith("#") ? h.slice(1) : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mix(a: string, b: string, t: number): string {
  const ca = hexRgb(a),
    cb = hexRgb(b);
  const r = Math.round(ca[0] + (cb[0] - ca[0]) * t),
    g = Math.round(ca[1] + (cb[1] - ca[1]) * t),
    bl = Math.round(ca[2] + (cb[2] - ca[2]) * t);
  return "#" + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1);
}
function rgba(h: string, a: number): string {
  const [r, g, b] = hexRgb(h);
  return `rgba(${r},${g},${b},${a})`;
}

interface Pose {
  open: number; // 0..1 jaw gape
  puff: boolean; // chewing with a closed mouth
  wag: number; // tail beat -1..1
  wag2: number; // lagging fin ripple -1..1
  phase?: number; // full swim cycle phase 0..TAU
  expr: Expr;
}

const lin = (c: Ctx, x0: number, y0: number, x1: number, y1: number, stops: [number, string][]) => {
  const g = c.createLinearGradient(x0, y0, x1, y1);
  for (const [o, col] of stops) g.addColorStop(o, col);
  return g;
};

/** soft elliptical glow that fades to nothing — never leaves a visible ring */
const glow = (c: Ctx, x: number, y: number, rx: number, ry: number, rot: number, rgb: string, a: number) => {
  c.save();
  c.translate(x, y);
  c.rotate(rot);
  c.scale(1, ry / rx);
  const g = c.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, `rgba(${rgb},${a})`);
  g.addColorStop(0.6, `rgba(${rgb},${a * 0.35})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  c.fillStyle = g;
  c.beginPath();
  c.arc(0, 0, rx, 0, TAU);
  c.fill();
  c.restore();
};

const fillStroke = (c: Ctx, build: () => void, fill: string | CanvasGradient, stroke: string, lw: number, inner?: () => void) => {
  c.beginPath();
  build();
  c.closePath();
  c.fillStyle = fill;
  c.fill();
  if (inner) {
    c.save();
    c.clip();
    inner();
    c.restore();
    c.beginPath();
    build();
    c.closePath();
  }
  c.strokeStyle = stroke;
  c.lineWidth = lw;
  c.stroke();
};

const blob = (c: Ctx, x: number, y: number, rx: number, ry: number, rot = 0) => {
  c.beginPath();
  c.ellipse(x, y, rx, ry, rot, 0, TAU);
  c.fill();
};

interface EyeOpt {
  iris: string;
  expr: Expr;
  ol: string;
  sx?: number; // horizontal squash of the eyeball
  look?: number; // pupil offset forward
  lookY?: number;
  irisR?: number;
  pupilR?: number;
  lid?: number; // 0..1 how much of the eye the upper lid covers
  lidTilt?: number;
  lidCol?: string;
  lidEdge?: string;
  tilt?: number;
  noHappy?: boolean;
  happyCol?: string; // colour of the closed "smiling" eye (needed on dark faces)
}

function eye(c: Ctx, x: number, y: number, r: number, o: EyeOpt) {
  const panic = o.expr === "panic";
  c.save();
  c.translate(x, y);
  if (o.tilt) c.rotate(o.tilt);
  if (o.expr === "happy" && !o.noHappy) {
    c.beginPath();
    c.arc(0, r * 0.32, r * 0.8, Math.PI * 1.1, Math.PI * 1.9);
    c.strokeStyle = o.happyCol || o.ol;
    c.lineWidth = Math.max(r * 0.26, 0.007);
    c.stroke();
    c.restore();
    return;
  }
  const sx = (o.sx ?? 0.9) * (panic ? 1.1 : 1),
    sy = panic ? 1.1 : 1;
  c.beginPath();
  c.ellipse(0, 0, r * sx, r * sy, 0, 0, TAU);
  const sg = c.createRadialGradient(r * 0.2, -r * 0.25, r * 0.1, 0, 0, r * 1.1);
  sg.addColorStop(0, "#ffffff");
  sg.addColorStop(0.7, "#f5f8fd");
  sg.addColorStop(1, "#b4c4d8");
  c.fillStyle = sg;
  c.fill();
  c.save();
  c.clip();
  const ir = r * (o.irisR ?? 0.56) * (panic ? 0.7 : 1),
    pr = r * (o.pupilR ?? 0.34) * (panic ? 0.65 : 1);
  const ix = r * (o.look ?? 0.3) * (panic ? 0.7 : 1),
    iy = r * (o.lookY ?? 0.04);
  c.fillStyle = o.iris;
  c.beginPath();
  c.arc(ix, iy, ir, 0, TAU);
  c.fill();
  c.fillStyle = "#07060c";
  c.beginPath();
  c.arc(ix + r * 0.03, iy, pr, 0, TAU);
  c.fill();
  c.fillStyle = "rgba(255,255,255,0.97)";
  c.beginPath();
  c.arc(ix - pr * 0.4, iy - pr * 0.5, Math.max(pr * 0.42, 0.003), 0, TAU);
  c.fill();
  c.fillStyle = "rgba(200,240,255,0.7)";
  c.beginPath();
  c.arc(ix + pr * 0.45, iy + pr * 0.5, pr * 0.2, 0, TAU);
  c.fill();
  if (o.lid && !panic) {
    c.rotate(o.lidTilt ?? 0);
    const ly = -r + o.lid * 2 * r;
    c.fillStyle = o.lidCol || o.ol;
    c.fillRect(-r * 1.8, -r * 1.8, r * 3.6, r * 1.8 + ly);
    c.strokeStyle = o.lidEdge || o.ol;
    c.lineWidth = r * 0.14;
    c.beginPath();
    c.moveTo(-r * 1.8, ly);
    c.lineTo(r * 1.8, ly);
    c.stroke();
  }
  c.restore();
  c.beginPath();
  c.ellipse(0, 0, r * sx, r * sy, 0, 0, TAU);
  c.strokeStyle = o.ol;
  c.lineWidth = Math.max(r * 0.12, 0.0045);
  c.stroke();
  c.restore();
}

/** fan of rays from a hub to points spread along a segment */
const rayFan = (c: Ctx, hx: number, hy: number, pts: [number, number][], col: string, lw: number) => {
  c.strokeStyle = col;
  c.lineWidth = lw;
  c.beginPath();
  for (const [x, y] of pts) {
    c.moveTo(hx, hy);
    c.lineTo(x, y);
  }
  c.stroke();
};

/** row of triangular teeth from a (hinge side) to b (jaw tip); (nx, ny) points into the mouth */
const teethRow = (c: Ctx, ax: number, ay: number, bx: number, by: number, n: number, nx: number, ny: number, len: (t: number) => number, t0 = 0.14, t1 = 0.99) => {
  c.fillStyle = "#ffffff";
  c.strokeStyle = "rgba(60,70,90,0.55)";
  c.lineWidth = 0.0025;
  for (let i = 0; i < n; i++) {
    const a = t0 + ((t1 - t0) * i) / n,
      b = t0 + ((t1 - t0) * (i + 1)) / n,
      m = (a + b) / 2;
    const l = len(m);
    if (l < 0.002) continue;
    c.beginPath();
    c.moveTo(ax + (bx - ax) * a, ay + (by - ay) * a);
    c.lineTo(ax + (bx - ax) * m + nx * l, ay + (by - ay) * m + ny * l);
    c.lineTo(ax + (bx - ax) * b, ay + (by - ay) * b);
    c.closePath();
    c.fill();
    c.stroke();
  }
};

/** sharp curved teeth along a quadratic Bezier jaw arch (p0=hinge -> p1=control -> p2=tip); side = +1 or -1 points into the mouth */
const curvedTeethRow = (
  c: Ctx,
  p0x: number,
  p0y: number,
  p1x: number,
  p1y: number,
  p2x: number,
  p2y: number,
  n: number,
  side: 1 | -1,
  len: (t: number) => number,
  t0 = 0.12,
  t1 = 0.98
) => {
  const evalPt = (t: number): [number, number] => {
    const u = 1 - t;
    return [u * u * p0x + 2 * u * t * p1x + t * t * p2x, u * u * p0y + 2 * u * t * p1y + t * t * p2y];
  };
  const evalTan = (t: number): [number, number] => {
    const dx = 2 * (1 - t) * (p1x - p0x) + 2 * t * (p2x - p1x);
    const dy = 2 * (1 - t) * (p1y - p0y) + 2 * t * (p2y - p1y);
    const d = Math.hypot(dx, dy) || 1;
    return [dx / d, dy / d];
  };
  c.fillStyle = "#ffffff";
  c.strokeStyle = "rgba(45, 58, 76, 0.48)";
  c.lineWidth = 0.0026;
  for (let i = 0; i < n; i++) {
    const a = t0 + ((t1 - t0) * i) / n;
    const b = t0 + ((t1 - t0) * (i + 1)) / n;
    const m = (a + b) / 2;
    const l = len(m);
    if (l < 0.002) continue;
    const [ax, ay] = evalPt(a);
    const [bx, by] = evalPt(b);
    const [mx, my] = evalPt(m);
    const [tx, ty] = evalTan(m);
    // inward normal + slight backward slant toward throat for shark teeth look
    const nx = -ty * side - tx * 0.12;
    const ny = tx * side - ty * 0.12;
    c.beginPath();
    c.moveTo(ax, ay);
    c.lineTo(mx + nx * l, my + ny * l);
    c.lineTo(bx, by);
    c.closePath();
    c.fill();
    c.stroke();
  }
};

// =====================================================================================
// CLOWNFISH (Si Oren) — matching Image 1 silhouette & proportions:
// compact reef-fish scale, sleeker tapered tail stalk, big rounded paddle tail,
// 3-scallop tall front dorsal + rounded rear dorsal, split double pelvic fin,
// 3 crisp black-edged white bands & big expressive glossy eye!
// =====================================================================================
function drawClown(c: Ctx, sp: Species, p: Pose) {
  const pal = sp.pal;
  const OR = pal.body,
    ORD = pal.dark,
    ORL = mix(pal.belly, "#ffffff", 0.14);
  const BLK = "#180b04",
    WH = "#fffdf8";
  const OL = rgba(pal.outline, 0.88);
  const LW = 0.0105;
  // Compact natural reef clownfish proportion so Nemo isn't larger than other species
  c.scale(0.84, 0.84);
  c.translate(0.01, 0.02);

  const finGrad = (x0: number, y0: number, x1: number, y1: number) =>
    lin(c, x0, y0, x1, y1, [
      [0, mix(OR, ORD, 0.28)],
      [0.55, OR],
      [1, ORL],
    ]);
  // orange fin with crisp black outer rim (matching Image 1)
  const rimFin = (full: () => void, edge: () => void, fill: string | CanvasGradient, rays?: () => void, bw = 0.052) => {
    c.beginPath();
    full();
    c.closePath();
    c.fillStyle = fill;
    c.fill();
    c.save();
    c.clip();
    if (rays) rays();
    c.beginPath();
    edge();
    c.strokeStyle = BLK;
    c.lineWidth = bw;
    c.stroke();
    c.restore();
    c.beginPath();
    full();
    c.closePath();
    c.strokeStyle = OL;
    c.lineWidth = LW * 0.85;
    c.stroke();
  };
  const rayCol = rgba(ORD, 0.42);

  // ---- tail: big rounded paddle at end of slim peduncle (Image 1!) ----
  c.save();
  c.translate(-0.215, 0.015);
  c.rotate(p.wag * 0.18);
  c.scale(1 - Math.abs(p.wag) * 0.05, 1);
  const tailEdge = () => {
    c.moveTo(0.01, -0.052);
    c.bezierCurveTo(-0.055, -0.148, -0.195, -0.172, -0.242, -0.088);
    c.bezierCurveTo(-0.275, -0.03, -0.275, 0.055, -0.242, 0.112);
    c.bezierCurveTo(-0.195, 0.192, -0.055, 0.168, 0.01, 0.056);
  };
  rimFin(tailEdge, tailEdge, finGrad(0, 0, -0.26, 0), () => {
    const pts: [number, number][] = [];
    for (let i = 0; i < 8; i++) pts.push([-0.265, -0.12 + i * 0.036]);
    rayFan(c, 0.02, 0.004, pts, rayCol, 0.0042);
  });
  c.restore();

  // ---- dorsal fin: 3-scallop tall front crest + rounded rear lobe (Image 1!) ----
  const sw = p.wag2 * 0.006;
  const d1Edge = () => {
    c.moveTo(0.225, -0.195);
    c.bezierCurveTo(0.218, -0.275 + sw, 0.178, -0.325 + sw, 0.145, -0.305 + sw);
    c.bezierCurveTo(0.125, -0.342 + sw, 0.085, -0.352 + sw, 0.068, -0.312 + sw);
    c.bezierCurveTo(0.035, -0.352 + sw, -0.038, -0.345 + sw, -0.052, -0.285 + sw);
    c.quadraticCurveTo(-0.058, -0.23, -0.042, -0.165);
  };
  rimFin(
    () => {
      d1Edge();
      c.lineTo(-0.02, -0.1);
      c.lineTo(0.21, -0.1);
    },
    d1Edge,
    finGrad(0.08, -0.16, 0.1, -0.34),
    () => {
      const pts: [number, number][] = [];
      for (let i = 0; i < 7; i++) pts.push([0.21 - i * 0.04, -0.35]);
      rayFan(c, 0.08, -0.08, pts, rayCol, 0.004);
    }
  );
  const d2Edge = () => {
    c.moveTo(-0.055, -0.175);
    c.bezierCurveTo(-0.095, -0.228 + sw, -0.165, -0.235 + sw, -0.195, -0.19 + sw);
    c.bezierCurveTo(-0.215, -0.155 + sw, -0.195, -0.1, -0.16, -0.078);
  };
  rimFin(
    () => {
      d2Edge();
      c.lineTo(-0.11, -0.03);
      c.lineTo(-0.05, -0.09);
    },
    d2Edge,
    finGrad(-0.1, -0.09, -0.16, -0.22),
    () => {
      const pts: [number, number][] = [];
      for (let i = 0; i < 6; i++) pts.push([-0.06 - i * 0.028, -0.23 + i * 0.015]);
      rayFan(c, -0.1, -0.05, pts, rayCol, 0.0038);
    }
  );

  // ---- rounded anal fin ----
  const anEdge = () => {
    c.moveTo(-0.025, 0.175);
    c.bezierCurveTo(-0.055, 0.252 - sw, -0.135, 0.268 - sw, -0.175, 0.225 - sw);
    c.bezierCurveTo(-0.205, 0.192 - sw, -0.19, 0.125, -0.155, 0.088);
  };
  rimFin(
    () => {
      anEdge();
      c.lineTo(-0.1, 0.06);
      c.lineTo(-0.02, 0.11);
    },
    anEdge,
    finGrad(-0.09, 0.11, -0.14, 0.25),
    () => {
      const pts: [number, number][] = [];
      for (let i = 0; i < 6; i++) pts.push([-0.04 - i * 0.028, 0.26 - i * 0.012]);
      rayFan(c, -0.08, 0.06, pts, rayCol, 0.0038);
    }
  );

  // ---- double-lobed pelvic fin under belly (exact Image 1!) ----
  c.save();
  c.translate(0.165, 0.185);
  c.rotate(-p.wag2 * 0.08);
  const pvEdge = () => {
    c.moveTo(0.052, 0.0);
    c.bezierCurveTo(0.072, 0.052, 0.042, 0.098, 0.012, 0.078);
    c.lineTo(0.006, 0.052);
    c.bezierCurveTo(-0.012, 0.095, -0.068, 0.092, -0.072, 0.052);
    c.bezierCurveTo(-0.072, 0.025, -0.045, 0.004, -0.018, -0.002);
  };
  rimFin(pvEdge, pvEdge, finGrad(0, 0, -0.02, 0.09), () => {
    rayFan(c, 0.0, 0.0, [[0.045, 0.085], [0.02, 0.08], [-0.03, 0.09], [-0.06, 0.07]], rayCol, 0.0035);
  }, 0.042);
  c.restore();

  // ---- jaw geometry: cute smiling mouth indent & overhanging rounded snout ----
  const hx = 0.325,
    hy = 0.058,
    jl = 0.105;
  const baseAng = -0.12;
  const ua = baseAng - p.open * 0.34,
    la = baseAng + 0.35 + p.open * 0.88;
  const ux = hx + Math.cos(ua) * jl,
    uy = hy + Math.sin(ua) * jl;
  const lx = hx + Math.cos(la) * (jl * 0.78),
    ly = hy + Math.sin(la) * (jl * 0.78);
  const chin = (p.puff ? 0.012 : 0) + p.open * 0.024;

  if (p.open > 0) {
    c.beginPath();
    c.moveTo(ux - 0.005, uy + 0.006);
    c.lineTo(hx - 0.025, hy);
    c.lineTo(lx - 0.005, ly - 0.004);
    c.closePath();
    c.fillStyle = "#4d0f1c";
    c.fill();
    c.save();
    c.clip();
    c.fillStyle = "#f0708c";
    blob(c, (hx + lx) / 2 + 0.005, (hy + ly) / 2 + 0.004, 0.036, 0.013, la);
    c.restore();
  }

  // ---- Image 1 Nemo body silhouette with tapered peduncle & cute rounded snout ----
  const body = () => {
    c.moveTo(-0.215, -0.05);
    c.bezierCurveTo(-0.125, -0.12, 0.0, -0.215, 0.125, -0.225);
    c.bezierCurveTo(0.265, -0.235, 0.395, -0.16, 0.432, -0.035 - p.open * 0.012);
    c.quadraticCurveTo(0.452, uy - 0.015, ux, uy);
    if (p.open > 0) {
      c.quadraticCurveTo((ux + hx) * 0.5, uy + 0.006, hx, hy);
      c.quadraticCurveTo((hx + lx) * 0.5, ly - 0.005, lx, ly);
    } else {
      // subtle smiling lip notch matching Image 1's cheerful mouth wedge
      c.quadraticCurveTo(ux + 0.004, uy + 0.022, hx + 0.018, hy + 0.006);
      c.quadraticCurveTo((hx + lx) * 0.52, ly - 0.008, lx, ly + 0.008 + chin);
    }
    c.bezierCurveTo(lx - 0.018, ly + 0.038 + chin, 0.315, 0.165 + chin, 0.215, 0.188 + chin);
    c.bezierCurveTo(0.1, 0.212, -0.025, 0.192, -0.125, 0.125);
    c.quadraticCurveTo(-0.178, 0.09, -0.215, 0.068);
  };

  c.beginPath();
  body();
  c.closePath();
  c.fillStyle = lin(c, 0, -0.24, 0, 0.22, [
    [0, mix(OR, ORL, 0.52)],
    [0.44, OR],
    [0.86, mix(OR, ORD, 0.38)],
    [1, mix(OR, ORD, 0.7)],
  ]);
  c.fill();
  c.save();
  c.clip();
  glow(c, 0.1, -0.03, 0.3, 0.19, 0, "255,196,92", 0.52);

  // 3 crisp white bands edged in black (Image 1!)
  const bandStroke = 0.024;
  const paintBand = (build: () => void) => {
    c.beginPath();
    build();
    c.closePath();
    c.strokeStyle = BLK;
    c.lineWidth = bandStroke;
    c.stroke();
    c.fillStyle = lin(c, 0, -0.24, 0, 0.22, [
      [0, "#ffffff"],
      [0.6, WH],
      [1, "#dbe0ea"],
    ]);
    c.fill();
  };
  // head band curving smoothly behind eye
  paintBand(() => {
    c.moveTo(0.248, -0.28);
    c.quadraticCurveTo(0.205, -0.02, 0.275, 0.25);
    c.lineTo(0.205, 0.25);
    c.quadraticCurveTo(0.135, -0.02, 0.175, -0.28);
  });
  // middle band curving forward slightly into gentle bump behind pectoral
  paintBand(() => {
    c.moveTo(-0.025, -0.28);
    c.bezierCurveTo(0.015, -0.1, 0.052, -0.04, 0.052, 0.018);
    c.bezierCurveTo(0.052, 0.08, 0.015, 0.12, -0.008, 0.26);
    c.lineTo(-0.105, 0.26);
    c.bezierCurveTo(-0.078, 0.08, -0.07, -0.05, -0.115, -0.28);
  });
  // tail-peduncle white band
  paintBand(() => {
    c.moveTo(-0.165, -0.18);
    c.quadraticCurveTo(-0.15, 0.01, -0.165, 0.18);
    c.lineTo(-0.24, 0.18);
    c.quadraticCurveTo(-0.225, 0.01, -0.24, -0.18);
  });

  // 3D gloss + bottom AO
  c.fillStyle = lin(c, 0, -0.24, 0, 0.22, [
    [0, "rgba(255,255,255,0.2)"],
    [0.22, "rgba(255,255,255,0)"],
    [0.68, "rgba(70,20,0,0)"],
    [1, "rgba(70,20,0,0.3)"],
  ]);
  c.fillRect(-0.4, -0.35, 0.95, 0.72);
  glow(c, 0.08, -0.13, 0.22, 0.045, -0.08, "255,255,255", 0.44);
  c.restore();

  c.beginPath();
  body();
  c.closePath();
  c.strokeStyle = OL;
  c.lineWidth = LW;
  c.stroke();

  // ---- mouth crease ----
  c.strokeStyle = rgba(pal.outline, 0.85);
  c.lineWidth = 0.0075;
  if (p.open > 0) {
    c.beginPath();
    c.moveTo(ux, uy);
    c.lineTo(hx, hy);
    c.lineTo(lx, ly);
    c.stroke();
  } else {
    c.beginPath();
    c.moveTo(hx + 0.015, hy + 0.006);
    c.arc(hx + 0.008, hy + 0.002, 0.011, Math.PI * 0.4, Math.PI * 1.35);
    c.stroke();
  }

  // ---- cute stubby rounded triangular pectoral fin (Image 1!) ----
  c.save();
  c.translate(0.068, 0.058);
  c.rotate(0.18 + p.wag2 * 0.16);
  const pcEdge = () => {
    c.moveTo(0.01, -0.025);
    c.bezierCurveTo(-0.025, -0.058, -0.082, -0.062, -0.088, -0.015);
    c.bezierCurveTo(-0.092, 0.032, -0.045, 0.056, 0.0, 0.028);
  };
  rimFin(
    pcEdge,
    pcEdge,
    lin(c, 0, 0, -0.09, 0.02, [
      [0, mix(OR, ORD, 0.25)],
      [0.6, OR],
      [1, ORL],
    ]),
    () => {
      rayFan(c, 0.0, 0.0, [[-0.085, -0.035], [-0.09, 0.0], [-0.075, 0.035]], rayCol, 0.0038);
    },
    0.038
  );
  c.restore();

  // ---- BIG expressive eye (kept in existing glossy style, scaled up to match Image 1!) ----
  const ex = 0.312,
    ey = -0.052 - p.open * 0.006,
    er = 0.072;
  if (p.puff) glow(c, ex - 0.025, ey + 0.095, 0.048, 0.03, 0, "255,90,130", 0.48);
  c.beginPath();
  c.ellipse(ex - 0.006, ey, er * 1.04, er * 1.12, 0, Math.PI * 0.55, Math.PI * 1.75);
  c.strokeStyle = rgba(ORD, 0.42);
  c.lineWidth = 0.007;
  c.stroke();
  eye(c, ex, ey, er, { iris: "#7a3b12", expr: p.expr, ol: rgba(pal.outline, 0.85), sx: 0.94, look: 0.28, irisR: 0.56, pupilR: 0.36 });
}

// =====================================================================================
// GILL — Moorish idol: tall kite-shaped body, long white snout, dark face mask with a
// stern half-lidded eye, white / black / cream bands, sickle dorsal streamer, dark tail.
// =====================================================================================
function drawIdol(c: Ctx, sp: Species, p: Pose) {
  const pal = sp.pal;
  const DK = "#261640",
    DK2 = "#120822",
    PUR = "#51397a";
  const WH = "#fffdf6",
    CREAM = "#f6ecc2",
    YEL = "#efd98a";
  const OL = rgba(pal.outline, 0.9);
  const LW = 0.0095;
  c.translate(0.0, 0.012);
  const s = p.wag2;

  // band 2 (rear black band) — one long ribbon running from the dorsal fin into the anal fin
  const band2 = () => {
    c.moveTo(0.078, -0.3);
    c.quadraticCurveTo(0.046, -0.03, 0.082, 0.22);
    c.lineTo(0.125, 0.335);
    c.lineTo(0.0, 0.38);
    c.lineTo(0.01, 0.22);
    c.quadraticCurveTo(-0.012, 0.0, -0.004, -0.19);
    c.lineTo(0.0, -0.3);
  };

  // ---- tail: dark triangle with a cream base ----
  c.save();
  c.translate(-0.045, 0.045);
  c.rotate(p.wag * 0.2);
  c.scale(1 - Math.abs(p.wag) * 0.05, 1);
  fillStroke(
    c,
    () => {
      c.moveTo(0.012, -0.034);
      c.bezierCurveTo(-0.05, -0.062, -0.12, -0.11, -0.18, -0.148);
      c.quadraticCurveTo(-0.186, -0.13, -0.172, -0.112);
      c.bezierCurveTo(-0.128, -0.07, -0.108, -0.03, -0.112, -0.008);
      c.bezierCurveTo(-0.112, 0.02, -0.122, 0.055, -0.136, 0.082);
      c.quadraticCurveTo(-0.118, 0.084, -0.098, 0.07);
      c.bezierCurveTo(-0.06, 0.05, -0.02, 0.036, 0.012, 0.03);
    },
    lin(c, 0.01, 0, -0.17, 0, [
      [0, CREAM],
      [0.16, YEL],
      [0.3, DK],
      [1, DK2],
    ]),
    OL,
    LW * 0.85,
    () => {
      rayFan(
        c,
        0.02,
        0,
        [
          [-0.19, -0.12],
          [-0.17, -0.07],
          [-0.15, -0.02],
          [-0.15, 0.03],
          [-0.16, 0.075],
        ],
        rgba(PUR, 0.5),
        0.004
      );
    }
  );
  c.restore();

  // ---- dorsal fin: white sickle streamer, dark inner ribbon, cream rear membrane ----
  const tipX = -0.452,
    tipY = -0.31 + s * 0.022;
  const mid = s * 0.01;
  const dorsalOuter = () => {
    c.moveTo(0.158, -0.29);
    c.bezierCurveTo(0.11, -0.385, 0.01, -0.43 + mid, -0.085, -0.422 + mid);
    c.bezierCurveTo(-0.21, -0.41 + mid, -0.33, -0.365 + mid, tipX, tipY);
  };
  const dorsalInnerBack = () => {
    c.bezierCurveTo(-0.33, -0.33 + mid, -0.22, -0.352 + mid, -0.13, -0.35 + mid);
    c.bezierCurveTo(-0.07, -0.348, -0.044, -0.262, -0.04, -0.13);
    c.bezierCurveTo(-0.07, -0.09, -0.075, -0.04, -0.058, 0.01);
    c.lineTo(0.06, -0.05);
  };
  fillStroke(
    c,
    () => {
      dorsalOuter();
      dorsalInnerBack();
    },
    lin(c, 0.1, -0.2, -0.2, -0.42, [
      [0, WH],
      [0.5, "#fffbe8"],
      [1, "#f4eccc"],
    ]),
    OL,
    LW * 0.85,
    () => {
      // dark ribbon along the inner side of the streamer (continuation of band 2)
      c.beginPath();
      c.moveTo(0.06, -0.22);
      c.bezierCurveTo(0.034, -0.322, -0.03, -0.376 + mid, -0.1, -0.372 + mid);
      c.bezierCurveTo(-0.21, -0.362 + mid, -0.33, -0.336 + mid, tipX, tipY);
      c.bezierCurveTo(-0.33, -0.31 + mid, -0.22, -0.33 + mid, -0.13, -0.33 + mid);
      c.bezierCurveTo(-0.05, -0.33, -0.012, -0.26, -0.006, -0.16);
      c.closePath();
      c.fillStyle = lin(c, 0, -0.2, -0.3, -0.38, [
        [0, DK2],
        [1, DK],
      ]);
      c.fill();
      // soft yellow tint on the rear membrane
      c.fillStyle = rgba(YEL, 0.5);
      c.beginPath();
      c.moveTo(-0.006, -0.16);
      c.lineTo(-0.1, -0.16);
      c.lineTo(-0.1, 0.05);
      c.lineTo(0.02, 0.05);
      c.closePath();
      c.fill();
      // sheen line down the white streamer
      c.beginPath();
      c.moveTo(0.11, -0.3);
      c.bezierCurveTo(0.07, -0.385, -0.0, -0.412 + mid, -0.09, -0.405 + mid);
      c.strokeStyle = "rgba(205,198,160,0.55)";
      c.lineWidth = 0.004;
      c.stroke();
    }
  );

  // ---- anal fin ----
  fillStroke(
    c,
    () => {
      c.moveTo(0.215, 0.262);
      c.bezierCurveTo(0.17, 0.315, 0.1, 0.35 + s * 0.006, 0.03, 0.356 + s * 0.008);
      c.quadraticCurveTo(0.012, 0.352 + s * 0.008, 0.014, 0.334);
      c.bezierCurveTo(0.0, 0.25, -0.032, 0.15, -0.052, 0.074);
      c.lineTo(0.1, 0.08);
    },
    lin(c, 0, 0.1, 0, 0.36, [
      [0, CREAM],
      [1, YEL],
    ]),
    OL,
    LW * 0.85,
    () => {
      c.beginPath();
      c.moveTo(0.3, 0.2);
      c.lineTo(0.075, 0.2);
      c.quadraticCurveTo(0.03, 0.26, 0.012, 0.37);
      c.lineTo(0.3, 0.4);
      c.closePath();
      c.fillStyle = lin(c, 0.05, 0.2, 0.15, 0.36, [
        [0, DK2],
        [1, DK],
      ]);
      c.fill();
    }
  );

  // ---- pelvic fins: two long dark spikes ----
  const spike = (bx0: number, by0: number, bx1: number, by1: number, tx: number, ty: number) =>
    fillStroke(
      c,
      () => {
        c.moveTo(bx0, by0);
        c.quadraticCurveTo((bx0 + tx) / 2 + 0.016, (by0 + ty) / 2, tx, ty);
        c.quadraticCurveTo((bx1 + tx) / 2 - 0.004, (by1 + ty) / 2, bx1, by1);
      },
      lin(c, 0, by0, 0, ty, [
        [0, DK2],
        [1, PUR],
      ]),
      OL,
      LW * 0.7
    );
  spike(0.196, 0.262, 0.166, 0.262, 0.156 - s * 0.01, 0.412);
  spike(0.25, 0.23, 0.222, 0.248, 0.262 - s * 0.012, 0.37);

  // ---- jaw: iconic Gill Moorish idol arched beak & sculpted concave lower chin (Image 2!) ----
  const hx = 0.284;
  const hy = -0.008;
  const lift = p.open * 0.024;
  const chin = (p.puff ? 0.01 : 0) + p.open * 0.018;
  // Upper snout tip arches up over a rounded hump then points crisply forward-down
  const ux = 0.464 - p.open * 0.008;
  const uy = -0.014 - p.open * 0.038;
  // Lower jaw rotates cleanly around hinge (hx, hy) so open beak looks anatomical
  const jawAng = p.open * 0.56;
  const cosJ = Math.cos(jawAng);
  const sinJ = Math.sin(jawAng);
  const rotJ = (px: number, py: number): [number, number] => [
    hx + (px - hx) * cosJ - (py - hy) * sinJ,
    hy + (px - hx) * sinJ + (py - hy) * cosJ,
  ];
  const [lx, ly] = rotJ(0.454, -0.006);
  const [chinC1x, chinC1y] = rotJ(0.408, 0.022);
  const [chinC2x, chinC2y] = rotJ(0.376, 0.072);
  const [chinEndx, chinEndy] = rotJ(0.336, 0.138);

  if (p.open > 0) {
    c.beginPath();
    c.moveTo(hx - 0.02, hy);
    c.quadraticCurveTo(0.37, uy + 0.004, ux - 0.004, uy + 0.004);
    c.quadraticCurveTo((ux + lx) * 0.5 - 0.022, (uy + ly) * 0.5, lx - 0.004, ly + 0.002);
    c.quadraticCurveTo(0.365, (hy + ly) * 0.5 + 0.004, hx - 0.02, hy + 0.006);
    c.closePath();
    c.fillStyle = "#4a1020";
    c.fill();
    c.save();
    c.clip();
    c.fillStyle = "#e8708a";
    blob(c, (hx + lx) * 0.5, (hy + ly) * 0.5 + 0.004, 0.055, 0.014, jawAng * 0.7);
    c.restore();
  }

  const body = () => {
    c.moveTo(0.114, -0.322);
    // Steep dark forehead sweeping down to proud protruding brow ridge
    c.bezierCurveTo(0.175, -0.312, 0.245, -0.228, 0.292, -0.152);
    c.quadraticCurveTo(0.326, -0.126, 0.308, -0.104 - lift * 0.4);
    // Concave dip right below the eye before rising over the bulbous arched upper beak!
    c.quadraticCurveTo(0.286, -0.082 - lift * 0.5, 0.31, -0.068 - lift * 0.7);
    c.bezierCurveTo(0.352, -0.078 - lift, 0.388, -0.098 - lift, 0.422, -0.064 - lift);
    c.quadraticCurveTo(0.448, -0.036 - lift * 0.6, ux, uy);
    if (p.open > 0) {
      c.quadraticCurveTo(0.375, uy + 0.006, hx, hy);
      c.quadraticCurveTo((hx + lx) * 0.5, (hy + ly) * 0.5 - 0.004, lx, ly);
      // Concave scooped lower snout sweeping gracefully down into the white cheek & chin!
      c.bezierCurveTo(chinC1x, chinC1y, chinC2x, chinC2y, chinEndx, chinEndy + chin);
    } else {
      c.lineTo(0.454, -0.006);
      // Iconic concave scooped under-jaw curve tapering into the white throat (Image 2!)
      c.bezierCurveTo(0.408, 0.022, 0.376, 0.072, 0.336, 0.138 + chin);
    }
    c.bezierCurveTo(0.305, 0.176 + chin, 0.278, 0.205, 0.256, 0.232);
    c.quadraticCurveTo(0.235, 0.262, 0.205, 0.277);
    // lower rear edge up to the tail stalk
    c.bezierCurveTo(0.12, 0.252, 0.02, 0.162, -0.05, 0.072);
    c.lineTo(-0.056, 0.016);
    // upper rear edge back to the apex
    c.bezierCurveTo(-0.03, -0.082, 0.02, -0.202, 0.114, -0.322);
  };

  c.beginPath();
  body();
  c.closePath();
  c.fillStyle = WH;
  c.fill();
  c.save();
  c.clip();
  // rear body: warm cream fading to yellow at the tail stalk
  c.fillStyle = lin(c, 0.02, 0, -0.06, 0, [
    [0, "#fbf3d0"],
    [1, YEL],
  ]);
  c.fillRect(-0.1, -0.35, 0.12, 0.7);
  // white middle band (soft warm shading toward the belly)
  c.fillStyle = lin(c, 0, -0.3, 0, 0.3, [
    [0, "#ffffff"],
    [0.55, WH],
    [1, "#efe6c6"],
  ]);
  c.fillRect(0.02, -0.35, 0.16, 0.7);
  // rear black band
  c.beginPath();
  band2();
  c.closePath();
  c.fillStyle = lin(c, 0.08, 0, -0.01, 0, [
    [0, DK],
    [1, DK2],
  ]);
  c.fill();
  // dark face mask
  c.beginPath();
  c.moveTo(0.158, -0.36);
  c.bezierCurveTo(0.126, -0.2, 0.122, -0.05, 0.138, 0.07);
  c.quadraticCurveTo(0.15, 0.19, 0.19, 0.3);
  c.lineTo(0.5, 0.3);
  c.lineTo(0.5, -0.36);
  c.closePath();
  c.fillStyle = lin(c, 0.14, -0.1, 0.33, 0.05, [
    [0, DK2],
    [0.5, DK],
    [1, "#2e1c4c"],
  ]);
  c.fill();
  // purple satin sheen on the forehead and cheek
  glow(c, 0.215, -0.21, 0.09, 0.035, 0.95, "120,92,176", 0.5);
  glow(c, 0.2, 0.1, 0.05, 0.09, 0.2, "104,80,160", 0.3);
  // white snout + cheek mask sweeping cleanly under eye & around chin (Image 2!)
  c.beginPath();
  c.moveTo(0.32, -0.082);
  c.bezierCurveTo(0.285, -0.062, 0.228, -0.044, 0.205, 0.008);
  c.bezierCurveTo(0.192, 0.062, 0.212, 0.145, 0.278, 0.212);
  c.lineTo(0.34, 0.28);
  c.lineTo(0.5, 0.28);
  c.lineTo(0.5, -0.18);
  c.closePath();
  c.fillStyle = lin(c, 0.32, -0.07, 0.34, 0.2, [
    [0, "#ffffff"],
    [0.55, "#f3f6fa"],
    [1, "#cad3e0"],
  ]);
  c.fill();
  c.strokeStyle = rgba(DK2, 0.55);
  c.lineWidth = 0.0042;
  c.stroke();
  // Subtle sculpted chin contour crease like Image 2
  c.beginPath();
  c.moveTo(0.352, 0.038 + chin * 0.2);
  c.quadraticCurveTo(0.322, 0.07 + chin * 0.3, 0.32, 0.112 + chin * 0.4);
  c.strokeStyle = "rgba(130, 140, 165, 0.32)";
  c.lineWidth = 0.0038;
  c.stroke();
  // Bright yellow saddle tucked into the concave nasal bridge (Image 2!)
  c.fillStyle = "#f4cb3c";
  c.beginPath();
  c.moveTo(0.292, -0.078 - lift * 0.55);
  c.quadraticCurveTo(0.314, -0.088 - lift * 0.65, 0.338, -0.068 - lift * 0.72);
  c.quadraticCurveTo(0.315, -0.056 - lift * 0.58, 0.288, -0.064 - lift * 0.52);
  c.closePath();
  c.fill();
  c.strokeStyle = rgba(DK2, 0.45);
  c.lineWidth = 0.0032;
  c.stroke();
  // overall volume
  c.fillStyle = lin(c, 0, -0.32, 0, 0.28, [
    [0, "rgba(255,255,255,0.12)"],
    [0.3, "rgba(255,255,255,0)"],
    [0.7, "rgba(20,10,40,0)"],
    [1, "rgba(20,10,40,0.3)"],
  ]);
  c.fillRect(-0.2, -0.4, 0.8, 0.8);
  c.restore();
  c.beginPath();
  body();
  c.closePath();
  c.strokeStyle = OL;
  c.lineWidth = LW;
  c.stroke();

  // ---- mouth: sleek crisp flat stern beak line ----
  c.strokeStyle = rgba(DK2, 0.94);
  c.lineWidth = 0.0072;
  if (p.open > 0) {
    c.beginPath();
    c.moveTo(ux, uy);
    c.quadraticCurveTo(0.375, uy + 0.006, hx, hy);
    c.quadraticCurveTo((hx + lx) * 0.5, (hy + ly) * 0.5 - 0.004, lx, ly);
    c.stroke();
  } else {
    c.beginPath();
    c.moveTo(ux - 0.004, uy + 0.004);
    c.quadraticCurveTo(0.375, -0.008, hx + 0.008, hy);
    c.quadraticCurveTo(hx - 0.012, hy, hx - 0.022, hy + 0.01);
    c.stroke();
  }

  // ---- pectoral fin: long dark blade sweeping up and back over the white band ----
  c.save();
  c.translate(0.14, 0.1);
  c.rotate(p.wag2 * 0.12);
  fillStroke(
    c,
    () => {
      c.moveTo(0.012, -0.018);
      c.bezierCurveTo(-0.04, -0.082, -0.1, -0.15, -0.166, -0.19);
      c.quadraticCurveTo(-0.166, -0.165, -0.142, -0.122);
      c.bezierCurveTo(-0.1, -0.05, -0.062, 0.002, -0.024, 0.028);
      c.quadraticCurveTo(0.012, 0.022, 0.012, -0.018);
    },
    lin(c, 0, 0, -0.16, -0.18, [
      [0, DK2],
      [0.6, DK],
      [1, PUR],
    ]),
    OL,
    LW * 0.75,
    () => {
      rayFan(
        c,
        0.0,
        0.0,
        [
          [-0.16, -0.18],
          [-0.15, -0.145],
          [-0.12, -0.095],
        ],
        rgba(PUR, 0.75),
        0.004
      );
    }
  );
  c.restore();

  // ---- eye: heavy brow, half-closed lid, red-brown iris ----
  const ex = 0.238,
    ey = -0.094 - p.open * 0.004,
    er = 0.038;
  if (p.puff) glow(c, ex - 0.02, ey + 0.07, 0.04, 0.026, 0, "255,110,150", 0.4);
  // eye bag under the eye
  c.beginPath();
  c.ellipse(ex, ey + 0.006, er * 1.18, er * 1.12, 0, Math.PI * 0.12, Math.PI * 0.82);
  c.strokeStyle = rgba(PUR, 0.9);
  c.lineWidth = 0.0055;
  c.stroke();
  eye(c, ex, ey, er, {
    iris: pal.iris || "#8a3324",
    expr: p.expr,
    ol: "#0c0416",
    sx: 1.0,
    look: 0.3,
    lookY: 0.2,
    irisR: 0.52,
    pupilR: 0.3,
    lid: 0.44,
    lidTilt: 0.3,
    lidCol: "#2f1e4e",
    lidEdge: "#0c0416",
    happyCol: "#d9ccf5",
  });
  // heavy brow ridge slanting down toward the snout
  c.beginPath();
  c.moveTo(ex - er * 1.3, ey - er * 1.02);
  c.quadraticCurveTo(ex + er * 0.1, ey - er * 1.25, ex + er * 1.55, ey - er * 0.18);
  c.strokeStyle = rgba(PUR, 0.95);
  c.lineWidth = 0.0085;
  c.stroke();
  c.beginPath();
  c.moveTo(ex - er * 1.2, ey - er * 0.82);
  c.quadraticCurveTo(ex + er * 0.1, ey - er * 1.02, ex + er * 1.5, ey - er * 0.02);
  c.strokeStyle = "#0c0416";
  c.lineWidth = 0.007;
  c.stroke();
}

// =====================================================================================
// BRUCE — cartoon great white: chunky deep chest, pointed snout, goofy toothy grin,
// big round eye in a dark socket, tall swept dorsal, crescent tail, jagged white belly.
// Fins are the same slate-blue as the body (no black tips).
// =====================================================================================
function drawShark(c: Ctx, sp: Species, p: Pose) {
  const pal = sp.pal;
  const B = pal.body,
    D = pal.dark;
  const WHITE = pal.belly;
  const FIN = pal.fin,
    FINL = mix(FIN, "#c4d4f0", 0.36),
    FIND = mix(FIN, D, 0.5);
  const OL = rgba(pal.outline, 0.88);
  const LW = 0.0105;
  c.translate(0, -0.012);
  const s = p.wag2;

  // ---- tail: tall crescent ----
  c.save();
  c.translate(-0.272, 0.018);
  c.rotate(p.wag * 0.15);
  c.scale(1 - Math.abs(p.wag) * 0.06, 1);
  c.translate(0.272, -0.018);
  fillStroke(
    c,
    () => {
      c.moveTo(-0.25, -0.012);
      c.bezierCurveTo(-0.3, -0.055, -0.375, -0.142, -0.446, -0.216);
      c.quadraticCurveTo(-0.458, -0.2, -0.449, -0.176);
      c.lineTo(-0.437, -0.158);
      c.lineTo(-0.447, -0.14);
      c.bezierCurveTo(-0.416, -0.082, -0.376, -0.045, -0.37, -0.004);
      c.bezierCurveTo(-0.372, 0.036, -0.396, 0.082, -0.432, 0.122);
      c.bezierCurveTo(-0.39, 0.108, -0.33, 0.074, -0.256, 0.05);
    },
    lin(c, -0.27, 0, -0.45, -0.06, [
      [0, B],
      [0.5, FIN],
      [1, FIND],
    ]),
    OL,
    LW * 0.9,
    () => {
      // light edge along the leading rim of both lobes
      c.beginPath();
      c.moveTo(-0.25, -0.012);
      c.bezierCurveTo(-0.3, -0.055, -0.375, -0.142, -0.446, -0.216);
      c.strokeStyle = rgba(FINL, 0.75);
      c.lineWidth = 0.022;
      c.stroke();
      c.beginPath();
      c.moveTo(-0.432, 0.122);
      c.bezierCurveTo(-0.39, 0.108, -0.33, 0.074, -0.256, 0.05);
      c.strokeStyle = rgba(FINL, 0.5);
      c.lineWidth = 0.018;
      c.stroke();
    }
  );
  c.restore();

  // ---- far-side pectoral fin tucked cleanly behind chest (never under chin!) ----
  fillStroke(
    c,
    () => {
      c.moveTo(0.205, 0.145);
      c.bezierCurveTo(0.214, 0.192, 0.208, 0.236 + s * 0.006, 0.182, 0.262 + s * 0.008);
      c.bezierCurveTo(0.152, 0.242, 0.138, 0.202, 0.136, 0.154);
    },
    FIND,
    OL,
    LW * 0.8
  );

  // ---- dorsal fin: big swept-back triangle ----
  fillStroke(
    c,
    () => {
      c.moveTo(0.172, -0.1);
      c.bezierCurveTo(0.1, -0.148, 0.0, -0.204 + s * 0.003, -0.082, -0.222 + s * 0.004);
      c.quadraticCurveTo(-0.096, -0.212 + s * 0.004, -0.086, -0.192 + s * 0.004);
      c.bezierCurveTo(-0.06, -0.145, -0.06, -0.096, -0.044, -0.058);
      c.lineTo(0.0, -0.03);
      c.lineTo(0.14, -0.04);
    },
    lin(c, 0.06, -0.06, -0.06, -0.2, [
      [0, B],
      [0.6, FIN],
      [1, FINL],
    ]),
    OL,
    LW * 0.9,
    () => {
      c.beginPath();
      c.moveTo(0.172, -0.1);
      c.bezierCurveTo(0.1, -0.148, 0.0, -0.204, -0.082, -0.222);
      c.strokeStyle = rgba(FINL, 0.8);
      c.lineWidth = 0.02;
      c.stroke();
    }
  );
  // ---- second dorsal ----
  fillStroke(
    c,
    () => {
      c.moveTo(-0.128, -0.036);
      c.bezierCurveTo(-0.156, -0.06, -0.188, -0.066, -0.218, -0.056);
      c.quadraticCurveTo(-0.202, -0.042, -0.2, -0.016);
      c.lineTo(-0.13, -0.006);
    },
    lin(c, -0.14, -0.02, -0.21, -0.06, [
      [0, B],
      [1, FINL],
    ]),
    OL,
    LW * 0.8
  );
  // ---- pelvic + anal fins (pale, like the belly) ----
  const PALE = mix(WHITE, B, 0.22);
  fillStroke(
    c,
    () => {
      c.moveTo(-0.162, 0.1);
      c.bezierCurveTo(-0.186, 0.124, -0.212, 0.136, -0.24, 0.132 - s * 0.004);
      c.quadraticCurveTo(-0.228, 0.106, -0.215, 0.068);
    },
    PALE,
    OL,
    LW * 0.8
  );

  // ---- mouth geometry: wide forward-projecting lower jaw & lifted upper jaw (clean & clear!) ----
  const gape = p.open;
  const headLift = p.puff ? 0 : gape * 0.072;
  const Cx = 0.206 - gape * 0.014,
    Cy = 0.044 - gape * 0.008;
  const baseAng = 0.14;
  // Upper jaw pitches cleanly upward as mouth opens wide
  const ua = baseAng - (p.puff ? 0 : 0.05 + gape * 0.44);
  const ul = 0.186 + gape * 0.016;
  const Ux = Cx + Math.cos(ua) * ul,
    Uy = Cy + Math.sin(ua) * ul;
  // Lower jaw projects cleanly forward & down (stays forward of pectoral fin, never collapses vertically!)
  const la = baseAng + (p.puff ? 0.06 : 0.14 + gape * 0.56);
  const ll = 0.162 + gape * 0.016;
  const Lx = Cx + Math.cos(la) * ll,
    Ly = Cy + Math.sin(la) * ll;

  // Curved jaw mid-control points so mouth forms an expressive curved arch
  const Ucx = (Cx + Ux) * 0.5 - Math.sin(ua) * (0.01 + gape * 0.01),
    Ucy = (Cy + Uy) * 0.5 + Math.cos(ua) * (0.008 + gape * 0.008);
  const Lcx = (Cx + Lx) * 0.5 + Math.sin(la) * (0.012 + gape * 0.012),
    Lcy = (Cy + Ly) * 0.5 - Math.cos(la) * (0.008 + gape * 0.01);

  // mouth interior (deep maroon throat + pink tongue & clean gum rim)
  const mouthPoly = () => {
    c.moveTo(Ux, Uy);
    c.quadraticCurveTo(Ucx, Ucy, Cx - 0.014, Cy);
    c.quadraticCurveTo(Cx - 0.024, Cy + 0.012, Cx - 0.012, Cy + 0.024);
    c.quadraticCurveTo(Lcx, Lcy, Lx, Ly);
    c.quadraticCurveTo((Ux + Lx) * 0.5 - 0.016, (Uy + Ly) * 0.5, Ux, Uy);
  };
  c.beginPath();
  mouthPoly();
  c.closePath();
  c.fillStyle = lin(c, Cx - 0.02, Cy, (Ux + Lx) * 0.5, (Uy + Ly) * 0.5, [
    [0, "#3b1019"],
    [0.55, "#6b2633"],
    [1, "#8c464f"],
  ]);
  c.fill();
  c.save();
  c.clip();
  // soft tongue inside lower jaw
  c.fillStyle = "#d96b7e";
  blob(c, Cx + Math.cos(la - 0.16) * ll * 0.52, Cy + Math.sin(la - 0.16) * ll * 0.52, 0.044 + gape * 0.012, 0.015 + gape * 0.007, la - 0.12);
  // pink gums along both curved jaw arches
  c.strokeStyle = "#f2a4ae";
  c.lineWidth = 0.013 + gape * 0.004;
  c.beginPath();
  c.moveTo(Ux, Uy);
  c.quadraticCurveTo(Ucx, Ucy, Cx - 0.01, Cy);
  c.quadraticCurveTo(Lcx, Lcy, Lx, Ly);
  c.stroke();
  c.restore();

  const body = () => {
    c.moveTo(-0.275, -0.004);
    c.bezierCurveTo(-0.2, -0.036, -0.1, -0.06, 0.0, -0.076);
    c.bezierCurveTo(0.1, -0.104, 0.2, -0.118, 0.29, -0.114 - headLift * 0.72);
    c.bezierCurveTo(0.36, -0.112 - headLift * 0.9, 0.422, -0.098 - headLift * 1.12, 0.456, -0.078 - headLift * 1.18);
    c.quadraticCurveTo(0.472, -0.062 - headLift * 1.16, 0.46, -0.044 - headLift * 1.05);
    c.bezierCurveTo(0.448, -0.014 - headLift * 0.7, 0.422, Uy - 0.012, Ux, Uy);
    c.quadraticCurveTo(Ucx, Ucy, Cx, Cy);
    c.quadraticCurveTo(Lcx, Lcy, Lx, Ly);
    // crisp pointed shark lower chin curving cleanly back into chest
    c.quadraticCurveTo(Lx - 0.014, Ly + 0.028, Lx - 0.056, Ly + 0.034);
    c.bezierCurveTo(0.245, 0.182 + gape * 0.014, 0.17, 0.205, 0.06, 0.208);
    c.bezierCurveTo(-0.02, 0.208, -0.07, 0.184, -0.1, 0.166);
    c.bezierCurveTo(-0.17, 0.118, -0.23, 0.064, -0.286, 0.038);
  };

  c.beginPath();
  body();
  c.closePath();
  c.fillStyle = lin(c, 0, -0.11, 0, 0.2, [
    [0, mix(B, D, 0.25)],
    [0.3, B],
    [0.6, mix(B, D, 0.35)],
    [1, D],
  ]);
  c.fill();
  c.save();
  c.clip();
  // satin blue sheen along the flank
  glow(c, 0.0, -0.01, 0.3, 0.07, -0.06, "150,172,214", 0.55);
  glow(c, 0.28, -0.07 - headLift * 0.6, 0.14, 0.03, 0.06 - gape * 0.18, "170,190,228", 0.5);

  // white underside with a ragged edge
  c.beginPath();
  c.moveTo(0.5, -0.065 - headLift * 1.1);
  c.lineTo(0.46, -0.056 - headLift);
  c.bezierCurveTo(0.41, -0.044 - headLift * 0.7, 0.36, -0.02 - headLift * 0.4, 0.32, 0.0);
  c.bezierCurveTo(0.28, 0.016, 0.24, 0.01, 0.215, 0.016);
  c.quadraticCurveTo(0.205, 0.036, 0.204, 0.072);
  c.lineTo(0.192, 0.058);
  c.lineTo(0.186, 0.098);
  c.lineTo(0.17, 0.076);
  c.lineTo(0.162, 0.118);
  c.quadraticCurveTo(0.1, 0.13, 0.02, 0.128);
  c.quadraticCurveTo(-0.04, 0.12, -0.076, 0.104);
  c.lineTo(-0.092, 0.082);
  c.lineTo(-0.108, 0.1);
  c.lineTo(-0.128, 0.072);
  c.lineTo(-0.146, 0.088);
  c.lineTo(-0.168, 0.058);
  c.quadraticCurveTo(-0.23, 0.036, -0.3, 0.02);
  c.lineTo(-0.3, 0.3);
  c.lineTo(0.5, 0.3);
  c.closePath();
  c.fillStyle = lin(c, 0, 0.0, 0, 0.2, [
    [0, "#ffffff"],
    [0.55, WHITE],
    [1, mix(WHITE, "#8fa2c2", 0.5)],
  ]);
  c.fill();
  // loose white flecks where the grey breaks up
  c.fillStyle = WHITE;
  for (const [fx, fy, fr, rot] of [
    [0.24, 0.022, 0.012, -1.1],
    [0.195, 0.052, 0.011, -1.2],
    [-0.1, 0.066, 0.011, -0.9],
    [-0.14, 0.056, 0.009, -0.8],
  ]) {
    c.beginPath();
    c.ellipse(fx, fy, fr, fr * 0.36, rot, 0, TAU);
    c.fill();
  }
  // gill slits
  c.strokeStyle = rgba(pal.outline, 0.5);
  c.lineWidth = 0.0048;
  for (let i = 0; i < 3; i++) {
    const gx = 0.195 - i * 0.025;
    c.beginPath();
    c.moveTo(gx + 0.008, -0.05 + i * 0.004);
    c.quadraticCurveTo(gx - 0.012, 0.0, gx + 0.004, 0.044 - i * 0.004);
    c.stroke();
  }
  // back-lit rim along the spine + belly shadow
  c.fillStyle = lin(c, 0, -0.11, 0, 0.21, [
    [0, "rgba(214,232,255,0.3)"],
    [0.14, "rgba(214,232,255,0)"],
    [0.74, "rgba(30,44,80,0)"],
    [1, "rgba(30,44,80,0.26)"],
  ]);
  c.fillRect(-0.5, -0.3, 1, 0.6);
  c.restore();
  c.beginPath();
  body();
  c.closePath();
  c.strokeStyle = OL;
  c.lineWidth = LW;
  c.stroke();

  // ---- teeth: sharp white curved rows on both jaws (clean & prominent like image 2!) ----
  const toothScale = 0.5 + gape * 0.65;
  const uToothLen = (t: number) => (0.015 + Math.sin(t * Math.PI) * 0.011 + t * 0.005) * toothScale;
  const lToothLen = (t: number) => (0.013 + Math.sin(t * Math.PI) * 0.009 + t * 0.004) * toothScale;
  curvedTeethRow(c, Cx, Cy, Ucx, Ucy, Ux, Uy, 7, 1, uToothLen, 0.1, 0.98);
  curvedTeethRow(c, Cx, Cy, Lcx, Lcy, Lx, Ly, 6, -1, lToothLen, 0.12, 0.96);

  // lips + grin crease
  c.strokeStyle = OL;
  c.lineWidth = 0.0068;
  c.beginPath();
  c.moveTo(Ux, Uy);
  c.quadraticCurveTo(Ucx, Ucy, Cx, Cy);
  c.quadraticCurveTo(Lcx, Lcy, Lx, Ly);
  c.stroke();
  c.beginPath();
  c.moveTo(Cx + 0.004, Cy + 0.002);
  c.quadraticCurveTo(Cx - 0.016, Cy - 0.004, Cx - 0.02, Cy - 0.022);
  c.lineWidth = 0.0055;
  c.stroke();
  // nostril
  c.beginPath();
  c.moveTo(0.418, -0.022 - headLift * 1.05);
  c.quadraticCurveTo(0.41, -0.014 - headLift * 1.05, 0.414, -0.004 - headLift * 1.05);
  c.strokeStyle = rgba(pal.outline, 0.75);
  c.lineWidth = 0.0055;
  c.stroke();

  // ---- near pectoral fin: broad leaf hanging down and back ----
  c.save();
  c.translate(0.17, 0.1);
  c.rotate(p.wag2 * 0.09);
  c.translate(-0.17, -0.1);
  fillStroke(
    c,
    () => {
      c.moveTo(0.222, 0.096);
      c.bezierCurveTo(0.212, 0.162, 0.172, 0.232, 0.06, 0.264);
      c.quadraticCurveTo(0.044, 0.26, 0.054, 0.238);
      c.bezierCurveTo(0.088, 0.202, 0.084, 0.16, 0.098, 0.13);
      c.bezierCurveTo(0.14, 0.104, 0.18, 0.092, 0.222, 0.096);
    },
    lin(c, 0.2, 0.09, 0.07, 0.24, [
      [0, B],
      [0.55, FIN],
      [1, FINL],
    ]),
    OL,
    LW * 0.9,
    () => {
      c.beginPath();
      c.moveTo(0.222, 0.096);
      c.bezierCurveTo(0.212, 0.162, 0.172, 0.232, 0.06, 0.264);
      c.strokeStyle = rgba(FINL, 0.85);
      c.lineWidth = 0.02;
      c.stroke();
    }
  );
  c.restore();

  // ---- eye: Nemo-style bright glossy oval eye (no dark socket disc!) ----
  const ex = 0.318,
    ey = -0.048 - headLift * 0.75,
    er = 0.038;
  if (p.puff) glow(c, ex - 0.03, ey + 0.06, 0.04, 0.024, 0, "255,110,150", 0.4);
  c.beginPath();
  c.ellipse(ex - 0.005, ey, er * 1.06, er * 1.14, 0, Math.PI * 0.55, Math.PI * 1.75);
  c.strokeStyle = rgba(D, 0.42);
  c.lineWidth = 0.006;
  c.stroke();
  eye(c, ex, ey, er, {
    iris: pal.iris || "#7a3b12",
    expr: p.expr,
    ol: rgba(pal.outline, 0.82),
    sx: 0.9,
    look: 0.34,
    irisR: 0.58,
    pupilR: 0.36,
  });
}

// =====================================================================================
// BRUCE ELEGAN — sleek straight-bodied great white modelled after reference image 2:
// streamlined torpedo silhouette, crisp white counter-shading, swept dorsal & pectoral
// fins, wide upward-tilting jaw gape with sharp curved teeth, and Nemo-style eye.
// =====================================================================================
function drawSharkSleek(c: Ctx, sp: Species, p: Pose) {
  const pal = sp.pal;
  const B = pal.body,
    D = pal.dark;
  const WHITE = pal.belly;
  const FIN = pal.fin,
    FINL = mix(FIN, "#d8e8f5", 0.4),
    FIND = mix(FIN, D, 0.45);
  const OL = rgba(pal.outline, 0.85);
  const LW = 0.0095;
  c.translate(-0.01, -0.005);
  const s = p.wag2;

  // ---- tail: sleek forked crescent shark caudal fin ----
  c.save();
  c.translate(-0.278, 0.022);
  c.rotate(p.wag * 0.15);
  c.scale(1 - Math.abs(p.wag) * 0.06, 1);
  c.translate(0.278, -0.022);
  fillStroke(
    c,
    () => {
      c.moveTo(-0.26, 0.002);
      c.bezierCurveTo(-0.31, -0.036, -0.375, -0.112, -0.434, -0.188);
      c.quadraticCurveTo(-0.442, -0.172, -0.432, -0.148);
      c.bezierCurveTo(-0.4, -0.084, -0.374, -0.036, -0.368, 0.012);
      c.bezierCurveTo(-0.372, 0.052, -0.398, 0.088, -0.436, 0.118);
      c.bezierCurveTo(-0.39, 0.104, -0.33, 0.072, -0.264, 0.044);
    },
    lin(c, -0.27, 0, -0.44, -0.04, [
      [0, B],
      [0.55, FIN],
      [1, FIND],
    ]),
    OL,
    LW * 0.85,
    () => {
      c.beginPath();
      c.moveTo(-0.26, 0.002);
      c.bezierCurveTo(-0.31, -0.036, -0.375, -0.112, -0.434, -0.188);
      c.strokeStyle = rgba(FINL, 0.72);
      c.lineWidth = 0.018;
      c.stroke();
    }
  );
  c.restore();

  // ---- far-side pectoral fin tucked cleanly behind chest (never under jaw!) ----
  fillStroke(
    c,
    () => {
      c.moveTo(0.178, 0.116);
      c.bezierCurveTo(0.184, 0.156, 0.176, 0.194 + s * 0.005, 0.152, 0.216 + s * 0.007);
      c.bezierCurveTo(0.13, 0.196, 0.122, 0.16, 0.124, 0.118);
    },
    FIND,
    OL,
    LW * 0.75
  );

  // ---- sleek swept dorsal fin ----
  fillStroke(
    c,
    () => {
      c.moveTo(0.11, -0.068);
      c.bezierCurveTo(0.055, -0.122, -0.018, -0.168 + s * 0.003, -0.086, -0.18 + s * 0.004);
      c.quadraticCurveTo(-0.094, -0.168 + s * 0.004, -0.082, -0.146 + s * 0.004);
      c.bezierCurveTo(-0.058, -0.106, -0.052, -0.072, -0.046, -0.048);
      c.lineTo(0.08, -0.044);
    },
    lin(c, 0.04, -0.05, -0.07, -0.17, [
      [0, B],
      [0.6, FIN],
      [1, FINL],
    ]),
    OL,
    LW * 0.85,
    () => {
      c.beginPath();
      c.moveTo(0.11, -0.068);
      c.bezierCurveTo(0.055, -0.122, -0.018, -0.168, -0.086, -0.18);
      c.strokeStyle = rgba(FINL, 0.75);
      c.lineWidth = 0.018;
      c.stroke();
    }
  );

  // ---- small rear anal/pelvic fin (like image 2) ----
  fillStroke(
    c,
    () => {
      c.moveTo(-0.16, 0.072);
      c.bezierCurveTo(-0.184, 0.098, -0.208, 0.112, -0.232, 0.108 - s * 0.003);
      c.quadraticCurveTo(-0.218, 0.084, -0.204, 0.054);
    },
    lin(c, -0.17, 0.06, -0.22, 0.1, [
      [0, B],
      [1, FIND],
    ]),
    OL,
    LW * 0.75
  );

  // ---- jaw geometry: sleek snout tilts up & lower jaw projects forward & down cleanly ----
  const gape = p.open;
  const headLift = p.puff ? 0 : gape * 0.088;
  const Cx = 0.198 - gape * 0.016,
    Cy = 0.036 - gape * 0.004;
  const baseAng = 0.1;
  // Upper jaw angles sharply up when open
  const ua = baseAng - (p.puff ? 0 : 0.04 + gape * 0.48);
  const ul = 0.202 + gape * 0.018;
  const Ux = Cx + Math.cos(ua) * ul,
    Uy = Cy + Math.sin(ua) * ul;
  // Lower jaw drops forward & down without collapsing into chest
  const la = baseAng + (p.puff ? 0.06 : 0.12 + gape * 0.6);
  const ll = 0.174 + gape * 0.016;
  const Lx = Cx + Math.cos(la) * ll,
    Ly = Cy + Math.sin(la) * ll;

  const Ucx = (Cx + Ux) * 0.5 - Math.sin(ua) * (0.008 + gape * 0.012),
    Ucy = (Cy + Uy) * 0.5 + Math.cos(ua) * (0.006 + gape * 0.01);
  const Lcx = (Cx + Lx) * 0.5 + Math.sin(la) * (0.01 + gape * 0.012),
    Lcy = (Cy + Ly) * 0.5 - Math.cos(la) * (0.006 + gape * 0.01);

  // mouth interior (visible when open / grinning)
  const mouthOpen = gape > 0 || !p.puff;
  if (mouthOpen) {
    c.beginPath();
    c.moveTo(Ux, Uy);
    c.quadraticCurveTo(Ucx, Ucy, Cx - 0.012, Cy);
    c.quadraticCurveTo(Cx - 0.022, Cy + 0.012, Cx - 0.01, Cy + 0.022);
    c.quadraticCurveTo(Lcx, Lcy, Lx, Ly);
    c.quadraticCurveTo((Ux + Lx) * 0.5 - 0.014, (Uy + Ly) * 0.5, Ux, Uy);
    c.closePath();
    c.fillStyle = lin(c, Cx - 0.02, Cy, (Ux + Lx) * 0.5, (Uy + Ly) * 0.5, [
      [0, "#4a242b"],
      [0.6, "#7a444a"],
      [1, "#98585d"],
    ]);
    c.fill();
    c.save();
    c.clip();
    c.fillStyle = "#d97886";
    blob(c, Cx + Math.cos(la - 0.16) * ll * 0.52, Cy + Math.sin(la - 0.16) * ll * 0.52, 0.038 + gape * 0.012, 0.013 + gape * 0.007, la - 0.12);
    c.strokeStyle = "#f2b8be";
    c.lineWidth = 0.012 + gape * 0.004;
    c.beginPath();
    c.moveTo(Ux, Uy);
    c.quadraticCurveTo(Ucx, Ucy, Cx - 0.008, Cy);
    c.quadraticCurveTo(Lcx, Lcy, Lx, Ly);
    c.stroke();
    c.restore();
  }

  // sleek straight-backed shark body silhouette
  const body = () => {
    c.moveTo(-0.285, 0.002);
    c.bezierCurveTo(-0.18, -0.024, -0.08, -0.048, 0.03, -0.068);
    c.bezierCurveTo(0.13, -0.084, 0.24, -0.09 - headLift * 0.55, 0.34, -0.084 - headLift * 0.92);
    c.bezierCurveTo(0.395, -0.08 - headLift * 1.15, 0.436, -0.072 - headLift * 1.28, 0.456, -0.056 - headLift * 1.32);
    c.quadraticCurveTo(0.468, -0.042 - headLift * 1.28, 0.452, -0.026 - headLift * 1.12);
    c.bezierCurveTo(0.436, -0.004 - headLift * 0.72, 0.415, Uy - 0.01, Ux, Uy);
    if (mouthOpen) {
      c.quadraticCurveTo(Ucx, Ucy, Cx, Cy);
      c.quadraticCurveTo(Lcx, Lcy, Lx, Ly);
    } else {
      c.lineTo(Lx, Ly);
    }
    // crisp pointed shark chin curving cleanly into straight belly line
    c.quadraticCurveTo(Lx - 0.014, Ly + 0.022, Lx - 0.05, Ly + 0.024);
    c.bezierCurveTo(0.24, 0.132 + gape * 0.016, 0.16, 0.136, 0.04, 0.136);
    c.bezierCurveTo(-0.04, 0.132, -0.1, 0.114, -0.17, 0.082);
    c.bezierCurveTo(-0.22, 0.06, -0.258, 0.044, -0.29, 0.038);
  };

  c.beginPath();
  body();
  c.closePath();
  c.fillStyle = lin(c, 0, -0.09, 0, 0.14, [
    [0, mix(B, D, 0.18)],
    [0.35, B],
    [0.75, mix(B, D, 0.28)],
    [1, D],
  ]);
  c.fill();
  c.save();
  c.clip();
  glow(c, 0.0, -0.01, 0.32, 0.05, -0.04, "180,206,228", 0.48);

  // crisp sleek white counter-shading underside (image 2 clean wave)
  c.beginPath();
  c.moveTo(0.49, -0.055 - headLift * 1.25);
  c.lineTo(0.456, -0.042 - headLift * 1.2);
  c.bezierCurveTo(0.39, -0.028 - headLift * 0.7, 0.29, -0.01 - headLift * 0.25, 0.2, 0.012);
  c.bezierCurveTo(0.14, 0.042, 0.08, 0.09, -0.02, 0.094);
  c.bezierCurveTo(-0.12, 0.096, -0.21, 0.056, -0.31, 0.03);
  c.lineTo(-0.31, 0.25);
  c.lineTo(0.5, 0.25);
  c.closePath();
  c.fillStyle = lin(c, 0, 0.0, 0, 0.14, [
    [0, "#ffffff"],
    [0.55, WHITE],
    [1, mix(WHITE, "#a8bfd4", 0.42)],
  ]);
  c.fill();

  // 3 clean curved gill slits (image 2 style)
  c.strokeStyle = rgba(pal.outline, 0.48);
  c.lineWidth = 0.0044;
  for (let i = 0; i < 3; i++) {
    const gx = 0.175 - i * 0.022;
    c.beginPath();
    c.moveTo(gx + 0.006, -0.032 + i * 0.003);
    c.quadraticCurveTo(gx - 0.01, 0.006, gx + 0.004, 0.04 - i * 0.003);
    c.stroke();
  }

  // soft top rim highlight + bottom shadow
  c.fillStyle = lin(c, 0, -0.09, 0, 0.15, [
    [0, "rgba(224,242,255,0.28)"],
    [0.16, "rgba(224,242,255,0)"],
    [0.74, "rgba(25,45,68,0)"],
    [1, "rgba(25,45,68,0.2)"],
  ]);
  c.fillRect(-0.5, -0.25, 1, 0.5);
  c.restore();

  c.beginPath();
  body();
  c.closePath();
  c.strokeStyle = OL;
  c.lineWidth = LW;
  c.stroke();

  // ---- teeth: crisp curved sharp white triangles on both upper & lower jaw (Image 2!) ----
  if (mouthOpen) {
    const toothScale = 0.36 + gape * 0.74;
    const uToothLen = (t: number) => (0.014 + Math.sin(t * Math.PI) * 0.011 + t * 0.006) * toothScale;
    const lToothLen = (t: number) => (0.012 + Math.sin(t * Math.PI) * 0.009 + t * 0.005) * toothScale;
    curvedTeethRow(c, Cx, Cy, Ucx, Ucy, Ux, Uy, 7, 1, uToothLen, 0.1, 0.98);
    curvedTeethRow(c, Cx, Cy, Lcx, Lcy, Lx, Ly, 6, -1, lToothLen, 0.12, 0.96);
  }

  // jaw line + subtle mouth corner crease
  c.strokeStyle = OL;
  c.lineWidth = 0.0062;
  c.beginPath();
  c.moveTo(Ux, Uy);
  c.quadraticCurveTo(Ucx, Ucy, Cx, Cy);
  if (mouthOpen) c.quadraticCurveTo(Lcx, Lcy, Lx, Ly);
  c.stroke();

  // nostril
  c.beginPath();
  c.moveTo(0.415, -0.025 - headLift * 1.15);
  c.quadraticCurveTo(0.408, -0.018 - headLift * 1.15, 0.412, -0.009 - headLift * 1.15);
  c.strokeStyle = rgba(pal.outline, 0.72);
  c.lineWidth = 0.005;
  c.stroke();

  // ---- near pectoral fin: sleek downward-swept shark fin (Image 2) ----
  c.save();
  c.translate(0.145, 0.068);
  c.rotate(p.wag2 * 0.09);
  c.translate(-0.145, -0.068);
  fillStroke(
    c,
    () => {
      c.moveTo(0.192, 0.068);
      c.bezierCurveTo(0.194, 0.125, 0.168, 0.19, 0.072, 0.222);
      c.quadraticCurveTo(0.056, 0.218, 0.062, 0.198);
      c.bezierCurveTo(0.088, 0.162, 0.084, 0.122, 0.096, 0.092);
      c.bezierCurveTo(0.128, 0.072, 0.162, 0.064, 0.192, 0.068);
    },
    lin(c, 0.18, 0.07, 0.07, 0.21, [
      [0, B],
      [0.55, FIN],
      [1, FINL],
    ]),
    OL,
    LW * 0.85,
    () => {
      c.beginPath();
      c.moveTo(0.192, 0.068);
      c.bezierCurveTo(0.194, 0.125, 0.168, 0.19, 0.072, 0.222);
      c.strokeStyle = rgba(FINL, 0.8);
      c.lineWidth = 0.018;
      c.stroke();
    }
  );
  c.restore();

  // ---- eye: Nemo-style bright glossy oval eye ----
  const ex = 0.288,
    ey = -0.044 - headLift * 0.78,
    er = 0.036;
  if (p.puff) glow(c, ex - 0.025, ey + 0.055, 0.038, 0.022, 0, "255,110,150", 0.4);
  c.beginPath();
  c.ellipse(ex - 0.005, ey, er * 1.06, er * 1.14, 0, Math.PI * 0.55, Math.PI * 1.75);
  c.strokeStyle = rgba(D, 0.42);
  c.lineWidth = 0.0058;
  c.stroke();
  eye(c, ex, ey, er, {
    iris: pal.iris || "#7a3b12",
    expr: p.expr,
    ol: rgba(pal.outline, 0.82),
    sx: 0.9,
    look: 0.34,
    irisR: 0.58,
    pupilR: 0.36,
  });
}

// =====================================================================================
// TOTO — leopard shark: long slender tan body, big dark-brown saddles and spots,
// brown fins, long upper tail lobe, pale almond eye with a mean little brow.
// =====================================================================================
function drawLeopard(c: Ctx, sp: Species, p: Pose) {
  const pal = sp.pal;
  const B = pal.body,
    D = pal.dark,
    BEL = pal.belly;
  const SPOT = pal.spot || "#5a2c14";
  const FIN = pal.fin,
    FINT = pal.tail || pal.fin;
  const OL = rgba(pal.outline, 0.88);
  const LW = 0.0095;
  c.translate(0, 0.004);
  const s = p.wag2;

  const finFill = (x0: number, y0: number, x1: number, y1: number, tip: string) =>
    lin(c, x0, y0, x1, y1, [
      [0, mix(B, tip, 0.35)],
      [1, tip],
    ]);
  const spots = (list: number[][]) => {
    for (const [x, y, rx, ry, rot] of list) {
      c.fillStyle = SPOT;
      blob(c, x, y, rx, ry, rot || 0);
      c.fillStyle = rgba(mix(SPOT, "#000000", 0.35), 0.45);
      blob(c, x - rx * 0.12, y + ry * 0.1, rx * 0.62, ry * 0.6, rot || 0);
    }
  };

  // ---- tail: long upper lobe, short lower lobe ----
  c.save();
  c.translate(-0.295, 0.03);
  c.rotate(p.wag * 0.17);
  c.scale(1 - Math.abs(p.wag) * 0.06, 1);
  c.translate(0.295, -0.03);
  fillStroke(
    c,
    () => {
      c.moveTo(-0.27, 0.004);
      c.bezierCurveTo(-0.33, -0.022, -0.4, -0.066, -0.456, -0.102);
      c.quadraticCurveTo(-0.466, -0.088, -0.454, -0.072);
      c.lineTo(-0.436, -0.056);
      c.lineTo(-0.446, -0.04);
      c.bezierCurveTo(-0.41, -0.012, -0.376, 0.016, -0.364, 0.04);
      c.bezierCurveTo(-0.368, 0.068, -0.378, 0.092, -0.394, 0.112);
      c.quadraticCurveTo(-0.362, 0.104, -0.336, 0.078);
      c.bezierCurveTo(-0.318, 0.064, -0.298, 0.056, -0.272, 0.052);
    },
    finFill(-0.28, 0.02, -0.45, -0.06, FINT),
    OL,
    LW * 0.85,
    () => {
      spots([
        [-0.33, 0.0, 0.018, 0.012, -0.5],
        [-0.385, -0.04, 0.016, 0.01, -0.55],
        [-0.43, -0.07, 0.012, 0.008, -0.55],
        [-0.345, 0.062, 0.012, 0.008, 0.3],
      ]);
    }
  );
  c.restore();

  // ---- first dorsal ----
  fillStroke(
    c,
    () => {
      c.moveTo(0.214, -0.058);
      c.bezierCurveTo(0.186, -0.1, 0.154, -0.146 + s * 0.003, 0.122, -0.166 + s * 0.004);
      c.quadraticCurveTo(0.108, -0.16 + s * 0.004, 0.11, -0.142 + s * 0.003);
      c.bezierCurveTo(0.104, -0.104, 0.082, -0.08, 0.05, -0.058);
      c.lineTo(0.06, -0.03);
      c.lineTo(0.2, -0.03);
    },
    finFill(0.14, -0.05, 0.12, -0.16, FIN),
    OL,
    LW * 0.85,
    () => {
      spots([
        [0.125, -0.13, 0.03, 0.022, -0.6],
        [0.15, -0.075, 0.016, 0.012, 0],
      ]);
    }
  );
  // ---- second dorsal ----
  fillStroke(
    c,
    () => {
      c.moveTo(-0.128, -0.034);
      c.bezierCurveTo(-0.146, -0.062, -0.168, -0.082 + s * 0.003, -0.19, -0.086 + s * 0.003);
      c.quadraticCurveTo(-0.198, -0.078, -0.196, -0.066);
      c.bezierCurveTo(-0.204, -0.046, -0.218, -0.03, -0.238, -0.018);
      c.lineTo(-0.14, 0.0);
    },
    finFill(-0.16, -0.03, -0.19, -0.085, FIN),
    OL,
    LW * 0.8,
    () => {
      spots([[-0.186, -0.066, 0.016, 0.011, -0.6]]);
    }
  );
  // ---- pelvic + anal fins ----
  fillStroke(
    c,
    () => {
      c.moveTo(-0.012, 0.086);
      c.bezierCurveTo(-0.03, 0.108, -0.054, 0.126, -0.082, 0.132 - s * 0.003);
      c.quadraticCurveTo(-0.08, 0.108, -0.072, 0.08);
    },
    finFill(-0.03, 0.085, -0.08, 0.13, FIN),
    OL,
    LW * 0.8
  );
  fillStroke(
    c,
    () => {
      c.moveTo(-0.158, 0.07);
      c.bezierCurveTo(-0.176, 0.09, -0.198, 0.106, -0.22, 0.108 - s * 0.003);
      c.quadraticCurveTo(-0.216, 0.088, -0.212, 0.062);
    },
    finFill(-0.17, 0.07, -0.22, 0.105, FIN),
    OL,
    LW * 0.8
  );
  // far-side pectoral
  fillStroke(
    c,
    () => {
      c.moveTo(0.3, 0.07);
      c.bezierCurveTo(0.296, 0.1, 0.282, 0.128, 0.256, 0.146 + s * 0.004);
      c.bezierCurveTo(0.244, 0.12, 0.244, 0.096, 0.25, 0.074);
    },
    mix(FIN, D, 0.45),
    OL,
    LW * 0.75
  );

  // ---- jaw: under-slung mouth (opens wider when eating!) ----
  const hx = 0.322,
    hy = 0.046,
    jl = 0.092;
  const baseAng = 0.04;
  const ua = baseAng - p.open * 0.28,
    la = baseAng + p.open * 0.88;
  const ux = hx + Math.cos(ua) * jl,
    uy = hy + Math.sin(ua) * jl;
  const lx = hx + Math.cos(la) * jl * 0.92,
    ly = hy + Math.sin(la) * jl * 0.92;
  const lift = p.open * 0.022;
  const chin = (p.puff ? 0.008 : 0) + p.open * 0.018;

  if (p.open > 0) {
    c.beginPath();
    c.moveTo(ux, uy);
    c.lineTo(hx - 0.02, hy);
    c.lineTo(lx, ly);
    c.closePath();
    c.fillStyle = "#4a0f1a";
    c.fill();
    c.save();
    c.clip();
    c.fillStyle = "#e46c80";
    blob(c, (hx + lx) / 2 + 0.008, (hy + ly) / 2 + 0.002, 0.03, 0.009, la);
    c.restore();
  }

  const body = () => {
    c.moveTo(-0.3, 0.008);
    c.bezierCurveTo(-0.2, -0.03, -0.1, -0.048, 0.0, -0.06);
    c.bezierCurveTo(0.12, -0.076, 0.25, -0.08, 0.33, -0.066 - lift);
    c.bezierCurveTo(0.39, -0.054 - lift, 0.44, -0.03 - lift, 0.453, 0.002 - lift);
    c.quadraticCurveTo(0.458, 0.024 - lift, 0.44, 0.032 - lift * 0.6);
    c.quadraticCurveTo(0.43, uy - 0.002, ux, uy);
    if (p.open > 0) {
      c.lineTo(hx, hy);
      c.lineTo(lx, ly);
    }
    c.quadraticCurveTo(lx - 0.03, ly + 0.03 + chin, 0.3, 0.09 + chin);
    c.bezierCurveTo(0.2, 0.108 + chin * 0.5, 0.05, 0.104, -0.1, 0.084);
    c.bezierCurveTo(-0.2, 0.07, -0.26, 0.058, -0.305, 0.05);
  };

  c.beginPath();
  body();
  c.closePath();
  c.fillStyle = lin(c, 0, -0.08, 0, 0.105, [
    [0, mix(B, D, 0.42)],
    [0.3, B],
    [0.62, mix(B, BEL, 0.55)],
    [0.82, BEL],
    [1, mix(BEL, D, 0.3)],
  ]);
  c.fill();
  c.save();
  c.clip();
  glow(c, 0.05, -0.02, 0.3, 0.03, -0.04, "255,246,206", 0.5);
  // big saddles across the back
  spots([
    [0.305, -0.058, 0.034, 0.026, 0.1],
    [0.212, -0.058, 0.04, 0.032, 0.05],
    [0.09, -0.052, 0.042, 0.034, 0],
    [-0.028, -0.042, 0.042, 0.032, -0.08],
    [-0.135, -0.026, 0.036, 0.028, -0.14],
    [-0.222, -0.006, 0.03, 0.022, -0.2],
    [-0.282, 0.014, 0.02, 0.016, -0.25],
  ]);
  // round spots along the flank
  spots([
    [0.26, 0.004, 0.019, 0.015, 0],
    [0.152, 0.012, 0.024, 0.018, 0],
    [0.03, 0.02, 0.022, 0.017, 0],
    [-0.08, 0.026, 0.021, 0.016, -0.1],
    [-0.178, 0.032, 0.017, 0.013, -0.15],
    [0.392, -0.04, 0.014, 0.01, 0.4],
    [0.205, 0.044, 0.011, 0.009, 0],
    [0.092, 0.052, 0.012, 0.009, 0],
    [-0.025, 0.058, 0.011, 0.008, 0],
    [-0.13, 0.058, 0.01, 0.007, 0],
    [-0.238, 0.038, 0.009, 0.007, 0],
  ]);
  // gill slits
  c.strokeStyle = rgba(pal.outline, 0.42);
  c.lineWidth = 0.004;
  for (let i = 0; i < 3; i++) {
    const gx = 0.292 - i * 0.017;
    c.beginPath();
    c.moveTo(gx + 0.004, 0.022);
    c.quadraticCurveTo(gx - 0.006, 0.042, gx + 0.002, 0.062);
    c.stroke();
  }
  c.fillStyle = lin(c, 0, -0.08, 0, 0.105, [
    [0, "rgba(255,250,226,0.32)"],
    [0.2, "rgba(255,250,226,0)"],
    [0.72, "rgba(80,48,10,0)"],
    [1, "rgba(80,48,10,0.3)"],
  ]);
  c.fillRect(-0.5, -0.2, 1, 0.4);
  c.restore();
  c.beginPath();
  body();
  c.closePath();
  c.strokeStyle = OL;
  c.lineWidth = LW;
  c.stroke();

  // ---- mouth ----
  if (p.open > 0) {
    const gap = (t: number) => Math.hypot((ux - lx) * t, (uy - ly) * t);
    const tl = (t: number) => Math.min(0.014, gap(t) * 0.45);
    teethRow(c, hx, hy, ux, uy, 6, -Math.sin(ua), Math.cos(ua), tl, 0.2, 0.98);
    teethRow(c, hx, hy, lx, ly, 5, Math.sin(la), -Math.cos(la), (t) => tl(t) * 0.9, 0.24, 0.96);
    c.strokeStyle = OL;
    c.lineWidth = 0.006;
    c.beginPath();
    c.moveTo(ux, uy);
    c.lineTo(hx, hy);
    c.lineTo(lx, ly);
    c.stroke();
  } else {
    c.strokeStyle = OL;
    c.lineWidth = 0.0065;
    c.beginPath();
    c.moveTo(ux - 0.002, uy);
    c.quadraticCurveTo(hx + 0.04, hy + 0.012, hx, hy - 0.004);
    c.stroke();
    // tiny teeth peeking out of the closed mouth
    teethRow(c, hx + 0.012, hy + 0.004, ux - 0.006, uy + 0.002, 4, 0, 1, () => 0.008, 0.1, 0.9);
  }
  // nostril
  c.fillStyle = rgba(pal.outline, 0.7);
  blob(c, 0.428, 0.004 - lift, 0.005, 0.0035, 0.5);

  // ---- near pectoral fin ----
  c.save();
  c.translate(0.235, 0.076);
  c.rotate(p.wag2 * 0.1);
  c.translate(-0.235, -0.076);
  fillStroke(
    c,
    () => {
      c.moveTo(0.268, 0.066);
      c.bezierCurveTo(0.256, 0.104, 0.224, 0.142, 0.176, 0.164);
      c.quadraticCurveTo(0.164, 0.16, 0.168, 0.148);
      c.bezierCurveTo(0.18, 0.124, 0.184, 0.1, 0.198, 0.08);
      c.quadraticCurveTo(0.232, 0.066, 0.268, 0.066);
    },
    finFill(0.25, 0.07, 0.18, 0.16, FIN),
    OL,
    LW * 0.85,
    () => {
      spots([
        [0.21, 0.118, 0.016, 0.011, -0.8],
        [0.186, 0.148, 0.011, 0.008, -0.8],
      ]);
    }
  );
  c.restore();

  // ---- eye: Nemo-style bright glossy oval eye ----
  const ex = 0.362,
    ey = -0.014 - lift,
    er = 0.029;
  if (p.puff) glow(c, ex - 0.03, ey + 0.045, 0.034, 0.018, 0, "255,110,150", 0.4);
  c.beginPath();
  c.ellipse(ex - 0.004, ey, er * 1.06, er * 1.14, 0, Math.PI * 0.55, Math.PI * 1.75);
  c.strokeStyle = rgba(D, 0.42);
  c.lineWidth = 0.0052;
  c.stroke();
  eye(c, ex, ey, er, {
    iris: "#7a3b12",
    expr: p.expr,
    ol: rgba(pal.outline, 0.8),
    sx: 0.9,
    look: 0.34,
    irisR: 0.58,
    pupilR: 0.36,
  });
}

// =====================================================================================
// BORIS — Butterflyfish matching Feeding Frenzy 2 reference (Image 1):
// continuous yellow-lime dorsal+anal wrap, soft rounded upturned snout, dark vertical
// eye band holding a neat eye, two bold royal-blue curved saddle patches, blue tail dot.
// =====================================================================================
function drawBoris(c: Ctx, sp: Species, p: Pose) {
  const pal = sp.pal;
  const B = pal.body,
    D = pal.dark,
    BEL = pal.belly;
  const FIN = pal.fin,
    FINL = mix(FIN, "#f5ff9e", 0.42),
    FIND = mix(FIN, "#729c08", 0.45);
  const BAND = pal.stripe || "#2e52b2";
  const NAVY = pal.spot || "#142258";
  const OL = rgba(pal.outline, 0.85);
  const LW = 0.0095;
  c.translate(-0.01, 0.005);
  const sw = p.wag2 * 0.008;

  // ---- tail: truncated fan fading to translucent pale yellow-white with golden rays ----
  c.save();
  c.translate(-0.225, 0.042);
  c.rotate(p.wag * 0.18);
  c.scale(1 - Math.abs(p.wag) * 0.06, 1);
  fillStroke(
    c,
    () => {
      c.moveTo(0, -0.042);
      c.bezierCurveTo(-0.048, -0.078, -0.102, -0.115, -0.146, -0.122);
      c.quadraticCurveTo(-0.162, -0.01, -0.142, 0.118);
      c.bezierCurveTo(-0.098, 0.11, -0.046, 0.075, 0, 0.044);
    },
    lin(c, 0, 0, -0.155, 0, [
      [0, FIND],
      [0.42, FIN],
      [0.82, "#f0f29a"],
      [1, "rgba(255, 255, 224, 0.85)"],
    ]),
    OL,
    LW * 0.8,
    () => {
      const pts: [number, number][] = [];
      for (let i = 0; i < 7; i++) pts.push([-0.155, -0.105 + i * 0.035]);
      rayFan(c, 0.01, 0, pts, "rgba(155, 118, 12, 0.4)", 0.0045);
      c.beginPath();
      c.moveTo(-0.146, -0.122);
      c.quadraticCurveTo(-0.162, -0.01, -0.142, 0.118);
      c.strokeStyle = "rgba(255,255,255,0.72)";
      c.lineWidth = 0.014;
      c.stroke();
    }
  );
  c.restore();

  // ---- continuous yellow-lime dorsal & anal fin wrapper hugging the tall rear body ----
  fillStroke(
    c,
    () => {
      c.moveTo(0.145, -0.18);
      c.bezierCurveTo(0.06, -0.275, -0.12, -0.315 + sw * 0.4, -0.228 + sw, -0.245 + sw * 0.4);
      c.bezierCurveTo(-0.278 + sw, -0.17, -0.285 + sw, -0.045, -0.232, 0.018);
      c.lineTo(-0.16, 0.02);
      c.lineTo(-0.16, -0.14);
      c.lineTo(0.11, -0.16);
    },
    lin(c, -0.06, -0.15, -0.22, -0.29, [
      [0, FIND],
      [0.55, FIN],
      [1, FINL],
    ]),
    OL,
    LW * 0.85,
    () => {
      const pts: [number, number][] = [
        [0.08, -0.28],
        [-0.01, -0.31],
        [-0.1, -0.305],
        [-0.18, -0.285],
        [-0.25, -0.23],
        [-0.285, -0.15],
        [-0.29, -0.06],
      ];
      rayFan(c, -0.08, -0.08, pts, "rgba(130, 150, 10, 0.36)", 0.0042);
    }
  );
  fillStroke(
    c,
    () => {
      c.moveTo(-0.045, 0.215);
      c.bezierCurveTo(-0.12, 0.272 - sw * 0.3, -0.215 + sw, 0.272 - sw * 0.3, -0.256 + sw, 0.205);
      c.bezierCurveTo(-0.28 + sw, 0.145, -0.272, 0.095, -0.228, 0.068);
      c.lineTo(-0.15, 0.08);
      c.lineTo(-0.08, 0.19);
    },
    lin(c, -0.14, 0.14, -0.24, 0.26, [
      [0, FIND],
      [0.55, FIN],
      [1, FINL],
    ]),
    OL,
    LW * 0.85,
    () => {
      const pts: [number, number][] = [
        [-0.08, 0.265],
        [-0.15, 0.275],
        [-0.22, 0.255],
        [-0.265, 0.2],
        [-0.28, 0.13],
      ];
      rayFan(c, -0.12, 0.1, pts, "rgba(130, 150, 10, 0.36)", 0.0042);
    }
  );

  // ---- small dark-rimmed pale pelvic fin under belly (matches Image 1 bottom!) ----
  c.save();
  c.translate(0.06, 0.222);
  c.rotate(-p.wag2 * 0.08);
  fillStroke(
    c,
    () => {
      c.moveTo(0.038, -0.006);
      c.bezierCurveTo(0.015, 0.048, -0.036, 0.066, -0.064, 0.046);
      c.quadraticCurveTo(-0.044, 0.008, -0.012, -0.006);
    },
    lin(c, 0.02, 0, -0.04, 0.05, [
      [0, "#dce8f4"],
      [1, "#7a8aa8"],
    ]),
    "#0f1734",
    LW * 0.95
  );
  c.restore();

  // ---- jaw geometry: soft cute rounded protruding upper snout/lip (NOT sharp beak!) ----
  const hx = 0.272,
    hy = 0.082;
  const jl = 0.096;
  const baseAng = 0.05;
  const ua = baseAng - p.open * 0.26;
  const la = baseAng + p.open * 0.82;
  const ux = hx + Math.cos(ua) * (jl * 1.06),
    uy = hy + Math.sin(ua) * (jl * 1.06);
  const lx = hx + Math.cos(la) * (jl * 0.72),
    ly = hy + Math.sin(la) * (jl * 0.72);
  const chin = (p.puff ? 0.01 : 0) + p.open * 0.016;

  if (p.open > 0) {
    c.beginPath();
    c.moveTo(ux, uy);
    c.lineTo(hx - 0.02, hy);
    c.lineTo(lx, ly);
    c.closePath();
    c.fillStyle = "#521224";
    c.fill();
    c.save();
    c.clip();
    c.fillStyle = "#eb6c8e";
    blob(c, (hx + lx) * 0.54, (hy + ly) * 0.54 + 0.004, 0.032, 0.012, la);
    c.restore();
  }

  // ---- rounded D-shaped butterflyfish body with gentle concaving forehead & blunt cute snout ----
  const body = () => {
    c.moveTo(-0.226, 0.018);
    // tall rounded rear edge rising smoothly into broad dome
    c.bezierCurveTo(-0.242, -0.105, -0.205, -0.225, -0.095, -0.242);
    c.bezierCurveTo(0.015, -0.258, 0.13, -0.215, 0.195, -0.145);
    // smooth concave forehead dip down to plump rounded upturned snout
    c.bezierCurveTo(0.245, -0.092, 0.272, -0.008 - p.open * 0.014, 0.312, 0.044 - p.open * 0.02);
    c.bezierCurveTo(0.345, 0.064 - p.open * 0.022, 0.372, uy - 0.018, ux, uy);
    if (p.open > 0) {
      c.quadraticCurveTo((ux + hx) * 0.5, uy + 0.005, hx, hy);
      c.quadraticCurveTo((hx + lx) * 0.5, ly - 0.005, lx, ly);
    } else {
      // soft rounded overhanging upper lip tucking gently under into cute little lower lip
      c.quadraticCurveTo(ux + 0.006, uy + 0.014, lx, ly + 0.01 + chin);
    }
    c.bezierCurveTo(lx - 0.028, ly + 0.044 + chin, 0.225, 0.175 + chin, 0.115, 0.222 + chin);
    c.bezierCurveTo(-0.02, 0.252, -0.16, 0.222, -0.218, 0.138);
    c.quadraticCurveTo(-0.236, 0.098, -0.226, 0.065);
  };

  c.beginPath();
  body();
  c.closePath();
  c.fillStyle = lin(c, -0.05, -0.24, 0.05, 0.24, [
    [0, mix(B, D, 0.45)],
    [0.35, "#d8f5ff"],
    [0.72, BEL],
    [1, mix(B, D, 0.42)],
  ]);
  c.fill();

  c.save();
  c.clip();
  // soft subtle blue rib lines across flank
  c.strokeStyle = rgba(D, 0.24);
  c.lineWidth = 0.0075;
  for (let i = -4; i <= 3; i++) {
    const u = i * 0.042;
    c.beginPath();
    c.moveTo(u + 0.015, -0.25);
    c.quadraticCurveTo(u - 0.028, 0.0, u + 0.01, 0.25);
    c.stroke();
  }
  // sky-blue shading over forehead & snout bridge
  glow(c, 0.27, -0.02, 0.12, 0.13, 0.2, "76,126,216", 0.55);

  // ---- vertical dark navy eye band covering eye down to throat ----
  c.fillStyle = NAVY;
  c.beginPath();
  c.moveTo(0.215, -0.24);
  c.bezierCurveTo(0.248, -0.08, 0.244, 0.08, 0.205, 0.23);
  c.lineTo(0.148, 0.23);
  c.bezierCurveTo(0.185, 0.07, 0.185, -0.09, 0.158, -0.24);
  c.closePath();
  c.fill();

  // ---- front S-curved royal-blue saddle patch (exact Image 1!) ----
  const drawPatch = (build: () => void) => {
    c.beginPath();
    build();
    c.closePath();
    c.fillStyle = lin(c, 0, -0.2, 0, 0.15, [
      [0, mix(BAND, "#4f7be6", 0.2)],
      [0.5, BAND],
      [1, mix(BAND, NAVY, 0.28)],
    ]);
    c.fill();
    c.strokeStyle = NAVY;
    c.lineWidth = 0.0085;
    c.stroke();
  };
  drawPatch(() => {
    c.moveTo(0.118, -0.225);
    c.bezierCurveTo(0.145, -0.15, 0.085, -0.08, 0.092, 0.005);
    c.bezierCurveTo(0.1, 0.09, 0.092, 0.165, 0.045, 0.172);
    c.bezierCurveTo(-0.005, 0.175, 0.015, 0.085, 0.01, 0.005);
    c.bezierCurveTo(0.005, -0.075, -0.045, -0.15, 0.0, -0.232);
  });
  // ---- rear plump royal-blue saddle patch (exact Image 1!) ----
  drawPatch(() => {
    c.moveTo(-0.045, -0.22);
    c.bezierCurveTo(-0.015, -0.13, -0.045, -0.03, -0.032, 0.065);
    c.bezierCurveTo(-0.02, 0.15, -0.085, 0.19, -0.145, 0.165);
    c.bezierCurveTo(-0.205, 0.14, -0.215, 0.01, -0.195, -0.115);
    c.bezierCurveTo(-0.18, -0.205, -0.095, -0.245, -0.045, -0.22);
  });

  // 3D body volume highlight + bottom rim
  glow(c, -0.02, -0.05, 0.16, 0.12, -0.2, "255,255,255", 0.34);
  c.fillStyle = lin(c, 0, -0.25, 0, 0.24, [
    [0, "rgba(255,255,255,0.22)"],
    [0.2, "rgba(255,255,255,0)"],
    [0.75, "rgba(10,20,55,0)"],
    [1, "rgba(10,20,55,0.28)"],
  ]);
  c.fillRect(-0.3, -0.3, 0.8, 0.6);
  c.restore();

  c.beginPath();
  body();
  c.closePath();
  c.strokeStyle = OL;
  c.lineWidth = LW;
  c.stroke();

  // ---- smiling/pouting mouth seam ----
  c.strokeStyle = OL;
  c.lineWidth = 0.007;
  if (p.open > 0) {
    c.beginPath();
    c.moveTo(ux, uy);
    c.lineTo(hx, hy);
    c.lineTo(lx, ly);
    c.stroke();
  } else {
    c.beginPath();
    c.moveTo(lx + 0.003, ly + 0.004);
    c.quadraticCurveTo((lx + hx) * 0.5, hy + 0.016, hx, hy);
    c.stroke();
  }

  // ---- big royal-blue spot at tail peduncle (exact Image 1!) ----
  c.beginPath();
  c.arc(-0.222, 0.042, 0.036, 0, TAU);
  c.fillStyle = "#0e32ba";
  c.fill();
  c.strokeStyle = NAVY;
  c.lineWidth = 0.008;
  c.stroke();
  glow(c, -0.228, 0.032, 0.012, 0.009, 0, "140,200,255", 0.6);

  // ---- soft translucent pale cheek/pectoral fin (Image 1) ----
  c.save();
  c.translate(0.118, 0.118);
  c.rotate(-0.2 + p.wag2 * 0.14);
  fillStroke(
    c,
    () => {
      c.moveTo(0, -0.012);
      c.bezierCurveTo(-0.038, -0.042, -0.095, -0.02, -0.088, 0.018);
      c.bezierCurveTo(-0.075, 0.048, -0.028, 0.042, 0, 0.014);
    },
    lin(c, 0, 0, -0.09, 0, [
      [0, "rgba(210, 234, 248, 0.72)"],
      [1, "rgba(255, 255, 255, 0.88)"],
    ]),
    rgba(pal.outline, 0.45),
    LW * 0.65
  );
  c.restore();

  // ---- eye: neatly nestled inside the dark navy vertical eye band (Image 1!) ----
  const ex = 0.214,
    ey = 0.002 - p.open * 0.006,
    er = 0.035;
  if (p.puff) glow(c, ex - 0.025, ey + 0.055, 0.036, 0.022, 0, "255,110,150", 0.42);
  eye(c, ex, ey, er, {
    iris: pal.iris || "#1e3a78",
    expr: p.expr,
    ol: "#080f28",
    sx: 0.88,
    look: 0.28,
    irisR: 0.56,
    pupilR: 0.35,
    happyCol: "#e6f2ff",
  });
}

// =====================================================================================
// ANDY & RYAN — Angelfish matching Feeding Frenzy 1 reference:
// plump curved body, seamless swept-back dorsal peak with low ridge, rounded pouting
// lips with protruding upper snout, upward-sweeping U/J neon stripes, rounded golden
// anal fin, creamy crescent tail & larger glossy 3D oval eye nestled inside the head.
// =====================================================================================
function drawAndy(c: Ctx, sp: Species, p: Pose) {
  const pal = sp.pal;
  const B = pal.body,
    D = pal.dark,
    BEL = pal.belly;
  const FIN = pal.fin,
    TAIL = pal.tail || "#fff6cc";
  const STR = pal.stripe || "#df22ff";
  const OL = rgba(pal.outline, 0.88);
  const LW = 0.009;
  c.translate(-0.02, 0.0);
  const sw = p.wag2 * 0.007;

  const [dr, dg, db] = hexRgb(D);
  const [br, bg, bb] = hexRgb(mix(BEL, "#fff066", 0.35));

  // ---- 1. Crisp cream-gold triangular fan tail (exact Gambar 4!) ----
  c.save();
  c.translate(-0.225, 0.0);
  c.rotate(p.wag * 0.2);
  c.scale(1 - Math.abs(p.wag) * 0.06, 1);
  fillStroke(
    c,
    () => {
      c.moveTo(0, -0.026);
      c.bezierCurveTo(-0.048, -0.058, -0.106, -0.106, -0.168, -0.124);
      c.quadraticCurveTo(-0.146, -0.002, -0.156, 0.116);
      c.bezierCurveTo(-0.098, 0.098, -0.046, 0.056, 0, 0.026);
    },
    lin(c, 0, 0, -0.165, 0, [
      [0, mix(D, BEL, 0.38)],
      [0.24, mix(BEL, TAIL, 0.68)],
      [0.62, TAIL],
      [1, "#ffffff"],
    ]),
    OL,
    LW * 0.85,
    () => {
      const pts: [number, number][] = [];
      for (let i = 0; i < 7; i++) pts.push([-0.152, -0.102 + i * 0.034]);
      rayFan(c, 0.01, 0, pts, rgba(BEL, 0.32), 0.0036);
    }
  );
  c.restore();

  // ---- 2. Low scalloped dorsal fin ridge along upper crown (Gambar 4) ----
  fillStroke(
    c,
    () => {
      c.moveTo(0.065, -0.244);
      c.bezierCurveTo(-0.015, -0.326, -0.125 + sw * 0.4, -0.372 + sw * 0.3, -0.205 + sw * 0.7, -0.362 + sw * 0.3);
      c.lineTo(-0.185 + sw * 0.4, -0.335 + sw * 0.3);
      c.lineTo(-0.228 + sw, -0.342 + sw * 0.3);
      c.lineTo(-0.08, -0.25);
    },
    lin(c, -0.04, -0.25, -0.16, -0.37, [
      [0, mix(D, B, 0.2)],
      [0.6, D],
      [1, mix(D, pal.outline, 0.48)],
    ]),
    OL,
    LW * 0.78,
    () => {
      const pts: [number, number][] = [
        [0.015, -0.296],
        [-0.045, -0.336],
        [-0.1, -0.358],
        [-0.16, -0.365],
      ];
      rayFan(c, -0.05, -0.26, pts, rgba(pal.outline, 0.38), 0.0035);
    }
  );

  // ---- 3. Swept translucent rounded-tip anal fin with transverse bands (Gambar 4) ----
  fillStroke(
    c,
    () => {
      c.moveTo(-0.025, 0.212);
      c.bezierCurveTo(-0.06, 0.3, -0.122 + sw * 0.4, 0.366 - sw * 0.3, -0.184 + sw * 0.8, 0.354 - sw * 0.3);
      c.bezierCurveTo(-0.228, 0.332, -0.232, 0.205, -0.21, 0.088);
      c.lineTo(-0.11, 0.16);
    },
    lin(c, -0.09, 0.18, -0.18, 0.36, [
      [0, mix(BEL, FIN, 0.4)],
      [0.55, mix(FIN, BEL, 0.4)],
      [1, mix(FIN, D, 0.28)],
    ]),
    OL,
    LW * 0.85,
    () => {
      const pts: [number, number][] = [
        [-0.07, 0.318],
        [-0.118, 0.352],
        [-0.168, 0.356],
        [-0.208, 0.31],
        [-0.224, 0.206],
      ];
      rayFan(c, -0.07, 0.18, pts, rgba(D, 0.36), 0.0044);
      c.strokeStyle = rgba(STR, 0.38);
      c.lineWidth = 0.012;
      c.beginPath();
      c.moveTo(-0.045, 0.244);
      c.quadraticCurveTo(-0.132, 0.266, -0.215, 0.194);
      c.stroke();
      c.beginPath();
      c.moveTo(-0.082, 0.314);
      c.quadraticCurveTo(-0.152, 0.324, -0.22, 0.264);
      c.stroke();
    }
  );

  // ---- 4. Protruding Beaked Snout & Always-Clean Open-Shape Lips (Gambar 4!) ----
  const hx = 0.265,
    hy = 0.002;
  const openAmt = 0.18 + p.open * 0.82; // slight expressive Gambar-4 mouth gap even when idle!
  const ux = hx + 0.098 - p.open * 0.008,
    uy = hy - 0.024 - p.open * 0.036;
  const lx = hx + 0.092 - p.open * 0.012,
    ly = hy + 0.014 + p.open * 0.068;
  const chin = (p.puff ? 0.01 : 0) + p.open * 0.016;

  // Crimson inner mouth cavity (always cleanly framed between the protruding upper & lower beak lips!)
  c.beginPath();
  c.moveTo(ux - 0.004, uy + 0.006);
  c.lineTo(hx - 0.018, hy);
  c.lineTo(lx - 0.004, ly - 0.004);
  c.closePath();
  c.fillStyle = "#5c0f1d";
  c.fill();
  c.save();
  c.clip();
  c.fillStyle = "#e65b78";
  blob(c, (hx + lx) * 0.52, (hy + ly) * 0.52 + 0.003, 0.032, 0.012, openAmt * 0.45);
  c.restore();

  // ---- 5. Sweeping Angelfish Body Silhouette (exact Gambar 4 curve!) ----
  const body = () => {
    c.moveTo(-0.228, -0.026);
    // Graceful concave rear back sweeping up-left to sharp dorsal tip
    c.bezierCurveTo(-0.214, -0.112, -0.168, -0.194, -0.238 + sw, -0.344 + sw * 0.35);
    // Full arched crown sweeping forward over eye down to nose-bridge dip
    c.bezierCurveTo(-0.1, -0.352, 0.055, -0.312, 0.165, -0.205);
    c.bezierCurveTo(0.215, -0.155, 0.252, -0.105, 0.278, -0.075);
    // Concave dip at nose bridge then protruding rounded upper snout beak!
    c.bezierCurveTo(0.305, -0.062, 0.338, -0.052, ux, uy);
    // Crisp parted upper lip inside mouth corner -> lower lip protruding forward
    c.quadraticCurveTo(ux - 0.006, uy + 0.01, (ux + hx) * 0.52, uy + 0.008);
    c.quadraticCurveTo(hx, hy, (hx + lx) * 0.52, ly - 0.005);
    c.quadraticCurveTo(lx + 0.004, ly - 0.002, lx, ly);
    // Sculpted lower chin sweeping down smoothly around full belly back to peduncle
    c.bezierCurveTo(lx - 0.022, ly + 0.024 + chin, 0.268, 0.095 + chin, 0.186, 0.17 + chin);
    c.bezierCurveTo(0.104, 0.242 + chin * 0.6, -0.014, 0.27 + chin * 0.3, -0.112, 0.234);
    c.bezierCurveTo(-0.18, 0.206, -0.214, 0.132, -0.228, 0.03);
  };

  c.beginPath();
  body();
  c.closePath();
  c.fillStyle = lin(c, -0.04, -0.26, 0.28, 0.16, [
    [0, mix(B, BEL, 0.5)],
    [0.36, BEL],
    [0.72, B],
    [1, D],
  ]);
  c.fill();

  c.save();
  c.clip();
  // Warm bright body center & deeper snout/forehead shading
  glow(c, -0.02, -0.06, 0.18, 0.155, -0.25, `${br},${bg},${bb}`, 0.65);
  glow(c, 0.27, 0.01, 0.145, 0.155, 0.25, `${Math.round(dr * 0.68)},${Math.round(dg * 0.52)},${Math.round(db * 0.45)}`, 0.52);
  glow(c, -0.21, -0.32, 0.08, 0.07, -0.4, `${Math.round(dr * 0.72)},${Math.round(dg * 0.48)},${Math.round(db * 0.42)}`, 0.46);

  // ---- 6. Five Bold Flowing Magenta/Cyan Stripes (exact Gambar 4 sweep!) ----
  const drawS = (pts: [number, number, number, number, number, number, number, number], w: number) => {
    c.beginPath();
    c.moveTo(pts[0], pts[1]);
    c.bezierCurveTo(pts[2], pts[3], pts[4], pts[5], pts[6], pts[7]);
    c.strokeStyle = rgba(D, 0.38);
    c.lineWidth = w * 1.62;
    c.stroke();
    c.strokeStyle = rgba(STR, 0.44);
    c.lineWidth = w * 1.28;
    c.stroke();
    c.strokeStyle = STR;
    c.lineWidth = w;
    c.stroke();
    c.strokeStyle = rgba(mix(STR, "#ffffff", 0.48), 0.7);
    c.lineWidth = w * 0.34;
    c.stroke();
  };
  // 1. Snout-bridge -> across cheek -> swept upper back arc
  drawS([0.302, -0.056, 0.228, -0.095, 0.172, -0.092, 0.135, -0.104], 0.013);
  // 2. Eye-front -> upper brow -> tall dorsal peak
  drawS([0.138, -0.104, 0.035, -0.118, -0.075, -0.182, -0.205 + sw * 0.7, -0.33], 0.019);
  // 3. Gill cheek -> sweeping golden center belly curve -> dorsal peak
  drawS([0.275, -0.018, 0.135, 0.032, -0.055, 0.038, -0.22 + sw * 0.8, -0.326], 0.022);
  // 4. Lower chest -> deep belly U-sweep -> upper rear flank
  drawS([0.115, 0.088, -0.015, 0.128, -0.12, 0.028, -0.206 + sw * 0.5, -0.268], 0.022);
  // 5. Bottom belly curve -> rear flank
  drawS([0.045, 0.176, -0.068, 0.192, -0.152, 0.095, -0.216, -0.105], 0.02);
  // 6. Small lower curl near anal fin
  drawS([-0.068, 0.224, -0.125, 0.214, -0.165, 0.168, -0.196, 0.112], 0.015);

  // Signature small brow ocellus ring above eye (Gambar 4!)
  c.beginPath();
  c.ellipse(0.164, -0.146, 0.016, 0.021, 0.15, 0, TAU);
  c.fillStyle = rgba(D, 0.3);
  c.fill();
  c.strokeStyle = rgba(D, 0.62);
  c.lineWidth = 0.0052;
  c.stroke();

  // Crisp golden gill cover crease behind eye
  c.strokeStyle = rgba(mix(BEL, "#fff4c8", 0.68), 0.74);
  c.lineWidth = 0.0082;
  c.beginPath();
  c.moveTo(0.158, -0.078);
  c.bezierCurveTo(0.126, -0.002, 0.144, 0.066, 0.198, 0.095);
  c.stroke();
  c.strokeStyle = rgba(D, 0.48);
  c.lineWidth = 0.004;
  c.beginPath();
  c.moveTo(0.152, -0.078);
  c.bezierCurveTo(0.12, -0.002, 0.138, 0.066, 0.192, 0.095);
  c.stroke();

  // Upper beak lip glossy highlight
  glow(c, ux - 0.018, uy - 0.006, 0.02, 0.009, -0.2, "255,240,210", 0.42);

  // 3D dorsal highlight & lower belly shadow
  c.fillStyle = lin(c, -0.08, -0.32, 0.12, 0.26, [
    [0, "rgba(255,250,220,0.22)"],
    [0.18, "rgba(255,250,220,0)"],
    [0.74, "rgba(45,10,5,0)"],
    [1, "rgba(45,10,5,0.34)"],
  ]);
  c.fillRect(-0.32, -0.38, 0.78, 0.74);
  c.restore();

  // Body ink outline
  c.beginPath();
  body();
  c.closePath();
  c.strokeStyle = OL;
  c.lineWidth = LW;
  c.stroke();

  // Crisp open mouth lip rim accent
  c.strokeStyle = OL;
  c.lineWidth = 0.0068;
  c.beginPath();
  c.moveTo(ux - 0.004, uy + 0.005);
  c.lineTo(hx, hy);
  c.lineTo(lx - 0.003, ly - 0.002);
  c.stroke();

  // ---- 7. Small warm translucent pectoral fin tucked behind gill crease ----
  c.save();
  c.translate(0.114, 0.074);
  c.rotate(-0.22 + p.wag2 * 0.14);
  fillStroke(
    c,
    () => {
      c.moveTo(0, -0.01);
      c.bezierCurveTo(-0.036, -0.042, -0.082, -0.018, -0.074, 0.022);
      c.bezierCurveTo(-0.058, 0.052, -0.016, 0.042, 0, 0.014);
    },
    lin(c, 0, 0, -0.08, 0.02, [
      [0, rgba(D, 0.82)],
      [1, rgba(FIN, 0.65)],
    ]),
    rgba(pal.outline, 0.58),
    LW * 0.68
  );
  c.restore();

  // ---- 8. Large Bright Expressive Glossy Eye (Gambar 4!) ----
  const ex = 0.224,
    ey = -0.068 - p.open * 0.006,
    er = 0.05;
  if (p.puff) glow(c, ex - 0.02, ey + 0.062, 0.038, 0.024, 0, "255,110,150", 0.45);
  c.beginPath();
  c.ellipse(ex - 0.004, ey, er * 0.96, er * 1.12, -0.14, Math.PI * 0.55, Math.PI * 1.72);
  c.strokeStyle = rgba(D, 0.56);
  c.lineWidth = 0.0065;
  c.stroke();
  eye(c, ex, ey, er, {
    iris: pal.iris || "#3a1c08",
    expr: p.expr,
    ol: OL,
    sx: 0.86,
    look: 0.26,
    irisR: 0.58,
    pupilR: 0.36,
    tilt: -0.14,
  });
}

// =====================================================================================
// DORI — Regal Blue Tang matching Image 2 (Pixar Dory):
// high arched royal-blue oval disc, steep rounded forehead, protruding cute rounded
// blue nose & wide happy smiling mouth, curved black palette saddle with electric-blue
// oval window, bright yellow wedge tail with black top/bottom edges & swept wing fin!
// =====================================================================================
function drawTang(c: Ctx, sp: Species, p: Pose) {
  const pal = sp.pal;
  const B = "#1b6cff",
    BD = "#0d35b8",
    BL = "#4ca8ff";
  const BLK = "#0b1022";
  const YEL = pal.tail || "#ffe02a";
  const OL = rgba(pal.outline || "#07174a", 0.86);
  const LW = 0.0095;
  c.translate(-0.01, 0.008);
  const sw = p.wag2 * 0.007;

  // ---- tail: bright yellow wedge fan bordered along top & bottom by black ----
  c.save();
  c.translate(-0.228, -0.015);
  c.rotate(p.wag * 0.2);
  c.scale(1 - Math.abs(p.wag) * 0.05, 1);
  fillStroke(
    c,
    () => {
      c.moveTo(0.02, -0.032);
      c.bezierCurveTo(-0.045, -0.068, -0.115, -0.104, -0.185, -0.122);
      c.quadraticCurveTo(-0.172, 0.0, -0.182, 0.118);
      c.bezierCurveTo(-0.11, 0.1, -0.042, 0.064, 0.02, 0.032);
    },
    lin(c, 0.02, 0, -0.18, 0, [
      [0, "#d8a212"],
      [0.45, YEL],
      [1, "#fff268"],
    ]),
    OL,
    LW * 0.82,
    () => {
      const pts: [number, number][] = [];
      for (let i = 0; i < 6; i++) pts.push([-0.18, -0.09 + i * 0.036]);
      rayFan(c, 0.02, 0, pts, "rgba(170, 110, 10, 0.34)", 0.0038);
      // Black upper & lower borders (characteristic Regal Tang tail wedge)
      c.strokeStyle = BLK;
      c.lineWidth = 0.024;
      c.beginPath();
      c.moveTo(0.02, -0.034);
      c.bezierCurveTo(-0.045, -0.068, -0.115, -0.104, -0.19, -0.122);
      c.stroke();
      c.beginPath();
      c.moveTo(0.02, 0.034);
      c.bezierCurveTo(-0.042, 0.064, -0.11, 0.1, -0.19, 0.118);
      c.stroke();
    }
  );
  c.restore();

  // ---- low continuous royal-blue dorsal & anal ridge hugging body ----
  fillStroke(
    c,
    () => {
      c.moveTo(0.205, -0.19);
      c.bezierCurveTo(0.11, -0.292, -0.08, -0.305 + sw * 0.4, -0.22 + sw * 0.7, -0.185 + sw * 0.3);
      c.quadraticCurveTo(-0.245, -0.11, -0.22, -0.048);
      c.lineTo(-0.08, -0.12);
    },
    lin(c, 0.0, -0.18, -0.06, -0.3, [
      [0, BD],
      [0.6, B],
      [1, BL],
    ]),
    OL,
    LW * 0.8,
    () => {
      const pts: [number, number][] = [];
      for (let i = 0; i < 10; i++) pts.push([0.16 - i * 0.042, -0.29 + Math.abs(i - 4) * 0.012]);
      rayFan(c, -0.02, -0.12, pts, "rgba(8, 22, 80, 0.35)", 0.0038);
    }
  );
  fillStroke(
    c,
    () => {
      c.moveTo(0.03, 0.228);
      c.bezierCurveTo(-0.06, 0.278 - sw * 0.3, -0.175 + sw * 0.5, 0.248 - sw * 0.3, -0.225 + sw * 0.7, 0.142);
      c.quadraticCurveTo(-0.238, 0.085, -0.218, 0.04);
      c.lineTo(-0.08, 0.13);
    },
    lin(c, -0.06, 0.16, -0.12, 0.27, [
      [0, BD],
      [0.65, B],
      [1, BL],
    ]),
    OL,
    LW * 0.8,
    () => {
      const pts: [number, number][] = [];
      for (let i = 0; i < 8; i++) pts.push([0.0 - i * 0.032, 0.27 - i * 0.01]);
      rayFan(c, -0.08, 0.12, pts, "rgba(8, 22, 80, 0.35)", 0.0038);
    }
  );

  // ---- jaw geometry: joyful wide smiling mouth with cute protruding blue nose ----
  const hx = 0.228,
    hy = 0.056;
  const jl = 0.112;
  const baseAng = 0.1;
  const ua = baseAng - 0.12 - p.open * 0.24;
  const la = baseAng + 0.14 + p.open * 0.88;
  const ux = hx + Math.cos(ua) * (jl * 1.04),
    uy = hy + Math.sin(ua) * (jl * 1.04);
  const lx = hx + Math.cos(la) * (jl * 0.88),
    ly = hy + Math.sin(la) * (jl * 0.88);
  const chin = (p.puff ? 0.01 : 0) + p.open * 0.022;

  if (p.open > 0) {
    c.beginPath();
    c.moveTo(ux - 0.006, uy + 0.005);
    c.lineTo(hx - 0.025, hy - 0.008);
    c.lineTo(lx - 0.006, ly - 0.004);
    c.closePath();
    c.fillStyle = "#220a38";
    c.fill();
    c.save();
    c.clip();
    c.fillStyle = "#c9629c";
    blob(c, (hx + lx) * 0.54, (hy + ly) * 0.54 + 0.005, 0.036, 0.013, la);
    c.restore();
  }

  // ---- Image 2 Dory body silhouette: tall rounded dome, steep nose bridge, happy chin ----
  const body = () => {
    c.moveTo(-0.225, -0.042);
    c.bezierCurveTo(-0.205, -0.16, -0.1, -0.255, 0.055, -0.258);
    // steep rounded forehead & brow curve
    c.bezierCurveTo(0.185, -0.258, 0.275, -0.195, 0.305, -0.115 - p.open * 0.01);
    // cute steep nose bridge down to protruding rounded nose tip
    c.bezierCurveTo(0.326, -0.045, 0.352, uy - 0.032, ux, uy);
    if (p.open > 0) {
      c.quadraticCurveTo((ux + hx) * 0.5, uy + 0.008, hx, hy);
      c.quadraticCurveTo((hx + lx) * 0.5, ly - 0.006, lx, ly);
    } else {
      // cute happy Dory smiling nose & lower lip tuck
      c.quadraticCurveTo(ux + 0.008, uy + 0.018, lx, ly + 0.008 + chin);
    }
    // plump rounded chin curving smoothly into deep rounded belly
    c.bezierCurveTo(lx - 0.015, ly + 0.042 + chin, 0.255, 0.198 + chin, 0.135, 0.236 + chin * 0.6);
    c.bezierCurveTo(0.01, 0.268, -0.13, 0.215, -0.202, 0.105);
    c.quadraticCurveTo(-0.225, 0.062, -0.225, 0.025);
  };

  c.beginPath();
  body();
  c.closePath();
  c.fillStyle = lin(c, 0.1, -0.26, -0.08, 0.25, [
    [0, BL],
    [0.45, B],
    [0.85, BD],
    [1, "#09268a"],
  ]);
  c.fill();

  c.save();
  c.clip();
  glow(c, 0.22, 0.02, 0.16, 0.16, 0.1, "90,190,255", 0.5);

  // ---- iconic Regal Blue Tang black palette saddle (Image 2!) ----
  c.fillStyle = BLK;
  c.beginPath();
  c.moveTo(0.225, -0.165);
  c.bezierCurveTo(0.145, -0.258, -0.08, -0.275, -0.24, -0.055);
  c.lineTo(-0.24, 0.038);
  c.bezierCurveTo(-0.15, 0.065, -0.095, 0.135, -0.005, 0.132);
  c.bezierCurveTo(0.075, 0.128, 0.105, 0.055, 0.055, -0.005);
  c.bezierCurveTo(0.005, -0.062, 0.075, -0.145, 0.225, -0.165);
  c.closePath();
  c.fill();

  // Signature electric-blue oval window inside the black palette (Image 2!)
  c.fillStyle = lin(c, -0.09, -0.04, -0.02, 0.06, [
    [0, BL],
    [1, B],
  ]);
  c.beginPath();
  c.ellipse(-0.055, -0.008, 0.078, 0.048, -0.14, 0, TAU);
  c.fill();

  // Yellow triangle root leading cleanly into the yellow wedge tail (Image 2!)
  c.fillStyle = YEL;
  c.beginPath();
  c.moveTo(-0.125, -0.005);
  c.lineTo(-0.24, -0.042);
  c.lineTo(-0.24, 0.036);
  c.closePath();
  c.fill();

  // Subtle 3D shading & specular face glow
  c.fillStyle = lin(c, 0, -0.26, 0, 0.26, [
    [0, "rgba(185,235,255,0.22)"],
    [0.2, "rgba(185,235,255,0)"],
    [0.74, "rgba(5,12,48,0)"],
    [1, "rgba(5,12,48,0.34)"],
  ]);
  c.fillRect(-0.3, -0.32, 0.72, 0.65);
  c.restore();

  c.beginPath();
  body();
  c.closePath();
  c.strokeStyle = OL;
  c.lineWidth = LW;
  c.stroke();

  // ---- happy smiling cheek line ----
  c.strokeStyle = OL;
  c.lineWidth = 0.0072;
  if (p.open > 0) {
    c.beginPath();
    c.moveTo(ux - 0.004, uy + 0.005);
    c.lineTo(hx, hy);
    c.lineTo(lx - 0.004, ly - 0.002);
    c.stroke();
  } else {
    c.beginPath();
    c.moveTo(lx + 0.005, ly + 0.004);
    c.quadraticCurveTo((lx + hx) * 0.52, hy + 0.022, hx - 0.008, hy - 0.012);
    c.stroke();
    // cheerful smile dimple
    c.beginPath();
    c.arc(hx - 0.012, hy - 0.012, 0.014, Math.PI * 0.7, Math.PI * 1.45);
    c.lineWidth = 0.005;
    c.stroke();
  }

  // ---- swept pointed pectoral wing with black frame & bright yellow tip (exact Image 2!) ----
  c.save();
  c.translate(0.052, 0.068);
  c.rotate(-0.62 + p.wag2 * 0.16);
  fillStroke(
    c,
    () => {
      c.moveTo(0, -0.012);
      c.bezierCurveTo(-0.045, -0.048, -0.115, -0.042, -0.155, -0.01);
      c.bezierCurveTo(-0.11, 0.036, -0.045, 0.045, 0, 0.018);
    },
    lin(c, 0, 0, -0.15, 0, [
      [0, B],
      [0.45, BL],
      [0.52, BLK],
      [1, BLK],
    ]),
    OL,
    LW * 0.72,
    () => {
      // Bright yellow crescent wing tip inside black border
      c.fillStyle = YEL;
      c.beginPath();
      c.ellipse(-0.1, -0.002, 0.042, 0.018, 0.05, 0, TAU);
      c.fill();
    }
  );
  c.restore();

  // ---- expressive big Dory eyes (with warm magenta-brown iris) ----
  const ex = 0.252,
    ey = -0.072 - p.open * 0.006,
    er = 0.058;
  if (p.puff) glow(c, ex - 0.022, ey + 0.075, 0.042, 0.026, 0, "255,110,150", 0.44);
  c.beginPath();
  c.ellipse(ex - 0.004, ey, er * 1.04, er * 1.12, -0.1, Math.PI * 0.55, Math.PI * 1.75);
  c.strokeStyle = rgba(BD, 0.55);
  c.lineWidth = 0.0065;
  c.stroke();
  eye(c, ex, ey, er, {
    iris: pal.iris || "#7c2228",
    expr: p.expr,
    ol: OL,
    sx: 0.88,
    look: 0.28,
    irisR: 0.55,
    pupilR: 0.34,
    tilt: -0.1,
  });
}

// =====================================================================================
// LEON — Feeding Frenzy Lionfish (matching Image 2 exactly!):
// compact steep snout with slightly longer protruding golden lower jaw (underbite),
// tucked fierce eye under dual brow tentacles, 10 tall feather-tipped dorsal spines,
// slim tail peduncle + softly rounded speckled mint tail, & sweeping banded pectoral fan!
// =====================================================================================
function drawLeon(c: Ctx, sp: Species, p: Pose) {
  const pal = sp.pal;
  const GLD = "#e5ba14";
  const GLD_HI = "#f8df44";
  const OLV = "#7d6406";
  const DK = "#322804";
  const OL = rgba(pal.outline || "#262004", 0.86);
  const MINT = "#c8ddc6";
  const MINT_L = "#e4efe0";
  const CREAM = "#f6f3cc";
  const LW = 0.0085;
  c.translate(-0.015, 0.02);

  // ---- 1. 10 tall slender dorsal spines fanning forward-to-backward with tattered mint feather pennants ----
  const nSp = 10;
  for (let i = 0; i < nSp; i++) {
    const f = i / (nSp - 1);
    const rx = 0.205 - f * 0.24;
    const ry = -0.105 - Math.sin(f * Math.PI * 0.85) * 0.042 + f * 0.045;
    // Front spines pitch gently forward (+x), middle upright, rear fan smoothly back (-x) matching Image 2!
    const baseAng = -Math.PI * (0.38 + f * 0.3) + p.wag2 * 0.025;
    const spLen = 0.215 + Math.sin(f * Math.PI * 0.9) * 0.095 - f * 0.035;
    // Tip curls subtly backward toward tail (-x)
    const bend = 0.012 + f * 0.028;
    const midX = rx + Math.cos(baseAng) * spLen * 0.56 - bend * 0.15;
    const midY = ry + Math.sin(baseAng) * spLen * 0.56;
    const tipX = rx + Math.cos(baseAng) * spLen - bend;
    const tipY = ry + Math.sin(baseAng) * spLen + f * 0.012;

    // Tattered sage-mint feather pennant hanging off the rear edge of the upper spine
    const tx = tipX - midX;
    const ty = tipY - midY;
    const d = Math.hypot(tx, ty) || 1;
    const ux = tx / d;
    const uy = ty / d;
    // backward normal (-x direction roughly)
    const bx = -uy;
    const by = ux;
    const sign = bx < 0 ? 1 : -1;
    const nx = bx * sign;
    const ny = by * sign;

    c.beginPath();
    c.moveTo(midX, midY);
    c.lineTo(tipX, tipY);
    c.lineTo(tipX + nx * 0.036 + ux * 0.01, tipY + ny * 0.036 + uy * 0.01);
    c.lineTo(tipX - ux * 0.018 + nx * 0.022, tipY - uy * 0.018 + ny * 0.022);
    c.lineTo(tipX - ux * 0.03 + nx * 0.032, tipY - uy * 0.03 + ny * 0.032);
    c.lineTo(tipX - ux * 0.056 + nx * 0.014, tipY - uy * 0.056 + ny * 0.014);
    c.lineTo(midX + nx * 0.004, midY + ny * 0.004);
    c.closePath();
    c.fillStyle = lin(c, midX, midY, tipX, tipY, [
      [0, rgba(MINT, 0.85)],
      [0.65, rgba(MINT_L, 0.9)],
      [1, rgba("#d6e6d4", 0.78)],
    ]);
    c.fill();
    c.strokeStyle = rgba(OLV, 0.42);
    c.lineWidth = 0.004;
    c.stroke();

    // Slender banded spine shaft
    c.beginPath();
    c.moveTo(rx, ry + 0.015);
    c.quadraticCurveTo(midX, midY, tipX, tipY);
    c.strokeStyle = "#8c8b52";
    c.lineWidth = 0.009;
    c.stroke();
    c.setLineDash([0.013, 0.016]);
    c.strokeStyle = rgba(DK, 0.78);
    c.lineWidth = 0.0082;
    c.stroke();
    c.setLineDash([]);
  }

  // ---- 2. Soft rear dorsal fin (behind spines) ----
  c.beginPath();
  c.moveTo(-0.04, -0.065);
  c.quadraticCurveTo(-0.095, -0.18 + p.wag2 * 0.01, -0.145, -0.175 + p.wag2 * 0.012);
  c.bezierCurveTo(-0.155, -0.11, -0.145, -0.05, -0.145, -0.015);
  c.closePath();
  c.fillStyle = lin(c, -0.06, -0.04, -0.14, -0.17, [
    [0, rgba("#c2b850", 0.88)],
    [0.5, rgba(MINT, 0.86)],
    [1, rgba(MINT_L, 0.76)],
  ]);
  c.fill();
  c.strokeStyle = rgba(OLV, 0.45);
  c.lineWidth = 0.0045;
  c.stroke();
  // Soft dot rows on rear dorsal
  c.fillStyle = rgba("#424b28", 0.55);
  for (let r = 0; r < 3; r++) {
    for (let k = 0; k < 3; k++) {
      blob(c, -0.075 - r * 0.024, -0.07 - k * 0.028 - r * 0.012, 0.004, 0.003);
    }
  }

  // ---- 3. Rounded translucent pale-mint speckled tail fin (Image 2!) ----
  c.save();
  c.translate(-0.215, 0.015);
  c.rotate(p.wag * 0.14);
  c.scale(1 - Math.abs(p.wag) * 0.04, 1);
  c.beginPath();
  c.moveTo(0.01, -0.036);
  c.quadraticCurveTo(-0.06, -0.105, -0.145, -0.135);
  c.bezierCurveTo(-0.22, -0.095, -0.235, 0.085, -0.13, 0.148);
  c.quadraticCurveTo(-0.055, 0.115, 0.01, 0.042);
  c.closePath();
  c.fillStyle = lin(c, 0, 0, -0.22, 0, [
    [0, rgba("#b4bc84", 0.88)],
    [0.35, rgba(MINT, 0.84)],
    [1, rgba(MINT_L, 0.74)],
  ]);
  c.fill();
  c.save();
  c.clip();
  // Faint pale rays + scattered dark olive dots like Image 2
  const tRays: [number, number][] = [];
  for (let i = 0; i < 7; i++) tRays.push([-0.21, -0.1 + i * 0.036]);
  rayFan(c, 0.02, 0.004, tRays, rgba("#eff4e4", 0.52), 0.0032);
  c.fillStyle = rgba("#303818", 0.62);
  for (let i = 0; i < 7; i++) {
    const ry = -0.088 + i * 0.031;
    for (let j = 1; j <= 4; j++) {
      const t = j * 0.22;
      blob(c, -0.03 - t * 0.17, ry * (0.35 + t * 0.85), 0.0042, 0.0034);
    }
  }
  c.restore();
  c.strokeStyle = rgba(OLV, 0.45);
  c.lineWidth = 0.0048;
  c.stroke();
  c.restore();

  // ---- 4. Small tucked anal fin behind pectoral curtain ----
  c.beginPath();
  c.moveTo(-0.06, 0.08);
  c.quadraticCurveTo(-0.095, 0.145 - p.wag2 * 0.008, -0.135, 0.145 - p.wag2 * 0.008);
  c.quadraticCurveTo(-0.15, 0.095, -0.145, 0.045);
  c.closePath();
  c.fillStyle = rgba(MINT, 0.78);
  c.fill();

  // ---- 5. BODY + SHORT STEEP SNOUT + RIGID-ROTATED LONGER PROTRUDING LOWER JAW ----
  const hx = 0.268;
  const hy = 0.058;
  const jawAng = p.open * 0.56;
  const cosJ = Math.cos(jawAng);
  const sinJ = Math.sin(jawAng);
  const rotJ = (px: number, py: number): [number, number] => [
    hx + (px - hx) * cosJ - (py - hy) * sinJ,
    hy + (px - hx) * sinJ + (py - hy) * cosJ,
  ];
  const ux = 0.354;
  const uy = 0.052 - p.open * 0.028;
  // Lower jaw sticks out slightly FURTHER than upper lip, rotating cleanly on hinge (hx, hy)
  const [lx, ly] = rotJ(0.382, 0.064);
  const [chinFrontX, chinFrontY] = rotJ(0.386, 0.094);
  const [chinBotX, chinBotY] = rotJ(0.312, 0.128);

  const body = () => {
    c.moveTo(-0.215, -0.028);
    // Slim tail peduncle rising cleanly into high rounded golden-olive back crest
    c.bezierCurveTo(-0.14, -0.028, -0.09, -0.068, -0.01, -0.132);
    c.bezierCurveTo(0.085, -0.165, 0.185, -0.138, 0.246, -0.085);
    // Steep slightly concave face down to short compact upper snout
    c.bezierCurveTo(0.268, -0.062, 0.282, -0.032, 0.312, 0.004 - p.open * 0.016);
    c.quadraticCurveTo(0.34, 0.032 - p.open * 0.024, ux, uy);
    if (p.open > 0) {
      c.quadraticCurveTo(0.314, (uy + hy) * 0.5 + 0.008, hx, hy);
      c.quadraticCurveTo((hx + lx) * 0.5 + 0.006, (hy + ly) * 0.5 - 0.004, lx, ly);
      // Smoothly rotated rounded chin sweeping cleanly back into throat & belly
      c.bezierCurveTo(chinFrontX, chinFrontY, chinBotX, chinBotY, 0.225, 0.138 + p.open * 0.01);
      c.bezierCurveTo(0.125, 0.152, 0.005, 0.115, -0.115, 0.068);
      c.quadraticCurveTo(-0.175, 0.05, -0.215, 0.044);
    } else {
      // Closed mouth: upper lip curves softly into tucked throat pocket while lower lip juts slightly further forward!
      c.quadraticCurveTo(ux - 0.006, 0.064, hx + 0.025, 0.062);
      c.quadraticCurveTo(lx - 0.012, 0.056, lx, ly);
      c.bezierCurveTo(lx + 0.006, ly + 0.024, 0.31, 0.112 + (p.puff ? 0.014 : 0), 0.225, 0.138);
      c.bezierCurveTo(0.125, 0.152, 0.005, 0.115, -0.115, 0.068);
      c.quadraticCurveTo(-0.175, 0.05, -0.215, 0.044);
    }
  };

  // Recessed natural mouth cavity behind jaws when eating (curved inner wall + clipped tongue + fangs!)
  if (p.open > 0) {
    c.beginPath();
    c.moveTo(hx - 0.016, hy);
    c.quadraticCurveTo(0.314, (uy + hy) * 0.5 + 0.008, ux - 0.006, uy + 0.003);
    c.quadraticCurveTo((ux + lx) * 0.5 - 0.026, (uy + ly) * 0.5, lx - 0.006, ly + 0.002);
    c.quadraticCurveTo((hx + lx) * 0.5 + 0.006, (hy + ly) * 0.5 - 0.004, hx - 0.016, hy + 0.008);
    c.closePath();
    c.fillStyle = "#520e1e";
    c.fill();
    c.save();
    c.clip();
    c.beginPath();
    c.ellipse((hx + lx) * 0.48, (hy + ly) * 0.52 + 0.004, 0.042, 0.018 + p.open * 0.01, jawAng * 0.65, 0, TAU);
    c.fillStyle = "#d94f78";
    c.fill();
    const fl = 0.012 * Math.min(1, p.open * 1.4);
    teethRow(c, hx, hy, ux - 0.005, uy + 0.003, 5, 0.24, 0.96, (t) => fl * (0.55 + t * 0.45), 0.18, 0.94);
    teethRow(c, hx, hy, lx - 0.006, ly + 0.002, 5, -0.22, -0.96, (t) => fl * (0.6 + t * 0.5), 0.18, 0.94);
    c.restore();
  }

  fillStroke(
    c,
    body,
    lin(c, 0.04, -0.16, 0.04, 0.15, [
      [0, "#a88208"],
      [0.24, GLD_HI],
      [0.58, GLD],
      [0.86, "#8a6804"],
      [1, "#4e3e02"],
    ]),
    OL,
    LW,
    () => {
      // Soft radial golden glow along shoulder/flank
      glow(c, 0.06, -0.02, 0.22, 0.11, -0.08, "255,230,90", 0.34);

      // Vertical/gently curving cream-lemon & deep-olive Lionfish zebra stripes on trunk
      const flankStripes = [
        { x: 0.155, w: 0.018, c: CREAM, a: 0.84, bend: 0.014 },
        { x: 0.115, w: 0.02, c: OLV, a: 0.36, bend: 0.014 },
        { x: 0.072, w: 0.022, c: CREAM, a: 0.88, bend: 0.012 },
        { x: 0.028, w: 0.02, c: OLV, a: 0.38, bend: 0.008 },
        { x: -0.018, w: 0.02, c: CREAM, a: 0.86, bend: 0.004 },
        { x: -0.065, w: 0.02, c: OLV, a: 0.38, bend: -0.004 },
        { x: -0.108, w: 0.016, c: CREAM, a: 0.78, bend: -0.008 },
        { x: -0.158, w: 0.014, c: CREAM, a: 0.72, bend: -0.01 },
      ];
      for (const s of flankStripes) {
        c.beginPath();
        c.moveTo(s.x, -0.18);
        c.quadraticCurveTo(s.x + s.bend, 0.0, s.x - 0.01, 0.18);
        c.strokeStyle = rgba(s.c, s.a);
        c.lineWidth = s.w;
        c.stroke();
      }

      // Snout & rounded gill-cover diagonal stripes (matching Image 2!)
      const headStripes = [
        [0.328, -0.01, 0.285, 0.11],
        [0.302, -0.04, 0.258, 0.125],
        [0.274, -0.07, 0.228, 0.138],
        [0.242, -0.085, 0.205, 0.14],
      ];
      for (const [x0, y0, x1, y1] of headStripes) {
        c.beginPath();
        c.moveTo(x0, y0);
        c.quadraticCurveTo((x0 + x1) * 0.5 + 0.012, (y0 + y1) * 0.5, x1, y1);
        c.strokeStyle = rgba("#e6ebbb", 0.74);
        c.lineWidth = 0.01;
        c.stroke();
      }

      // Proud protruding golden lower jaw / lip highlight rotated WITH jaw hinge!
      const [lh0x, lh0y] = rotJ(0.285, 0.056);
      const [lhCx, lhCy] = rotJ(0.34, 0.052);
      const [lhTipX, lhTipY] = rotJ(0.382, 0.066);
      const [lhBx, lhBy] = rotJ(0.345, 0.088);
      const [lhEndX, lhEndY] = rotJ(0.285, 0.08);
      c.beginPath();
      c.moveTo(lh0x, lh0y);
      c.quadraticCurveTo(lhCx, lhCy, lhTipX, lhTipY);
      c.quadraticCurveTo(lhBx, lhBy, lhEndX, lhEndY);
      c.closePath();
      c.fillStyle = lin(c, lh0x, lh0y, lhTipX, lhBy, [
        [0, "#c89608"],
        [0.5, "#f7dc44"],
        [1, "#e8b410"],
      ]);
      c.fill();
      c.strokeStyle = rgba(DK, 0.58);
      c.lineWidth = 0.0045;
      c.stroke();

      // Deep dark mouth crease & belly shadow
      c.fillStyle = lin(c, 0, 0.08, 0, 0.16, [
        [0, "rgba(25,18,2,0)"],
        [1, "rgba(25,18,2,0.48)"],
      ]);
      c.fillRect(-0.24, 0.05, 0.65, 0.14);
    }
  );

  // Rounded operculum / gill cover curve right behind cheek
  c.beginPath();
  c.moveTo(0.195, -0.035);
  c.bezierCurveTo(0.168, 0.02, 0.18, 0.095, 0.228, 0.132);
  c.strokeStyle = rgba(DK, 0.72);
  c.lineWidth = 0.0075;
  c.stroke();
  c.beginPath();
  c.moveTo(0.204, -0.025);
  c.bezierCurveTo(0.18, 0.025, 0.192, 0.092, 0.232, 0.122);
  c.strokeStyle = rgba("#f5eea8", 0.55);
  c.lineWidth = 0.004;
  c.stroke();

  // Crisp upper/lower mouth line accentuating slight underbite
  c.beginPath();
  if (p.open > 0) {
    c.moveTo(ux, uy);
    c.quadraticCurveTo(0.314, (uy + hy) * 0.5 + 0.008, hx, hy);
    c.quadraticCurveTo((hx + lx) * 0.5 + 0.006, (hy + ly) * 0.5 - 0.004, lx, ly);
  } else {
    c.moveTo(ux - 0.004, uy + 0.004);
    c.quadraticCurveTo(0.31, 0.062, hx + 0.01, hy + 0.004);
  }
  c.strokeStyle = rgba(DK, 0.85);
  c.lineWidth = 0.0068;
  c.stroke();

  // ---- 6. SWEEPING BANDED & RAGGED FEATHERED PECTORAL CURTAIN (Image 2 signature!) ----
  c.save();
  c.translate(0.18, 0.082);
  c.rotate(p.wag2 * 0.055);
  const raysData = [
    { ang: 1.5, len: 0.215 },
    { ang: 1.76, len: 0.255 },
    { ang: 2.02, len: 0.28 },
    { ang: 2.28, len: 0.295 },
    { ang: 2.54, len: 0.295 },
    { ang: 2.8, len: 0.29 },
    { ang: 3.06, len: 0.305 },
  ];
  // Outer translucent tattered feather-curtain silhouette sweeping under belly toward tail waist
  c.beginPath();
  c.moveTo(0.035, 0.0);
  for (let i = 0; i < raysData.length; i++) {
    const r = raysData[i];
    const ex = Math.cos(r.ang) * r.len;
    const ey = Math.sin(r.ang) * r.len;
    const nx = Math.cos(r.ang + 0.09) * (r.len * 0.92);
    const ny = Math.sin(r.ang + 0.09) * (r.len * 0.92);
    const notchX = Math.cos(r.ang + 0.14) * (r.len * 0.78);
    const notchY = Math.sin(r.ang + 0.14) * (r.len * 0.78);
    c.lineTo(ex, ey);
    c.lineTo(nx, ny);
    if (i < raysData.length - 1) c.lineTo(notchX, notchY);
  }
  c.lineTo(-0.08, -0.025);
  c.closePath();
  c.fillStyle = lin(c, 0.02, 0.0, -0.16, 0.26, [
    [0, rgba("#c89e18", 0.9)],
    [0.38, rgba("#98b888", 0.84)],
    [0.72, rgba("#d6ead8", 0.85)],
    [1, rgba("#f2f9f2", 0.82)],
  ]);
  c.fill();
  c.save();
  c.clip();
  // Banded orange-tan & cream concentric ribs over upper/mid curtain fading into frothy white feather tips
  for (let b = 0; b < 5; b++) {
    c.beginPath();
    c.arc(0.01, -0.01, 0.045 + b * 0.042, 1.55, 3.25);
    c.strokeStyle = b % 2 === 0 ? rgba("#d4861a", 0.54) : rgba("#f4f2cc", 0.56);
    c.lineWidth = 0.016;
    c.stroke();
  }
  // Ragged ray ribs + subtle dark spots along mid-curtain
  for (const r of raysData) {
    const ex = Math.cos(r.ang) * r.len;
    const ey = Math.sin(r.ang) * r.len;
    c.beginPath();
    c.moveTo(0.01, 0.0);
    c.quadraticCurveTo(ex * 0.45 + 0.01, ey * 0.5, ex, ey);
    c.strokeStyle = rgba("#e4edd4", 0.85);
    c.lineWidth = 0.0052;
    c.stroke();
    c.setLineDash([0.01, 0.013]);
    c.strokeStyle = rgba("#6a5812", 0.46);
    c.lineWidth = 0.0042;
    c.stroke();
    c.setLineDash([]);
    c.fillStyle = rgba("#3a4424", 0.44);
    blob(c, ex * 0.78, ey * 0.78, 0.0038, 0.003);
  }
  c.restore();
  c.strokeStyle = rgba(OLV, 0.34);
  c.lineWidth = 0.0038;
  c.stroke();
  c.restore();

  // ---- 7. TWO CURVED BROW TENTACLES + SHARP FIERCE COOL EYE ----
  const ex = 0.252;
  const ey = -0.044 - p.open * 0.004;
  const er = 0.036;

  // Dual curved brow tentacles leaning upward & forward
  for (const [bx0, by0, cx0, cy0, tx0, ty0, w] of [
    [0.242, -0.088, 0.262, -0.142, 0.302, -0.168, 0.0075],
    [0.256, -0.082, 0.28, -0.128, 0.312, -0.145, 0.0062],
  ] as const) {
    c.beginPath();
    c.moveTo(bx0, by0);
    c.quadraticCurveTo(cx0, cy0, tx0, ty0);
    c.strokeStyle = "#7a660c";
    c.lineWidth = w;
    c.stroke();
    c.strokeStyle = rgba("#d9cf72", 0.65);
    c.lineWidth = w * 0.42;
    c.stroke();
  }

  // Sculpted fierce forward-angled socket & lower cheek rim
  c.beginPath();
  c.arc(ex, ey, er * 1.12, Math.PI * 0.1, Math.PI * 0.88);
  c.strokeStyle = rgba(DK, 0.58);
  c.lineWidth = 0.0052;
  c.stroke();

  if (p.puff) glow(c, ex - 0.02, ey + 0.06, 0.032, 0.02, 0, "255,110,120", 0.38);
  eye(c, ex, ey, er, {
    iris: "#a4bc1c",
    expr: p.expr,
    ol: OL,
    sx: 0.9,
    look: 0.28,
    lookY: 0.04,
    irisR: 0.58,
    pupilR: 0.35,
    lid: p.expr === "panic" ? 0 : 0.26,
    lidTilt: 0.26,
    lidCol: "#907206",
    lidEdge: OL,
  });

  // Confident sharp golden-olive brow ridge angled forward (no lazy droop!)
  c.beginPath();
  c.moveTo(ex - er * 1.05, ey - er * 0.92);
  c.quadraticCurveTo(ex + er * 0.15, ey - er * 0.9, ex + er * 1.15, ey - er * 0.28);
  c.strokeStyle = rgba(DK, 0.88);
  c.lineWidth = 0.008;
  c.stroke();
}

// =====================================================================================
// GOLIATH — Orca / Killer Whale matching Image 2 silhouette & proportions:
// massive muscular body tapering smoothly into horizontal cetacean tail fluke, rounded
// melon snout, falcate dorsal fin, broad paddle flipper, pure-white chin + broad rear
// flank patch + eye patch, & rigid-rotated plump lower jaw when eating!
// =====================================================================================
function drawOrca(c: Ctx, _sp: Species, p: Pose) {
  const BLK = "#10141c";
  const BLK_HI = "#2f3a4a";
  const OL = "#080b10";
  const WH = "#ffffff";
  const LW = 0.0068;
  c.translate(0.0, 0.02);

  // ---- 1. Swept falcate dorsal fin (Image 2!) ----
  const ds = p.wag2 * 0.006;
  fillStroke(
    c,
    () => {
      c.moveTo(0.072, -0.095);
      c.bezierCurveTo(0.032, -0.145, -0.015, -0.215, -0.065 + ds, -0.252);
      c.quadraticCurveTo(-0.084 + ds, -0.258, -0.078 + ds, -0.236);
      c.bezierCurveTo(-0.038, -0.185, -0.038, -0.128, -0.062, -0.092);
    },
    lin(c, 0.02, -0.25, -0.02, -0.09, [
      [0, BLK_HI],
      [0.42, "#151a24"],
      [1, BLK],
    ]),
    OL,
    LW * 0.9
  );

  // ---- 2. Sleek horizontal 3/4 cetacean tail fluke at end of rear body (Image 2!) ----
  c.save();
  c.translate(-0.355, 0.032);
  c.rotate(p.wag * 0.14);
  fillStroke(
    c,
    () => {
      c.moveTo(0.018, -0.014);
      // subtle upper/far blade edge
      c.quadraticCurveTo(-0.04, -0.022, -0.072, -0.004);
      c.quadraticCurveTo(-0.068, 0.015, -0.068, 0.022);
      // sleek sweeping near fluke blade extending smoothly back-and-down like Image 2
      c.quadraticCurveTo(-0.095, 0.048, -0.128, 0.068);
      c.bezierCurveTo(-0.092, 0.062, -0.042, 0.038, 0.015, 0.016);
    },
    lin(c, 0.0, -0.01, -0.11, 0.06, [
      [0, BLK_HI],
      [0.45, "#151a24"],
      [1, BLK],
    ]),
    OL,
    LW * 0.85,
    () => {
      c.beginPath();
      c.moveTo(0.0, -0.004);
      c.quadraticCurveTo(-0.065, 0.022, -0.116, 0.058);
      c.strokeStyle = "rgba(195,220,245,0.18)";
      c.lineWidth = 0.0055;
      c.stroke();
    }
  );
  c.restore();

  // ---- 3. Rigid-hinged jaw coordinates (keeps full chin thickness at every mouth step!) ----
  const hx = 0.276;
  const hy = 0.048;
  const jawAng = p.open * 0.44; // max ~25 deg clean downward hinge
  const cosJ = Math.cos(jawAng);
  const sinJ = Math.sin(jawAng);
  const rotJ = (px: number, py: number): [number, number] => [
    hx + (px - hx) * cosJ - (py - hy) * sinJ,
    hy + (px - hx) * sinJ + (py - hy) * cosJ,
  ];

  // Upper lip gently lifts slightly when biting
  const ux = 0.436;
  const uy = 0.044 - p.open * 0.014;
  const [tipX, tipY] = rotJ(0.428, 0.052);
  const [chinFrontX, chinFrontY] = rotJ(0.398, 0.088);
  const [chinMidX, chinMidY] = rotJ(0.338, 0.1);
  const chinBackY = 0.1 + p.open * 0.012 + (p.puff ? 0.01 : 0);

  const body = () => {
    c.moveTo(-0.36, 0.018);
    // Smooth muscular Image 2 rear back rising smoothly to tall shoulders & rounded melon snout
    c.bezierCurveTo(-0.275, -0.018, -0.19, -0.072, -0.035, -0.098);
    c.bezierCurveTo(0.115, -0.108, 0.255, -0.095, 0.355, -0.042);
    // Rounded melon forehead + gentle blunt rostrum curve (Image 2!)
    c.bezierCurveTo(0.395, -0.022, 0.422, 0.012, 0.432, 0.03 - p.open * 0.01);
    c.quadraticCurveTo(0.442, 0.04 - p.open * 0.012, ux, uy);
    if (p.open > 0) {
      c.quadraticCurveTo(0.365, uy + 0.012, hx, hy);
      c.quadraticCurveTo((hx + tipX) * 0.5, (hy + tipY) * 0.5 - 0.004, tipX, tipY);
      c.bezierCurveTo(tipX - 0.008, tipY + 0.022, chinFrontX, chinFrontY, chinMidX, chinMidY);
      c.quadraticCurveTo(0.275, chinBackY, 0.215, 0.102);
    } else {
      // Closed Image 2 rounded snout & plump white chin
      c.quadraticCurveTo(0.436, 0.068, 0.39, 0.086);
      c.bezierCurveTo(0.335, 0.104, 0.272, chinBackY, 0.215, 0.102);
    }
    // Deep smooth muscular belly tapering cleanly to sleek horizontal tail stem (Image 2!)
    c.bezierCurveTo(0.085, 0.108, -0.065, 0.095, -0.195, 0.075);
    c.bezierCurveTo(-0.275, 0.062, -0.325, 0.044, -0.36, 0.042);
  };

  // ---- 4. Open Mouth Interior (cleanly fills entire V between upper snout & rotated jaw!) ----
  if (p.open > 0) {
    c.beginPath();
    c.moveTo(hx - 0.015, hy);
    c.quadraticCurveTo(0.36, uy + 0.01, ux - 0.012, uy + 0.002);
    // Curved front throat edge connecting upper & lower jaw so ZERO transparent hole ever appears!
    c.quadraticCurveTo((ux + tipX) * 0.5 - 0.018, (uy + tipY) * 0.5, tipX - 0.012, tipY - 0.002);
    c.quadraticCurveTo((hx + tipX) * 0.5, (hy + tipY) * 0.5, hx - 0.015, hy + 0.008);
    c.closePath();
    c.fillStyle = "#5c1222";
    c.fill();

    c.save();
    c.clip();
    // Smooth pink tongue resting on the rotated lower jaw floor
    c.beginPath();
    c.moveTo(hx - 0.005, hy + 0.006);
    c.quadraticCurveTo((hx + tipX) * 0.52, (hy + tipY) * 0.5 + 0.002, tipX - 0.018, tipY);
    c.quadraticCurveTo((hx + tipX) * 0.48, (hy + tipY) * 0.5 + 0.032, hx - 0.008, hy + 0.028);
    c.closePath();
    c.fillStyle = "#e67c96";
    c.fill();

    // Soft rose-pink upper & lower gums
    c.beginPath();
    c.moveTo(hx, hy - 0.002);
    c.quadraticCurveTo(0.36, uy + 0.01, ux - 0.012, uy + 0.002);
    c.lineWidth = 0.011;
    c.strokeStyle = "#e8a8b6";
    c.stroke();

    c.beginPath();
    c.moveTo(hx, hy + 0.004);
    c.quadraticCurveTo((hx + tipX) * 0.5, (hy + tipY) * 0.5 - 0.002, tipX - 0.01, tipY);
    c.lineWidth = 0.012;
    c.strokeStyle = "#eab2be";
    c.stroke();

    // Neat small rounded white peg-teeth along both gum lines
    const drawPegTeeth = (ax: number, ay: number, cx: number, cy: number, bx: number, by: number, nxSign: number) => {
      const nT = 9;
      c.fillStyle = "#fffdfd";
      c.strokeStyle = "rgba(85,45,55,0.45)";
      c.lineWidth = 0.002;
      for (let i = 1; i < nT; i++) {
        const t = i / nT;
        const u = 1 - t;
        const px = u * u * ax + 2 * u * t * cx + t * t * bx;
        const py = u * u * ay + 2 * u * t * cy + t * t * by;
        const tx = 2 * u * (cx - ax) + 2 * t * (bx - cx);
        const ty = 2 * u * (cy - ay) + 2 * t * (by - cy);
        const d = Math.hypot(tx, ty) || 1;
        const nx = (-ty / d) * nxSign;
        const ny = (tx / d) * nxSign;
        const sz = (0.0048 + Math.sin(t * Math.PI) * 0.0018) * Math.min(1, p.open * 1.4);
        c.beginPath();
        c.ellipse(px + nx * sz * 0.55, py + ny * sz * 0.55, sz * 0.65, sz * 0.92, Math.atan2(ty, tx), 0, TAU);
        c.fill();
        c.stroke();
      }
    };
    drawPegTeeth(hx + 0.006, hy, 0.36, uy + 0.01, ux - 0.015, uy + 0.002, 1);
    drawPegTeeth(hx + 0.006, hy + 0.004, (hx + tipX) * 0.5, (hy + tipY) * 0.5 - 0.002, tipX - 0.014, tipY, -1);
    c.restore();
  }

  fillStroke(
    c,
    body,
    lin(c, 0.02, -0.11, 0.02, 0.11, [
      [0, BLK_HI],
      [0.34, "#161d28"],
      [0.78, BLK],
      [1, "#070a0f"],
    ]),
    OL,
    LW,
    () => {
      // ---- 5. PURE WHITE MARKINGS ("tetap putih ya putihcoraknya", Image 2!) ----
      // 1a) Clean pure white chin + throat sweeping cleanly back under pectoral flipper
      c.beginPath();
      if (p.open > 0) {
        c.moveTo(tipX + 0.006, tipY - 0.002);
        c.quadraticCurveTo((hx + tipX) * 0.5, (hy + tipY) * 0.5 - 0.004, hx, hy);
      } else {
        c.moveTo(0.436, 0.044);
        c.quadraticCurveTo(0.372, 0.056, 0.32, 0.044);
        c.quadraticCurveTo(0.28, 0.044, hx, hy);
      }
      c.bezierCurveTo(0.238, 0.046, 0.215, 0.068, 0.185, 0.075);
      c.bezierCurveTo(0.155, 0.088, 0.115, 0.105, 0.06, 0.115);
      c.lineTo(0.48, 0.26);
      c.closePath();
      c.fillStyle = lin(c, 0.32, 0.04, 0.32, 0.12, [
        [0, WH],
        [0.78, WH],
        [1, "#e6ecf4"],
      ]);
      c.fill();

      // 1b) Broad smooth rounded rear-flank white patch + ventral strip (exact Image 2!)
      c.beginPath();
      c.moveTo(-0.045, 0.14);
      c.bezierCurveTo(-0.065, 0.068, -0.105, 0.018, -0.175, 0.014);
      c.bezierCurveTo(-0.228, 0.01, -0.268, 0.028, -0.278, 0.055);
      c.lineTo(-0.285, 0.14);
      c.closePath();
      c.fillStyle = lin(c, -0.16, 0.015, -0.16, 0.095, [
        [0, WH],
        [0.82, "#f4f7fb"],
        [1, "#dde6f0"],
      ]);
      c.fill();

      // 2) Pure-white streamlined eye patch tilting cleanly UPWARD toward back (fierce, not droopy/sad!)
      c.save();
      c.translate(0.292, -0.006);
      c.rotate(0.22);
      c.beginPath();
      c.moveTo(-0.044, -0.002);
      c.bezierCurveTo(-0.036, -0.017, 0.008, -0.016, 0.04, -0.001);
      c.bezierCurveTo(0.046, 0.004, 0.038, 0.013, 0.014, 0.013);
      c.bezierCurveTo(-0.014, 0.013, -0.044, 0.01, -0.044, -0.002);
      c.closePath();
      c.fillStyle = WH;
      c.fill();
      c.restore();

      // 3) Glossy ocean sheen across broad rounded melon head & muscular back (Image 2!)
      glow(c, 0.34, -0.022, 0.085, 0.024, 0.18, "215,235,255", 0.24);
      c.beginPath();
      c.moveTo(0.365, -0.028);
      c.bezierCurveTo(0.245, -0.088, 0.075, -0.096, -0.125, -0.065);
      c.quadraticCurveTo(-0.23, -0.042, -0.31, -0.002);
      c.strokeStyle = "rgba(205, 226, 248, 0.16)";
      c.lineWidth = 0.016;
      c.stroke();
    }
  );

  // Subtle dark smile line when mouth is closed (Image 2!)
  if (p.open === 0) {
    c.beginPath();
    c.moveTo(0.432, 0.045);
    c.quadraticCurveTo(0.372, 0.056, 0.32, 0.044);
    c.quadraticCurveTo(0.285, 0.044, hx, hy);
    c.strokeStyle = "rgba(18,24,34,0.85)";
    c.lineWidth = 0.0052;
    c.stroke();
  }

  // ---- 6. Broad muscular paddle pectoral flipper (Image 2!) ----
  c.save();
  c.translate(0.185, 0.078);
  c.rotate(-0.74 + p.wag2 * 0.07);
  fillStroke(
    c,
    () => {
      c.moveTo(0.024, -0.016);
      c.bezierCurveTo(-0.012, -0.046, -0.105, -0.036, -0.138, 0.006);
      c.bezierCurveTo(-0.145, 0.038, -0.072, 0.056, 0.02, 0.022);
    },
    lin(c, 0, -0.03, -0.12, 0.03, [
      [0, BLK_HI],
      [0.45, "#18202c"],
      [1, BLK],
    ]),
    OL,
    LW * 0.85,
    () => {
      glow(c, -0.055, -0.008, 0.045, 0.014, -0.08, "215,235,255", 0.22);
    }
  );
  c.restore();

  // ---- 7. Small sleek dark eye tucked cleanly below front tip of white eye patch ----
  const ex = 0.326;
  const ey = 0.022 - p.open * 0.004;
  const er = 0.0125;
  if (p.puff) glow(c, ex - 0.01, ey + 0.032, 0.02, 0.013, 0, "255,105,130", 0.3);
  if (p.expr === "happy") {
    c.beginPath();
    c.arc(ex, ey + 0.003, er * 0.8, Math.PI * 1.1, Math.PI * 1.9);
    c.strokeStyle = "#ffffff";
    c.lineWidth = 0.0042;
    c.stroke();
  } else {
    const rUse = p.expr === "panic" ? er * 1.25 : er;
    c.beginPath();
    c.arc(ex, ey, rUse, 0, TAU);
    c.fillStyle = "#0a0e16";
    c.fill();
    c.strokeStyle = "#030508";
    c.lineWidth = 0.003;
    c.stroke();
    c.beginPath();
    c.arc(ex + rUse * 0.18, ey - rUse * 0.18, rUse * 0.24, 0, TAU);
    c.fillStyle = "rgba(210,230,250,0.68)";
    c.fill();
  }
}

// =====================================================================================
// ROBERT — Feeding Frenzy Barracuda (sculpted 3D look matching Image 2):
// heavy armored cranium & S-curved icy-mint torso tapering cleanly to a slim tail stem,
// larger fierce half-lidded eye set deep under a muscular overhanging brow bulge,
// smooth blunt upper snout overhanging a dark mouth slit with sharp peeking needle fangs,
// massive upturned scoop underbite chin with a 3D-sculpted fleshy jowl/lip roll,
// shaded operculum gill plate, fuller swept fins, & organic charcoal flank blotches!
// =====================================================================================
function drawBarracuda(c: Ctx, _sp: Species, p: Pose) {
  const AQUA_T = "#519ca9";
  const AQUA = "#bcebe5";
  const AQUA_B = "#eefcf6";
  const FIN_L = "#ecefc8";
  const FIN_D = "#b4c28a";
  const FIN_OL = "rgba(74, 96, 68, 0.55)";
  const OL = "rgba(26, 56, 66, 0.78)";
  const LW = 0.0058;
  c.translate(0.0, 0.008);

  // ---- 1. Broad curved pale cream-olive forked tail fin (Image 2 swept silhouette) ----
  c.save();
  c.translate(-0.318, 0.01);
  c.rotate(p.wag * 0.15);
  fillStroke(
    c,
    () => {
      c.moveTo(0.014, -0.018);
      c.bezierCurveTo(-0.045, -0.065, -0.096, -0.118, -0.148, -0.154);
      c.quadraticCurveTo(-0.144, -0.132, -0.116, -0.075);
      c.quadraticCurveTo(-0.088, -0.025, -0.064, -0.002);
      c.quadraticCurveTo(-0.092, 0.062, -0.124, 0.156);
      c.quadraticCurveTo(-0.088, 0.146, -0.048, 0.095);
      c.quadraticCurveTo(-0.014, 0.048, 0.014, 0.022);
    },
    lin(c, 0.01, 0, -0.145, 0, [
      [0, FIN_D],
      [0.42, FIN_L],
      [1, "#f4f7e2"],
    ]),
    FIN_OL,
    LW * 0.82,
    () => {
      const pts: [number, number][] = [];
      for (let i = 0; i < 9; i++) pts.push([-0.136, -0.128 + i * 0.032]);
      rayFan(c, 0.016, 0.002, pts, "rgba(122, 138, 92, 0.34)", 0.0028);
    }
  );
  c.restore();

  // ---- 2. Dorsal, Broader Scalloped Rear Dorsal & Anal Fins (Image 2) ----
  const sw = p.wag2 * 0.005;
  // Front pointed dorsal fin with delicate rear notch
  fillStroke(
    c,
    () => {
      c.moveTo(0.072, -0.098);
      c.lineTo(0.006 + sw, -0.175);
      c.lineTo(0.012 + sw, -0.138);
      c.lineTo(0.0 + sw, -0.142);
      c.lineTo(-0.01, -0.086);
    },
    lin(c, 0.04, -0.088, 0.008, -0.174, [
      [0, FIN_D],
      [1, FIN_L],
    ]),
    FIN_OL,
    LW * 0.76
  );
  // Broader soft-edged scalloped rear dorsal fin (Image 2!)
  fillStroke(
    c,
    () => {
      c.moveTo(-0.118, -0.056);
      c.quadraticCurveTo(-0.155, -0.104 + sw, -0.195 + sw, -0.124 + sw);
      c.quadraticCurveTo(-0.205 + sw, -0.096, -0.194 + sw, -0.082);
      c.quadraticCurveTo(-0.204 + sw, -0.064, -0.186, -0.034);
    },
    lin(c, -0.15, -0.048, -0.198, -0.122, [
      [0, FIN_D],
      [1, FIN_L],
    ]),
    FIN_OL,
    LW * 0.74
  );
  // Swept rear anal fin
  fillStroke(
    c,
    () => {
      c.moveTo(-0.125, 0.056);
      c.quadraticCurveTo(-0.156, 0.116 - sw, -0.188 - sw, 0.146 - sw);
      c.quadraticCurveTo(-0.19, 0.092, -0.184, 0.042);
    },
    lin(c, -0.155, 0.05, -0.188, 0.142, [
      [0, FIN_D],
      [1, FIN_L],
    ]),
    FIN_OL,
    LW * 0.74
  );

  // ---- 3. Massive Head, Smooth Cranium Head-Lift & Clean Underbite Jaw ----
  const gape = p.open;
  const headLift = p.puff ? 0 : gape * 0.036;
  const hx = 0.258;
  const hy = 0.022;
  const jawAng = gape * 0.38;
  const cosJ = Math.cos(jawAng);
  const sinJ = Math.sin(jawAng);
  const rotJ = (px: number, py: number): [number, number] => [
    hx + (px - hx) * cosJ - (py - hy) * sinJ,
    hy + (px - hx) * sinJ + (py - hy) * cosJ,
  ];

  // Solid rounded upper snout tip & upper jaw gum corner (projects cleanly forward, never chopped flat!)
  const upTipX = 0.418 - gape * 0.002;
  const upTipY = -0.056 - headLift * 1.14;
  const ux = 0.404 - gape * 0.002;
  const uy = -0.038 - headLift * 0.92;
  const ucx = (hx + ux) * 0.5;
  const ucy = (hy + uy) * 0.5 + 0.004;

  const closedTipX = 0.454;
  const closedTipY = -0.058;
  const [tipX, tipY] = rotJ(closedTipX, closedTipY);
  const lcx = (hx + tipX) * 0.5 + 0.012;
  const lcy = (hy + tipY) * 0.5 + 0.014;
  // Exact bulldog chin silhouette rotated cleanly around hinge (hx, hy) & blended smoothly into chest (zero lump!)
  const [c1ax, c1ay] = rotJ(0.474, -0.024);
  const [c1bx, c1by] = rotJ(0.456, 0.062);
  const [cMidX, cMidY] = rotJ(0.4, 0.102);
  const [c2ax, c2ay] = rotJ(0.352, 0.128);

  const body = () => {
    c.moveTo(-0.318, -0.008);
    // Sleek S-curved dorsal arch flowing smoothly up into lifting cranium dome
    c.bezierCurveTo(-0.215, -0.036, -0.095, -0.084, 0.048, -0.104);
    c.bezierCurveTo(0.128, -0.114, 0.174, -0.114 - headLift * 0.18, 0.22, -0.126 - headLift * 0.36);
    c.bezierCurveTo(0.264, -0.136 - headLift * 0.58, 0.308, -0.124 - headLift * 0.78, 0.342, -0.098 - headLift * 0.92);
    // Smooth thick continuous predatory snout bridge
    c.bezierCurveTo(0.372, -0.084 - headLift * 1.04, 0.404, -0.074 - headLift * 1.12, upTipX, upTipY);

    if (gape > 0) {
      c.quadraticCurveTo(upTipX + 0.002, (upTipY + uy) * 0.5 + 0.002, ux, uy);
      c.quadraticCurveTo(ucx, ucy, hx, hy);
      c.quadraticCurveTo(lcx, lcy, tipX, tipY);
      c.bezierCurveTo(c1ax, c1ay, c1bx, c1by, cMidX, cMidY);
      c.bezierCurveTo(c2ax, c2ay, 0.265 - gape * 0.008, 0.128 + gape * 0.018, 0.195, 0.115 + gape * 0.006);
    } else {
      // Closed: upper snout meets jutting lower jaw cleanly without any notch
      c.quadraticCurveTo(0.412, -0.048, 0.404, -0.046);
      c.quadraticCurveTo(0.432, -0.052, closedTipX, closedTipY);
      c.bezierCurveTo(0.474, -0.024, 0.456, 0.062, 0.4, 0.102);
      c.bezierCurveTo(0.352, 0.128, 0.265, 0.128 + (p.puff ? 0.01 : 0), 0.195, 0.115);
    }
    // Deep muscular chest tapering smoothly down to slender tail stem
    c.bezierCurveTo(0.105, 0.112, -0.035, 0.084, -0.165, 0.054);
    c.quadraticCurveTo(-0.256, 0.034, -0.318, 0.032);
  };

  // Open mouth interior + curved rosy gums + sharp curved barracuda fangs (tucked cleanly inside jaw rims!)
  if (gape > 0) {
    c.beginPath();
    c.moveTo(ux - 0.006, uy + 0.003);
    c.quadraticCurveTo(ucx, ucy, hx - 0.01, hy);
    c.quadraticCurveTo(hx - 0.02, hy + 0.01, hx - 0.008, hy + 0.018);
    c.quadraticCurveTo(lcx, lcy, tipX - 0.008, tipY + 0.004);
    c.quadraticCurveTo((ux + tipX) * 0.5 - 0.032, (uy + tipY) * 0.5, ux - 0.006, uy + 0.003);
    c.closePath();
    c.fillStyle = lin(c, hx - 0.02, hy, (ux + tipX) * 0.5, (uy + tipY) * 0.5, [
      [0, "#340c15"],
      [0.6, "#62202d"],
      [1, "#823b45"],
    ]);
    c.fill();

    c.save();
    c.clip();
    // Soft pink tongue nestled inside lower jaw
    c.fillStyle = "#d96a7e";
    blob(c, (hx + tipX) * 0.5 + 0.004, (hy + tipY) * 0.5 + 0.014, 0.048 + gape * 0.01, 0.015 + gape * 0.006, jawAng * 0.52);
    // Clean rosy gumline along exact upper & lower jaw arches
    c.strokeStyle = "#ec9ca6";
    c.lineWidth = 0.009 + gape * 0.003;
    c.beginPath();
    c.moveTo(ux - 0.006, uy + 0.002);
    c.quadraticCurveTo(ucx, ucy, hx - 0.006, hy);
    c.quadraticCurveTo(lcx, lcy, tipX - 0.006, tipY + 0.003);
    c.stroke();

    const fl = 0.017 * Math.min(1, gape * 1.35);
    curvedTeethRow(c, hx, hy, ucx, ucy, ux - 0.006, uy + 0.002, 6, 1, (t) => fl * (0.62 + t * 0.5), 0.14, 0.96);
    curvedTeethRow(c, hx, hy, lcx, lcy, tipX - 0.006, tipY + 0.003, 6, -1, (t) => fl * (0.68 + t * 0.52), 0.14, 0.96);
    c.restore();
  }

  // ---- 4. Volumetric 3D Shaded Body + Markings + Gill Cover ----
  fillStroke(
    c,
    body,
    lin(c, 0, -0.135, 0, 0.125, [
      [0, AQUA_T],
      [0.22, "#8fd6da"],
      [0.52, AQUA],
      [0.84, AQUA_B],
      [1, "#79aeb4"],
    ]),
    OL,
    LW,
    () => {
      // Soft faded teal-slate dorsal saddle bars along upper back
      for (let i = 0; i < 8; i++) {
        const bx = 0.148 - i * 0.05;
        const bw = 0.018 + (i % 2) * 0.005;
        c.beginPath();
        c.ellipse(bx, -0.084 + i * 0.005, bw * 0.72, 0.052 - i * 0.002, 0.22, 0, TAU);
        c.fillStyle = "rgba(56, 114, 126, 0.34)";
        c.fill();
      }

      // 3D cylindrical & cranium lighting (bright brow dome, snout, cheek, jaw highlight)
      glow(c, 0.262, -0.104 - headLift * 0.45, 0.078, 0.036, -0.1, "245,255,252", 0.5);
      glow(c, 0.376, 0.015, 0.085, 0.062, -0.25, "245,255,252", 0.36);
      glow(c, 0.02, -0.01, 0.24, 0.054, -0.06, "245,255,252", 0.42);

      // Organic clusters of charcoal-black flank & tail blotches (exact Image 2 pattern!)
      const spots: [number, number, number, number, number][] = [
        [0.12, -0.022, 0.007, 0.015, 0.08],
        [0.095, 0.01, 0.006, 0.009, 0.05],
        [0.064, -0.026, 0.008, 0.018, 0.04],
        [0.042, 0.008, 0.007, 0.012, 0.1],
        [0.012, -0.022, 0.01, 0.02, -0.05],
        [-0.012, 0.012, 0.006, 0.01, 0.0],
        [-0.042, -0.014, 0.01, 0.022, 0.05],
        [-0.066, -0.034, 0.007, 0.011, 0.0],
        [-0.086, -0.004, 0.009, 0.019, -0.05],
        [-0.106, -0.028, 0.008, 0.011, 0.08],
        [-0.124, 0.002, 0.008, 0.014, 0.02],
        [-0.152, -0.006, 0.009, 0.016, -0.04],
        [-0.178, 0.014, 0.006, 0.009, 0.0],
        [-0.204, -0.006, 0.007, 0.012, 0.06],
        [-0.232, 0.006, 0.007, 0.01, 0.0],
        [-0.26, 0.0, 0.006, 0.009, 0.0],
        [-0.288, 0.008, 0.006, 0.008, 0.0],
      ];
      c.fillStyle = "rgba(14, 24, 30, 0.9)";
      for (const [sx, sy, rx, ry, rot] of spots) {
        blob(c, sx, sy, rx, ry, rot);
      }

      // Tapered crescent shadow behind gill cover (sharp tips, no blunt grey bar ends!)
      c.beginPath();
      c.moveTo(0.214, -0.066);
      c.bezierCurveTo(0.18, 0.006, 0.19, 0.072, 0.234, 0.118);
      c.bezierCurveTo(0.204, 0.07, 0.196, 0.006, 0.214, -0.066);
      c.closePath();
      c.fillStyle = "rgba(22, 52, 62, 0.34)";
      c.fill();

      // Crisp sculpted gill cover line + lit cheek rim
      c.beginPath();
      c.moveTo(0.214, -0.066);
      c.bezierCurveTo(0.19, 0.006, 0.198, 0.072, 0.234, 0.118);
      c.strokeStyle = "rgba(26, 58, 68, 0.72)";
      c.lineWidth = 0.0054;
      c.stroke();

      c.beginPath();
      c.moveTo(0.221, -0.056);
      c.bezierCurveTo(0.198, 0.008, 0.206, 0.068, 0.24, 0.112);
      c.strokeStyle = "rgba(240, 255, 250, 0.5)";
      c.lineWidth = 0.004;
      c.stroke();

      // Strong 3D belly & chin under-shading for depth (matching Image 2!)
      c.fillStyle = lin(c, 0, 0.045, 0, 0.135, [
        [0, "rgba(24,56,66,0)"],
        [0.62, "rgba(24,56,66,0.22)"],
        [1, "rgba(16,38,46,0.52)"],
      ]);
      c.fillRect(-0.35, 0.025, 0.86, 0.12);
    }
  );

  // ---- 5. Closed Mouth Seam + Peeking Teeth & Sculpted Lower Lip Fold (blends cleanly away on wide gape!) ----
  if (gape === 0) {
    // Crisp dark mouth bite line sweeping from upturned chin tip down into mouth corner
    c.beginPath();
    c.moveTo(0.452, -0.057);
    c.quadraticCurveTo(0.416, -0.042, 0.388, -0.036);
    c.bezierCurveTo(0.35, -0.026, 0.314, 0.012, 0.294, 0.068);
    c.strokeStyle = OL;
    c.lineWidth = 0.0054;
    c.stroke();

    // Sharp little needle fangs peeking cleanly up along the jutting front lower jaw rim!
    teethRow(c, 0.406, -0.044, 0.452, -0.058, 4, -0.24, -0.97, (t) => 0.008 + t * 0.0042, 0.06, 0.94);
  }

  // Sculpted 3D fleshy bulldog lip/jowl fold on closed/nearly-closed mouth (fades smoothly as jaw opens wide!)
  const lipAlpha = Math.max(0, 1 - gape * 2.2);
  if (lipAlpha > 0.02) {
    c.save();
    c.globalAlpha = lipAlpha;
    const [sh0x, sh0y] = rotJ(0.398, -0.028);
    const [sh1x, sh1y] = rotJ(0.352, -0.006);
    const [sh2x, sh2y] = rotJ(0.312, 0.032);
    const [sh3x, sh3y] = rotJ(0.302, 0.098);
    c.beginPath();
    c.moveTo(sh0x, sh0y);
    c.bezierCurveTo(sh1x, sh1y, sh2x, sh2y, sh3x, sh3y);
    c.strokeStyle = "rgba(22, 52, 62, 0.32)";
    c.lineWidth = 0.011;
    c.stroke();

    const [l0x, l0y] = rotJ(0.432, -0.046);
    const [l1x, l1y] = rotJ(0.382, -0.032);
    const [l2x, l2y] = rotJ(0.33, -0.006);
    const [l3x, l3y] = rotJ(0.296, 0.048);
    const [l4x, l4y] = rotJ(0.283, 0.072);
    const [l5x, l5y] = rotJ(0.285, 0.098);
    const [l6x, l6y] = rotJ(0.302, 0.102);
    const [l7x, l7y] = rotJ(0.316, 0.102);
    const [l8x, l8y] = rotJ(0.322, 0.072);
    const [l9x, l9y] = rotJ(0.334, 0.044);
    const [l10x, l10y] = rotJ(0.356, 0.0);
    const [l11x, l11y] = rotJ(0.394, -0.022);
    const [gx0, gy0] = rotJ(0.32, -0.02);
    const [gx1, gy1] = rotJ(0.3, 0.102);

    fillStroke(
      c,
      () => {
        c.moveTo(l0x, l0y);
        c.bezierCurveTo(l1x, l1y, l2x, l2y, l3x, l3y);
        c.bezierCurveTo(l4x, l4y, l5x, l5y, l6x, l6y);
        c.bezierCurveTo(l7x, l7y, l8x, l8y, l9x, l9y);
        c.bezierCurveTo(l10x, l10y, l11x, l11y, l0x, l0y);
      },
      lin(c, gx0, gy0, gx1, gy1, [
        [0, "#eefcf8"],
        [0.48, "#bce8e4"],
        [1, "#82bec6"],
      ]),
      "rgba(28, 60, 70, 0.56)",
      0.004
    );
    c.restore();
  }

  // ---- 6. Prominent Swept Pectoral Fin Behind Lower Gill Edge (Image 2!) ----
  c.save();
  c.translate(0.184, 0.056);
  c.rotate(0.12 + p.wag2 * 0.14);
  fillStroke(
    c,
    () => {
      c.moveTo(0.008, -0.012);
      c.quadraticCurveTo(-0.046, 0.014, -0.088, 0.078);
      c.quadraticCurveTo(-0.048, 0.084, -0.004, 0.048);
      c.quadraticCurveTo(0.012, 0.024, 0.008, -0.012);
    },
    lin(c, 0.005, -0.005, -0.075, 0.072, [
      [0, FIN_D],
      [0.45, FIN_L],
      [1, "#f6f8e8"],
    ]),
    FIN_OL,
    LW * 0.68,
    () => {
      rayFan(
        c,
        0.004,
        0.006,
        [
          [-0.074, 0.064],
          [-0.06, 0.072],
          [-0.042, 0.07],
          [-0.022, 0.058],
        ],
        "rgba(122, 138, 92, 0.36)",
        0.0026
      );
    }
  );
  c.restore();

  // ---- 7. Larger, Fiercer 3D-Sculpted Predator Eye & Brow Positioned Strictly Above Eye ----
  const ex = 0.278;
  const ey = -0.064 - headLift * 0.44;
  const er = 0.04;

  // Deep recessed 3D orbital socket shadow
  glow(c, ex, ey, er * 1.48, er * 1.32, 0.15, "20,48,60", 0.44);

  // Sculpted under-eye cheek bag / lower eyelid cradle
  c.beginPath();
  c.arc(ex - 0.002, ey + 0.003, er * 1.12, Math.PI * 0.08, Math.PI * 0.88);
  c.strokeStyle = "rgba(28, 62, 72, 0.62)";
  c.lineWidth = 0.0054;
  c.stroke();

  if (p.expr === "happy") {
    c.beginPath();
    c.arc(ex, ey + er * 0.3, er * 0.78, Math.PI * 1.1, Math.PI * 1.9);
    c.strokeStyle = OL;
    c.lineWidth = Math.max(er * 0.24, 0.007);
    c.stroke();
  } else {
    const panic = p.expr === "panic";
    const sx = panic ? 1.08 : 0.98;
    const sy = panic ? 1.08 : 0.95;

    // 3D shaded eyeball sclera
    c.beginPath();
    c.ellipse(ex, ey, er * sx, er * sy, 0, 0, TAU);
    const sg = c.createRadialGradient(ex + er * 0.22, ey - er * 0.15, er * 0.08, ex, ey, er * 1.06);
    sg.addColorStop(0, "#ffffff");
    sg.addColorStop(0.68, "#eaf2f5");
    sg.addColorStop(1, "#94aeb8");
    c.fillStyle = sg;
    c.fill();

    c.save();
    c.clip();

    // Menacing glowing golden-bronze iris + sharp dark pupil + crisp specular highlights
    const ix = ex + er * (panic ? 0.28 : 0.18);
    const iy = ey + er * (panic ? 0.02 : 0.08);
    const ir = er * (panic ? 0.46 : 0.56);
    const pr = er * (panic ? 0.24 : 0.31);

    const ig = c.createRadialGradient(ix - ir * 0.2, iy - ir * 0.2, ir * 0.1, ix, iy, ir);
    ig.addColorStop(0, "#f5cc68");
    ig.addColorStop(0.55, "#c98528");
    ig.addColorStop(1, "#5c340b");
    c.fillStyle = ig;
    c.beginPath();
    c.arc(ix, iy, ir, 0, TAU);
    c.fill();

    c.fillStyle = "#080b10";
    c.beginPath();
    c.ellipse(ix + er * 0.02, iy, pr * 0.88, pr * 1.06, 0, 0, TAU);
    c.fill();

    // Twin glassy white highlights
    c.fillStyle = "rgba(255,255,255,0.98)";
    c.beginPath();
    c.arc(ix - pr * 0.48, iy - pr * 0.5, pr * 0.44, 0, TAU);
    c.fill();
    c.fillStyle = "rgba(210,245,255,0.75)";
    c.beginPath();
    c.arc(ix + pr * 0.42, iy + pr * 0.46, pr * 0.2, 0, TAU);
    c.fill();

    // Curved 3D muscular upper eyelid drooping menacingly over upper ~42% of the eye
    if (!panic) {
      c.beginPath();
      c.moveTo(ex - er * 1.3, ey - er * 1.3);
      c.lineTo(ex + er * 1.3, ey - er * 1.3);
      c.lineTo(ex + er * 1.3, ey + er * 0.04);
      c.quadraticCurveTo(ex + er * 0.1, ey - er * 0.08, ex - er * 1.3, ey - er * 0.34);
      c.closePath();
      c.fillStyle = lin(c, ex, ey - er * 1.1, ex, ey + er * 0.1, [
        [0, "#4c95a2"],
        [0.6, "#88cdd2"],
        [1, "#bcebe5"],
      ]);
      c.fill();

      c.beginPath();
      c.moveTo(ex - er * 1.2, ey - er * 0.32);
      c.quadraticCurveTo(ex + er * 0.1, ey - er * 0.06, ex + er * 1.2, ey + er * 0.04);
      c.strokeStyle = OL;
      c.lineWidth = er * 0.15;
      c.stroke();
    }
    c.restore();

    c.beginPath();
    c.ellipse(ex, ey, er * sx, er * sy, 0, 0, TAU);
    c.strokeStyle = OL;
    c.lineWidth = er * 0.13;
    c.stroke();
  }

  // Sculpted 3D brow ridge arching cleanly ABOVE the eyeball (never crossing inside the eyeball!)
  c.beginPath();
  c.moveTo(ex - 0.04, ey - 0.043);
  c.quadraticCurveTo(ex + 0.006, ey - 0.045, ex + 0.041, ey - 0.022);
  c.strokeStyle = "rgba(22, 52, 62, 0.84)";
  c.lineWidth = 0.0064;
  c.stroke();

  // Soft lit crest highlight along the brow ridge
  c.beginPath();
  c.moveTo(ex - 0.034, ey - 0.049);
  c.quadraticCurveTo(ex + 0.006, ey - 0.051, ex + 0.037, ey - 0.028);
  c.strokeStyle = "rgba(235, 255, 250, 0.55)";
  c.lineWidth = 0.0036;
  c.stroke();
}

// =====================================================================================
// KILAT (SAILFISH / MARLIN) — High-contrast Gambar 1 Blue Marlin:
//   deep midnight-cobalt dorsal with cyan highlights, vibrant golden-amber lateral band,
//   crisp pearly-white belly, electric-cyan vertical bars, tall arched sail dorsal fin,
//   razor sword bill, hinged crimson mouth, twin sleek ventral fins, crescent tail,
//   and a bright expressive Nemo-style glossy warm-brown eye!
// =====================================================================================
function drawSailfish(c: Ctx, sp: Species, p: Pose) {
  const pal = sp.pal;
  const DK = "#081c54",
    MID = "#154fb8",
    BLU = "#247ee6",
    CYAN = "#38c0ff",
    CYL = "#90e8ff";
  const GOLD = "#ffaa08",
    YEL = "#ffe44d",
    ORG = "#e56a00";
  const WH = "#ffffff",
    BEL_SH = "#c4d9f0";
  const OL = rgba(pal.outline || "#071638", 0.94);
  const LW = 0.0074;
  const s = p.wag,
    s2 = p.wag2;

  // ---- 1. Back layers: small rear finlets, anal fin, twin rear ventral fin ----
  // Rear small dorsal finlet
  fillStroke(
    c,
    () => {
      c.moveTo(-0.258, -0.036);
      c.quadraticCurveTo(-0.278, -0.072, -0.304, -0.064);
      c.quadraticCurveTo(-0.29, -0.038, -0.292, -0.025);
    },
    lin(c, -0.28, -0.072, -0.28, -0.025, [
      [0, DK],
      [1, MID],
    ]),
    OL,
    LW * 0.72
  );

  // Rear small anal finlet
  fillStroke(
    c,
    () => {
      c.moveTo(-0.252, 0.034);
      c.quadraticCurveTo(-0.274, 0.066, -0.296, 0.056);
      c.quadraticCurveTo(-0.286, 0.036, -0.288, 0.024);
    },
    lin(c, -0.27, 0.024, -0.27, 0.065, [
      [0, MID],
      [1, DK],
    ]),
    OL,
    LW * 0.72
  );

  // Main rear anal fin
  fillStroke(
    c,
    () => {
      c.moveTo(-0.135, 0.058);
      c.bezierCurveTo(-0.17, 0.092, -0.215, 0.138, -0.236, 0.152 + s2 * 0.01);
      c.bezierCurveTo(-0.222, 0.112, -0.218, 0.076, -0.222, 0.044);
    },
    lin(c, -0.17, 0.05, -0.22, 0.15, [
      [0, BLU],
      [0.45, MID],
      [1, DK],
    ]),
    OL,
    LW * 0.85,
    () => {
      rayFan(
        c,
        -0.155,
        0.056,
        [
          [-0.232, 0.146],
          [-0.218, 0.115],
          [-0.215, 0.085],
        ],
        "rgba(8,22,68,0.5)",
        0.0028
      );
    }
  );

  // Back twin pelvic/ventral blade (shorter rear blade)
  fillStroke(
    c,
    () => {
      c.moveTo(0.116, 0.09);
      c.bezierCurveTo(0.085, 0.145, 0.045, 0.195, -0.015, 0.226 + s2 * 0.01);
      c.bezierCurveTo(0.032, 0.18, 0.07, 0.135, 0.095, 0.092);
    },
    lin(c, 0.1, 0.09, 0.0, 0.22, [
      [0, MID],
      [1, DK],
    ]),
    OL,
    LW * 0.8
  );

  // ---- 2. Tall Sweeping Sail Dorsal Fin (iconic silhouette from Gambar 1!) ----
  const dPeakX = 0.032 + s2 * 0.012;
  const dPeakY = -0.268;
  fillStroke(
    c,
    () => {
      c.moveTo(0.165, -0.098);
      c.bezierCurveTo(0.135, -0.178, 0.085, -0.238, dPeakX, dPeakY);
      // Graceful scalloped descending ridge back to the lower dorsal base
      c.bezierCurveTo(0.036, -0.215, 0.018, -0.188, -0.015, -0.182 + s2 * 0.005);
      c.quadraticCurveTo(-0.042, -0.16, -0.068, -0.154 + s2 * 0.006);
      c.quadraticCurveTo(-0.098, -0.136, -0.125, -0.128 + s2 * 0.006);
      c.quadraticCurveTo(-0.155, -0.108, -0.182, -0.096 + s2 * 0.005);
      c.quadraticCurveTo(-0.214, -0.074, -0.246, -0.056);
      c.quadraticCurveTo(-0.04, -0.088, 0.165, -0.098);
    },
    lin(c, 0.03, dPeakY, 0.0, -0.075, [
      [0, "#0b1a52"],
      [0.36, "#1846a8"],
      [0.75, "#2672d8"],
      [1, "#44a6ff"],
    ]),
    OL,
    LW * 0.92,
    () => {
      // Dark indigo upper crest band & crisp fin-spine rays
      c.fillStyle = "rgba(10, 18, 62, 0.42)";
      c.beginPath();
      c.moveTo(0.165, -0.098);
      c.bezierCurveTo(0.135, -0.178, 0.085, -0.238, dPeakX, dPeakY);
      c.lineTo(-0.246, -0.056);
      c.lineTo(0.06, -0.175);
      c.closePath();
      c.fill();

      c.strokeStyle = "rgba(10, 22, 70, 0.55)";
      c.lineWidth = 0.0032;
      const rays: [number, number, number, number][] = [
        [0.12, -0.098, 0.045, -0.245],
        [0.085, -0.1, 0.024, -0.22],
        [0.05, -0.1, -0.012, -0.18],
        [0.015, -0.096, -0.056, -0.155],
        [-0.025, -0.09, -0.105, -0.132],
        [-0.07, -0.082, -0.158, -0.104],
        [-0.12, -0.072, -0.208, -0.078],
      ];
      c.beginPath();
      for (const [x0, y0, x1, y1] of rays) {
        c.moveTo(x0, y0);
        c.lineTo(x1, y1);
      }
      c.stroke();

      // Subtle icy-cyan highlight veins on tall front sail
      c.strokeStyle = "rgba(130, 215, 255, 0.35)";
      c.lineWidth = 0.0024;
      c.beginPath();
      c.moveTo(0.135, -0.105);
      c.quadraticCurveTo(0.095, -0.185, dPeakX + 0.008, dPeakY + 0.022);
      c.moveTo(0.095, -0.102);
      c.quadraticCurveTo(0.06, -0.165, 0.026, -0.215);
      c.stroke();
    }
  );

  // ---- 3. Sleek Crescent Forked Caudal Tail ----
  const tx = -0.34,
    tw = s * 0.032;
  fillStroke(
    c,
    () => {
      c.moveTo(tx + 0.01, -0.016);
      c.bezierCurveTo(-0.375, -0.068, -0.425, -0.138, -0.474, -0.176 + tw);
      c.bezierCurveTo(-0.436, -0.108, -0.408, -0.045, -0.398, tw * 0.3);
      c.bezierCurveTo(-0.41, 0.055, -0.436, 0.118, -0.468, 0.184 + tw);
      c.bezierCurveTo(-0.422, 0.14, -0.376, 0.072, tx + 0.01, 0.018);
    },
    lin(c, -0.34, 0, -0.47, 0, [
      [0, MID],
      [0.45, DK],
      [1, "#07143e"],
    ]),
    OL,
    LW * 0.9,
    () => {
      // Bright cobalt inner tail edge + crisp rays
      c.strokeStyle = "rgba(105, 195, 255, 0.42)";
      c.lineWidth = 0.0034;
      c.beginPath();
      c.moveTo(-0.36, -0.022);
      c.quadraticCurveTo(-0.41, -0.09, -0.464, -0.16 + tw);
      c.moveTo(-0.36, 0.022);
      c.quadraticCurveTo(-0.41, 0.09, -0.458, 0.168 + tw);
      c.stroke();

      rayFan(
        c,
        -0.345,
        0,
        [
          [-0.452, -0.138 + tw],
          [-0.432, -0.088 + tw],
          [-0.406, -0.035 + tw * 0.4],
          [-0.408, 0.042 + tw * 0.4],
          [-0.432, 0.098 + tw],
          [-0.45, 0.146 + tw],
        ],
        "rgba(9, 24, 72, 0.55)",
        0.0028
      );
    }
  );

  // ---- 4. Articulated Mouth Interior & Hinged Lower Jaw (under upper sword bill) ----
  const hx = 0.222,
    hy = 0.022;
  const jawTipX = 0.344 - p.open * 0.014;
  const jawTipY = 0.012 + p.open * 0.068;

  if (p.open > 0.02) {
    // Deep crimson oral cavity cleanly tucked between upper palate & lower jaw
    const palTipX = 0.34 - p.open * 0.004;
    const palTipY = 0.007;
    c.beginPath();
    c.moveTo(0.214, 0.016);
    c.lineTo(palTipX, palTipY);
    c.quadraticCurveTo(0.295, 0.02 + p.open * 0.02, jawTipX, jawTipY);
    c.quadraticCurveTo(0.268, 0.044 + p.open * 0.01, hx, hy);
    c.closePath();
    c.fillStyle = lin(c, 0.21, 0.01, 0.34, 0.06, [
      [0, "#460914"],
      [0.55, "#861628"],
      [1, "#b42c42"],
    ]);
    c.fill();

    // Soft curved coral-pink tongue inside lower jaw
    c.beginPath();
    c.moveTo(0.238, 0.032 + p.open * 0.014);
    c.quadraticCurveTo(0.284, 0.024 + p.open * 0.032, 0.318, 0.028 + p.open * 0.048);
    c.quadraticCurveTo(0.278, 0.044 + p.open * 0.04, 0.238, 0.038 + p.open * 0.018);
    c.closePath();
    c.fillStyle = "#e45e72";
    c.fill();
  }

  // ---- 5. Main Streamlined Marlin Body + Sword Bill + Integrated Lower Jaw ----
  fillStroke(
    c,
    () => {
      // Tail peduncle top forward up along sleek arched cobalt back
      c.moveTo(-0.342, -0.018);
      c.bezierCurveTo(-0.24, -0.056, -0.08, -0.104, 0.075, -0.104);
      // Forehead sweep cleanly onto razor-sharp upper sword bill tip
      c.bezierCurveTo(0.155, -0.104, 0.218, -0.072, 0.285, -0.042);
      c.quadraticCurveTo(0.385, -0.022, 0.486, -0.008);
      // Underside of bill cleanly to mouth corner / sleek protruding lower jaw (NO sad gap!)
      if (p.open > 0.02) {
        c.quadraticCurveTo(0.382, -0.001, 0.285, 0.008);
        c.quadraticCurveTo(0.242, 0.014, hx, hy);
        c.lineTo(jawTipX, jawTipY);
        c.quadraticCurveTo(0.285, 0.056 + p.open * 0.034, 0.195, 0.082 + p.open * 0.014);
      } else {
        c.quadraticCurveTo(0.382, -0.001, 0.344, 0.009);
        c.quadraticCurveTo(0.352, 0.014, 0.34, 0.022);
        c.quadraticCurveTo(0.282, 0.054, 0.195, 0.082);
      }
      // Graceful curved pearly-white belly tapering cleanly to tail peduncle
      c.bezierCurveTo(0.085, 0.106, -0.075, 0.094, -0.342, 0.018);
    },
    WH,
    OL,
    LW,
    () => {
      // A) Cool pearly belly contour shading at bottom edge
      c.fillStyle = lin(c, 0, 0.02, 0, 0.115, [
        [0, WH],
        [0.62, "#f0f7ff"],
        [1, BEL_SH],
      ]);
      c.fillRect(-0.36, 0.01, 0.86, 0.13);

      // B) Vibrant Golden-Amber-Orange Mid-Flank Band (from behind cheek to tail!)
      c.fillStyle = lin(c, 0, -0.038, 0, 0.065, [
        [0, "rgba(255, 228, 77, 0)"],
        [0.24, YEL],
        [0.54, GOLD],
        [0.78, ORG],
        [1, "rgba(255, 190, 60, 0)"],
      ]);
      c.beginPath();
      c.moveTo(-0.35, -0.012);
      c.bezierCurveTo(-0.15, -0.036, 0.08, -0.048, 0.258, -0.032);
      c.lineTo(0.258, 0.056);
      c.bezierCurveTo(0.06, 0.066, -0.15, 0.044, -0.35, 0.016);
      c.closePath();
      c.fill();

      // C) Deep Midnight-Navy to Royal-Cobalt Dorsal Coat + Sword Top Bevel
      c.fillStyle = lin(c, 0, -0.115, 0, 0.012, [
        [0, DK],
        [0.42, MID],
        [0.78, BLU],
        [1, "rgba(36, 126, 230, 0)"],
      ]);
      c.beginPath();
      c.moveTo(-0.35, -0.026);
      c.bezierCurveTo(-0.2, -0.075, 0.0, -0.12, 0.22, -0.112);
      c.lineTo(0.495, -0.012);
      c.lineTo(0.495, -0.002);
      c.bezierCurveTo(0.32, -0.012, 0.15, -0.012, -0.02, -0.014);
      c.bezierCurveTo(-0.16, -0.014, -0.26, -0.006, -0.35, -0.002);
      c.closePath();
      c.fill();

      // D) Warm golden-cream underside along the sharp sword bill
      c.fillStyle = lin(c, 0.28, -0.004, 0.48, -0.004, [
        [0, "#ffd892"],
        [1, "#fff6dd"],
      ]);
      c.beginPath();
      c.moveTo(0.25, 0.002);
      c.lineTo(0.488, -0.008);
      c.lineTo(0.28, 0.016);
      c.closePath();
      c.fill();

      // E) Electric Sky-Cyan Vertical Marlin Stripes descending down the dorsal & gold band!
      const stripeXs = [0.135, 0.095, 0.054, 0.012, -0.03, -0.072, -0.114, -0.156, -0.196, -0.236, -0.274, -0.31];
      for (let i = 0; i < stripeXs.length; i++) {
        const sx = stripeXs[i];
        const w = 0.012 - i * 0.00055;
        const botY = 0.032 - i * 0.0018;
        c.fillStyle = lin(c, sx, -0.095, sx, botY, [
          [0, CYL],
          [0.45, CYAN],
          [0.85, "rgba(56, 192, 255, 0.65)"],
          [1, "rgba(56, 192, 255, 0)"],
        ]);
        c.beginPath();
        c.moveTo(sx - w * 0.45, -0.11);
        c.quadraticCurveTo(sx + 0.006, -0.04, sx - w * 0.35, botY);
        c.lineTo(sx + w * 0.65, botY);
        c.quadraticCurveTo(sx + w + 0.006, -0.04, sx + w * 0.75, -0.11);
        c.closePath();
        c.fill();
      }

      // F) Sleek Bright Aqua Dorsal Specular Highlight Streak along the upper shoulder
      c.strokeStyle = "rgba(165, 238, 255, 0.78)";
      c.lineWidth = 0.0085;
      c.beginPath();
      c.moveTo(-0.26, -0.038);
      c.bezierCurveTo(-0.1, -0.076, 0.06, -0.088, 0.215, -0.064);
      c.stroke();

      // Subtle glossy highlight ridge along top of the sword bill
      c.strokeStyle = "rgba(180, 240, 255, 0.7)";
      c.lineWidth = 0.0038;
      c.beginPath();
      c.moveTo(0.24, -0.056);
      c.quadraticCurveTo(0.35, -0.025, 0.47, -0.01);
      c.stroke();

      // G) Curved Gill Plate (Operculum) & Lower Cheek Arcs (matching Gambar 1!)
      c.strokeStyle = "rgba(32, 66, 118, 0.72)";
      c.lineWidth = 0.0044;
      c.beginPath();
      c.moveTo(0.175, -0.042);
      c.bezierCurveTo(0.145, 0.005, 0.155, 0.062, 0.21, 0.086);
      c.moveTo(0.194, -0.024);
      c.bezierCurveTo(0.172, 0.012, 0.18, 0.056, 0.222, 0.076);
      c.stroke();

      // Fine radiating gill-cover creases on silver-white cheek
      c.strokeStyle = "rgba(75, 112, 155, 0.45)";
      c.lineWidth = 0.0026;
      c.beginPath();
      c.moveTo(0.172, 0.045);
      c.quadraticCurveTo(0.195, 0.058, 0.224, 0.062);
      c.moveTo(0.178, 0.058);
      c.quadraticCurveTo(0.198, 0.068, 0.222, 0.072);
      c.stroke();
    }
  );

  // Confident, sleek marlin mouth line with gentle upward corner (no sad droop!)
  if (p.open <= 0.02) {
    c.beginPath();
    c.moveTo(0.342, 0.011);
    c.quadraticCurveTo(0.282, 0.02, 0.226, 0.016);
    c.quadraticCurveTo(0.22, 0.014, 0.216, 0.01);
    c.strokeStyle = OL;
    c.lineWidth = LW * 0.78;
    c.stroke();
  }

  // ---- 6. Front Long Sleek Pelvic/Ventral Fin (cobalt blue + icy white accent stripe) ----
  fillStroke(
    c,
    () => {
      c.moveTo(0.128, 0.088);
      c.bezierCurveTo(0.106, 0.158, 0.078, 0.214, 0.036, 0.252 + s2 * 0.012);
      c.bezierCurveTo(0.068, 0.2, 0.095, 0.142, 0.108, 0.092);
    },
    lin(c, 0.12, 0.09, 0.04, 0.25, [
      [0, MID],
      [0.6, DK],
      [1, "#07143e"],
    ]),
    OL,
    LW * 0.85,
    () => {
      c.strokeStyle = "rgba(215, 240, 255, 0.78)";
      c.lineWidth = 0.0042;
      c.beginPath();
      c.moveTo(0.118, 0.096);
      c.quadraticCurveTo(0.095, 0.152, 0.064, 0.205);
      c.stroke();
    }
  );

  // ---- 7. Sleek Swept Pectoral Fin across flank ----
  c.save();
  c.translate(0.14, 0.034);
  c.rotate(-0.08 + s2 * 0.1);
  fillStroke(
    c,
    () => {
      c.moveTo(0.0, -0.014);
      c.bezierCurveTo(-0.055, -0.022, -0.135, -0.002, -0.195, 0.024);
      c.bezierCurveTo(-0.132, 0.036, -0.058, 0.044, -0.002, 0.018);
    },
    lin(c, 0.0, -0.015, -0.18, 0.025, [
      [0, BLU],
      [0.5, MID],
      [1, DK],
    ]),
    OL,
    LW * 0.86,
    () => {
      // Crisp bright cyan-ice highlight along upper leading edge of pectoral fin
      c.strokeStyle = "rgba(130, 222, 255, 0.65)";
      c.lineWidth = 0.004;
      c.beginPath();
      c.moveTo(-0.006, -0.01);
      c.bezierCurveTo(-0.058, -0.016, -0.128, 0.0, -0.182, 0.022);
      c.stroke();

      rayFan(
        c,
        0.0,
        0.002,
        [
          [-0.165, 0.018],
          [-0.135, 0.025],
          [-0.1, 0.028],
        ],
        "rgba(8, 22, 68, 0.55)",
        0.0026
      );
    }
  );
  c.restore();

  // ---- 8. Expressive Glossy NEMO-Style Eye (friendly, bright, warm brown iris!) ----
  const ex = 0.24,
    ey = -0.02 - p.open * 0.003,
    er = 0.038;
  // Subtle clean orbital crease below & above eye
  c.beginPath();
  c.arc(ex, ey, er * 1.15, Math.PI * 0.12, Math.PI * 0.78);
  c.strokeStyle = "rgba(38, 72, 128, 0.45)";
  c.lineWidth = 0.004;
  c.stroke();

  eye(c, ex, ey, er, {
    iris: "#7a3b12",
    expr: p.expr,
    ol: rgba("#071638", 0.92),
    sx: 0.94,
    look: 0.28,
    irisR: 0.56,
    pupilR: 0.36,
    happyCol: "#ffffff",
  });

  // Clean bright cobalt brow highlight arc above eye (sleek, NOT angry!)
  c.beginPath();
  c.moveTo(ex - 0.036, ey - 0.034);
  c.quadraticCurveTo(ex, ey - 0.048, ex + 0.036, ey - 0.026);
  c.strokeStyle = "rgba(110, 210, 255, 0.65)";
  c.lineWidth = 0.0038;
  c.stroke();
}

// =====================================================================================
// EDDY — Deep-sea Anglerfish 100% inspired by Gambar 1 silhouette, slanted underbite jaw,
// gracefully curved ivory crescent tusks, animated flared gill fin, cool downward-sloped
// 1-eye side-view eyelid, and glowing ELECTRIC NEON-BLUE bioluminescent esca lure!
// =====================================================================================
function drawEddy(c: Ctx, sp: Species, p: Pose) {
  const pal = sp.pal;
  const HI = "#b8ea3a",
    BODY = pal.body || "#8cc828",
    DARK = pal.dark || "#548a16",
    DEEP = "#2d5209";
  const OL = rgba(pal.outline || "#132b05", 0.94);
  const LURE = pal.lure || "#1ce8ff";
  const LW = 0.0082;
  const s = p.wag,
    s2 = p.wag2;

  // Helper: draw a slender, gracefully curved ivory crescent tusk
  // outSign = 1 for upward lower tusks (+x bow), -1 for downward upper tusks (+x bow)
  const curvedTusk = (
    bx: number,
    by: number,
    tx: number,
    ty: number,
    bow: number,
    hw: number,
    outSign = 1,
    tone: "ivory" | "inner" = "ivory"
  ) => {
    const dx = tx - bx,
      dy = ty - by;
    const len = Math.hypot(dx, dy) || 1;
    const nx = (outSign * -dy) / len,
      ny = (outSign * dx) / len;
    const outCtrlX = bx + dx * 0.45 + nx * (bow * 1.4 + hw * 0.46);
    const outCtrlY = by + dy * 0.45 + ny * (bow * 1.4 + hw * 0.46);
    const inCtrlX = bx + dx * 0.56 + nx * (bow * 0.56 - hw * 0.4);
    const inCtrlY = by + dy * 0.56 + ny * (bow * 0.56 - hw * 0.4);

    fillStroke(
      c,
      () => {
        c.moveTo(bx + nx * hw, by + ny * hw);
        c.quadraticCurveTo(outCtrlX, outCtrlY, tx, ty);
        c.quadraticCurveTo(inCtrlX, inCtrlY, bx - nx * hw, by - ny * hw);
        c.quadraticCurveTo(bx, by + outSign * hw * 0.42, bx + nx * hw, by + ny * hw);
      },
      tone === "inner"
        ? lin(c, bx, by, tx, ty, [
            [0, "#756d49"],
            [0.5, "#b8ae82"],
            [1, "#e2dac0"],
          ])
        : lin(c, bx, by, tx, ty, [
            [0, "#a89d6c"],
            [0.38, "#ebe2b8"],
            [0.82, "#fffdf2"],
            [1, "#ffffff"],
          ]),
      OL,
      LW * 0.58,
      tone === "ivory"
        ? () => {
            c.strokeStyle = "rgba(255, 255, 255, 0.72)";
            c.lineWidth = hw * 0.32;
            c.beginPath();
            c.moveTo(bx + nx * hw * 0.34, by + ny * hw * 0.34);
            c.quadraticCurveTo(
              bx + dx * 0.48 + nx * (bow * 1.15),
              by + dy * 0.48 + ny * (bow * 1.15),
              tx - dx * 0.08,
              ty - dy * 0.08
            );
            c.stroke();
          }
        : undefined
    );
  };

  // ---- 1. Ragged-edged webbed caudal tail fan (khas Gambar 2!) ----
  c.save();
  c.translate(-0.278, 0.028);
  c.rotate(s * 0.28);
  fillStroke(
    c,
    () => {
      c.moveTo(0.015, -0.018);
      c.bezierCurveTo(-0.045, -0.068, -0.105, -0.098, -0.156, -0.112);
      c.lineTo(-0.128, -0.056);
      c.lineTo(-0.165, -0.022);
      c.lineTo(-0.132, 0.014);
      c.lineTo(-0.156, 0.062);
      c.lineTo(-0.122, 0.072);
      c.lineTo(-0.136, 0.116);
      c.bezierCurveTo(-0.082, 0.098, -0.032, 0.062, 0.015, 0.022);
    },
    lin(c, 0, 0, -0.155, 0, [
      [0, BODY],
      [0.58, DARK],
      [1, DEEP],
    ]),
    OL,
    LW * 0.85,
    () => {
      c.fillStyle = "rgba(38, 72, 10, 0.42)";
      blob(c, -0.09, -0.032, 0.016, 0.01, -0.2);
      blob(c, -0.105, 0.028, 0.018, 0.011, 0.2);
      rayFan(
        c,
        0.01,
        0,
        [
          [-0.142, -0.098],
          [-0.152, -0.022],
          [-0.145, 0.055],
          [-0.128, 0.104],
        ],
        rgba(OL, 0.5),
        0.0036
      );
    }
  );
  c.restore();

  // ---- 2. Serrated jagged dorsal crest along arched back (khas Gambar 2!) ----
  const dorsalSpines: [number, number, number, number, number, number][] = [
    [-0.01, -0.148, -0.04, -0.208, -0.068, -0.138],
    [-0.06, -0.14, -0.096, -0.188, -0.126, -0.114],
    [-0.118, -0.116, -0.156, -0.154, -0.18, -0.084],
    [-0.174, -0.088, -0.208, -0.116, -0.232, -0.048],
  ];
  for (const [x0, y0, tx, ty, x1, y1] of dorsalSpines) {
    fillStroke(
      c,
      () => {
        c.moveTo(x0, y0 + 0.018);
        c.lineTo(tx, ty + s2 * 0.01);
        c.lineTo((tx + x1) * 0.5, ty + 0.016 + s2 * 0.007);
        c.lineTo(tx - 0.022, ty + 0.014 + s2 * 0.007);
        c.lineTo(x1, y1 + 0.018);
      },
      lin(c, x0, ty, x0, y0, [
        [0, DARK],
        [1, BODY],
      ]),
      OL,
      LW * 0.72
    );
  }

  // ---- 3. Ragged small pelvic fin under curved belly (Gambar 2) ----
  c.save();
  c.translate(-0.005, 0.152);
  c.rotate(s2 * 0.16);
  fillStroke(
    c,
    () => {
      c.moveTo(-0.022, -0.008);
      c.lineTo(-0.068, 0.092);
      c.lineTo(-0.042, 0.076);
      c.lineTo(-0.036, 0.114);
      c.lineTo(-0.016, 0.08);
      c.lineTo(0.006, 0.102);
      c.lineTo(0.026, -0.004);
    },
    lin(c, -0.02, -0.01, -0.036, 0.11, [
      [0, BODY],
      [1, DARK],
    ]),
    OL,
    LW * 0.75,
    () => {
      rayFan(
        c,
        0,
        0,
        [
          [-0.062, 0.082],
          [-0.032, 0.104],
          [0, 0.092],
        ],
        rgba(OL, 0.45),
        0.003
      );
    }
  );
  c.restore();

  // ---- 4. Tall Bioluminescent Esca Stalk & Glowing ELECTRIC NEON-BLUE Bulb ----
  const lx = 0.365,
    ly = -0.202 + s2 * 0.02;
  glow(c, lx, ly, 0.16, 0.16, 0, "20, 210, 255", 0.85);
  glow(c, lx, ly, 0.08, 0.08, 0, "185, 248, 255", 0.96);

  // Smooth arched stalk springing cleanly from upper brow (strictly side-view, NO second eye!)
  c.beginPath();
  c.moveTo(0.088, -0.145);
  c.bezierCurveTo(0.088, -0.355, 0.325, -0.422, lx, ly - 0.038);
  c.strokeStyle = OL;
  c.lineWidth = 0.028;
  c.stroke();
  c.strokeStyle = lin(c, 0.088, -0.145, lx, ly, [
    [0, DARK],
    [0.52, BODY],
    [0.82, "#32c6b8"],
    [1, "#5ceeff"],
  ]);
  c.lineWidth = 0.014;
  c.stroke();

  // Glowing electric neon-blue teardrop lure bulb
  fillStroke(
    c,
    () => {
      c.moveTo(lx, ly - 0.044);
      c.bezierCurveTo(lx + 0.036, ly - 0.025, lx + 0.046, ly + 0.036, lx, ly + 0.046);
      c.bezierCurveTo(lx - 0.046, ly + 0.036, lx - 0.036, ly - 0.025, lx, ly - 0.044);
    },
    lin(c, lx - 0.012, ly - 0.032, lx + 0.012, ly + 0.042, [
      [0, "#f2fdff"],
      [0.34, LURE],
      [0.74, "#009dff"],
      [1, "#0055cc"],
    ]),
    "#004499",
    LW * 0.65,
    () => {
      c.fillStyle = "rgba(255,255,255,0.95)";
      blob(c, lx - 0.012, ly - 0.012, 0.011, 0.016, 0.3);
    }
  );

  // ---- 5. Dramatic Gambar 1 Wide-Open Jaw Hinge, Throat Cavern, Tongue & Far Rim Teeth ----
  const hx = 0.118,
    hy = 0.146;
  const upLift = p.open * 0.036;
  const jawOpenAng = p.open * 0.84; // Dramatic ~48° wide cavern gape when mangap!
  const rJaw = Math.hypot(0.358 - hx, 0.048 - hy);
  const a0 = Math.atan2(0.048 - hy, 0.358 - hx);
  const a1 = a0 + jawOpenAng;
  const jTipX = hx + Math.cos(a1) * rJaw;
  const jTipY = hy + Math.sin(a1) * rJaw;

  if (p.open > 0.02) {
    const uTipX = 0.335 - p.open * 0.008;
    const uTipY = 0.008 - upLift;

    // Deep abyssal mouth cavern bridging lifted upper snout & swung-down lower jaw
    c.beginPath();
    c.moveTo(uTipX, uTipY);
    c.quadraticCurveTo(0.245, 0.062 - upLift * 0.3, hx, hy);
    c.lineTo(jTipX, jTipY);
    c.quadraticCurveTo((uTipX + jTipX) * 0.52, (uTipY + jTipY) * 0.52, uTipX, uTipY);
    c.closePath();
    c.fillStyle = lin(c, hx, 0.03, (uTipX + jTipX) * 0.5, (uTipY + jTipY) * 0.5, [
      [0, "#0a1404"],
      [0.45, "#260b12"],
      [1, "#4e1422"],
    ]);
    c.fill();

    // Subtle far-side inner curved needle fangs for 3D Gambar 1 jaw depth!
    const innerScale = Math.min(1, Math.max(0, (p.open - 0.2) / 0.45));
    if (innerScale > 0.05) {
      // Far upper rim fangs curving down-inward
      curvedTusk(0.295, 0.026 - upLift * 0.7, 0.275, 0.026 - upLift * 0.7 + 0.072 * innerScale, 0.012 * innerScale, 0.0068, -1, "inner");
      curvedTusk(0.245, 0.048 - upLift * 0.4, 0.228, 0.048 - upLift * 0.4 + 0.064 * innerScale, 0.01 * innerScale, 0.0062, -1, "inner");
    }

    // Fleshy textured coral-terracotta tongue resting on floor of open lower jaw (Gambar 1!)
    c.save();
    c.translate(hx, hy);
    c.rotate(jawOpenAng * 0.86);
    c.translate(-hx, -hy);
    c.beginPath();
    c.moveTo(0.142, 0.145);
    c.bezierCurveTo(0.205, 0.088, 0.285, 0.062, 0.328, 0.088);
    c.bezierCurveTo(0.285, 0.135, 0.205, 0.165, 0.142, 0.145);
    c.closePath();
    c.fillStyle = lin(c, 0.15, 0.14, 0.32, 0.08, [
      [0, "#68212b"],
      [0.52, "#a8444e"],
      [1, "#d87066"],
    ]);
    c.fill();
    c.strokeStyle = "rgba(55, 14, 20, 0.65)";
    c.lineWidth = 0.004;
    c.stroke();
    // Subtle tongue center groove
    c.beginPath();
    c.moveTo(0.165, 0.136);
    c.quadraticCurveTo(0.235, 0.1, 0.305, 0.095);
    c.strokeStyle = "rgba(85, 22, 30, 0.55)";
    c.lineWidth = 0.0036;
    c.stroke();
    c.restore();

    // Stretched muscular jaw corner tendon fold (Gambar 1!)
    c.beginPath();
    c.moveTo(0.168, 0.082);
    c.quadraticCurveTo(0.135, 0.135, 0.162, 0.195);
    c.strokeStyle = "rgba(18, 36, 8, 0.65)";
    c.lineWidth = 0.007;
    c.stroke();
  }

  // ---- 6. Body Silhouette (Gambar 2 Closed Scoop-Jaw + Gambar 1 Dramatic Open Gape) ----
  const body = () => {
    // Graceful slender peduncle curving cleanly up along arched back & steep sloped snout
    c.moveTo(-0.278, 0.012);
    c.bezierCurveTo(-0.2, -0.095, -0.065, -0.158, 0.08, -0.156);
    c.bezierCurveTo(0.182, -0.154, 0.258, -0.092 - upLift * 0.4, 0.338 - p.open * 0.008, 0.008 - upLift);
    if (p.open > 0.02) {
      // Open bite contour: lifted upper lip -> cheek hinge -> swung-open lower jaw -> rounded scoop chin
      c.quadraticCurveTo(0.245, 0.065 - upLift * 0.3, hx, hy);
      c.lineTo(jTipX, jTipY);
      c.bezierCurveTo(
        jTipX - 0.008,
        jTipY + 0.058,
        0.245,
        0.348,
        0.13,
        0.326
      );
    } else {
      // Gambar 2 closed underbite: protruding lower lip sloping cleanly down-back to firm rounded chin!
      c.bezierCurveTo(0.355, 0.024, 0.365, 0.048, 0.348, 0.096);
      c.bezierCurveTo(0.305, 0.195, 0.225, 0.292, 0.142, 0.31);
      c.quadraticCurveTo(0.115, 0.316, 0.092, 0.304);
    }
    // Deep heavy round chin/jowl sweeping up sharply into pinched arched belly waist & peduncle
    c.bezierCurveTo(0.012, 0.295, -0.045, 0.082, -0.278, 0.048);
  };

  fillStroke(
    c,
    body,
    lin(c, 0.06, -0.16, 0.06, 0.32, [
      [0, HI],
      [0.44, BODY],
      [0.84, DARK],
      [1, DEEP],
    ]),
    OL,
    LW,
    () => {
      // Soft bright chartreuse highlight on brow & upper cheek
      glow(c, 0.12, -0.095, 0.145, 0.068, 0.14, "230,255,145", 0.45);
      // Bold rounded C-curve cheek/jowl muscle fold rising smoothly to gill fin base (Gambar 2!)
      c.strokeStyle = rgba(DEEP, 0.56);
      c.lineWidth = 0.0085;
      c.beginPath();
      c.moveTo(0.042, 0.258);
      c.bezierCurveTo(-0.025, 0.145, -0.018, 0.012, 0.078, -0.022);
      c.stroke();
      // Subtle 3 oval olive skin bumps on plump lower cheek (Gambar 2!)
      c.fillStyle = DARK;
      c.strokeStyle = rgba(DEEP, 0.5);
      c.lineWidth = 0.003;
      for (const [bx, by, br] of [
        [0.058, 0.082, 0.011],
        [0.085, 0.102, 0.008],
        [0.032, 0.1, 0.008],
      ]) {
        c.beginPath();
        c.ellipse(bx, by, br * 1.25, br * 0.85, -0.1, 0, TAU);
        c.fill();
        c.stroke();
      }
    }
  );

  // ---- 7A. Upper Curved Needle Tusks matching Lower Tusks (appear smoothly on mangap!) ----
  const uTooth = Math.min(1, Math.max(0, (p.open - 0.03) / 0.28));
  if (uTooth > 0.04) {
    const upperFangs: [number, number, number, number, number, number][] = [
      // [baseX, baseY, tipX, tipY, bow, halfWidth (5% slimmer!)]
      [0.326, 0.002 - upLift, 0.296, 0.002 - upLift + 0.118 * uTooth, 0.022 * uTooth, 0.0102],
      [0.294, 0.014 - upLift * 0.85, 0.264, 0.014 - upLift * 0.85 + 0.116 * uTooth, 0.026 * uTooth, 0.0124],
      [0.254, 0.032 - upLift * 0.65, 0.228, 0.032 - upLift * 0.65 + 0.098 * uTooth, 0.022 * uTooth, 0.0115],
      [0.214, 0.052 - upLift * 0.45, 0.194, 0.052 - upLift * 0.45 + 0.074 * uTooth, 0.016 * uTooth, 0.0098],
      [0.174, 0.072 - upLift * 0.25, 0.16, 0.072 - upLift * 0.25 + 0.052 * uTooth, 0.011 * uTooth, 0.0084],
    ];
    for (const [bx, by, tx, ty, bow, hw] of upperFangs) {
      curvedTusk(bx, by, tx, ty, bow, hw, -1, "ivory");
    }
  }

  // ---- 7B. Lower Slanted Mouth Slit + 5 Slender Curved Ivory Lower Tusks (5% slimmer!) ----
  c.save();
  c.translate(hx, hy);
  c.rotate(jawOpenAng);
  c.translate(-hx, -hy);

  if (p.open <= 0.02) {
    // Expressive thin slanted dark mouth slit & corner crease matching Gambar 2!
    c.beginPath();
    c.moveTo(0.348, 0.034);
    c.bezierCurveTo(0.282, 0.065, 0.212, 0.115, 0.146, 0.175);
    c.quadraticCurveTo(0.218, 0.138, 0.348, 0.052);
    c.closePath();
    c.fillStyle = "#162b06";
    c.fill();
    c.strokeStyle = OL;
    c.lineWidth = 0.0068;
    c.stroke();

    // Extended lower mouth-corner crease curving down toward chin (Gambar 2!)
    c.beginPath();
    c.moveTo(0.152, 0.17);
    c.quadraticCurveTo(0.132, 0.192, 0.116, 0.214);
    c.strokeStyle = OL;
    c.lineWidth = 0.0064;
    c.stroke();
  }

  // 5 slender (~5-7% slimmer), gracefully curved ivory lower tusks (Gambar 2 closed, Gambar 1 open!)
  curvedTusk(0.342, 0.048, 0.308, -0.014, 0.022, 0.0102); // 1. front snout fang
  curvedTusk(0.312, 0.072, 0.272, -0.046, 0.034, 0.014); // 2. tall front primary fang
  curvedTusk(0.272, 0.1, 0.23, -0.04, 0.038, 0.0156); // 3. tallest main crescent fang
  curvedTusk(0.224, 0.13, 0.192, 0.034, 0.028, 0.0128); // 4. medium curved fang
  curvedTusk(0.168, 0.168, 0.146, 0.098, 0.02, 0.011); // 5. rear mouth-corner fang
  c.restore();

  // ---- 8. Animated Flared & Spotted Ragged Gill / Pectoral Fin (Gambar 1!) ----
  c.save();
  c.translate(0.032, -0.022);
  // Lively swimming & fanning motion clearly visible near the gill!
  c.rotate(-0.12 + s2 * 0.34);
  c.scale(1 - s * 0.14, 1 + s2 * 0.08);
  const tipFlex = s * 0.022;
  fillStroke(
    c,
    () => {
      c.moveTo(-0.015, 0.016);
      c.bezierCurveTo(-0.042, -0.075, -0.068 + tipFlex * 0.5, -0.148, -0.076 + tipFlex, -0.228);
      // Wide flared jagged 4-peak top edge matching Gambar 1!
      c.lineTo(-0.038 + tipFlex * 0.85, -0.205);
      c.lineTo(-0.018 + tipFlex * 0.8, -0.244);
      c.lineTo(0.01 + tipFlex * 0.7, -0.212);
      c.lineTo(0.038 + tipFlex * 0.65, -0.238);
      c.bezierCurveTo(0.035 + tipFlex * 0.3, -0.142, 0.026, -0.065, 0.016, 0.016);
    },
    lin(c, 0, 0.01, -0.01 + tipFlex, -0.24, [
      [0, DARK],
      [0.48, BODY],
      [1, "#a6dc44"],
    ]),
    OL,
    LW * 0.8,
    () => {
      c.fillStyle = "rgba(42, 82, 12, 0.42)";
      blob(c, -0.032 + tipFlex * 0.4, -0.135, 0.017, 0.013, 0.12);
      blob(c, 0.008 + tipFlex * 0.5, -0.172, 0.014, 0.011, -0.2);
      blob(c, -0.018 + tipFlex * 0.2, -0.078, 0.012, 0.009, 0);
      rayFan(
        c,
        0,
        0.01,
        [
          [-0.066 + tipFlex, -0.218],
          [-0.018 + tipFlex * 0.8, -0.234],
          [0.032 + tipFlex * 0.65, -0.228],
        ],
        rgba(OL, 0.46),
        0.0032
      );
    }
  );
  c.restore();

  // ---- 9. Single Side-View Glossy Eye with Cool Down-Tilted Eyelid Angle ----
  const ex = 0.148,
    ey = -0.068 - p.open * 0.004,
    er = 0.072;
  // Sculpted smooth green brow ridge dome tilted subtly with the upper eyelid
  c.save();
  c.translate(ex, ey);
  c.rotate(0.22);
  c.beginPath();
  c.ellipse(0, -0.014, er * 1.14, er * 1.12, 0, Math.PI * 1.02, Math.PI * 1.98);
  c.fillStyle = BODY;
  c.fill();
  c.strokeStyle = OL;
  c.lineWidth = LW * 0.82;
  c.stroke();
  c.restore();

  eye(c, ex, ey, er, {
    iris: pal.iris || "#20ad30",
    expr: p.expr,
    ol: OL,
    sx: 0.96,
    look: 0.28,
    lookY: 0.08,
    irisR: 0.54,
    pupilR: 0.32,
    lid: p.expr === "panic" ? 0 : 0.4,
    lidTilt: 0.26,
    lidCol: "#6eb822",
    lidEdge: OL,
  });

  // Soft glossy curved specular highlight along the slanted eyelid & brow
  c.save();
  c.translate(ex, ey);
  c.rotate(0.24);
  c.beginPath();
  c.moveTo(-er * 0.66, -er * 0.46);
  c.quadraticCurveTo(0, -er * 0.78, er * 0.66, -er * 0.44);
  c.strokeStyle = "rgba(225, 255, 160, 0.58)";
  c.lineWidth = 0.0058;
  c.stroke();
  c.restore();
}

// =====================================================================================
// PARI (STINGRAY) — Side-view Blue-Spotted Stingray inspired by Gambar 1:
//   deep midnight-indigo dorsal mantle with soft pale sky-blue spots, sweeping arched
//   upper wing + broad pale-cream rolled lower wing edge, ruffled rear pelvic lobes,
//   long graceful whip tail, curved gill slits & spiracle, warm chestnut glossy eye,
//   and cheerful underside mouth!
// =====================================================================================
function drawStingray(c: Ctx, sp: Species, p: Pose) {
  const pal = sp.pal;
  const DK = pal.dark || "#0a2258",
    MID = pal.body || "#184b96",
    BLU = "#286ec2",
    SPOT = pal.spot || "#74c2f6";
  const CREAM = pal.belly || "#f5efe6",
    CR_SH = "#beb9cb";
  const OL = rgba(pal.outline || "#071638", 0.94);
  const LW = 0.0072;
  const s = p.wag,
    s2 = p.wag2;

  // ---- 1. Long graceful whip tail tapering smoothly to the left ----
  fillStroke(
    c,
    () => {
      c.moveTo(-0.16, -0.018);
      c.bezierCurveTo(-0.27, -0.025 + s * 0.015, -0.39, -0.005 + s * 0.045, -0.492, 0.072 + s * 0.068);
      c.bezierCurveTo(-0.39, 0.014 + s * 0.042, -0.27, -0.002 + s * 0.014, -0.155, 0.014);
    },
    lin(c, -0.16, -0.015, -0.48, 0.06, [
      [0, MID],
      [0.5, DK],
      [1, "#051030"],
    ]),
    OL,
    LW * 0.78,
    () => {
      c.strokeStyle = "rgba(130, 200, 255, 0.55)";
      c.lineWidth = 0.003;
      c.beginPath();
      c.moveTo(-0.17, -0.012);
      c.bezierCurveTo(-0.28, -0.018 + s * 0.014, -0.39, 0.0 + s * 0.042, -0.475, 0.064 + s * 0.062);
      c.stroke();
    }
  );

  // ---- 2. Ruffled dark-blue rear pelvic fin lobes trailing before the tail ----
  fillStroke(
    c,
    () => {
      c.moveTo(-0.135, 0.002);
      c.bezierCurveTo(-0.175, -0.01, -0.218, -0.008, -0.235, 0.012 + s2 * 0.008);
      c.quadraticCurveTo(-0.2, 0.024, -0.228, 0.044 + s2 * 0.008);
      c.quadraticCurveTo(-0.188, 0.056, -0.195, 0.074);
      c.quadraticCurveTo(-0.148, 0.068, -0.118, 0.046);
    },
    lin(c, -0.14, 0.0, -0.22, 0.065, [
      [0, MID],
      [1, DK],
    ]),
    OL,
    LW * 0.8
  );

  // ---- 3. Sweeping Upper Arched Dorsal Wing (classic Gambar 1 wing-glide silhouette!) ----
  const wTopX = 0.025 + s2 * 0.01;
  const wTopY = -0.212;
  fillStroke(
    c,
    () => {
      c.moveTo(0.185, -0.058);
      c.bezierCurveTo(0.14, -0.125, 0.088, -0.186, wTopX, wTopY);
      c.bezierCurveTo(-0.005, -0.175, -0.065, -0.11, -0.148, -0.042);
      c.quadraticCurveTo(0.02, -0.048, 0.185, -0.058);
    },
    lin(c, wTopX, wTopY, 0.04, -0.06, [
      [0, "#081b4c"],
      [0.45, MID],
      [1, BLU],
    ]),
    OL,
    LW * 0.9,
    () => {
      // Soft sky-blue ray spots & crisp top wing sheen
      c.fillStyle = rgba(SPOT, 0.42);
      blob(c, 0.032, -0.155, 0.018, 0.01, -0.35);
      blob(c, -0.018, -0.118, 0.022, 0.012, -0.2);
      blob(c, 0.065, -0.11, 0.014, 0.009, 0.1);
      c.strokeStyle = "rgba(155, 222, 255, 0.55)";
      c.lineWidth = 0.004;
      c.beginPath();
      c.moveTo(0.165, -0.066);
      c.bezierCurveTo(0.118, -0.125, 0.075, -0.178, wTopX, wTopY + 0.008);
      c.stroke();
    }
  );

  // ---- 4. Open Underside Mouth Interior ----
  const mhX = 0.256,
    mhY = 0.046;
  const mTipX = 0.342 - p.open * 0.008;
  const mTipY = 0.032 + p.open * 0.052;
  c.beginPath();
  c.moveTo(0.285, 0.026);
  c.lineTo(mTipX, 0.024);
  c.quadraticCurveTo(0.315, 0.044 + p.open * 0.036, mhX, mhY);
  c.closePath();
  c.fillStyle = "#5c0f1d";
  c.fill();
  c.fillStyle = "#e8647c";
  blob(c, 0.296, 0.036 + p.open * 0.018, 0.024, 0.009 + p.open * 0.006, 0.15);

  // ---- 5. Main Side-View Stingray Body + Rounded Nose + Creamy Belly ----
  fillStroke(
    c,
    () => {
      // Back shoulder forward over brow hump to rounded ray nose
      c.moveTo(-0.18, -0.018);
      c.bezierCurveTo(-0.08, -0.075, 0.1, -0.095, 0.225, -0.078);
      c.bezierCurveTo(0.275, -0.076, 0.302, -0.056, 0.342, -0.046);
      c.bezierCurveTo(0.382, -0.038, 0.412, -0.025, 0.408, -0.006);
      // Rounded snout curving smoothly down into cream upper lip
      c.bezierCurveTo(0.402, 0.016, 0.372, 0.024, mTipX, 0.024);
      // Articulated cheerful underside ray mouth
      if (p.open > 0.02) {
        c.quadraticCurveTo(0.305, 0.034, mhX, mhY);
        c.lineTo(mTipX - 0.008, mTipY);
        c.quadraticCurveTo(0.285, 0.068 + p.open * 0.025, 0.19, 0.078 + p.open * 0.012);
      } else {
        c.quadraticCurveTo(0.308, 0.045, mhX, mhY);
        c.quadraticCurveTo(0.308, 0.044, 0.335, 0.034);
        c.quadraticCurveTo(0.295, 0.072, 0.185, 0.078);
      }
      // Cream throat & chest curving smoothly back toward tail root
      c.bezierCurveTo(0.065, 0.09, -0.065, 0.062, -0.18, 0.015);
    },
    CREAM,
    OL,
    LW,
    () => {
      // A) Cool lavender-cream belly shading at lower rim
      c.fillStyle = lin(c, 0, 0.02, 0, 0.095, [
        [0, CREAM],
        [0.65, "#ebe4da"],
        [1, CR_SH],
      ]);
      c.fillRect(-0.2, 0.01, 0.64, 0.1);

      // B) Deep Midnight-Cobalt Upper Dorsal Mantle Coat
      c.fillStyle = lin(c, 0, -0.095, 0, 0.032, [
        [0, DK],
        [0.48, MID],
        [0.92, BLU],
        [1, "rgba(40, 110, 194, 0)"],
      ]);
      c.beginPath();
      c.moveTo(-0.2, -0.03);
      c.bezierCurveTo(-0.05, -0.095, 0.16, -0.1, 0.415, -0.012);
      c.lineTo(0.415, -0.002);
      c.bezierCurveTo(0.33, 0.002, 0.245, 0.005, 0.145, 0.028);
      c.bezierCurveTo(0.02, 0.052, -0.09, 0.042, -0.2, 0.015);
      c.closePath();
      c.fill();

      // C) Crisp light sky-blue top contour rim along nose & brow
      c.strokeStyle = "rgba(150, 222, 255, 0.72)";
      c.lineWidth = 0.0055;
      c.beginPath();
      c.moveTo(0.23, -0.072);
      c.bezierCurveTo(0.285, -0.066, 0.345, -0.042, 0.398, -0.012);
      c.stroke();

      // D) Scattered Soft Pale Sky-Blue Stingray Spots across upper mantle (Gambar 1!)
      const spots: [number, number, number, number, number, number][] = [
        [0.08, -0.048, 0.024, 0.011, -0.1, 0.55],
        [-0.02, -0.038, 0.028, 0.013, 0.08, 0.5],
        [-0.1, -0.02, 0.02, 0.01, -0.15, 0.45],
        [0.14, -0.025, 0.018, 0.009, 0.1, 0.5],
        [0.03, -0.01, 0.022, 0.011, 0.0, 0.45],
        [-0.06, 0.005, 0.018, 0.009, 0.12, 0.4],
        [0.11, 0.008, 0.015, 0.008, -0.2, 0.42],
        [0.185, -0.052, 0.013, 0.007, 0.15, 0.45],
      ];
      for (const [sx, sy, rx, ry, rot, a] of spots) {
        c.fillStyle = rgba(SPOT, a);
        blob(c, sx, sy, rx, ry, rot);
      }

      // E) 5 Curved Gill Slits tucked neatly along the cream lower cheek/throat (Gambar 1!)
      c.strokeStyle = "rgba(38, 48, 72, 0.74)";
      c.lineWidth = 0.0036;
      for (let g = 0; g < 5; g++) {
        const gx = 0.145 + g * 0.018;
        const gy = 0.054 - g * 0.002;
        c.beginPath();
        c.moveTo(gx, gy - 0.01);
        c.quadraticCurveTo(gx + 0.005, gy, gx - 0.002, gy + 0.011);
        c.stroke();
      }
    }
  );

  // ---- 6. Broad Foreground Sweeping Lower Pectoral Wing Flap (with thick cream rolled rim!) ----
  c.save();
  c.translate(0.0, 0.0);
  fillStroke(
    c,
    () => {
      c.moveTo(0.115, 0.022);
      c.bezierCurveTo(0.068, 0.088 + s2 * 0.014, -0.015, 0.142 + s2 * 0.018, -0.105, 0.124 + s2 * 0.014);
      c.bezierCurveTo(-0.155, 0.11, -0.172, 0.065, -0.148, 0.016);
      c.bezierCurveTo(-0.08, -0.005, 0.03, -0.002, 0.115, 0.022);
    },
    lin(c, -0.02, -0.01, -0.04, 0.135, [
      [0, MID],
      [0.6, DK],
      [0.84, "#ebe4da"],
      [1, CR_SH],
    ]),
    OL,
    LW * 0.88,
    () => {
      // Top dark cobalt wing face leaving the thick pale lavender-cream rolled edge at bottom!
      c.fillStyle = lin(c, -0.02, -0.005, -0.04, 0.105, [
        [0, MID],
        [0.72, DK],
        [1, "#091b48"],
      ]);
      c.beginPath();
      c.moveTo(0.115, 0.018);
      c.bezierCurveTo(0.065, 0.072 + s2 * 0.012, -0.012, 0.118 + s2 * 0.016, -0.098, 0.098 + s2 * 0.012);
      c.bezierCurveTo(-0.145, 0.086, -0.165, 0.045, -0.145, 0.012);
      c.closePath();
      c.fill();

      // Crisp pale blue spots on the sweeping wing
      c.fillStyle = rgba(SPOT, 0.45);
      blob(c, -0.025, 0.035, 0.02, 0.01, -0.15);
      blob(c, -0.088, 0.048, 0.016, 0.009, 0.1);
      blob(c, 0.032, 0.042, 0.014, 0.008, -0.2);

      // Soft rim highlight right along the cream rolled wing edge
      c.strokeStyle = "rgba(255, 252, 245, 0.85)";
      c.lineWidth = 0.005;
      c.beginPath();
      c.moveTo(0.104, 0.028);
      c.bezierCurveTo(0.058, 0.082 + s2 * 0.012, -0.016, 0.13 + s2 * 0.016, -0.1, 0.112 + s2 * 0.012);
      c.stroke();
    }
  );
  c.restore();

  // ---- 7. Spiracle Opening & Big Expressive Warm-Brown Glossy Ray Eye (Gambar 1!) ----
  const ex = 0.252,
    ey = -0.032 - p.open * 0.003,
    er = 0.038;
  // Dark oval spiracle slit just behind eye (iconic stingray detail from Gambar 1)
  c.beginPath();
  c.ellipse(ex - 0.048, ey + 0.004, 0.01, 0.015, 0.18, 0, TAU);
  c.fillStyle = "#061028";
  c.fill();
  c.strokeStyle = "rgba(130, 200, 255, 0.45)";
  c.lineWidth = 0.003;
  c.stroke();

  // Gentle orbital crease around lower socket
  c.beginPath();
  c.arc(ex, ey, er * 1.18, Math.PI * 0.12, Math.PI * 0.82);
  c.strokeStyle = "rgba(18, 52, 108, 0.48)";
  c.lineWidth = 0.0042;
  c.stroke();

  eye(c, ex, ey, er, {
    iris: pal.iris || "#7a3b12",
    expr: p.expr,
    ol: OL,
    sx: 0.94,
    look: 0.24,
    irisR: 0.56,
    pupilR: 0.36,
    happyCol: "#ffffff",
  });
}

// =====================================================================================
// MANDARIN (MANDARIN DRAGONET) — Polished Psychedelic Reef Jewel:
//   sleek sapphire-cobalt body with smooth S-curved tangerine & turquoise swirl ribbons,
//   graceful non-crossing sweeping crown plume + clean rounded second dorsal sail,
//   scalloped peacock-fan tail, gossamer pectoral wing, and gold-ringed emerald jewel eye!
// =====================================================================================
function drawMandarin(c: Ctx, sp: Species, p: Pose) {
  const pal = sp.pal;
  const SAP = pal.body || "#0e47b8",
    DK = pal.dark || "#061d66",
    AQUA = pal.belly || "#279cf5",
    ORN = pal.stripe || "#ff7b1c",
    CRMS = pal.tail || "#ff4757",
    CYAN = pal.spot || "#2cf5e8",
    OL = rgba(pal.outline || "#041033", 0.94);
  const LW = 0.0066;
  const s = p.wag,
    s2 = p.wag2;

  // ---- 1. Sculpted Rounded Peacock-Fan Tail ----
  c.save();
  c.translate(-0.158, 0.0);
  c.rotate(s * 0.16);
  fillStroke(
    c,
    () => {
      c.moveTo(0.012, -0.032);
      c.bezierCurveTo(-0.075, -0.105, -0.168, -0.145 + s2 * 0.015, -0.225, -0.088 + s2 * 0.016);
      c.bezierCurveTo(-0.258, -0.042, -0.258, 0.042, -0.225, 0.088 + s2 * 0.016);
      c.bezierCurveTo(-0.168, 0.145 + s2 * 0.015, -0.075, 0.105, 0.012, 0.032);
    },
    lin(c, 0.01, 0.0, -0.255, 0.0, [
      [0, "#1558cf"],
      [0.36, ORN],
      [0.74, CRMS],
      [1, "#b81845"],
    ]),
    OL,
    LW * 0.88,
    () => {
      // Soft radiating fin rays
      c.strokeStyle = "rgba(255, 240, 185, 0.42)";
      c.lineWidth = 0.0032;
      for (let i = -3; i <= 3; i++) {
        c.beginPath();
        c.moveTo(-0.005, i * 0.006);
        c.quadraticCurveTo(-0.115, i * 0.018, -0.225, i * 0.026);
        c.stroke();
      }
      // Subtle turquoise marginal arc & inner pearls
      c.strokeStyle = rgba(CYAN, 0.92);
      c.lineWidth = 0.0072;
      c.beginPath();
      c.moveTo(-0.214, -0.084 + s2 * 0.012);
      c.quadraticCurveTo(-0.25, 0.0, -0.214, 0.084 + s2 * 0.012);
      c.stroke();

      c.fillStyle = rgba(CYAN, 0.82);
      for (let i = -2; i <= 2; i++) {
        c.beginPath();
        c.arc(-0.184 + Math.abs(i) * 0.008, i * 0.029, 0.0062, 0, TAU);
        c.fill();
      }
    }
  );
  c.restore();

  // ---- 2. Second Dorsal Fin (Clean Rounded Dragonet Sail behind the plume) ----
  fillStroke(
    c,
    () => {
      c.moveTo(-0.172, -0.038);
      c.bezierCurveTo(-0.182, -0.132, -0.125, -0.186 + s2 * 0.01, -0.048, -0.168 + s2 * 0.008);
      c.bezierCurveTo(-0.018, -0.16, 0.004, -0.128, 0.01, -0.092);
      c.closePath();
    },
    lin(c, -0.08, -0.185, -0.08, -0.045, [
      [0, "#1d8ae8"],
      [0.42, ORN],
      [0.85, "#1154bd"],
      [1, DK],
    ]),
    OL,
    LW * 0.82,
    () => {
      // Delicate rays
      c.strokeStyle = "rgba(255, 245, 210, 0.36)";
      c.lineWidth = 0.0028;
      for (let i = 0; i < 4; i++) {
        const bx = -0.145 + i * 0.038;
        c.beginPath();
        c.moveTo(bx, -0.055);
        c.quadraticCurveTo(bx - 0.012, -0.115, bx - 0.022, -0.162);
        c.stroke();
      }
      // Clean cyan rim & golden pearl spots
      c.strokeStyle = rgba(CYAN, 0.9);
      c.lineWidth = 0.0065;
      c.beginPath();
      c.moveTo(-0.168, -0.102);
      c.bezierCurveTo(-0.142, -0.168, -0.072, -0.174 + s2 * 0.008, -0.01, -0.142);
      c.stroke();
      c.fillStyle = rgba("#ffe270", 0.85);
      blob(c, -0.115, -0.118, 0.01, 0.007, -0.2);
      blob(c, -0.068, -0.122, 0.01, 0.007, -0.15);
      blob(c, -0.032, -0.116, 0.008, 0.006, 0);
    }
  );

  // ---- 3. First Dorsal Plume (Tall, Sleek, Non-Crossing Sickle Crown Crest!) ----
  fillStroke(
    c,
    () => {
      // Root cleanly on upper back (0.002 -> 0.112), sweeping gracefully up & back without any crossover
      c.moveTo(0.002, -0.095);
      c.bezierCurveTo(0.004, -0.178, -0.032, -0.252 + s2 * 0.012, -0.112, -0.292 + s2 * 0.018);
      c.bezierCurveTo(-0.048, -0.282 + s2 * 0.016, 0.065, -0.215, 0.112, -0.09);
      c.closePath();
    },
    lin(c, -0.105, -0.292, 0.085, -0.092, [
      [0, CYAN],
      [0.28, "#ffe268"],
      [0.62, ORN],
      [1, "#2b42d6"],
    ]),
    OL,
    LW * 0.84,
    () => {
      // Elegant curved dorsal spine rays following the plume smoothly
      c.strokeStyle = "rgba(255, 250, 220, 0.65)";
      c.lineWidth = 0.0034;
      c.beginPath();
      c.moveTo(0.088, -0.098);
      c.bezierCurveTo(0.048, -0.195, -0.025, -0.258 + s2 * 0.014, -0.095, -0.282 + s2 * 0.016);
      c.stroke();

      c.strokeStyle = rgba(CYAN, 0.72);
      c.lineWidth = 0.003;
      c.beginPath();
      c.moveTo(0.048, -0.098);
      c.bezierCurveTo(0.022, -0.178, -0.018, -0.228 + s2 * 0.01, -0.065, -0.252 + s2 * 0.012);
      c.stroke();
    }
  );

  // ---- 4. Anal & Pelvic Underside Fins ----
  fillStroke(
    c,
    () => {
      c.moveTo(-0.162, 0.042);
      c.bezierCurveTo(-0.188, 0.125, -0.118, 0.17 - s2 * 0.01, -0.025, 0.145);
      c.quadraticCurveTo(0.002, 0.128, 0.015, 0.092);
    },
    lin(c, -0.1, 0.055, -0.1, 0.168, [
      [0, SAP],
      [0.52, ORN],
      [1, CRMS],
    ]),
    OL,
    LW * 0.8,
    () => {
      c.strokeStyle = rgba(CYAN, 0.9);
      c.lineWidth = 0.006;
      c.beginPath();
      c.moveTo(-0.155, 0.115);
      c.quadraticCurveTo(-0.1, 0.16, -0.028, 0.136);
      c.stroke();
    }
  );

  // Foreground dragonet pelvic fan fin
  fillStroke(
    c,
    () => {
      c.moveTo(0.088, 0.086);
      c.bezierCurveTo(0.108, 0.158, 0.045, 0.192, 0.002, 0.155);
      c.quadraticCurveTo(0.025, 0.118, 0.052, 0.088);
    },
    lin(c, 0.075, 0.09, 0.025, 0.18, [
      [0, SAP],
      [0.5, ORN],
      [1, CYAN],
    ]),
    OL,
    LW * 0.76
  );

  // ---- 5. Open Mouth Interior ----
  const mhX = 0.255,
    mhY = 0.032;
  const mTipX = 0.348 - p.open * 0.01;
  const mTipY = 0.026 + p.open * 0.052;
  c.beginPath();
  c.moveTo(0.285, 0.016);
  c.lineTo(mTipX, 0.016);
  c.quadraticCurveTo(0.312, 0.036 + p.open * 0.032, mhX, mhY);
  c.closePath();
  c.fillStyle = "#5c0f24";
  c.fill();
  c.fillStyle = "#ff6a88";
  blob(c, 0.295, 0.028 + p.open * 0.016, 0.022, 0.009 + p.open * 0.006, 0.12);

  // ---- 6. Sleek Dragonet Body & Smooth Psychedelic Swirl Ribbons ----
  fillStroke(
    c,
    () => {
      c.moveTo(-0.172, -0.035);
      c.bezierCurveTo(-0.085, -0.095, 0.078, -0.116, 0.202, -0.092);
      c.bezierCurveTo(0.278, -0.076, 0.328, -0.028, mTipX, 0.015);
      if (p.open > 0.02) {
        c.quadraticCurveTo(0.305, 0.024, mhX, mhY);
        c.lineTo(mTipX - 0.008, mTipY);
        c.quadraticCurveTo(0.298, 0.068 + p.open * 0.022, 0.182, 0.088 + p.open * 0.008);
      } else {
        c.quadraticCurveTo(0.315, 0.034, mhX, mhY);
        c.quadraticCurveTo(0.31, 0.038, 0.336, 0.032);
        c.quadraticCurveTo(0.288, 0.076, 0.182, 0.09);
      }
      c.bezierCurveTo(0.055, 0.112, -0.082, 0.082, -0.172, 0.035);
    },
    lin(c, 0.06, -0.112, 0.06, 0.108, [
      [0, DK],
      [0.34, SAP],
      [0.74, AQUA],
      [1, "#1870db"],
    ]),
    OL,
    LW,
    () => {
      // Soft top sheen highlight
      glow(c, 0.08, -0.062, 0.21, 0.046, 0.0, "120,245,255", 0.28);

      const drawSwirl = (pathFn: () => void) => {
        c.beginPath();
        pathFn();
        c.closePath();
        c.fillStyle = lin(c, -0.12, -0.08, 0.24, 0.08, [
          [0, "#ffa62b"],
          [0.52, ORN],
          [1, CRMS],
        ]);
        c.fill();
        c.strokeStyle = CYAN;
        c.lineWidth = 0.005;
        c.stroke();
        c.strokeStyle = rgba("#030e2b", 0.72);
        c.lineWidth = 0.0022;
        c.stroke();
      };

      // Organic flowing swirl 1: Shoulder S-wave curving forward under the cheek
      drawSwirl(() => {
        c.moveTo(0.112, -0.105);
        c.bezierCurveTo(0.148, -0.048, 0.155, 0.015, 0.228, 0.044);
        c.bezierCurveTo(0.258, 0.056, 0.232, 0.088, 0.178, 0.076);
        c.bezierCurveTo(0.12, 0.062, 0.108, -0.025, 0.068, -0.098);
      });

      // Organic flowing swirl 2: Mid-flank curved ribbon hook
      drawSwirl(() => {
        c.moveTo(0.015, -0.104);
        c.bezierCurveTo(-0.022, -0.045, 0.038, 0.018, -0.018, 0.078);
        c.bezierCurveTo(-0.048, 0.102, -0.088, 0.082, -0.068, 0.046);
        c.bezierCurveTo(-0.038, -0.004, -0.072, -0.058, -0.032, -0.098);
      });

      // Organic flowing swirl 3: Rear peduncle band
      drawSwirl(() => {
        c.moveTo(-0.105, -0.068);
        c.bezierCurveTo(-0.135, -0.025, -0.108, 0.022, -0.145, 0.052);
        c.lineTo(-0.175, 0.034);
        c.bezierCurveTo(-0.154, 0.0, -0.165, -0.032, -0.138, -0.058);
      });

      // Snout swirl accent + glowing turquoise dots
      c.fillStyle = ORN;
      blob(c, 0.278, -0.015, 0.019, 0.011, 0.35);
      c.strokeStyle = CYAN;
      c.lineWidth = 0.0036;
      c.stroke();

      c.fillStyle = CYAN;
      blob(c, 0.188, -0.055, 0.009, 0.0065, -0.2);
      blob(c, 0.042, 0.052, 0.01, 0.007, 0.2);
      blob(c, -0.088, -0.024, 0.009, 0.0065, 0.0);

      // Cute cheek swirl curl below eye
      c.strokeStyle = rgba(CYAN, 0.85);
      c.lineWidth = 0.0038;
      c.beginPath();
      c.moveTo(0.245, 0.048);
      c.quadraticCurveTo(0.272, 0.035, 0.285, 0.056);
      c.stroke();

      if (p.puff) {
        c.fillStyle = "rgba(255, 165, 195, 0.55)";
        blob(c, 0.23, 0.046, 0.025, 0.016, 0);
      }
    }
  );

  // ---- 7. Gossamer Rounded Pectoral Wing Fin (tucked neatly lower-mid flank) ----
  c.save();
  c.translate(0.105, 0.032);
  c.rotate(s2 * 0.18);
  fillStroke(
    c,
    () => {
      c.moveTo(0, 0);
      c.bezierCurveTo(-0.028, -0.038, -0.102, -0.022, -0.092, 0.032);
      c.bezierCurveTo(-0.078, 0.076, -0.018, 0.064, 0, 0.016);
    },
    lin(c, 0, 0, -0.09, 0.028, [
      [0, rgba(AQUA, 0.9)],
      [0.58, rgba(ORN, 0.85)],
      [1, rgba(CYAN, 0.92)],
    ]),
    OL,
    LW * 0.68,
    () => {
      c.strokeStyle = "rgba(255,255,255,0.52)";
      c.lineWidth = 0.0026;
      for (let r = -1; r <= 2; r++) {
        c.beginPath();
        c.moveTo(-0.006, 0.004);
        c.lineTo(-0.076, r * 0.018);
        c.stroke();
      }
    }
  );
  c.restore();

  // ---- 8. Gold-Ringed Emerald Jewel Eye (cleanly proportioned) ----
  const ex = 0.228,
    ey = -0.034 - p.open * 0.004,
    er = 0.041;
  c.beginPath();
  c.arc(ex, ey, er * 1.18, 0, TAU);
  c.fillStyle = "#ffae2b";
  c.fill();
  c.strokeStyle = OL;
  c.lineWidth = 0.0038;
  c.stroke();

  eye(c, ex, ey, er, {
    iris: pal.iris || "#18c98f",
    expr: p.expr,
    ol: OL,
    sx: 0.94,
    look: 0.24,
    irisR: 0.62,
    pupilR: 0.36,
    happyCol: "#ffe999",
  });
}

// =====================================================================================
// AURORA (CELESTIAL HALFMOON VEILFISH) — Rare Iridescent Betta Queen:
//   pearlescent rose-opal body & colossal 180-degree silk halfmoon tail + crown veils
//   rippling smoothly in S-waves, flowing amethyst -> rose -> aurora-cyan sheen!
// =====================================================================================
function drawAurora(c: Ctx, sp: Species, p: Pose) {
  const pal = sp.pal;
  const ROSE = pal.body || "#ff85c0",
    AMET = pal.dark || "#6928a8",
    OPAL = pal.belly || "#ffe8f7",
    ORCH = pal.fin || "#9c5cf5",
    AUR = pal.tail || "#4df5e8",
    STAR = pal.spot || "#7df9ff",
    OL = rgba(pal.outline || "#2a0b4a", 0.9);
  const LW = 0.0066;
  const s = p.wag,
    s2 = p.wag2;

  // ---- 1. Giant 180-degree Billowing Silk Halfmoon Veil Tail ----
  c.save();
  c.translate(-0.04, 0.0);
  fillStroke(
    c,
    () => {
      c.moveTo(0.02, -0.048);
      c.bezierCurveTo(-0.08, -0.18 + s * 0.025, -0.22, -0.35 + s2 * 0.035, -0.375, -0.305 + s2 * 0.045);
      // Scalloped aurora ruffled outer edge
      c.bezierCurveTo(-0.435, -0.18 + s * 0.03, -0.455, -0.06 + s2 * 0.025, -0.438, 0.0 + s * 0.02);
      c.bezierCurveTo(-0.455, 0.07 + s2 * 0.025, -0.43, 0.20 + s * 0.03, -0.368, 0.312 + s2 * 0.045);
      c.bezierCurveTo(-0.21, 0.348 + s2 * 0.035, -0.075, 0.178 + s * 0.025, 0.02, 0.05);
    },
    lin(c, 0.02, 0.0, -0.44, 0.0, [
      [0, AMET],
      [0.32, ORCH],
      [0.65, ROSE],
      [0.88, "#ffbde8"],
      [1, AUR],
    ]),
    OL,
    LW * 0.82,
    () => {
      // Silky translucent aurora crescent rim along trailing edge
      c.strokeStyle = rgba(AUR, 0.86);
      c.lineWidth = 0.016;
      c.beginPath();
      c.moveTo(-0.358, -0.29 + s2 * 0.04);
      c.bezierCurveTo(-0.432, -0.12 + s * 0.025, -0.432, 0.12 + s * 0.025, -0.352, 0.295 + s2 * 0.04);
      c.stroke();

      // Delicate branching gossamer betta rays
      c.strokeStyle = "rgba(255, 250, 255, 0.44)";
      c.lineWidth = 0.0032;
      for (let i = -5; i <= 5; i++) {
        const ang = i * 0.16 + s * 0.05;
        const ex = -Math.cos(ang) * 0.39;
        const ey = Math.sin(ang) * 0.305 + (i % 2 === 0 ? s2 * 0.025 : s * 0.02);
        c.beginPath();
        c.moveTo(0.0, i * 0.006);
        c.quadraticCurveTo(ex * 0.52, ey * 0.52 + s * 0.018, ex, ey);
        c.stroke();
      }

      // Shimmering starlight dots in veil
      c.fillStyle = "rgba(255, 255, 255, 0.78)";
      blob(c, -0.28, -0.14 + s * 0.02, 0.01, 0.007, 0.3);
      blob(c, -0.33, 0.05 + s2 * 0.02, 0.011, 0.007, -0.2);
      blob(c, -0.26, 0.17 + s * 0.02, 0.009, 0.006, 0.1);
    }
  );
  c.restore();

  // ---- 2. Sweeping Crown Dorsal Silk Veil ----
  fillStroke(
    c,
    () => {
      c.moveTo(0.115, -0.075);
      c.bezierCurveTo(0.06, -0.19, -0.04, -0.345 + s2 * 0.025, -0.185, -0.345 + s2 * 0.032);
      c.bezierCurveTo(-0.155, -0.245, -0.125, -0.145, -0.065, -0.052);
    },
    lin(c, 0.05, -0.07, -0.17, -0.34, [
      [0, ORCH],
      [0.52, ROSE],
      [1, AUR],
    ]),
    OL,
    LW * 0.8,
    () => {
      c.strokeStyle = "rgba(255,255,255,0.48)";
      c.lineWidth = 0.003;
      for (let i = 0; i < 5; i++) {
        c.beginPath();
        c.moveTo(0.08 - i * 0.032, -0.07);
        c.quadraticCurveTo(0.01 - i * 0.042, -0.20, -0.095 - i * 0.02 + s2 * 0.018, -0.295 - i * 0.008);
        c.stroke();
      }
    }
  );

  // ---- 3. Long Flowing Ventral / Anal Ribbon Veil ----
  fillStroke(
    c,
    () => {
      c.moveTo(0.125, 0.072);
      c.bezierCurveTo(0.05, 0.205, -0.055, 0.355 - s2 * 0.022, -0.215, 0.345 - s2 * 0.03);
      c.bezierCurveTo(-0.155, 0.245, -0.12, 0.145, -0.058, 0.048);
    },
    lin(c, 0.06, 0.06, -0.19, 0.34, [
      [0, ORCH],
      [0.55, ROSE],
      [1, AUR],
    ]),
    OL,
    LW * 0.8,
    () => {
      c.strokeStyle = "rgba(255,255,255,0.45)";
      c.lineWidth = 0.003;
      for (let i = 0; i < 5; i++) {
        c.beginPath();
        c.moveTo(0.09 - i * 0.034, 0.065);
        c.quadraticCurveTo(0.01 - i * 0.042, 0.20, -0.10 - i * 0.025 - s2 * 0.018, 0.29 + i * 0.01);
        c.stroke();
      }
    }
  );

  // Foreground delicate paired silk ribbon streamer
  fillStroke(
    c,
    () => {
      c.moveTo(0.155, 0.075);
      c.bezierCurveTo(0.13, 0.185, 0.055, 0.285 - s2 * 0.02, -0.015, 0.305 - s2 * 0.028);
      c.bezierCurveTo(0.03, 0.225, 0.075, 0.145, 0.115, 0.082);
    },
    lin(c, 0.14, 0.08, 0.0, 0.30, [
      [0, OPAL],
      [0.6, "#ff99d6"],
      [1, AUR],
    ]),
    OL,
    LW * 0.72
  );

  // ---- 4. Open Mouth Interior ----
  const mhX = 0.265,
    mhY = 0.026;
  const mTipX = 0.355 - p.open * 0.008;
  const mTipY = 0.018 + p.open * 0.054;
  c.beginPath();
  c.moveTo(0.295, 0.008);
  c.lineTo(mTipX, 0.008);
  c.quadraticCurveTo(0.32, 0.032 + p.open * 0.032, mhX, mhY);
  c.closePath();
  c.fillStyle = "#591032";
  c.fill();
  c.fillStyle = "#ff78a5";
  blob(c, 0.302, 0.02 + p.open * 0.018, 0.022, 0.009 + p.open * 0.006, 0.1);

  // ---- 5. Graceful Sculpted Pearlescent Veilfish Body ----
  fillStroke(
    c,
    () => {
      c.moveTo(-0.085, -0.044);
      c.bezierCurveTo(0.01, -0.098, 0.155, -0.105, 0.255, -0.068);
      c.bezierCurveTo(0.305, -0.048, 0.338, -0.018, mTipX, 0.008);
      if (p.open > 0.02) {
        c.quadraticCurveTo(0.312, 0.018, mhX, mhY);
        c.lineTo(mTipX - 0.008, mTipY);
        c.quadraticCurveTo(0.30, 0.062 + p.open * 0.022, 0.185, 0.084 + p.open * 0.008);
      } else {
        c.quadraticCurveTo(0.322, 0.028, mhX, mhY);
        c.quadraticCurveTo(0.318, 0.032, 0.344, 0.024);
        c.quadraticCurveTo(0.295, 0.072, 0.185, 0.084);
      }
      c.bezierCurveTo(0.07, 0.095, -0.02, 0.075, -0.085, 0.045);
    },
    lin(c, 0.08, -0.105, 0.08, 0.095, [
      [0, AMET],
      [0.34, ORCH],
      [0.64, ROSE],
      [1, OPAL],
    ]),
    OL,
    LW,
    () => {
      // Iridescent aqua-pearl spine glow & rose cheek blush
      glow(c, 0.08, -0.04, 0.19, 0.055, -0.08, "125,249,255", 0.34);
      glow(c, 0.17, 0.02, 0.12, 0.05, 0, "255,190,235", 0.45);

      // Subtle overlapping diamond scale shimmer arcs
      c.strokeStyle = rgba(STAR, 0.42);
      c.lineWidth = 0.003;
      for (let r = 0; r < 3; r++) {
        for (let col = 0; col < 5; col++) {
          const sx = -0.03 + col * 0.042 + (r % 2) * 0.02;
          const sy = -0.035 + r * 0.035;
          c.beginPath();
          c.arc(sx, sy, 0.022, -Math.PI * 0.35, Math.PI * 0.35);
          c.stroke();
        }
      }

      // Rosy pearl cheek blush
      c.fillStyle = "rgba(255, 110, 175, 0.44)";
      blob(c, 0.21, 0.032, 0.024, 0.015, 0.1);
      if (p.puff) {
        c.fillStyle = "rgba(255, 130, 195, 0.65)";
        blob(c, 0.225, 0.038, 0.03, 0.02, 0);
      }

      // Delicate gill arc
      c.strokeStyle = rgba(AMET, 0.55);
      c.lineWidth = 0.004;
      c.beginPath();
      c.arc(0.145, 0.005, 0.045, -Math.PI * 0.32, Math.PI * 0.38);
      c.stroke();
    }
  );

  // ---- 6. Gossamer Opal Pectoral Fin ----
  c.save();
  c.translate(0.13, 0.024);
  c.rotate(s2 * 0.22);
  fillStroke(
    c,
    () => {
      c.moveTo(0, 0);
      c.bezierCurveTo(-0.04, -0.048, -0.145, -0.018, -0.135, 0.042);
      c.bezierCurveTo(-0.11, 0.088, -0.03, 0.068, 0, 0.015);
    },
    lin(c, 0, 0, -0.13, 0.04, [
      [0, "rgba(255, 240, 252, 0.86)"],
      [0.65, "rgba(185, 135, 255, 0.78)"],
      [1, "rgba(77, 245, 232, 0.88)"],
    ]),
    rgba(pal.outline || "#2a0b4a", 0.72),
    LW * 0.68
  );
  c.restore();

  // ---- 7. Sapphire Jewel Eye + Long Eyelash Flourish ----
  const ex = 0.242,
    ey = -0.024 - p.open * 0.003,
    er = 0.044;
  eye(c, ex, ey, er, {
    iris: pal.iris || "#2d68e6",
    expr: p.expr,
    ol: OL,
    sx: 0.94,
    look: 0.24,
    irisR: 0.6,
    pupilR: 0.35,
    happyCol: "#ffffff",
  });
}

// =====================================================================================
// NARWHAL (LUMINA — STARLIGHT PEARL NARWHAL) — Rare Arctic Celestial Creature:
//   sleek moonlit-lavender & pearl whale body with twinkling star speckles,
//   expressive smiling snout, rosy cheeks, crescent whale fluke tail,
//   and an iconic gleaming spiraled golden-ivory horn tusk!
// =====================================================================================
function drawNarwhal(c: Ctx, sp: Species, p: Pose) {
  const pal = sp.pal;
  const LAV = pal.body || "#8e78ff",
    IND = pal.dark || "#4432a8",
    PRL = pal.belly || "#f7f4ff",
    GOLD = pal.stripe || "#ffe58f",
    STAR = pal.spot || "#b5f4ff",
    OL = rgba(pal.outline || "#1a1047", 0.94);
  const LW = 0.0072;
  const s = p.wag,
    s2 = p.wag2;

  // ---- 1. Graceful Crescent Whale Fluke Tail ----
  c.save();
  c.translate(-0.24, 0.005);
  c.rotate(s * 0.14);
  fillStroke(
    c,
    () => {
      c.moveTo(0.02, -0.028);
      c.bezierCurveTo(-0.07, -0.06, -0.155, -0.165, -0.215, -0.18 + s2 * 0.015);
      c.bezierCurveTo(-0.18, -0.095, -0.145, -0.032, -0.105, 0.0);
      c.bezierCurveTo(-0.145, 0.032, -0.18, 0.095, -0.215, 0.18 + s2 * 0.015);
      c.bezierCurveTo(-0.155, 0.165, -0.07, 0.06, 0.02, 0.028);
    },
    lin(c, 0.0, -0.16, -0.18, 0.16, [
      [0, IND],
      [0.5, LAV],
      [1, "#4e3cc4"],
    ]),
    OL,
    LW * 0.9,
    () => {
      c.strokeStyle = rgba(STAR, 0.55);
      c.lineWidth = 0.004;
      c.beginPath();
      c.moveTo(-0.02, -0.022);
      c.quadraticCurveTo(-0.12, -0.08, -0.195, -0.16);
      c.stroke();
    }
  );
  c.restore();

  // ---- 2. Iconic Spiraled Golden-Ivory Narwhal Horn / Tusk ----
  c.save();
  c.translate(0.248, -0.026);
  c.rotate(-0.15); // tilted slightly upward for proud silhouette
  const tuskLen = 0.232;
  fillStroke(
    c,
    () => {
      c.moveTo(0.0, -0.021);
      c.bezierCurveTo(tuskLen * 0.35, -0.014, tuskLen * 0.72, -0.007, tuskLen, 0.0);
      c.bezierCurveTo(tuskLen * 0.72, 0.007, tuskLen * 0.35, 0.014, 0.0, 0.021);
    },
    lin(c, 0, -0.022, 0, 0.022, [
      [0, "#fffdf2"],
      [0.45, GOLD],
      [1, "#d99b26"],
    ]),
    OL,
    LW * 0.76,
    () => {
      // Spiral diagonal tusk twist grooves!
      for (let i = 0; i < 7; i++) {
        const tx = 0.018 + i * 0.029;
        const hw = 0.022 * (1 - tx / (tuskLen * 1.08));
        c.strokeStyle = "rgba(175, 110, 15, 0.62)";
        c.lineWidth = 0.0042;
        c.beginPath();
        c.moveTo(tx - 0.005, -hw);
        c.lineTo(tx + 0.012, hw);
        c.stroke();

        c.strokeStyle = "rgba(255, 255, 255, 0.85)";
        c.lineWidth = 0.0026;
        c.beginPath();
        c.moveTo(tx - 0.009, -hw * 0.85);
        c.lineTo(tx + 0.007, hw * 0.45);
        c.stroke();
      }
    }
  );
  // Subtle starlight gleam near tusk tip
  glow(c, tuskLen - 0.01, -0.002, 0.032, 0.022, 0, "255,245,180", 0.55);
  c.restore();

  // ---- 3. Open Mouth Interior ----
  const mhX = 0.195,
    mhY = 0.068;
  const mTipX = 0.278 - p.open * 0.006;
  const mTipY = 0.062 + p.open * 0.052;
  c.beginPath();
  c.moveTo(0.225, 0.052);
  c.lineTo(mTipX, 0.05);
  c.quadraticCurveTo(0.248, 0.072 + p.open * 0.032, mhX, mhY);
  c.closePath();
  c.fillStyle = "#5c1438";
  c.fill();
  c.fillStyle = "#ff7aa8";
  blob(c, 0.235, 0.062 + p.open * 0.016, 0.022, 0.009 + p.open * 0.006, 0.12);

  // ---- 4. Sleek Plump Opalescent Narwhal Body ----
  fillStroke(
    c,
    () => {
      c.moveTo(-0.245, -0.028);
      c.bezierCurveTo(-0.145, -0.108, 0.02, -0.142, 0.175, -0.118);
      // Iconic rounded bulbous narwhal melon forehead curving smoothly to snout
      c.bezierCurveTo(0.245, -0.105, 0.292, -0.065, 0.292, -0.008);
      c.bezierCurveTo(0.292, 0.028, 0.282, 0.044, mTipX, 0.05);
      if (p.open > 0.02) {
        c.quadraticCurveTo(0.24, 0.056, mhX, mhY);
        c.lineTo(mTipX - 0.008, mTipY);
        c.quadraticCurveTo(0.228, 0.095 + p.open * 0.024, 0.135, 0.106 + p.open * 0.01);
      } else {
        c.quadraticCurveTo(0.248, 0.068, mhX, mhY);
        c.quadraticCurveTo(0.245, 0.072, 0.272, 0.064);
        c.quadraticCurveTo(0.225, 0.10, 0.135, 0.106);
      }
      c.bezierCurveTo(0.015, 0.12, -0.135, 0.09, -0.245, 0.032);
    },
    lin(c, 0.0, -0.14, 0.0, 0.12, [
      [0, IND],
      [0.42, LAV],
      [0.72, "#c6bdff"],
      [1, PRL],
    ]),
    OL,
    LW,
    () => {
      // Creamy pearl underbelly wave
      c.fillStyle = lin(c, 0, 0.02, 0, 0.12, [
        [0, PRL],
        [0.72, "#eee8ff"],
        [1, "#d2c8f7"],
      ]);
      c.beginPath();
      c.moveTo(-0.25, 0.018);
      c.bezierCurveTo(-0.11, 0.035, 0.06, 0.048, 0.285, 0.045);
      c.lineTo(0.29, 0.13);
      c.lineTo(-0.26, 0.12);
      c.closePath();
      c.fill();

      // Soft top crescent specular sheen
      glow(c, 0.08, -0.09, 0.18, 0.04, -0.05, "215,245,255", 0.34);

      // Authentic narwhal dappled mottled pearl-aqua spots across back
      const dots: [number, number, number, number, number, number][] = [
        [-0.08, -0.065, 0.022, 0.011, -0.15, 0.55],
        [-0.01, -0.085, 0.026, 0.012, 0.08, 0.55],
        [0.065, -0.078, 0.02, 0.01, -0.1, 0.6],
        [0.125, -0.058, 0.018, 0.009, 0.15, 0.55],
        [-0.145, -0.04, 0.019, 0.01, -0.12, 0.45],
        [-0.045, -0.035, 0.015, 0.008, 0.05, 0.5],
        [0.035, -0.042, 0.016, 0.008, -0.2, 0.45],
      ];
      for (const [dx, dy, rx, ry, rot, a] of dots) {
        c.fillStyle = rgba(STAR, a);
        blob(c, dx, dy, rx, ry, rot);
      }

      // Rosy kawaii cheek blush
      c.fillStyle = "rgba(255, 130, 185, 0.52)";
      blob(c, 0.17, 0.045, 0.025, 0.015, 0.08);
      if (p.puff) {
        c.fillStyle = "rgba(255, 145, 200, 0.7)";
        blob(c, 0.185, 0.052, 0.03, 0.02, 0);
      }
    }
  );

  // ---- 5. Rounded Flipper Fin ----
  c.save();
  c.translate(0.055, 0.052);
  c.rotate(s2 * 0.22);
  fillStroke(
    c,
    () => {
      c.moveTo(0.01, -0.008);
      c.bezierCurveTo(-0.025, 0.055, -0.088, 0.082, -0.112, 0.055);
      c.bezierCurveTo(-0.125, 0.03, -0.072, -0.012, -0.008, -0.014);
    },
    lin(c, 0, -0.01, -0.11, 0.07, [
      [0, LAV],
      [0.65, IND],
      [1, "#2f2285"],
    ]),
    OL,
    LW * 0.78,
    () => {
      c.strokeStyle = rgba(STAR, 0.55);
      c.lineWidth = 0.0032;
      c.beginPath();
      c.moveTo(-0.015, 0.045);
      c.quadraticCurveTo(-0.065, 0.068, -0.102, 0.052);
      c.stroke();
    }
  );
  c.restore();

  // ---- 6. Glossy Starry Whale Eye ----
  const ex = 0.202,
    ey = 0.002 - p.open * 0.002,
    er = 0.042;
  eye(c, ex, ey, er, {
    iris: pal.iris || "#1f3a8a",
    expr: p.expr,
    ol: OL,
    sx: 0.94,
    look: 0.24,
    irisR: 0.62,
    pupilR: 0.38,
    happyCol: "#ffffff",
  });
}

// =====================================================================================
// NAGA DAUN (LEAFY SEADRAGON) — Enchanted Golden-Emerald Kelp Sovereign:
//   graceful arched armored S-posture with slender segmented neck & curled tail,
//   long tubular pipe snout with flared trumpet mouth & delicate chin sprout,
//   ornate bony ridge spines & teal-gold banding, fluttering gossamer propeller fins,
//   and lush multi-branching ruffled kelp-leaf plumes along crown, back, belly & tail!
// =====================================================================================
function drawSeadragon(c: Ctx, sp: Species, p: Pose) {
  const pal = sp.pal;
  const EMR = pal.body || "#22b87a",
    DK = pal.dark || "#0c4a38",
    GOLD = pal.belly || "#ffe47a",
    AMBER = pal.fin || "#e6a825",
    LEAF = pal.spot || "#9effc6",
    TEAL = "#17a89a",
    OL = rgba(pal.outline || "#07261c", 0.92);
  const LW = 0.0058;
  const s = p.wag,
    s2 = p.wag2;

  c.save();
  c.translate(0.038, 0.01);
  c.scale(0.92, 0.92);

  // Individual ruffled, curling kelp leaflet blade with midrib and side veins
  const drawKelpLeaflet = (len: number, wid: number, warm: boolean, curl: number, far = false) => {
    const tipX = len;
    const tipY = curl * len * 0.24;
    fillStroke(
      c,
      () => {
        c.moveTo(0, 0);
        // Sculpted ruffled 4-scallop seaweed blade curving gently to tapered tip
        c.bezierCurveTo(len * 0.16, -wid * 0.95, len * 0.3, -wid * 0.45, len * 0.42, -wid * 1.15);
        c.bezierCurveTo(len * 0.56, -wid * 1.0, len * 0.65, -wid * 0.38, len * 0.78, -wid * 0.85);
        c.bezierCurveTo(len * 0.9, -wid * 0.46, len * 0.96, -wid * 0.14 + tipY * 0.5, tipX, tipY);
        c.bezierCurveTo(len * 0.95, wid * 0.26 + tipY * 0.6, len * 0.86, wid * 0.72 + tipY * 0.3, len * 0.74, wid * 0.46);
        c.bezierCurveTo(len * 0.62, wid * 1.02, len * 0.5, wid * 0.6, len * 0.38, wid * 0.98);
        c.bezierCurveTo(len * 0.24, wid * 0.62, len * 0.14, wid * 0.35, 0, 0.003);
      },
      lin(c, 0, -wid * 0.35, tipX, wid * 0.35 + tipY, warm
        ? [
            [0, DK],
            [0.28, "#b87a14"],
            [0.62, AMBER],
            [0.88, GOLD],
            [1, "#fff8c4"],
          ]
        : [
            [0, DK],
            [0.32, TEAL],
            [0.64, EMR],
            [0.88, LEAF],
            [1, "#e2fff0"],
          ]),
      OL,
      LW * (far ? 0.56 : 0.64),
      () => {
        // Luminous golden-mint central kelp vein + delicate side veins
        c.strokeStyle = rgba(warm ? "#fff6bd" : GOLD, far ? 0.48 : 0.82);
        c.lineWidth = 0.0024;
        c.beginPath();
        c.moveTo(0.004, 0);
        c.quadraticCurveTo(len * 0.52, tipY * 0.32, len * 0.92, tipY * 0.92);
        c.stroke();

        c.lineWidth = 0.0017;
        for (const t of [0.32, 0.54, 0.74]) {
          const vx = len * t;
          const vy = tipY * t * 0.65;
          c.beginPath();
          c.moveTo(vx, vy);
          c.lineTo(vx + len * 0.1, vy - wid * 0.62);
          c.moveTo(vx, vy);
          c.lineTo(vx + len * 0.09, vy + wid * 0.56);
          c.stroke();
        }
      }
    );
  };

  // Multi-branching leafy kelp cluster on an organic swaying stem!
  const drawKelpBranch = (
    ax: number,
    ay: number,
    ang: number,
    len: number,
    wid: number,
    warm: boolean,
    sway: number,
    branches = 3,
    far = false
  ) => {
    c.save();
    c.translate(ax, ay);
    c.rotate(ang);
    if (far) c.globalAlpha = 0.76;

    // Slender organic stem curving smoothly outward
    const stemEnd = len * 0.32;
    const stemCurveY = sway * 0.018;
    c.strokeStyle = OL;
    c.lineWidth = LW * 0.9;
    c.beginPath();
    c.moveTo(0, 0);
    c.quadraticCurveTo(stemEnd * 0.5, stemCurveY * 0.45, stemEnd, stemCurveY);
    c.stroke();
    c.strokeStyle = warm ? AMBER : EMR;
    c.lineWidth = LW * 0.45;
    c.stroke();

    // Base junction node
    c.fillStyle = warm ? GOLD : LEAF;
    c.beginPath();
    c.arc(stemEnd, stemCurveY, 0.0055, 0, TAU);
    c.fill();

    c.translate(stemEnd, stemCurveY);

    if (branches >= 3) {
      // Lower side leaflet
      c.save();
      c.rotate(0.46 + sway * 0.08);
      drawKelpLeaflet(len * 0.54, wid * 0.74, !warm, 0.25 + sway * 0.25, far);
      c.restore();

      // Upper side leaflet
      c.save();
      c.rotate(-0.44 + sway * 0.08);
      drawKelpLeaflet(len * 0.58, wid * 0.78, warm, -0.22 + sway * 0.25, far);
      c.restore();
    } else if (branches === 2) {
      c.save();
      c.rotate(0.38 + sway * 0.08);
      drawKelpLeaflet(len * 0.56, wid * 0.76, !warm, 0.22 + sway * 0.2, far);
      c.restore();
    }

    // Main central cascading kelp leaflet
    c.save();
    c.rotate(sway * 0.06);
    drawKelpLeaflet(len * 0.82, wid, warm, 0.14 + sway * 0.32, far);
    c.restore();

    c.restore();
  };

  // ---- 1. Far-Side Background Kelp Plumes (3D Layering Depth) ----
  drawKelpBranch(-0.14, -0.042, -2.14 + s2 * 0.13, 0.175, 0.044, true, s2, 2, true);
  drawKelpBranch(0.01, -0.092, -1.78 + s2 * 0.12, 0.20, 0.048, false, -s, 2, true);
  drawKelpBranch(-0.02, 0.068, 1.98 - s2 * 0.12, 0.175, 0.044, true, s2, 2, true);
  drawKelpBranch(-0.34, 0.028 + s * 0.018, 2.75 + s * 0.18, 0.17, 0.042, false, -s2, 2, true);

  // ---- 2. Near-Side Lush Trailing Tail, Back & Belly Kelp Clusters ----
  // Tail trailing kelp bouquet
  drawKelpBranch(-0.355, 0.022 + s * 0.02, -2.62 + s * 0.2, 0.185, 0.046, true, s2, 3);
  drawKelpBranch(-0.275, 0.008 + s * 0.012, -2.35 + s * 0.16, 0.155, 0.038, false, -s, 2);
  drawKelpBranch(-0.335, 0.048 + s * 0.02, 2.52 + s * 0.18, 0.165, 0.042, false, s2, 2);

  // Iconic grand dorsal kelp plumes cascading off the arched spine
  drawKelpBranch(-0.155, -0.052, -2.02 + s2 * 0.15, 0.19, 0.048, false, s2, 3);
  drawKelpBranch(-0.032, -0.108, -1.72 + s2 * 0.14, 0.225, 0.054, true, -s2, 3);
  drawKelpBranch(0.088, -0.104, -1.48 + s2 * 0.12, 0.19, 0.046, false, s, 3);

  // Graceful belly & hip kelp plumes
  drawKelpBranch(-0.145, 0.028, 2.15 - s2 * 0.14, 0.17, 0.042, true, -s2, 2);
  drawKelpBranch(0.0, 0.072, 1.82 - s2 * 0.14, 0.195, 0.048, false, s2, 3);
  drawKelpBranch(0.125, 0.058, 1.48 - s2 * 0.12, 0.155, 0.038, true, -s, 2);

  // ---- 3. Translucent Golden-Pearl Dorsal Propeller Finlet ----
  c.save();
  c.translate(-0.125, -0.068);
  fillStroke(
    c,
    () => {
      c.moveTo(-0.068, 0.024);
      c.bezierCurveTo(-0.065, -0.075, 0.028, -0.092 + s2 * 0.018, 0.068, -0.004);
    },
    lin(c, -0.05, -0.08, 0.06, 0.01, [
      [0, "rgba(255, 248, 185, 0.92)"],
      [0.55, "rgba(230, 168, 37, 0.8)"],
      [1, "rgba(23, 168, 154, 0.85)"],
    ]),
    OL,
    LW * 0.64,
    () => {
      c.strokeStyle = "rgba(255, 255, 225, 0.72)";
      c.lineWidth = 0.0022;
      for (let i = -3; i <= 3; i++) {
        c.beginPath();
        c.moveTo(i * 0.014, 0.008);
        c.lineTo(i * 0.018 - 0.008, -0.068);
        c.stroke();
      }
    }
  );
  c.restore();

  // ---- 4. Open Trumpet Pipe-Snout Mouth Interior ----
  const tipX = 0.452 - p.open * 0.01;
  const lowY = 0.002 + p.open * 0.046;
  if (p.open > 0.03) {
    c.beginPath();
    c.moveTo(0.375, -0.016);
    c.lineTo(tipX, -0.028);
    c.lineTo(tipX - 0.008, lowY);
    c.closePath();
    c.fillStyle = "#5c1328";
    c.fill();
  }

  // ---- 5. Graceful S-Curved Armored Seadragon Body & Long Slender Pipe Snout ----
  const tailY = 0.042 + s * 0.022;
  fillStroke(
    c,
    () => {
      // Curled segmented tail tip sweeping into slender peduncle and deeply arched torso
      c.moveTo(-0.378, tailY);
      c.bezierCurveTo(-0.295, 0.006 + s * 0.015, -0.2, -0.042, -0.095, -0.104);
      c.bezierCurveTo(-0.005, -0.146, 0.085, -0.132, 0.148, -0.086);
      // Slender arched armored neck rising to proud crowned head
      c.bezierCurveTo(0.188, -0.058, 0.218, -0.098, 0.272, -0.084);
      c.bezierCurveTo(0.308, -0.074, 0.326, -0.042, 0.358, -0.032);
      // Long slender tubular pipe snout with delicate flared trumpet lip
      c.bezierCurveTo(0.395, -0.024, 0.428, -0.03, tipX, -0.03);
      if (p.open > 0.03) {
        c.lineTo(0.39, -0.012);
        c.lineTo(tipX - 0.008, lowY);
        c.quadraticCurveTo(0.388, 0.006 + p.open * 0.016, 0.292, 0.004);
      } else {
        c.quadraticCurveTo(0.458, -0.012, 0.442, 0.0);
        c.bezierCurveTo(0.395, -0.006, 0.345, -0.004, 0.292, 0.004);
      }
      // Slender throat curving into sculpted armored chest & tapering tail
      c.bezierCurveTo(0.252, 0.032, 0.212, 0.056, 0.145, 0.064);
      c.bezierCurveTo(0.058, 0.094, -0.052, 0.082, -0.165, 0.034);
      c.bezierCurveTo(-0.255, 0.016, -0.328, 0.068 + s * 0.02, -0.378, tailY + 0.013);
      c.quadraticCurveTo(-0.396, tailY + 0.006, -0.378, tailY);
    },
    lin(c, 0.02, -0.13, 0.02, 0.095, [
      [0, DK],
      [0.32, TEAL],
      [0.58, EMR],
      [0.82, AMBER],
      [1, GOLD],
    ]),
    OL,
    LW,
    () => {
      // Sunlit emerald-gold dorsal highlight
      glow(c, 0.04, -0.078, 0.25, 0.055, -0.06, "220,255,175", 0.3);

      // Warm golden-amber belly keel shading
      c.fillStyle = lin(c, 0.05, 0.005, 0.05, 0.095, [
        [0, "rgba(255, 228, 122, 0.3)"],
        [0.55, GOLD],
        [1, AMBER],
      ]);
      c.beginPath();
      c.moveTo(-0.185, 0.016);
      c.bezierCurveTo(-0.04, 0.03, 0.11, 0.034, 0.258, 0.004);
      c.lineTo(0.245, 0.1);
      c.lineTo(-0.205, 0.08);
      c.closePath();
      c.fill();

      // Ornate diagonal seahorse/seadragon turquoise & amber vertical tiger stripes
      c.strokeStyle = rgba("#115e59", 0.45);
      c.lineWidth = 0.009;
      for (let i = -3; i <= 2; i++) {
        const sx = i * 0.054 + 0.01;
        c.beginPath();
        c.moveTo(sx, -0.13);
        c.quadraticCurveTo(sx - 0.024, 0.0, sx + 0.004, 0.088);
        c.stroke();
      }

      // Crisp sculpted golden bony armor rings & raised ridge highlights
      c.strokeStyle = rgba(GOLD, 0.78);
      c.lineWidth = 0.0038;
      for (let i = -6; i <= 4; i++) {
        const rx = i * 0.044 - 0.022;
        c.beginPath();
        c.moveTo(rx, -0.135);
        c.quadraticCurveTo(rx - 0.022, 0.0, rx, 0.09);
        c.stroke();
      }
      c.strokeStyle = rgba(DK, 0.44);
      c.lineWidth = 0.0022;
      for (let i = -6; i <= 4; i++) {
        const rx = i * 0.044 - 0.017;
        c.beginPath();
        c.moveTo(rx, -0.135);
        c.quadraticCurveTo(rx - 0.022, 0.0, rx, 0.09);
        c.stroke();
      }

      // Fine pipe-snout & curled-tail armor rings
      c.strokeStyle = rgba(GOLD, 0.56);
      c.lineWidth = 0.0024;
      for (let i = 0; i < 4; i++) {
        const sx = 0.318 + i * 0.028;
        c.beginPath();
        c.moveTo(sx, -0.038);
        c.lineTo(sx - 0.004, 0.005);
        c.stroke();
      }
      for (let i = 0; i < 4; i++) {
        const tx = -0.24 - i * 0.032;
        c.beginPath();
        c.moveTo(tx, -0.045);
        c.lineTo(tx + 0.004, 0.085);
        c.stroke();
      }

      // Luminous mint-emerald jewel spots along flank armor
      c.fillStyle = rgba(LEAF, 0.94);
      for (const [dx, dy] of [
        [-0.22, 0.006],
        [-0.15, -0.028],
        [-0.09, -0.052],
        [-0.025, -0.06],
        [0.04, -0.056],
        [0.105, -0.04],
        [0.165, -0.022],
        [0.295, -0.014],
      ]) {
        blob(c, dx, dy, 0.0085, 0.0058, 0.12);
        c.fillStyle = "#ffffff";
        blob(c, dx - 0.002, dy - 0.0018, 0.003, 0.002, 0.12);
        c.fillStyle = rgba(LEAF, 0.94);
      }

      if (p.puff) {
        c.fillStyle = "rgba(255, 200, 145, 0.65)";
        blob(c, 0.232, 0.012, 0.024, 0.015, 0);
      }
    }
  );

  // ---- 6. Delicate Chin Kelp Sprout, Ornate Crown Antler Plume & Brow Crest ----
  // Tiny delicate leaf sprout under the chin/snout
  drawKelpBranch(0.318, -0.002, 1.48 - s2 * 0.12, 0.088, 0.024, false, -s, 2);

  // Regal branching golden crown plume behind head
  drawKelpBranch(0.225, -0.082, -1.96 + s2 * 0.09, 0.155, 0.038, true, s2, 3);

  // Sculpted golden-jade brow spine above eye
  fillStroke(
    c,
    () => {
      c.moveTo(0.246, -0.078);
      c.quadraticCurveTo(0.275, -0.124, 0.304, -0.126);
      c.quadraticCurveTo(0.288, -0.092, 0.28, -0.072);
    },
    lin(c, 0.25, -0.075, 0.3, -0.125, [
      [0, AMBER],
      [1, "#fff4b3"],
    ]),
    OL,
    LW * 0.6
  );

  // ---- 7. Translucent Gossamer Neck Pectoral Finlet ----
  c.save();
  c.translate(0.182, -0.014);
  c.rotate(s2 * 0.26);
  fillStroke(
    c,
    () => {
      c.moveTo(0, 0);
      c.bezierCurveTo(-0.026, -0.048, -0.098, -0.026, -0.092, 0.028);
      c.bezierCurveTo(-0.074, 0.072, -0.014, 0.054, 0, 0.014);
    },
    lin(c, 0, 0, -0.09, 0.022, [
      [0, "rgba(34, 184, 122, 0.85)"],
      [0.52, "rgba(255, 228, 122, 0.9)"],
      [1, "rgba(195, 255, 225, 0.94)"],
    ]),
    OL,
    LW * 0.62,
    () => {
      c.strokeStyle = "rgba(255,255,255,0.68)";
      c.lineWidth = 0.0022;
      for (let r = -1; r <= 2; r++) {
        c.beginPath();
        c.moveTo(-0.006, 0.004);
        c.lineTo(-0.076, r * 0.016);
        c.stroke();
      }
    }
  );
  c.restore();

  // ---- 8. Amber-Crowned Seadragon Jewel Eye ----
  const ex = 0.264,
    ey = -0.046,
    er = 0.036;
  c.beginPath();
  c.arc(ex, ey, er * 1.24, 0, TAU);
  c.fillStyle = lin(c, ex, ey - er, ex, ey + er, [
    [0, GOLD],
    [1, AMBER],
  ]);
  c.fill();
  c.strokeStyle = OL;
  c.lineWidth = 0.0036;
  c.stroke();

  eye(c, ex, ey, er, {
    iris: pal.iris || "#ff6b35",
    expr: p.expr,
    ol: OL,
    sx: 0.95,
    look: 0.25,
    irisR: 0.6,
    pupilR: 0.35,
    happyCol: GOLD,
  });
  c.restore();
}

// =====================================================================================
// MOCHI (AXOLOTL KRISTAL) — Adorable Pastel Crystal Axolotl:
//   chubby sakura-pink salamander body & broad cute smiling head, 3 PAIRS of fluffy
//   feathered coral-red gills, 4 tiny stubby paddle feet, rosy blushing cheeks,
//   and a sparkling translucent crystal-faceted ribbon tail!
// =====================================================================================
function drawAxolotl(c: Ctx, sp: Species, p: Pose) {
  const pal = sp.pal;
  const PINK = pal.body || "#ffb6d9",
    DK = pal.dark || "#db5c98",
    BELLY = pal.belly || "#fff2f9",
    GILL = pal.fin || "#ff3f82",
    CRYS = pal.spot || "#6ef7ff",
    OL = rgba(pal.outline || "#4d1234", 0.9);
  const LW = 0.0062;
  const s = p.wag,
    s2 = p.wag2;

  // Fluffy feathered coral-red gill frond helper (stem + side feather filaments!)
  const drawFeatherGill = (gx: number, gy: number, ang: number, len: number, far = false) => {
    c.save();
    c.translate(gx, gy);
    c.rotate(ang);
    if (far) c.globalAlpha = 0.78;
    const stalkCol = far ? "#c92a64" : GILL;
    const tipCol = far ? "#e86a98" : "#ff8fc0";

    // Fluffy side feather pinnae along the gill branch
    const nFeathers = far ? 4 : 6;
    for (let i = 1; i <= nFeathers; i++) {
      const t = i / (nFeathers + 0.6);
      const bx = len * t;
      const flen = len * (0.28 + Math.sin(t * Math.PI) * 0.16);
      for (const side of [-1, 1]) {
        c.save();
        c.translate(bx, side * 0.004);
        c.rotate(side * 0.72);
        c.beginPath();
        c.moveTo(0, -0.006);
        c.bezierCurveTo(flen * 0.45, -0.013, flen * 0.85, -0.008, flen, 0);
        c.bezierCurveTo(flen * 0.85, 0.008, flen * 0.45, 0.013, 0, 0.006);
        c.closePath();
        c.fillStyle = lin(c, 0, 0, flen, 0, [
          [0, stalkCol],
          [0.75, tipCol],
          [1, "#ffd9ec"],
        ]);
        c.fill();
        c.strokeStyle = OL;
        c.lineWidth = LW * 0.45;
        c.stroke();
        c.restore();
      }
    }

    // Main central coral gill stalk
    fillStroke(
      c,
      () => {
        c.moveTo(0, -0.009);
        c.bezierCurveTo(len * 0.4, -0.014, len * 0.8, -0.008, len * 1.04, 0);
        c.bezierCurveTo(len * 0.8, 0.008, len * 0.4, 0.014, 0, 0.009);
      },
      lin(c, 0, 0, len, 0, [
        [0, PINK],
        [0.45, stalkCol],
        [1, tipCol],
      ]),
      OL,
      LW * 0.62
    );

    if (!far) {
      // Subtle crystal highlight along gill stalk
      c.strokeStyle = rgba(CRYS, 0.68);
      c.lineWidth = 0.0022;
      c.beginPath();
      c.moveTo(0.01, 0);
      c.lineTo(len * 0.82, 0);
      c.stroke();
    }
    c.restore();
  };

  // Little crystal facet sparkle helper
  const crystalSparkle = (cx: number, cy: number, r: number, col = CRYS) => {
    c.save();
    c.translate(cx, cy);
    c.fillStyle = col;
    c.beginPath();
    c.moveTo(0, -r);
    c.lineTo(r * 0.36, -r * 0.36);
    c.lineTo(r, 0);
    c.lineTo(r * 0.36, r * 0.36);
    c.lineTo(0, r);
    c.lineTo(-r * 0.36, r * 0.36);
    c.lineTo(-r, 0);
    c.lineTo(-r * 0.36, -r * 0.36);
    c.closePath();
    c.fill();
    c.fillStyle = "#ffffff";
    c.beginPath();
    c.arc(0, 0, r * 0.24, 0, TAU);
    c.fill();
    c.restore();
  };

  // ---- 1. Far-Side 3 Feathered Coral Gills (peeking behind crown for 3 pairs!) ----
  drawFeatherGill(0.185, -0.088, -1.78 + s2 * 0.08, 0.105, true);
  drawFeatherGill(0.165, -0.072, -2.02 + s2 * 0.1, 0.112, true);
  drawFeatherGill(0.148, -0.05, -2.26 + s2 * 0.1, 0.098, true);

  // ---- 2. Translucent Shimmering Crystal Ribbon Tail (Ekor Pita Kristal Berkilau) ----
  c.save();
  c.translate(-0.145, 0.0);
  c.rotate(s * 0.16);
  fillStroke(
    c,
    () => {
      c.moveTo(0.155, -0.078);
      c.bezierCurveTo(0.02, -0.155, -0.175, -0.165 + s2 * 0.022, -0.275, -0.035 + s2 * 0.025);
      c.bezierCurveTo(-0.305, 0.005 + s2 * 0.024, -0.295, 0.055 + s2 * 0.022, -0.255, 0.085 + s2 * 0.02);
      c.bezierCurveTo(-0.165, 0.135 + s2 * 0.016, -0.025, 0.095, 0.055, 0.036);
      c.closePath();
    },
    lin(c, 0.08, -0.12, -0.28, 0.07, [
      [0, "rgba(255, 182, 217, 0.86)"],
      [0.42, "rgba(255, 110, 175, 0.68)"],
      [0.78, "rgba(110, 247, 255, 0.78)"],
      [1, "rgba(218, 252, 255, 0.92)"],
    ]),
    OL,
    LW * 0.75,
    () => {
      // Translucent crystal prism facets inside ribbon tail
      c.fillStyle = "rgba(255, 255, 255, 0.34)";
      c.beginPath();
      c.moveTo(-0.08, -0.11);
      c.lineTo(-0.16, -0.04);
      c.lineTo(-0.22, -0.09);
      c.closePath();
      c.fill();

      c.fillStyle = "rgba(110, 247, 255, 0.42)";
      c.beginPath();
      c.moveTo(-0.18, 0.01);
      c.lineTo(-0.26, 0.04);
      c.lineTo(-0.21, 0.09);
      c.closePath();
      c.fill();

      // Iridescent aqua-pearl rim along crystal tail edge
      c.strokeStyle = rgba(CRYS, 0.85);
      c.lineWidth = 0.008;
      c.beginPath();
      c.moveTo(-0.05, -0.125);
      c.bezierCurveTo(-0.18, -0.135, -0.28, -0.04 + s2 * 0.022, -0.25, 0.075 + s2 * 0.02);
      c.stroke();

      crystalSparkle(-0.11, -0.075, 0.016);
      crystalSparkle(-0.21, -0.015 + s2 * 0.016, 0.018, "#ffffff");
      crystalSparkle(-0.16, 0.055 + s2 * 0.012, 0.014);
    }
  );
  c.restore();

  // ---- 3. Far-Side Cute Little Paddle Feet (3D depth) ----
  const drawPaddleFoot = (fx: number, fy: number, rot: number, far = false) => {
    c.save();
    c.translate(fx, fy);
    c.rotate(rot);
    if (far) c.globalAlpha = 0.74;
    fillStroke(
      c,
      () => {
        c.moveTo(-0.014, -0.008);
        c.bezierCurveTo(-0.018, 0.032, -0.034, 0.058, -0.022, 0.068);
        // Cute 3 rounded salamander toe-nubs
        c.quadraticCurveTo(-0.01, 0.078, -0.002, 0.065);
        c.quadraticCurveTo(0.008, 0.076, 0.016, 0.064);
        c.quadraticCurveTo(0.026, 0.07, 0.024, 0.052);
        c.bezierCurveTo(0.022, 0.03, 0.012, 0.008, 0.01, -0.008);
      },
      far
        ? DK
        : lin(c, 0, -0.01, 0, 0.07, [
            [0, PINK],
            [0.75, BELLY],
            [1, "#ffe3f2"],
          ]),
      OL,
      LW * 0.68
    );
    c.restore();
  };

  drawPaddleFoot(0.115, 0.068, 0.15 - s2 * 0.12, true);
  drawPaddleFoot(-0.082, 0.062, 0.55 - s2 * 0.12, true);

  // ---- 4. Open Cute Mouth Interior ----
  const mhX = 0.246,
    mhY = 0.04;
  const mTipX = 0.354 - p.open * 0.008;
  const mTipY = 0.032 + p.open * 0.056;
  if (p.open > 0.02) {
    c.beginPath();
    c.moveTo(0.285, 0.02);
    c.lineTo(mTipX, 0.02);
    c.quadraticCurveTo(0.312, 0.045 + p.open * 0.035, mhX, mhY);
    c.closePath();
    c.fillStyle = "#7a1440";
    c.fill();
  }

  // ---- 5. Chubby Pastel Sakura Axolotl Body & Broad Rounded Head ----
  fillStroke(
    c,
    () => {
      c.moveTo(-0.205, -0.022);
      c.bezierCurveTo(-0.105, -0.076, 0.055, -0.096, 0.178, -0.104);
      // Iconic broad rounded chibi axolotl head
      c.bezierCurveTo(0.278, -0.112, 0.352, -0.058, mTipX, 0.02);
      if (p.open > 0.02) {
        c.quadraticCurveTo(0.306, 0.03, mhX, mhY);
        c.lineTo(mTipX - 0.008, mTipY);
        c.quadraticCurveTo(0.3, 0.08 + p.open * 0.02, 0.175, 0.094 + p.open * 0.008);
      } else {
        // Adorable wide curved axolotl smile!
        c.quadraticCurveTo(0.318, 0.044, mhX, mhY);
        c.quadraticCurveTo(0.312, 0.048, 0.338, 0.036);
        c.quadraticCurveTo(0.288, 0.088, 0.175, 0.094);
      }
      c.bezierCurveTo(0.052, 0.106, -0.09, 0.078, -0.205, 0.022);
    },
    lin(c, 0.06, -0.108, 0.06, 0.105, [
      [0, DK],
      [0.32, PINK],
      [0.74, BELLY],
      [1, "#ffe8f5"],
    ]),
    OL,
    LW,
    () => {
      glow(c, 0.08, -0.058, 0.21, 0.045, 0.0, "255,255,255", 0.36);

      // Sparkling crystal dots & tiny star glints along flank
      crystalSparkle(0.06, -0.042, 0.013);
      crystalSparkle(-0.03, -0.026, 0.015);
      crystalSparkle(-0.115, -0.012, 0.012);
      c.fillStyle = rgba(CRYS, 0.85);
      blob(c, 0.015, 0.026, 0.009, 0.0065, 0.0);

      // Adorable rosy merona cheek blush + tiny cute shine marks!
      c.fillStyle = rgba(GILL, p.puff ? 0.58 : 0.42);
      blob(c, 0.232, 0.034, 0.028, 0.016, 0.08);
      c.strokeStyle = "rgba(255, 255, 255, 0.65)";
      c.lineWidth = 0.0024;
      c.beginPath();
      c.moveTo(0.222, 0.032);
      c.lineTo(0.227, 0.026);
      c.moveTo(0.232, 0.034);
      c.lineTo(0.237, 0.028);
      c.stroke();
    }
  );

  // Cute friendly smile corner dimple when closed
  if (p.open <= 0.02) {
    c.strokeStyle = OL;
    c.lineWidth = LW * 0.58;
    c.beginPath();
    c.arc(0.244, 0.038, 0.008, Math.PI * 0.65, Math.PI * 1.45);
    c.stroke();
  }

  // ---- 6. Near-Side 3 Fluffy Feathered Red-Coral Gills ----
  drawFeatherGill(0.148, -0.054, -2.06 + s2 * 0.09, 0.132);
  drawFeatherGill(0.14, -0.02, -2.42 + s2 * 0.11, 0.146);
  drawFeatherGill(0.138, 0.018, -2.82 + s2 * 0.12, 0.128);

  // ---- 7. Near-Side Cute Little Front & Rear Paddle Feet ----
  drawPaddleFoot(0.088, 0.058, 0.36 + s2 * 0.16, false);
  drawPaddleFoot(-0.095, 0.048, 0.72 - s2 * 0.14, false);

  // ---- 8. Sparkling Kawaii Axolotl Eye ----
  const ex = 0.252,
    ey = -0.032 - p.open * 0.004,
    er = 0.04;
  eye(c, ex, ey, er, {
    iris: pal.iris || "#28143b",
    expr: p.expr,
    ol: OL,
    sx: 0.94,
    look: 0.24,
    irisR: 0.68,
    pupilR: 0.44,
    happyCol: GILL,
  });
}

// =====================================================================================
// ASTRO (STARLIGHT WHALE SHARK) — Celestial Gentle Giant:
//   iconic broad flat-snouted whale-shark silhouette with wide friendly smiling mouth,
//   5 gill slits, longitudinal dermal ridges, majestic sweeping pectoral wings,
//   and glowing star-constellation patterns connected across the midnight-blue back!
// =====================================================================================
function drawWhaleshark(c: Ctx, sp: Species, p: Pose) {
  const pal = sp.pal;
  const NAVY = pal.body || "#163a7a",
    DK = pal.dark || "#0a1a42",
    BELLY = pal.belly || "#e8f6ff",
    FIN = pal.fin || "#1d4b96",
    CYAN = pal.stripe || "#5ce6ff",
    STAR = pal.spot || "#fff4b8",
    OL = rgba(pal.outline || "#050d24", 0.92);
  const LW = 0.0064;
  const s = p.wag,
    s2 = p.wag2;

  const drawStar4 = (sx: number, sy: number, r: number, col = STAR) => {
    c.save();
    c.translate(sx, sy);
    c.fillStyle = rgba(CYAN, 0.34);
    c.beginPath();
    c.arc(0, 0, r * 1.65, 0, TAU);
    c.fill();
    c.fillStyle = col;
    c.beginPath();
    c.moveTo(0, -r);
    c.lineTo(r * 0.32, -r * 0.32);
    c.lineTo(r, 0);
    c.lineTo(r * 0.32, r * 0.32);
    c.lineTo(0, r);
    c.lineTo(-r * 0.32, r * 0.32);
    c.lineTo(-r, 0);
    c.lineTo(-r * 0.32, -r * 0.32);
    c.closePath();
    c.fill();
    c.restore();
  };

  // ---- 1. Far-Side Majestic Pectoral Wing Fin (3D depth below chest) ----
  c.save();
  c.translate(0.155, 0.068);
  c.rotate(-0.18 - s2 * 0.1);
  c.globalAlpha = 0.78;
  fillStroke(
    c,
    () => {
      c.moveTo(0, 0);
      c.bezierCurveTo(-0.015, 0.055, -0.075, 0.115, -0.118, 0.105);
      c.bezierCurveTo(-0.095, 0.055, -0.052, 0.012, -0.018, -0.01);
    },
    lin(c, 0, 0, -0.1, 0.1, [
      [0, DK],
      [0.65, NAVY],
      [1, "#2a62b8"],
    ]),
    OL,
    LW * 0.72
  );
  c.restore();

  // ---- 2. Grand Crescent Whale-Shark Tail ----
  c.save();
  c.translate(-0.225, 0.0);
  c.rotate(s * 0.15);
  fillStroke(
    c,
    () => {
      c.moveTo(0.018, -0.024);
      c.bezierCurveTo(-0.075, -0.125, -0.165, -0.22 + s2 * 0.016, -0.232, -0.225 + s2 * 0.02);
      c.bezierCurveTo(-0.182, -0.115, -0.145, -0.032, -0.145, 0.0);
      c.bezierCurveTo(-0.145, 0.03, -0.165, 0.095, -0.195, 0.165 + s2 * 0.018);
      c.bezierCurveTo(-0.122, 0.135, -0.052, 0.072, 0.018, 0.024);
    },
    lin(c, 0, -0.21, -0.21, 0.15, [
      [0, DK],
      [0.48, NAVY],
      [1, FIN],
    ]),
    OL,
    LW * 0.86,
    () => {
      // Shimmering cyan edge & starlight speckles on tail lobe
      c.strokeStyle = rgba(CYAN, 0.52);
      c.lineWidth = 0.0045;
      c.beginPath();
      c.moveTo(-0.218, -0.205 + s2 * 0.018);
      c.quadraticCurveTo(-0.155, -0.08, -0.148, 0.0);
      c.stroke();

      drawStar4(-0.13, -0.105, 0.012);
      drawStar4(-0.172, -0.152, 0.011);
      c.fillStyle = rgba(STAR, 0.8);
      blob(c, -0.14, 0.078, 0.0065, 0.0055, 0);
    }
  );
  c.restore();

  // ---- 3. Tall Rounded Primary Dorsal, Secondary Dorsal & Pelvic/Anal Fins ----
  fillStroke(
    c,
    () => {
      c.moveTo(-0.048, -0.09);
      c.bezierCurveTo(-0.058, -0.202, 0.006, -0.252, 0.048, -0.228);
      c.bezierCurveTo(0.062, -0.185, 0.062, -0.125, 0.078, -0.096);
    },
    lin(c, 0.01, -0.24, 0.01, -0.09, [
      [0, CYAN],
      [0.24, FIN],
      [0.75, NAVY],
      [1, DK],
    ]),
    OL,
    LW * 0.82,
    () => {
      c.strokeStyle = rgba(CYAN, 0.65);
      c.lineWidth = 0.0042;
      c.beginPath();
      c.moveTo(-0.02, -0.195);
      c.quadraticCurveTo(0.015, -0.238, 0.045, -0.215);
      c.stroke();
      drawStar4(0.01, -0.168, 0.011);
      drawStar4(0.028, -0.132, 0.0095);
    }
  );

  // Small 2nd dorsal & anal fin near tail peduncle
  fillStroke(
    c,
    () => {
      c.moveTo(-0.185, -0.036);
      c.bezierCurveTo(-0.188, -0.096, -0.148, -0.108, -0.128, -0.056);
    },
    FIN,
    OL,
    LW * 0.76
  );
  fillStroke(
    c,
    () => {
      c.moveTo(-0.175, 0.034);
      c.bezierCurveTo(-0.178, 0.086, -0.142, 0.092, -0.125, 0.046);
    },
    BELLY,
    OL,
    LW * 0.72
  );

  // ---- 4. Wide Friendly Gentle-Giant Mouth Interior ----
  const mhX = 0.278,
    mhY = 0.034;
  const mTipX = 0.392 - p.open * 0.01;
  const mTipY = 0.024 + p.open * 0.064;
  if (p.open > 0.02) {
    c.beginPath();
    c.moveTo(0.325, 0.004);
    c.lineTo(mTipX, 0.008);
    c.quadraticCurveTo(0.345, 0.046 + p.open * 0.038, mhX, mhY);
    c.closePath();
    c.fillStyle = "#17254a";
    c.fill();
    c.fillStyle = "#4874b8";
    blob(c, 0.335, 0.03 + p.open * 0.022, 0.028, 0.011 + p.open * 0.007, 0.08);
  }

  // ---- 5. Broad Blunt-Snouted Whale Shark Body & Glowing Constellation Back ----
  fillStroke(
    c,
    () => {
      c.moveTo(-0.232, -0.022);
      c.bezierCurveTo(-0.122, -0.096, 0.068, -0.125, 0.242, -0.106);
      // Iconic broad flat-blunt whale shark snout
      c.bezierCurveTo(0.338, -0.095, 0.388, -0.052, mTipX, 0.008);
      if (p.open > 0.02) {
        c.quadraticCurveTo(0.345, 0.022, mhX, mhY);
        c.lineTo(mTipX - 0.008, mTipY);
        c.quadraticCurveTo(0.335, 0.078 + p.open * 0.02, 0.195, 0.092 + p.open * 0.008);
      } else {
        // Wide friendly curved smile across broad front mouth!
        c.quadraticCurveTo(0.345, 0.032, mhX, mhY);
        c.quadraticCurveTo(0.342, 0.038, 0.376, 0.026);
        c.quadraticCurveTo(0.326, 0.082, 0.195, 0.092);
      }
      c.bezierCurveTo(0.052, 0.108, -0.108, 0.068, -0.232, 0.022);
    },
    lin(c, 0.05, -0.118, 0.05, 0.106, [
      [0, DK],
      [0.44, NAVY],
      [0.68, "#2255a6"],
      [0.73, BELLY],
      [1, "#cbe7ff"],
    ]),
    OL,
    LW,
    () => {
      // Soft moonlight sheen along upper back
      glow(c, 0.08, -0.07, 0.24, 0.048, -0.04, "125,240,255", 0.24);

      // Faint celestial checkerboard bands
      c.strokeStyle = rgba(CYAN, 0.28);
      c.lineWidth = 0.0038;
      for (let i = -3; i <= 3; i++) {
        const bx = i * 0.052 + 0.025;
        c.beginPath();
        c.moveTo(bx, -0.115);
        c.quadraticCurveTo(bx - 0.008, -0.048, bx, 0.015);
        c.stroke();
      }

      // 2 subtle whale-shark longitudinal flank ridges
      c.strokeStyle = rgba(CYAN, 0.26);
      c.lineWidth = 0.003;
      c.beginPath();
      c.moveTo(-0.21, -0.008);
      c.quadraticCurveTo(0.0, -0.025, 0.19, -0.018);
      c.stroke();

      // Glowing Star Constellation Lines connecting stars across the back!
      const nodes: [number, number, number][] = [
        [0.245, -0.066, 0.011],
        [0.185, -0.042, 0.009],
        [0.128, -0.075, 0.013],
        [0.068, -0.036, 0.010],
        [0.012, -0.072, 0.012],
        [-0.048, -0.034, 0.010],
        [-0.105, -0.058, 0.012],
        [-0.162, -0.022, 0.009],
      ];
      const edges: [number, number][] = [
        [0, 1],
        [1, 2],
        [2, 3],
        [3, 4],
        [4, 5],
        [5, 6],
        [6, 7],
        [2, 4],
      ];
      c.strokeStyle = rgba(CYAN, 0.62);
      c.lineWidth = 0.0028;
      c.beginPath();
      for (const [a, b] of edges) {
        c.moveTo(nodes[a][0], nodes[a][1]);
        c.lineTo(nodes[b][0], nodes[b][1]);
      }
      c.stroke();

      for (const [sx, sy, sr] of nodes) {
        drawStar4(sx, sy, sr);
      }

      // Extra twinkling stardust dots
      c.fillStyle = rgba(STAR, 0.88);
      for (const [dx, dy, dr] of [
        [0.285, -0.052, 0.0048],
        [0.155, -0.008, 0.0045],
        [0.042, -0.005, 0.0045],
        [-0.075, -0.004, 0.0045],
        [0.095, -0.088, 0.0048],
      ]) {
        c.beginPath();
        c.arc(dx, dy, dr, 0, TAU);
        c.fill();
      }

      // 5 distinct whale-shark gill slits ahead of the pectoral wing
      c.strokeStyle = rgba(DK, 0.78);
      c.lineWidth = 0.004;
      for (let g = 0; g < 5; g++) {
        const gx = 0.142 + g * 0.014;
        c.beginPath();
        c.moveTo(gx, -0.024);
        c.quadraticCurveTo(gx - 0.004, 0.006, gx, 0.036);
        c.stroke();
      }

      if (p.puff) {
        c.fillStyle = "rgba(130, 225, 255, 0.5)";
        blob(c, 0.275, 0.044, 0.028, 0.016, 0);
      }
    }
  );

  // Cute friendly smile corner dimple when closed
  if (p.open <= 0.02) {
    c.strokeStyle = OL;
    c.lineWidth = LW * 0.56;
    c.beginPath();
    c.arc(0.276, 0.034, 0.009, Math.PI * 0.7, Math.PI * 1.5);
    c.stroke();
  }

  // ---- 6. Majestic Sweeping Pectoral Wing Fin (Sayap Sirip Dada yang Megah) ----
  c.save();
  c.translate(0.118, 0.044);
  c.rotate(s2 * 0.13);
  fillStroke(
    c,
    () => {
      c.moveTo(0.015, -0.008);
      c.bezierCurveTo(-0.005, 0.068, -0.105, 0.165, -0.175, 0.155);
      c.bezierCurveTo(-0.155, 0.092, -0.092, 0.025, -0.035, -0.016);
    },
    lin(c, 0.01, -0.01, -0.16, 0.15, [
      [0, DK],
      [0.4, NAVY],
      [0.75, FIN],
      [1, CYAN],
    ]),
    OL,
    LW * 0.78,
    () => {
      // Luminous cyan wing edge & constellation dots
      c.strokeStyle = rgba(CYAN, 0.68);
      c.lineWidth = 0.0045;
      c.beginPath();
      c.moveTo(0.002, 0.018);
      c.bezierCurveTo(-0.028, 0.085, -0.108, 0.15, -0.165, 0.145);
      c.stroke();

      drawStar4(-0.068, 0.062, 0.011);
      drawStar4(-0.118, 0.105, 0.01);
      c.strokeStyle = rgba(CYAN, 0.5);
      c.lineWidth = 0.0024;
      c.beginPath();
      c.moveTo(-0.068, 0.062);
      c.lineTo(-0.118, 0.105);
      c.stroke();
    }
  );
  c.restore();

  // ---- 7. Friendly Gentle Whale Shark Eye ----
  const ex = 0.288,
    ey = -0.026 - p.open * 0.004,
    er = 0.034;
  eye(c, ex, ey, er, {
    iris: pal.iris || "#38bdf8",
    expr: p.expr,
    ol: OL,
    sx: 0.96,
    look: 0.26,
    irisR: 0.62,
    pupilR: 0.36,
    happyCol: "#ffffff",
  });
}

// =====================================================================================
// BIMA — Yellowfin Tuna (Tuna Sirip Kuning):
// Sleek streamlined metallic cobalt-silver torpedo body, bright golden sickle dorsal &
// anal fins, trailing yellow finlets along the peduncle, and razor-sharp crescent tail.
// =====================================================================================
function drawTuna(c: Ctx, sp: Species, p: Pose) {
  const pal = sp.pal;
  const B = pal.body || "#1c5ec4";
  const DK = pal.dark || "#0b245e";
  const BELLY = pal.belly || "#f0f8ff";
  const YEL = pal.fin || "#ffd21c";
  const YEL_L = mix(YEL, "#ffffff", 0.35);
  const TAIL = pal.tail || "#183e88";
  const OL = rgba(pal.outline || "#081940", 0.88);
  const LW = 0.0085;
  const s = p.wag2;

  // ---- 1. Crescent Forked Tuna Tail ----
  c.save();
  c.translate(-0.295, 0.006);
  c.rotate(p.wag * 0.17);
  c.scale(1 - Math.abs(p.wag) * 0.06, 1);
  fillStroke(
    c,
    () => {
      c.moveTo(0.018, -0.018);
      c.bezierCurveTo(-0.045, -0.075, -0.102, -0.155, -0.145, -0.195);
      c.quadraticCurveTo(-0.156, -0.198, -0.142, -0.168);
      c.bezierCurveTo(-0.11, -0.1, -0.088, -0.04, -0.085, 0);
      c.bezierCurveTo(-0.088, 0.042, -0.11, 0.1, -0.142, 0.168);
      c.quadraticCurveTo(-0.156, 0.198, -0.145, 0.195);
      c.bezierCurveTo(-0.102, 0.155, -0.045, 0.075, 0.018, 0.018);
    },
    lin(c, 0.01, -0.14, -0.14, 0.14, [
      [0, DK],
      [0.5, TAIL],
      [1, mix(TAIL, "#4da6ff", 0.3)],
    ]),
    OL,
    LW * 0.88,
    () => {
      c.strokeStyle = rgba(YEL, 0.55);
      c.lineWidth = 0.007;
      c.beginPath();
      c.moveTo(-0.015, -0.032);
      c.quadraticCurveTo(-0.08, -0.098, -0.132, -0.172);
      c.moveTo(-0.015, 0.032);
      c.quadraticCurveTo(-0.08, 0.098, -0.132, 0.172);
      c.stroke();
    }
  );
  c.restore();

  // ---- 2. Trailing Yellow Finlets along tail peduncle ----
  const drawFinlet = (fx: number, fy: number, dirY: number) => {
    fillStroke(
      c,
      () => {
        c.moveTo(fx + 0.014, fy);
        c.quadraticCurveTo(fx - 0.008, fy + dirY * 0.034, fx - 0.02, fy + dirY * 0.03);
        c.quadraticCurveTo(fx - 0.012, fy + dirY * 0.008, fx - 0.008, fy);
      },
      lin(c, fx, fy, fx - 0.01, fy + dirY * 0.03, [
        [0, "#d97706"],
        [0.5, YEL],
        [1, YEL_L],
      ]),
      OL,
      LW * 0.58
    );
  };
  for (let i = 0; i < 4; i++) {
    drawFinlet(-0.14 - i * 0.036, -0.048 + i * 0.011, -1);
    drawFinlet(-0.14 - i * 0.036, 0.056 - i * 0.01, 1);
  }

  // ---- 3. First Dorsal Crest + Iconic Golden Sickle 2nd Dorsal & Anal Fins ----
  fillStroke(
    c,
    () => {
      c.moveTo(0.115, -0.095);
      c.bezierCurveTo(0.085, -0.172, 0.035, -0.175 + s * 0.004, -0.025, -0.118);
      c.lineTo(-0.035, -0.092);
    },
    lin(c, 0.04, -0.17, 0.04, -0.09, [
      [0, YEL],
      [1, B],
    ]),
    OL,
    LW * 0.78
  );

  // Tall golden sickle second dorsal
  fillStroke(
    c,
    () => {
      c.moveTo(-0.03, -0.096);
      c.bezierCurveTo(-0.055, -0.185, -0.098, -0.242 + s * 0.005, -0.135, -0.256 + s * 0.006);
      c.quadraticCurveTo(-0.115, -0.175, -0.092, -0.082);
    },
    lin(c, -0.05, -0.09, -0.12, -0.25, [
      [0, "#d97706"],
      [0.45, YEL],
      [1, YEL_L],
    ]),
    OL,
    LW * 0.85
  );

  // Matching golden sickle anal fin
  fillStroke(
    c,
    () => {
      c.moveTo(-0.045, 0.095);
      c.bezierCurveTo(-0.068, 0.175, -0.105, 0.228 - s * 0.005, -0.138, 0.242 - s * 0.006);
      c.quadraticCurveTo(-0.118, 0.165, -0.098, 0.08);
    },
    lin(c, -0.06, 0.09, -0.13, 0.24, [
      [0, "#d97706"],
      [0.45, YEL],
      [1, YEL_L],
    ]),
    OL,
    LW * 0.85
  );

  // ---- 4. Rigid-Hinged Sleek Tuna Jaw ----
  const hx = 0.275;
  const hy = 0.025;
  const jawAng = p.open * 0.44;
  const cosJ = Math.cos(jawAng);
  const sinJ = Math.sin(jawAng);
  const rotJ = (px: number, py: number): [number, number] => [
    hx + (px - hx) * cosJ - (py - hy) * sinJ,
    hy + (px - hx) * sinJ + (py - hy) * cosJ,
  ];
  const ux = 0.436;
  const uy = 0.016 - p.open * 0.012;
  const [tipX, tipY] = rotJ(0.426, 0.026);
  const [chinFrontX, chinFrontY] = rotJ(0.382, 0.052);
  const chinBackY = 0.072 + p.open * 0.01 + (p.puff ? 0.01 : 0);

  if (p.open > 0) {
    c.beginPath();
    c.moveTo(hx - 0.014, hy);
    c.quadraticCurveTo(0.355, uy + 0.008, ux - 0.01, uy + 0.002);
    c.quadraticCurveTo((ux + tipX) * 0.5 - 0.015, (uy + tipY) * 0.5, tipX - 0.01, tipY - 0.002);
    c.quadraticCurveTo(0.345, tipY + 0.01, hx - 0.014, hy);
    c.closePath();
    c.fillStyle = "#162040";
    c.fill();
    c.save();
    c.clip();
    c.fillStyle = "#df6e8c";
    blob(c, (hx + tipX) * 0.52, (hy + tipY) * 0.52 + 0.004, 0.044, 0.014, jawAng * 0.65);
    c.restore();
  }

  // ---- 5. Streamlined Torpedo Body ----
  const body = () => {
    c.moveTo(-0.305, -0.012);
    c.bezierCurveTo(-0.22, -0.04, -0.135, -0.095, 0.02, -0.114);
    c.bezierCurveTo(0.165, -0.125, 0.305, -0.088, 0.398, -0.018);
    c.quadraticCurveTo(0.432, 0.004 - p.open * 0.008, ux, uy);
    if (p.open > 0) {
      c.quadraticCurveTo(0.365, uy + 0.008, hx, hy);
      c.quadraticCurveTo((hx + tipX) * 0.5, (hy + tipY) * 0.5 - 0.002, tipX, tipY);
      c.bezierCurveTo(tipX - 0.01, tipY + 0.016, chinFrontX, chinFrontY, 0.255, chinBackY);
    } else {
      c.quadraticCurveTo(0.428, 0.036, 0.375, 0.052);
      c.bezierCurveTo(0.328, 0.068, 0.285, chinBackY, 0.235, chinBackY + 0.008);
    }
    c.bezierCurveTo(0.11, 0.115, -0.05, 0.105, -0.18, 0.064);
    c.bezierCurveTo(-0.245, 0.042, -0.285, 0.024, -0.305, 0.02);
  };

  fillStroke(
    c,
    body,
    lin(c, 0.04, -0.12, 0.04, 0.12, [
      [0, DK],
      [0.34, B],
      [0.54, "#5baef5"],
      [0.64, BELLY],
      [1, "#c8def0"],
    ]),
    OL,
    LW,
    () => {
      // Iconic golden-amber lateral band separating cobalt back & silver belly
      c.strokeStyle = rgba(YEL, 0.85);
      c.lineWidth = 0.014;
      c.beginPath();
      c.moveTo(0.26, -0.012);
      c.bezierCurveTo(0.14, -0.03, -0.04, -0.032, -0.25, -0.004);
      c.stroke();

      // Subtle belly vertical silver bars
      c.strokeStyle = "rgba(110, 165, 220, 0.28)";
      c.lineWidth = 0.007;
      for (let i = 0; i < 6; i++) {
        const bx = -0.15 + i * 0.05;
        c.beginPath();
        c.moveTo(bx, 0.015);
        c.quadraticCurveTo(bx - 0.012, 0.055, bx, 0.09);
        c.stroke();
      }

      // Glossy dorsal specular streak
      c.fillStyle = "rgba(180, 230, 255, 0.26)";
      blob(c, 0.08, -0.088, 0.18, 0.018, 0.02);

      // Gill plate curve
      c.strokeStyle = rgba(DK, 0.68);
      c.lineWidth = 0.0052;
      c.beginPath();
      c.moveTo(0.228, -0.052);
      c.bezierCurveTo(0.205, -0.01, 0.208, 0.038, 0.236, 0.072);
      c.stroke();

      if (p.puff) {
        c.fillStyle = "rgba(255, 130, 155, 0.48)";
        blob(c, 0.295, 0.035, 0.024, 0.014, 0);
      }
    }
  );

  // Smile corner dimple when closed
  if (p.open <= 0.02) {
    c.strokeStyle = OL;
    c.lineWidth = LW * 0.7;
    c.beginPath();
    c.moveTo(ux - 0.005, uy + 0.004);
    c.quadraticCurveTo(0.355, 0.038, hx, hy);
    c.stroke();
  }

  // ---- 6. Sleek Scythe Pectoral Fin ----
  c.save();
  c.translate(0.185, 0.028);
  c.rotate(s * 0.14);
  fillStroke(
    c,
    () => {
      c.moveTo(0.012, -0.008);
      c.bezierCurveTo(-0.025, 0.035, -0.105, 0.085, -0.165, 0.078);
      c.bezierCurveTo(-0.125, 0.042, -0.065, 0.008, -0.018, -0.012);
    },
    lin(c, 0, -0.01, -0.15, 0.08, [
      [0, DK],
      [0.55, B],
      [1, YEL],
    ]),
    OL,
    LW * 0.78
  );
  c.restore();

  // ---- 7. Crisp Golden-Ringed Tuna Eye ----
  eye(c, 0.312, -0.024 - p.open * 0.004, 0.036, {
    iris: pal.iris || "#f59e0b",
    expr: p.expr,
    ol: OL,
    sx: 0.94,
    look: 0.28,
    irisR: 0.62,
    pupilR: 0.36,
  });
}

// =====================================================================================
// MARTIL — Hammerhead Shark (Hiu Martil):
// Sleek 3/4 T-shaped hammerhead cephalofoil with both eyes perched cleanly on the
// outer wing tips (far eye + near eye), smooth neck blend, underslung serrated jaw.
// =====================================================================================
function drawHammerhead(c: Ctx, sp: Species, p: Pose) {
  const pal = sp.pal;
  const B = pal.body || "#728396";
  const DK = pal.dark || "#435061";
  const LT = mix(B, "#e2e8f0", 0.36);
  const BELLY = pal.belly || "#f8fafc";
  const OL = rgba(pal.outline || "#1b2432", 0.88);
  const LW = 0.0085;
  const s = p.wag2;

  // ---- 1. Asymmetrical Forked Shark Tail ----
  c.save();
  c.translate(-0.275, 0.024);
  c.rotate(p.wag * 0.16);
  c.scale(1 - Math.abs(p.wag) * 0.06, 1);
  fillStroke(
    c,
    () => {
      c.moveTo(0.016, -0.018);
      c.bezierCurveTo(-0.042, -0.068, -0.108, -0.148, -0.168, -0.212);
      c.quadraticCurveTo(-0.175, -0.19, -0.16, -0.155);
      c.bezierCurveTo(-0.125, -0.095, -0.098, -0.038, -0.092, 0.004);
      c.bezierCurveTo(-0.098, 0.044, -0.125, 0.088, -0.158, 0.118);
      c.bezierCurveTo(-0.112, 0.1, -0.048, 0.064, 0.015, 0.024);
    },
    lin(c, 0, -0.18, -0.15, 0.1, [
      [0, LT],
      [0.45, B],
      [1, DK],
    ]),
    OL,
    LW * 0.84
  );
  c.restore();

  // ---- 2. Tall Swept Dorsal Fin + Small Second Dorsal ----
  fillStroke(
    c,
    () => {
      c.moveTo(0.08, -0.07);
      c.bezierCurveTo(0.032, -0.155, -0.024, -0.222 + s * 0.004, -0.078, -0.238 + s * 0.005);
      c.quadraticCurveTo(-0.056, -0.142, -0.044, -0.06);
    },
    lin(c, 0.04, -0.23, 0.02, -0.06, [
      [0, LT],
      [0.5, B],
      [1, DK],
    ]),
    OL,
    LW * 0.85
  );

  fillStroke(
    c,
    () => {
      c.moveTo(-0.155, -0.032);
      c.bezierCurveTo(-0.175, -0.068, -0.198, -0.082 + s * 0.002, -0.222, -0.082 + s * 0.002);
      c.quadraticCurveTo(-0.205, -0.052, -0.198, -0.018);
    },
    B,
    OL,
    LW * 0.72
  );

  // Far-side pectoral fin peek
  fillStroke(
    c,
    () => {
      c.moveTo(0.135, 0.086);
      c.bezierCurveTo(0.144, 0.136, 0.13, 0.175 + s * 0.005, 0.1, 0.188 + s * 0.006);
      c.bezierCurveTo(0.085, 0.162, 0.084, 0.122, 0.092, 0.085);
    },
    DK,
    OL,
    LW * 0.72
  );

  // ---- 3. Sleek Sculpted Far Hammer Wing (angled 3/4 boomerang, not a vertical stalk) ----
  fillStroke(
    c,
    () => {
      c.moveTo(0.218, -0.068);
      c.bezierCurveTo(0.255, -0.104, 0.288, -0.125, 0.318, -0.124);
      c.bezierCurveTo(0.342, -0.122, 0.355, -0.102, 0.354, -0.078);
      c.quadraticCurveTo(0.352, -0.056, 0.328, -0.044);
    },
    lin(c, 0.31, -0.124, 0.3, -0.05, [
      [0, LT],
      [0.45, B],
      [1, DK],
    ]),
    OL,
    LW * 0.8
  );

  // Subtle foreshortened far-side eye tucked cleanly inside the far hammer tip
  eye(c, 0.324, -0.105, 0.013, {
    iris: pal.iris || "#b45309",
    expr: p.expr,
    noHappy: true,
    ol: OL,
    sx: 0.72,
    look: 0.26,
    irisR: 0.6,
    pupilR: 0.38,
    lid: p.expr === "normal" ? 0.24 : 0,
    lidTilt: 0.14,
    lidCol: DK,
    lidEdge: OL,
  });

  // ---- 4. Underslung Shark Jaw ----
  const hx = 0.205;
  const hy = 0.068;
  const jawAng = p.open * 0.45;
  const cosJ = Math.cos(jawAng);
  const sinJ = Math.sin(jawAng);
  const rotJ = (px: number, py: number): [number, number] => [
    hx + (px - hx) * cosJ - (py - hy) * sinJ,
    hy + (px - hx) * sinJ + (py - hy) * cosJ,
  ];
  const ux = 0.326;
  const uy = 0.056 - p.open * 0.01;
  const [tipX, tipY] = rotJ(0.315, 0.068);
  const [chinX, chinY] = rotJ(0.268, 0.095);
  const chinBackY = 0.096 + p.open * 0.012 + (p.puff ? 0.008 : 0);

  if (p.open > 0) {
    c.beginPath();
    c.moveTo(hx - 0.012, hy);
    c.quadraticCurveTo(0.268, uy + 0.008, ux - 0.008, uy + 0.002);
    c.quadraticCurveTo((ux + tipX) * 0.5 - 0.01, (uy + tipY) * 0.5, tipX - 0.008, tipY - 0.002);
    c.quadraticCurveTo(0.26, tipY + 0.01, hx - 0.012, hy);
    c.closePath();
    c.fillStyle = "#2b0d24";
    c.fill();
    c.save();
    c.clip();
    c.fillStyle = "#d95f86";
    blob(c, (hx + tipX) * 0.52, (hy + tipY) * 0.52 + 0.004, 0.032, 0.012, jawAng * 0.65);
    c.restore();
  }

  // ---- 5. Continuous Muscular Shark Body + Sculpted 3/4 Hammer Bridge & Near Wing ----
  const body = () => {
    c.moveTo(-0.282, 0.006);
    c.bezierCurveTo(-0.185, -0.028, -0.085, -0.07, 0.06, -0.082);
    c.bezierCurveTo(0.165, -0.09, 0.218, -0.078, 0.262, -0.066);
    // Smooth scalloped cephalofoil bridge sweeping outward into the near hammer wing
    c.bezierCurveTo(0.325, -0.062, 0.372, -0.04, 0.415, -0.012);
    c.bezierCurveTo(0.438, 0.004, 0.443, 0.026, 0.432, 0.048);
    c.bezierCurveTo(0.42, 0.064, 0.392, 0.064, 0.36, 0.059);
    c.quadraticCurveTo(0.34, 0.056, ux, uy);
    if (p.open > 0) {
      c.quadraticCurveTo(0.27, uy + 0.006, hx, hy);
      c.quadraticCurveTo((hx + tipX) * 0.5, (hy + tipY) * 0.5 - 0.002, tipX, tipY);
      c.bezierCurveTo(tipX - 0.008, tipY + 0.014, chinX, chinY, 0.185, chinBackY);
    } else {
      c.quadraticCurveTo(0.322, 0.076, 0.278, 0.09);
      c.bezierCurveTo(0.242, 0.098, 0.21, chinBackY, 0.185, chinBackY);
    }
    c.bezierCurveTo(0.068, 0.106, -0.062, 0.096, -0.185, 0.065);
    c.bezierCurveTo(-0.242, 0.05, -0.268, 0.04, -0.282, 0.036);
  };

  fillStroke(
    c,
    body,
    lin(c, 0.04, -0.09, 0.04, 0.08, [
      [0, DK],
      [0.52, B],
      [1, mix(B, LT, 0.25)],
    ]),
    OL,
    LW,
    () => {
      // Crisp counter-shading white belly band keeping the entire upper hammer slate-grey
      c.beginPath();
      c.moveTo(-0.285, 0.028);
      c.bezierCurveTo(-0.16, 0.024, 0.04, 0.02, 0.21, 0.042);
      c.bezierCurveTo(0.278, 0.05, 0.345, 0.054, 0.422, 0.046);
      c.lineTo(0.45, 0.08);
      c.lineTo(0.22, 0.125);
      c.lineTo(-0.29, 0.08);
      c.closePath();
      c.fillStyle = lin(c, 0, 0.025, 0, 0.105, [
        [0, BELLY],
        [0.6, BELLY],
        [1, "#d5e0ec"],
      ]);
      c.fill();

      // Soft curved shading separating near hammer wing contour cleanly from cheek
      c.strokeStyle = rgba(DK, 0.45);
      c.lineWidth = 0.006;
      c.beginPath();
      c.moveTo(0.282, -0.038);
      c.bezierCurveTo(0.322, -0.018, 0.346, 0.012, 0.336, 0.042);
      c.stroke();

      // Subtle hammerhead nostril slit near front underside corner
      c.strokeStyle = rgba(pal.outline || "#1b2432", 0.65);
      c.lineWidth = 0.004;
      c.beginPath();
      c.moveTo(0.412, 0.042);
      c.quadraticCurveTo(0.418, 0.046, 0.424, 0.043);
      c.stroke();

      // Curved shark teeth inside open jaw
      if (p.open > 0.12) {
        curvedTeethRow(c, hx + 0.006, hy + 0.004, 0.268, uy + 0.008, ux - 0.004, uy + 0.002, 5, 1, () => 0.011 * p.open);
        curvedTeethRow(c, hx + 0.006, hy + 0.006, (hx + tipX) * 0.5, (hy + tipY) * 0.5, tipX - 0.004, tipY - 0.002, 5, -1, () => 0.01 * p.open);
      }

      // 5 crisp shark gill slits
      c.strokeStyle = rgba(DK, 0.78);
      c.lineWidth = 0.0045;
      for (let g = 0; g < 5; g++) {
        const gx = 0.145 + g * 0.013;
        c.beginPath();
        c.moveTo(gx, -0.016);
        c.quadraticCurveTo(gx - 0.004, 0.014, gx, 0.044);
        c.stroke();
      }

      // Dorsal shine along spine & hammer brow
      c.fillStyle = "rgba(235, 245, 255, 0.22)";
      blob(c, 0.06, -0.064, 0.14, 0.014, 0.03);
      blob(c, 0.352, -0.032, 0.048, 0.01, 0.42);

      if (p.puff) {
        c.fillStyle = "rgba(255, 130, 155, 0.45)";
        blob(c, 0.24, 0.05, 0.02, 0.012, 0);
      }
    }
  );

  // Subtle shark smile crease when closed
  if (p.open <= 0.02) {
    c.strokeStyle = OL;
    c.lineWidth = LW * 0.65;
    c.beginPath();
    c.moveTo(ux - 0.004, uy + 0.004);
    c.quadraticCurveTo(0.268, 0.072, hx, hy);
    c.stroke();
  }

  // ---- 6. Near-Side Eye Embedded Cleanly in the Slate-Grey Hammer Wing ----
  const ex = 0.402,
    ey = 0.017,
    er = 0.02;
  c.beginPath();
  c.ellipse(ex - 0.002, ey, er * 1.08, er * 1.12, 0, Math.PI * 0.6, Math.PI * 1.85);
  c.strokeStyle = rgba(DK, 0.55);
  c.lineWidth = 0.005;
  c.stroke();
  eye(c, ex, ey, er, {
    iris: pal.iris || "#b45309",
    expr: p.expr,
    ol: OL,
    sx: 0.86,
    look: 0.28,
    irisR: 0.58,
    pupilR: 0.36,
    lid: p.expr === "normal" ? 0.24 : 0,
    lidTilt: 0.16,
    lidCol: DK,
    lidEdge: OL,
  });

  // ---- 7. Swept Near-Side Pectoral Fin ----
  c.save();
  c.translate(0.112, 0.056);
  c.rotate(s * 0.14);
  fillStroke(
    c,
    () => {
      c.moveTo(0.015, -0.008);
      c.bezierCurveTo(-0.012, 0.055, -0.088, 0.132, -0.145, 0.134);
      c.bezierCurveTo(-0.122, 0.08, -0.072, 0.022, -0.026, -0.012);
    },
    lin(c, 0, 0, -0.13, 0.13, [
      [0, B],
      [0.6, DK],
      [1, mix(DK, "#0f172a", 0.3)],
    ]),
    OL,
    LW * 0.8
  );
  c.restore();
}

// =====================================================================================
// KORAL — Yellow Longnose Butterflyfish (Kepe-Kepe Karang):
// Smooth sunlit lemon-gold & pearl tropical disc, tapered slender pincer snout
// seamlessly contoured into the forehead, curved charcoal eye-band & false eyespot.
// =====================================================================================
function drawButterfly(c: Ctx, sp: Species, p: Pose) {
  const pal = sp.pal;
  const YEL = pal.body || "#ffd426";
  const GOLD = pal.dark || "#d9820a";
  const YEL_L = mix(YEL, "#ffffff", 0.38);
  const WH = pal.belly || "#fffef2";
  const BLK = pal.stripe || "#1b1412";
  const OL = rgba(pal.outline || "#291806", 0.88);
  const LW = 0.009;
  const sw = p.wag2 * 0.006;

  // ---- 1. Translucent Cream-Gold Rounded Tail Fan ----
  c.save();
  c.translate(-0.228, 0.014);
  c.rotate(p.wag * 0.2);
  c.scale(1 - Math.abs(p.wag) * 0.05, 1);
  fillStroke(
    c,
    () => {
      c.moveTo(0.018, -0.036);
      c.bezierCurveTo(-0.048, -0.092, -0.122, -0.132, -0.172, -0.1);
      c.bezierCurveTo(-0.19, -0.036, -0.19, 0.046, -0.17, 0.106);
      c.bezierCurveTo(-0.118, 0.134, -0.045, 0.092, 0.018, 0.036);
    },
    lin(c, 0.01, 0, -0.175, 0, [
      [0, YEL],
      [0.45, pal.tail || "#fff2a8"],
      [1, "rgba(255, 252, 232, 0.88)"],
    ]),
    OL,
    LW * 0.78,
    () => {
      const pts: [number, number][] = [];
      for (let i = 0; i < 7; i++) pts.push([-0.172, -0.084 + i * 0.028]);
      rayFan(c, 0.015, 0, pts, rgba(GOLD, 0.3), 0.0036);
    }
  );
  c.restore();

  // ---- 2. Smooth Swept Dorsal & Anal Reef Fins ----
  fillStroke(
    c,
    () => {
      c.moveTo(0.11, -0.235);
      c.bezierCurveTo(0.055, -0.342 + sw, -0.045, -0.382 + sw, -0.15 + sw * 0.4, -0.33 + sw);
      c.bezierCurveTo(-0.22 + sw * 0.6, -0.275 + sw * 0.5, -0.245, -0.15, -0.228, -0.045);
      c.lineTo(-0.08, -0.155);
    },
    lin(c, 0, -0.18, -0.08, -0.37, [
      [0, GOLD],
      [0.45, YEL],
      [1, YEL_L],
    ]),
    OL,
    LW * 0.82,
    () => {
      const pts: [number, number][] = [];
      for (let i = 0; i < 9; i++) pts.push([0.075 - i * 0.036, -0.36 + Math.abs(i - 4) * 0.014]);
      rayFan(c, -0.06, -0.14, pts, rgba(GOLD, 0.34), 0.0036);
      c.strokeStyle = rgba(BLK, 0.65);
      c.lineWidth = 0.009;
      c.beginPath();
      c.moveTo(-0.148, -0.32);
      c.quadraticCurveTo(-0.212, -0.255, -0.226, -0.075);
      c.stroke();
    }
  );

  fillStroke(
    c,
    () => {
      c.moveTo(0.025, 0.242);
      c.bezierCurveTo(-0.045, 0.338 - sw, -0.155 + sw * 0.4, 0.332 - sw, -0.222 + sw * 0.6, 0.205);
      c.quadraticCurveTo(-0.242, 0.13, -0.225, 0.055);
      c.lineTo(-0.075, 0.15);
    },
    lin(c, -0.04, 0.18, -0.12, 0.33, [
      [0, GOLD],
      [0.5, YEL],
      [1, YEL_L],
    ]),
    OL,
    LW * 0.82,
    () => {
      const pts: [number, number][] = [];
      for (let i = 0; i < 8; i++) pts.push([0.0 - i * 0.032, 0.32 - i * 0.013]);
      rayFan(c, -0.09, 0.14, pts, rgba(GOLD, 0.34), 0.0036);
    }
  );

  // ---- 3. Tapered Reef Jaw ----
  const hx = 0.305;
  const hy = 0.024;
  const jawAng = p.open * 0.46;
  const cosJ = Math.cos(jawAng);
  const sinJ = Math.sin(jawAng);
  const rotJ = (px: number, py: number): [number, number] => [
    hx + (px - hx) * cosJ - (py - hy) * sinJ,
    hy + (px - hx) * sinJ + (py - hy) * cosJ,
  ];
  const ux = 0.435;
  const uy = 0.014 - p.open * 0.01;
  const [tipX, tipY] = rotJ(0.428, 0.026);
  const chinBackY = 0.118 + p.open * 0.01 + (p.puff ? 0.01 : 0);

  if (p.open > 0) {
    c.beginPath();
    c.moveTo(hx - 0.01, hy);
    c.lineTo(ux - 0.006, uy + 0.002);
    c.quadraticCurveTo((ux + tipX) * 0.5 - 0.008, (uy + tipY) * 0.5, tipX - 0.006, tipY - 0.002);
    c.lineTo(hx - 0.01, hy);
    c.closePath();
    c.fillStyle = "#2b0f26";
    c.fill();
  }

  // ---- 4. Seamless Disc Body + Smoothly Concave Forehead into Slender Snout ----
  const body = () => {
    c.moveTo(-0.23, -0.038);
    c.bezierCurveTo(-0.215, -0.17, -0.112, -0.275, 0.032, -0.275);
    c.bezierCurveTo(0.142, -0.275, 0.228, -0.205, 0.272, -0.105);
    // Smooth concave dip from forehead down into slender snout (classic butterflyfish profile!)
    c.bezierCurveTo(0.305, -0.032, 0.365, -0.006, ux, uy);
    if (p.open > 0) {
      c.quadraticCurveTo(0.368, uy + 0.01, hx, hy);
      c.quadraticCurveTo((hx + tipX) * 0.5, (hy + tipY) * 0.5 - 0.002, tipX, tipY);
      c.bezierCurveTo(0.375, tipY + 0.022, 0.305, 0.068, 0.245, chinBackY);
    } else {
      c.quadraticCurveTo(0.432, 0.032, 0.378, 0.038);
      c.bezierCurveTo(0.325, 0.044, 0.285, 0.078, 0.245, chinBackY);
    }
    c.bezierCurveTo(0.185, 0.23, 0.082, 0.272, -0.035, 0.265);
    c.bezierCurveTo(-0.145, 0.255, -0.212, 0.16, -0.23, 0.045);
  };

  fillStroke(
    c,
    body,
    lin(c, 0.02, -0.27, -0.04, 0.27, [
      [0, YEL_L],
      [0.48, YEL],
      [0.9, GOLD],
      [1, mix(GOLD, "#7c2d12", 0.28)],
    ]),
    OL,
    LW,
    () => {
      // Soft pearly-white gill & throat gradient (never a harsh disconnected block!)
      c.fillStyle = lin(c, 0.18, 0.02, 0.42, 0.06, [
        [0, WH],
        [0.65, rgba(WH, 0.85)],
        [1, rgba(YEL, 0)],
      ]);
      c.beginPath();
      c.moveTo(0.19, -0.06);
      c.bezierCurveTo(0.175, 0.05, 0.185, 0.14, 0.235, 0.22);
      c.lineTo(0.44, 0.12);
      c.lineTo(0.44, -0.06);
      c.closePath();
      c.fill();

      // Smooth tapered charcoal eye-band curving gracefully from forehead through the eye to the cheek
      c.fillStyle = BLK;
      c.beginPath();
      c.moveTo(0.142, -0.265);
      c.bezierCurveTo(0.205, -0.175, 0.242, -0.075, 0.248, 0.045);
      c.quadraticCurveTo(0.238, 0.088, 0.202, 0.108);
      c.bezierCurveTo(0.195, -0.02, 0.155, -0.14, 0.088, -0.275);
      c.closePath();
      c.fill();

      // Subtle vertical reef stripes
      c.strokeStyle = rgba(GOLD, 0.3);
      c.lineWidth = 0.0075;
      for (let i = 0; i < 4; i++) {
        const sx = 0.065 - i * 0.062;
        c.beginPath();
        c.moveTo(sx, -0.21);
        c.quadraticCurveTo(sx + 0.022, 0, sx - 0.005, 0.21);
        c.stroke();
      }

      // Crisp false eyespot (ocellus) near rear dorsal fin
      c.fillStyle = WH;
      c.beginPath();
      c.arc(-0.138, -0.128, 0.04, 0, TAU);
      c.fill();
      c.fillStyle = BLK;
      c.beginPath();
      c.arc(-0.138, -0.128, 0.028, 0, TAU);
      c.fill();

      // Top highlight
      c.fillStyle = "rgba(255, 255, 255, 0.24)";
      blob(c, 0.0, -0.205, 0.105, 0.03, -0.06);

      if (p.puff) {
        c.fillStyle = "rgba(255, 115, 145, 0.5)";
        blob(c, 0.268, 0.056, 0.022, 0.014, 0);
      }
    }
  );

  // Cute smile crease when mouth closed
  if (p.open <= 0.02) {
    c.strokeStyle = OL;
    c.lineWidth = LW * 0.62;
    c.beginPath();
    c.moveTo(ux - 0.004, uy + 0.004);
    c.quadraticCurveTo(0.36, 0.032, hx, hy);
    c.stroke();
  }

  // Delicate pectoral fin
  c.save();
  c.translate(0.135, 0.072);
  c.rotate(-0.45 + p.wag2 * 0.16);
  fillStroke(
    c,
    () => {
      c.moveTo(0, -0.01);
      c.bezierCurveTo(-0.04, -0.042, -0.095, -0.035, -0.122, -0.005);
      c.bezierCurveTo(-0.088, 0.032, -0.035, 0.042, 0, 0.015);
    },
    rgba(WH, 0.72),
    OL,
    LW * 0.65
  );
  c.restore();

  // ---- 5. Clean Well-Proportioned Eye centered inside the dark eye-band ----
  eye(c, 0.198, -0.092 - p.open * 0.004, 0.046, {
    iris: pal.iris || "#1e293b",
    expr: p.expr,
    ol: OL,
    sx: 0.9,
    look: 0.28,
    irisR: 0.56,
    pupilR: 0.34,
    happyCol: "#ffffff",
  });
}

// =====================================================================================
// KAKAP — Red Snapper (Kakap Merah):
// Sleek, proud sloped-forehead Lutjanus reef fish silhouette (no lumpy chin/nose),
// smoothly webbed dorsal crest, crisp V-forked crimson tail, and warm pearl belly.
// =====================================================================================
function drawSnapper(c: Ctx, sp: Species, p: Pose) {
  const pal = sp.pal;
  const R = pal.body || "#eb404c";
  const DK = pal.dark || "#9e1924";
  const RL = mix(R, "#ffad9e", 0.38);
  const BELLY = pal.belly || "#ffece8";
  const FIN = pal.fin || "#ff5c4d";
  const OL = rgba(pal.outline || "#3a0b10", 0.88);
  const LW = 0.0085;
  const sw = p.wag2 * 0.005;

  // ---- 1. Crisp V-Forked Crimson Snapper Tail ----
  c.save();
  c.translate(-0.242, 0.008);
  c.rotate(p.wag * 0.18);
  c.scale(1 - Math.abs(p.wag) * 0.05, 1);
  fillStroke(
    c,
    () => {
      c.moveTo(0.015, -0.026);
      c.bezierCurveTo(-0.052, -0.078, -0.125, -0.125, -0.175, -0.135);
      c.quadraticCurveTo(-0.145, -0.042, -0.118, 0);
      c.quadraticCurveTo(-0.145, 0.042, -0.172, 0.132);
      c.bezierCurveTo(-0.122, 0.122, -0.05, 0.075, 0.015, 0.026);
    },
    lin(c, 0.01, 0, -0.17, 0, [
      [0, DK],
      [0.5, pal.tail || "#d92b3a"],
      [1, FIN],
    ]),
    OL,
    LW * 0.82,
    () => {
      const pts: [number, number][] = [];
      for (let i = 0; i < 7; i++) pts.push([-0.165, -0.105 + i * 0.035]);
      rayFan(c, 0.015, 0, pts, rgba(DK, 0.36), 0.0036);
    }
  );
  c.restore();

  // ---- 2. Smoothly Webbed Snapper Dorsal Fin & Clean Anal Fin ----
  fillStroke(
    c,
    () => {
      c.moveTo(0.145, -0.145);
      c.bezierCurveTo(0.118, -0.215 + sw, 0.065, -0.242 + sw, 0.0, -0.232 + sw);
      c.bezierCurveTo(-0.068, -0.248 + sw, -0.145, -0.235 + sw, -0.182, -0.172 + sw);
      c.quadraticCurveTo(-0.2, -0.118, -0.185, -0.062);
      c.lineTo(-0.02, -0.12);
    },
    lin(c, 0, -0.14, -0.05, -0.24, [
      [0, DK],
      [0.58, FIN],
      [1, "#ff9e7d"],
    ]),
    OL,
    LW * 0.82,
    () => {
      const pts: [number, number][] = [];
      for (let i = 0; i < 9; i++) pts.push([0.115 - i * 0.036, -0.235]);
      rayFan(c, -0.01, -0.11, pts, rgba(DK, 0.38), 0.0036);
    }
  );

  fillStroke(
    c,
    () => {
      c.moveTo(-0.02, 0.145);
      c.bezierCurveTo(-0.06, 0.218 - sw, -0.135, 0.222 - sw, -0.18, 0.168);
      c.quadraticCurveTo(-0.198, 0.118, -0.182, 0.058);
      c.lineTo(-0.065, 0.115);
    },
    lin(c, -0.06, 0.13, -0.12, 0.22, [
      [0, DK],
      [0.55, FIN],
      [1, "#ff9e7d"],
    ]),
    OL,
    LW * 0.82
  );

  // ---- 3. Clean Pointed Snapper Jaw (zero protruding shelf!) ----
  const hx = 0.265;
  const hy = 0.042;
  const jawAng = p.open * 0.45;
  const cosJ = Math.cos(jawAng);
  const sinJ = Math.sin(jawAng);
  const rotJ = (px: number, py: number): [number, number] => [
    hx + (px - hx) * cosJ - (py - hy) * sinJ,
    hy + (px - hx) * sinJ + (py - hy) * cosJ,
  ];
  const ux = 0.408;
  const uy = 0.026 - p.open * 0.01;
  const [tipX, tipY] = rotJ(0.4, 0.038);
  const [chinX, chinY] = rotJ(0.345, 0.072);
  const chinBackY = 0.095 + p.open * 0.01 + (p.puff ? 0.01 : 0);

  if (p.open > 0) {
    c.beginPath();
    c.moveTo(hx - 0.012, hy);
    c.quadraticCurveTo(0.338, uy + 0.008, ux - 0.008, uy + 0.002);
    c.quadraticCurveTo((ux + tipX) * 0.5 - 0.01, (uy + tipY) * 0.5, tipX - 0.008, tipY - 0.002);
    c.quadraticCurveTo(0.328, tipY + 0.01, hx - 0.012, hy);
    c.closePath();
    c.fillStyle = "#2b0918";
    c.fill();
    c.save();
    c.clip();
    c.fillStyle = "#e05a7e";
    blob(c, (hx + tipX) * 0.52, (hy + tipY) * 0.52 + 0.004, 0.036, 0.013, jawAng * 0.65);
    c.restore();
  }

  // ---- 4. Sleek Oval Reef Snapper Body with Proud Sloped Forehead ----
  const body = () => {
    c.moveTo(-0.248, -0.028);
    c.bezierCurveTo(-0.2, -0.115, -0.085, -0.175, 0.055, -0.172);
    // Straight proud sloped forehead down to pointed snapper snout tip
    c.bezierCurveTo(0.19, -0.168, 0.325, -0.088, ux, uy);
    if (p.open > 0) {
      c.quadraticCurveTo(0.34, uy + 0.008, hx, hy);
      c.quadraticCurveTo((hx + tipX) * 0.5, (hy + tipY) * 0.5 - 0.002, tipX, tipY);
      c.bezierCurveTo(tipX - 0.008, tipY + 0.014, chinX, chinY, 0.24, chinBackY);
    } else {
      c.quadraticCurveTo(0.404, 0.05, 0.352, 0.068);
      c.bezierCurveTo(0.305, 0.086, 0.268, chinBackY, 0.24, chinBackY);
    }
    c.bezierCurveTo(0.11, 0.168, -0.08, 0.165, -0.205, 0.078);
    c.bezierCurveTo(-0.236, 0.054, -0.246, 0.036, -0.248, 0.024);
  };

  fillStroke(
    c,
    body,
    lin(c, 0.05, -0.175, 0.02, 0.175, [
      [0, DK],
      [0.36, R],
      [0.64, RL],
      [0.84, BELLY],
      [1, "#ffd8d2"],
    ]),
    OL,
    LW,
    () => {
      // Subtle pearly scale shimmer (soft & refined)
      c.strokeStyle = "rgba(255, 228, 220, 0.22)";
      c.lineWidth = 0.0042;
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 5; col++) {
          const sx = 0.11 - col * 0.054 - (row % 2) * 0.024;
          const sy = -0.05 + row * 0.048;
          c.beginPath();
          c.arc(sx, sy, 0.021, -Math.PI * 0.36, Math.PI * 0.36);
          c.stroke();
        }
      }

      // Gill operculum curve
      c.strokeStyle = rgba(DK, 0.7);
      c.lineWidth = 0.0058;
      c.beginPath();
      c.moveTo(0.215, -0.072);
      c.bezierCurveTo(0.192, -0.01, 0.195, 0.048, 0.224, 0.095);
      c.stroke();

      // Specular back sheen
      c.fillStyle = "rgba(255, 220, 210, 0.25)";
      blob(c, 0.06, -0.125, 0.135, 0.02, 0.06);

      if (p.puff) {
        c.fillStyle = "rgba(255, 110, 140, 0.45)";
        blob(c, 0.28, 0.046, 0.022, 0.013, 0);
      }
    }
  );

  // Clean confident snapper smile line when closed
  if (p.open <= 0.02) {
    c.strokeStyle = OL;
    c.lineWidth = LW * 0.65;
    c.beginPath();
    c.moveTo(ux - 0.005, uy + 0.004);
    c.quadraticCurveTo(0.335, 0.045, hx, hy);
    c.stroke();
  }

  // ---- 5. Swept Snapper Pectoral Fin ----
  c.save();
  c.translate(0.155, 0.048);
  c.rotate(-0.38 + p.wag2 * 0.16);
  fillStroke(
    c,
    () => {
      c.moveTo(0, -0.009);
      c.bezierCurveTo(-0.042, -0.042, -0.108, -0.036, -0.135, -0.004);
      c.bezierCurveTo(-0.098, 0.034, -0.04, 0.042, 0, 0.015);
    },
    lin(c, 0, 0, -0.13, 0, [
      [0, R],
      [0.6, FIN],
      [1, "#ffb09c"],
    ]),
    OL,
    LW * 0.75
  );
  c.restore();

  // ---- 6. Golden Snapper Eye ----
  eye(c, 0.285, -0.038 - p.open * 0.004, 0.042, {
    iris: pal.iris || "#f59e0b",
    expr: p.expr,
    ol: OL,
    sx: 0.92,
    look: 0.26,
    irisR: 0.6,
    pupilR: 0.36,
  });
}

// =====================================================================================
// DOLFIN / ROSIE — Bottlenose Dolphin (Lumba-Lumba & Lumba-Lumba Pink Langka):
// Plump rounded melon forehead, unmistakable smiling bottlenose beak, sleek curved
// falcate dorsal fin, rounded-tip flippers, and distinct horizontal tail flukes!
// =====================================================================================
function drawLumba(c: Ctx, sp: Species, p: Pose) {
  const pal = sp.pal;
  const B = pal.body || "#3c8ce0";
  const DK = pal.dark || "#174b8c";
  const LT = pal.stripe || "#8ed0ff";
  const BELLY = pal.belly || "#f4faff";
  const FIN = pal.fin || "#2c74c2";
  const TAIL = pal.tail || "#1d589c";
  const OL = rgba(pal.outline || "#0b2447", 0.86);
  const LW = 0.0084;
  const ds = p.wag2 * 0.006;

  // ---- 1. Curved Falcate Dolphin Dorsal Fin ----
  fillStroke(
    c,
    () => {
      c.moveTo(0.068, -0.098);
      c.bezierCurveTo(0.025, -0.158, -0.022, -0.225 + ds * 0.4, -0.074 + ds, -0.25);
      c.quadraticCurveTo(-0.088 + ds, -0.252, -0.082 + ds, -0.232);
      c.bezierCurveTo(-0.042, -0.176, -0.042, -0.125, -0.058, -0.09);
    },
    lin(c, 0.02, -0.24, -0.02, -0.09, [
      [0, LT],
      [0.45, B],
      [1, DK],
    ]),
    OL,
    LW * 0.85
  );

  // ---- 2. Distinct Horizontal 3/4 Cetacean Tail Flukes (flat wide blades + notch!) ----
  c.save();
  c.translate(-0.328, 0.024);
  c.rotate(p.wag * 0.16);
  fillStroke(
    c,
    () => {
      // Far upper-back fluke wing sweeping horizontally across
      c.moveTo(0.015, -0.012);
      c.bezierCurveTo(-0.028, -0.036, -0.082, -0.045, -0.112, -0.024);
      // Central cetacean tail notch
      c.quadraticCurveTo(-0.092, -0.004, -0.088, 0.012);
      // Near sweeping horizontal fluke wing extending cleanly toward viewer
      c.bezierCurveTo(-0.105, 0.038, -0.132, 0.072, -0.155, 0.092);
      c.bezierCurveTo(-0.105, 0.088, -0.045, 0.054, 0.015, 0.016);
    },
    lin(c, 0.01, -0.02, -0.14, 0.08, [
      [0, B],
      [0.55, TAIL],
      [1, DK],
    ]),
    OL,
    LW * 0.85,
    () => {
      c.strokeStyle = rgba(LT, 0.4);
      c.lineWidth = 0.005;
      c.beginPath();
      c.moveTo(0, 0.002);
      c.quadraticCurveTo(-0.072, 0.032, -0.138, 0.08);
      c.stroke();
    }
  );
  c.restore();

  // Far-side rounded pectoral flipper peek
  fillStroke(
    c,
    () => {
      c.moveTo(0.158, 0.09);
      c.bezierCurveTo(0.165, 0.132, 0.145, 0.168 + ds * 0.5, 0.115, 0.175 + ds * 0.6);
      c.bezierCurveTo(0.098, 0.152, 0.1, 0.118, 0.115, 0.088);
    },
    DK,
    OL,
    LW * 0.72
  );

  // ---- 3. Bottlenose Beak Jaw ----
  const hx = 0.292;
  const hy = 0.036;
  const jawAng = p.open * 0.44;
  const cosJ = Math.cos(jawAng);
  const sinJ = Math.sin(jawAng);
  const rotJ = (px: number, py: number): [number, number] => [
    hx + (px - hx) * cosJ - (py - hy) * sinJ,
    hy + (px - hx) * sinJ + (py - hy) * cosJ,
  ];
  const ux = 0.448;
  const uy = 0.026 - p.open * 0.012;
  const [tipX, tipY] = rotJ(0.436, 0.038);
  const [chinFrontX, chinFrontY] = rotJ(0.382, 0.062);
  const chinBackY = 0.092 + p.open * 0.01 + (p.puff ? 0.008 : 0);

  if (p.open > 0) {
    c.beginPath();
    c.moveTo(hx - 0.012, hy);
    c.quadraticCurveTo(0.372, uy + 0.008, ux - 0.008, uy + 0.002);
    c.quadraticCurveTo((ux + tipX) * 0.5 - 0.012, (uy + tipY) * 0.5, tipX - 0.008, tipY - 0.002);
    c.quadraticCurveTo(0.355, tipY + 0.01, hx - 0.012, hy);
    c.closePath();
    c.fillStyle = "#2b0d24";
    c.fill();
    c.save();
    c.clip();
    c.fillStyle = "#eb769b";
    blob(c, (hx + tipX) * 0.52, (hy + tipY) * 0.52 + 0.004, 0.042, 0.013, jawAng * 0.65);
    c.restore();
  }

  // ---- 4. Graceful Dolphin Melon Forehead & Sleek Torso ----
  const body = () => {
    c.moveTo(-0.332, 0.008);
    c.bezierCurveTo(-0.242, -0.025, -0.14, -0.088, -0.005, -0.114);
    c.bezierCurveTo(0.135, -0.132, 0.255, -0.11, 0.322, -0.052);
    // Distinct rounded dolphin melon curve dipping gently into the smiling beak
    c.bezierCurveTo(0.352, -0.024, 0.362, 0.002, 0.398, 0.006 - p.open * 0.006);
    c.quadraticCurveTo(0.438, 0.01 - p.open * 0.01, ux, uy);
    if (p.open > 0) {
      c.quadraticCurveTo(0.375, uy + 0.008, hx, hy);
      c.quadraticCurveTo((hx + tipX) * 0.5, (hy + tipY) * 0.5 - 0.002, tipX, tipY);
      c.bezierCurveTo(tipX - 0.008, tipY + 0.014, chinFrontX, chinFrontY, 0.255, chinBackY);
    } else {
      c.quadraticCurveTo(0.442, 0.048, 0.392, 0.062);
      c.bezierCurveTo(0.342, 0.078, 0.295, chinBackY, 0.235, chinBackY + 0.01);
    }
    c.bezierCurveTo(0.1, 0.122, -0.055, 0.105, -0.185, 0.072);
    c.bezierCurveTo(-0.255, 0.054, -0.298, 0.038, -0.332, 0.032);
  };

  fillStroke(
    c,
    body,
    lin(c, 0.05, -0.13, 0.02, 0.13, [
      [0, DK],
      [0.42, B],
      [0.64, LT],
      [0.74, BELLY],
      [1, mix(BELLY, B, 0.1)],
    ]),
    OL,
    LW,
    () => {
      // Sweeping lateral dolphin flank highlight wave
      c.fillStyle = rgba(LT, 0.42);
      c.beginPath();
      c.moveTo(0.245, -0.032);
      c.bezierCurveTo(0.115, -0.078, -0.025, -0.055, -0.19, 0.016);
      c.bezierCurveTo(-0.045, 0.012, 0.1, -0.01, 0.245, -0.032);
      c.fill();

      // Glossy dorsal highlight
      c.fillStyle = "rgba(255, 255, 255, 0.28)";
      blob(c, 0.08, -0.09, 0.14, 0.017, 0.04);

      if (p.puff) {
        c.fillStyle = "rgba(255, 130, 165, 0.46)";
        blob(c, 0.295, 0.048, 0.024, 0.014, 0);
      }
    }
  );

  // Cheerful curved dolphin smile when closed
  if (p.open <= 0.02) {
    c.strokeStyle = OL;
    c.lineWidth = LW * 0.72;
    c.beginPath();
    c.moveTo(ux - 0.008, uy + 0.004);
    c.quadraticCurveTo(0.365, 0.044, hx, hy - 0.004);
    c.stroke();
    c.beginPath();
    c.arc(hx - 0.005, hy - 0.006, 0.011, Math.PI * 0.75, Math.PI * 1.45);
    c.lineWidth = LW * 0.55;
    c.stroke();
  }

  // ---- 5. Rounded-Tip Dolphin Pectoral Flipper ----
  c.save();
  c.translate(0.122, 0.056);
  c.rotate(ds * 0.14);
  fillStroke(
    c,
    () => {
      c.moveTo(0.018, -0.008);
      c.bezierCurveTo(-0.008, 0.052, -0.075, 0.126, -0.132, 0.128);
      c.quadraticCurveTo(-0.145, 0.126, -0.134, 0.104);
      c.bezierCurveTo(-0.108, 0.062, -0.065, 0.018, -0.024, -0.014);
    },
    lin(c, 0.01, -0.01, -0.13, 0.12, [
      [0, B],
      [0.6, FIN],
      [1, DK],
    ]),
    OL,
    LW * 0.8
  );
  c.restore();

  // ---- 6. Bright Expressive Dolphin Eye ----
  eye(c, 0.302, -0.02 - p.open * 0.004, 0.036, {
    iris: pal.iris || "#1e3a8a",
    expr: p.expr,
    ol: OL,
    sx: 0.94,
    look: 0.28,
    irisR: 0.62,
    pupilR: 0.36,
  });
}

// =====================================================================================
// GATOR — Alligator Snapping Turtle (Side View Hybrid):
// Exact Image-2 head/moncong (flat bumpy skull, tall blunt snout dropping to a sharp
// hooked beak tip, concave mouth roof, smile dimple, bright eye, pink tongue, scalloped
// neck folds) + Image-1 prehistoric layered carapace, dark shoulder spikes, 2-joint
// ragdoll-articulated clawed swimming arms & legs, and fluid 3-row shingled tail.
// =====================================================================================
function drawSnapturtle(c: Ctx, sp: Species, p: Pose) {
  const pal = sp.pal;
  const SKIN = pal.body || "#727b45";
  const DK = pal.dark || "#3b4222";
  const BELLY = pal.belly || "#a3a168";
  const SHELL = pal.stripe || "#9b984c";
  const HORN = pal.tail || "#2e2920";
  const TONGUE = pal.spot || "#eb6b6b";
  const OL_HEX = pal.outline || "#191c0e";
  const isAlbino = sp.id === "skin-snapturtle_albino" || SKIN.toLowerCase().startsWith("#fff");
  const TIP_TINT = isAlbino ? "#f7aab5" : "#7d4b4a";
  const OL = rgba(OL_HEX, isAlbino ? 0.88 : 0.92);
  const LW = 0.0074;
  const ph = p.phase ?? Math.atan2(p.wag, Math.cos(Math.asin(Math.max(-1, Math.min(1, p.wag)))));
  const s = p.wag;
  const s2 = p.wag2;

  // Helper: single pointed swept-back leaf/horn carapace scute (Image 1)
  const drawShellScute = (x: number, y: number, ang: number, len: number, wid: number, tint = 0.35) => {
    c.save();
    c.translate(x, y);
    c.rotate(ang);
    fillStroke(
      c,
      () => {
        c.moveTo(0, -wid * 0.42);
        c.bezierCurveTo(len * 0.35, -wid * 0.65, len * 0.78, -wid * 0.42, len, 0);
        c.bezierCurveTo(len * 0.76, wid * 0.42, len * 0.32, wid * 0.65, 0, wid * 0.42);
        c.quadraticCurveTo(-len * 0.1, 0, 0, -wid * 0.42);
      },
      lin(c, 0, 0, len, 0, [
        [0, DK],
        [0.32, mix(SKIN, SHELL, 0.55)],
        [0.72, SHELL],
        [1, mix(SHELL, TIP_TINT, tint)],
      ]),
      OL,
      LW * 0.78,
      () => {
        c.strokeStyle = rgba(DK, 0.52);
        c.lineWidth = LW * 0.45;
        c.beginPath();
        c.moveTo(len * 0.14, 0.001);
        c.quadraticCurveTo(len * 0.52, -0.003, len * 0.9, 0);
        c.stroke();

        c.strokeStyle = isAlbino ? "rgba(255, 255, 255, 0.72)" : "rgba(225, 220, 145, 0.32)";
        c.lineWidth = LW * 0.4;
        c.beginPath();
        c.moveTo(len * 0.2, -wid * 0.24);
        c.quadraticCurveTo(len * 0.56, -wid * 0.28, len * 0.85, -wid * 0.06);
        c.stroke();
      }
    );
    c.restore();
  };

  // Helper: glossy curved horn spike / marginal plate (dark obsidian for Gator, champagne-pearl for Albino)
  const drawDarkHornPlate = (x: number, y: number, ang: number, len: number, wid: number) => {
    c.save();
    c.translate(x, y);
    c.rotate(ang);
    fillStroke(
      c,
      () => {
        c.moveTo(0, -wid * 0.5);
        c.bezierCurveTo(len * 0.42, -wid * 0.62, len * 0.82, -wid * 0.32, len, 0.004);
        c.bezierCurveTo(len * 0.76, wid * 0.36, len * 0.36, wid * 0.58, 0, wid * 0.46);
        c.quadraticCurveTo(-len * 0.08, 0, 0, -wid * 0.5);
      },
      lin(c, 0, -wid * 0.4, len * 0.8, wid * 0.4, [
        [0, isAlbino ? mix(HORN, BELLY, 0.52) : mix(HORN, "#685f4b", 0.38)],
        [0.45, HORN],
        [1, isAlbino ? mix(HORN, DK, 0.48) : "#181510"],
      ]),
      OL,
      LW * 0.72,
      () => {
        c.strokeStyle = isAlbino ? "rgba(255, 255, 255, 0.65)" : "rgba(215, 205, 175, 0.28)";
        c.lineWidth = LW * 0.38;
        c.beginPath();
        c.moveTo(len * 0.15, -wid * 0.18);
        c.quadraticCurveTo(len * 0.52, -wid * 0.22, len * 0.82, -wid * 0.04);
        c.stroke();
      }
    );
    c.restore();
  };

  // Helper: Seamless 3-joint ragdoll doggy-paddle / sea-otter swimming limb (1 merged organic contour, NO joint cut-line!)
  const drawRagdollLimb = (lx: number, ly: number, phaseOffset: number, isFront: boolean, far = false) => {
    const cyc = ph + phaseOffset;
    const sinC = Math.sin(cyc);
    const cosC = Math.cos(cyc);

    // Subtle organic shoulder/hip heave during paddle cycle
    const sx0 = lx + (isFront ? 0.005 : 0.004) * cosC;
    const sy0 = ly + 0.004 * sinC;

    // Angles measured in radians from +X (nose/forward), with +Y down:
    // ~1.25 = forward-down (reach), ~1.95 = down-back (power pull), ~2.75 = trailing back toward tail!
    let a1: number;
    let a2: number;
    let a3: number;
    if (isFront) {
      // Dog/Sea-Otter front paddle: reaches forward-down to catch, sweeps down & far back pushing water,
      // then tucks & drags wrist/paw limp-backward on forward recovery!
      a1 = 1.72 - 0.68 * cosC + 0.16 * sinC;
      a2 = a1 + 0.22 - 0.48 * sinC - 0.20 * cosC;
      a3 = a2 + 0.28 - 0.18 * sinC + 0.08 * cosC;
    } else {
      // Hind leg otter/turtle paddle: swept naturally backward alongside belly/tail, kicks powerfully back-and-down,
      // then folds smoothly backward in the slipstream on recovery (never stiff vertical standing post!)
      a1 = 2.18 - 0.50 * cosC + 0.10 * sinC;
      a2 = a1 + 0.34 - 0.42 * sinC + 0.16 * cosC;
      a3 = a2 + 0.24 - 0.16 * sinC;
    }

    // Slight hydro-tuck during forward recovery (sinC < 0) vs full extension on power stroke (sinC > 0)
    const ext = 0.88 + 0.12 * sinC;
    const L1 = (isFront ? 0.035 : 0.038) * ext;
    const L2 = (isFront ? 0.031 : 0.034) * ext;
    const L3 = isFront ? 0.025 : 0.028;

    const p0x = sx0;
    const p0y = sy0;
    const p1x = p0x + Math.cos(a1) * L1;
    const p1y = p0y + Math.sin(a1) * L1;
    const p2x = p1x + Math.cos(a2) * L2;
    const p2y = p1y + Math.sin(a2) * L2;
    const p3x = p2x + Math.cos(a3) * L3;
    const p3y = p2y + Math.sin(a3) * L3;

    // Smooth angle-averaged perpendicular normals [sin(a), -cos(a)] (left/front edge = +, back/inner edge = -)
    const n0x = Math.sin(a1),
      n0y = -Math.cos(a1);
    const a12 = Math.atan2(Math.sin(a1) + Math.sin(a2), Math.cos(a1) + Math.cos(a2));
    const n1x = Math.sin(a12),
      n1y = -Math.cos(a12);
    const a23 = Math.atan2(Math.sin(a2) + Math.sin(a3), Math.cos(a2) + Math.cos(a3));
    const n2x = Math.sin(a23),
      n2y = -Math.cos(a23);
    const n3x = Math.sin(a3),
      n3y = -Math.cos(a3);

    // Stout, muscular, heavy Alligator Snapping Turtle proportions (Image 1!)
    const r0 = isFront ? 0.035 : 0.038;
    const r1 = isFront ? 0.030 : 0.033;
    const r2 = isFront ? 0.025 : 0.027;
    const r3 = isFront ? 0.029 : 0.031;

    const f0x = p0x + n0x * r0,
      f0y = p0y + n0y * r0;
    const f1x = p1x + n1x * r1,
      f1y = p1y + n1y * r1;
    const f2x = p2x + n2x * r2,
      f2y = p2y + n2y * r2;
    const f3x = p3x + n3x * r3,
      f3y = p3y + n3y * r3;

    const b0x = p0x - n0x * r0,
      b0y = p0y - n0y * r0;
    const b1x = p1x - n1x * r1,
      b1y = p1y - n1y * r1;
    const b2x = p2x - n2x * r2,
      b2y = p2y - n2y * r2;
    const b3x = p3x - n3x * r3,
      b3y = p3y - n3y * r3;

    const tipX = p3x + Math.cos(a3) * 0.015;
    const tipY = p3y + Math.sin(a3) * 0.015;

    c.save();
    if (far) c.globalAlpha = isAlbino ? 0.88 : 0.84;
    const colTop = far ? (isAlbino ? mix(DK, BELLY, 0.28) : mix(DK, "#14180b", 0.34)) : SKIN;
    const colLow = far ? (isAlbino ? mix(DK, OL_HEX, 0.22) : mix(DK, "#0d1006", 0.50)) : isAlbino ? mix(SKIN, DK, 0.46) : mix(DK, "#222712", 0.25);

    // 1. 4 Heavy Curved Claws fanning from the broad webbed paw arc along paddle angle a3
    const splay = 1.0 + 0.22 * sinC;
    const clawOffsets = [-0.46, -0.15, 0.16, 0.48];
    const clawLens = [0.024, 0.030, 0.029, 0.022];
    for (let i = 0; i < 4; i++) {
      const t = (i - 1.5) / 1.5; // -1 .. +1 across paw width
      const baseX = p3x + n3x * (t * r3 * 0.68) + Math.cos(a3) * (0.005 - Math.abs(t) * 0.004);
      const baseY = p3y + n3y * (t * r3 * 0.68) + Math.sin(a3) * (0.005 - Math.abs(t) * 0.004);
      const ca = a3 + clawOffsets[i] * splay;
      const clen = clawLens[i];
      c.save();
      c.translate(baseX, baseY);
      c.rotate(ca);
      fillStroke(
        c,
        () => {
          c.moveTo(-0.003, -0.0055);
          c.quadraticCurveTo(clen * 0.55, -0.0068, clen, 0.006);
          c.quadraticCurveTo(clen * 0.45, 0.0062, -0.004, 0.0056);
        },
        far
          ? isAlbino
            ? "#ecc4bd"
            : "#1c1913"
          : lin(c, 0, 0, clen, 0.006, isAlbino ? [[0, "#fff8f0"], [1, "#f2a9a6"]] : [[0, "#524a3a"], [1, "#181510"]]),
        OL,
        LW * 0.55
      );
      c.restore();
    }

    // 2. ONE single continuous merged organic contour: Shoulder/Hip -> Elbow/Knee -> Wrist/Ankle -> Webbed Paw!
    const drawMergedLimbPath = () => {
      c.moveTo(f0x, f0y);
      c.quadraticCurveTo((f0x + f1x) * 0.5 + n0x * 0.004, (f0y + f1y) * 0.5 + n0y * 0.004, f1x, f1y);
      c.quadraticCurveTo((f1x + f2x) * 0.5 + n1x * 0.003, (f1y + f2y) * 0.5 + n1y * 0.003, f2x, f2y);
      c.quadraticCurveTo(f2x + n2x * 0.005 + Math.cos(a3) * 0.008, f2y + n2y * 0.005 + Math.sin(a3) * 0.008, f3x, f3y);
      c.quadraticCurveTo(tipX + n3x * 0.008, tipY + n3y * 0.008, tipX, tipY);
      c.quadraticCurveTo(tipX - n3x * 0.008, tipY - n3y * 0.008, b3x, b3y);
      c.quadraticCurveTo(b2x - n2x * 0.005 + Math.cos(a3) * 0.008, b2y - n2y * 0.005 + Math.sin(a3) * 0.008, b2x, b2y);
      c.quadraticCurveTo((b2x + b1x) * 0.5 - n1x * 0.003, (b2y + b1y) * 0.5 - n1y * 0.003, b1x, b1y);
      c.quadraticCurveTo((b1x + b0x) * 0.5 - n0x * 0.004, (b1y + b0y) * 0.5 - n0y * 0.004, b0x, b0y);
      c.quadraticCurveTo(p0x - Math.cos(a1) * 0.012, p0y - Math.sin(a1) * 0.012, f0x, f0y);
    };

    fillStroke(
      c,
      drawMergedLimbPath,
      lin(c, p0x, p0y, p3x, p3y, [
        [0, colTop],
        [0.52, mix(colTop, colLow, 0.36)],
        [1, colLow],
      ]),
      OL,
      LW * 0.78,
      () => {
        if (!far) {
          // Beefy reptilian muscle highlight & tough scale texture (no dividing seam!)
          c.fillStyle = rgba(BELLY, 0.25);
          blob(c, (p0x + p1x) * 0.5 + n0x * 0.006, (p0y + p1y) * 0.5 + n0y * 0.006, 0.020, 0.013, a1);
          c.fillStyle = rgba(BELLY, 0.18);
          blob(c, (p1x + p2x) * 0.5 + n1x * 0.005, (p1y + p2y) * 0.5 + n1y * 0.005, 0.017, 0.011, a2);

          // Rugged turtle forearm/thigh scale tubercles
          c.fillStyle = rgba(DK, 0.35);
          blob(c, (p0x + p1x) * 0.52 - n0x * 0.008, (p0y + p1y) * 0.52 - n0y * 0.008, 0.009, 0.006, a1);
          blob(c, (p1x + p2x) * 0.45 - n1x * 0.006, (p1y + p2y) * 0.45 - n1y * 0.006, 0.008, 0.005, a2);

          // Tiny soft inner-elbow/knee skin fold crease (only ~32% width, never crossing limb!)
          c.strokeStyle = rgba(DK, 0.52);
          c.lineWidth = LW * 0.44;
          c.beginPath();
          c.moveTo(p1x - n1x * r1 * 0.85, p1y - n1y * r1 * 0.85);
          c.quadraticCurveTo(p1x - n1x * r1 * 0.22, p1y - n1y * r1 * 0.22, p1x + n1x * r1 * 0.08, p1y + n1y * r1 * 0.08);
          c.stroke();

          // Subtle webbed-toe crease lines near paw edge
          c.strokeStyle = rgba(pal.outline || "#191c0e", 0.38);
          c.lineWidth = LW * 0.36;
          for (const wt of [-0.45, 0, 0.45]) {
            const wx0 = p2x + n2x * (wt * r2 * 0.55);
            const wy0 = p2y + n2y * (wt * r2 * 0.55);
            const wx1 = p3x + n3x * (wt * r3 * 0.72);
            const wy1 = p3y + n3y * (wt * r3 * 0.72);
            c.beginPath();
            c.moveTo(wx0, wy0);
            c.lineTo(wx1, wy1);
            c.stroke();
          }
        }
      }
    );

    c.restore();
  };

  // ---- 1. Far-Side Seamless Ragdoll Swim Limbs (Diagonal Doggy-Paddle Coordination) ----
  drawRagdollLimb(0.128, 0.030, Math.PI, true, true);
  drawRagdollLimb(-0.132, 0.028, -Math.PI * 0.08, false, true);

  // ---- 2. Shingled Spiky Alligator Tail (tucked cleanly behind 1.2x shell, multi-wave ragdoll swim whip) ----
  c.save();
  c.translate(-0.188, 0.018);
  c.rotate(s * 0.16);
  const whip = s2 * 0.024;
  const whipTip = Math.sin(ph - 1.9) * 0.018;
  fillStroke(
    c,
    () => {
      c.moveTo(0.018, -0.028);
      c.bezierCurveTo(-0.075, -0.032, -0.17, -0.022 + whip * 0.5, -0.275, -0.006 + whip + whipTip);
      c.bezierCurveTo(-0.18, 0.024 + whip * 0.6, -0.075, 0.04 + whip * 0.2, 0.02, 0.032);
    },
    lin(c, -0.04, -0.03, -0.12, 0.035, [
      [0, SKIN],
      [0.65, DK],
      [1, isAlbino ? mix(DK, OL_HEX, 0.25) : mix(DK, "#121509", 0.4)],
    ]),
    OL,
    LW * 0.72
  );
  const tailScaleRows: [number, number, number, number, number][] = [
    // top dorsal serrated scale row (spiking UP & BACK)
    [-0.016, -0.016, -2.62, 0.048, 0.025],
    [-0.062, -0.017 + whip * 0.2, -2.65, 0.046, 0.024],
    [-0.108, -0.016 + whip * 0.4, -2.68, 0.042, 0.022],
    [-0.152, -0.015 + whip * 0.6 + whipTip * 0.35, -2.72, 0.038, 0.019],
    [-0.195, -0.012 + whip * 0.8 + whipTip * 0.7, -2.75, 0.032, 0.016],
    // middle lateral row (sweeping straight BACK)
    [-0.012, 0.002, 3.12, 0.05, 0.028],
    [-0.058, 0.002 + whip * 0.2, 3.11, 0.048, 0.026],
    [-0.106, 0.001 + whip * 0.4, 3.1, 0.044, 0.024],
    [-0.152, 0.0 + whip * 0.6 + whipTip * 0.35, 3.09, 0.038, 0.02],
    [-0.198, -0.001 + whip * 0.8 + whipTip * 0.7, 3.08, 0.034, 0.017],
    [-0.238, -0.002 + whip * 0.94 + whipTip, 3.06, 0.036, 0.015],
    // bottom row (flaring slightly DOWN & BACK)
    [-0.022, 0.016, 2.86, 0.046, 0.025],
    [-0.066, 0.016 + whip * 0.2, 2.88, 0.044, 0.023],
    [-0.112, 0.014 + whip * 0.4, 2.9, 0.04, 0.021],
    [-0.156, 0.01 + whip * 0.6 + whipTip * 0.35, 2.92, 0.036, 0.018],
    [-0.20, 0.006 + whip * 0.8 + whipTip * 0.7, 2.95, 0.032, 0.015],
  ];
  for (const [sx, sy, sa, sl, sw] of tailScaleRows) {
    drawShellScute(sx, sy, sa, sl, sw, 0.08);
  }
  c.restore();

  // ---- 3. Muscular Segmented Underbelly / Plastron sized for 1.2x shell ----
  fillStroke(
    c,
    () => {
      c.moveTo(-0.185, 0.026);
      c.quadraticCurveTo(-0.01, 0.074, 0.185, 0.056);
      c.lineTo(0.2, 0.016);
      c.lineTo(-0.185, 0.005);
    },
    lin(c, 0, 0.015, 0, 0.072, [
      [0, SKIN],
      [0.45, BELLY],
      [1, mix(BELLY, DK, 0.25)],
    ]),
    OL,
    LW * 0.74,
    () => {
      c.strokeStyle = rgba(DK, 0.56);
      c.lineWidth = LW * 0.48;
      for (const bx of [-0.095, -0.042, 0.012, 0.068, 0.12]) {
        c.beginPath();
        c.moveTo(bx, 0.024);
        c.quadraticCurveTo(bx - 0.005, 0.046, bx + 0.003, 0.064);
        c.stroke();
      }
    }
  );

  // ---- 4. Compact Chunky Head & Snout (Image 1 silhouette: short neck, domed brow, plump throat rolls, curved hooked beak!) ----
  const lunge = p.open * 0.022;
  const hx = 0.275 + lunge;
  const hy = 0.024;
  const jawAng = p.open * 0.72;
  const cosJ = Math.cos(jawAng);
  const sinJ = Math.sin(jawAng);
  const rotJ = (px: number, py: number): [number, number] => [
    hx + (px - hx) * cosJ - (py - hy) * sinJ,
    hy + (px - hx) * sinJ + (py - hy) * cosJ,
  ];
  const [ljTipX, ljTipY] = rotJ(0.376 + lunge, 0.021);
  const [chinX, chinY] = rotJ(0.328 + lunge, 0.054);
  const throatY = 0.068 + p.open * 0.008 + (p.puff ? 0.015 : 0);

  // Subtle upward skull strike recoil when gaping wide (mangap), snapping level on bite!
  c.save();
  c.translate(0.168, 0.01);
  c.rotate(-p.open * 0.065);
  c.translate(-0.168, -0.01);

  // Open mouth cavity + thick curved coral-pink tongue with central groove
  if (p.open > 0.03) {
    c.beginPath();
    c.moveTo(hx - 0.006, hy);
    c.quadraticCurveTo(0.322 + lunge, 0.008, 0.365 + lunge, 0.012);
    c.lineTo(0.386 + lunge, 0.036);
    c.quadraticCurveTo(0.372 + lunge, (0.036 + ljTipY) * 0.5, ljTipX, ljTipY);
    c.quadraticCurveTo(0.318 + lunge, ljTipY + 0.008, hx - 0.006, hy + 0.004);
    c.closePath();
    c.fillStyle = lin(c, hx, hy, 0.36 + lunge, hy, [
      [0, "#3b0c16"],
      [0.65, "#611926"],
      [1, "#7d2534"],
    ]);
    c.fill();

    c.save();
    c.clip();
    const tx0 = hx + 0.01;
    const ty0 = hy + 0.008 + p.open * 0.016;
    const wriggle = Math.sin(s * 2) * 0.003;
    c.fillStyle = TONGUE;
    c.strokeStyle = "#8a1e2e";
    c.lineWidth = LW * 0.45;
    c.beginPath();
    c.moveTo(tx0, ty0 + 0.016);
    c.bezierCurveTo(tx0 + 0.012, ty0 - 0.02, tx0 + 0.042, ty0 - 0.022 + wriggle, tx0 + 0.072, ty0 + 0.004);
    c.quadraticCurveTo(tx0 + 0.04, ty0 + 0.026, tx0, ty0 + 0.016);
    c.closePath();
    c.fill();
    c.stroke();
    // Central tongue groove + highlight
    c.strokeStyle = "#b03242";
    c.lineWidth = LW * 0.35;
    c.beginPath();
    c.moveTo(tx0 + 0.016, ty0 + 0.004);
    c.quadraticCurveTo(tx0 + 0.04, ty0 - 0.01 + wriggle * 0.5, tx0 + 0.06, ty0 - 0.002);
    c.stroke();
    c.fillStyle = "rgba(255, 215, 215, 0.55)";
    blob(c, tx0 + 0.036, ty0 - 0.01 + wriggle * 0.4, 0.013, 0.0035, 0.12);
    c.restore();
  }

  // Compact rounded Image-1 Head Shape tucked right against the shell front (NO long neck!)
  fillStroke(
    c,
    () => {
      c.moveTo(0.168, -0.042);
      // 2 chunky crown bumps emerging straight from front of shell + raised rounded brow over eye!
      c.quadraticCurveTo(0.186 + lunge * 0.25, -0.062, 0.208 + lunge * 0.4, -0.056);
      c.quadraticCurveTo(0.23 + lunge * 0.55, -0.068, 0.256 + lunge * 0.75, -0.058);
      // Rounded forehead dome curving gently over the big eye down to snout bridge
      c.bezierCurveTo(0.285 + lunge, -0.066, 0.315 + lunge, -0.056, 0.338 + lunge, -0.046);
      // Short plump rounded snout curving boldly into sharp hooked beak tip!
      c.bezierCurveTo(0.368 + lunge, -0.045, 0.394 + lunge, -0.028, 0.396 + lunge, 0.002);
      c.bezierCurveTo(0.396 + lunge, 0.02, 0.39 + lunge, 0.034, 0.382 + lunge, 0.036);
      // Deep curved hooked beak notch arching up into upper mouth roof!
      c.quadraticCurveTo(0.376 + lunge, 0.016, 0.358 + lunge, 0.01);
      c.bezierCurveTo(0.332 + lunge, 0.008, 0.302 + lunge, 0.014, hx, hy);
      // Chunky lower jaw + plump rounded double-chin throat rolls tucking straight into chest!
      if (p.open > 0.03) {
        c.quadraticCurveTo((hx + ljTipX) * 0.5, (hy + ljTipY) * 0.5 + 0.004, ljTipX, ljTipY);
        c.quadraticCurveTo(ljTipX - 0.006, ljTipY + 0.015, chinX, chinY);
        c.bezierCurveTo(0.292 + lunge, chinY + 0.012, 0.262 + lunge * 0.7, throatY + 0.004, 0.232 + lunge * 0.4, throatY);
      } else {
        c.quadraticCurveTo(0.326 + lunge, 0.02, 0.372 + lunge, 0.022);
        c.quadraticCurveTo(0.362 + lunge, 0.046, 0.325 + lunge, 0.056);
        c.bezierCurveTo(0.29 + lunge, 0.066, 0.26 + lunge * 0.7, throatY + 0.004, 0.232 + lunge * 0.4, throatY);
      }
      // Scalloped rounded throat roll curving right into shoulder/chest under shell!
      c.quadraticCurveTo(0.205, throatY + 0.006, 0.186, 0.056);
      c.quadraticCurveTo(0.172, 0.048, 0.168, 0.035);
    },
    lin(c, 0.27 + lunge, -0.064, 0.28 + lunge, 0.068, [
      [0, mix(SKIN, SHELL, 0.18)],
      [0.55, SKIN],
      [1, mix(BELLY, SKIN, 0.42)],
    ]),
    OL,
    LW * 0.84,
    () => {
      // Soft rounded throat roll creases tucked cleanly under cheek (Image 1!)
      c.strokeStyle = rgba(DK, 0.58);
      c.lineWidth = LW * 0.46;
      c.beginPath();
      c.moveTo(0.212 + lunge * 0.35, 0.026);
      c.quadraticCurveTo(0.218 + lunge * 0.4, 0.048, 0.234 + lunge * 0.45, 0.066);
      c.moveTo(0.244 + lunge * 0.55, 0.034);
      c.quadraticCurveTo(0.252 + lunge * 0.6, 0.05, 0.268 + lunge * 0.65, 0.062);
      c.stroke();

      // Two cute short cheek ticks behind the big eye (Image 1!)
      c.beginPath();
      c.moveTo(0.246 + lunge, -0.022);
      c.lineTo(0.234 + lunge, -0.018);
      c.moveTo(0.242 + lunge, -0.002);
      c.lineTo(0.228 + lunge, 0.001);
      c.stroke();

      // Nostril oval near plump snout tip
      c.fillStyle = isAlbino ? mix(DK, OL_HEX, 0.45) : mix(DK, "#121509", 0.55);
      blob(c, 0.362 + lunge, -0.020, 0.0054, 0.0038, -0.35);

      if (p.puff) {
        // Soft cheek blush placed neatly behind mouth corner (never overlapping lip!)
        c.fillStyle = "rgba(255, 130, 145, 0.42)";
        blob(c, 0.252 + lunge, 0.012, 0.019, 0.012, 0);
      }
    }
  );

  // Cute curved mouth-corner smile dimple (Image 1)
  c.strokeStyle = OL;
  c.lineWidth = LW * 0.58;
  c.beginPath();
  c.arc(hx - 0.006, hy, 0.012, Math.PI * 0.85, Math.PI * 1.48);
  c.stroke();
  if (p.open <= 0.03) {
    c.lineWidth = LW * 0.65;
    c.beginPath();
    c.moveTo(0.376 + lunge, 0.024);
    c.quadraticCurveTo(0.324 + lunge, 0.012, hx, hy);
    c.stroke();
  }

  // Big bright expressive Image-1 eye sitting right under the rounded brow dome
  const ex = 0.295 + lunge;
  const ey = -0.024;
  const er = 0.031;
  c.beginPath();
  c.arc(ex, ey, er * 1.14, Math.PI * 1.12, Math.PI * 1.88);
  c.strokeStyle = rgba(DK, 0.55);
  c.lineWidth = LW * 0.56;
  c.stroke();
  eye(c, ex, ey, er, {
    iris: pal.iris || "#2085e2",
    expr: p.expr,
    ol: OL,
    sx: 0.92,
    look: 0.26,
    irisR: 0.58,
    pupilR: 0.35,
  });
  c.restore();

  // ---- 5. Prehistoric Layered Carapace scaled 1.2x around belly/center anchor (-0.005, 0.024) ----
  c.save();
  c.translate(-0.005, 0.024);
  c.scale(1.2, 1.2);
  c.translate(0.005, -0.024);

  fillStroke(
    c,
    () => {
      c.moveTo(0.165, -0.025);
      c.bezierCurveTo(0.095, -0.115, -0.055, -0.125, -0.175, -0.045);
      c.quadraticCurveTo(-0.2, 0.004, -0.155, 0.022);
      c.quadraticCurveTo(0.01, 0.038, 0.165, 0.018);
    },
    lin(c, 0, -0.12, 0, 0.03, [
      [0, DK],
      [0.65, HORN],
      [1, isAlbino ? mix(HORN, OL_HEX, 0.3) : "#1c1812"],
    ]),
    OL,
    LW * 0.76
  );

  // Row 1 (Top Dorsal Crest — 5 big swept-back pointed shell scales)
  const topScutes: [number, number, number, number, number][] = [
    [0.14, -0.046, -2.18, 0.095, 0.058],
    [0.088, -0.072, -2.28, 0.105, 0.062],
    [0.028, -0.082, -2.4, 0.108, 0.064],
    [-0.034, -0.076, -2.54, 0.102, 0.06],
    [-0.095, -0.058, -2.66, 0.088, 0.052],
  ];
  for (const [sx, sy, sa, sl, sw] of topScutes) {
    drawShellScute(sx, sy, sa, sl, sw, 0.38);
  }

  // Row 2 (Middle Lateral Row — 5 staggered pointed scutes)
  const midScutes: [number, number, number, number, number][] = [
    [0.142, -0.015, -2.26, 0.09, 0.054],
    [0.084, -0.032, -2.38, 0.1, 0.06],
    [0.018, -0.042, -2.48, 0.104, 0.062],
    [-0.048, -0.038, -2.6, 0.096, 0.058],
    [-0.108, -0.025, -2.72, 0.082, 0.05],
  ];
  for (const [sx, sy, sa, sl, sw] of midScutes) {
    drawShellScute(sx, sy, sa, sl, sw, 0.35);
  }

  // Row 3 (Lower Costal Row — 4 overlapping pointed scutes)
  const lowScutes: [number, number, number, number, number][] = [
    [0.092, 0.002, -2.48, 0.082, 0.048],
    [0.024, -0.005, -2.58, 0.088, 0.05],
    [-0.044, -0.004, -2.68, 0.084, 0.048],
    [-0.106, 0.004, -2.78, 0.074, 0.044],
  ];
  for (const [sx, sy, sa, sl, sw] of lowScutes) {
    drawShellScute(sx, sy, sa, sl, sw, 0.28);
  }
  c.restore();

  // ---- 6. Near-Side Beefy Seamless Ragdoll Clawed Swim Limbs (drawn just under shell rim!) ----
  drawRagdollLimb(0.105, 0.032, 0, true, false);
  drawRagdollLimb(-0.145, 0.030, Math.PI * 0.92, false, false);

  // ---- 7. 1.2x Marginal Rim Skirt Plates & Shoulder Collar Spikes overlapping upper limb sockets ----
  c.save();
  c.translate(-0.005, 0.024);
  c.scale(1.2, 1.2);
  c.translate(0.005, -0.024);

  const marginalPlates: [number, number, number, number, number][] = [
    [-0.118, 0.006, 2.95, 0.076, 0.032],
    [-0.068, 0.012, 2.9, 0.074, 0.032],
    [-0.018, 0.015, 2.84, 0.072, 0.032],
    [0.032, 0.014, 2.76, 0.07, 0.032],
    [0.082, 0.01, 2.64, 0.066, 0.032],
  ];
  for (const [mx, my, ma, ml, mw] of marginalPlates) {
    drawDarkHornPlate(mx, my, ma, ml, mw);
  }

  // Front Shoulder Collar — Signature Long Curved Glossy Dark Horn Spikes framing shoulder front
  drawDarkHornPlate(0.162, -0.038, -2.35, 0.048, 0.022);
  drawDarkHornPlate(0.162, -0.02, -2.72, 0.06, 0.025);
  drawDarkHornPlate(0.156, 0.002, 2.58, 0.064, 0.025);
  drawDarkHornPlate(0.148, 0.018, 2.34, 0.062, 0.025);
  c.restore();
}

export function renderCustomFish(sp: Species, W: number, jawState: number, tailFrame: number, tailFrames: number, expr: Expr): HTMLCanvasElement {
  const st = sp.style as CustomStyle;
  const H = Math.max(20, Math.round(W * ASPECT[st]));
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const c = cv.getContext("2d")!;
  c.lineJoin = "round";
  c.lineCap = "round";
  const ang = (tailFrame / tailFrames) * TAU;
  const pose: Pose = {
    open: jawState > 0 ? Math.min(1, jawState / 6) : 0,
    puff: jawState === -1,
    wag: Math.sin(ang),
    wag2: Math.sin(ang - 1.0),
    phase: ang,
    expr,
  };
  c.translate(W / 2, H / 2);
  c.scale(W, W);
  if (st === "clown") drawClown(c, sp, pose);
  else if (st === "idol") drawIdol(c, sp, pose);
  else if (st === "shark") drawShark(c, sp, pose);
  else if (st === "shark_sleek") drawSharkSleek(c, sp, pose);
  else if (st === "boris") drawBoris(c, sp, pose);
  else if (st === "andy") drawAndy(c, sp, pose);
  else if (st === "tang") drawTang(c, sp, pose);
  else if (st === "leon") drawLeon(c, sp, pose);
  else if (st === "orca") drawOrca(c, sp, pose);
  else if (st === "barracuda") drawBarracuda(c, sp, pose);
  else if (st === "sailfish") drawSailfish(c, sp, pose);
  else if (st === "eddy") drawEddy(c, sp, pose);
  else if (st === "stingray") drawStingray(c, sp, pose);
  else if (st === "mandarin") drawMandarin(c, sp, pose);
  else if (st === "aurora") drawAurora(c, sp, pose);
  else if (st === "narwhal") drawNarwhal(c, sp, pose);
  else if (st === "seadragon") drawSeadragon(c, sp, pose);
  else if (st === "axolotl") drawAxolotl(c, sp, pose);
  else if (st === "whaleshark") drawWhaleshark(c, sp, pose);
  else if (st === "tuna") drawTuna(c, sp, pose);
  else if (st === "hammerhead") drawHammerhead(c, sp, pose);
  else if (st === "butterfly") drawButterfly(c, sp, pose);
  else if (st === "snapper") drawSnapper(c, sp, pose);
  else if (st === "lumba") drawLumba(c, sp, pose);
  else if (st === "snapturtle") drawSnapturtle(c, sp, pose);
  else drawLeopard(c, sp, pose);
  return cv;
}

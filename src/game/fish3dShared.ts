import * as THREE from "three";
import {
  applyBoris3DPose,
  buildOutlineGeometry,
  createBoris3DRig,
  cubicPt,
  evalSpineZAt,
  injectSpineShader,
  interpCurveY,
  isSoftwareWebGL,
  normalizeExtrudeUVs,
} from "./boris3d";
import type { Boris3DPose, Boris3DRig, SpineUniforms } from "./boris3d";

export {
  applyBoris3DPose,
  buildOutlineGeometry,
  createBoris3DRig,
  cubicPt,
  evalSpineZAt,
  injectSpineShader,
  interpCurveY,
  isSoftwareWebGL,
  normalizeExtrudeUVs,
};
export type { Boris3DPose, Boris3DRig, SpineUniforms };

export type Fish3DPose = Boris3DPose;
export type Pt = [number, number];

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function jawOutlineMask(xHide = 0.008, xFull = 0.044): (x: number, y: number, z: number) => number {
  return (x: number) => smoothstep(xHide, xFull, x);
}

export function finRootMaskY(yRoot: number, fadeSpan: number, isTop = true): (x: number, y: number, z: number) => number {
  return isTop
    ? (_x: number, y: number) => smoothstep(yRoot, yRoot + fadeSpan, y)
    : (_x: number, y: number) => smoothstep(yRoot, yRoot - fadeSpan, y);
}

export interface SpineSocketSpan {
  x0: number;
  x1: number;
  top: boolean;
}

export function bodySpineOutlineMask(
  evalMidY: (x: number) => number,
  spans: SpineSocketSpan[],
  zRadius = 0.03
): (x: number, y: number, z: number) => number {
  return (x: number, y: number, z: number) => {
    const absZ = Math.abs(z);
    if (absZ >= zRadius) return 1;
    const zFade = smoothstep(0.006, zRadius, absZ);
    const mid = evalMidY(x);
    let hide = 0;
    for (const s of spans) {
      if (s.top ? y <= mid : y >= mid) continue;
      const xMask = smoothstep(s.x0 - 0.006, s.x0 + 0.016, x) * (1 - smoothstep(s.x1 - 0.016, s.x1 + 0.006, x));
      if (xMask > hide) hide = xMask;
    }
    return 1 - hide * (1 - zFade);
  };
}

export function mouthSeamOutlineMask(
  xHinge: number,
  xEnd: number,
  jawY: number,
  evalSeamY: (x: number) => number,
  isJaw = false
): (x: number, y: number, z: number) => number {
  return (x: number, y: number, _z: number) => {
    const wx = isJaw ? x + xHinge : x;
    const wy = isJaw ? y + jawY : y;
    const dy = wy - evalSeamY(wx);
    const tipKeep = smoothstep(xEnd - 0.014, xEnd - 0.002, wx);
    if (!isJaw) {
      const backBellyFade = 1 - smoothstep(xHinge - 0.024, xHinge - 0.002, wx);
      const upperKeep = smoothstep(0.002, 0.012, dy);
      return Math.max(backBellyFade, upperKeep, tipKeep);
    }
    const jawBackFade = smoothstep(-0.001, 0.016, x);
    const edgeMask = smoothstep(0.004, 0.013, -dy);
    return jawBackFade * Math.max(edgeMask, tipKeep);
  };
}

export function blendBotToPalate(
  botFn: (x: number) => number,
  palateFn: (x: number) => number,
  hx: number,
  blendBack = 0.032,
  blendFwd = 0.014
): (x: number) => number {
  return (x: number) => {
    if (x <= hx - blendBack) return botFn(x);
    if (x >= hx + blendFwd) return palateFn(x);
    const k = smoothstep(hx - blendBack, hx + blendFwd, x);
    const b = botFn(x);
    const p = palateFn(x);
    return b + (p - b) * k;
  };
}

export function surfaceZAt(
  evalTop: (x: number) => number,
  evalBot: (x: number) => number,
  evalHalfZ: (x: number) => number,
  ex: number,
  ey: number,
  taperPow = 0.22,
  inset = 0.96
): number {
  const yt = evalTop(ex);
  const yb = evalBot(ex);
  const ym = (yt + yb) * 0.5;
  const hh = Math.max(0.008, (yt - yb) * 0.5);
  const s = clamp((ey - ym) / hh, -0.92, 0.92);
  const c = Math.sqrt(Math.max(0.06, 1 - s * s));
  return evalHalfZ(ex) * c * (1 - taperPow * s * s) * inset;
}

/**
 * Computes a clean Z socket offset so the entire circular eyeball (including lower & rear rims)
 * clears curved or flat cheeks with zero lower-skin "selaput" clipping.
 */
export function computeEyeZ(
  evalTop: (x: number) => number,
  evalBot: (x: number) => number,
  evalHalfZ: (x: number) => number,
  ex: number,
  ey: number,
  er: number,
  taperPow = 0.22
): number {
  const zC = surfaceZAt(evalTop, evalBot, evalHalfZ, ex, ey, taperPow, 1.0);
  const zLow = surfaceZAt(evalTop, evalBot, evalHalfZ, ex, ey - er * 0.62, taperPow, 1.0);
  const zLowMid = surfaceZAt(evalTop, evalBot, evalHalfZ, ex + er * 0.2, ey - er * 0.52, taperPow, 1.0);
  return Math.max(zC, zLow - er * 0.05, zLowMid - er * 0.05) + er * 0.02;
}

export interface Fish3DRig extends Boris3DRig {
  speciesKey: string;
  tailPivotX: number;
  isFluke?: boolean;
  skipDefaultFins?: boolean;
  scaleGroup?: THREE.Group;
  onCustomPose?: (p: Fish3DPose, open: number, swimAmp: number) => void;
}

// ---------- Color & Canvas Helpers ----------
export function hexRgb(h: string): [number, number, number] {
  const s = h.startsWith("#") ? h.slice(1) : h;
  const n = parseInt(s, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function mixHex(a: string, b: string, t: number): string {
  const ca = hexRgb(a);
  const cb = hexRgb(b);
  const r = Math.round(ca[0] + (cb[0] - ca[0]) * t);
  const g = Math.round(ca[1] + (cb[1] - ca[1]) * t);
  const bl = Math.round(ca[2] + (cb[2] - ca[2]) * t);
  return "#" + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1);
}

export function rgbaHex(h: string, alpha: number): string {
  const [r, g, b] = hexRgb(h);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function makeLin(c: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, stops: [number, string][]) {
  const g = c.createLinearGradient(x0, y0, x1, y1);
  for (const [o, col] of stops) g.addColorStop(o, col);
  return g;
}

export function drawBlob(c: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, rot = 0) {
  c.beginPath();
  c.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  c.fill();
}

export function drawGlow(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  rot: number,
  rgb: string,
  a: number
) {
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
  c.arc(0, 0, rx, 0, Math.PI * 2);
  c.fill();
  c.restore();
}

export function sampleBezierChain(segs: [Pt, Pt, Pt, Pt][], stepsPerSeg = 26): Pt[] {
  const pts: Pt[] = [];
  segs.forEach((s, idx) => {
    for (let i = idx === 0 ? 0 : 1; i <= stepsPerSeg; i++) {
      pts.push(cubicPt(s[0], s[1], s[2], s[3], i / stepsPerSeg));
    }
  });
  return pts;
}

export function createWorldMapper(minX: number, maxX: number, minY3: number, maxY3: number, size = 512) {
  const spanX = Math.max(1e-4, maxX - minX);
  const spanY = Math.max(1e-4, maxY3 - minY3);
  const mapUV = (x: number, y3: number): Pt => [
    clamp((x - minX) / spanX, 0.002, 0.998),
    clamp((y3 - minY3) / spanY, 0.002, 0.998),
  ];
  const beginCanvas2D = (c: CanvasRenderingContext2D, offset2DX = 0, offset2DY = 0) => {
    c.save();
    c.translate((-minX / spanX) * size, (maxY3 / spanY) * size);
    c.scale(size / spanX, size / spanY);
    if (offset2DX !== 0 || offset2DY !== 0) c.translate(offset2DX, offset2DY);
  };
  return { mapUV, beginCanvas2D };
}

export function drawFinRays(
  fc: CanvasRenderingContext2D,
  origin: Pt,
  tips: Pt[],
  color: string,
  lineWidth = 0.0042
) {
  fc.strokeStyle = color;
  fc.lineWidth = lineWidth;
  fc.lineCap = "round";
  for (const [tx, ty] of tips) {
    fc.beginPath();
    fc.moveTo(origin[0], origin[1]);
    fc.lineTo(tx, ty);
    fc.stroke();
  }
}

// ---------- Shared Lofted 3D Geometry Builders (verified +Z outward winding!) ----------
export interface LoftOpts {
  xStart: number;
  xEnd: number;
  uSteps?: number;
  vSteps?: number;
  evalTopY: (x: number) => number;
  evalBotY: (x: number) => number;
  evalHalfZ: (x: number, t: number) => number;
  mapUV: (x: number, y: number) => Pt;
  taper?: (sinP: number) => number;
  localOffsetX?: number;
  localOffsetY?: number;
  roundFront?: boolean;
  roundFrontStart?: number;
  rearBulge?: number;
  rearInsetAt?: (x: number, t: number) => number;
  capBack?: boolean;
  capFront?: boolean;
}

export function buildLoftedSurface(opts: LoftOpts): THREE.BufferGeometry {
  const uSteps = opts.uSteps ?? 40;
  const vSteps = opts.vSteps ?? 28;
  const ringCols = vSteps + 1;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const ox = opts.localOffsetX ?? 0;
  const oy = opts.localOffsetY ?? 0;
  const taperFn = opts.taper ?? ((s: number) => 1 - 0.22 * s * s);

  for (let i = 0; i <= uSteps; i++) {
    const t = i / uSteps;
    const x = opts.xStart + (opts.xEnd - opts.xStart) * t;
    let yTop = opts.evalTopY(x);
    let yBot = opts.evalBotY(x);
    const rfStart = opts.roundFrontStart ?? 0.84;
    if (opts.roundFront && t > rfStart) {
      const k = (t - rfStart) / Math.max(0.01, 1 - rfStart);
      const mid = (yTop + yBot) * 0.5;
      const shrink = Math.sqrt(Math.max(0.04, 1 - k * k * 0.92));
      const h = Math.max(0.002, (yTop - yBot) * 0.5 * shrink);
      yTop = mid + h;
      yBot = mid - h;
    }
    if (yTop < yBot + 0.003) {
      const m = (yTop + yBot) * 0.5;
      yTop = m + 0.0015;
      yBot = m - 0.0015;
    }
    const yMid = (yTop + yBot) * 0.5;
    const halfH = (yTop - yBot) * 0.5;
    const inset = opts.rearInsetAt ? opts.rearInsetAt(x, t) : 1;
    const halfZ = Math.max(0.003, opts.evalHalfZ(x, t) * inset);
    const bulge = opts.rearBulge && t < 0.14 ? Math.sin((1 - t / 0.14) * Math.PI * 0.5) * opts.rearBulge : 0;

    for (let j = 0; j <= vSteps; j++) {
      const phi = (j / vSteps) * Math.PI * 2;
      const sinP = Math.sin(phi);
      const cosP = Math.cos(phi);
      const tap = taperFn(sinP);
      const wx = x - bulge * (1 - sinP * sinP * 0.6);
      const wy = yMid + halfH * sinP;
      const wz = halfZ * cosP * tap;
      positions.push(wx - ox, wy - oy, wz);
      const [tu, tv] = opts.mapUV(wx, wy);
      uvs.push(tu, tv);
    }
  }

  for (let i = 0; i < uSteps; i++) {
    for (let j = 0; j < vSteps; j++) {
      const a = i * ringCols + j;
      const b = (i + 1) * ringCols + j;
      const c = (i + 1) * ringCols + (j + 1);
      const d = i * ringCols + (j + 1);
      indices.push(a, b, d);
      indices.push(b, c, d);
    }
  }

  if (opts.capBack !== false) {
    const backCenter = positions.length / 3;
    const ym0 = (opts.evalTopY(opts.xStart) + opts.evalBotY(opts.xStart)) * 0.5;
    positions.push(opts.xStart - (opts.rearBulge ?? 0.003) - ox, ym0 - oy, 0);
    const [bu, bv] = opts.mapUV(opts.xStart, ym0);
    uvs.push(bu, bv);
    for (let j = 0; j < vSteps; j++) {
      indices.push(backCenter, j, j + 1);
    }
  }

  if (opts.capFront !== false) {
    const frontRingStart = uSteps * ringCols;
    const frontCenter = positions.length / 3;
    const ym1 = (opts.evalTopY(opts.xEnd) + opts.evalBotY(opts.xEnd)) * 0.5;
    positions.push(opts.xEnd + 0.002 - ox, ym1 - oy, 0);
    const [fu, fv] = opts.mapUV(opts.xEnd, ym1);
    uvs.push(fu, fv);
    for (let j = 0; j < vSteps; j++) {
      indices.push(frontCenter, frontRingStart + j + 1, frontRingStart + j);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

export interface SlicedHeadOpts {
  xStart: number;
  xHinge: number;
  xEnd: number;
  xLowerStart?: number;
  xLowerEnd?: number;
  jawY: number;
  evalTopY: (x: number) => number;
  evalBotY: (x: number) => number;
  evalSeamY: (x: number) => number;
  evalHalfZ: (x: number, t: number) => number;
  mapUV: (x: number, y: number) => Pt;
  taper?: (sinP: number) => number;
  rearBulge?: number;
  uSteps?: number;
  vSteps?: number;
  jawUSteps?: number;
  jawVSteps?: number;
}

/**
 * Builds an articulated upper-body + lower-jaw mesh pair sliced from the SAME unified
 * smooth 3D cross-section ellipse along evalSeamY(x). When closed (open=0), the upper head
 * and lower jaw form a single continuous rounded chubby snout with zero chin V-notch,
 * zero figure-8 pinch, zero rectangular duck-bill, and zero overhanging jaw shelf.
 */
export function buildSlicedHeadBody(opts: SlicedHeadOpts): {
  bodyGeo: THREE.BufferGeometry;
  lowerJawGeo: THREE.BufferGeometry;
} {
  const taperFn = opts.taper ?? ((s: number) => 1 - 0.18 * s * s);
  const totalLen = Math.max(1e-4, opts.xEnd - opts.xStart);

  const evalUnifiedFrame = (x: number) => {
    const t = clamp((x - opts.xStart) / totalLen, 0, 1);
    const yTop = opts.evalTopY(x);
    const yBot = opts.evalBotY(x);
    const yMid = (yTop + yBot) * 0.5;
    const halfH = Math.max(0.0018, (yTop - yBot) * 0.5);
    const halfZ = Math.max(0.0018, opts.evalHalfZ(x, t));
    const sSeam = clamp((opts.evalSeamY(x) - yMid) / halfH, -0.92, 0.92);
    const phiSeam = Math.asin(sSeam);
    return { t, yMid, halfH, halfZ, phiSeam };
  };

  // --- 1. Unified Body + Upper Cranium with an EXACT ring at x = opts.xHinge ---
  const vSteps = (opts.vSteps ?? 32) & ~1;
  const vHalf = vSteps >> 1;
  const ringCols = vSteps + 1;
  const bPos: number[] = [];
  const bUV: number[] = [];
  const bIdx: number[] = [];

  const backSteps = Math.max(24, Math.round((opts.uSteps ?? 60) * 0.72));
  const frontSteps = Math.max(14, (opts.uSteps ?? 60) - backSteps);
  const ringX: number[] = [];
  for (let i = 0; i <= backSteps; i++) {
    const u = i / backSteps;
    ringX.push(opts.xStart + (opts.xHinge - opts.xStart) * u);
  }
  for (let i = 1; i <= frontSteps; i++) {
    const raw = i / frontSteps;
    const t = Math.pow(raw, 1.35);
    ringX.push(opts.xHinge + (opts.xEnd - opts.xHinge) * t);
  }
  const totalRingCount = ringX.length - 1;
  const ringPhiRight: number[] = [];
  const ringKMouth: number[] = [];

  const evalOuterPt = (x: number, phi: number): [number, number, number] => {
    const { yMid, halfH, halfZ } = evalUnifiedFrame(x);
    const sinP = Math.sin(phi);
    const cosP = Math.cos(phi);
    return [x, yMid + halfH * sinP, halfZ * cosP * taperFn(sinP)];
  };

  // Exact outward surface normal via finite differences of dP/dx x dP/dphi (includes taper derivative, zero sign bugs)
  const evalOuterNormal = (x: number, phi: number): [number, number, number] => {
    const epsX = 0.003;
    const epsPhi = 0.006;
    const x0 = Math.max(opts.xStart, x - epsX);
    const x1 = Math.min(opts.xEnd, x + epsX);
    const pX0 = evalOuterPt(x0, phi);
    const pX1 = evalOuterPt(x1, phi);
    const pP0 = evalOuterPt(x, phi - epsPhi);
    const pP1 = evalOuterPt(x, phi + epsPhi);
    const txX = pX1[0] - pX0[0];
    const txY = pX1[1] - pX0[1];
    const txZ = pX1[2] - pX0[2];
    const tpX = pP1[0] - pP0[0];
    const tpY = pP1[1] - pP0[1];
    const tpZ = pP1[2] - pP0[2];
    const nx = txY * tpZ - txZ * tpY;
    const ny = txZ * tpX - txX * tpZ;
    const nz = txX * tpY - txY * tpX;
    const len = Math.hypot(nx, ny, nz) || 1;
    return [nx / len, ny / len, nz / len];
  };

  for (let i = 0; i <= totalRingCount; i++) {
    const x = ringX[i];
    const t = clamp((x - opts.xStart) / totalLen, 0, 1);
    const { yMid, halfH, halfZ, phiSeam } = evalUnifiedFrame(x);
    // Slide phiRight gradually down to phiSeam across the wide cheek BEFORE xHinge so zero twisted quads occur near the mouth corner
    const phiEase = smoothstep(opts.xHinge - 0.14, opts.xHinge - 0.015, x);
    const phiRight = phiSeam * phiEase;
    ringPhiRight.push(phiRight);

    // Body holds 100% intact outer skin up to exact ring x = xHinge, then tucks briskly inside lowerJawGeo
    const kMouth = x <= opts.xHinge ? 0 : smoothstep(opts.xHinge, opts.xHinge + 0.010, x);
    ringKMouth.push(kMouth);
    const bulge = opts.rearBulge && t < 0.14 ? Math.sin((1 - t / 0.14) * Math.PI * 0.5) * opts.rearBulge : 0;

    const phiLeft = Math.PI - phiRight;
    const yEdge = yMid + halfH * Math.sin(phiRight);
    const zEdge = halfZ * Math.cos(phiRight) * taperFn(Math.sin(phiRight));

    for (let j = 0; j <= vSteps; j++) {
      let wy: number;
      let wz: number;
      let wx = x;
      if (j <= vHalf) {
        const u = j / vHalf;
        const phi = phiRight + (phiLeft - phiRight) * u;
        const sinP = Math.sin(phi);
        wy = yMid + halfH * sinP;
        wz = halfZ * Math.cos(phi) * taperFn(sinP);
        wx = x - bulge * (1 - sinP * sinP * 0.6);
      } else {
        const u = (j - vHalf) / vHalf;
        const phiBot = phiLeft + (Math.PI + 2 * phiRight) * u;
        const sinP = Math.sin(phiBot);
        const yEl = yMid + halfH * sinP;
        const zEl = halfZ * Math.cos(phiBot) * taperFn(sinP);
        const yPal = yEdge + Math.sin(u * Math.PI) * 0.0035 * kMouth;
        const zPal = (-zEdge + 2 * zEdge * u) * (1 - 0.16 * kMouth);
        wy = yEl + (yPal - yEl) * kMouth;
        wz = zEl + (zPal - zEl) * kMouth;
        wx = x - bulge * (1 - sinP * sinP * 0.6) * (1 - kMouth);
      }
      bPos.push(wx, wy, wz);
      const [tu, tv] = opts.mapUV(wx, wy);
      bUV.push(tu, tv);
    }
  }

  for (let i = 0; i < totalRingCount; i++) {
    for (let j = 0; j < vSteps; j++) {
      const a = i * ringCols + j;
      const b = (i + 1) * ringCols + j;
      const c = (i + 1) * ringCols + (j + 1);
      const d = i * ringCols + (j + 1);
      bIdx.push(a, b, d, b, c, d);
    }
  }

  const backCenter = bPos.length / 3;
  const f0 = evalUnifiedFrame(opts.xStart);
  bPos.push(opts.xStart - (opts.rearBulge ?? 0.003), f0.yMid, 0);
  const [bu0, bv0] = opts.mapUV(opts.xStart, f0.yMid);
  bUV.push(bu0, bv0);
  for (let j = 0; j < vSteps; j++) bIdx.push(backCenter, j, j + 1);

  const frontRingStart = totalRingCount * ringCols;
  const frontCenter = bPos.length / 3;
  const f1 = evalUnifiedFrame(opts.xEnd);
  const yTip = f1.yMid + f1.halfH * Math.sin(f1.phiSeam);
  bPos.push(opts.xEnd, yTip, 0);
  const [fu1, fv1] = opts.mapUV(opts.xEnd, yTip);
  bUV.push(fu1, fv1);
  for (let j = 0; j < vSteps; j++) bIdx.push(frontCenter, frontRingStart + j + 1, frontRingStart + j);

  const bodyGeo = new THREE.BufferGeometry();
  bodyGeo.setAttribute("position", new THREE.Float32BufferAttribute(bPos, 3));
  bodyGeo.setAttribute("uv", new THREE.Float32BufferAttribute(bUV, 2));
  bodyGeo.setIndex(bIdx);
  bodyGeo.computeVertexNormals();

  // Apply exact unified-ellipse outer normals across the hinge transition and upper lip edge
  const bNorm = bodyGeo.getAttribute("normal") as THREE.BufferAttribute;
  for (let i = 0; i <= totalRingCount; i++) {
    const x = ringX[i];
    const phiR = ringPhiRight[i];
    const phiL = Math.PI - phiR;
    // Upper lip & cheek boundary always keeps clean outer normal
    if (x >= opts.xHinge - 0.025) {
      const kSeam = smoothstep(opts.xHinge - 0.025, opts.xHinge, x);
      for (const [jIdx, phi] of [
        [i * ringCols + 0, phiR],
        [i * ringCols + vHalf, phiL],
        [i * ringCols + vSteps, Math.PI * 2 + phiR],
      ] as const) {
        const [nx, ny, nz] = evalOuterNormal(x, phi);
        const bx = bNorm.getX(jIdx) + (nx - bNorm.getX(jIdx)) * kSeam;
        const by = bNorm.getY(jIdx) + (ny - bNorm.getY(jIdx)) * kSeam;
        const bz = bNorm.getZ(jIdx) + (nz - bNorm.getZ(jIdx)) * kSeam;
        const bl = Math.hypot(bx, by, bz) || 1;
        bNorm.setXYZ(jIdx, bx / bl, by / bl, bz / bl);
      }
    }
    // At & just behind xHinge, give the lower-body ring exact outer normals matching lowerJawGeo
    if (x >= opts.xHinge - 0.025 && x <= opts.xHinge + 0.001) {
      const kBlend = smoothstep(opts.xHinge - 0.025, opts.xHinge, x);
      for (let j = vHalf + 1; j < vSteps; j++) {
        const u = (j - vHalf) / vHalf;
        const phi = phiL + (Math.PI + 2 * phiR) * u;
        const [nx, ny, nz] = evalOuterNormal(x, phi);
        const jIdx = i * ringCols + j;
        const bx = bNorm.getX(jIdx) + (nx - bNorm.getX(jIdx)) * kBlend;
        const by = bNorm.getY(jIdx) + (ny - bNorm.getY(jIdx)) * kBlend;
        const bz = bNorm.getZ(jIdx) + (nz - bNorm.getZ(jIdx)) * kBlend;
        const bl = Math.hypot(bx, by, bz) || 1;
        bNorm.setXYZ(jIdx, bx / bl, by / bl, bz / bl);
      }
    }
  }
  bNorm.needsUpdate = true;

  // --- 2. Articulated Lower Jaw sharing exact ring & vHalf vertex layout at x = opts.xHinge ---
  const jVSteps = opts.jawVSteps ? opts.jawVSteps & ~1 : vSteps;
  const jVHalf = jVSteps >> 1;
  const jRingCols = jVSteps + 1;
  const xJ0 = opts.xLowerStart ?? opts.xHinge - 0.018;
  const xJ1 = opts.xLowerEnd ?? opts.xEnd - 0.001;
  const ox = opts.xHinge;
  const oy = opts.jawY;

  const jBackSteps = 4;
  const jFrontSteps = Math.max(16, opts.jawUSteps ?? 20);
  const jRingX: number[] = [];
  for (let i = 0; i <= jBackSteps; i++) {
    jRingX.push(xJ0 + ((opts.xHinge - xJ0) * i) / jBackSteps);
  }
  for (let i = 1; i <= jFrontSteps; i++) {
    const raw = i / jFrontSteps;
    const t = raw < 0.6 ? raw : 0.6 + 0.4 * (1 - Math.pow(1 - (raw - 0.6) / 0.4, 1.45));
    jRingX.push(opts.xHinge + (xJ1 - opts.xHinge) * t);
  }
  const jTotalRings = jRingX.length - 1;

  const lPos: number[] = [];
  const lUV: number[] = [];
  const lIdx: number[] = [];
  const jRingPhi: number[] = [];

  for (let i = 0; i <= jTotalRings; i++) {
    const x = jRingX[i];
    const { yMid, halfH, halfZ, phiSeam } = evalUnifiedFrame(x);
    jRingPhi.push(phiSeam);
    // Exact outer ellipse (1.0) for x >= xHinge, C1 quadratic tuck behind xHinge inside bodyGeo
    const uBack = clamp((opts.xHinge - x) / Math.max(1e-4, opts.xHinge - xJ0), 0, 1);
    const inset = x >= opts.xHinge ? 1.0 : 1.0 - 0.065 * uBack * uBack;

    const phiRight = phiSeam;
    const phiLeft = Math.PI - phiSeam;
    const yEdge = yMid + halfH * Math.sin(phiRight);
    const zEdge = halfZ * Math.cos(phiRight) * taperFn(Math.sin(phiRight));

    for (let j = 0; j <= jVSteps; j++) {
      let wy: number;
      let wz: number;
      if (j <= jVHalf) {
        const u = j / jVHalf;
        wz = zEdge * (1 - 2 * u) * inset;
        wy = yEdge - Math.sin(u * Math.PI) * 0.0015;
      } else {
        const u = (j - jVHalf) / jVHalf;
        const phi = phiLeft + (Math.PI + 2 * phiRight) * u;
        const sinP = Math.sin(phi);
        const yEl = yMid + halfH * sinP;
        wy = yEdge + (yEl - yEdge) * inset;
        wz = halfZ * Math.cos(phi) * taperFn(sinP) * inset;
      }
      lPos.push(x - ox, wy - oy, wz);
      const [tu, tv] = opts.mapUV(x, wy);
      lUV.push(tu, tv);
    }
  }

  for (let i = 0; i < jTotalRings; i++) {
    for (let j = 0; j < jVSteps; j++) {
      const a = i * jRingCols + j;
      const b = (i + 1) * jRingCols + j;
      const c = (i + 1) * jRingCols + (j + 1);
      const d = i * jRingCols + (j + 1);
      lIdx.push(a, b, d, b, c, d);
    }
  }

  const jBackC = lPos.length / 3;
  const fj0 = evalUnifiedFrame(xJ0);
  const yJBackMid = (fj0.yMid + fj0.halfH * Math.sin(fj0.phiSeam) + opts.evalBotY(xJ0)) * 0.5;
  lPos.push(xJ0 - 0.002 - ox, yJBackMid - oy, 0);
  const [jbu, jbv] = opts.mapUV(xJ0, yJBackMid);
  lUV.push(jbu, jbv);
  for (let j = 0; j < jVSteps; j++) lIdx.push(jBackC, j, j + 1);

  const jFrontRS = jTotalRings * jRingCols;
  const jFrontC = lPos.length / 3;
  const fj1 = evalUnifiedFrame(xJ1);
  const yJFrontTip = fj1.yMid + fj1.halfH * Math.sin(fj1.phiSeam);
  lPos.push(xJ1 - ox, yJFrontTip - oy, 0);
  const [jfu, jfv] = opts.mapUV(xJ1, yJFrontTip);
  lUV.push(jfu, jfv);
  for (let j = 0; j < jVSteps; j++) lIdx.push(jFrontC, jFrontRS + j + 1, jFrontRS + j);

  const lowerJawGeo = new THREE.BufferGeometry();
  lowerJawGeo.setAttribute("position", new THREE.Float32BufferAttribute(lPos, 3));
  lowerJawGeo.setAttribute("uv", new THREE.Float32BufferAttribute(lUV, 2));
  lowerJawGeo.setIndex(lIdx);
  lowerJawGeo.computeVertexNormals();

  // Apply the exact same unified-ellipse finite-difference normals on lower lip rim & hinge band
  const lNorm = lowerJawGeo.getAttribute("normal") as THREE.BufferAttribute;
  for (let i = 0; i <= jTotalRings; i++) {
    const x = jRingX[i];
    const phiR = jRingPhi[i];
    const phiL = Math.PI - phiR;
    for (const [jIdx, phi] of [
      [i * jRingCols + 0, phiR],
      [i * jRingCols + jVHalf, phiL],
      [i * jRingCols + jVSteps, Math.PI * 2 + phiR],
    ] as const) {
      const [nx, ny, nz] = evalOuterNormal(x, phi);
      lNorm.setXYZ(jIdx, nx, ny, nz);
    }
    if (x <= opts.xHinge + 0.032) {
      const kBlend = 1 - smoothstep(opts.xHinge, opts.xHinge + 0.032, x);
      for (let j = jVHalf + 1; j < jVSteps; j++) {
        const u = (j - jVHalf) / jVHalf;
        const phi = phiL + (Math.PI + 2 * phiR) * u;
        const [nx, ny, nz] = evalOuterNormal(x, phi);
        const jIdx = i * jRingCols + j;
        const bx = lNorm.getX(jIdx) + (nx - lNorm.getX(jIdx)) * kBlend;
        const by = lNorm.getY(jIdx) + (ny - lNorm.getY(jIdx)) * kBlend;
        const bz = lNorm.getZ(jIdx) + (nz - lNorm.getZ(jIdx)) * kBlend;
        const bl = Math.hypot(bx, by, bz) || 1;
        lNorm.setXYZ(jIdx, bx / bl, by / bl, bz / bl);
      }
    }
  }
  lNorm.needsUpdate = true;

  return { bodyGeo, lowerJawGeo };
}

/**
 * Builds a dense regular-grid dual-sided cushioned fin geometry whose vertices deform
 * smoothly without ExtrudeGeometry triangle facets under spine wave shaders.
 */
export function buildSmoothLoftedFin(opts: {
  xStart: number;
  xEnd: number;
  uSteps?: number;
  vSteps?: number;
  evalTopY: (x: number) => number;
  evalBotY: (x: number) => number;
  maxHalfZ?: number;
}): { geo: THREE.BufferGeometry; bounds: { minX: number; maxX: number; minY: number; maxY: number } } {
  const uSteps = opts.uSteps ?? 38;
  const vSteps = opts.vSteps ?? 12;
  const maxHalfZ = opts.maxHalfZ ?? 0.0042;
  const cols = vSteps + 1;

  let minY = Infinity;
  let maxY = -Infinity;
  const xs: number[] = [];
  const yBots: number[] = [];
  const yTops: number[] = [];
  for (let i = 0; i <= uSteps; i++) {
    // Cosine spacing gives high precision around tail tip (xStart) and dorsal front (xEnd)
    const u = 0.5 * (1 - Math.cos((i / uSteps) * Math.PI));
    const x = opts.xStart + (opts.xEnd - opts.xStart) * u;
    const yb = opts.evalBotY(x);
    const yt = Math.max(yb + 0.001, opts.evalTopY(x));
    xs.push(x);
    yBots.push(yb);
    yTops.push(yt);
    if (yb < minY) minY = yb;
    if (yt > maxY) maxY = yt;
  }
  const padY = 0.004;
  const bMinY = minY - padY;
  const bMaxY = maxY + padY;
  const spanX = Math.max(1e-4, opts.xEnd - opts.xStart);
  const spanY = Math.max(1e-4, bMaxY - bMinY);

  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];

  const pushSide = (sgnZ: 1 | -1) => {
    const base = pos.length / 3;
    for (let i = 0; i <= uSteps; i++) {
      const uRaw = (xs[i] - opts.xStart) / spanX;
      const uEnv = Math.pow(Math.sin(clamp(uRaw, 0, 1) * Math.PI), 0.42);
      for (let j = 0; j <= vSteps; j++) {
        const v = j / vSteps;
        const y = yBots[i] + (yTops[i] - yBots[i]) * v;
        const vEnv = Math.pow(Math.sin(clamp(v, 0, 1) * Math.PI), 0.55);
        const z = sgnZ * maxHalfZ * uEnv * vEnv;
        pos.push(xs[i], y, z);
        uv.push(clamp((xs[i] - opts.xStart) / spanX, 0, 1), clamp((y - bMinY) / spanY, 0, 1));
      }
    }
    for (let i = 0; i < uSteps; i++) {
      for (let j = 0; j < vSteps; j++) {
        const a = base + i * cols + j;
        const b = base + (i + 1) * cols + j;
        const c = base + (i + 1) * cols + (j + 1);
        const d = base + i * cols + (j + 1);
        if (sgnZ > 0) idx.push(a, b, d, b, c, d);
        else idx.push(a, d, b, b, d, c);
      }
    }
  };
  pushSide(1);
  pushSide(-1);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  // Bevel perimeter normals radially in XY so sharp fin rims shade softly and outline extrusion traces cleanly
  const nrm = geo.getAttribute("normal") as THREE.BufferAttribute;
  const ringVerts = (uSteps + 1) * cols;
  for (let sideIdx = 0; sideIdx < 2; sideIdx++) {
    const base = sideIdx * ringVerts;
    const sgnZ = sideIdx === 0 ? 1 : -1;
    for (let i = 0; i <= uSteps; i++) {
      for (let j = 0; j <= vSteps; j++) {
        if (i !== 0 && j !== 0 && j !== vSteps) continue;
        const vIdx = base + i * cols + j;
        let nx = nrm.getX(vIdx) + (i === 0 ? -0.95 : 0);
        let ny = nrm.getY(vIdx) + (j === vSteps ? 0.95 : j === 0 ? -0.95 : 0);
        let nz = nrm.getZ(vIdx) * 0.45 + sgnZ * 0.2;
        const nl = Math.hypot(nx, ny, nz) || 1;
        nrm.setXYZ(vIdx, nx / nl, ny / nl, nz / nl);
      }
    }
  }
  nrm.needsUpdate = true;
  return { geo, bounds: { minX: opts.xStart, maxX: opts.xEnd, minY: bMinY, maxY: bMaxY } };
}

export function makePaintedFinTex(
  maxAnisotropy: number,
  bounds: { minX: number; maxX: number; minY: number; maxY: number },
  drawFn: (ctx: CanvasRenderingContext2D) => void,
  size = 256
): THREE.CanvasTexture {
  const fc = document.createElement("canvas");
  fc.width = size;
  fc.height = size;
  const ctx = fc.getContext("2d")!;
  const spanX = Math.max(1e-4, bounds.maxX - bounds.minX);
  const spanY = Math.max(1e-4, bounds.maxY - bounds.minY);
  ctx.save();
  ctx.scale(size / spanX, -size / spanY);
  ctx.translate(-bounds.minX, -bounds.maxY);
  drawFn(ctx);
  ctx.restore();
  const tex = new THREE.CanvasTexture(fc);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

export function makeSolidRoughnessMap(valHex = "#565656"): THREE.CanvasTexture {
  const cv = document.createElement("canvas");
  cv.width = 64;
  cv.height = 64;
  const c = cv.getContext("2d")!;
  // Remap legacy dark roughness hexes (#40-#68) into soft satin [208..242] so fish don't turn into glossy mirror plastic
  const [r0] = hexRgb(valHex.startsWith("#") ? valHex : "#565656");
  const norm = Math.round(208 + (clamp(r0, 48, 220) - 48) * (34 / 172));
  c.fillStyle = `rgb(${norm},${norm},${norm})`;
  c.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function createExtrudedFin(
  shape: THREE.Shape,
  depth = 0.004,
  bevel = 0.0012,
  curveSegments = 16
): { geo: THREE.BufferGeometry; bounds: { minX: number; maxX: number; minY: number; maxY: number } } {
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel * 0.8,
    bevelSegments: bevel > 0 ? 2 : 1,
    curveSegments,
  });
  geo.translate(0, 0, -depth * 0.5);
  const bounds = normalizeExtrudeUVs(geo);
  return { geo, bounds };
}

export interface SharedRigContext {
  disposables: { dispose: () => void }[];
  track: <T extends { dispose: () => void }>(x: T) => T;
  uniforms: SpineUniforms;
  outlineColor: string;
  roughnessTex: THREE.CanvasTexture;
  makeOutlineMat: (offsetX?: number, offsetY?: number, useSpine?: boolean) => THREE.MeshBasicMaterial;
  makeFishMat: (map: THREE.Texture, extra?: Partial<THREE.MeshPhysicalMaterialParameters>) => THREE.MeshPhysicalMaterial;
}

export function createRigContext(outlineColor: string, roughHex = "#545454"): SharedRigContext {
  const disposables: { dispose: () => void }[] = [];
  const track = <T extends { dispose: () => void }>(x: T): T => {
    disposables.push(x);
    return x;
  };
  const uniforms: SpineUniforms = {
    uTailPh: { value: 0 },
    uSwimAmp: { value: 0.025 },
    uBend: { value: 0 },
    uGulpT: { value: 0 },
    uGulpK: { value: 0 },
    uSquash: { value: 0 },
    uPuff: { value: 0 },
  };
  const roughnessTex = track(makeSolidRoughnessMap(roughHex));
  const makeOutlineMat = (offsetX = 0, offsetY = 0, useSpine = true) => {
    const m = track(
      new THREE.MeshBasicMaterial({
        color: outlineColor,
        side: THREE.BackSide,
      })
    );
    if (useSpine) injectSpineShader(m, uniforms, offsetX, offsetY);
    return m;
  };
  const makeFishMat = (map: THREE.Texture, extra?: Partial<THREE.MeshPhysicalMaterialParameters>) => {
    const rough = extra?.roughness !== undefined ? Math.max(0.76, extra.roughness) : 0.88;
    const coat = extra?.clearcoat !== undefined ? Math.min(0.05, extra.clearcoat) : 0.03;
    const envInt = extra?.envMapIntensity !== undefined ? Math.min(0.1, extra.envMapIntensity) : 0.07;
    const emInt = extra?.emissiveIntensity !== undefined ? Math.min(0.2, extra.emissiveIntensity) : 0.14;
    return track(
      new THREE.MeshPhysicalMaterial({
        map,
        roughnessMap: roughnessTex,
        emissiveMap: map,
        emissive: new THREE.Color("#ffffff"),
        ...extra,
        roughness: rough,
        metalness: 0,
        clearcoat: coat,
        clearcoatRoughness: 0.65,
        envMapIntensity: envInt,
        emissiveIntensity: emInt,
      })
    );
  };
  return { disposables, track, uniforms, outlineColor, roughnessTex, makeOutlineMat, makeFishMat };
}

export interface EyePairOpts {
  ex: number;
  ey: number;
  ez: number;
  er: number;
  sx?: number;
  sy?: number;
  yawRot?: number;
  tiltX?: number;
  tiltZ?: number;
  irisScale?: number;
  pupilScale?: number;
  irisColor: string;
  rimColor: string;
  happyColor?: string;
  lidColor?: string;
  lidTilt?: number;
  orcaDotOnly?: boolean;
}

function buildConformingCapGeo(
  cx: number,
  cy: number,
  radX: number,
  radY: number,
  rx: number,
  ry: number,
  rz: number,
  zLift: number,
  bulge: number,
  side: number,
  segs = 28,
  rings = 5,
  centerRelative = false
): THREE.BufferGeometry {
  const scleraZ = (px: number, py: number) => {
    const q = (px * px) / (rx * rx) + (py * py) / (ry * ry);
    return rz * Math.sqrt(Math.max(0.01, 1 - Math.min(0.99, q)));
  };
  const clampToSclera = (px: number, py: number): Pt => {
    const q = (px * px) / (rx * rx) + (py * py) / (ry * ry);
    if (q <= 0.94) return [px, py];
    const s = Math.sqrt(0.94 / q);
    return [px * s, py * s];
  };

  const z0Ref = centerRelative ? scleraZ(cx, cy) : 0;
  const pos: number[] = [];
  const idx: number[] = [];

  const [cpx, cpy] = clampToSclera(cx, cy);
  pos.push(
    centerRelative ? 0 : cpx,
    centerRelative ? 0 : cpy,
    side * (scleraZ(cpx, cpy) - z0Ref + (centerRelative ? 0 : zLift) + bulge)
  );

  for (let r = 1; r <= rings; r++) {
    const rf = r / rings;
    const b = bulge * (1 - rf * rf);
    for (let a = 0; a <= segs; a++) {
      const ang = (a / segs) * Math.PI * 2;
      const dx = radX * rf * Math.cos(ang);
      const dy = radY * rf * Math.sin(ang);
      const [px, py] = clampToSclera(cx + dx, cy + dy);
      const pz = side * (scleraZ(px, py) - z0Ref + (centerRelative ? 0 : zLift) + b);
      pos.push(centerRelative ? px - cx : px, centerRelative ? py - cy : py, pz);
    }
  }

  const ringStride = segs + 1;
  for (let a = 0; a < segs; a++) {
    const v1 = 1 + a;
    const v2 = 1 + a + 1;
    if (side > 0) idx.push(0, v1, v2);
    else idx.push(0, v2, v1);
  }
  for (let r = 1; r < rings; r++) {
    const row0 = 1 + (r - 1) * ringStride;
    const row1 = 1 + r * ringStride;
    for (let a = 0; a < segs; a++) {
      const a0 = row0 + a;
      const a1 = row0 + a + 1;
      const b0 = row1 + a;
      const b1 = row1 + a + 1;
      if (side > 0) idx.push(a0, b0, b1, a0, b1, a1);
      else idx.push(a0, b1, b0, a0, a1, b1);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

export function createEyePair(
  ctx: SharedRigContext,
  parent: THREE.Object3D,
  opts: EyePairOpts
): {
  eyesNormal: THREE.Group[];
  eyesPupil: THREE.Mesh[];
  eyesHappy: THREE.Group[];
} {
  const { track } = ctx;
  const sx = opts.sx ?? 0.9;
  const sy = opts.sy ?? 1.02;
  const er = opts.er;
  const rx = er * sx;
  const ry = er * sy;
  const rz = er * 0.25;

  const rimMat = track(new THREE.MeshBasicMaterial({ color: opts.rimColor }));
  const scleraMat = track(
    new THREE.MeshPhysicalMaterial({
      color: "#ffffff",
      emissive: "#ffffff",
      emissiveIntensity: 0.34,
      roughness: 0.44,
      clearcoat: 0.03,
      clearcoatRoughness: 0.55,
      envMapIntensity: 0.06,
    })
  );
  const irisMat = track(
    new THREE.MeshPhysicalMaterial({
      color: opts.irisColor,
      emissive: opts.irisColor,
      emissiveIntensity: 0.26,
      roughness: 0.36,
      clearcoat: 0.05,
      clearcoatRoughness: 0.5,
      envMapIntensity: 0.06,
    })
  );
  const pupilMat = track(new THREE.MeshBasicMaterial({ color: "#070b18" }));
  const glintMat = track(new THREE.MeshBasicMaterial({ color: "#ffffff" }));
  const happyMat = track(new THREE.MeshBasicMaterial({ color: opts.happyColor || opts.rimColor }));

  const irisFrac = opts.irisScale ?? 0.58;
  const pupilFrac = opts.pupilScale ?? 0.36;
  const scleraGeo = track(new THREE.SphereGeometry(er, 24, 18));
  scleraGeo.scale(sx, sy, 0.25);
  // Crisp circular outline collar extending behind eyeball into cheek (zero gap, full round sclera)
  const rimGeo = track(new THREE.SphereGeometry(er * 1.042, 24, 16));
  rimGeo.scale(sx, sy, 0.24);

  const happyCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-er * 0.72, -er * 0.18, 0),
    new THREE.Vector3(-er * 0.3, er * 0.36, er * 0.09),
    new THREE.Vector3(er * 0.3, er * 0.36, er * 0.09),
    new THREE.Vector3(er * 0.72, -er * 0.18, 0),
  ]);
  const happyGeo = track(new THREE.TubeGeometry(happyCurve, 12, Math.max(0.0022, er * 0.11), 8, false));

  let lidGeo: THREE.BufferGeometry | null = null;
  let lidMat: THREE.MeshPhysicalMaterial | null = null;
  if (opts.lidColor) {
    lidGeo = track(new THREE.SphereGeometry(er * 1.055, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.42));
    lidGeo.scale(sx * 1.01, sy * 0.96, 0.26);
    lidMat = track(
      new THREE.MeshPhysicalMaterial({
        color: opts.lidColor,
        emissive: opts.lidColor,
        emissiveIntensity: 0.12,
        roughness: 0.78,
        clearcoat: 0.03,
        envMapIntensity: 0.07,
      })
    );
  }

  const lookX = er * 0.14;
  const lookY = er * 0.01;
  const scleraZAtCenter = rz * Math.sqrt(Math.max(0.05, 1 - (lookX * lookX) / (rx * rx) - (lookY * lookY) / (ry * ry)));

  const eyesNormal: THREE.Group[] = [];
  const eyesPupil: THREE.Mesh[] = [];
  const eyesHappy: THREE.Group[] = [];

  for (const side of [1, -1]) {
    const eyeSocket = new THREE.Group();
    eyeSocket.position.set(opts.ex, opts.ey, side * Math.max(0.005, opts.ez));
    eyeSocket.rotation.y = side * (opts.yawRot ?? 0.22);
    if (opts.tiltX) eyeSocket.rotation.x = -side * opts.tiltX;
    if (opts.tiltZ) eyeSocket.rotation.z = opts.tiltZ;
    parent.add(eyeSocket);

    const normalEye = new THREE.Group();
    if (opts.orcaDotOnly) {
      const darkBall = new THREE.Mesh(scleraGeo, pupilMat);
      const glGeo = track(
        buildConformingCapGeo(er * 0.22, er * 0.22, er * 0.18, er * 0.18, rx, ry, rz, 0.0012, er * 0.004, side, 16, 2)
      );
      const gl = new THREE.Mesh(glGeo, glintMat);
      normalEye.add(darkBall, gl);
      eyesPupil.push(darkBall);
    } else {
      const rim = new THREE.Mesh(rimGeo, rimMat);
      rim.position.z = -side * er * 0.055;
      const sclera = new THREE.Mesh(scleraGeo, scleraMat);

      // Sclera-conforming iris, pupil & catchlights: mathematically impossible for white sclera to clip over bottom of iris!
      const irisGeo = track(
        buildConformingCapGeo(
          lookX,
          lookY,
          er * irisFrac * sx,
          er * irisFrac * sy,
          rx,
          ry,
          rz,
          0.0014,
          er * 0.010,
          side,
          28,
          5
        )
      );
      const iris = new THREE.Mesh(irisGeo, irisMat);

      const pupilGeo = track(
        buildConformingCapGeo(
          lookX,
          lookY,
          er * pupilFrac * sx,
          er * pupilFrac * sy,
          rx,
          ry,
          rz,
          0.0028,
          er * 0.014,
          side,
          24,
          4,
          true
        )
      );
      const pupil = new THREE.Mesh(pupilGeo, pupilMat);
      pupil.position.set(lookX * 1.02, lookY, side * (scleraZAtCenter + 0.0028));

      const g1Geo = track(
        buildConformingCapGeo(
          lookX - er * 0.14,
          lookY + er * 0.22,
          er * 0.15,
          er * 0.15,
          rx,
          ry,
          rz,
          0.0038,
          er * 0.015,
          side,
          16,
          2
        )
      );
      const g2Geo = track(
        buildConformingCapGeo(
          lookX + er * 0.16,
          lookY - er * 0.17,
          er * 0.075,
          er * 0.075,
          rx,
          ry,
          rz,
          0.0038,
          er * 0.015,
          side,
          14,
          2
        )
      );
      const g1 = new THREE.Mesh(g1Geo, glintMat);
      const g2 = new THREE.Mesh(g2Geo, glintMat);

      normalEye.add(rim, sclera, iris, pupil, g1, g2);
      if (lidGeo && lidMat) {
        const lid = new THREE.Mesh(lidGeo, lidMat);
        lid.position.set(0, er * 0.08, side * er * 0.04);
        lid.rotation.z = opts.lidTilt ?? -0.24;
        normalEye.add(lid);
      }
      eyesPupil.push(pupil);
    }

    const happyEye = new THREE.Group();
    const hArc = new THREE.Mesh(happyGeo, happyMat);
    if (side < 0) hArc.scale.z = -1;
    hArc.position.z = side * Math.max(0.004, rz * 0.9);
    happyEye.add(hArc);
    happyEye.visible = false;

    eyeSocket.add(normalEye, happyEye);
    eyesNormal.push(normalEye);
    eyesHappy.push(happyEye);
  }

  return { eyesNormal, eyesPupil, eyesHappy };
}

export function createOralParts(
  ctx: SharedRigContext,
  bodyGroup: THREE.Group,
  lowerJawGroup: THREE.Group,
  hx: number,
  hy: number,
  cavityCol = "#521224",
  tongueCol = "#eb6c8e",
  cavSize: [number, number, number] = [0.038, 0.032, 0.025],
  tongueSize: [number, number, number] = [0.03, 0.011, 0.017],
  tongueX = 0.036
): { mouthInterior: THREE.Group; tongueMesh: THREE.Mesh } {
  const { track } = ctx;
  const mouthInterior = new THREE.Group();
  mouthInterior.position.set(hx + 0.004, hy, 0);
  bodyGroup.add(mouthInterior);

  const cavityMat = track(
    new THREE.MeshStandardMaterial({
      color: cavityCol,
      emissive: mixHex(cavityCol, "#000000", 0.55),
      emissiveIntensity: 0.35,
      roughness: 0.72,
      side: THREE.DoubleSide,
    })
  );
  const cavityGeo = track(new THREE.SphereGeometry(1, 14, 10));
  cavityGeo.scale(cavSize[0], cavSize[1], cavSize[2]);
  const cavityMesh = new THREE.Mesh(cavityGeo, cavityMat);
  cavityMesh.position.set(cavSize[0] * 0.25, 0, 0);
  mouthInterior.add(cavityMesh);

  const tongueMat = track(
    new THREE.MeshPhysicalMaterial({
      color: tongueCol,
      emissive: tongueCol,
      emissiveIntensity: 0.14,
      roughness: 0.56,
      clearcoat: 0.08,
      clearcoatRoughness: 0.5,
      envMapIntensity: 0.07,
    })
  );
  const tongueGeo = track(new THREE.SphereGeometry(1, 14, 10));
  tongueGeo.scale(tongueSize[0], tongueSize[1], tongueSize[2]);
  const tongueMesh = new THREE.Mesh(tongueGeo, tongueMat);
  tongueMesh.position.set(tongueX, 0.002, 0);
  lowerJawGroup.add(tongueMesh);

  return { mouthInterior, tongueMesh };
}

export function createBiteRing(
  ctx: SharedRigContext,
  bodyGroup: THREE.Group,
  x: number,
  y: number,
  color = "#d8f8ff",
  radius = 0.055
) {
  const { track } = ctx;
  const geo = track(new THREE.TorusGeometry(radius, Math.max(0.004, radius * 0.11), 8, 22));
  const mat = track(
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    })
  );
  const ring = new THREE.Mesh(geo, mat);
  ring.position.set(x, y, 0);
  ring.rotation.y = Math.PI * 0.5;
  ring.visible = false;
  bodyGroup.add(ring);
  return { biteRing: ring, biteRingMat: mat };
}

export function baseGroups() {
  const root = new THREE.Group();
  const pitchGroup = new THREE.Group();
  const yawGroup = new THREE.Group();
  const bodyGroup = new THREE.Group();
  root.add(pitchGroup);
  pitchGroup.add(yawGroup);
  yawGroup.add(bodyGroup);
  return { root, pitchGroup, yawGroup, bodyGroup };
}

export function addToothConeRow(
  parent: THREE.Object3D,
  track: <T extends { dispose: () => void }>(x: T) => T,
  count: number,
  xStart: number,
  xEnd: number,
  yFn: (t: number) => number,
  zFn: (t: number) => number,
  baseR: number,
  height: number,
  pointUp: boolean,
  mat: THREE.Material,
  tiltZ = 0
) {
  const geo = track(new THREE.ConeGeometry(baseR, height, 6));
  for (let i = 0; i < count; i++) {
    const t = count <= 1 ? 0.5 : i / (count - 1);
    const x = xStart + (xEnd - xStart) * t;
    const y = yFn(t);
    const zAbs = zFn(t);
    const sides = zAbs > 0.003 ? [1, -1] : [0];
    for (const s of sides) {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, s * zAbs);
      m.rotation.z = (pointUp ? 0 : Math.PI) + tiltZ;
      parent.add(m);
    }
  }
}

export function makeSpineFinMesh(
  ctx: SharedRigContext,
  shape: THREE.Shape,
  offsetX: number,
  offsetY: number,
  depth: number,
  bevel: number,
  drawTex: (c: CanvasRenderingContext2D, bounds: { minX: number; maxX: number; minY: number; maxY: number }) => void,
  maxAnisotropy: number,
  useSpine = true,
  outlineSize = 0.0028,
  extraMat?: Partial<THREE.MeshPhysicalMaterialParameters>,
  outlineMask?: (x: number, y: number, z: number) => number
) {
  const { geo, bounds } = createExtrudedFin(shape, depth, bevel, 16);
  ctx.track(geo);
  const tex = ctx.track(makePaintedFinTex(maxAnisotropy, bounds, (c) => drawTex(c, bounds), 256));
  const mat = ctx.makeFishMat(tex, extraMat);
  if (useSpine) injectSpineShader(mat, ctx.uniforms, offsetX, offsetY);
  const mesh = new THREE.Mesh(geo, mat);
  if (outlineSize > 0) {
    const olGeo = ctx.track(buildOutlineGeometry(geo, outlineSize, outlineMask));
    const olMesh = new THREE.Mesh(olGeo, ctx.makeOutlineMat(offsetX, offsetY, useSpine));
    mesh.add(olMesh);
  }
  return { mesh, geo, tex, mat, bounds };
}

export function applyStandardBodyColors(
  c: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  stops: [number, string][]
) {
  c.fillStyle = makeLin(c, x0, y0, x1, y1, stops);
  c.fillRect(-1.2, -1.2, 2.4, 2.4);
}

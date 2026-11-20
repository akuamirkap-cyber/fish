import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { EyeExpr } from "./sprites";

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

// Probe GPU renderer string once to guard software WebGL (SwiftShader / llvmpipe / WARP)
let _isSoftwareGl: boolean | null = null;
export function isSoftwareWebGL(): boolean {
  if (_isSoftwareGl !== null) return _isSoftwareGl;
  if (typeof document === "undefined") {
    _isSoftwareGl = true;
    return true;
  }
  try {
    const gl = document.createElement("canvas").getContext("webgl2");
    if (!gl) {
      _isSoftwareGl = true;
      return true;
    }
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || "");
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    _isSoftwareGl = /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    _isSoftwareGl = true;
  }
  return _isSoftwareGl;
}

export interface Boris3DPose {
  jaw: number;
  chompPhase: number;
  chompDur: number;
  chompBitFired: boolean;
  biteLunge: number;
  tailPh: number;
  wag2: number;
  bend: number;
  turnFlip: number;
  tilt: number;
  gulpT: number;
  gulpK: number;
  sq: number;
  expr: EyeExpr;
  puff: boolean;
  sucking: boolean;
  swimSpeed: number;
  depthFactor?: number;
  inspectYaw?: number;
  inspectPitch?: number;
}

export interface SpineUniforms {
  uTailPh: { value: number };
  uSwimAmp: { value: number };
  uBend: { value: number };
  uGulpT: { value: number };
  uGulpK: { value: number };
  uSquash: { value: number };
  uPuff: { value: number };
}

export interface Boris3DRig {
  root: THREE.Group;
  pitchGroup: THREE.Group;
  yawGroup: THREE.Group;
  bodyGroup: THREE.Group;
  upperJawGroup: THREE.Group;
  lowerJawGroup: THREE.Group;
  mouthInterior: THREE.Group;
  tongueMesh: THREE.Mesh;
  tailPivot: THREE.Group;
  pecLeft: THREE.Group;
  pecRight: THREE.Group;
  pelvicFin: THREE.Group;
  eyesNormal: THREE.Group[];
  eyesPupil: THREE.Mesh[];
  eyesHappy: THREE.Group[];
  biteRing: THREE.Mesh;
  biteRingMat: THREE.MeshBasicMaterial;
  uniforms: SpineUniforms;
  dispose: () => void;
}

// =====================================================================================
// EXACT 2D drawBoris PROFILE SAMPLING (converted from 2D sprite space to 3D +Y up)
// drawBoris applies c.translate(-0.01, 0.005); in 3D: x3 = x2 - 0.01, y3 = -(y2 + 0.005)
// =====================================================================================
const HX = 0.262; // 0.272 - 0.01
const HY = -0.087; // -(0.082 + 0.005)
const UX_TIP = 0.3636;
const UY_TIP = -0.080;
const LX_TIP = 0.331;
const LY_TIP = -0.0905;

type Pt = [number, number];

export function cubicPt(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const t2 = t * t;
  const a = mt2 * mt;
  const b = 3 * mt2 * t;
  const c = 3 * mt * t2;
  const d = t2 * t;
  return [a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]];
}

export function quadPt(p0: Pt, p1: Pt, p2: Pt, t: number): Pt {
  const mt = 1 - t;
  return [mt * mt * p0[0] + 2 * mt * t * p1[0] + t * t * p2[0], mt * mt * p0[1] + 2 * mt * t * p1[1] + t * t * p2[1]];
}

// Convert drawBoris 2D point to 3D centered point
const to3D = (x2: number, y2: number): Pt => [x2 - 0.01, -(y2 + 0.005)];

const TOP_SEGS: [Pt, Pt, Pt, Pt][] = [
  [to3D(-0.226, 0.018), to3D(-0.242, -0.105), to3D(-0.205, -0.225), to3D(-0.095, -0.242)],
  [to3D(-0.095, -0.242), to3D(0.015, -0.258), to3D(0.13, -0.215), to3D(0.195, -0.145)],
  [to3D(0.195, -0.145), to3D(0.245, -0.092), to3D(0.272, -0.008), to3D(0.312, 0.044)],
  [to3D(0.312, 0.044), to3D(0.345, 0.056), to3D(0.368, 0.062), [UX_TIP, UY_TIP]],
];

const BOT_CUBICS: [Pt, Pt, Pt, Pt][] = [
  [to3D(0.341, 0.0955), to3D(0.313, 0.1295), to3D(0.225, 0.175), to3D(0.115, 0.222)],
  [to3D(0.115, 0.222), to3D(-0.02, 0.252), to3D(-0.16, 0.222), to3D(-0.218, 0.138)],
];
const BOT_QUAD: [Pt, Pt, Pt] = [to3D(-0.218, 0.138), to3D(-0.236, 0.098), to3D(-0.226, 0.065)];

function buildCurveSamples(): { top: Pt[]; bot: Pt[] } {
  const top: Pt[] = [];
  for (let s = 0; s < TOP_SEGS.length; s++) {
    const [p0, p1, p2, p3] = TOP_SEGS[s];
    const n = 40;
    for (let i = 0; i <= n; i++) {
      if (s > 0 && i === 0) continue;
      top.push(cubicPt(p0, p1, p2, p3, i / n));
    }
  }
  const bot: Pt[] = [];
  // Order bottom samples rear -> front (-0.236 to +0.331)
  for (let i = 0; i <= 24; i++) {
    bot.push(quadPt(BOT_QUAD[2], BOT_QUAD[1], BOT_QUAD[0], i / 24));
  }
  for (let s = BOT_CUBICS.length - 1; s >= 0; s--) {
    const [p0, p1, p2, p3] = BOT_CUBICS[s];
    for (let i = 1; i <= 44; i++) {
      bot.push(cubicPt(p3, p2, p1, p0, i / 44));
    }
  }
  return { top, bot };
}

const CURVE_SAMPLES = buildCurveSamples();

export function interpCurveY(pts: Pt[], x: number): number {
  if (x <= pts[0][0]) return pts[0][1];
  const last = pts[pts.length - 1];
  if (x >= last[0]) return last[1];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (b[0] >= x && a[0] <= x) {
      const span = b[0] - a[0];
      const t = span > 1e-6 ? (x - a[0]) / span : 0;
      return a[1] + (b[1] - a[1]) * t;
    }
  }
  return last[1];
}

// Mouth seam Y(x) matching drawBoris closed smiling/pouting seam (x in [0.246, UX_TIP])
function evalMouthSeamY(x: number): number {
  if (x <= LX_TIP) {
    const u = clamp((x - HX) / (LX_TIP - HX), 0, 1);
    // Gentle smiling curve dipping slightly mid-mouth then rising toward lip
    return HY - Math.sin(u * Math.PI) * 0.008 - u * 0.004;
  }
  const u = clamp((x - LX_TIP) / (UX_TIP - LX_TIP), 0, 1);
  const base = HY - 0.004;
  return base + (-0.096 - base) * Math.pow(u, 1.4);
}

// Anatomical 3D body thickness (plump butterflyfish lens shape)
function evalBodyHalfZ(x: number): number {
  const u = clamp((x - -0.236) / (UX_TIP - -0.236), 0, 1);
  const arch = Math.sin(clamp(u, 0.015, 0.985) * Math.PI);
  return 0.016 + 0.088 * Math.pow(arch, 0.6) * (1 - 0.2 * u);
}

function mapWorldUV(x: number, y: number): [number, number] {
  return [clamp((x - -0.3) / 0.7, 0, 1), clamp((y - -0.28) / 0.56, 0, 1)];
}

function smoothstepLocal(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

// Sculpted continuous body + cranium + upper snout from rear peduncle (-0.236) to UX_TIP
function buildBorisBodyGeometry(): THREE.BufferGeometry {
  const uSteps = 56;
  const vSteps = 32;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const ringCols = vSteps + 1;

  const xStart = -0.236;
  const xEnd = UX_TIP;

  const evalUnifiedBotY = (x: number): number => {
    if (x <= HX - 0.032) return interpCurveY(CURVE_SAMPLES.bot, x);
    if (x >= HX + 0.014) return evalMouthSeamY(x);
    const k = smoothstepLocal(HX - 0.032, HX + 0.014, x);
    const b = interpCurveY(CURVE_SAMPLES.bot, x);
    const p = evalMouthSeamY(x);
    return b + (p - b) * k;
  };

  for (let i = 0; i <= uSteps; i++) {
    const t = i / uSteps;
    const x = xStart + (xEnd - xStart) * t;
    let yTop = interpCurveY(CURVE_SAMPLES.top, x);
    let yBot = evalUnifiedBotY(x);

    if (t > 0.85) {
      const tipK = (t - 0.85) / 0.15;
      const mid = (yTop + yBot) * 0.5;
      const shrink = Math.sqrt(Math.max(0.04, 1 - tipK * tipK * 0.92));
      const half = Math.max(0.002, (yTop - yBot) * 0.5 * shrink);
      yTop = mid + half;
      yBot = mid - half;
    }

    const yMid = (yTop + yBot) * 0.5;
    const halfH = Math.max(0.0025, (yTop - yBot) * 0.5);
    const halfZ = evalBodyHalfZ(x);

    // Subtle rounded rear butt bulge matching drawBoris (-0.242 curve)
    const rearBulge = t < 0.14 ? Math.sin((1 - t / 0.14) * Math.PI * 0.5) * 0.007 : 0;

    for (let j = 0; j <= vSteps; j++) {
      const phi = (j / vSteps) * Math.PI * 2;
      const sinP = Math.sin(phi);
      const cosP = Math.cos(phi);
      // Sleek compressed butterflyfish cross-section: gently tapered dorsal crest, plump cheeks
      const taper = 1 - 0.26 * Math.pow(Math.abs(sinP), 1.55);
      const y = yMid + halfH * sinP;
      const z = halfZ * cosP * taper;
      const vx = x - rearBulge * (1 - sinP * sinP * 0.6);
      positions.push(vx, y, z);

      const [tu, tv] = mapWorldUV(vx, y);
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

  // Cap rear caudal peduncle (normal -X outward)
  const backCenter = positions.length / 3;
  const yt0 = interpCurveY(CURVE_SAMPLES.top, xStart);
  const yb0 = interpCurveY(CURVE_SAMPLES.bot, xStart);
  const ym0 = (yt0 + yb0) * 0.5;
  positions.push(xStart - 0.008, ym0, 0);
  const [bu, bv] = mapWorldUV(xStart - 0.008, ym0);
  uvs.push(bu, bv);
  for (let j = 0; j < vSteps; j++) {
    indices.push(backCenter, j, j + 1);
  }

  // Cap front snout tip (normal +X outward)
  const frontRingStart = uSteps * ringCols;
  const frontCenter = positions.length / 3;
  const yt1 = interpCurveY(CURVE_SAMPLES.top, xEnd);
  const yb1 = evalMouthSeamY(xEnd);
  const ym1 = (yt1 + yb1) * 0.5;
  positions.push(xEnd + 0.002, ym1, 0);
  const [fu, fv] = mapWorldUV(xEnd, ym1);
  uvs.push(fu, fv);
  for (let j = 0; j < vSteps; j++) {
    indices.push(frontCenter, frontRingStart + j + 1, frontRingStart + j);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

// Sculpted lower jaw mesh matching EXACT drawBoris bezier curves & flank UVs
function buildBorisJawPartGeometry(part: "upper" | "lower"): THREE.BufferGeometry {
  const uSteps = 18;
  const vSteps = 24;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const ringCols = vSteps + 1;

  // Overlap slightly inside cheek (HX - 0.018) so opening jaws never exposes a seam gap
  const xStart = HX - 0.018;
  const xEnd = part === "upper" ? UX_TIP : LX_TIP;

  for (let i = 0; i <= uSteps; i++) {
    const t = i / uSteps;
    const x = xStart + (xEnd - xStart) * t;
    const seamY = evalMouthSeamY(x);
    let yTop: number;
    let yBot: number;

    if (part === "upper") {
      yTop = interpCurveY(CURVE_SAMPLES.top, x);
      yBot = seamY;
      // Smoothly round snout nose tip at the very end
      if (t > 0.85) {
        const tipK = (t - 0.85) / 0.15;
        const mid = (yTop + yBot) * 0.5;
        const shrink = Math.sqrt(Math.max(0.04, 1 - tipK * tipK * 0.92));
        const half = Math.max(0.002, (yTop - yBot) * 0.5 * shrink);
        yTop = mid + half;
        yBot = mid - half;
      }
    } else {
      yTop = seamY - 0.0015;
      yBot = interpCurveY(CURVE_SAMPLES.bot, x);
      if (t > 0.82) {
        const tipK = (t - 0.82) / 0.18;
        const mid = (yTop + yBot) * 0.5;
        const shrink = Math.sqrt(Math.max(0.04, 1 - tipK * tipK * 0.92));
        const half = Math.max(0.002, (yTop - yBot) * 0.5 * shrink);
        yTop = mid + half;
        yBot = mid - half;
      }
    }

    if (yTop < yBot + 0.003) {
      const m = (yTop + yBot) * 0.5;
      yTop = m + 0.0015;
      yBot = m - 0.0015;
    }

    const yMid = (yTop + yBot) * 0.5;
    const halfH = (yTop - yBot) * 0.5;
    // Tuck rear hinge plug cleanly inside cheek so neither jaw nor outline shows a seam behind HX
    const rearInset = x < HX ? 0.78 + 0.16 * clamp((x - xStart) / (HX - xStart), 0, 1) : x < HX + 0.012 ? 0.94 + 0.06 * ((x - HX) / 0.012) : 1.0;
    const halfZ = evalBodyHalfZ(x) * rearInset;

    for (let j = 0; j <= vSteps; j++) {
      const phi = (j / vSteps) * Math.PI * 2;
      const sinP = Math.sin(phi);
      const cosP = Math.cos(phi);
      const taper = 1 - 0.18 * sinP * sinP;
      const worldX = x;
      const worldY = yMid + halfH * sinP;
      const z = halfZ * cosP * taper;

      // Local coordinates relative to jaw hinge (HX, HY, 0)
      positions.push(worldX - HX, worldY - HY, z);
      const [tu, tv] = mapWorldUV(worldX, worldY);
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

  // Cap front tip & rear hinge plug cleanly
  const backCenter = positions.length / 3;
  const bm = ((part === "upper" ? interpCurveY(CURVE_SAMPLES.top, xStart) : evalMouthSeamY(xStart)) +
    (part === "upper" ? evalMouthSeamY(xStart) : interpCurveY(CURVE_SAMPLES.bot, xStart))) * 0.5;
  positions.push(xStart - HX - 0.002, bm - HY, 0);
  const [bu, bv] = mapWorldUV(xStart, bm);
  uvs.push(bu, bv);
  for (let j = 0; j < vSteps; j++) {
    indices.push(backCenter, j, j + 1);
  }

  const frontRingStart = uSteps * ringCols;
  const frontCenter = positions.length / 3;
  const tipY = part === "upper" ? UY_TIP : LY_TIP;
  positions.push(xEnd - HX + 0.002, tipY - HY, 0);
  const [fu, fv] = mapWorldUV(xEnd, tipY);
  uvs.push(fu, fv);
  for (let j = 0; j < vSteps; j++) {
    indices.push(frontCenter, frontRingStart + j + 1, frontRingStart + j);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

// Create inverted-hull outline geometry extruded cleanly along smoothed vertex normals
export function buildOutlineGeometry(
  srcGeo: THREE.BufferGeometry,
  thickness: number,
  maskFn?: (x: number, y: number, z: number) => number
): THREE.BufferGeometry {
  const geo = srcGeo.clone();
  const pos = geo.attributes.position;
  const norm = geo.attributes.normal;
  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i);
    const py = pos.getY(i);
    const pz = pos.getZ(i);
    const m = maskFn ? maskFn(px, py, pz) : 1;
    const t = thickness * m;
    pos.setXYZ(i, px + norm.getX(i) * t, py + norm.getY(i) * t, pz + norm.getZ(i) * t);
  }
  pos.needsUpdate = true;
  return geo;
}

// Normalize ExtrudeGeometry UVs cleanly to [0..1] across X/Y bounds so painted fin CanvasTextures align 1:1!
export function normalizeExtrudeUVs(geo: THREE.BufferGeometry): { minX: number; maxX: number; minY: number; maxY: number } {
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const spanX = Math.max(1e-5, maxX - minX);
  const spanY = Math.max(1e-5, maxY - minY);
  for (let i = 0; i < pos.count; i++) {
    uv.setXY(i, (pos.getX(i) - minX) / spanX, (pos.getY(i) - minY) / spanY);
  }
  uv.needsUpdate = true;
  return { minX, maxX, minY, maxY };
}

// Paint exact 2D drawBoris artwork onto flank & fin CanvasTextures
function createBorisTextures(
  maxAnisotropy: number,
  dorsalBounds: { minX: number; maxX: number; minY: number; maxY: number },
  analBounds: { minX: number; maxX: number; minY: number; maxY: number },
  tailBounds: { minX: number; maxX: number; minY: number; maxY: number },
  pelvBounds: { minX: number; maxX: number; minY: number; maxY: number },
  pecBounds: { minX: number; maxX: number; minY: number; maxY: number }
): {
  albedo: THREE.CanvasTexture;
  roughness: THREE.CanvasTexture;
  dorsalTex: THREE.CanvasTexture;
  analTex: THREE.CanvasTexture;
  tailTex: THREE.CanvasTexture;
  pelvTex: THREE.CanvasTexture;
  pecTex: THREE.CanvasTexture;
} {
  // 1. Flank Albedo matching drawBoris EXACTLY (using exact drawBoris coords shifted by -0.01, +0.005)
  const W = 512;
  const H = 512;
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const c = cv.getContext("2d")!;

  c.save();
  c.translate((0.3 / 0.7) * W, 0.5 * H);
  c.scale(W / 0.7, H / 0.56);
  c.translate(-0.01, 0.005);

  // Base ice-blue -> sky-aqua -> creamy belly gradient (from drawBoris!)
  const bodyGrad = c.createLinearGradient(-0.05, -0.24, 0.05, 0.24);
  bodyGrad.addColorStop(0, "#7ab4e6");
  bodyGrad.addColorStop(0.35, "#d8f5ff");
  bodyGrad.addColorStop(0.72, "#e8faff");
  bodyGrad.addColorStop(1, "#7ab4e6");
  c.fillStyle = bodyGrad;
  c.fillRect(-0.35, -0.32, 0.85, 0.64);

  // Soft subtle blue rib lines across flank
  c.strokeStyle = "rgba(91, 155, 213, 0.26)";
  c.lineWidth = 0.0075;
  for (let i = -4; i <= 3; i++) {
    const u = i * 0.042;
    c.beginPath();
    c.moveTo(u + 0.015, -0.25);
    c.quadraticCurveTo(u - 0.028, 0.0, u + 0.01, 0.25);
    c.stroke();
  }

  // Sky-blue shading over forehead & snout bridge
  const snGrad = c.createRadialGradient(0.27, -0.02, 0.01, 0.27, -0.02, 0.13);
  snGrad.addColorStop(0, "rgba(76, 126, 216, 0.55)");
  snGrad.addColorStop(0.65, "rgba(76, 126, 216, 0.18)");
  snGrad.addColorStop(1, "rgba(76, 126, 216, 0)");
  c.fillStyle = snGrad;
  c.beginPath();
  c.arc(0.27, -0.02, 0.13, 0, Math.PI * 2);
  c.fill();

  // Vertical dark navy eye band covering eye down to throat
  c.fillStyle = "#16245c";
  c.beginPath();
  c.moveTo(0.215, -0.28);
  c.bezierCurveTo(0.248, -0.08, 0.244, 0.08, 0.205, 0.28);
  c.lineTo(0.148, 0.28);
  c.bezierCurveTo(0.185, 0.07, 0.185, -0.09, 0.158, -0.28);
  c.closePath();
  c.fill();

  // Two royal-blue S-curved saddle patches (exact drawBoris!)
  const drawPatch = (build: () => void) => {
    c.beginPath();
    build();
    c.closePath();
    const pg = c.createLinearGradient(0, -0.2, 0, 0.15);
    pg.addColorStop(0, "#3b65d4");
    pg.addColorStop(0.5, "#2e52b2");
    pg.addColorStop(1, "#1e3a88");
    c.fillStyle = pg;
    c.fill();
    c.strokeStyle = "#16245c";
    c.lineWidth = 0.0085;
    c.stroke();
  };

  drawPatch(() => {
    c.moveTo(0.118, -0.26);
    c.bezierCurveTo(0.145, -0.15, 0.085, -0.08, 0.092, 0.005);
    c.bezierCurveTo(0.1, 0.09, 0.092, 0.165, 0.045, 0.172);
    c.bezierCurveTo(-0.005, 0.175, 0.015, 0.085, 0.01, 0.005);
    c.bezierCurveTo(0.005, -0.075, -0.045, -0.15, 0.0, -0.26);
  });

  drawPatch(() => {
    c.moveTo(-0.045, -0.26);
    c.bezierCurveTo(-0.015, -0.13, -0.045, -0.03, -0.032, 0.065);
    c.bezierCurveTo(-0.02, 0.15, -0.085, 0.19, -0.145, 0.165);
    c.bezierCurveTo(-0.205, 0.14, -0.215, 0.01, -0.195, -0.115);
    c.bezierCurveTo(-0.18, -0.205, -0.095, -0.265, -0.045, -0.26);
  });

  // Big royal-blue spot at tail peduncle
  c.beginPath();
  c.arc(-0.222, 0.042, 0.036, 0, Math.PI * 2);
  c.fillStyle = "#0e32ba";
  c.fill();
  c.strokeStyle = "#142258";
  c.lineWidth = 0.008;
  c.stroke();

  const spotGl = c.createRadialGradient(-0.228, 0.032, 0.001, -0.228, 0.032, 0.014);
  spotGl.addColorStop(0, "rgba(155, 210, 255, 0.72)");
  spotGl.addColorStop(1, "rgba(155, 210, 255, 0)");
  c.fillStyle = spotGl;
  c.beginPath();
  c.arc(-0.228, 0.032, 0.014, 0, Math.PI * 2);
  c.fill();

  // Crisp smiling mouth seam along closed lip line (world x in [0.272..0.341], y ~ 0.082..0.09)
  c.strokeStyle = "#13214a";
  c.lineWidth = 0.0075;
  c.lineCap = "round";
  c.beginPath();
  c.moveTo(0.344, 0.089);
  c.quadraticCurveTo(0.308, 0.098, 0.272, 0.082);
  c.stroke();

  c.restore();

  const albedo = new THREE.CanvasTexture(cv);
  albedo.colorSpace = THREE.SRGBColorSpace;
  albedo.anisotropy = maxAnisotropy;
  albedo.needsUpdate = true;

  // 2. Smooth glossy roughness map
  const rCv = document.createElement("canvas");
  rCv.width = 256;
  rCv.height = 256;
  const rc = rCv.getContext("2d")!;
  rc.fillStyle = "#565656";
  rc.fillRect(0, 0, 256, 256);
  const roughness = new THREE.CanvasTexture(rCv);
  roughness.colorSpace = THREE.NoColorSpace;
  roughness.needsUpdate = true;

  // Helper to paint an exact 3D-space fin texture aligned with ExtrudeGeometry normalized UVs
  const makeFinTex = (
    bounds: { minX: number; maxX: number; minY: number; maxY: number },
    drawFn: (ctx: CanvasRenderingContext2D) => void
  ): THREE.CanvasTexture => {
    const fc = document.createElement("canvas");
    fc.width = 256;
    fc.height = 256;
    const fctx = fc.getContext("2d")!;
    const spanX = bounds.maxX - bounds.minX;
    const spanY = bounds.maxY - bounds.minY;
    fctx.save();
    // Map fin 3D (x, y) to canvas pixel coords with Y flipped so +Y up maps to top of canvas (flipY=true!)
    fctx.scale(256 / spanX, -256 / spanY);
    fctx.translate(-bounds.minX, -bounds.maxY);
    drawFn(fctx);
    fctx.restore();
    const tex = new THREE.CanvasTexture(fc);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = maxAnisotropy;
    tex.needsUpdate = true;
    return tex;
  };

  // 3. Dorsal Fin Texture (exact drawBoris colors + rays + crisp navy rim)
  const dorsalTex = makeFinTex(dorsalBounds, (ctx) => {
    const g = ctx.createLinearGradient(-0.07, 0.145, -0.23, 0.285);
    g.addColorStop(0, "#7da30d");
    g.addColorStop(0.5, "#c9e218");
    g.addColorStop(1, "#f2ff99");
    ctx.fillStyle = g;
    ctx.fillRect(dorsalBounds.minX - 0.05, dorsalBounds.minY - 0.05, 0.6, 0.6);

    ctx.strokeStyle = "rgba(110, 132, 8, 0.44)";
    ctx.lineWidth = 0.0045;
    ctx.lineCap = "round";
    const rays: Pt[] = [
      [0.07, 0.275],
      [-0.02, 0.305],
      [-0.11, 0.3],
      [-0.19, 0.28],
      [-0.26, 0.225],
      [-0.295, 0.145],
      [-0.3, 0.055],
    ];
    for (const [rx, ry] of rays) {
      ctx.beginPath();
      ctx.moveTo(-0.09, 0.075);
      ctx.lineTo(rx, ry);
      ctx.stroke();
    }

    // Crisp outer rim highlight + navy outline matching 2D drawBoris!
    ctx.beginPath();
    ctx.moveTo(0.135, 0.175);
    ctx.bezierCurveTo(0.05, 0.27, -0.13, 0.31, -0.238, 0.24);
    ctx.bezierCurveTo(-0.288, 0.165, -0.295, 0.04, -0.242, -0.023);
    ctx.strokeStyle = "#13214a";
    ctx.lineWidth = 0.011;
    ctx.stroke();
  });

  // 4. Anal Fin Texture
  const analTex = makeFinTex(analBounds, (ctx) => {
    const g = ctx.createLinearGradient(-0.15, -0.145, -0.25, -0.265);
    g.addColorStop(0, "#7da30d");
    g.addColorStop(0.5, "#c9e218");
    g.addColorStop(1, "#f2ff99");
    ctx.fillStyle = g;
    ctx.fillRect(analBounds.minX - 0.05, analBounds.minY - 0.05, 0.5, 0.5);

    ctx.strokeStyle = "rgba(110, 132, 8, 0.44)";
    ctx.lineWidth = 0.0045;
    const rays: Pt[] = [
      [-0.09, -0.27],
      [-0.16, -0.28],
      [-0.23, -0.26],
      [-0.275, -0.205],
      [-0.29, -0.135],
    ];
    for (const [rx, ry] of rays) {
      ctx.beginPath();
      ctx.moveTo(-0.13, -0.105);
      ctx.lineTo(rx, ry);
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.moveTo(-0.055, -0.22);
    ctx.bezierCurveTo(-0.13, -0.277, -0.225, -0.277, -0.266, -0.21);
    ctx.bezierCurveTo(-0.29, -0.15, -0.282, -0.1, -0.238, -0.073);
    ctx.strokeStyle = "#13214a";
    ctx.lineWidth = 0.011;
    ctx.stroke();
  });

  // 5. Truncated Fan Tail Texture (exact drawBoris lime -> pale cream + rays + white trailing edge + navy edges)
  const tailTex = makeFinTex(tailBounds, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, -0.155, 0);
    g.addColorStop(0, "#83ab10");
    g.addColorStop(0.42, "#c9e218");
    g.addColorStop(0.82, "#f0f29a");
    g.addColorStop(1, "#ffffe8");
    ctx.fillStyle = g;
    ctx.fillRect(tailBounds.minX - 0.04, tailBounds.minY - 0.04, 0.4, 0.4);

    ctx.strokeStyle = "rgba(155, 118, 12, 0.42)";
    ctx.lineWidth = 0.0045;
    for (let i = 0; i < 7; i++) {
      ctx.beginPath();
      ctx.moveTo(0.01, 0);
      ctx.lineTo(-0.155, -0.105 + i * 0.035);
      ctx.stroke();
    }

    // Crisp white translucent trailing tip
    ctx.beginPath();
    ctx.moveTo(-0.146, 0.122);
    ctx.quadraticCurveTo(-0.162, 0.01, -0.142, -0.118);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
    ctx.lineWidth = 0.015;
    ctx.stroke();

    // Subtle dark navy border along top & bottom edges
    ctx.strokeStyle = "rgba(19, 33, 74, 0.85)";
    ctx.lineWidth = 0.009;
    ctx.beginPath();
    ctx.moveTo(0, 0.042);
    ctx.bezierCurveTo(-0.048, 0.078, -0.102, 0.115, -0.146, 0.122);
    ctx.moveTo(0, -0.044);
    ctx.bezierCurveTo(-0.046, -0.075, -0.098, -0.11, -0.142, -0.118);
    ctx.stroke();
  });

  // 6. Pelvic Fin Texture (silver-blue gradient + crisp dark navy #0f1734 border)
  const pelvTex = makeFinTex(pelvBounds, (ctx) => {
    const g = ctx.createLinearGradient(0.02, 0, -0.04, -0.05);
    g.addColorStop(0, "#dce8f4");
    g.addColorStop(1, "#7a8aa8");
    ctx.fillStyle = g;
    ctx.fillRect(pelvBounds.minX - 0.02, pelvBounds.minY - 0.02, 0.2, 0.2);

    ctx.beginPath();
    ctx.moveTo(0.038, 0.006);
    ctx.bezierCurveTo(0.015, -0.048, -0.036, -0.066, -0.064, -0.046);
    ctx.quadraticCurveTo(-0.044, -0.008, -0.012, 0.006);
    ctx.closePath();
    ctx.strokeStyle = "#0f1734";
    ctx.lineWidth = 0.009;
    ctx.stroke();
  });

  // 7. Pectoral Fin Texture (translucent ice-white + subtle outline)
  const pecTex = makeFinTex(pecBounds, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, -0.09, 0);
    g.addColorStop(0, "#d2eaf8");
    g.addColorStop(1, "#ffffff");
    ctx.fillStyle = g;
    ctx.fillRect(pecBounds.minX - 0.02, pecBounds.minY - 0.02, 0.2, 0.2);

    ctx.strokeStyle = "rgba(90, 140, 195, 0.35)";
    ctx.lineWidth = 0.003;
    for (const ry of [-0.015, 0, 0.015]) {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-0.08, ry);
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.moveTo(0, 0.012);
    ctx.bezierCurveTo(-0.038, 0.042, -0.095, 0.02, -0.088, -0.018);
    ctx.bezierCurveTo(-0.075, -0.048, -0.028, -0.042, 0, -0.014);
    ctx.closePath();
    ctx.strokeStyle = "rgba(19, 33, 74, 0.45)";
    ctx.lineWidth = 0.0065;
    ctx.stroke();
  });

  return { albedo, roughness, dorsalTex, analTex, tailTex, pelvTex, pecTex };
}

export function injectSpineShader(
  mat: THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial | THREE.MeshBasicMaterial,
  uniforms: SpineUniforms,
  localOffsetX = 0,
  localOffsetY = 0
) {
  mat.customProgramCacheKey = () => `boris3d-spine-v2-${localOffsetX.toFixed(3)}-${localOffsetY.toFixed(3)}`;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTailPh = uniforms.uTailPh;
    shader.uniforms.uSwimAmp = uniforms.uSwimAmp;
    shader.uniforms.uBend = uniforms.uBend;
    shader.uniforms.uGulpT = uniforms.uGulpT;
    shader.uniforms.uGulpK = uniforms.uGulpK;
    shader.uniforms.uSquash = uniforms.uSquash;
    shader.uniforms.uPuff = uniforms.uPuff;

    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform float uTailPh;
        uniform float uSwimAmp;
        uniform float uBend;
        uniform float uGulpT;
        uniform float uGulpK;
        uniform float uSquash;
        uniform float uPuff;`
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        float wx = transformed.x + (${localOffsetX.toFixed(4)});
        float wy = transformed.y + (${localOffsetY.toFixed(4)});
        float spineT = clamp((0.12 - wx) / 0.36, 0.0, 1.0);
        float bendT = spineT * spineT;
        float sWave = sin(uTailPh - (0.12 - wx) * 8.2) * uSwimAmp;
        transformed.z += bendT * (sWave + uBend * 0.22);
        if (uGulpT > 0.01 && uGulpK > 0.001) {
          float gt = clamp(uGulpT, 0.0, 1.0);
          float gx = mix(0.08, -0.14, 1.0 - gt);
          float gd = (wx - gx) / 0.085;
          float torsoMask = smoothstep(0.17, 0.04, wx);
          float bulge = exp(-gd * gd) * torsoMask * uGulpK * sin(gt * 3.14159265) * 0.28;
          transformed.y *= (1.0 + bulge * 0.65);
          transformed.z *= (1.0 + bulge * 1.15);
        }
        if (uPuff > 0.01) {
          float pd = length(vec2((wx - 0.22) * 1.1, (wy + 0.115) * 1.4)) / 0.095;
          float cheekPuff = exp(-pd * pd) * uPuff * 0.022;
          transformed.y -= cheekPuff * 0.55;
          transformed.z += sign(transformed.z + 0.0001) * cheekPuff * 0.85;
        }`
      );
  };
}

export function evalSpineZAt(x: number, u: SpineUniforms): number {
  const spineT = clamp((0.12 - x) / 0.36, 0, 1);
  const bendT = spineT * spineT;
  const sWave = Math.sin(u.uTailPh.value - (0.12 - x) * 8.2) * u.uSwimAmp.value;
  return bendT * (sWave + u.uBend.value * 0.22);
}

export function createBoris3DRig(maxAnisotropy = 4): Boris3DRig {
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

  // Build exact 2D-faithful fin geometries first so textures align to their normalized bounding boxes
  const dorsalShape = new THREE.Shape();
  dorsalShape.moveTo(0.135, 0.175);
  dorsalShape.bezierCurveTo(0.05, 0.27, -0.13, 0.31, -0.238, 0.24);
  dorsalShape.bezierCurveTo(-0.288, 0.165, -0.295, 0.04, -0.242, -0.023);
  dorsalShape.lineTo(-0.17, -0.025);
  dorsalShape.lineTo(-0.17, 0.135);
  dorsalShape.lineTo(0.1, 0.155);
  dorsalShape.closePath();

  const dorsalGeo = track(
    new THREE.ExtrudeGeometry(dorsalShape, {
      depth: 0.004,
      bevelEnabled: true,
      bevelThickness: 0.0014,
      bevelSize: 0.001,
      bevelSegments: 2,
      curveSegments: 18,
    })
  );
  dorsalGeo.translate(0, 0, -0.002);
  const dorsalBounds = normalizeExtrudeUVs(dorsalGeo);

  const analShape = new THREE.Shape();
  analShape.moveTo(-0.055, -0.22);
  analShape.bezierCurveTo(-0.13, -0.277, -0.225, -0.277, -0.266, -0.21);
  analShape.bezierCurveTo(-0.29, -0.15, -0.282, -0.1, -0.238, -0.073);
  analShape.lineTo(-0.16, -0.085);
  analShape.lineTo(-0.09, -0.195);
  analShape.closePath();

  const analGeo = track(
    new THREE.ExtrudeGeometry(analShape, {
      depth: 0.004,
      bevelEnabled: true,
      bevelThickness: 0.0014,
      bevelSize: 0.001,
      bevelSegments: 2,
      curveSegments: 16,
    })
  );
  analGeo.translate(0, 0, -0.002);
  const analBounds = normalizeExtrudeUVs(analGeo);

  const tailShape = new THREE.Shape();
  tailShape.moveTo(0.006, 0.042);
  tailShape.bezierCurveTo(-0.048, 0.078, -0.102, 0.115, -0.146, 0.122);
  tailShape.quadraticCurveTo(-0.162, 0.01, -0.142, -0.118);
  tailShape.bezierCurveTo(-0.098, -0.11, -0.046, -0.075, 0.006, -0.044);
  tailShape.closePath();

  const tailGeo = track(
    new THREE.ExtrudeGeometry(tailShape, {
      depth: 0.0036,
      bevelEnabled: true,
      bevelThickness: 0.0012,
      bevelSize: 0.0008,
      bevelSegments: 2,
      curveSegments: 16,
    })
  );
  tailGeo.translate(0, 0, -0.0018);
  const tailBounds = normalizeExtrudeUVs(tailGeo);

  const pelvShape = new THREE.Shape();
  pelvShape.moveTo(0.038, 0.006);
  pelvShape.bezierCurveTo(0.015, -0.048, -0.036, -0.066, -0.064, -0.046);
  pelvShape.quadraticCurveTo(-0.044, -0.008, -0.012, 0.006);
  pelvShape.closePath();

  const pelvGeo = track(
    new THREE.ExtrudeGeometry(pelvShape, {
      depth: 0.0036,
      bevelEnabled: true,
      bevelThickness: 0.001,
      bevelSize: 0.0008,
      bevelSegments: 1,
    })
  );
  pelvGeo.translate(0, 0, -0.0018);
  const pelvBounds = normalizeExtrudeUVs(pelvGeo);

  const pecShape = new THREE.Shape();
  pecShape.moveTo(0, 0.012);
  pecShape.bezierCurveTo(-0.038, 0.042, -0.095, 0.02, -0.088, -0.018);
  pecShape.bezierCurveTo(-0.075, -0.048, -0.028, -0.042, 0, -0.014);
  pecShape.closePath();

  const pecGeo = track(
    new THREE.ExtrudeGeometry(pecShape, {
      depth: 0.0026,
      bevelEnabled: true,
      bevelThickness: 0.0008,
      bevelSize: 0.0006,
      bevelSegments: 1,
      curveSegments: 12,
    })
  );
  pecGeo.translate(0, 0, -0.0013);
  const pecBounds = normalizeExtrudeUVs(pecGeo);

  const { albedo, roughness, dorsalTex, analTex, tailTex, pelvTex, pecTex } = createBorisTextures(
    maxAnisotropy,
    dorsalBounds,
    analBounds,
    tailBounds,
    pelvBounds,
    pecBounds
  );
  track(albedo);
  track(roughness);
  track(dorsalTex);
  track(analTex);
  track(tailTex);
  track(pelvTex);
  track(pecTex);

  const root = new THREE.Group();
  const pitchGroup = new THREE.Group();
  const yawGroup = new THREE.Group();
  const bodyGroup = new THREE.Group();
  root.add(pitchGroup);
  pitchGroup.add(yawGroup);
  yawGroup.add(bodyGroup);

  // Subtle crisp navy cartoon-3D outline material (BackSide)
  const makeOutlineMat = (offsetX = 0, offsetY = 0, useSpine = true) => {
    const m = track(
      new THREE.MeshBasicMaterial({
        color: "#13214a",
        side: THREE.BackSide,
      })
    );
    if (useSpine) injectSpineShader(m, uniforms, offsetX, offsetY);
    return m;
  };

  // Vibrant underwater fish material helper (preserves 2D colors cleanly while showing 3D shading + wet sheen)
  const makeFishMat = (map: THREE.Texture, extra?: Partial<THREE.MeshPhysicalMaterialParameters>) => {
    const rough = extra?.roughness !== undefined ? Math.max(0.76, extra.roughness) : 0.88;
    const coat = extra?.clearcoat !== undefined ? Math.min(0.05, extra.clearcoat) : 0.03;
    const envInt = extra?.envMapIntensity !== undefined ? Math.min(0.1, extra.envMapIntensity) : 0.07;
    const emInt = extra?.emissiveIntensity !== undefined ? Math.min(0.2, extra.emissiveIntensity) : 0.14;
    return track(
      new THREE.MeshPhysicalMaterial({
        map,
        roughnessMap: roughness,
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

  // 1. Main Torso Body (exact 2D silhouette + seamless flank markings + navy rim outline)
  const bodyGeo = track(buildBorisBodyGeometry());
  const bodyMat = makeFishMat(albedo);
  injectSpineShader(bodyMat, uniforms);
  const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
  bodyGroup.add(bodyMesh);

  const bodyOutlineGeo = track(
    buildOutlineGeometry(bodyGeo, 0.0052, (x, y, z) => {
      const absZ = Math.abs(z);
      if (absZ >= 0.028) return 1;
      const zFade = smoothstepLocal(0.006, 0.028, absZ);
      const midY = (interpCurveY(CURVE_SAMPLES.top, x) + interpCurveY(CURVE_SAMPLES.bot, x)) * 0.5;
      let hide = 0;
      if (y > midY) {
        hide = smoothstepLocal(-0.25, -0.22, x) * (1 - smoothstepLocal(0.11, 0.14, x));
      } else {
        hide = smoothstepLocal(-0.27, -0.24, x) * (1 - smoothstepLocal(-0.08, -0.05, x));
      }
      return 1 - hide * (1 - zFade);
    })
  );
  const bodyOutlineMesh = new THREE.Mesh(bodyOutlineGeo, makeOutlineMat());
  bodyGroup.add(bodyOutlineMesh);

  // 2. Dorsal & Anal Fins (exact 2D shapes, normalized UVs, yellow-lime rays + navy outline)
  const dorsalMat = makeFishMat(dorsalTex, { emissiveIntensity: 0.32, clearcoat: 0.25 });
  injectSpineShader(dorsalMat, uniforms);
  const dorsalMesh = new THREE.Mesh(dorsalGeo, dorsalMat);
  bodyGroup.add(dorsalMesh);

  const analMat = makeFishMat(analTex, { emissiveIntensity: 0.32, clearcoat: 0.25 });
  injectSpineShader(analMat, uniforms);
  const analMesh = new THREE.Mesh(analGeo, analMat);
  bodyGroup.add(analMesh);

  // 3. Truncated Fan Tail Fin (pivoted cleanly at caudal peduncle x=-0.235, y=-0.047)
  const tailPivot = new THREE.Group();
  tailPivot.position.set(-0.235, -0.047, 0);
  bodyGroup.add(tailPivot);

  const tailMat = makeFishMat(tailTex, {
    emissiveIntensity: 0.34,
    clearcoat: 0.28,
    transparent: true,
    opacity: 0.96,
  });
  const tailMesh = new THREE.Mesh(tailGeo, tailMat);
  tailPivot.add(tailMesh);

  // 4. Unified Cranium & Snout in bodyGeo + Articulated Tucked Lower Jaw (zero cheek seam!)
  const upperJawGroup = new THREE.Group();
  upperJawGroup.position.set(HX, HY, 0);
  bodyGroup.add(upperJawGroup);

  const lowerJawGroup = new THREE.Group();
  lowerJawGroup.position.set(HX, HY, 0);
  bodyGroup.add(lowerJawGroup);

  const lowerJawGeo = track(buildBorisJawPartGeometry("lower"));
  const lowerJawMat = makeFishMat(albedo);
  injectSpineShader(lowerJawMat, uniforms, HX, HY);
  const lowerJawMesh = new THREE.Mesh(lowerJawGeo, lowerJawMat);
  lowerJawGroup.add(lowerJawMesh);

  const lowerJawOutlineGeo = track(
    buildOutlineGeometry(lowerJawGeo, 0.0048, (x) => smoothstepLocal(0.006, 0.042, x))
  );
  lowerJawGroup.add(new THREE.Mesh(lowerJawOutlineGeo, makeOutlineMat(HX, HY)));

  // Recessed burgundy oral cavity + 3D coral-pink tongue (hidden when closed, vivid when mangap!)
  const mouthInterior = new THREE.Group();
  mouthInterior.position.set(HX + 0.004, HY, 0);
  bodyGroup.add(mouthInterior);

  const cavityMat = track(
    new THREE.MeshStandardMaterial({
      color: "#521224",
      emissive: "#26050f",
      emissiveIntensity: 0.3,
      roughness: 0.72,
      side: THREE.DoubleSide,
    })
  );
  const cavityGeo = track(new THREE.SphereGeometry(0.038, 16, 12));
  cavityGeo.scale(1.18, 0.85, 0.65);
  const cavityMesh = new THREE.Mesh(cavityGeo, cavityMat);
  cavityMesh.position.set(0.01, 0, 0);
  mouthInterior.add(cavityMesh);

  const tongueMat = track(
    new THREE.MeshPhysicalMaterial({
      color: "#eb6c8e",
      emissive: "#eb6c8e",
      emissiveIntensity: 0.14,
      roughness: 0.56,
      clearcoat: 0.08,
      envMapIntensity: 0.07,
    })
  );
  const tongueGeo = track(new THREE.SphereGeometry(0.024, 16, 12));
  tongueGeo.scale(1.32, 0.46, 0.74);
  const tongueMesh = new THREE.Mesh(tongueGeo, tongueMat);
  tongueMesh.position.set(0.036, 0.002, 0);
  lowerJawGroup.add(tongueMesh);

  // 5. Flush, Glossy, Navy-Outlined 3D Eyes inside Vertical Navy Band (exact drawBoris ex=0.204, ey=-0.007, er=0.035)
  const eyeX = 0.204;
  const eyeY = -0.007;
  const eyeCheekZ = evalBodyHalfZ(eyeX) * 0.985;

  const eyeRimMat = track(new THREE.MeshBasicMaterial({ color: "#080f28" }));
  const scleraMat = track(
    new THREE.MeshPhysicalMaterial({
      color: "#ffffff",
      emissive: "#ffffff",
      emissiveIntensity: 0.18,
      roughness: 0.38,
      clearcoat: 0.15,
      envMapIntensity: 0.08,
    })
  );
  const irisMat = track(
    new THREE.MeshPhysicalMaterial({
      color: "#1b3a7a",
      emissive: "#1b3a7a",
      emissiveIntensity: 0.14,
      roughness: 0.34,
      clearcoat: 0.18,
      envMapIntensity: 0.08,
    })
  );
  const pupilMat = track(new THREE.MeshBasicMaterial({ color: "#070d24" }));
  const glintMat = track(new THREE.MeshBasicMaterial({ color: "#ffffff" }));
  const happyMat = track(new THREE.MeshBasicMaterial({ color: "#e6f2ff" }));

  const scleraGeo = track(new THREE.SphereGeometry(0.035, 20, 14));
  scleraGeo.scale(0.88, 1.0, 0.28);
  const eyeRimGeo = track(new THREE.SphereGeometry(0.0361, 20, 14));
  eyeRimGeo.scale(0.88, 1.0, 0.22);
  const irisGeo = track(new THREE.SphereGeometry(0.02, 18, 12));
  irisGeo.scale(0.88, 1.0, 0.26);
  const pupilGeo = track(new THREE.SphereGeometry(0.0125, 16, 10));
  pupilGeo.scale(0.88, 1.0, 0.26);
  const glintBigGeo = track(new THREE.SphereGeometry(0.0052, 8, 8));
  const glintSmGeo = track(new THREE.SphereGeometry(0.0026, 8, 8));

  const happyCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.024, -0.006, 0),
    new THREE.Vector3(-0.01, 0.012, 0.003),
    new THREE.Vector3(0.01, 0.012, 0.003),
    new THREE.Vector3(0.024, -0.006, 0),
  ]);
  const happyGeo = track(new THREE.TubeGeometry(happyCurve, 12, 0.0044, 8, false));

  const eyesNormal: THREE.Group[] = [];
  const eyesPupil: THREE.Mesh[] = [];
  const eyesHappy: THREE.Group[] = [];

  for (const side of [1, -1]) {
    const eyeSocket = new THREE.Group();
    eyeSocket.position.set(eyeX, eyeY, side * eyeCheekZ);
    // Align gently with forward-tapering cheek contour so eye sits flush
    eyeSocket.rotation.y = side * 0.22;
    bodyGroup.add(eyeSocket);

    const normalEye = new THREE.Group();
    const rim = new THREE.Mesh(eyeRimGeo, eyeRimMat);
    rim.position.z = -side * 0.0005;
    const sclera = new THREE.Mesh(scleraGeo, scleraMat);
    const iris = new THREE.Mesh(irisGeo, irisMat);
    iris.position.set(0.006, 0.001, side * 0.0068);
    const pupil = new THREE.Mesh(pupilGeo, pupilMat);
    pupil.position.set(0.0075, 0.001, side * 0.0092);
    const glint1 = new THREE.Mesh(glintBigGeo, glintMat);
    glint1.position.set(0.001, 0.009, side * 0.0125);
    const glint2 = new THREE.Mesh(glintSmGeo, glintMat);
    glint2.position.set(0.011, -0.006, side * 0.0118);
    normalEye.add(rim, sclera, iris, pupil, glint1, glint2);

    const happyEye = new THREE.Group();
    const hArc = new THREE.Mesh(happyGeo, happyMat);
    if (side < 0) hArc.scale.z = -1;
    hArc.position.z = side * 0.007;
    happyEye.add(hArc);
    happyEye.visible = false;

    eyeSocket.add(normalEye, happyEye);
    eyesNormal.push(normalEye);
    eyesPupil.push(pupil);
    eyesHappy.push(happyEye);
  }

  // 6. Left & Right Translucent Pectoral Fins + Dark-Rimmed Pelvic Fin
  const pecMat = makeFishMat(pecTex, {
    emissiveIntensity: 0.35,
    clearcoat: 0.3,
    transparent: true,
    opacity: 0.86,
  });
  const pecTopY = interpCurveY(CURVE_SAMPLES.top, 0.108);
  const pecBotY = interpCurveY(CURVE_SAMPLES.bot, 0.108);
  const pecMidY = (pecTopY + pecBotY) * 0.5;
  const pecHh = Math.max(0.01, (pecTopY - pecBotY) * 0.5);
  const pecS = clamp((-0.123 - pecMidY) / pecHh, -0.92, 0.92);
  const pecC = Math.sqrt(Math.max(0.06, 1 - pecS * pecS));
  const pecZ = evalBodyHalfZ(0.108) * pecC * (1 - 0.26 * Math.pow(Math.abs(pecS), 1.55)) + 0.006;

  const pecLeft = new THREE.Group();
  pecLeft.position.set(0.108, -0.123, pecZ);
  pecLeft.add(new THREE.Mesh(pecGeo, pecMat));

  const pecRight = new THREE.Group();
  pecRight.position.set(0.108, -0.123, -pecZ);
  pecRight.add(new THREE.Mesh(pecGeo, pecMat));
  bodyGroup.add(pecLeft, pecRight);

  const pelvicFin = new THREE.Group();
  pelvicFin.position.set(0.05, -0.227, 0);
  const pelvMat = makeFishMat(pelvTex, { emissiveIntensity: 0.25, clearcoat: 0.25 });
  pelvicFin.add(new THREE.Mesh(pelvGeo, pelvMat));
  bodyGroup.add(pelvicFin);

  // 7. Crisp 3D Chomp Snap Ring VFX right at the mouth tip on bite slam
  const biteRingGeo = track(new THREE.TorusGeometry(0.055, 0.006, 8, 22));
  const biteRingMat = track(
    new THREE.MeshBasicMaterial({
      color: "#d8f8ff",
      transparent: true,
      opacity: 0,
      depthWrite: false,
    })
  );
  const biteRing = new THREE.Mesh(biteRingGeo, biteRingMat);
  biteRing.position.set(UX_TIP + 0.025, HY, 0);
  biteRing.rotation.y = Math.PI * 0.5;
  biteRing.visible = false;
  bodyGroup.add(biteRing);

  return {
    root,
    pitchGroup,
    yawGroup,
    bodyGroup,
    upperJawGroup,
    lowerJawGroup,
    mouthInterior,
    tongueMesh,
    tailPivot,
    pecLeft,
    pecRight,
    pelvicFin,
    eyesNormal,
    eyesPupil,
    eyesHappy,
    biteRing,
    biteRingMat,
    uniforms,
    dispose: () => {
      for (const d of disposables) d.dispose();
    },
  };
}

export function applyBoris3DPose(rig: Boris3DRig, p: Boris3DPose) {
  const open = clamp(p.jaw, 0, 1.15);
  const tightClamp = p.jaw < 0 ? clamp(-p.jaw, 0, 0.4) : 0;

  // 1. Real 3D Yaw Turn + Continuous Pitch inside yawGroup + Subtle Swim Head Parallax + Bite Lunge
  const flipClamp = clamp(p.turnFlip, -1, 1);
  const turnAmt = Math.sin(Math.acos(flipClamp)); // 0 at side profile, 1.0 mid-turn facing camera!
  const swimYaw = p.inspectYaw !== undefined ? 0 : Math.sin(p.tailPh) * 0.065 * (0.35 + p.swimSpeed * 0.65);
  const yawAngle = -Math.acos(flipClamp) + swimYaw + (p.inspectYaw ?? 0);
  rig.yawGroup.rotation.y = yawAngle;
  // Dynamic 3D banking roll while swinging around in water
  rig.yawGroup.rotation.x = turnAmt * (0.16 + Math.sin(p.tilt) * 0.2);

  // Outer inspect pitch for menu drag; local body pitch inside yawGroup stays continuous across 180-deg turn!
  rig.pitchGroup.rotation.z = 0;
  rig.pitchGroup.rotation.x = p.inspectPitch ?? 0;
  rig.bodyGroup.rotation.z = -p.tilt;
  rig.bodyGroup.position.x = p.biteLunge * 0.011;
  rig.bodyGroup.scale.set(1 - p.sq * 0.24, 1 + p.sq * 0.3, 1);

  // 2. Spine S-Wave, Gulp Bulge, Puff Cheek & Squash-Stretch Uniforms
  const swimAmp = 0.016 + p.swimSpeed * 0.032 + turnAmt * 0.048;
  rig.uniforms.uTailPh.value = p.tailPh;
  rig.uniforms.uSwimAmp.value = swimAmp;
  rig.uniforms.uBend.value = p.bend + turnAmt * 0.26;
  rig.uniforms.uGulpT.value = p.gulpT;
  rig.uniforms.uGulpK.value = p.gulpK;
  rig.uniforms.uSquash.value = p.sq;
  rig.uniforms.uPuff.value = (p.puff ? 1 : 0) + clamp(p.gulpT, 0, 1) * 0.45;

  // Keep tail fin rooted cleanly to waving caudal peduncle
  rig.tailPivot.position.z = evalSpineZAt(-0.235, rig.uniforms);
  rig.tailPivot.rotation.y = -Math.sin(p.tailPh - 2.65) * (0.26 + p.swimSpeed * 0.22);
  rig.tailPivot.rotation.x = Math.cos(p.tailPh - 2.2) * 0.04;

  // 3. Articulated 3D Jaws (Mangap & Ngehap!)
  rig.upperJawGroup.rotation.z = open * 0.28 - tightClamp * 0.1;
  rig.lowerJawGroup.rotation.z = -open * 0.84 + tightClamp * 0.15;

  const hasMouthOpen = open > 0.03;
  rig.mouthInterior.visible = hasMouthOpen;
  if (hasMouthOpen) {
    rig.mouthInterior.scale.set(0.85 + open * 0.22, 0.35 + open * 0.95, 0.78 + open * 0.18);
  }
  rig.tongueMesh.visible = open > 0.045;
  rig.tongueMesh.position.y = 0.001 + open * 0.008;

  // 4. Pectoral & Pelvic Fin Flutter
  const finFlutter = p.wag2 * (p.sucking ? 1.55 : 1.0);
  rig.pecLeft.rotation.y = 0.32 + Math.sin(finFlutter) * 0.16;
  rig.pecLeft.rotation.z = Math.cos(finFlutter) * 0.14;
  rig.pecRight.rotation.y = -0.32 - Math.sin(finFlutter + 0.7) * 0.16;
  rig.pecRight.rotation.z = Math.cos(finFlutter + 0.7) * 0.14;
  rig.pelvicFin.rotation.z = -Math.sin(finFlutter) * 0.1;

  // 5. Eyes (Normal / Happy Crescent Bite / Panic)
  const isHappy = p.expr === "happy" || p.jaw <= -0.1;
  const isPanic = p.expr === "panic";
  for (let i = 0; i < 2; i++) {
    rig.eyesNormal[i].visible = !isHappy;
    rig.eyesHappy[i].visible = isHappy;
    if (!isHappy) {
      const s = isPanic ? 1.12 : 1 + open * 0.05;
      rig.eyesNormal[i].scale.set(s, s, 1);
      rig.eyesPupil[i].scale.setScalar(isPanic ? 0.62 : 1);
    }
  }

  // 6. 3D Chomp Snap Ring burst right on bite impact
  if (p.chompPhase > 0 && p.chompBitFired && p.chompDur > 0) {
    const progress = clamp(1 - p.chompPhase / (p.chompDur * 0.64), 0, 1);
    rig.biteRing.visible = true;
    rig.biteRing.scale.setScalar(0.55 + progress * 1.15);
    rig.biteRingMat.opacity = (1 - progress) * 0.75;
  } else {
    rig.biteRing.visible = false;
    rig.biteRingMat.opacity = 0;
  }
}

// =====================================================================================
// SHARED OFFSCREEN 3D RENDERER SERVICE (for In-Game canvas compositing & Etalase frames!)
// =====================================================================================
class Boris3DService {
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private rig: Boris3DRig | null = null;
  private keyLight: THREE.DirectionalLight | null = null;
  private hemiLight: THREE.HemisphereLight | null = null;
  private rimLight: THREE.DirectionalLight | null = null;
  private envRT: THREE.WebGLRenderTarget | null = null;
  private curW = 0;
  private curH = 0;
  private failed = false;

  private ensureInit() {
    if (this.failed || this.renderer) return;
    try {
      const soft = isSoftwareWebGL();
      const renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: !soft,
        powerPreference: "high-performance",
        preserveDrawingBuffer: true,
      });
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.NoToneMapping;
      renderer.setClearColor(0x000000, 0);
      renderer.setPixelRatio(1);

      const scene = new THREE.Scene();
      const pmrem = new THREE.PMREMGenerator(renderer);
      const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
      scene.environment = envRT.texture;
      scene.environmentIntensity = 0.24;
      pmrem.dispose();

      // Soft aquatic studio lighting keeping colors vivid without white glare
      const hemi = new THREE.HemisphereLight(0xebfbff, 0x3b82d6, 1.08);
      const key = new THREE.DirectionalLight(0xffffff, 1.02);
      key.position.set(1.2, 2.2, 3.8);
      const rim = new THREE.DirectionalLight(0x67e8f9, 0.55);
      rim.position.set(-2.0, 0.9, -2.2);
      scene.add(hemi, key, rim);

      // PerspectiveCamera at z=1.70 with fov=34 spans ~1.04 units at z=0 (matching 2D scale 1:1)
      // while giving genuine 3D foreshortening when Boris turns toward the viewer!
      const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 10);
      camera.position.set(0, 0, 1.7);
      camera.lookAt(0, 0, 0);

      const rig = createBoris3DRig(soft ? 1 : Math.min(4, renderer.capabilities.getMaxAnisotropy()));
      scene.add(rig.root);

      this.renderer = renderer;
      this.scene = scene;
      this.camera = camera;
      this.rig = rig;
      this.keyLight = key;
      this.hemiLight = hemi;
      this.rimLight = rim;
      this.envRT = envRT;
    } catch {
      this.failed = true;
    }
  }

  renderToCanvas(
    ctx: CanvasRenderingContext2D,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
    pose: Boris3DPose,
    targetPx = 200
  ): boolean {
    this.ensureInit();
    if (this.failed || !this.renderer || !this.scene || !this.camera || !this.rig) return false;

    const soft = isSoftwareWebGL();
    const maxDim = soft ? 224 : 384;
    const sz = Math.max(84, Math.min(maxDim, Math.ceil(targetPx / 32) * 32));
    if (this.curW !== sz || this.curH !== sz) {
      this.curW = sz;
      this.curH = sz;
      this.renderer.setSize(sz, sz, false);
    }

    const d = clamp(pose.depthFactor ?? 0, 0, 1);
    if (this.keyLight && this.hemiLight && this.rimLight) {
      this.keyLight.intensity = 1.02 - d * 0.32;
      this.hemiLight.intensity = 1.08 - d * 0.24;
      this.rimLight.intensity = 0.55 + d * 0.45;
    }

    applyBoris3DPose(this.rig, pose);
    this.renderer.render(this.scene, this.camera);
    ctx.drawImage(this.renderer.domElement, dx, dy, dw, dh);
    return true;
  }

  renderSnapshot(pose: Boris3DPose, pxSize = 156): HTMLCanvasElement {
    const out = document.createElement("canvas");
    out.width = pxSize;
    out.height = pxSize;
    const c = out.getContext("2d")!;
    this.renderToCanvas(c, 0, 0, pxSize, pxSize, pose, pxSize);
    return out;
  }

  dispose() {
    this.rig?.dispose();
    this.envRT?.dispose();
    this.renderer?.dispose();
    this.rig = null;
    this.envRT = null;
    this.renderer = null;
    this.scene = null;
    this.camera = null;
  }
}

export const boris3d = new Boris3DService();

export function disposeBoris3DShared() {
  boris3d.dispose();
}

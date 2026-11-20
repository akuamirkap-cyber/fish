import * as THREE from "three";
import type { Species } from "./species";
import {
  addToothConeRow,
  baseGroups,
  blendBotToPalate,
  bodySpineOutlineMask,
  buildLoftedSurface,
  buildOutlineGeometry,
  clamp,
  createBiteRing,
  createEyePair,
  createOralParts,
  createRigContext,
  createWorldMapper,
  drawBlob,
  drawFinRays,
  drawGlow,
  finRootMaskY,
  injectSpineShader,
  interpCurveY,
  jawOutlineMask,
  makeLin,
  makeSpineFinMesh,
  mixHex,
  rgbaHex,
  sampleBezierChain,
  smoothstep,
  surfaceZAt,
} from "./fish3dShared";
import type { Fish3DRig, Pt, SharedRigContext } from "./fish3dShared";

function sortAscX(pts: Pt[]): Pt[] {
  return [...pts].sort((a, b) => a[0] - b[0]);
}

function makeTeethMat(track: <T extends { dispose: () => void }>(x: T) => T) {
  return track(
    new THREE.MeshPhysicalMaterial({
      color: "#fffcf2",
      emissive: "#fffcf2",
      emissiveIntensity: 0.24,
      roughness: 0.2,
      clearcoat: 0.6,
    })
  );
}

// =====================================================================================
// 1. BARRACUDA (Robert — Elongated Silver-Aqua Torpedo, Dorsal Bars, Fanged Underbite)
// =====================================================================================
function createBarracuda3DRig(sp: Species, maxAnisotropy: number): Fish3DRig {
  const pal = sp.pal;
  const OL = pal.outline || "#1a3842";
  const AQUA_T = "#519ca9";
  const AQUA = pal.body || "#bcebe5";
  const AQUA_B = pal.belly || "#eefcf6";
  const FIN_L = pal.fin || "#ecefc8";
  const FIN_D = "#b4c28a";
  const STR = pal.stripe || "#38727e";
  const SPOT = pal.spot || "#0e181e";

  const ctx = createRigContext(OL, "#4a4a4a");
  const { track, uniforms, makeOutlineMat, makeFishMat } = ctx;
  const { root, pitchGroup, yawGroup, bodyGroup } = baseGroups();

  // drawBarracuda uses c.translate(0, 0.008) in +Y-down -> y3 = -(y2 + 0.008)
  const ox2 = 0.0;
  const oy2 = 0.008;
  const to3D = (x2: number, y2: number): Pt => [x2 + ox2, -(y2 + oy2)];

  const xTail = -0.318;
  const xSnoutU = 0.418;
  const xSnoutL = 0.464;

  const topPts = sortAscX(
    sampleBezierChain(
      [
        [to3D(-0.318, -0.008), to3D(-0.215, -0.036), to3D(-0.095, -0.084), to3D(0.048, -0.104)],
        [to3D(0.048, -0.104), to3D(0.128, -0.114), to3D(0.174, -0.114), to3D(0.22, -0.126)],
        [to3D(0.22, -0.126), to3D(0.264, -0.136), to3D(0.308, -0.124), to3D(0.342, -0.098)],
        [to3D(0.342, -0.098), to3D(0.372, -0.084), to3D(0.404, -0.074), to3D(0.418, -0.056)],
      ],
      24
    )
  );
  const botPts = sortAscX(
    sampleBezierChain(
      [
        [to3D(-0.318, 0.032), to3D(-0.256, 0.034), to3D(-0.165, 0.054), to3D(0.195, 0.115)],
        [to3D(0.195, 0.115), to3D(0.265, 0.128), to3D(0.352, 0.128), to3D(0.4, 0.102)],
        [to3D(0.4, 0.102), to3D(0.434, 0.072), to3D(0.454, 0.024), to3D(xSnoutL, -0.008)],
      ],
      24
    )
  );

  const evalZ = (x: number) => {
    const t = clamp((x - xTail) / (xSnoutL - xTail), 0, 1);
    const base = 0.016 + 0.068 * Math.sin(Math.pow(t, 0.78) * Math.PI);
    return x > 0.28 ? base * clamp(1 - (x - 0.28) / 0.22, 0.34, 1) : base;
  };

  const { mapUV, beginCanvas2D } = createWorldMapper(-0.36, 0.5, -0.16, 0.16, 512);

  // Paint Silver-Aqua Torpedo matching drawBarracuda
  const bodyCv = document.createElement("canvas");
  bodyCv.width = 512;
  bodyCv.height = 512;
  const bc = bodyCv.getContext("2d")!;
  beginCanvas2D(bc, ox2, oy2);

  bc.fillStyle = makeLin(bc, 0, -0.135, 0, 0.125, [
    [0, AQUA_T],
    [0.22, "#8fd6da"],
    [0.52, AQUA],
    [0.84, AQUA_B],
    [1, "#79aeb4"],
  ]);
  bc.fillRect(-0.42, -0.22, 0.98, 0.44);

  // 8 dark slate-teal dorsal chevron saddles
  for (let i = 0; i < 8; i++) {
    const bx = 0.148 - i * 0.05;
    const bw = 0.018 + (i % 2) * 0.005;
    bc.beginPath();
    bc.ellipse(bx, -0.084 + i * 0.005, bw * 0.72, 0.052 - i * 0.002, 0.22, 0, Math.PI * 2);
    bc.fillStyle = rgbaHex(STR, 0.42);
    bc.fill();
  }

  // Cranial, snout & flank specular highlights
  drawGlow(bc, 0.262, -0.104, 0.078, 0.036, -0.1, "245,255,252", 0.52);
  drawGlow(bc, 0.376, 0.015, 0.085, 0.062, -0.25, "245,255,252", 0.36);
  drawGlow(bc, 0.02, -0.01, 0.24, 0.054, -0.06, "245,255,252", 0.42);

  // Charcoal flank blotches
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
  ];
  bc.fillStyle = rgbaHex(SPOT, 0.88);
  for (const [sx, sy, rx, ry, rot] of spots) drawBlob(bc, sx, sy, rx, ry, rot);

  // Crescent gill shadow + crisp gill crease + cheek highlight
  bc.beginPath();
  bc.moveTo(0.214, -0.066);
  bc.bezierCurveTo(0.18, 0.006, 0.19, 0.072, 0.234, 0.118);
  bc.bezierCurveTo(0.204, 0.07, 0.196, 0.006, 0.214, -0.066);
  bc.closePath();
  bc.fillStyle = "rgba(22, 52, 62, 0.34)";
  bc.fill();

  bc.beginPath();
  bc.moveTo(0.214, -0.066);
  bc.bezierCurveTo(0.19, 0.006, 0.198, 0.072, 0.234, 0.118);
  bc.strokeStyle = "rgba(26, 58, 68, 0.72)";
  bc.lineWidth = 0.0054;
  bc.stroke();

  bc.beginPath();
  bc.moveTo(0.221, -0.056);
  bc.bezierCurveTo(0.198, 0.008, 0.206, 0.068, 0.24, 0.112);
  bc.strokeStyle = "rgba(240, 255, 250, 0.5)";
  bc.lineWidth = 0.004;
  bc.stroke();

  // Brow ridge & lower cheek crease
  bc.beginPath();
  bc.moveTo(0.238, -0.107);
  bc.quadraticCurveTo(0.284, -0.109, 0.319, -0.086);
  bc.strokeStyle = "rgba(22, 52, 62, 0.78)";
  bc.lineWidth = 0.0056;
  bc.stroke();

  bc.fillStyle = makeLin(bc, 0, 0.045, 0, 0.135, [
    [0, "rgba(24,56,66,0)"],
    [0.62, "rgba(24,56,66,0.22)"],
    [1, "rgba(16,38,46,0.48)"],
  ]);
  bc.fillRect(-0.35, 0.025, 0.86, 0.12);
  bc.restore();

  const bodyTex = track(new THREE.CanvasTexture(bodyCv));
  bodyTex.colorSpace = THREE.SRGBColorSpace;
  bodyTex.anisotropy = maxAnisotropy;

  const evalTop = (x: number) => interpCurveY(topPts, x);
  const evalBot = (x: number) => interpCurveY(botPts, x);
  const hx = 0.258;
  const hy = -0.03;
  const evalUpperPalate = (x: number) => {
    const t = clamp((x - (hx - 0.012)) / (xSnoutU - (hx - 0.012)), 0, 1);
    return -0.03 + 0.06 * Math.pow(t, 0.85);
  };
  const evalUnifiedBot = blendBotToPalate(evalBot, evalUpperPalate, hx, 0.032, 0.014);
  const evalMidY = (x: number) => (evalTop(x) + evalUnifiedBot(x)) * 0.5;

  const bodyGeo = track(
    buildLoftedSurface({
      xStart: xTail,
      xEnd: xSnoutU,
      uSteps: 54,
      vSteps: 28,
      evalTopY: evalTop,
      evalBotY: evalUnifiedBot,
      evalHalfZ: evalZ,
      mapUV,
      roundFront: true,
      rearBulge: 0.004,
    })
  );
  const bodyMat = makeFishMat(bodyTex);
  injectSpineShader(bodyMat, uniforms, 0, 0);
  const cudaMask = bodySpineOutlineMask(
    evalMidY,
    [
      { x0: -0.01, x1: 0.072, top: true },
      { x0: -0.195, x1: -0.118, top: true },
      { x0: -0.188, x1: -0.125, top: false },
    ],
    0.024
  );
  bodyGroup.add(
    new THREE.Mesh(bodyGeo, bodyMat),
    new THREE.Mesh(track(buildOutlineGeometry(bodyGeo, 0.0044, cudaMask)), makeOutlineMat(0, 0))
  );

  // Unified cranium owns upper snout; upperJawGroup kept for teeth & eyes compatibility
  const upperJawGroup = new THREE.Group();
  upperJawGroup.position.set(hx, hy, 0);
  bodyGroup.add(upperJawGroup);

  // Lower Underbite Bulldog Chin Jaw
  const lowerJawGroup = new THREE.Group();
  lowerJawGroup.position.set(hx, hy, 0);
  bodyGroup.add(lowerJawGroup);
  const lGeo = track(
    buildLoftedSurface({
      xStart: hx - 0.02,
      xEnd: xSnoutL,
      uSteps: 22,
      vSteps: 20,
      evalTopY: (x) => {
        const t = clamp((x - (hx - 0.012)) / (xSnoutL - (hx - 0.012)), 0, 1);
        return -0.03 + 0.046 * Math.pow(t, 0.88);
      },
      evalBotY: evalBot,
      evalHalfZ: (x) => evalZ(x) * 0.96,
      mapUV,
      localOffsetX: hx,
      localOffsetY: hy,
      roundFront: true,
      rearInsetAt: (x) => (x < hx ? 0.78 + 0.2 * clamp((x - (hx - 0.02)) / 0.02, 0, 1) : 1),
    })
  );
  lowerJawGroup.add(
    new THREE.Mesh(lGeo, bodyMat),
    new THREE.Mesh(track(buildOutlineGeometry(lGeo, 0.004, jawOutlineMask(0.008, 0.044))), makeOutlineMat(hx, hy))
  );

  const teethMat = makeTeethMat(track);
  addToothConeRow(
    bodyGroup,
    track,
    6,
    0.276,
    0.402,
    (t) => {
      const x = 0.276 + (0.402 - 0.276) * t;
      return evalUpperPalate(x) - 0.003;
    },
    (t) => {
      const x = 0.276 + (0.402 - 0.276) * t;
      return evalZ(x) * 0.65;
    },
    0.0052,
    0.02,
    false,
    teethMat,
    0.14
  );
  addToothConeRow(
    lowerJawGroup,
    track,
    6,
    0.028,
    0.184,
    (t) => {
      const x = hx + 0.028 + (0.184 - 0.028) * t;
      const lt = clamp((x - (hx - 0.012)) / (xSnoutL - (hx - 0.012)), 0, 1);
      const topLocal = -0.03 + 0.046 * Math.pow(lt, 0.88) - hy;
      return topLocal + 0.004;
    },
    (t) => {
      const x = hx + 0.028 + (0.184 - 0.028) * t;
      return evalZ(x) * 0.62;
    },
    0.0052,
    0.02,
    true,
    teethMat,
    -0.14
  );

  const { mouthInterior, tongueMesh } = createOralParts(ctx, bodyGroup, lowerJawGroup, hx, hy, "#340c15", "#d96a7e", [0.055, 0.036, 0.028]);

  const paintBarracudaFin = (fc: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, origin?: Pt, tips?: Pt[]) => {
    fc.fillStyle = makeLin(fc, x0, y0, x1, y1, [
      [0, FIN_D],
      [0.5, FIN_L],
      [1, "#f6f8e8"],
    ]);
    fc.fillRect(Math.min(x0, x1) - 0.2, Math.min(y0, y1) - 0.2, Math.abs(x1 - x0) + 0.4, Math.abs(y1 - y0) + 0.4);
    if (origin && tips) drawFinRays(fc, origin, tips, "rgba(110, 126, 84, 0.42)", 0.0032);
  };

  // Front Notched Dorsal Fin (leading +0.072 sweeping up-back to +0.006)
  const d1Shape = new THREE.Shape();
  d1Shape.moveTo(...to3D(0.072, -0.098));
  d1Shape.lineTo(...to3D(0.006, -0.175));
  d1Shape.lineTo(...to3D(0.012, -0.138));
  d1Shape.lineTo(...to3D(0.0, -0.142));
  d1Shape.lineTo(...to3D(-0.01, -0.086));
  d1Shape.closePath();
  bodyGroup.add(
    makeSpineFinMesh(ctx, d1Shape, 0, 0, 0.0036, 0.001, (fc) => {
      paintBarracudaFin(fc, 0.04, 0.08, 0.0, 0.17, to3D(0.03, -0.09), [to3D(0.01, -0.162), to3D(0.01, -0.13), to3D(0.0, -0.125)]);
    }, maxAnisotropy, true, 0.0014, undefined, finRootMaskY(0.088, 0.024, true)).mesh
  );

  // Scalloped Rear Dorsal Fin (-0.118 -> -0.195 -> -0.186)
  const d2Shape = new THREE.Shape();
  d2Shape.moveTo(...to3D(-0.118, -0.056));
  d2Shape.quadraticCurveTo(...to3D(-0.155, -0.104), ...to3D(-0.195, -0.124));
  d2Shape.quadraticCurveTo(...to3D(-0.205, -0.096), ...to3D(-0.194, -0.082));
  d2Shape.quadraticCurveTo(...to3D(-0.204, -0.064), ...to3D(-0.186, -0.034));
  d2Shape.closePath();
  bodyGroup.add(
    makeSpineFinMesh(ctx, d2Shape, 0, 0, 0.0034, 0.0009, (fc) => {
      paintBarracudaFin(fc, -0.15, 0.04, -0.2, 0.12, to3D(-0.15, -0.048), [to3D(-0.188, -0.112), to3D(-0.19, -0.082), to3D(-0.185, -0.058)]);
    }, maxAnisotropy, true, 0.0014, undefined, finRootMaskY(0.042, 0.022, true)).mesh
  );

  // Swept Rear Anal Fin
  const aShape = new THREE.Shape();
  aShape.moveTo(...to3D(-0.125, 0.056));
  aShape.quadraticCurveTo(...to3D(-0.156, 0.116), ...to3D(-0.188, 0.146));
  aShape.quadraticCurveTo(...to3D(-0.19, 0.092), ...to3D(-0.184, 0.042));
  aShape.closePath();
  bodyGroup.add(
    makeSpineFinMesh(ctx, aShape, 0, 0, 0.0034, 0.0009, (fc) => {
      paintBarracudaFin(fc, -0.155, -0.05, -0.19, -0.15, to3D(-0.155, 0.05), [to3D(-0.182, 0.132), to3D(-0.182, 0.095), to3D(-0.18, 0.068)]);
    }, maxAnisotropy, true, 0.0014, undefined, finRootMaskY(-0.062, 0.022, false)).mesh
  );

  // Forked Caudal Tail Fin matching drawBarracuda
  const tailPivot = new THREE.Group();
  tailPivot.position.set(xTail, -0.018, 0);
  bodyGroup.add(tailPivot);
  const tShape = new THREE.Shape();
  tShape.moveTo(0.014, 0.018);
  tShape.bezierCurveTo(-0.045, 0.065, -0.096, 0.118, -0.148, 0.154);
  tShape.quadraticCurveTo(-0.144, 0.132, -0.116, 0.075);
  tShape.quadraticCurveTo(-0.088, 0.025, -0.064, 0.002);
  tShape.quadraticCurveTo(-0.092, -0.062, -0.124, -0.156);
  tShape.quadraticCurveTo(-0.088, -0.146, -0.048, -0.095);
  tShape.quadraticCurveTo(-0.014, -0.048, 0.014, -0.022);
  tShape.closePath();
  tailPivot.add(
    makeSpineFinMesh(ctx, tShape, xTail, -0.018, 0.0038, 0.001, (fc) => {
      const tips: Pt[] = [];
      for (let i = 0; i < 9; i++) tips.push([-0.134, -0.128 + i * 0.032]);
      paintBarracudaFin(fc, 0.01, 0, -0.15, 0, [0.012, 0], tips);
    }, maxAnisotropy, false, 0.0014).mesh
  );

  // Pectoral Fins
  const pShape = new THREE.Shape();
  pShape.moveTo(0.008, 0.012);
  pShape.quadraticCurveTo(-0.046, -0.014, -0.088, -0.078);
  pShape.quadraticCurveTo(-0.048, -0.084, -0.004, -0.048);
  pShape.quadraticCurveTo(0.012, -0.024, 0.008, 0.012);
  pShape.closePath();
  const pecObj = makeSpineFinMesh(ctx, pShape, 0, 0, 0.003, 0.0008, (fc) => {
    paintBarracudaFin(fc, 0.005, 0.005, -0.08, -0.075, [0.004, -0.006], [
      [-0.074, -0.064],
      [-0.06, -0.072],
      [-0.042, -0.07],
      [-0.022, -0.058],
    ]);
  }, maxAnisotropy, false, 0.0013);
  const pecZ = surfaceZAt(evalTop, evalUnifiedBot, evalZ, 0.184, -0.064, 0.22, 1.0) + 0.006;
  const pecLeft = new THREE.Group();
  pecLeft.position.set(0.184, -0.064, pecZ);
  pecLeft.add(pecObj.mesh);
  const pecRight = new THREE.Group();
  pecRight.position.set(0.184, -0.064, -pecZ);
  pecRight.add(pecObj.mesh.clone());
  bodyGroup.add(pecLeft, pecRight);

  const pelvicFin = new THREE.Group();
  bodyGroup.add(pelvicFin);

  const { eyesNormal, eyesPupil, eyesHappy } = createEyePair(ctx, bodyGroup, {
    ex: 0.278,
    ey: -(-0.064 + oy2),
    ez: surfaceZAt(evalTop, evalBot, evalZ, 0.278, -(-0.064 + oy2)),
    er: 0.036,
    irisColor: pal.iris || "#c98528",
    rimColor: OL,
    lidColor: AQUA_T,
    lidTilt: -0.18,
  });

  const { biteRing, biteRingMat } = createBiteRing(ctx, bodyGroup, xSnoutL + 0.01, -0.01, FIN_L, 0.05);

  return {
    speciesKey: sp.id,
    tailPivotX: xTail,
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
      for (const d of ctx.disposables) d.dispose();
    },
  };
}

// =====================================================================================
// 2. SHARK FAMILY — Bruce (`shark`), Bruce Elegan (`shark_sleek`), Toto (`leopard`)
// Exact 2D-matched silhouettes, world-UV markings & PROPER backward-swept dorsal fins!
// =====================================================================================
const SHARK_SATIN_MAT: Partial<THREE.MeshPhysicalMaterialParameters> = {
  roughness: 0.84,
  metalness: 0.0,
  clearcoat: 0.02,
  clearcoatRoughness: 0.72,
  envMapIntensity: 0.08,
  emissiveIntensity: 0.1,
};

function evalJawSurfaceY(evalTopY: (x: number) => number, evalBotY: (x: number) => number, x: number, zFrac: number, isUpper: boolean): number {
  const yt = evalTopY(x);
  const yb = evalBotY(x);
  const mid = (yt + yb) * 0.5;
  const hh = Math.max(0.004, (yt - yb) * 0.5);
  const c = Math.sqrt(Math.max(0.05, 1 - zFrac * zFrac));
  return isUpper ? mid - hh * c : mid + hh * c;
}

function buildSharkTeethGroup(
  track: <T extends { dispose: () => void }>(x: T) => T,
  mat: THREE.Material,
  count: number,
  xStart: number,
  xEnd: number,
  yAt: (x: number, zFrac: number, t: number) => number,
  zMaxFn: (x: number) => number,
  zFracFn: (t: number) => number,
  widthFn: (t: number) => number,
  heightFn: (t: number) => number,
  pointUp: boolean,
  tiltZ: number
): { group: THREE.Group; setScaleY: (s: number) => void } {
  const group = new THREE.Group();
  // Clean 2D-matched triangular shark tooth with embedded root (-0.34..0) so base NEVER floats
  const shape = new THREE.Shape();
  shape.moveTo(-0.5, -0.34);
  shape.lineTo(-0.48, 0.0);
  shape.quadraticCurveTo(-0.18, 0.55, 0.06, 1.0);
  shape.quadraticCurveTo(0.24, 0.52, 0.48, 0.0);
  shape.lineTo(0.5, -0.34);
  shape.closePath();

  const baseGeo = track(
    new THREE.ExtrudeGeometry(shape, {
      depth: 0.0026,
      bevelEnabled: false,
      curveSegments: 5,
    })
  );
  baseGeo.translate(0, 0, -0.0013);

  const items: { mesh: THREE.Mesh; baseH: number }[] = [];
  for (let i = 0; i < count; i++) {
    const t = count <= 1 ? 0.5 : i / (count - 1);
    const x = xStart + (xEnd - xStart) * t;
    const zFrac = clamp(zFracFn(t), 0.05, 0.82);
    const y = yAt(x, zFrac, t);
    const zAbs = zMaxFn(x) * zFrac;
    const w = widthFn(t);
    const h = heightFn(t);
    const yawAngle = 0.14 + t * 0.52;
    const sides = zAbs > 0.004 ? [1, -1] : [0];
    for (const s of sides) {
      const m = new THREE.Mesh(baseGeo, mat);
      m.position.set(x, y, s * zAbs);
      m.scale.set(w, h, 1);
      m.rotation.z = (pointUp ? 0 : Math.PI) + tiltZ;
      m.rotation.y = s * yawAngle;
      m.rotation.x = s * (pointUp ? 0.16 : -0.16);
      group.add(m);
      items.push({ mesh: m, baseH: h });
    }
  }
  return {
    group,
    setScaleY: (s: number) => {
      for (const it of items) it.mesh.scale.y = it.baseH * s;
    },
  };
}

function makeSharkLowerJawTex(
  beginCanvas2D: (c: CanvasRenderingContext2D, ox?: number, oy?: number) => void,
  ox2: number,
  oy2: number,
  maxAnisotropy: number,
  whiteHex: string,
  shadeHex: string,
  outlineHex: string,
  evalLowerTop: (x: number) => number,
  xHinge: number,
  xEnd: number
): THREE.CanvasTexture {
  const cv = document.createElement("canvas");
  cv.width = 256;
  cv.height = 256;
  const c = cv.getContext("2d")!;
  c.fillStyle = whiteHex;
  c.fillRect(0, 0, 256, 256);

  beginCanvas2D(c, ox2, oy2);
  const g = c.createLinearGradient(0, 0.0, 0, 0.21);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(0.58, whiteHex);
  g.addColorStop(1, mixHex(whiteHex, shadeHex, 0.42));
  c.fillStyle = g;
  c.fillRect(-0.4, -0.26, 0.96, 0.56);

  // Subtle lip line only forward of mouth hinge (never across the chest!)
  c.strokeStyle = rgbaHex(outlineHex, 0.52);
  c.lineWidth = 0.0048;
  c.lineCap = "round";
  c.beginPath();
  for (let i = 0; i <= 14; i++) {
    const wx = xHinge + ((xEnd - xHinge) * i) / 14;
    const wy2 = -evalLowerTop(wx) - oy2;
    const px = wx - ox2;
    if (i === 0) c.moveTo(px, wy2);
    else c.lineTo(px, wy2);
  }
  c.stroke();
  c.restore();

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

function addSharkGumArch(
  track: <T extends { dispose: () => void }>(x: T) => T,
  parent: THREE.Object3D,
  gumHex: string,
  x0: number,
  x1: number,
  ptFn: (x: number, t: number) => THREE.Vector3,
  thickness: number
) {
  const pts: THREE.Vector3[] = [];
  const samples = 4;
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const x = x0 + (x1 - x0) * t;
    const p = ptFn(x, t);
    pts.push(p);
  }
  for (let i = samples - 1; i >= 0; i--) {
    const t = i / samples;
    const x = x0 + (x1 - x0) * t;
    const p = ptFn(x, t);
    pts.push(new THREE.Vector3(p.x, p.y, -p.z));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const geo = track(new THREE.TubeGeometry(curve, 18, thickness, 7, false));
  const mat = track(
    new THREE.MeshPhysicalMaterial({
      color: gumHex,
      emissive: mixHex(gumHex, "#6a1828", 0.45),
      emissiveIntensity: 0.2,
      roughness: 0.58,
      clearcoat: 0.08,
    })
  );
  const mesh = new THREE.Mesh(geo, mat);
  parent.add(mesh);
  return mesh;
}

function createSharkOralParts(
  ctx: SharedRigContext,
  bodyGroup: THREE.Group,
  lowerJawGroup: THREE.Group,
  hx: number,
  hy: number,
  xEnd: number,
  evalUpperPalate: (x: number) => number,
  evalLowerTop: (x: number) => number,
  zMax: number,
  cavityCol: string,
  tongueCol: string,
  tongueSize: [number, number, number],
  tongueX: number,
  tongueY: number
): { mouthInterior: THREE.Group; tongueMesh: THREE.Mesh } {
  const { track } = ctx;
  const mouthInterior = new THREE.Group();
  mouthInterior.position.set(hx, hy, 0);
  bodyGroup.add(mouthInterior);

  const x0 = hx - 0.01;
  const x1 = xEnd;
  const throatGeo = track(
    buildLoftedSurface({
      xStart: x0,
      xEnd: x1,
      uSteps: 16,
      vSteps: 16,
      evalTopY: (x) => evalUpperPalate(x) + 0.004,
      evalBotY: (x) => {
        const u = clamp((x - x0) / (x1 - x0), 0, 1);
        return Math.min(evalUpperPalate(x) - 0.022, evalLowerTop(x) - 0.048 * (1 - 0.3 * u));
      },
      evalHalfZ: (x) => {
        const u = clamp((x - x0) / (x1 - x0), 0, 1);
        return Math.max(0.008, zMax * (1 - 0.78 * Math.pow(u, 1.3)));
      },
      mapUV: (x, y) => [clamp((x - x0) / (x1 - x0), 0.02, 0.98), clamp((y - (hy - 0.06)) / 0.1, 0.02, 0.98)],
      localOffsetX: hx,
      localOffsetY: hy,
      roundFront: true,
    })
  );
  const cavityMat = track(
    new THREE.MeshStandardMaterial({
      color: cavityCol,
      emissive: mixHex(cavityCol, "#000000", 0.55),
      emissiveIntensity: 0.25,
      roughness: 0.8,
      side: THREE.DoubleSide,
    })
  );
  const cavityMesh = new THREE.Mesh(throatGeo, cavityMat);
  mouthInterior.add(cavityMesh);

  const tongueMat = track(
    new THREE.MeshPhysicalMaterial({
      color: tongueCol,
      emissive: tongueCol,
      emissiveIntensity: 0.18,
      roughness: 0.4,
      clearcoat: 0.15,
    })
  );
  const tongueGeo = track(new THREE.SphereGeometry(1, 14, 10));
  tongueGeo.scale(tongueSize[0], tongueSize[1], tongueSize[2]);
  const tongueMesh = new THREE.Mesh(tongueGeo, tongueMat);
  tongueMesh.position.set(tongueX, tongueY, 0);
  tongueMesh.rotation.z = -0.18;
  lowerJawGroup.add(tongueMesh);

  return { mouthInterior, tongueMesh };
}

function createSharkFamily3DRig(sp: Species, maxAnisotropy: number): Fish3DRig {
  if (sp.style === "leopard") return createLeopard3DRig(sp, maxAnisotropy);
  if (sp.style === "shark_sleek") return createSharkSleek3DRig(sp, maxAnisotropy);
  return createGreatWhite3DRig(sp, maxAnisotropy);
}

function createGreatWhite3DRig(sp: Species, maxAnisotropy: number): Fish3DRig {
  const pal = sp.pal;
  const OL = pal.outline || "#1a2130";
  const B = pal.body;
  const D = pal.dark;
  const WHITE = pal.belly || "#fbfcff";
  const FIN = pal.fin || B;
  const FINL = mixHex(FIN, "#c4d4f0", 0.3);
  const FIND = mixHex(FIN, D, 0.55);

  const ctx = createRigContext(OL, "#dedede");
  const { track, uniforms, makeOutlineMat, makeFishMat } = ctx;
  const { root, pitchGroup, yawGroup, bodyGroup } = baseGroups();

  // drawShark uses c.translate(0, -0.012)
  const oy2 = -0.012;
  const to3D = (x2: number, y2: number): Pt => [x2, -(y2 + oy2)];
  const xTail = -0.275;
  const hx = 0.206;
  const hy = -(0.044 + oy2); // -0.032
  const xLip = 0.391;
  const xSnout = 0.464;

  const topPts = sortAscX(
    sampleBezierChain(
      [
        [to3D(-0.275, -0.004), to3D(-0.2, -0.036), to3D(-0.1, -0.06), to3D(0.0, -0.076)],
        [to3D(0.0, -0.076), to3D(0.1, -0.104), to3D(0.2, -0.118), to3D(0.29, -0.114)],
        [to3D(0.29, -0.114), to3D(0.36, -0.112), to3D(0.422, -0.098), to3D(0.456, -0.078)],
        [to3D(0.456, -0.078), to3D(0.462, -0.068), to3D(0.464, -0.056), to3D(0.464, -0.044)],
      ],
      24
    )
  );
  // Exact 2D Bruce chest/belly curve continuing up toward chin tip (x=0.362, y2=0.089 => y3=-0.077)
  const botPts = sortAscX(
    sampleBezierChain(
      [
        [to3D(-0.286, 0.038), to3D(-0.23, 0.064), to3D(-0.17, 0.118), to3D(-0.1, 0.166)],
        [to3D(-0.1, 0.166), to3D(-0.07, 0.184), to3D(-0.02, 0.208), to3D(0.06, 0.208)],
        [to3D(0.06, 0.208), to3D(0.17, 0.205), to3D(0.245, 0.182), to3D(0.306, 0.123)],
        [to3D(0.306, 0.123), to3D(0.348, 0.117), to3D(0.362, 0.098), to3D(0.368, 0.082)],
      ],
      24
    )
  );

  // Smooth C1 torpedo cross-section tapering cleanly to a rounded cartoon shark snout
  const evalZ = (x: number) => {
    const t = clamp((x - xTail) / (xSnout - xTail), 0, 1);
    const env = Math.sin(Math.pow(t, 0.72) * Math.PI);
    const snoutTaper = 1 - 0.42 * smoothstep(0.56, 1.0, t);
    return 0.016 + 0.118 * env * snoutTaper;
  };

  const { mapUV, beginCanvas2D } = createWorldMapper(-0.32, 0.5, -0.24, 0.18, 512);

  // Paint Bruce Flank: rich slate charcoal-blue matching 2D image 2 (compensating 3D light!) + crisp jagged white countershading & flecks
  const bodyCv = document.createElement("canvas");
  bodyCv.width = 512;
  bodyCv.height = 512;
  const bc = bodyCv.getContext("2d")!;
  beginCanvas2D(bc, 0, oy2);

  const B_RICH = mixHex(B, D, 0.34);
  const D_RICH = mixHex(D, "#1f2738", 0.26);
  bc.fillStyle = makeLin(bc, 0, -0.11, 0, 0.2, [
    [0, mixHex(B_RICH, D_RICH, 0.3)],
    [0.32, B_RICH],
    [0.65, mixHex(B_RICH, D_RICH, 0.38)],
    [1, D_RICH],
  ]);
  bc.fillRect(-0.4, -0.26, 0.96, 0.56);

  drawGlow(bc, 0.0, -0.01, 0.28, 0.06, -0.05, "148,170,210", 0.16);

  bc.fillStyle = makeLin(bc, 0, -0.12, 0, -0.05, [
    [0, "rgba(214,232,255,0.18)"],
    [1, "rgba(214,232,255,0)"],
  ]);
  bc.fillRect(-0.35, -0.14, 0.85, 0.09);

  // Signature 2D Bruce ragged countershading & cheek boundary
  bc.beginPath();
  bc.moveTo(0.5, -0.065);
  bc.lineTo(0.46, -0.056);
  bc.bezierCurveTo(0.41, -0.044, 0.36, -0.02, 0.32, 0.0);
  bc.bezierCurveTo(0.28, 0.016, 0.24, 0.01, 0.215, 0.016);
  bc.quadraticCurveTo(0.205, 0.036, 0.204, 0.072);
  bc.lineTo(0.192, 0.058);
  bc.lineTo(0.186, 0.098);
  bc.lineTo(0.17, 0.076);
  bc.lineTo(0.162, 0.118);
  bc.quadraticCurveTo(0.1, 0.13, 0.02, 0.128);
  bc.quadraticCurveTo(-0.04, 0.12, -0.076, 0.104);
  bc.lineTo(-0.092, 0.082);
  bc.lineTo(-0.108, 0.1);
  bc.lineTo(-0.128, 0.072);
  bc.lineTo(-0.146, 0.088);
  bc.lineTo(-0.168, 0.058);
  bc.quadraticCurveTo(-0.23, 0.036, -0.3, 0.02);
  bc.lineTo(-0.3, 0.3);
  bc.lineTo(0.5, 0.3);
  bc.closePath();
  bc.fillStyle = makeLin(bc, 0, 0.0, 0, 0.21, [
    [0, "#ffffff"],
    [0.55, WHITE],
    [1, mixHex(WHITE, "#8fa2c2", 0.44)],
  ]);
  bc.fill();

  // Signature 2D Bruce white flecks where the grey breaks up
  bc.fillStyle = WHITE;
  for (const [fx, fy, fr, rot] of [
    [0.24, 0.022, 0.012, -1.1],
    [0.195, 0.052, 0.011, -1.2],
    [-0.1, 0.066, 0.011, -0.9],
    [-0.14, 0.056, 0.009, -0.8],
  ]) {
    drawBlob(bc, fx, fy, fr, fr * 0.36, rot);
  }

  // 3 subtle 2D-matched gill slits on the slate cheek
  bc.strokeStyle = rgbaHex(OL, 0.52);
  bc.lineCap = "round";
  bc.lineWidth = 0.005;
  for (let i = 0; i < 3; i++) {
    const gx = 0.195 - i * 0.024;
    bc.beginPath();
    bc.moveTo(gx + 0.008, -0.05 + i * 0.004);
    bc.quadraticCurveTo(gx - 0.012, 0.0, gx + 0.004, 0.044 - i * 0.004);
    bc.stroke();
  }

  // Mouth corner smile crease
  bc.strokeStyle = rgbaHex(OL, 0.72);
  bc.lineWidth = 0.0056;
  bc.beginPath();
  bc.moveTo(0.21, 0.046);
  bc.quadraticCurveTo(0.19, 0.04, 0.186, 0.022);
  bc.stroke();

  // Nostril slit on the white snout
  bc.strokeStyle = rgbaHex(OL, 0.78);
  bc.lineWidth = 0.0054;
  bc.beginPath();
  bc.moveTo(0.418, -0.022);
  bc.quadraticCurveTo(0.41, -0.014, 0.414, -0.004);
  bc.stroke();

  // Soft brow crease above eye
  bc.strokeStyle = rgbaHex(D_RICH, 0.46);
  bc.lineWidth = 0.0058;
  bc.beginPath();
  bc.ellipse(0.313, -0.048, 0.039, 0.042, 0, Math.PI * 0.55, Math.PI * 1.75);
  bc.stroke();

  bc.restore();

  const bodyTex = track(new THREE.CanvasTexture(bodyCv));
  bodyTex.colorSpace = THREE.SRGBColorSpace;
  bodyTex.anisotropy = maxAnisotropy;

  const evalTop = (x: number) => interpCurveY(topPts, x);
  const evalBot = (x: number) => interpCurveY(botPts, x);
  // Exact 2D Bruce upper palate: gentle curved lip from (0.206,-0.032) -> (0.391,-0.049), then upturned snout underside -> (0.464,+0.052)
  const evalUpperPalate = (x: number) => {
    if (x <= xLip) {
      const t = clamp((x - hx) / (xLip - hx), 0, 1);
      return -0.032 * (1 - t) + -0.049 * t - Math.sin(t * Math.PI) * 0.006;
    }
    const v = clamp((x - xLip) / (xSnout - xLip), 0, 1);
    return -0.049 + 0.086 * Math.pow(v, 1.35);
  };
  // Blend chest smoothly up to mouth hinge right at hx
  const evalUnifiedBot = blendBotToPalate(evalBot, evalUpperPalate, hx - 0.004, 0.044, 0.012);
  const evalMidY = (x: number) => (evalTop(x) + evalUnifiedBot(x)) * 0.5;

  const bodyGeo = track(
    buildLoftedSurface({
      xStart: xTail,
      xEnd: xSnout,
      uSteps: 62,
      vSteps: 30,
      evalTopY: evalTop,
      evalBotY: evalUnifiedBot,
      evalHalfZ: evalZ,
      mapUV,
      roundFront: true,
      rearBulge: 0.005,
    })
  );
  const bodyMat = makeFishMat(bodyTex, SHARK_SATIN_MAT);
  injectSpineShader(bodyMat, uniforms, 0, 0);
  const gwMask = bodySpineOutlineMask(
    evalMidY,
    [
      { x0: -0.044, x1: 0.172, top: true },
      { x0: -0.218, x1: -0.128, top: true },
      { x0: -0.24, x1: -0.162, top: false },
    ],
    0.028
  );
  bodyGroup.add(
    new THREE.Mesh(bodyGeo, bodyMat),
    new THREE.Mesh(track(buildOutlineGeometry(bodyGeo, 0.0046, gwMask)), makeOutlineMat(0, 0))
  );

  const upperJawGroup = new THREE.Group();
  upperJawGroup.position.set(hx, hy, 0);
  bodyGroup.add(upperJawGroup);

  // ---- Exact 2D-Matched Lower Mandible (continuous from chest to curved shark chin!) ----
  const lowerJawGroup = new THREE.Group();
  lowerJawGroup.position.set(hx, hy, 0);
  bodyGroup.add(lowerJawGroup);

  const lStart = 0.15; // tucks inside chest behind hx=0.206
  const lEnd = 0.368;
  // Upper rim of lower jaw follows 2D curved arch from (0.206,-0.032) down-forward to (0.368,-0.072)
  const evalLowerTop = (x: number) => {
    if (x <= hx) return -0.036;
    const u = clamp((x - hx) / (lEnd - hx), 0, 1);
    return -0.034 * (1 - u) + -0.072 * u + Math.sin(u * Math.PI) * 0.006;
  };
  // Underside follows exact 2D chest-to-chin belly curve (-0.190 at chest -> -0.084 at chin tip)
  const evalLowerBot = (x: number) => {
    const b = evalBot(clamp(x, lStart, lEnd));
    const u = clamp((x - hx) / (lEnd - hx), 0, 1);
    // Smoothly taper chin underside up to meet evalLowerTop cleanly at lEnd
    const chinLift = Math.pow(u, 3.2) * 0.012;
    return Math.min(evalLowerTop(x) - 0.01, b + chinLift);
  };
  const lGeo = track(
    buildLoftedSurface({
      xStart: lStart,
      xEnd: lEnd,
      uSteps: 28,
      vSteps: 24,
      evalTopY: evalLowerTop,
      evalBotY: evalLowerBot,
      evalHalfZ: (x) => {
        const u = clamp((x - lStart) / (lEnd - lStart), 0, 1);
        return evalZ(x) * 0.88 * (1 - 0.54 * Math.pow(u, 2.0));
      },
      mapUV,
      localOffsetX: hx,
      localOffsetY: hy,
      roundFront: true,
      rearInsetAt: (x) => (x < hx + 0.014 ? 0.62 + 0.36 * smoothstep(lStart, hx + 0.014, x) : 0.98),
    })
  );
  const lowerTex = track(
    makeSharkLowerJawTex(beginCanvas2D, 0, oy2, maxAnisotropy, WHITE, "#8ea3c4", OL, evalLowerTop, hx, lEnd)
  );
  const lowerMat = makeFishMat(lowerTex, SHARK_SATIN_MAT);
  injectSpineShader(lowerMat, uniforms, hx, hy);
  lowerJawGroup.add(
    new THREE.Mesh(lGeo, lowerMat),
    new THREE.Mesh(track(buildOutlineGeometry(lGeo, 0.0042, jawOutlineMask(0.0, 0.036))), makeOutlineMat(hx, hy))
  );

  // ---- Deep Maroon Throat Wedge + Low Rose Tongue ----
  const { mouthInterior, tongueMesh } = createSharkOralParts(
    ctx,
    bodyGroup,
    lowerJawGroup,
    hx,
    hy,
    hx + 0.136,
    evalUpperPalate,
    evalLowerTop,
    0.044,
    "#3b1019",
    "#d96b7e",
    [0.044, 0.009, 0.02],
    0.068,
    -0.026
  );

  // Surface-hugging Pink Gum Arches & Bold Curved White Shark Teeth (100% seated on curved jaw surface!)
  const upperZFrac = (t: number) => 0.56 - t * 0.28;
  const lowerZFrac = (t: number) => 0.48 - t * 0.24;
  const lHalfZAt = (x: number) => {
    const u = clamp((x - lStart) / (lEnd - lStart), 0, 1);
    return evalZ(x) * 0.88 * (1 - 0.54 * Math.pow(u, 2.0));
  };

  const upperGum = addSharkGumArch(
    track,
    bodyGroup,
    "#ea96a2",
    hx + 0.012,
    0.386,
    (x, t) => {
      const zf = upperZFrac(t);
      const y = evalJawSurfaceY(evalTop, evalUpperPalate, x, zf, true) + 0.002;
      return new THREE.Vector3(x, y, evalZ(x) * zf);
    },
    0.0036
  );
  const lowerGum = addSharkGumArch(
    track,
    lowerJawGroup,
    "#ea96a2",
    0.012,
    0.15,
    (xLocal, t) => {
      const wx = hx + xLocal;
      const zf = lowerZFrac(t);
      const y = evalJawSurfaceY(evalLowerTop, evalLowerBot, wx, zf, false) - hy - 0.002;
      return new THREE.Vector3(xLocal, y, lHalfZAt(wx) * zf);
    },
    0.0034
  );

  const sharkToothMat = track(
    new THREE.MeshPhysicalMaterial({
      color: "#ffffff",
      emissive: "#fffcf4",
      emissiveIntensity: 0.55,
      roughness: 0.24,
      clearcoat: 0.08,
    })
  );
  const upperTeethCtrl = buildSharkTeethGroup(
    track,
    sharkToothMat,
    7,
    hx + 0.018,
    0.384,
    (x, zf) => evalJawSurfaceY(evalTop, evalUpperPalate, x, zf, true) + 0.004,
    evalZ,
    upperZFrac,
    (t) => 0.0165 + Math.sin(t * Math.PI) * 0.0045,
    (t) => 0.016 + Math.sin(t * Math.PI) * 0.007 + t * 0.003,
    false,
    0.08
  );
  const upperTeeth = upperTeethCtrl.group;
  bodyGroup.add(upperTeeth);

  const lowerTeethCtrl = buildSharkTeethGroup(
    track,
    sharkToothMat,
    6,
    0.018,
    0.148,
    (xLocal, zf) => evalJawSurfaceY(evalLowerTop, evalLowerBot, hx + xLocal, zf, false) - hy - 0.004,
    (xLocal) => lHalfZAt(hx + xLocal),
    lowerZFrac,
    (t) => 0.0145 + Math.sin(t * Math.PI) * 0.004,
    (t) => 0.0145 + Math.sin(t * Math.PI) * 0.006 + t * 0.0025,
    true,
    -0.22
  );
  const lowerTeeth = lowerTeethCtrl.group;
  lowerJawGroup.add(lowerTeeth);

  // First Dorsal Fin: swept back (-0.082, +0.222) with crisp cartoon outline
  const d1Shape = new THREE.Shape();
  d1Shape.moveTo(...to3D(0.172, -0.1));
  d1Shape.bezierCurveTo(...to3D(0.1, -0.148), ...to3D(0.0, -0.204), ...to3D(-0.082, -0.222));
  d1Shape.quadraticCurveTo(...to3D(-0.096, -0.212), ...to3D(-0.086, -0.192));
  d1Shape.bezierCurveTo(...to3D(-0.06, -0.145), ...to3D(-0.06, -0.096), ...to3D(-0.044, -0.058));
  d1Shape.lineTo(...to3D(0.14, -0.052));
  d1Shape.closePath();
  bodyGroup.add(
    makeSpineFinMesh(ctx, d1Shape, 0, 0, 0.0048, 0.0012, (fc) => {
      fc.fillStyle = makeLin(fc, 0.06, 0.06, -0.06, 0.22, [
        [0, B_RICH],
        [0.6, mixHex(FIN, D, 0.3)],
        [1, FINL],
      ]);
      fc.fillRect(-0.15, 0.02, 0.36, 0.24);
      fc.beginPath();
      fc.moveTo(...to3D(0.172, -0.1));
      fc.bezierCurveTo(...to3D(0.1, -0.148), ...to3D(0.0, -0.204), ...to3D(-0.082, -0.222));
      fc.strokeStyle = rgbaHex(FINL, 0.55);
      fc.lineWidth = 0.016;
      fc.stroke();
    }, maxAnisotropy, true, 0.003, SHARK_SATIN_MAT, finRootMaskY(0.088, 0.032, true)).mesh
  );

  // Second Dorsal Fin
  const d2Shape = new THREE.Shape();
  d2Shape.moveTo(...to3D(-0.128, -0.036));
  d2Shape.bezierCurveTo(...to3D(-0.156, -0.06), ...to3D(-0.188, -0.066), ...to3D(-0.218, -0.056));
  d2Shape.quadraticCurveTo(...to3D(-0.202, -0.042), ...to3D(-0.2, -0.016));
  d2Shape.lineTo(...to3D(-0.13, -0.006));
  d2Shape.closePath();
  bodyGroup.add(
    makeSpineFinMesh(ctx, d2Shape, 0, 0, 0.0038, 0.0009, (fc) => {
      fc.fillStyle = makeLin(fc, -0.14, 0.02, -0.21, 0.07, [
        [0, B_RICH],
        [1, FINL],
      ]);
      fc.fillRect(-0.25, 0, 0.16, 0.1);
    }, maxAnisotropy, true, 0.0024, SHARK_SATIN_MAT, finRootMaskY(0.032, 0.024, true)).mesh
  );

  // Anal / Pelvic Fin (pale belly color)
  const aShape = new THREE.Shape();
  aShape.moveTo(...to3D(-0.162, 0.1));
  aShape.bezierCurveTo(...to3D(-0.186, 0.124), ...to3D(-0.212, 0.136), ...to3D(-0.24, 0.132));
  aShape.quadraticCurveTo(...to3D(-0.228, 0.106), ...to3D(-0.215, 0.068));
  aShape.closePath();
  bodyGroup.add(
    makeSpineFinMesh(ctx, aShape, 0, 0, 0.0036, 0.0009, (fc) => {
      fc.fillStyle = mixHex(WHITE, B, 0.22);
      fc.fillRect(-0.28, -0.16, 0.16, 0.12);
    }, maxAnisotropy, true, 0.0024, SHARK_SATIN_MAT, finRootMaskY(-0.088, 0.024, false)).mesh
  );

  // Tall Heterocercal Notched Caudal Tail
  const tailPivot = new THREE.Group();
  tailPivot.position.set(xTail, -0.006, 0);
  bodyGroup.add(tailPivot);
  const tShape = new THREE.Shape();
  tShape.moveTo(0.025, 0.006);
  tShape.bezierCurveTo(-0.025, 0.049, -0.1, 0.136, -0.171, 0.21);
  tShape.quadraticCurveTo(-0.183, 0.194, -0.174, 0.17);
  tShape.lineTo(-0.162, 0.152);
  tShape.lineTo(-0.172, 0.134);
  tShape.bezierCurveTo(-0.141, 0.076, -0.101, 0.039, -0.095, -0.002);
  tShape.bezierCurveTo(-0.097, -0.042, -0.121, -0.088, -0.157, -0.128);
  tShape.bezierCurveTo(-0.115, -0.114, -0.055, -0.08, 0.019, -0.056);
  tShape.closePath();
  tailPivot.add(
    makeSpineFinMesh(ctx, tShape, xTail, -0.006, 0.0046, 0.0011, (fc) => {
      fc.fillStyle = makeLin(fc, 0, 0, -0.18, 0.06, [
        [0, B_RICH],
        [0.5, mixHex(FIN, D, 0.3)],
        [1, FIND],
      ]);
      fc.fillRect(-0.22, -0.18, 0.28, 0.44);
      fc.strokeStyle = rgbaHex(FINL, 0.5);
      fc.lineWidth = 0.015;
      fc.beginPath();
      fc.moveTo(0.025, 0.006);
      fc.bezierCurveTo(-0.025, 0.049, -0.1, 0.136, -0.171, 0.21);
      fc.stroke();
    }, maxAnisotropy, false, 0.0029, SHARK_SATIN_MAT).mesh
  );

  // Broad Sweeping Pectoral Fins seated cleanly outside side flank
  const pShape = new THREE.Shape();
  pShape.moveTo(0.052, 0.004);
  pShape.bezierCurveTo(0.042, -0.062, 0.002, -0.132, -0.11, -0.164);
  pShape.quadraticCurveTo(-0.126, -0.16, -0.116, -0.138);
  pShape.bezierCurveTo(-0.082, -0.102, -0.086, -0.06, -0.072, -0.03);
  pShape.closePath();
  const pecObj = makeSpineFinMesh(ctx, pShape, 0, 0, 0.0044, 0.001, (fc) => {
    fc.fillStyle = makeLin(fc, 0.03, 0.0, -0.1, -0.15, [
      [0, B_RICH],
      [0.55, mixHex(FIN, D, 0.3)],
      [1, FINL],
    ]);
    fc.fillRect(-0.16, -0.2, 0.26, 0.24);
    fc.strokeStyle = rgbaHex(FINL, 0.55);
    fc.lineWidth = 0.015;
    fc.beginPath();
    fc.moveTo(0.052, 0.004);
    fc.bezierCurveTo(0.042, -0.062, 0.002, -0.132, -0.11, -0.164);
    fc.stroke();
  }, maxAnisotropy, false, 0.0026, SHARK_SATIN_MAT);
  const pecZ = surfaceZAt(evalTop, evalUnifiedBot, evalZ, 0.168, -0.092, 0.2, 1.0) + 0.006;
  const pecLeft = new THREE.Group();
  pecLeft.position.set(0.168, -0.092, pecZ);
  pecLeft.rotation.x = -0.24;
  pecLeft.add(pecObj.mesh);
  const pecRight = new THREE.Group();
  pecRight.position.set(0.168, -0.092, -pecZ);
  pecRight.rotation.x = 0.24;
  pecRight.add(pecObj.mesh.clone());
  bodyGroup.add(pecLeft, pecRight);

  const pelvicFin = new THREE.Group();
  bodyGroup.add(pelvicFin);

  // Flush, unclipped glossy cartoon shark eyes seated cleanly on cheek dome!
  const ex = 0.318;
  const ey = -(-0.048 + oy2); // +0.060
  const ez = surfaceZAt(evalTop, evalUnifiedBot, evalZ, ex, ey, 0.2, 1.0) + 0.007;
  const { eyesNormal, eyesPupil, eyesHappy } = createEyePair(ctx, bodyGroup, {
    ex,
    ey,
    ez,
    er: 0.034,
    sx: 0.9,
    sy: 1.04,
    yawRot: 0.26,
    irisColor: pal.iris || "#7a3b12",
    rimColor: OL,
  });
  if (eyesNormal[0]?.parent) eyesNormal[0].parent.rotation.x = -0.1;
  if (eyesNormal[1]?.parent) eyesNormal[1].parent.rotation.x = 0.1;

  const { biteRing, biteRingMat } = createBiteRing(ctx, bodyGroup, xSnout + 0.01, hy + 0.01, FINL, 0.056);

  return {
    speciesKey: sp.id,
    tailPivotX: xTail,
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
    onCustomPose: (p, open) => {
      const tightClamp = p.jaw < 0 ? clamp(-p.jaw, 0, 0.4) : 0;
      const idleFactor = smoothstep(-0.06, 0.0, p.jaw);
      const effOpen = clamp(open, 0, 1.15);

      // Subtle snout lift + clean 2D-matched jaw swing (already has natural toothy smile gap at rotation 0!)
      bodyGroup.rotation.z = -p.tilt + effOpen * 0.1;
      lowerJawGroup.rotation.z = tightClamp > 0.04 ? tightClamp * 0.28 : 0.04 * (1 - effOpen) - effOpen * 0.44;

      const showSmile = idleFactor > 0.1 || effOpen > 0.03;
      mouthInterior.visible = showSmile;
      if (showSmile) {
        mouthInterior.rotation.z = -effOpen * 0.14;
        mouthInterior.scale.set(1.0, clamp(0.28 + effOpen * 0.72, 0.22, 1.0), 1.0);
      }
      tongueMesh.visible = effOpen > 0.08;
      tongueMesh.position.y = -0.025 - effOpen * 0.004;
      upperGum.visible = effOpen > 0.08;
      lowerGum.visible = effOpen > 0.08;

      upperTeeth.visible = showSmile;
      lowerTeeth.visible = showSmile;
      if (showSmile) {
        const tScale = clamp(0.42 + effOpen * 0.68, 0.42, 1.1);
        upperTeethCtrl.setScaleY(tScale);
        lowerTeethCtrl.setScaleY(tScale);
      }
    },
    dispose: () => {
      for (const d of ctx.disposables) d.dispose();
    },
  };
}

function createSharkSleek3DRig(sp: Species, maxAnisotropy: number): Fish3DRig {
  const pal = sp.pal;
  const OL = pal.outline || "#273a4a";
  const B = pal.body;
  const D = pal.dark;
  const WHITE = pal.belly || "#eef5fa";
  const FIN = pal.fin || B;
  const FINL = mixHex(FIN, "#d8e8f5", 0.32);
  const FIND = mixHex(FIN, D, 0.5);

  const ctx = createRigContext(OL, "#dedede");
  const { track, uniforms, makeOutlineMat, makeFishMat } = ctx;
  const { root, pitchGroup, yawGroup, bodyGroup } = baseGroups();

  // drawSharkSleek: c.translate(-0.01, -0.005)
  const ox2 = -0.01;
  const oy2 = -0.005;
  const to3D = (x2: number, y2: number): Pt => [x2 + ox2, -(y2 + oy2)];

  const xTail = -0.285 + ox2;
  const hx = 0.198 + ox2;
  const hy = -(0.036 + oy2); // -0.031
  const xLip = 0.399 + ox2;
  const xSnout = 0.462 + ox2;

  const topPts = sortAscX(
    sampleBezierChain(
      [
        [to3D(-0.285, 0.002), to3D(-0.18, -0.024), to3D(-0.08, -0.048), to3D(0.03, -0.068)],
        [to3D(0.03, -0.068), to3D(0.13, -0.084), to3D(0.24, -0.09), to3D(0.34, -0.084)],
        [to3D(0.34, -0.084), to3D(0.395, -0.08), to3D(0.436, -0.072), to3D(0.456, -0.056)],
        [to3D(0.456, -0.056), to3D(0.461, -0.048), to3D(0.462, -0.038), to3D(0.462, -0.028)],
      ],
      24
    )
  );
  const botPts = sortAscX(
    sampleBezierChain(
      [
        [to3D(-0.29, 0.038), to3D(-0.258, 0.044), to3D(-0.22, 0.06), to3D(-0.17, 0.082)],
        [to3D(-0.17, 0.082), to3D(-0.1, 0.114), to3D(-0.04, 0.132), to3D(0.04, 0.136)],
        [to3D(0.04, 0.136), to3D(0.16, 0.136), to3D(0.24, 0.132), to3D(0.318, 0.098)],
        [to3D(0.318, 0.098), to3D(0.354, 0.092), to3D(0.368, 0.074), to3D(0.372, 0.062)],
      ],
      24
    )
  );

  const evalZ = (x: number) => {
    const t = clamp((x - xTail) / (xSnout - xTail), 0, 1);
    const env = Math.sin(Math.pow(t, 0.72) * Math.PI);
    const snoutTaper = 1 - 0.42 * smoothstep(0.56, 1.0, t);
    return 0.015 + 0.098 * env * snoutTaper;
  };

  const { mapUV, beginCanvas2D } = createWorldMapper(-0.34, 0.49, -0.18, 0.14, 512);

  const bodyCv = document.createElement("canvas");
  bodyCv.width = 512;
  bodyCv.height = 512;
  const bc = bodyCv.getContext("2d")!;
  beginCanvas2D(bc, ox2, oy2);

  const B_RICH = mixHex(B, D, 0.3);
  const D_RICH = mixHex(D, "#223442", 0.22);
  bc.fillStyle = makeLin(bc, 0, -0.09, 0, 0.14, [
    [0, mixHex(B_RICH, D_RICH, 0.25)],
    [0.35, B_RICH],
    [0.75, mixHex(B_RICH, D_RICH, 0.34)],
    [1, D_RICH],
  ]);
  bc.fillRect(-0.4, -0.22, 0.94, 0.44);
  drawGlow(bc, 0.02, -0.01, 0.28, 0.046, -0.04, "164,196,220", 0.15);

  bc.beginPath();
  bc.moveTo(0.49, -0.055);
  bc.lineTo(0.456, -0.042);
  bc.bezierCurveTo(0.39, -0.028, 0.29, -0.01, 0.2, 0.012);
  bc.bezierCurveTo(0.14, 0.042, 0.08, 0.09, -0.02, 0.094);
  bc.bezierCurveTo(-0.12, 0.096, -0.21, 0.056, -0.31, 0.03);
  bc.lineTo(-0.31, 0.25);
  bc.lineTo(0.5, 0.25);
  bc.closePath();
  bc.fillStyle = makeLin(bc, 0, 0.0, 0, 0.14, [
    [0, "#ffffff"],
    [0.55, WHITE],
    [1, mixHex(WHITE, "#9ab2ca", 0.4)],
  ]);
  bc.fill();

  bc.strokeStyle = rgbaHex(OL, 0.52);
  bc.lineCap = "round";
  bc.lineWidth = 0.0048;
  for (let i = 0; i < 3; i++) {
    const gx = 0.175 - i * 0.022;
    bc.beginPath();
    bc.moveTo(gx + 0.006, -0.032 + i * 0.003);
    bc.quadraticCurveTo(gx - 0.01, 0.006, gx + 0.004, 0.04 - i * 0.003);
    bc.stroke();
  }

  bc.strokeStyle = rgbaHex(OL, 0.76);
  bc.lineWidth = 0.0052;
  bc.beginPath();
  bc.moveTo(0.415, -0.023);
  bc.quadraticCurveTo(0.408, -0.016, 0.412, -0.007);
  bc.stroke();

  bc.strokeStyle = rgbaHex(D_RICH, 0.42);
  bc.lineWidth = 0.0054;
  bc.beginPath();
  bc.ellipse(0.284, -0.038, 0.034, 0.036, 0, Math.PI * 0.55, Math.PI * 1.75);
  bc.stroke();

  bc.restore();

  const bodyTex = track(new THREE.CanvasTexture(bodyCv));
  bodyTex.colorSpace = THREE.SRGBColorSpace;
  bodyTex.anisotropy = maxAnisotropy;

  const evalTop = (x: number) => interpCurveY(topPts, x);
  const evalBot = (x: number) => interpCurveY(botPts, x);
  const evalUpperPalate = (x: number) => {
    if (x <= xLip) {
      const t = clamp((x - hx) / (xLip - hx), 0, 1);
      return -0.031 * (1 - t) + -0.043 * t - Math.sin(t * Math.PI) * 0.005;
    }
    const v = clamp((x - xLip) / (xSnout - xLip), 0, 1);
    return -0.043 + 0.058 * Math.pow(v, 1.35);
  };
  const evalUnifiedBot = blendBotToPalate(evalBot, evalUpperPalate, hx - 0.004, 0.04, 0.012);
  const evalMidY = (x: number) => (evalTop(x) + evalUnifiedBot(x)) * 0.5;

  const bodyGeo = track(
    buildLoftedSurface({
      xStart: xTail,
      xEnd: xSnout,
      uSteps: 62,
      vSteps: 28,
      evalTopY: evalTop,
      evalBotY: evalUnifiedBot,
      evalHalfZ: evalZ,
      mapUV,
      roundFront: true,
      rearBulge: 0.004,
    })
  );
  const bodyMat = makeFishMat(bodyTex, SHARK_SATIN_MAT);
  injectSpineShader(bodyMat, uniforms, 0, 0);
  const sleekMask = bodySpineOutlineMask(
    evalMidY,
    [
      { x0: -0.096, x1: 0.1, top: true },
      { x0: -0.242, x1: -0.17, top: false },
    ],
    0.026
  );
  bodyGroup.add(
    new THREE.Mesh(bodyGeo, bodyMat),
    new THREE.Mesh(track(buildOutlineGeometry(bodyGeo, 0.0044, sleekMask)), makeOutlineMat(0, 0))
  );

  const upperJawGroup = new THREE.Group();
  upperJawGroup.position.set(hx, hy, 0);
  bodyGroup.add(upperJawGroup);

  // ---- Exact 2D-Matched Sleek Lower Chin Jaw ----
  const lowerJawGroup = new THREE.Group();
  lowerJawGroup.position.set(hx, hy, 0);
  bodyGroup.add(lowerJawGroup);
  const lStart = 0.145 + ox2;
  const lEnd = 0.372 + ox2;
  const evalLowerTop = (x: number) => {
    if (x <= hx) return -0.034;
    const u = clamp((x - hx) / (lEnd - hx), 0, 1);
    return -0.032 * (1 - u) + -0.064 * u + Math.sin(u * Math.PI) * 0.005;
  };
  const evalLowerBot = (x: number) => {
    const b = evalBot(clamp(x, lStart, lEnd));
    const u = clamp((x - hx) / (lEnd - hx), 0, 1);
    const chinLift = Math.pow(u, 3.2) * 0.01;
    return Math.min(evalLowerTop(x) - 0.009, b + chinLift);
  };
  const lGeo = track(
    buildLoftedSurface({
      xStart: lStart,
      xEnd: lEnd,
      uSteps: 28,
      vSteps: 22,
      evalTopY: evalLowerTop,
      evalBotY: evalLowerBot,
      evalHalfZ: (x) => {
        const u = clamp((x - lStart) / (lEnd - lStart), 0, 1);
        return evalZ(x) * 0.88 * (1 - 0.54 * Math.pow(u, 2.0));
      },
      mapUV,
      localOffsetX: hx,
      localOffsetY: hy,
      roundFront: true,
      rearInsetAt: (x) => (x < hx + 0.014 ? 0.62 + 0.36 * smoothstep(lStart, hx + 0.014, x) : 0.98),
    })
  );
  const lowerTex = track(
    makeSharkLowerJawTex(beginCanvas2D, ox2, oy2, maxAnisotropy, WHITE, "#88a4bd", OL, evalLowerTop, hx, lEnd)
  );
  const lowerMat = makeFishMat(lowerTex, SHARK_SATIN_MAT);
  injectSpineShader(lowerMat, uniforms, hx, hy);
  lowerJawGroup.add(
    new THREE.Mesh(lGeo, lowerMat),
    new THREE.Mesh(track(buildOutlineGeometry(lGeo, 0.004, jawOutlineMask(0.0, 0.036))), makeOutlineMat(hx, hy))
  );

  const { mouthInterior, tongueMesh } = createSharkOralParts(
    ctx,
    bodyGroup,
    lowerJawGroup,
    hx,
    hy,
    hx + 0.14,
    evalUpperPalate,
    evalLowerTop,
    0.038,
    "#4a242b",
    "#d97886",
    [0.04, 0.0085, 0.018],
    0.068,
    -0.022
  );

  const upperZFrac = (t: number) => 0.54 - t * 0.26;
  const lowerZFrac = (t: number) => 0.46 - t * 0.22;
  const lHalfZAt = (x: number) => {
    const u = clamp((x - lStart) / (lEnd - lStart), 0, 1);
    return evalZ(x) * 0.88 * (1 - 0.54 * Math.pow(u, 2.0));
  };

  const upperGum = addSharkGumArch(
    track,
    bodyGroup,
    "#eea5ad",
    hx + 0.012,
    0.382 + ox2,
    (x, t) => {
      const zf = upperZFrac(t);
      const y = evalJawSurfaceY(evalTop, evalUpperPalate, x, zf, true) + 0.002;
      return new THREE.Vector3(x, y, evalZ(x) * zf);
    },
    0.0034
  );
  const lowerGum = addSharkGumArch(
    track,
    lowerJawGroup,
    "#eea5ad",
    0.012,
    0.154,
    (xLocal, t) => {
      const wx = hx + xLocal;
      const zf = lowerZFrac(t);
      const y = evalJawSurfaceY(evalLowerTop, evalLowerBot, wx, zf, false) - hy - 0.002;
      return new THREE.Vector3(xLocal, y, lHalfZAt(wx) * zf);
    },
    0.0032
  );

  const sharkToothMat = track(
    new THREE.MeshPhysicalMaterial({
      color: "#ffffff",
      emissive: "#fffcf4",
      emissiveIntensity: 0.55,
      roughness: 0.24,
      clearcoat: 0.08,
    })
  );
  const upperTeethCtrl = buildSharkTeethGroup(
    track,
    sharkToothMat,
    7,
    hx + 0.018,
    0.382 + ox2,
    (x, zf) => evalJawSurfaceY(evalTop, evalUpperPalate, x, zf, true) + 0.004,
    evalZ,
    upperZFrac,
    (t) => 0.0155 + Math.sin(t * Math.PI) * 0.004,
    (t) => 0.015 + Math.sin(t * Math.PI) * 0.006 + t * 0.0025,
    false,
    0.08
  );
  const upperTeeth = upperTeethCtrl.group;
  bodyGroup.add(upperTeeth);

  const lowerTeethCtrl = buildSharkTeethGroup(
    track,
    sharkToothMat,
    6,
    0.018,
    0.152,
    (xLocal, zf) => evalJawSurfaceY(evalLowerTop, evalLowerBot, hx + xLocal, zf, false) - hy - 0.004,
    (xLocal) => lHalfZAt(hx + xLocal),
    lowerZFrac,
    (t) => 0.0135 + Math.sin(t * Math.PI) * 0.0035,
    (t) => 0.014 + Math.sin(t * Math.PI) * 0.0055 + t * 0.002,
    true,
    -0.2
  );
  const lowerTeeth = lowerTeethCtrl.group;
  lowerJawGroup.add(lowerTeeth);

  // Sleek swept dorsal fin
  const d1Shape = new THREE.Shape();
  d1Shape.moveTo(...to3D(0.11, -0.068));
  d1Shape.bezierCurveTo(...to3D(0.055, -0.122), ...to3D(-0.018, -0.168), ...to3D(-0.086, -0.18));
  d1Shape.quadraticCurveTo(...to3D(-0.094, -0.168), ...to3D(-0.082, -0.146));
  d1Shape.bezierCurveTo(...to3D(-0.058, -0.106), ...to3D(-0.052, -0.072), ...to3D(-0.046, -0.048));
  d1Shape.lineTo(...to3D(0.08, -0.044));
  d1Shape.closePath();
  bodyGroup.add(
    makeSpineFinMesh(ctx, d1Shape, 0, 0, 0.0044, 0.001, (fc) => {
      fc.fillStyle = makeLin(fc, 0.04, 0.05, -0.07, 0.18, [
        [0, B_RICH],
        [0.6, mixHex(FIN, D, 0.28)],
        [1, FINL],
      ]);
      fc.fillRect(-0.15, 0.01, 0.3, 0.22);
      fc.strokeStyle = rgbaHex(FINL, 0.55);
      fc.lineWidth = 0.015;
      fc.beginPath();
      fc.moveTo(...to3D(0.11, -0.068));
      fc.bezierCurveTo(...to3D(0.055, -0.122), ...to3D(-0.018, -0.168), ...to3D(-0.086, -0.18));
      fc.stroke();
    }, maxAnisotropy, true, 0.0028, SHARK_SATIN_MAT, finRootMaskY(0.068, 0.028, true)).mesh
  );

  // Rear Anal/Pelvic Fin
  const aShape = new THREE.Shape();
  aShape.moveTo(...to3D(-0.16, 0.072));
  aShape.bezierCurveTo(...to3D(-0.184, 0.098), ...to3D(-0.208, 0.112), ...to3D(-0.232, 0.108));
  aShape.quadraticCurveTo(...to3D(-0.218, 0.084), ...to3D(-0.204, 0.054));
  aShape.closePath();
  bodyGroup.add(
    makeSpineFinMesh(ctx, aShape, 0, 0, 0.0034, 0.0008, (fc) => {
      fc.fillStyle = makeLin(fc, -0.17, -0.06, -0.22, -0.11, [
        [0, B_RICH],
        [1, FIND],
      ]);
      fc.fillRect(-0.28, -0.14, 0.15, 0.11);
    }, maxAnisotropy, true, 0.0023, SHARK_SATIN_MAT, finRootMaskY(-0.064, 0.022, false)).mesh
  );

  // Sleek Forked Crescent Caudal Tail
  const tailPivot = new THREE.Group();
  tailPivot.position.set(xTail, -0.015, 0);
  bodyGroup.add(tailPivot);
  const tShape = new THREE.Shape();
  tShape.moveTo(0.018, 0.015);
  tShape.bezierCurveTo(-0.032, 0.053, -0.097, 0.129, -0.156, 0.205);
  tShape.quadraticCurveTo(-0.164, 0.189, -0.154, 0.165);
  tShape.bezierCurveTo(-0.122, 0.101, -0.096, 0.053, -0.09, 0.005);
  tShape.bezierCurveTo(-0.094, -0.035, -0.12, -0.071, -0.158, -0.101);
  tShape.bezierCurveTo(-0.112, -0.087, -0.052, -0.055, 0.014, -0.027);
  tShape.closePath();
  tailPivot.add(
    makeSpineFinMesh(ctx, tShape, xTail, -0.015, 0.0042, 0.001, (fc) => {
      fc.fillStyle = makeLin(fc, 0.01, 0, -0.16, 0.05, [
        [0, B_RICH],
        [0.55, mixHex(FIN, D, 0.28)],
        [1, FIND],
      ]);
      fc.fillRect(-0.2, -0.14, 0.24, 0.38);
      fc.strokeStyle = rgbaHex(FINL, 0.52);
      fc.lineWidth = 0.015;
      fc.beginPath();
      fc.moveTo(0.018, 0.015);
      fc.bezierCurveTo(-0.032, 0.053, -0.097, 0.129, -0.156, 0.205);
      fc.stroke();
    }, maxAnisotropy, false, 0.0028, SHARK_SATIN_MAT).mesh
  );

  // Sleek Pectoral Fins seated cleanly outside side flank
  const pShape = new THREE.Shape();
  pShape.moveTo(0.047, 0);
  pShape.bezierCurveTo(0.049, -0.057, 0.023, -0.122, -0.073, -0.154);
  pShape.quadraticCurveTo(-0.089, -0.15, -0.083, -0.13);
  pShape.bezierCurveTo(-0.057, -0.094, -0.061, -0.054, -0.049, -0.024);
  pShape.closePath();
  const pecObj = makeSpineFinMesh(ctx, pShape, 0, 0, 0.004, 0.001, (fc) => {
    fc.fillStyle = makeLin(fc, 0.03, 0, -0.08, -0.15, [
      [0, B_RICH],
      [0.55, mixHex(FIN, D, 0.28)],
      [1, FINL],
    ]);
    fc.fillRect(-0.12, -0.18, 0.2, 0.21);
    fc.strokeStyle = rgbaHex(FINL, 0.55);
    fc.lineWidth = 0.015;
    fc.beginPath();
    fc.moveTo(0.047, 0);
    fc.bezierCurveTo(0.049, -0.057, 0.023, -0.122, -0.073, -0.154);
    fc.stroke();
  }, maxAnisotropy, false, 0.0025, SHARK_SATIN_MAT);
  const pecZ = surfaceZAt(evalTop, evalUnifiedBot, evalZ, 0.145 + ox2, -0.066, 0.2, 1.0) + 0.006;
  const pecLeft = new THREE.Group();
  pecLeft.position.set(0.145 + ox2, -0.066, pecZ);
  pecLeft.rotation.x = -0.24;
  pecLeft.add(pecObj.mesh);
  const pecRight = new THREE.Group();
  pecRight.position.set(0.145 + ox2, -0.066, -pecZ);
  pecRight.rotation.x = 0.24;
  pecRight.add(pecObj.mesh.clone());
  bodyGroup.add(pecLeft, pecRight);

  const pelvicFin = new THREE.Group();
  bodyGroup.add(pelvicFin);

  const ex = 0.286 + ox2;
  const ey = -(-0.038 + oy2);
  const ez = surfaceZAt(evalTop, evalUnifiedBot, evalZ, ex, ey, 0.2, 1.0) + 0.007;
  const { eyesNormal, eyesPupil, eyesHappy } = createEyePair(ctx, bodyGroup, {
    ex,
    ey,
    ez,
    er: 0.031,
    sx: 0.9,
    sy: 1.04,
    yawRot: 0.26,
    irisColor: pal.iris || "#7a3b12",
    rimColor: OL,
  });
  if (eyesNormal[0]?.parent) eyesNormal[0].parent.rotation.x = -0.1;
  if (eyesNormal[1]?.parent) eyesNormal[1].parent.rotation.x = 0.1;

  const { biteRing, biteRingMat } = createBiteRing(ctx, bodyGroup, xSnout + 0.01, hy + 0.008, FINL, 0.052);

  return {
    speciesKey: sp.id,
    tailPivotX: xTail,
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
    onCustomPose: (p, open) => {
      const tightClamp = p.jaw < 0 ? clamp(-p.jaw, 0, 0.4) : 0;
      const idleFactor = smoothstep(-0.06, 0.0, p.jaw);
      const effOpen = clamp(open, 0, 1.15);

      bodyGroup.rotation.z = -p.tilt + effOpen * 0.1;
      lowerJawGroup.rotation.z = tightClamp > 0.04 ? tightClamp * 0.28 : 0.04 * (1 - effOpen) - effOpen * 0.44;

      const showSmile = idleFactor > 0.1 || effOpen > 0.03;
      mouthInterior.visible = showSmile;
      if (showSmile) {
        mouthInterior.rotation.z = -effOpen * 0.14;
        mouthInterior.scale.set(1.0, clamp(0.28 + effOpen * 0.72, 0.22, 1.0), 1.0);
      }
      tongueMesh.visible = effOpen > 0.08;
      tongueMesh.position.y = -0.022 - effOpen * 0.004;
      upperGum.visible = effOpen > 0.08;
      lowerGum.visible = effOpen > 0.08;

      upperTeeth.visible = showSmile;
      lowerTeeth.visible = showSmile;
      if (showSmile) {
        const tScale = clamp(0.42 + effOpen * 0.68, 0.42, 1.1);
        upperTeethCtrl.setScaleY(tScale);
        lowerTeethCtrl.setScaleY(tScale);
      }
    },
    dispose: () => {
      for (const d of ctx.disposables) d.dispose();
    },
  };
}

function createLeopard3DRig(sp: Species, maxAnisotropy: number): Fish3DRig {
  const pal = sp.pal;
  const OL = pal.outline || "#381c0c";
  const B = pal.body;
  const D = pal.dark;
  const BEL = pal.belly || "#fff7d6";
  const SPOT = pal.spot || "#5a2c14";
  const FIN = pal.fin;
  const FINT = pal.tail || pal.fin;

  const ctx = createRigContext(OL, "#686868");
  const { track, uniforms, makeOutlineMat, makeFishMat } = ctx;
  const { root, pitchGroup, yawGroup, bodyGroup } = baseGroups();

  // drawLeopard: c.translate(0, 0.004)
  const oy2 = 0.004;
  const to3D = (x2: number, y2: number): Pt => [x2, -(y2 + oy2)];
  const xTail = -0.3;
  const hx = 0.322;
  const hy = -(0.046 + oy2); // -0.05
  const xSnout = 0.458;
  const lEnd = 0.408;

  // Strictly monotonic in X so interpCurveY never zig-zags into a W-ribbon at the nose!
  const topPts = sortAscX(
    sampleBezierChain(
      [
        [to3D(-0.3, 0.008), to3D(-0.2, -0.03), to3D(-0.1, -0.048), to3D(0.0, -0.06)],
        [to3D(0.0, -0.06), to3D(0.12, -0.076), to3D(0.25, -0.08), to3D(0.33, -0.066)],
        [to3D(0.33, -0.066), to3D(0.39, -0.054), to3D(0.436, -0.028), to3D(xSnout, 0.004)],
      ],
      24
    )
  );
  const botPts = sortAscX(
    sampleBezierChain(
      [
        [to3D(-0.305, 0.05), to3D(-0.26, 0.058), to3D(-0.2, 0.07), to3D(-0.1, 0.084)],
        [to3D(-0.1, 0.084), to3D(0.05, 0.104), to3D(0.2, 0.108), to3D(0.3, 0.09)],
        [to3D(0.3, 0.09), to3D(0.345, 0.085), to3D(0.386, 0.075), to3D(lEnd, 0.062)],
      ],
      24
    )
  );

  const evalZ = (x: number) => {
    const t = clamp((x - xTail) / (xSnout - xTail), 0, 1);
    const base = 0.016 + 0.078 * Math.sin(Math.pow(t, 0.72) * Math.PI);
    return x > 0.29 ? base * clamp(1 - (x - 0.29) / 0.22, 0.34, 1) : base;
  };

  const { mapUV, beginCanvas2D } = createWorldMapper(-0.34, 0.49, -0.13, 0.1, 512);

  const paintLeopardSpots = (c: CanvasRenderingContext2D, list: [number, number, number, number, number][]) => {
    for (const [x, y, rx, ry, rot] of list) {
      c.fillStyle = SPOT;
      drawBlob(c, x, y, rx, ry, rot);
      c.fillStyle = rgbaHex(mixHex(SPOT, "#000000", 0.35), 0.45);
      drawBlob(c, x - rx * 0.12, y + ry * 0.1, rx * 0.62, ry * 0.6, rot);
    }
  };

  const bodyCv = document.createElement("canvas");
  bodyCv.width = 512;
  bodyCv.height = 512;
  const bc = bodyCv.getContext("2d")!;
  beginCanvas2D(bc, 0, oy2);

  bc.fillStyle = makeLin(bc, 0, -0.08, 0, 0.105, [
    [0, mixHex(B, D, 0.42)],
    [0.3, B],
    [0.62, mixHex(B, BEL, 0.52)],
    [0.84, mixHex(BEL, B, 0.14)],
    [1, mixHex(BEL, D, 0.3)],
  ]);
  bc.fillRect(-0.38, -0.18, 0.92, 0.36);

  drawGlow(bc, 0.05, -0.02, 0.28, 0.028, -0.04, "255,246,206", 0.16);

  // Saddles across the back
  paintLeopardSpots(bc, [
    [0.305, -0.058, 0.034, 0.026, 0.1],
    [0.212, -0.058, 0.04, 0.032, 0.05],
    [0.09, -0.052, 0.042, 0.034, 0],
    [-0.028, -0.042, 0.042, 0.032, -0.08],
    [-0.135, -0.026, 0.036, 0.028, -0.14],
    [-0.222, -0.006, 0.03, 0.022, -0.2],
    [-0.282, 0.014, 0.02, 0.016, -0.25],
  ]);
  // Flank & lower spots
  paintLeopardSpots(bc, [
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

  // Nostril on overhanging snout
  bc.fillStyle = rgbaHex(OL, 0.72);
  drawBlob(bc, 0.428, 0.004, 0.005, 0.0035, 0.45);

  // 3 gill slits
  bc.strokeStyle = rgbaHex(OL, 0.46);
  bc.lineWidth = 0.004;
  for (let i = 0; i < 3; i++) {
    const gx = 0.292 - i * 0.017;
    bc.beginPath();
    bc.moveTo(gx + 0.004, 0.022);
    bc.quadraticCurveTo(gx - 0.006, 0.042, gx + 0.002, 0.062);
    bc.stroke();
  }
  bc.restore();

  const bodyTex = track(new THREE.CanvasTexture(bodyCv));
  bodyTex.colorSpace = THREE.SRGBColorSpace;
  bodyTex.anisotropy = maxAnisotropy;

  const evalTop = (x: number) => interpCurveY(topPts, x);
  const evalBot = (x: number) => interpCurveY(botPts, x);
  // Roof of underslung mouth (hx..ux), then smooth underside of overhanging shark snout (ux..xSnout)
  const ux = 0.412;
  const evalUpperPalate = (x: number) => {
    if (x <= ux) {
      const t = clamp((x - (hx - 0.012)) / (ux - (hx - 0.012)), 0, 1);
      return hy + 0.005 * t;
    }
    const t = clamp((x - ux) / (xSnout - ux), 0, 1);
    return hy + 0.005 + 0.018 * Math.pow(t, 1.35);
  };
  const evalUnifiedBot = blendBotToPalate(evalBot, evalUpperPalate, hx, 0.028, 0.012);
  const evalMidY = (x: number) => (evalTop(x) + evalUnifiedBot(x)) * 0.5;

  const bodyGeo = track(
    buildLoftedSurface({
      xStart: xTail,
      xEnd: xSnout,
      uSteps: 56,
      vSteps: 28,
      evalTopY: evalTop,
      evalBotY: evalUnifiedBot,
      evalHalfZ: evalZ,
      mapUV,
      roundFront: true,
      rearBulge: 0.004,
    })
  );
  const bodyMat = makeFishMat(bodyTex);
  injectSpineShader(bodyMat, uniforms, 0, 0);
  const leopardMask = bodySpineOutlineMask(
    evalMidY,
    [
      { x0: 0.05, x1: 0.214, top: true },
      { x0: -0.238, x1: -0.128, top: true },
      { x0: -0.082, x1: -0.012, top: false },
      { x0: -0.22, x1: -0.158, top: false },
    ],
    0.026
  );
  bodyGroup.add(
    new THREE.Mesh(bodyGeo, bodyMat),
    new THREE.Mesh(track(buildOutlineGeometry(bodyGeo, 0.004, leopardMask)), makeOutlineMat(0, 0))
  );

  // Unified cranium owns upper snout; upperJawGroup kept as empty compat group
  const upperJawGroup = new THREE.Group();
  upperJawGroup.position.set(hx, hy, 0);
  bodyGroup.add(upperJawGroup);

  // Lower Under-slung Jaw (cleanly below upper palate across full length hx..lEnd)
  const lowerJawGroup = new THREE.Group();
  lowerJawGroup.position.set(hx, hy, 0);
  bodyGroup.add(lowerJawGroup);
  const lGeo = track(
    buildLoftedSurface({
      xStart: hx - 0.022,
      xEnd: lEnd,
      uSteps: 18,
      vSteps: 20,
      evalTopY: (x) => {
        const t = clamp((x - hx) / (lEnd - hx), 0, 1);
        return hy - 0.004 + 0.006 * t;
      },
      evalBotY: evalBot,
      evalHalfZ: (x) => evalZ(x) * 0.84,
      mapUV,
      localOffsetX: hx,
      localOffsetY: hy,
      roundFront: true,
      rearInsetAt: (x) => (x < hx ? 0.78 + 0.2 * clamp((x - (hx - 0.022)) / 0.022, 0, 1) : 1),
    })
  );
  lowerJawGroup.add(
    new THREE.Mesh(lGeo, bodyMat),
    new THREE.Mesh(track(buildOutlineGeometry(lGeo, 0.0038, jawOutlineMask(0.008, 0.044))), makeOutlineMat(hx, hy))
  );

  const teethMat = makeTeethMat(track);
  addToothConeRow(
    bodyGroup,
    track,
    5,
    hx + 0.018,
    lEnd - 0.008,
    (t) => hy + 0.001 + 0.007 * t,
    (t) => evalZ(hx + 0.018 + (lEnd - 0.008 - (hx + 0.018)) * t) * 0.62,
    0.0032,
    0.0095,
    false,
    teethMat
  );
  addToothConeRow(
    lowerJawGroup,
    track,
    5,
    0.016,
    lEnd - hx - 0.016,
    (t) => -0.002 + 0.003 * t,
    (t) => evalZ(hx + 0.016 + (lEnd - hx - 0.032) * t) * 0.56,
    0.0029,
    0.0085,
    true,
    teethMat
  );

  const { mouthInterior, tongueMesh } = createOralParts(
    ctx,
    bodyGroup,
    lowerJawGroup,
    hx,
    hy,
    "#4a0f1a",
    "#e46c80",
    [0.032, 0.018, 0.022],
    [0.022, 0.008, 0.014],
    0.024
  );

  // First Dorsal Fin: EXACT 2D sweep (+0.214 -> +0.122 -> +0.050) with leopard spots!
  const d1Shape = new THREE.Shape();
  d1Shape.moveTo(...to3D(0.214, -0.058));
  d1Shape.bezierCurveTo(...to3D(0.186, -0.1), ...to3D(0.154, -0.146), ...to3D(0.122, -0.166));
  d1Shape.quadraticCurveTo(...to3D(0.108, -0.16), ...to3D(0.11, -0.142));
  d1Shape.bezierCurveTo(...to3D(0.104, -0.104), ...to3D(0.082, -0.08), ...to3D(0.05, -0.058));
  d1Shape.lineTo(...to3D(0.2, -0.042));
  d1Shape.closePath();
  bodyGroup.add(
    makeSpineFinMesh(ctx, d1Shape, 0, 0, 0.0038, 0.001, (fc) => {
      fc.fillStyle = makeLin(fc, 0.14, 0.05, 0.12, 0.16, [
        [0, mixHex(B, FIN, 0.35)],
        [1, FIN],
      ]);
      fc.fillRect(0.02, 0.01, 0.24, 0.19);
      fc.fillStyle = SPOT;
      drawBlob(fc, ...to3D(0.125, -0.13), 0.028, 0.02, 0.6);
      drawBlob(fc, ...to3D(0.15, -0.075), 0.016, 0.012, 0);
    }, maxAnisotropy, true, 0.0014, undefined, finRootMaskY(0.054, 0.028, true)).mesh
  );

  // Second Dorsal Fin: EXACT 2D sweep (-0.128 -> -0.19 -> -0.238) + spot
  const d2Shape = new THREE.Shape();
  d2Shape.moveTo(...to3D(-0.128, -0.034));
  d2Shape.bezierCurveTo(...to3D(-0.146, -0.062), ...to3D(-0.168, -0.082), ...to3D(-0.19, -0.086));
  d2Shape.quadraticCurveTo(...to3D(-0.198, -0.078), ...to3D(-0.196, -0.066));
  d2Shape.bezierCurveTo(...to3D(-0.204, -0.046), ...to3D(-0.218, -0.03), ...to3D(-0.238, -0.018));
  d2Shape.lineTo(...to3D(-0.14, -0.012));
  d2Shape.closePath();
  bodyGroup.add(
    makeSpineFinMesh(ctx, d2Shape, 0, 0, 0.0032, 0.0008, (fc) => {
      fc.fillStyle = makeLin(fc, -0.16, 0.02, -0.19, 0.09, [
        [0, mixHex(B, FIN, 0.35)],
        [1, FIN],
      ]);
      fc.fillRect(-0.27, 0.0, 0.18, 0.12);
      fc.fillStyle = SPOT;
      drawBlob(fc, ...to3D(-0.186, -0.066), 0.015, 0.01, 0.6);
    }, maxAnisotropy, true, 0.0013, undefined, finRootMaskY(0.022, 0.022, true)).mesh
  );

  // Pelvic + Anal Fins
  const pelShape = new THREE.Shape();
  pelShape.moveTo(...to3D(-0.012, 0.086));
  pelShape.bezierCurveTo(...to3D(-0.03, 0.108), ...to3D(-0.054, 0.126), ...to3D(-0.082, 0.132));
  pelShape.quadraticCurveTo(...to3D(-0.08, 0.108), ...to3D(-0.072, 0.08));
  pelShape.closePath();
  bodyGroup.add(
    makeSpineFinMesh(ctx, pelShape, 0, 0, 0.003, 0.0008, (fc) => {
      fc.fillStyle = FIN;
      fc.fillRect(-0.12, -0.16, 0.14, 0.12);
    }, maxAnisotropy, true, 0.0012, undefined, finRootMaskY(-0.09, 0.022, false)).mesh
  );

  const analShape = new THREE.Shape();
  analShape.moveTo(...to3D(-0.158, 0.07));
  analShape.bezierCurveTo(...to3D(-0.176, 0.09), ...to3D(-0.198, 0.106), ...to3D(-0.22, 0.108));
  analShape.quadraticCurveTo(...to3D(-0.216, 0.088), ...to3D(-0.212, 0.062));
  analShape.closePath();
  bodyGroup.add(
    makeSpineFinMesh(ctx, analShape, 0, 0, 0.003, 0.0008, (fc) => {
      fc.fillStyle = FIN;
      fc.fillRect(-0.25, -0.14, 0.13, 0.1);
    }, maxAnisotropy, true, 0.0012, undefined, finRootMaskY(-0.072, 0.022, false)).mesh
  );

  // Long Spotted Upper-Lobe Heterocercal Tail
  const tailPivot = new THREE.Group();
  tailPivot.position.set(xTail, -0.028, 0);
  bodyGroup.add(tailPivot);
  const tShape = new THREE.Shape();
  tShape.moveTo(0.03, 0.02);
  tShape.bezierCurveTo(-0.03, 0.046, -0.1, 0.09, -0.156, 0.126);
  tShape.quadraticCurveTo(-0.166, 0.112, -0.154, 0.096);
  tShape.lineTo(-0.136, 0.08);
  tShape.lineTo(-0.146, 0.064);
  tShape.bezierCurveTo(-0.11, 0.036, -0.076, 0.008, -0.064, -0.016);
  tShape.bezierCurveTo(-0.068, -0.044, -0.078, -0.068, -0.094, -0.088);
  tShape.quadraticCurveTo(-0.062, -0.08, -0.036, -0.054);
  tShape.bezierCurveTo(-0.018, -0.04, 0.002, -0.032, 0.028, -0.028);
  tShape.closePath();
  tailPivot.add(
    makeSpineFinMesh(ctx, tShape, xTail, -0.028, 0.0038, 0.001, (fc) => {
      fc.fillStyle = makeLin(fc, 0.02, 0, -0.16, 0.08, [
        [0, mixHex(B, FINT, 0.35)],
        [1, FINT],
      ]);
      fc.fillRect(-0.2, -0.12, 0.26, 0.28);
      fc.fillStyle = SPOT;
      drawBlob(fc, -0.03, 0.02, 0.018, 0.012, 0.5);
      drawBlob(fc, -0.085, 0.06, 0.016, 0.01, 0.55);
      drawBlob(fc, -0.13, 0.09, 0.012, 0.008, 0.55);
      drawBlob(fc, -0.045, -0.042, 0.012, 0.008, -0.3);
    }, maxAnisotropy, false, 0.0014).mesh
  );

  // Spotted Pectoral Fin anchored cleanly at surfaceZ
  const pShape = new THREE.Shape();
  pShape.moveTo(0.033, 0.01);
  pShape.bezierCurveTo(0.021, -0.028, -0.011, -0.066, -0.059, -0.088);
  pShape.quadraticCurveTo(-0.071, -0.084, -0.067, -0.072);
  pShape.bezierCurveTo(-0.055, -0.048, -0.051, -0.024, -0.037, -0.004);
  pShape.closePath();
  const pecObj = makeSpineFinMesh(ctx, pShape, 0, 0, 0.0034, 0.0009, (fc) => {
    fc.fillStyle = makeLin(fc, 0.02, 0, -0.06, -0.09, [
      [0, mixHex(B, FIN, 0.35)],
      [1, FIN],
    ]);
    fc.fillRect(-0.1, -0.12, 0.16, 0.16);
    fc.fillStyle = SPOT;
    drawBlob(fc, -0.025, -0.042, 0.015, 0.01, 0.7);
    drawBlob(fc, -0.049, -0.072, 0.011, 0.008, 0.7);
  }, maxAnisotropy, false, 0.0013);
  const pecX = 0.235;
  const pecY = -0.076;
  const pecZ = surfaceZAt(evalTop, evalUnifiedBot, evalZ, pecX, pecY, 0.22, 1.0) + 0.006;
  const pecLeft = new THREE.Group();
  pecLeft.position.set(pecX, pecY, pecZ);
  pecLeft.rotation.x = -0.18;
  pecObj.mesh.rotation.y = 0.28;
  pecLeft.add(pecObj.mesh);
  const pecRight = new THREE.Group();
  pecRight.position.set(pecX, pecY, -pecZ);
  pecRight.rotation.x = 0.18;
  const pecMeshR = pecObj.mesh.clone();
  pecMeshR.rotation.y = -0.28;
  pecRight.add(pecMeshR);
  bodyGroup.add(pecLeft, pecRight);

  const pelvicFin = new THREE.Group();
  bodyGroup.add(pelvicFin);

  const leoEy = -(-0.014 + oy2);
  const { eyesNormal, eyesPupil, eyesHappy } = createEyePair(ctx, bodyGroup, {
    ex: 0.362,
    ey: leoEy,
    ez: surfaceZAt(evalTop, evalUnifiedBot, evalZ, 0.362, leoEy),
    er: 0.026,
    yawRot: 0.34,
    irisColor: pal.iris || "#7a3b12",
    rimColor: OL,
    lidColor: mixHex(B, D, 0.52),
    lidTilt: -0.22,
  });

  const { biteRing, biteRingMat } = createBiteRing(ctx, bodyGroup, xSnout + 0.01, hy + 0.01, FIN, 0.048);

  return {
    speciesKey: sp.id,
    tailPivotX: xTail,
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
      for (const d of ctx.disposables) d.dispose();
    },
  };
}

// =====================================================================================
// 3. SAILFISH (Kilat — Midnight Cobalt, Golden Flank Band, 12 Cyan Bars, Towering Sail)
// =====================================================================================
function createSailfish3DRig(sp: Species, maxAnisotropy: number): Fish3DRig {
  const pal = sp.pal;
  const DK = "#081c54";
  const MID = "#154fb8";
  const BLU = "#247ee6";
  const CYAN = "#38c0ff";
  const CYL = "#90e8ff";
  const GOLD = "#ffaa08";
  const YEL = "#ffe44d";
  const ORG = "#e56a00";
  const WH = pal.belly || "#ffffff";
  const OL = pal.outline || "#071638";

  const ctx = createRigContext(OL, "#444444");
  const { track, uniforms, makeOutlineMat, makeFishMat } = ctx;
  const { root, pitchGroup, yawGroup, bodyGroup } = baseGroups();

  const xTail = -0.342;
  const hx = 0.222;
  const hy = -0.022;
  const xSnout = 0.345;
  const xBillTip = 0.486;

  const topPts = sortAscX(
    sampleBezierChain(
      [
        [[xTail, 0.018], [-0.24, 0.056], [-0.08, 0.104], [0.075, 0.104]],
        [[0.075, 0.104], [0.155, 0.104], [0.218, 0.072], [0.285, 0.042]],
        [[0.285, 0.042], [0.325, 0.03], [0.34, 0.024], [xSnout, 0.016]],
      ],
      24
    )
  );
  const botPts = sortAscX(
    sampleBezierChain(
      [
        [[xTail, -0.018], [-0.075, -0.094], [0.085, -0.106], [0.195, -0.082]],
        [[0.195, -0.082], [0.282, -0.056], [0.33, -0.036], [0.344, -0.025]],
      ],
      24
    )
  );

  const evalZ = (x: number) => {
    const t = clamp((x - xTail) / (xSnout - xTail), 0, 1);
    const base = 0.015 + 0.088 * Math.sin(Math.pow(t, 0.75) * Math.PI);
    return x > 0.24 ? base * clamp(1 - (x - 0.24) / 0.14, 0.26, 1) : base;
  };

  const { mapUV, beginCanvas2D } = createWorldMapper(-0.38, 0.42, -0.13, 0.13, 512);

  // Paint Marlin Coat: Pearly Belly + Golden-Amber Flank Band + Midnight Cobalt Dorsal + 12 Electric Cyan Stripes + Gill Operculum
  const bodyCv = document.createElement("canvas");
  bodyCv.width = 512;
  bodyCv.height = 512;
  const bc = bodyCv.getContext("2d")!;
  beginCanvas2D(bc, 0, 0);

  bc.fillStyle = makeLin(bc, 0, 0.01, 0, 0.12, [
    [0, WH],
    [0.62, "#f0f7ff"],
    [1, "#c4d9f0"],
  ]);
  bc.fillRect(-0.42, -0.16, 0.9, 0.34);

  // Golden-amber flank band
  bc.fillStyle = makeLin(bc, 0, -0.038, 0, 0.065, [
    [0, "rgba(255,228,77,0)"],
    [0.24, YEL],
    [0.54, GOLD],
    [0.78, ORG],
    [1, "rgba(255,190,60,0)"],
  ]);
  bc.beginPath();
  bc.moveTo(-0.35, -0.012);
  bc.bezierCurveTo(-0.15, -0.036, 0.08, -0.048, 0.258, -0.032);
  bc.lineTo(0.258, 0.056);
  bc.bezierCurveTo(0.06, 0.066, -0.15, 0.044, -0.35, 0.016);
  bc.closePath();
  bc.fill();

  // Midnight-navy to cobalt dorsal coat
  bc.fillStyle = makeLin(bc, 0, -0.115, 0, 0.012, [
    [0, DK],
    [0.42, MID],
    [0.78, BLU],
    [1, "rgba(36,126,230,0)"],
  ]);
  bc.beginPath();
  bc.moveTo(-0.35, -0.026);
  bc.bezierCurveTo(-0.2, -0.075, 0.0, -0.12, 0.22, -0.112);
  bc.lineTo(0.38, -0.01);
  bc.bezierCurveTo(0.2, -0.012, 0.05, -0.014, -0.02, -0.014);
  bc.bezierCurveTo(-0.16, -0.014, -0.26, -0.006, -0.35, -0.002);
  bc.closePath();
  bc.fill();

  // 12 Electric Sky-Cyan vertical marlin bars
  const stripeXs = [0.135, 0.095, 0.054, 0.012, -0.03, -0.072, -0.114, -0.156, -0.196, -0.236, -0.274, -0.31];
  for (let i = 0; i < stripeXs.length; i++) {
    const sx = stripeXs[i];
    const w = 0.012 - i * 0.00055;
    const botY = 0.032 - i * 0.0018;
    bc.fillStyle = makeLin(bc, sx, -0.095, sx, botY, [
      [0, CYL],
      [0.45, CYAN],
      [0.85, "rgba(56,192,255,0.65)"],
      [1, "rgba(56,192,255,0)"],
    ]);
    bc.beginPath();
    bc.moveTo(sx - w * 0.45, -0.11);
    bc.quadraticCurveTo(sx + 0.006, -0.04, sx - w * 0.35, botY);
    bc.lineTo(sx + w * 0.65, botY);
    bc.quadraticCurveTo(sx + w + 0.006, -0.04, sx + w * 0.75, -0.11);
    bc.closePath();
    bc.fill();
  }

  // Aqua dorsal highlight + Gill operculum arcs
  bc.strokeStyle = "rgba(165, 238, 255, 0.78)";
  bc.lineWidth = 0.0085;
  bc.beginPath();
  bc.moveTo(-0.26, -0.038);
  bc.bezierCurveTo(-0.1, -0.076, 0.06, -0.088, 0.215, -0.064);
  bc.stroke();

  bc.strokeStyle = "rgba(32, 66, 118, 0.72)";
  bc.lineWidth = 0.0044;
  bc.beginPath();
  bc.moveTo(0.175, -0.042);
  bc.bezierCurveTo(0.145, 0.005, 0.155, 0.062, 0.21, 0.086);
  bc.moveTo(0.194, -0.024);
  bc.bezierCurveTo(0.172, 0.012, 0.18, 0.056, 0.222, 0.076);
  bc.stroke();
  bc.restore();

  const bodyTex = track(new THREE.CanvasTexture(bodyCv));
  bodyTex.colorSpace = THREE.SRGBColorSpace;
  bodyTex.anisotropy = maxAnisotropy;

  const evalTop = (x: number) => interpCurveY(topPts, x);
  const evalBot = (x: number) => interpCurveY(botPts, x);
  const evalUpperPalate = () => -0.008;
  const evalUnifiedBot = blendBotToPalate(evalBot, evalUpperPalate, hx, 0.032, 0.014);
  const evalMidY = (x: number) => (evalTop(x) + evalUnifiedBot(x)) * 0.5;

  const bodyGeo = track(
    buildLoftedSurface({
      xStart: xTail,
      xEnd: xSnout,
      uSteps: 54,
      vSteps: 26,
      evalTopY: evalTop,
      evalBotY: evalUnifiedBot,
      evalHalfZ: evalZ,
      mapUV,
      roundFront: true,
      rearBulge: 0.004,
    })
  );
  const bodyMat = makeFishMat(bodyTex);
  injectSpineShader(bodyMat, uniforms, 0, 0);
  const sailMask = bodySpineOutlineMask(
    evalMidY,
    [
      { x0: -0.246, x1: 0.165, top: true },
      { x0: -0.304, x1: -0.258, top: true },
      { x0: -0.236, x1: -0.135, top: false },
      { x0: 0.036, x1: 0.128, top: false },
    ],
    0.028
  );
  bodyGroup.add(
    new THREE.Mesh(bodyGeo, bodyMat),
    new THREE.Mesh(track(buildOutlineGeometry(bodyGeo, 0.0044, sailMask)), makeOutlineMat(0, 0))
  );

  // Unified cranium owns upper snout; upperJawGroup kept as empty compat group
  const upperJawGroup = new THREE.Group();
  upperJawGroup.position.set(hx, hy, 0);
  bodyGroup.add(upperJawGroup);

  const billLen = xBillTip - 0.305;
  const billGeo = track(new THREE.ConeGeometry(0.013, billLen, 12));
  billGeo.rotateZ(-Math.PI * 0.5);
  const billMat = track(
    new THREE.MeshPhysicalMaterial({
      color: mixHex(DK, "#3c68b8", 0.35),
      emissive: DK,
      emissiveIntensity: 0.14,
      roughness: 0.56,
      clearcoat: 0.06,
      envMapIntensity: 0.08,
    })
  );
  const billMesh = new THREE.Mesh(billGeo, billMat);
  billMesh.position.set(0.305 + billLen * 0.5, 0.026 + hy, 0);
  billMesh.add(new THREE.Mesh(track(buildOutlineGeometry(billGeo, 0.0022)), makeOutlineMat(0, 0, false)));
  bodyGroup.add(billMesh);

  // Lower Jaw
  const lowerJawGroup = new THREE.Group();
  lowerJawGroup.position.set(hx, hy, 0);
  bodyGroup.add(lowerJawGroup);
  const lGeo = track(
    buildLoftedSurface({
      xStart: hx - 0.022,
      xEnd: 0.344,
      uSteps: 18,
      vSteps: 18,
      evalTopY: () => -0.01,
      evalBotY: evalBot,
      evalHalfZ: (x) => evalZ(x) * 0.86,
      mapUV,
      localOffsetX: hx,
      localOffsetY: hy,
      roundFront: true,
      rearInsetAt: (x) => (x < hx ? 0.78 + 0.2 * clamp((x - (hx - 0.022)) / 0.022, 0, 1) : 1),
    })
  );
  lowerJawGroup.add(
    new THREE.Mesh(lGeo, bodyMat),
    new THREE.Mesh(track(buildOutlineGeometry(lGeo, 0.0038, jawOutlineMask(0.008, 0.044))), makeOutlineMat(hx, hy))
  );

  const { mouthInterior, tongueMesh } = createOralParts(ctx, bodyGroup, lowerJawGroup, hx, hy, "#661220", "#e45e72");

  // Towering Scalloped Sailfish Dorsal Sail (exact drawSailfish: +0.165 -> +0.032 peak -> -0.246!)
  const sailShape = new THREE.Shape();
  sailShape.moveTo(0.165, 0.098);
  sailShape.bezierCurveTo(0.135, 0.178, 0.085, 0.238, 0.032, 0.268);
  sailShape.bezierCurveTo(0.036, 0.215, 0.018, 0.188, -0.015, 0.182);
  sailShape.quadraticCurveTo(-0.042, 0.16, -0.068, 0.154);
  sailShape.quadraticCurveTo(-0.098, 0.136, -0.125, 0.128);
  sailShape.quadraticCurveTo(-0.155, 0.108, -0.182, 0.096);
  sailShape.quadraticCurveTo(-0.214, 0.074, -0.246, 0.056);
  sailShape.quadraticCurveTo(-0.04, 0.075, 0.165, 0.098);
  sailShape.closePath();
  bodyGroup.add(
    makeSpineFinMesh(ctx, sailShape, 0, 0, 0.004, 0.001, (fc) => {
      fc.fillStyle = makeLin(fc, 0.03, 0.268, 0.0, 0.07, [
        [0, "#0b1a52"],
        [0.36, "#1846a8"],
        [0.75, "#2672d8"],
        [1, "#44a6ff"],
      ]);
      fc.fillRect(-0.28, 0.04, 0.5, 0.26);
      // Fin spine rays
      fc.strokeStyle = "rgba(10, 22, 70, 0.55)";
      fc.lineWidth = 0.0032;
      for (const [x0, y0, x1, y1] of [
        [0.12, 0.098, 0.045, 0.245],
        [0.085, 0.1, 0.024, 0.22],
        [0.05, 0.1, -0.012, 0.18],
        [0.015, 0.096, -0.056, 0.155],
        [-0.025, 0.09, -0.105, 0.132],
        [-0.07, 0.082, -0.158, 0.104],
        [-0.12, 0.072, -0.208, 0.078],
      ]) {
        fc.beginPath();
        fc.moveTo(x0, y0);
        fc.lineTo(x1, y1);
        fc.stroke();
      }
      // Cyan highlight veins
      fc.strokeStyle = "rgba(130, 215, 255, 0.42)";
      fc.lineWidth = 0.0026;
      fc.beginPath();
      fc.moveTo(0.135, 0.105);
      fc.quadraticCurveTo(0.095, 0.185, 0.04, 0.246);
      fc.moveTo(0.095, 0.102);
      fc.quadraticCurveTo(0.06, 0.165, 0.026, 0.215);
      fc.stroke();
    }, maxAnisotropy, true, 0.0014, undefined, (x, y) => smoothstep(0.068 + x * 0.11, 0.102 + x * 0.11, y)).mesh
  );

  // Rear Dorsal & Anal Finlets + Main Anal Fin
  const d2Shape = new THREE.Shape();
  d2Shape.moveTo(-0.258, 0.036);
  d2Shape.quadraticCurveTo(-0.278, 0.072, -0.304, 0.064);
  d2Shape.quadraticCurveTo(-0.29, 0.038, -0.292, 0.025);
  d2Shape.closePath();
  bodyGroup.add(
    makeSpineFinMesh(ctx, d2Shape, 0, 0, 0.003, 0.0007, (fc) => {
      fc.fillStyle = makeLin(fc, -0.28, 0.072, -0.28, 0.025, [
        [0, DK],
        [1, MID],
      ]);
      fc.fillRect(-0.33, 0.01, 0.1, 0.08);
    }, maxAnisotropy, true, 0.0012, undefined, finRootMaskY(0.032, 0.02, true)).mesh
  );

  const analShape = new THREE.Shape();
  analShape.moveTo(-0.135, -0.058);
  analShape.bezierCurveTo(-0.17, -0.092, -0.215, -0.138, -0.236, -0.152);
  analShape.bezierCurveTo(-0.222, -0.112, -0.218, -0.076, -0.222, -0.044);
  analShape.closePath();
  bodyGroup.add(
    makeSpineFinMesh(ctx, analShape, 0, 0, 0.0032, 0.0008, (fc) => {
      fc.fillStyle = makeLin(fc, -0.17, -0.05, -0.22, -0.15, [
        [0, BLU],
        [0.45, MID],
        [1, DK],
      ]);
      fc.fillRect(-0.26, -0.17, 0.15, 0.14);
    }, maxAnisotropy, true, 0.0013, undefined, finRootMaskY(-0.052, 0.022, false)).mesh
  );

  // Front Sleek Pelvic Blade (cobalt + icy-white stripe)
  const pelShape = new THREE.Shape();
  pelShape.moveTo(0.128, -0.088);
  pelShape.bezierCurveTo(0.106, -0.158, 0.078, -0.214, 0.036, -0.252);
  pelShape.bezierCurveTo(0.068, -0.2, 0.095, -0.142, 0.108, -0.092);
  pelShape.closePath();
  bodyGroup.add(
    makeSpineFinMesh(ctx, pelShape, 0, 0, 0.0032, 0.0008, (fc) => {
      fc.fillStyle = makeLin(fc, 0.12, -0.09, 0.04, -0.25, [
        [0, MID],
        [0.6, DK],
        [1, "#07143e"],
      ]);
      fc.fillRect(0.01, -0.28, 0.14, 0.22);
      fc.strokeStyle = "rgba(215, 240, 255, 0.78)";
      fc.lineWidth = 0.0042;
      fc.beginPath();
      fc.moveTo(0.118, -0.096);
      fc.quadraticCurveTo(0.095, -0.152, 0.064, -0.205);
      fc.stroke();
    }, maxAnisotropy, true, 0.0013, undefined, finRootMaskY(-0.094, 0.024, false)).mesh
  );

  // Crescent Forked Caudal Tail
  const tailPivot = new THREE.Group();
  tailPivot.position.set(xTail, 0, 0);
  bodyGroup.add(tailPivot);
  const tShape = new THREE.Shape();
  tShape.moveTo(0.012, 0.016);
  tShape.bezierCurveTo(-0.033, 0.068, -0.083, 0.138, -0.132, 0.176);
  tShape.bezierCurveTo(-0.094, 0.108, -0.066, 0.045, -0.056, 0);
  tShape.bezierCurveTo(-0.068, -0.055, -0.094, -0.118, -0.126, -0.184);
  tShape.bezierCurveTo(-0.08, -0.14, -0.034, -0.072, 0.012, -0.018);
  tShape.closePath();
  tailPivot.add(
    makeSpineFinMesh(ctx, tShape, xTail, 0, 0.004, 0.001, (fc) => {
      fc.fillStyle = makeLin(fc, 0.01, 0, -0.14, 0, [
        [0, MID],
        [0.45, DK],
        [1, "#07143e"],
      ]);
      fc.fillRect(-0.17, -0.22, 0.22, 0.44);
      fc.strokeStyle = "rgba(105, 195, 255, 0.48)";
      fc.lineWidth = 0.0036;
      fc.beginPath();
      fc.moveTo(-0.018, 0.022);
      fc.quadraticCurveTo(-0.068, 0.09, -0.122, 0.16);
      fc.moveTo(-0.018, -0.022);
      fc.quadraticCurveTo(-0.068, -0.09, -0.116, -0.168);
      fc.stroke();
      drawFinRays(
        fc,
        [-0.003, 0],
        [
          [-0.11, 0.138],
          [-0.09, 0.088],
          [-0.064, 0.035],
          [-0.066, -0.042],
          [-0.09, -0.098],
          [-0.108, -0.146],
        ],
        "rgba(9, 24, 72, 0.55)",
        0.0028
      );
    }, maxAnisotropy, false, 0.0014).mesh
  );

  // Swept Pectoral Fins
  const pShape = new THREE.Shape();
  pShape.moveTo(0, 0.014);
  pShape.bezierCurveTo(-0.055, 0.022, -0.135, 0.002, -0.195, -0.024);
  pShape.bezierCurveTo(-0.132, -0.036, -0.058, -0.044, -0.002, -0.018);
  pShape.closePath();
  const pecObj = makeSpineFinMesh(ctx, pShape, 0, 0, 0.0034, 0.0009, (fc) => {
    fc.fillStyle = makeLin(fc, 0, 0.015, -0.18, -0.025, [
      [0, BLU],
      [0.5, MID],
      [1, DK],
    ]);
    fc.fillRect(-0.22, -0.06, 0.25, 0.11);
    fc.strokeStyle = "rgba(130, 222, 255, 0.65)";
    fc.lineWidth = 0.0038;
    fc.beginPath();
    fc.moveTo(-0.006, 0.01);
    fc.bezierCurveTo(-0.058, 0.016, -0.128, 0, -0.182, -0.022);
    fc.stroke();
  }, maxAnisotropy, false, 0.0013);
  const pecZ = surfaceZAt(evalTop, evalUnifiedBot, evalZ, 0.14, -0.034, 0.22, 1.0) + 0.006;
  const pecLeft = new THREE.Group();
  pecLeft.position.set(0.14, -0.034, pecZ);
  pecLeft.add(pecObj.mesh);
  const pecRight = new THREE.Group();
  pecRight.position.set(0.14, -0.034, -pecZ);
  pecRight.add(pecObj.mesh.clone());
  bodyGroup.add(pecLeft, pecRight);

  const pelvicFin = new THREE.Group();
  bodyGroup.add(pelvicFin);

  const { eyesNormal, eyesPupil, eyesHappy } = createEyePair(ctx, bodyGroup, {
    ex: 0.24,
    ey: 0.02,
    ez: surfaceZAt(evalTop, evalUnifiedBot, evalZ, 0.24, 0.02),
    er: 0.036,
    irisColor: pal.iris || "#7a3b12",
    rimColor: OL,
  });

  const { biteRing, biteRingMat } = createBiteRing(ctx, bodyGroup, xBillTip + 0.01, 0, CYAN, 0.052);

  return {
    speciesKey: sp.id,
    tailPivotX: xTail,
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
      for (const d of ctx.disposables) d.dispose();
    },
  };
}

// =====================================================================================
// 4. STINGRAY (Pari — Cobalt Spotted Mantle, Spiracle, 5 Gill Slits, Undulating Wings)
// =====================================================================================
function createStingray3DRig(sp: Species, maxAnisotropy: number): Fish3DRig {
  const pal = sp.pal;
  const OL = pal.outline || "#071638";
  const DK = pal.dark || "#0a2258";
  const MID = pal.body || "#184b96";
  const BLU = "#286ec2";
  const SPOT = pal.spot || "#74c2f6";
  const CREAM = pal.belly || "#f5efe6";
  const CR_SH = "#beb9cb";

  const ctx = createRigContext(OL, "#4e4e4e");
  const { track, uniforms, makeOutlineMat, makeFishMat } = ctx;
  const { root, pitchGroup, yawGroup, bodyGroup } = baseGroups();

  const xBack = -0.18;
  const xNose = 0.408;

  const topPts = sortAscX(
    sampleBezierChain(
      [
        [[-0.18, 0.018], [-0.08, 0.075], [0.1, 0.095], [0.225, 0.078]],
        [[0.225, 0.078], [0.275, 0.076], [0.302, 0.056], [0.342, 0.046]],
        [[0.342, 0.046], [0.382, 0.038], [0.412, 0.026], [xNose, 0.009]],
      ],
      24
    )
  );
  const botPts = sortAscX(
    sampleBezierChain(
      [
        [[-0.18, -0.015], [-0.065, -0.062], [0.065, -0.09], [0.185, -0.078]],
        [[0.185, -0.078], [0.295, -0.072], [0.37, -0.036], [xNose, -0.009]],
      ],
      24
    )
  );
  const evalZ = (x: number) => {
    const t = clamp((x - xBack) / (xNose - xBack), 0, 1);
    return 0.022 + 0.16 * Math.sin(Math.pow(t, 0.72) * Math.PI);
  };

  const { mapUV, beginCanvas2D } = createWorldMapper(-0.22, 0.44, -0.11, 0.11, 512);

  // Paint Stingray Mantle: Cream Belly + Cobalt Mantle + Sky-Blue Spots + 5 Throat Gill Slits + Spiracle
  const bodyCv = document.createElement("canvas");
  bodyCv.width = 512;
  bodyCv.height = 512;
  const bc = bodyCv.getContext("2d")!;
  beginCanvas2D(bc, 0, 0);

  bc.fillStyle = makeLin(bc, 0, 0.02, 0, 0.095, [
    [0, CREAM],
    [0.65, "#ebe4da"],
    [1, CR_SH],
  ]);
  bc.fillRect(-0.24, -0.14, 0.72, 0.28);

  // Cobalt dorsal mantle coat
  bc.fillStyle = makeLin(bc, 0, -0.095, 0, 0.032, [
    [0, DK],
    [0.48, MID],
    [0.92, BLU],
    [1, "rgba(40,110,194,0)"],
  ]);
  bc.beginPath();
  bc.moveTo(-0.2, -0.03);
  bc.bezierCurveTo(-0.05, -0.095, 0.16, -0.1, 0.415, -0.012);
  bc.lineTo(0.415, -0.002);
  bc.bezierCurveTo(0.33, 0.002, 0.245, 0.005, 0.145, 0.028);
  bc.bezierCurveTo(0.02, 0.052, -0.09, 0.042, -0.2, 0.015);
  bc.closePath();
  bc.fill();

  // Top sky-blue contour highlight
  bc.strokeStyle = "rgba(150, 222, 255, 0.72)";
  bc.lineWidth = 0.0055;
  bc.beginPath();
  bc.moveTo(0.23, -0.072);
  bc.bezierCurveTo(0.285, -0.066, 0.345, -0.042, 0.398, -0.012);
  bc.stroke();

  // Scattered sky-blue stingray spots
  for (const [sx, sy, rx, ry, rot, a] of [
    [0.08, -0.048, 0.024, 0.011, -0.1, 0.7],
    [-0.02, -0.038, 0.028, 0.013, 0.08, 0.65],
    [-0.1, -0.02, 0.02, 0.01, -0.15, 0.6],
    [0.14, -0.025, 0.018, 0.009, 0.1, 0.65],
    [0.03, -0.01, 0.022, 0.011, 0.0, 0.6],
    [-0.06, 0.005, 0.018, 0.009, 0.12, 0.55],
    [0.11, 0.008, 0.015, 0.008, -0.2, 0.55],
    [0.185, -0.052, 0.013, 0.007, 0.15, 0.6],
  ] as [number, number, number, number, number, number][]) {
    bc.fillStyle = rgbaHex(SPOT, a);
    drawBlob(bc, sx, sy, rx, ry, rot);
  }

  // 5 curved gill slits on cream lower cheek
  bc.strokeStyle = "rgba(38, 48, 72, 0.74)";
  bc.lineWidth = 0.0036;
  for (let g = 0; g < 5; g++) {
    const gx = 0.145 + g * 0.018;
    const gy = 0.054 - g * 0.002;
    bc.beginPath();
    bc.moveTo(gx, gy - 0.01);
    bc.quadraticCurveTo(gx + 0.005, gy, gx - 0.002, gy + 0.011);
    bc.stroke();
  }

  // Oval spiracle behind eye
  bc.beginPath();
  bc.ellipse(0.204, -0.028, 0.01, 0.015, 0.18, 0, Math.PI * 2);
  bc.fillStyle = "#061028";
  bc.fill();
  bc.strokeStyle = "rgba(130, 200, 255, 0.45)";
  bc.lineWidth = 0.003;
  bc.stroke();
  bc.restore();

  const bodyTex = track(new THREE.CanvasTexture(bodyCv));
  bodyTex.colorSpace = THREE.SRGBColorSpace;
  bodyTex.anisotropy = maxAnisotropy;

  const evalTop = (x: number) => interpCurveY(topPts, x);
  const evalBot = (x: number) => interpCurveY(botPts, x);
  const bodyGeo = track(
    buildLoftedSurface({
      xStart: xBack,
      xEnd: xNose,
      uSteps: 36,
      vSteps: 28,
      evalTopY: evalTop,
      evalBotY: evalBot,
      evalHalfZ: evalZ,
      mapUV,
      taper: (s) => 1 - 0.08 * s * s,
      roundFront: true,
      rearBulge: 0.004,
    })
  );
  const bodyMat = makeFishMat(bodyTex);
  injectSpineShader(bodyMat, uniforms, 0, 0);
  bodyGroup.add(
    new THREE.Mesh(bodyGeo, bodyMat),
    new THREE.Mesh(track(buildOutlineGeometry(bodyGeo, 0.0044)), makeOutlineMat(0, 0))
  );

  // Broad Diamond Pectoral Wings with Cream Rolled Margin & Sky-Blue Spots!
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0.115, 0.02);
  wingShape.bezierCurveTo(0.068, 0.15, -0.02, 0.28, -0.115, 0.25);
  wingShape.bezierCurveTo(-0.17, 0.22, -0.185, 0.12, -0.155, 0.018);
  wingShape.closePath();
  const wingObj = makeSpineFinMesh(
    ctx,
    wingShape,
    0,
    0,
    0.007,
    0.0018,
    (fc) => {
      fc.fillStyle = makeLin(fc, 0, 0, 0, 0.28, [
        [0, MID],
        [0.65, DK],
        [0.88, "#ebe4da"],
        [1, CR_SH],
      ]);
      fc.fillRect(-0.22, -0.02, 0.4, 0.34);
      fc.fillStyle = rgbaHex(SPOT, 0.72);
      for (const [wx, wy, wr] of [
        [-0.08, 0.09, 0.018],
        [-0.01, 0.16, 0.02],
        [0.05, 0.12, 0.016],
        [-0.05, 0.21, 0.014],
      ]) {
        drawBlob(fc, wx, wy, wr, wr * 0.8, 0.15);
      }
      fc.strokeStyle = "rgba(255, 252, 245, 0.85)";
      fc.lineWidth = 0.006;
      fc.beginPath();
      fc.moveTo(0.104, 0.028);
      fc.bezierCurveTo(0.058, 0.145, -0.02, 0.265, -0.11, 0.238);
      fc.stroke();
    },
    maxAnisotropy,
    true,
    0.0015,
    undefined,
    finRootMaskY(0.024, 0.032, true)
  );
  const pecLeft = new THREE.Group();
  pecLeft.position.set(0, -0.008, 0.115);
  const wL = wingObj.mesh;
  wL.rotation.x = Math.PI * 0.44;
  pecLeft.add(wL);

  const pecRight = new THREE.Group();
  pecRight.position.set(0, -0.008, -0.115);
  const wR = wingObj.mesh.clone();
  wR.rotation.x = -Math.PI * 0.44;
  pecRight.add(wR);
  bodyGroup.add(pecLeft, pecRight);

  // Ruffled Rear Pelvic Lobes trailing before whip tail
  const pelLobeShape = new THREE.Shape();
  pelLobeShape.moveTo(-0.135, -0.002);
  pelLobeShape.bezierCurveTo(-0.175, 0.01, -0.218, 0.008, -0.235, -0.012);
  pelLobeShape.quadraticCurveTo(-0.2, -0.024, -0.228, -0.044);
  pelLobeShape.quadraticCurveTo(-0.188, -0.056, -0.195, -0.074);
  pelLobeShape.quadraticCurveTo(-0.148, -0.068, -0.118, -0.046);
  pelLobeShape.closePath();
  const pelLobeObj = makeSpineFinMesh(ctx, pelLobeShape, 0, 0, 0.004, 0.001, (fc) => {
    fc.fillStyle = makeLin(fc, -0.14, 0, -0.22, -0.065, [
      [0, MID],
      [1, DK],
    ]);
    fc.fillRect(-0.26, -0.09, 0.16, 0.12);
  }, maxAnisotropy, true, 0.0013, undefined, (x) => smoothstep(-0.125, -0.16, x));
  pelLobeObj.mesh.rotation.x = Math.PI * 0.36;
  bodyGroup.add(pelLobeObj.mesh);

  // Underslung Smiling Mouth Jaws
  const upperJawGroup = new THREE.Group();
  upperJawGroup.position.set(0.285, -0.026, 0);
  bodyGroup.add(upperJawGroup);
  const lowerJawGroup = new THREE.Group();
  lowerJawGroup.position.set(0.256, -0.046, 0);
  bodyGroup.add(lowerJawGroup);
  const lJawGeo = track(new THREE.SphereGeometry(0.032, 12, 10));
  lJawGeo.scale(0.85, 0.42, 1.45);
  const lJawMat = track(new THREE.MeshPhysicalMaterial({ color: CREAM, emissive: CREAM, emissiveIntensity: 0.25, roughness: 0.35 }));
  const lJawMesh = new THREE.Mesh(lJawGeo, lJawMat);
  lJawMesh.position.set(0.025, 0, 0);
  lowerJawGroup.add(lJawMesh);

  const { mouthInterior, tongueMesh } = createOralParts(ctx, bodyGroup, lowerJawGroup, 0.256, -0.042, "#5c0f1d", "#e8647c", [0.028, 0.02, 0.032]);

  // Graceful Curved Whip Tail!
  const tailPivot = new THREE.Group();
  tailPivot.position.set(xBack + 0.018, 0, 0);
  bodyGroup.add(tailPivot);
  const whipShape = new THREE.Shape();
  whipShape.moveTo(0, 0.018);
  whipShape.bezierCurveTo(-0.11, 0.025, -0.23, 0.005, -0.33, -0.072);
  whipShape.bezierCurveTo(-0.23, -0.014, -0.11, 0.002, 0, -0.014);
  whipShape.closePath();
  tailPivot.add(
    makeSpineFinMesh(ctx, whipShape, xBack + 0.018, 0, 0.0046, 0.001, (fc) => {
      fc.fillStyle = makeLin(fc, 0, 0.015, -0.32, -0.06, [
        [0, MID],
        [0.5, DK],
        [1, "#051030"],
      ]);
      fc.fillRect(-0.36, -0.1, 0.38, 0.14);
    }, maxAnisotropy, false, 0.0014).mesh
  );

  const pelvicFin = new THREE.Group();
  bodyGroup.add(pelvicFin);

  const { eyesNormal, eyesPupil, eyesHappy } = createEyePair(ctx, bodyGroup, {
    ex: 0.252,
    ey: 0.044,
    ez: surfaceZAt(evalTop, evalBot, evalZ, 0.252, 0.044),
    er: 0.032,
    yawRot: 0.16,
    irisColor: pal.iris || "#7a3b12",
    rimColor: OL,
  });

  const { biteRing, biteRingMat } = createBiteRing(ctx, bodyGroup, xNose + 0.02, -0.02, SPOT, 0.05);

  return {
    speciesKey: sp.id,
    tailPivotX: xBack + 0.018,
    skipDefaultFins: true,
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
    onCustomPose: (p, open) => {
      const flap = Math.sin(p.tailPh) * (0.24 + p.swimSpeed * 0.16);
      pecLeft.rotation.x = flap;
      pecRight.rotation.x = -flap;
      lowerJawGroup.rotation.z = -open * 0.65;
      mouthInterior.visible = open > 0.03;
      if (open > 0.03) mouthInterior.scale.set(0.85 + open * 0.2, 0.35 + open * 0.9, 0.8 + open * 0.2);
      tongueMesh.visible = open > 0.04;
      bodyGroup.rotation.x = 0.26 + Math.sin(p.tailPh * 0.5) * 0.06;
    },
    dispose: () => {
      for (const d of ctx.disposables) d.dispose();
    },
  };
}

// =====================================================================================
// 5. TUNA (Bima — Torpedo, Golden Lateral Stripe, Sickle Fins & 8 Yellow Finlets!)
// =====================================================================================
function createTuna3DRig(sp: Species, maxAnisotropy: number): Fish3DRig {
  const pal = sp.pal;
  const OL = pal.outline || "#081940";
  const B = pal.body || "#1c5ec4";
  const DK = pal.dark || "#0b245e";
  const BELLY = pal.belly || "#f0f8ff";
  const YEL = pal.fin || "#ffd21c";
  const YEL_L = mixHex(YEL, "#ffffff", 0.35);
  const TAIL = pal.tail || "#183e88";

  const ctx = createRigContext(OL, "#484848");
  const { track, uniforms, makeOutlineMat, makeFishMat } = ctx;
  const { root, pitchGroup, yawGroup, bodyGroup } = baseGroups();

  const xTail = -0.305;
  const hx = 0.275;
  const hy = -0.025;
  const xSnout = 0.436;

  const topPts = sortAscX(
    sampleBezierChain(
      [
        [[-0.305, 0.012], [-0.22, 0.04], [-0.135, 0.095], [0.02, 0.114]],
        [[0.02, 0.114], [0.165, 0.125], [0.305, 0.088], [0.398, 0.018]],
        [[0.398, 0.018], [0.422, 0.002], [0.432, -0.003], [0.436, -0.005]],
      ],
      24
    )
  );
  const botPts = sortAscX(
    sampleBezierChain(
      [
        [[-0.305, -0.02], [-0.285, -0.024], [-0.245, -0.042], [-0.18, -0.064]],
        [[-0.18, -0.064], [-0.05, -0.105], [0.11, -0.115], [0.235, -0.08]],
        [[0.235, -0.08], [0.328, -0.068], [0.405, -0.05], [0.436, -0.039]],
      ],
      24
    )
  );
  const evalZ = (x: number) => {
    const t = clamp((x - xTail) / (xSnout - xTail), 0, 1);
    const base = 0.018 + 0.106 * Math.sin(Math.pow(t, 0.74) * Math.PI);
    return x > 0.26 ? base * clamp(1 - (x - 0.26) / 0.2, 0.38, 1) : base;
  };

  const { mapUV, beginCanvas2D } = createWorldMapper(-0.34, 0.46, -0.14, 0.14, 512);

  const bodyCv = document.createElement("canvas");
  bodyCv.width = 512;
  bodyCv.height = 512;
  const bc = bodyCv.getContext("2d")!;
  beginCanvas2D(bc, 0, 0);

  bc.fillStyle = makeLin(bc, 0.04, -0.12, 0.04, 0.12, [
    [0, DK],
    [0.34, B],
    [0.54, "#5baef5"],
    [0.64, BELLY],
    [1, "#c8def0"],
  ]);
  bc.fillRect(-0.38, -0.18, 0.9, 0.36);

  // Iconic golden-amber lateral band
  bc.strokeStyle = rgbaHex(YEL, 0.88);
  bc.lineWidth = 0.014;
  bc.beginPath();
  bc.moveTo(0.26, -0.012);
  bc.bezierCurveTo(0.14, -0.03, -0.04, -0.032, -0.25, -0.004);
  bc.stroke();

  // Vertical silver belly bars
  bc.strokeStyle = "rgba(110, 165, 220, 0.32)";
  bc.lineWidth = 0.007;
  for (let i = 0; i < 6; i++) {
    const bx = -0.15 + i * 0.05;
    bc.beginPath();
    bc.moveTo(bx, 0.015);
    bc.quadraticCurveTo(bx - 0.012, 0.055, bx, 0.09);
    bc.stroke();
  }

  // Glossy dorsal streak + gill plate
  bc.fillStyle = "rgba(180, 230, 255, 0.26)";
  drawBlob(bc, 0.08, -0.088, 0.18, 0.018, 0.02);

  bc.strokeStyle = rgbaHex(DK, 0.68);
  bc.lineWidth = 0.0052;
  bc.beginPath();
  bc.moveTo(0.228, -0.052);
  bc.bezierCurveTo(0.205, -0.01, 0.208, 0.038, 0.236, 0.072);
  bc.stroke();
  bc.restore();

  const bodyTex = track(new THREE.CanvasTexture(bodyCv));
  bodyTex.colorSpace = THREE.SRGBColorSpace;
  bodyTex.anisotropy = maxAnisotropy;

  const evalTop = (x: number) => interpCurveY(topPts, x);
  const evalBot = (x: number) => interpCurveY(botPts, x);
  const evalUpperPalate = () => hy + 0.004;
  const evalUnifiedBot = blendBotToPalate(evalBot, evalUpperPalate, hx, 0.032, 0.014);
  const evalMidY = (x: number) => (evalTop(x) + evalUnifiedBot(x)) * 0.5;

  const bodyGeo = track(
    buildLoftedSurface({
      xStart: xTail,
      xEnd: xSnout,
      uSteps: 54,
      vSteps: 28,
      evalTopY: evalTop,
      evalBotY: evalUnifiedBot,
      evalHalfZ: evalZ,
      mapUV,
      roundFront: true,
      rearBulge: 0.004,
    })
  );
  const bodyMat = makeFishMat(bodyTex);
  injectSpineShader(bodyMat, uniforms, 0, 0);
  const tunaMask = bodySpineOutlineMask(
    evalMidY,
    [
      { x0: -0.27, x1: 0.115, top: true },
      { x0: -0.27, x1: -0.045, top: false },
    ],
    0.026
  );
  bodyGroup.add(
    new THREE.Mesh(bodyGeo, bodyMat),
    new THREE.Mesh(track(buildOutlineGeometry(bodyGeo, 0.0044, tunaMask)), makeOutlineMat(0, 0))
  );

  // Unified cranium owns upper snout; upperJawGroup kept as empty compat group
  const upperJawGroup = new THREE.Group();
  upperJawGroup.position.set(hx, hy, 0);
  bodyGroup.add(upperJawGroup);

  const lowerJawGroup = new THREE.Group();
  lowerJawGroup.position.set(hx, hy, 0);
  bodyGroup.add(lowerJawGroup);
  const lGeo = track(
    buildLoftedSurface({
      xStart: hx - 0.022,
      xEnd: 0.426,
      uSteps: 18,
      vSteps: 18,
      evalTopY: () => hy + 0.002,
      evalBotY: evalBot,
      evalHalfZ: (x) => evalZ(x) * 0.9,
      mapUV,
      localOffsetX: hx,
      localOffsetY: hy,
      roundFront: true,
      rearInsetAt: (x) => (x < hx ? 0.78 + 0.2 * clamp((x - (hx - 0.022)) / 0.022, 0, 1) : 1),
    })
  );
  lowerJawGroup.add(
    new THREE.Mesh(lGeo, bodyMat),
    new THREE.Mesh(track(buildOutlineGeometry(lGeo, 0.004, jawOutlineMask(0.008, 0.044))), makeOutlineMat(hx, hy))
  );

  const { mouthInterior, tongueMesh } = createOralParts(ctx, bodyGroup, lowerJawGroup, hx, hy, "#162040", "#df6e8c", [0.044, 0.03, 0.03]);

  // First Dorsal Crest: EXACT 2D sweep (leading +0.115 curving up & back to -0.025 -> -0.035)
  const d1Shape = new THREE.Shape();
  d1Shape.moveTo(0.115, 0.095);
  d1Shape.bezierCurveTo(0.085, 0.172, 0.035, 0.175, -0.025, 0.118);
  d1Shape.lineTo(-0.035, 0.092);
  d1Shape.closePath();
  bodyGroup.add(
    makeSpineFinMesh(ctx, d1Shape, 0, 0, 0.004, 0.001, (fc) => {
      fc.fillStyle = makeLin(fc, 0.04, 0.17, 0.04, 0.09, [
        [0, YEL],
        [1, B],
      ]);
      fc.fillRect(-0.06, 0.07, 0.2, 0.14);
    }, maxAnisotropy, true, 0.0014, undefined, finRootMaskY(0.098, 0.024, true)).mesh
  );

  // Tall Golden Sickle 2nd Dorsal (-0.03 -> -0.135 -> -0.092)
  const d2Shape = new THREE.Shape();
  d2Shape.moveTo(-0.03, 0.096);
  d2Shape.bezierCurveTo(-0.055, 0.185, -0.098, 0.242, -0.135, 0.256);
  d2Shape.quadraticCurveTo(-0.115, 0.175, -0.092, 0.082);
  d2Shape.closePath();
  bodyGroup.add(
    makeSpineFinMesh(ctx, d2Shape, 0, 0, 0.0038, 0.001, (fc) => {
      fc.fillStyle = makeLin(fc, -0.05, 0.09, -0.12, 0.25, [
        [0, "#d97706"],
        [0.45, YEL],
        [1, YEL_L],
      ]);
      fc.fillRect(-0.17, 0.06, 0.18, 0.22);
    }, maxAnisotropy, true, 0.0014, undefined, finRootMaskY(0.09, 0.026, true)).mesh
  );

  // Matching Golden Sickle Anal Fin (-0.045 -> -0.138 -> -0.098)
  const analShape = new THREE.Shape();
  analShape.moveTo(-0.045, -0.095);
  analShape.bezierCurveTo(-0.068, -0.175, -0.105, -0.228, -0.138, -0.242);
  analShape.quadraticCurveTo(-0.118, -0.165, -0.098, -0.08);
  analShape.closePath();
  bodyGroup.add(
    makeSpineFinMesh(ctx, analShape, 0, 0, 0.0038, 0.001, (fc) => {
      fc.fillStyle = makeLin(fc, -0.06, -0.09, -0.13, -0.24, [
        [0, "#d97706"],
        [0.45, YEL],
        [1, YEL_L],
      ]);
      fc.fillRect(-0.17, -0.27, 0.16, 0.21);
    }, maxAnisotropy, true, 0.0014, undefined, finRootMaskY(-0.09, 0.026, false)).mesh
  );

  // 8 Trailing Yellow Finlets along Peduncle (4 dorsal + 4 ventral, PROPER backward sweep!)
  for (let i = 0; i < 4; i++) {
    const fx = -0.14 - i * 0.036;
    const fyTop = 0.048 - i * 0.011;
    const fTop = new THREE.Shape();
    fTop.moveTo(fx + 0.014, fyTop);
    fTop.quadraticCurveTo(fx - 0.008, fyTop + 0.034, fx - 0.02, fyTop + 0.03);
    fTop.quadraticCurveTo(fx - 0.012, fyTop + 0.008, fx - 0.008, fyTop);
    fTop.closePath();
    bodyGroup.add(
      makeSpineFinMesh(ctx, fTop, 0, 0, 0.0028, 0.0006, (fc) => {
        fc.fillStyle = YEL;
        fc.fillRect(fx - 0.04, fyTop - 0.01, 0.08, 0.06);
      }, maxAnisotropy, true, 0.001, undefined, finRootMaskY(fyTop + 0.004, 0.012, true)).mesh
    );

    const fyBot = -0.056 + i * 0.01;
    const fBot = new THREE.Shape();
    fBot.moveTo(fx + 0.014, fyBot);
    fBot.quadraticCurveTo(fx - 0.008, fyBot - 0.034, fx - 0.02, fyBot - 0.03);
    fBot.quadraticCurveTo(fx - 0.012, fyBot - 0.008, fx - 0.008, fyBot);
    fBot.closePath();
    bodyGroup.add(
      makeSpineFinMesh(ctx, fBot, 0, 0, 0.0028, 0.0006, (fc) => {
        fc.fillStyle = YEL;
        fc.fillRect(fx - 0.04, fyBot - 0.05, 0.08, 0.06);
      }, maxAnisotropy, true, 0.001, undefined, finRootMaskY(fyBot - 0.004, 0.012, false)).mesh
    );
  }

  // Crescent Forked Tuna Tail
  const tailPivot = new THREE.Group();
  tailPivot.position.set(xTail + 0.01, -0.006, 0);
  bodyGroup.add(tailPivot);
  const tShape = new THREE.Shape();
  tShape.moveTo(0.018, 0.018);
  tShape.bezierCurveTo(-0.045, 0.075, -0.102, 0.155, -0.145, 0.195);
  tShape.quadraticCurveTo(-0.156, 0.198, -0.142, 0.168);
  tShape.bezierCurveTo(-0.11, 0.1, -0.088, 0.04, -0.085, 0);
  tShape.bezierCurveTo(-0.088, -0.042, -0.11, -0.1, -0.142, -0.168);
  tShape.quadraticCurveTo(-0.156, -0.198, -0.145, -0.195);
  tShape.bezierCurveTo(-0.102, -0.155, -0.045, -0.075, 0.018, -0.018);
  tShape.closePath();
  tailPivot.add(
    makeSpineFinMesh(ctx, tShape, xTail + 0.01, -0.006, 0.0042, 0.001, (fc) => {
      fc.fillStyle = makeLin(fc, 0.01, 0.14, -0.14, -0.14, [
        [0, DK],
        [0.5, TAIL],
        [1, mixHex(TAIL, "#4da6ff", 0.3)],
      ]);
      fc.fillRect(-0.19, -0.24, 0.24, 0.48);
      fc.strokeStyle = rgbaHex(YEL, 0.65);
      fc.lineWidth = 0.007;
      fc.beginPath();
      fc.moveTo(-0.015, 0.032);
      fc.quadraticCurveTo(-0.08, 0.098, -0.132, 0.172);
      fc.moveTo(-0.015, -0.032);
      fc.quadraticCurveTo(-0.08, -0.098, -0.132, -0.172);
      fc.stroke();
    }, maxAnisotropy, false, 0.0014).mesh
  );

  // Scythe Pectoral Fins
  const pShape = new THREE.Shape();
  pShape.moveTo(0.012, 0.008);
  pShape.bezierCurveTo(-0.025, -0.035, -0.105, -0.085, -0.165, -0.078);
  pShape.bezierCurveTo(-0.125, -0.042, -0.065, -0.008, -0.018, 0.012);
  pShape.closePath();
  const pecObj = makeSpineFinMesh(ctx, pShape, 0, 0, 0.0036, 0.0009, (fc) => {
    fc.fillStyle = makeLin(fc, 0, 0.01, -0.15, -0.08, [
      [0, DK],
      [0.55, B],
      [1, YEL],
    ]);
    fc.fillRect(-0.2, -0.12, 0.24, 0.16);
  }, maxAnisotropy, false, 0.0013);
  const pecZ = surfaceZAt(evalTop, evalUnifiedBot, evalZ, 0.185, -0.028, 0.22, 1.0) + 0.006;
  const pecLeft = new THREE.Group();
  pecLeft.position.set(0.185, -0.028, pecZ);
  pecLeft.add(pecObj.mesh);
  const pecRight = new THREE.Group();
  pecRight.position.set(0.185, -0.028, -pecZ);
  pecRight.add(pecObj.mesh.clone());
  bodyGroup.add(pecLeft, pecRight);

  const pelvicFin = new THREE.Group();
  bodyGroup.add(pelvicFin);

  const { eyesNormal, eyesPupil, eyesHappy } = createEyePair(ctx, bodyGroup, {
    ex: 0.312,
    ey: 0.024,
    ez: surfaceZAt(evalTop, evalUnifiedBot, evalZ, 0.312, 0.024),
    er: 0.035,
    irisColor: pal.iris || "#f59e0b",
    rimColor: OL,
  });

  const { biteRing, biteRingMat } = createBiteRing(ctx, bodyGroup, xSnout + 0.01, hy + 0.01, YEL, 0.052);

  return {
    speciesKey: sp.id,
    tailPivotX: xTail + 0.01,
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
      for (const d of ctx.disposables) d.dispose();
    },
  };
}

// =====================================================================================
// 6. HAMMERHEAD (Martil — Sculpted Cephalofoil Mallet, Underslung Jaw, Tall Dorsal)
// =====================================================================================
function createHammerhead3DRig(sp: Species, maxAnisotropy: number): Fish3DRig {
  const pal = sp.pal;
  const OL = pal.outline || "#1b2432";
  const B = pal.body || "#728396";
  const DK = pal.dark || "#435061";
  const LT = mixHex(B, "#e2e8f0", 0.36);
  const BEL = pal.belly || "#f8fafc";

  const ctx = createRigContext(OL, "#525252");
  const { track, uniforms, makeOutlineMat, makeFishMat } = ctx;
  const { root, pitchGroup, yawGroup, bodyGroup } = baseGroups();

  const xTail = -0.282;
  const hx = 0.205;
  const hy = -0.068;
  const xSnout = 0.36;

  const topPts = sortAscX(
    sampleBezierChain(
      [
        [[-0.282, -0.006], [-0.185, 0.028], [-0.085, 0.07], [0.06, 0.082]],
        [[0.06, 0.082], [0.165, 0.09], [0.23, 0.072], [0.29, 0.052]],
        [[0.29, 0.052], [0.33, 0.036], [0.352, 0.02], [xSnout, 0.0]],
      ],
      24
    )
  );
  const botPts = sortAscX(
    sampleBezierChain(
      [
        [[-0.282, -0.036], [-0.242, -0.05], [-0.185, -0.065], [0.068, -0.106]],
        [[0.068, -0.106], [0.145, -0.1], [0.185, -0.096], [0.278, -0.09]],
        [[0.278, -0.09], [0.302, -0.085], [0.318, -0.081], [0.326, -0.078]],
      ],
      24
    )
  );
  const evalZ = (x: number) => {
    const t = clamp((x - xTail) / (xSnout - xTail), 0, 1);
    const base = 0.016 + 0.088 * Math.sin(Math.pow(t, 0.72) * Math.PI);
    return x > 0.24 ? base * clamp(1 - (x - 0.24) / 0.16, 0.35, 1) : base;
  };

  const { mapUV, beginCanvas2D } = createWorldMapper(-0.32, 0.42, -0.13, 0.11, 512);

  const bodyCv = document.createElement("canvas");
  bodyCv.width = 512;
  bodyCv.height = 512;
  const bc = bodyCv.getContext("2d")!;
  beginCanvas2D(bc, 0, 0);

  bc.fillStyle = makeLin(bc, 0.04, -0.09, 0.04, 0.08, [
    [0, DK],
    [0.52, B],
    [1, mixHex(B, LT, 0.25)],
  ]);
  bc.fillRect(-0.36, -0.14, 0.84, 0.3);

  // White belly band
  bc.beginPath();
  bc.moveTo(-0.285, 0.028);
  bc.bezierCurveTo(-0.16, 0.024, 0.04, 0.02, 0.21, 0.042);
  bc.bezierCurveTo(0.278, 0.05, 0.345, 0.054, 0.422, 0.046);
  bc.lineTo(0.45, 0.12);
  bc.lineTo(-0.3, 0.12);
  bc.closePath();
  bc.fillStyle = makeLin(bc, 0, 0.025, 0, 0.105, [
    [0, BEL],
    [0.6, BEL],
    [1, "#d5e0ec"],
  ]);
  bc.fill();

  // 5 crisp shark gill slits
  bc.strokeStyle = rgbaHex(DK, 0.78);
  bc.lineWidth = 0.0045;
  for (let g = 0; g < 5; g++) {
    const gx = 0.145 + g * 0.013;
    bc.beginPath();
    bc.moveTo(gx, -0.016);
    bc.quadraticCurveTo(gx - 0.004, 0.014, gx, 0.044);
    bc.stroke();
  }
  bc.fillStyle = "rgba(235, 245, 255, 0.24)";
  drawBlob(bc, 0.06, -0.064, 0.14, 0.014, 0.03);
  bc.restore();

  const bodyTex = track(new THREE.CanvasTexture(bodyCv));
  bodyTex.colorSpace = THREE.SRGBColorSpace;
  bodyTex.anisotropy = maxAnisotropy;

  const evalTop = (x: number) => interpCurveY(topPts, x);
  const evalBot = (x: number) => interpCurveY(botPts, x);
  const evalUpperPalate = () => -0.056;
  const evalUnifiedBot = blendBotToPalate(evalBot, evalUpperPalate, 0.24, 0.032, 0.014);
  const evalMidY = (x: number) => (evalTop(x) + evalUnifiedBot(x)) * 0.5;

  const bodyGeo = track(
    buildLoftedSurface({
      xStart: xTail,
      xEnd: xSnout,
      uSteps: 50,
      vSteps: 26,
      evalTopY: evalTop,
      evalBotY: evalUnifiedBot,
      evalHalfZ: evalZ,
      mapUV,
      roundFront: true,
      rearBulge: 0.004,
    })
  );
  const bodyMat = makeFishMat(bodyTex);
  injectSpineShader(bodyMat, uniforms, 0, 0);
  const hhMask = bodySpineOutlineMask(
    evalMidY,
    [
      { x0: -0.078, x1: 0.08, top: true },
      { x0: -0.222, x1: -0.155, top: true },
    ],
    0.026
  );
  bodyGroup.add(
    new THREE.Mesh(bodyGeo, bodyMat),
    new THREE.Mesh(track(buildOutlineGeometry(bodyGeo, 0.0044, hhMask)), makeOutlineMat(0, 0))
  );

  // Unified cranium owns upper snout; upperJawGroup kept as empty compat group
  const upperJawGroup = new THREE.Group();
  upperJawGroup.position.set(hx, hy, 0);
  bodyGroup.add(upperJawGroup);

  // Sculpted Horizontal Boomerang Hammer Mallet across +-Z (swept backward at wingtips, slate top + crisp white underside!)
  const hammerCv = document.createElement("canvas");
  hammerCv.width = 256;
  hammerCv.height = 256;
  const hctx = hammerCv.getContext("2d")!;
  hctx.fillStyle = makeLin(hctx, 0, 0, 0, 256, [
    [0, LT],
    [0.52, B],
    [0.64, BEL],
    [1, "#d5e0ec"],
  ]);
  hctx.fillRect(0, 0, 256, 256);
  const hammerTex = track(new THREE.CanvasTexture(hammerCv));
  hammerTex.colorSpace = THREE.SRGBColorSpace;
  hammerTex.anisotropy = maxAnisotropy;
  const hammerMat = makeFishMat(hammerTex);

  const malletGeo = track(new THREE.BoxGeometry(0.11, 0.044, 0.34, 8, 6, 18));
  const posAttr = malletGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < posAttr.count; i++) {
    const px = posAttr.getX(i);
    const py = posAttr.getY(i);
    const pz = posAttr.getZ(i);
    const uz = clamp(Math.abs(pz) / 0.17, 0, 1);
    const sweepBack = -0.052 * Math.pow(uz, 1.5);
    const tipRound = Math.sqrt(Math.max(0.12, 1 - Math.pow(uz, 2.2) * 0.65));
    posAttr.setXYZ(i, px * tipRound + sweepBack, py * (0.7 + 0.3 * tipRound), pz);
  }
  malletGeo.computeVertexNormals();
  const malletMesh = new THREE.Mesh(malletGeo, hammerMat);
  malletMesh.position.set(0.115 + hx, 0.075 + hy, 0);
  malletMesh.add(new THREE.Mesh(track(buildOutlineGeometry(malletGeo, 0.0038)), makeOutlineMat(0, 0, false)));
  bodyGroup.add(malletMesh);

  // Lower Jaw (underslung!)
  const lowerJawGroup = new THREE.Group();
  lowerJawGroup.position.set(hx, hy, 0);
  bodyGroup.add(lowerJawGroup);
  const lGeo = track(
    buildLoftedSurface({
      xStart: hx - 0.02,
      xEnd: 0.326,
      uSteps: 16,
      vSteps: 16,
      evalTopY: () => -0.062,
      evalBotY: evalBot,
      evalHalfZ: (x) => evalZ(x) * 0.8,
      mapUV,
      localOffsetX: hx,
      localOffsetY: hy,
      roundFront: true,
      rearInsetAt: (x) => (x < hx ? 0.78 + 0.2 * clamp((x - (hx - 0.02)) / 0.02, 0, 1) : 1),
    })
  );
  lowerJawGroup.add(
    new THREE.Mesh(lGeo, bodyMat),
    new THREE.Mesh(track(buildOutlineGeometry(lGeo, 0.0038, jawOutlineMask(0.008, 0.044))), makeOutlineMat(hx, hy))
  );

  const teethMat = makeTeethMat(track);
  addToothConeRow(bodyGroup, track, 5, hx + 0.02, hx + 0.1, () => hy + 0.006, () => 0.024, 0.0046, 0.016, false, teethMat);
  addToothConeRow(lowerJawGroup, track, 5, 0.02, 0.09, () => 0.004, () => 0.022, 0.0042, 0.014, true, teethMat);

  const { mouthInterior, tongueMesh } = createOralParts(ctx, bodyGroup, lowerJawGroup, hx, hy, "#2b0d24", "#d95f86", [0.036, 0.024, 0.026]);

  // Tall Swept Dorsal Fin: EXACT 2D sweep (+0.08 -> -0.078 tip -> -0.044 base!)
  const d1Shape = new THREE.Shape();
  d1Shape.moveTo(0.08, 0.07);
  d1Shape.bezierCurveTo(0.032, 0.155, -0.024, 0.222, -0.078, 0.238);
  d1Shape.quadraticCurveTo(-0.056, 0.142, -0.044, 0.06);
  d1Shape.closePath();
  bodyGroup.add(
    makeSpineFinMesh(ctx, d1Shape, 0, 0, 0.0042, 0.001, (fc) => {
      fc.fillStyle = makeLin(fc, 0.04, 0.23, 0.02, 0.06, [
        [0, LT],
        [0.5, B],
        [1, DK],
      ]);
      fc.fillRect(-0.12, 0.04, 0.24, 0.24);
    }, maxAnisotropy, true, 0.0014, undefined, finRootMaskY(0.066, 0.026, true)).mesh
  );

  // Small Second Dorsal Fin (-0.155 -> -0.222 -> -0.198)
  const d2Shape = new THREE.Shape();
  d2Shape.moveTo(-0.155, 0.032);
  d2Shape.bezierCurveTo(-0.175, 0.068, -0.198, 0.082, -0.222, 0.082);
  d2Shape.quadraticCurveTo(-0.205, 0.052, -0.198, 0.018);
  d2Shape.closePath();
  bodyGroup.add(
    makeSpineFinMesh(ctx, d2Shape, 0, 0, 0.0032, 0.0008, (fc) => {
      fc.fillStyle = B;
      fc.fillRect(-0.25, 0.0, 0.14, 0.11);
    }, maxAnisotropy, true, 0.0012, undefined, finRootMaskY(0.024, 0.02, true)).mesh
  );

  // Asymmetrical Forked Shark Tail
  const tailPivot = new THREE.Group();
  tailPivot.position.set(xTail + 0.007, -0.024, 0);
  bodyGroup.add(tailPivot);
  const tShape = new THREE.Shape();
  tShape.moveTo(0.016, 0.018);
  tShape.bezierCurveTo(-0.042, 0.068, -0.108, 0.148, -0.168, 0.212);
  tShape.quadraticCurveTo(-0.175, 0.19, -0.16, 0.155);
  tShape.bezierCurveTo(-0.125, 0.095, -0.098, 0.038, -0.092, -0.004);
  tShape.bezierCurveTo(-0.098, -0.044, -0.125, -0.088, -0.158, -0.118);
  tShape.bezierCurveTo(-0.112, -0.1, -0.048, -0.064, 0.015, -0.024);
  tShape.closePath();
  tailPivot.add(
    makeSpineFinMesh(ctx, tShape, xTail + 0.007, -0.024, 0.004, 0.001, (fc) => {
      fc.fillStyle = makeLin(fc, 0, 0.18, -0.15, -0.1, [
        [0, LT],
        [0.45, B],
        [1, DK],
      ]);
      fc.fillRect(-0.2, -0.16, 0.24, 0.4);
    }, maxAnisotropy, false, 0.0014).mesh
  );

  // Swept Pectoral Fins
  const pShape = new THREE.Shape();
  pShape.moveTo(0.015, 0.008);
  pShape.bezierCurveTo(-0.012, -0.055, -0.088, -0.132, -0.145, -0.134);
  pShape.bezierCurveTo(-0.122, -0.08, -0.072, -0.022, -0.026, 0.012);
  pShape.closePath();
  const pecObj = makeSpineFinMesh(ctx, pShape, 0, 0, 0.0036, 0.0009, (fc) => {
    fc.fillStyle = makeLin(fc, 0, 0, -0.13, -0.13, [
      [0, B],
      [0.6, DK],
      [1, mixHex(DK, "#0f172a", 0.3)],
    ]);
    fc.fillRect(-0.18, -0.16, 0.22, 0.19);
  }, maxAnisotropy, false, 0.0013);
  const pecZ = surfaceZAt(evalTop, evalUnifiedBot, evalZ, 0.112, -0.056, 0.22, 1.0) + 0.006;
  const pecLeft = new THREE.Group();
  pecLeft.position.set(0.112, -0.056, pecZ);
  pecLeft.rotation.x = -0.2;
  pecLeft.add(pecObj.mesh);
  const pecRight = new THREE.Group();
  pecRight.position.set(0.112, -0.056, -pecZ);
  pecRight.rotation.x = 0.2;
  pecRight.add(pecObj.mesh.clone());
  bodyGroup.add(pecLeft, pecRight);

  const pelvicFin = new THREE.Group();
  bodyGroup.add(pelvicFin);

  // Eyes perched cleanly at the outer tips of the cephalofoil hammer wings
  const { eyesNormal, eyesPupil, eyesHappy } = createEyePair(ctx, bodyGroup, {
    ex: 0.09 + hx,
    ey: 0.078 + hy,
    ez: 0.165,
    er: 0.025,
    irisColor: pal.iris || "#b45309",
    rimColor: OL,
    lidColor: DK,
    lidTilt: 0.14,
  });

  const { biteRing, biteRingMat } = createBiteRing(ctx, bodyGroup, xSnout + 0.03, hy + 0.02, LT, 0.052);

  return {
    speciesKey: sp.id,
    tailPivotX: xTail + 0.007,
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
      for (const d of ctx.disposables) d.dispose();
    },
  };
}

// =====================================================================================
// 7. LUMBA (Dolfin & Rosie — Rounded Melon Forehead, Bottlenose Beak, Horizontal Flukes)
// =====================================================================================
function createLumba3DRig(sp: Species, maxAnisotropy: number): Fish3DRig {
  const pal = sp.pal;
  const OL = pal.outline || "#0b2447";
  const B = pal.body || "#3c8ce0";
  const DK = pal.dark || "#174b8c";
  const LT = pal.stripe || "#8ed0ff";
  const BELLY = pal.belly || "#f4faff";
  const FIN = pal.fin || "#2c74c2";
  const TAIL = pal.tail || "#1d589c";

  const ctx = createRigContext(OL, "#424242");
  const { track, uniforms, makeOutlineMat, makeFishMat } = ctx;
  const { root, pitchGroup, yawGroup, bodyGroup } = baseGroups();

  const xTail = -0.332;
  const hx = 0.292;
  const hy = -0.036;
  const xSnout = 0.448;

  const topPts = sortAscX(
    sampleBezierChain(
      [
        [[-0.332, -0.008], [-0.242, 0.025], [-0.14, 0.088], [-0.005, 0.114]],
        [[-0.005, 0.114], [0.135, 0.132], [0.255, 0.11], [0.322, 0.052]],
        [[0.322, 0.052], [0.352, 0.024], [0.362, -0.002], [0.398, -0.006]],
        [[0.398, -0.006], [0.426, -0.008], [0.442, -0.011], [xSnout, -0.013]],
      ],
      24
    )
  );
  const botPts = sortAscX(
    sampleBezierChain(
      [
        [[-0.332, -0.032], [-0.298, -0.038], [-0.255, -0.054], [-0.185, -0.072]],
        [[-0.185, -0.072], [-0.055, -0.105], [0.1, -0.122], [0.235, -0.102]],
        [[0.235, -0.102], [0.295, -0.092], [0.342, -0.078], [0.392, -0.062]],
        [[0.392, -0.062], [0.412, -0.056], [0.426, -0.051], [0.436, -0.047]],
      ],
      24
    )
  );
  const evalZ = (x: number) => {
    const t = clamp((x - xTail) / (xSnout - xTail), 0, 1);
    const base = 0.016 + 0.098 * Math.sin(Math.pow(t, 0.74) * Math.PI);
    return x > 0.3 ? base * clamp(1 - (x - 0.3) / 0.18, 0.36, 1) : base;
  };

  const { mapUV, beginCanvas2D } = createWorldMapper(-0.37, 0.48, -0.15, 0.15, 512);

  const bodyCv = document.createElement("canvas");
  bodyCv.width = 512;
  bodyCv.height = 512;
  const bc = bodyCv.getContext("2d")!;
  beginCanvas2D(bc, 0, 0);

  bc.fillStyle = makeLin(bc, 0.05, -0.13, 0.02, 0.13, [
    [0, DK],
    [0.42, B],
    [0.64, LT],
    [0.74, BELLY],
    [1, mixHex(BELLY, B, 0.1)],
  ]);
  bc.fillRect(-0.4, -0.18, 0.94, 0.36);

  // Sweeping lateral dolphin highlight wave
  bc.fillStyle = rgbaHex(LT, 0.44);
  bc.beginPath();
  bc.moveTo(0.245, -0.032);
  bc.bezierCurveTo(0.115, -0.078, -0.025, -0.055, -0.19, 0.016);
  bc.bezierCurveTo(-0.045, 0.012, 0.1, -0.01, 0.245, -0.032);
  bc.fill();

  // Glossy dorsal sheen
  bc.fillStyle = "rgba(255, 255, 255, 0.28)";
  drawBlob(bc, 0.08, -0.09, 0.14, 0.017, 0.04);
  bc.restore();

  const bodyTex = track(new THREE.CanvasTexture(bodyCv));
  bodyTex.colorSpace = THREE.SRGBColorSpace;
  bodyTex.anisotropy = maxAnisotropy;

  const evalTop = (x: number) => interpCurveY(topPts, x);
  const evalBot = (x: number) => interpCurveY(botPts, x);
  const evalUpperPalate = () => -0.029;
  const evalUnifiedBot = blendBotToPalate(evalBot, evalUpperPalate, hx, 0.032, 0.014);
  const evalMidY = (x: number) => (evalTop(x) + evalUnifiedBot(x)) * 0.5;

  const bodyGeo = track(
    buildLoftedSurface({
      xStart: xTail,
      xEnd: xSnout,
      uSteps: 54,
      vSteps: 28,
      evalTopY: evalTop,
      evalBotY: evalUnifiedBot,
      evalHalfZ: evalZ,
      mapUV,
      roundFront: true,
      rearBulge: 0.004,
    })
  );
  const bodyMat = makeFishMat(bodyTex);
  injectSpineShader(bodyMat, uniforms, 0, 0);
  const lumbaMask = bodySpineOutlineMask(
    evalMidY,
    [{ x0: -0.074, x1: 0.068, top: true }],
    0.026
  );
  bodyGroup.add(
    new THREE.Mesh(bodyGeo, bodyMat),
    new THREE.Mesh(track(buildOutlineGeometry(bodyGeo, 0.0044, lumbaMask)), makeOutlineMat(0, 0))
  );

  // Unified cranium owns upper snout; upperJawGroup kept as empty compat group
  const upperJawGroup = new THREE.Group();
  upperJawGroup.position.set(hx, hy, 0);
  bodyGroup.add(upperJawGroup);

  // Lower Bottlenose Jaw
  const lowerJawGroup = new THREE.Group();
  lowerJawGroup.position.set(hx, hy, 0);
  bodyGroup.add(lowerJawGroup);
  const lGeo = track(
    buildLoftedSurface({
      xStart: hx - 0.022,
      xEnd: 0.436,
      uSteps: 18,
      vSteps: 18,
      evalTopY: () => -0.031,
      evalBotY: evalBot,
      evalHalfZ: (x) => evalZ(x) * 0.88,
      mapUV,
      localOffsetX: hx,
      localOffsetY: hy,
      roundFront: true,
      rearInsetAt: (x) => (x < hx ? 0.78 + 0.2 * clamp((x - (hx - 0.022)) / 0.022, 0, 1) : 1),
    })
  );
  lowerJawGroup.add(
    new THREE.Mesh(lGeo, bodyMat),
    new THREE.Mesh(track(buildOutlineGeometry(lGeo, 0.004, jawOutlineMask(0.008, 0.044))), makeOutlineMat(hx, hy))
  );

  const { mouthInterior, tongueMesh } = createOralParts(ctx, bodyGroup, lowerJawGroup, hx, hy, "#2b0d24", "#eb769b", [0.044, 0.026, 0.028]);

  // Curved Falcate Dolphin Dorsal Fin: EXACT 2D sweep (+0.068 -> -0.074 -> -0.058, convex edge facing +X snout!)
  const dShape = new THREE.Shape();
  dShape.moveTo(0.068, 0.098);
  dShape.bezierCurveTo(0.025, 0.158, -0.022, 0.225, -0.074, 0.25);
  dShape.quadraticCurveTo(-0.088, 0.252, -0.082, 0.232);
  dShape.bezierCurveTo(-0.042, 0.176, -0.042, 0.125, -0.058, 0.09);
  dShape.closePath();
  bodyGroup.add(
    makeSpineFinMesh(ctx, dShape, 0, 0, 0.004, 0.001, (fc) => {
      fc.fillStyle = makeLin(fc, 0.02, 0.24, -0.02, 0.09, [
        [0, LT],
        [0.45, B],
        [1, DK],
      ]);
      fc.fillRect(-0.12, 0.06, 0.22, 0.22);
    }, maxAnisotropy, true, 0.0014, undefined, finRootMaskY(0.096, 0.026, true)).mesh
  );

  // Horizontal Notched Cetacean Tail Flukes
  const tailPivot = new THREE.Group();
  tailPivot.position.set(xTail + 0.004, -0.024, 0);
  bodyGroup.add(tailPivot);
  const flukeShape = new THREE.Shape();
  flukeShape.moveTo(0.015, 0.012);
  flukeShape.bezierCurveTo(-0.028, 0.056, -0.082, 0.118, -0.145, 0.125);
  flukeShape.quadraticCurveTo(-0.1, 0.036, -0.088, 0.0);
  flukeShape.quadraticCurveTo(-0.1, -0.036, -0.145, -0.125);
  flukeShape.bezierCurveTo(-0.082, -0.118, -0.028, -0.056, 0.015, -0.012);
  flukeShape.closePath();
  const flukeObj = makeSpineFinMesh(ctx, flukeShape, xTail + 0.004, -0.024, 0.0042, 0.001, (fc) => {
    fc.fillStyle = makeLin(fc, 0.01, 0, -0.14, 0, [
      [0, B],
      [0.55, TAIL],
      [1, DK],
    ]);
    fc.fillRect(-0.18, -0.15, 0.22, 0.3);
  }, maxAnisotropy, false, 0.0014);
  flukeObj.mesh.rotation.x = Math.PI * 0.48;
  tailPivot.add(flukeObj.mesh);

  // Rounded-Tip Dolphin Pectoral Flippers
  const pShape = new THREE.Shape();
  pShape.moveTo(0.018, 0.008);
  pShape.bezierCurveTo(-0.008, -0.052, -0.075, -0.126, -0.132, -0.128);
  pShape.quadraticCurveTo(-0.145, -0.126, -0.134, -0.104);
  pShape.bezierCurveTo(-0.108, -0.062, -0.065, -0.018, -0.024, 0.014);
  pShape.closePath();
  const pecObj = makeSpineFinMesh(ctx, pShape, 0, 0, 0.0038, 0.001, (fc) => {
    fc.fillStyle = makeLin(fc, 0.01, 0.01, -0.13, -0.12, [
      [0, B],
      [0.6, FIN],
      [1, DK],
    ]);
    fc.fillRect(-0.17, -0.16, 0.21, 0.19);
  }, maxAnisotropy, false, 0.0013);
  const pecZ = surfaceZAt(evalTop, evalUnifiedBot, evalZ, 0.122, -0.056, 0.22, 1.0) + 0.006;
  const pecLeft = new THREE.Group();
  pecLeft.position.set(0.122, -0.056, pecZ);
  pecLeft.rotation.x = -0.22;
  pecLeft.add(pecObj.mesh);
  const pecRight = new THREE.Group();
  pecRight.position.set(0.122, -0.056, -pecZ);
  pecRight.rotation.x = 0.22;
  pecRight.add(pecObj.mesh.clone());
  bodyGroup.add(pecLeft, pecRight);

  const pelvicFin = new THREE.Group();
  bodyGroup.add(pelvicFin);

  const { eyesNormal, eyesPupil, eyesHappy } = createEyePair(ctx, bodyGroup, {
    ex: 0.302,
    ey: 0.02,
    ez: surfaceZAt(evalTop, evalUnifiedBot, evalZ, 0.302, 0.02),
    er: 0.035,
    irisColor: pal.iris || "#1e3a8a",
    rimColor: OL,
  });

  const { biteRing, biteRingMat } = createBiteRing(ctx, bodyGroup, xSnout + 0.025, hy + 0.01, LT, 0.05);

  return {
    speciesKey: sp.id,
    tailPivotX: xTail + 0.004,
    isFluke: true,
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
    onCustomPose: (p, open) => {
      lowerJawGroup.rotation.z = -open * 0.65;
      mouthInterior.visible = open > 0.03;
      if (open > 0.03) mouthInterior.scale.set(0.85 + open * 0.2, 0.35 + open * 0.9, 0.8 + open * 0.2);
      tongueMesh.visible = open > 0.04;
      tailPivot.rotation.y = 0;
      tailPivot.rotation.z = Math.sin(p.tailPh - 2.3) * (0.34 + p.swimSpeed * 0.22);
      tailPivot.position.y = -0.024 + Math.sin(p.tailPh - 1.6) * 0.018;
    },
    dispose: () => {
      for (const d of ctx.disposables) d.dispose();
    },
  };
}

// =====================================================================================
// DISPATCHER
// =====================================================================================
export function createPelagicFish3DRig(sp: Species, maxAnisotropy = 4): Fish3DRig | null {
  switch (sp.style) {
    case "barracuda":
      return createBarracuda3DRig(sp, maxAnisotropy);
    case "shark":
    case "shark_sleek":
    case "leopard":
      return createSharkFamily3DRig(sp, maxAnisotropy);
    case "sailfish":
      return createSailfish3DRig(sp, maxAnisotropy);
    case "stingray":
      return createStingray3DRig(sp, maxAnisotropy);
    case "tuna":
      return createTuna3DRig(sp, maxAnisotropy);
    case "hammerhead":
      return createHammerhead3DRig(sp, maxAnisotropy);
    case "lumba":
      return createLumba3DRig(sp, maxAnisotropy);
    default:
      return null;
  }
}

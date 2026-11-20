import * as THREE from "three";
import type { Species } from "./species";
import {
  baseGroups,
  blendBotToPalate,
  bodySpineOutlineMask,
  buildLoftedSurface,
  buildOutlineGeometry,
  buildSlicedHeadBody,
  buildSmoothLoftedFin,
  clamp,
  computeEyeZ,
  createBiteRing,
  createEyePair,
  createExtrudedFin,
  createOralParts,
  createRigContext,
  createWorldMapper,
  drawBlob,
  drawFinRays,
  drawGlow,
  injectSpineShader,
  interpCurveY,
  jawOutlineMask,
  makeLin,
  makePaintedFinTex,
  makeSpineFinMesh,
  mixHex,
  mouthSeamOutlineMask,
  rgbaHex,
  sampleBezierChain,
  smoothstep,
  surfaceZAt,
} from "./fish3dShared";
import type { Fish3DRig } from "./fish3dShared";

function drawStar4Canvas(
  c: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  r: number,
  starCol: string,
  haloCol?: string
) {
  c.save();
  c.translate(sx, sy);
  if (haloCol) {
    c.fillStyle = haloCol;
    c.beginPath();
    c.arc(0, 0, r * 1.65, 0, Math.PI * 2);
    c.fill();
  }
  c.fillStyle = starCol;
  c.beginPath();
  c.moveTo(0, -r);
  c.lineTo(r * 0.34, -r * 0.34);
  c.lineTo(r, 0);
  c.lineTo(r * 0.34, r * 0.34);
  c.lineTo(0, r);
  c.lineTo(-r * 0.34, r * 0.34);
  c.lineTo(-r, 0);
  c.lineTo(-r * 0.34, -r * 0.34);
  c.closePath();
  c.fill();
  c.fillStyle = "#ffffff";
  c.beginPath();
  c.arc(0, 0, r * 0.24, 0, Math.PI * 2);
  c.fill();
  c.restore();
}

// =====================================================================================
// 1. MANDARIN (Naga Karang Langka — Sapphire Dragonet, Cyan-Outlined Tangerine Swirls)
// =====================================================================================
function createMandarin3DRig(sp: Species, maxAnisotropy: number): Fish3DRig {
  const pal = sp.pal;
  const OL = pal.outline || "#041033";
  const SAP = pal.body || "#0e47b8";
  const DK = pal.dark || "#061d66";
  const AQUA = pal.belly || "#279cf5";
  const CRMS = pal.tail || "#ff4757";
  const ORN = pal.stripe || "#ff7b1c";
  const CYAN = pal.spot || "#2cf5e8";

  const ctx = createRigContext(OL, "#4a4a4a");
  const { track, uniforms, makeOutlineMat } = ctx;
  const { root, pitchGroup, yawGroup, bodyGroup } = baseGroups();

  const xTail = -0.172;
  const xHead = 0.232;
  const hy = -0.026;
  const xSnout = 0.348;

  const topProf = sampleBezierChain(
    [
      [[-0.172, 0.035], [-0.085, 0.095], [0.078, 0.116], [0.202, 0.092]],
      [[0.202, 0.092], [0.278, 0.076], [0.328, 0.028], [xSnout, -0.015]],
    ],
    22
  );
  const botProf = sampleBezierChain(
    [
      [[-0.172, -0.035], [-0.082, -0.082], [0.055, -0.112], [0.182, -0.09]],
      [[0.182, -0.09], [0.288, -0.076], [0.32, -0.052], [0.338, -0.044]],
    ],
    22
  );
  const evalZ = (x: number, t: number) => {
    const base = 0.02 + 0.076 * Math.sin(Math.pow(clamp(t, 0, 1), 0.72) * Math.PI);
    return x > 0.23 ? base * clamp(1 - (x - 0.23) / 0.14, 0.32, 1) : base;
  };

  const { mapUV, beginCanvas2D } = createWorldMapper(-0.188, 0.36, -0.125, 0.125, 512);
  const bodyCv = document.createElement("canvas");
  bodyCv.width = 512;
  bodyCv.height = 512;
  const bc = bodyCv.getContext("2d")!;
  beginCanvas2D(bc);
  bc.fillStyle = makeLin(bc, 0.06, -0.112, 0.06, 0.108, [
    [0, DK],
    [0.34, SAP],
    [0.74, AQUA],
    [1, "#1870db"],
  ]);
  bc.fillRect(-0.3, -0.2, 0.75, 0.45);
  drawGlow(bc, 0.08, -0.062, 0.21, 0.046, 0, "120,245,255", 0.3);

  const drawSwirl = (pathFn: () => void) => {
    bc.beginPath();
    pathFn();
    bc.closePath();
    bc.fillStyle = makeLin(bc, -0.12, -0.08, 0.24, 0.08, [
      [0, "#ffa62b"],
      [0.52, ORN],
      [1, CRMS],
    ]);
    bc.fill();
    bc.strokeStyle = CYAN;
    bc.lineWidth = 0.005;
    bc.stroke();
    bc.strokeStyle = rgbaHex("#030e2b", 0.72);
    bc.lineWidth = 0.0022;
    bc.stroke();
  };
  drawSwirl(() => {
    bc.moveTo(0.112, -0.105);
    bc.bezierCurveTo(0.148, -0.048, 0.155, 0.015, 0.228, 0.044);
    bc.bezierCurveTo(0.258, 0.056, 0.232, 0.088, 0.178, 0.076);
    bc.bezierCurveTo(0.12, 0.062, 0.108, -0.025, 0.068, -0.098);
  });
  drawSwirl(() => {
    bc.moveTo(0.015, -0.104);
    bc.bezierCurveTo(-0.022, -0.045, 0.038, 0.018, -0.018, 0.078);
    bc.bezierCurveTo(-0.048, 0.102, -0.088, 0.082, -0.068, 0.046);
    bc.bezierCurveTo(-0.038, -0.004, -0.072, -0.058, -0.032, -0.098);
  });
  drawSwirl(() => {
    bc.moveTo(-0.105, -0.068);
    bc.bezierCurveTo(-0.135, -0.025, -0.108, 0.022, -0.145, 0.052);
    bc.lineTo(-0.175, 0.034);
    bc.bezierCurveTo(-0.154, 0, -0.165, -0.032, -0.138, -0.058);
  });

  bc.fillStyle = ORN;
  drawBlob(bc, 0.278, -0.015, 0.019, 0.011, 0.35);
  bc.strokeStyle = CYAN;
  bc.lineWidth = 0.0036;
  bc.stroke();

  bc.fillStyle = CYAN;
  drawBlob(bc, 0.188, -0.055, 0.009, 0.0065, -0.2);
  drawBlob(bc, 0.042, 0.052, 0.01, 0.007, 0.2);
  drawBlob(bc, -0.088, -0.024, 0.009, 0.0065, 0);

  bc.strokeStyle = rgbaHex(CYAN, 0.85);
  bc.lineWidth = 0.0038;
  bc.beginPath();
  bc.moveTo(0.245, 0.048);
  bc.quadraticCurveTo(0.272, 0.035, 0.285, 0.056);
  bc.stroke();
  bc.restore();

  const bodyTex = track(new THREE.CanvasTexture(bodyCv));
  bodyTex.colorSpace = THREE.SRGBColorSpace;
  bodyTex.anisotropy = maxAnisotropy;

  const evalTop = (x: number) => interpCurveY(topProf, x);
  const evalBot = (x: number) => interpCurveY(botProf, x);
  const evalUpperPalate = () => -0.031;
  const evalUnifiedBot = blendBotToPalate(evalBot, evalUpperPalate, xHead);
  const evalMidY = (x: number) => (evalTop(x) + evalUnifiedBot(x)) * 0.5;
  const mandarinMask = bodySpineOutlineMask(
    evalMidY,
    [
      { x0: -0.182, x1: 0.112, top: true },
      { x0: -0.188, x1: 0.015, top: false },
    ],
    0.024
  );

  const bodyGeo = track(
    buildLoftedSurface({
      xStart: xTail,
      xEnd: xSnout,
      uSteps: 44,
      vSteps: 26,
      evalTopY: evalTop,
      evalBotY: evalUnifiedBot,
      evalHalfZ: evalZ,
      mapUV,
      rearBulge: 0.004,
      roundFront: true,
    })
  );
  const bodyMat = ctx.makeFishMat(bodyTex, { emissiveIntensity: 0.32 });
  injectSpineShader(bodyMat, uniforms, 0, 0);
  bodyGroup.add(
    new THREE.Mesh(bodyGeo, bodyMat),
    new THREE.Mesh(track(buildOutlineGeometry(bodyGeo, 0.0038, mandarinMask)), makeOutlineMat(0, 0))
  );

  // Lower Jaw (upper snout unified into cranium)
  const upperJawGroup = new THREE.Group();
  upperJawGroup.position.set(xHead, hy + 0.008, 0);
  bodyGroup.add(upperJawGroup);

  const lowerJawGroup = new THREE.Group();
  lowerJawGroup.position.set(xHead, hy - 0.008, 0);
  bodyGroup.add(lowerJawGroup);
  const lGeo = track(
    buildLoftedSurface({
      xStart: xHead - 0.018,
      xEnd: xSnout - 0.01,
      uSteps: 16,
      vSteps: 18,
      evalTopY: () => -0.028,
      evalBotY: evalBot,
      evalHalfZ: (x) => evalZ(x, (x - xTail) / (xSnout - xTail)) * 0.9,
      mapUV,
      localOffsetX: xHead,
      localOffsetY: hy - 0.008,
      roundFront: true,
      rearInsetAt: (x) => (x < xHead ? smoothstep(xHead - 0.018, xHead + 0.008, x) * 0.92 + 0.08 : 1),
    })
  );
  lowerJawGroup.add(
    new THREE.Mesh(lGeo, bodyMat),
    new THREE.Mesh(track(buildOutlineGeometry(lGeo, 0.0032, jawOutlineMask(0.006, 0.038))), makeOutlineMat(xHead, hy - 0.008))
  );

  const { mouthInterior, tongueMesh } = createOralParts(
    ctx,
    bodyGroup,
    lowerJawGroup,
    xHead + 0.02,
    hy,
    "#5c0f24",
    "#ff6a88",
    [0.032, 0.022, 0.02],
    [0.022, 0.009, 0.013],
    0.034
  );

  // 1st Dorsal Plume (tall non-crossing sickle crown)
  const d1Shape = new THREE.Shape();
  d1Shape.moveTo(0.002, 0.095);
  d1Shape.bezierCurveTo(0.004, 0.178, -0.032, 0.252, -0.112, 0.292);
  d1Shape.bezierCurveTo(-0.048, 0.282, 0.065, 0.215, 0.112, 0.09);
  d1Shape.closePath();
  bodyGroup.add(
    makeSpineFinMesh(ctx, d1Shape, 0, 0, 0.0034, 0.0008, (fc) => {
      fc.fillStyle = makeLin(fc, -0.105, 0.292, 0.085, 0.092, [
        [0, CYAN],
        [0.28, "#ffe268"],
        [0.62, ORN],
        [1, "#2b42d6"],
      ]);
      fc.fillRect(-0.15, 0.06, 0.3, 0.26);
      fc.strokeStyle = "rgba(255,250,220,0.68)";
      fc.lineWidth = 0.0034;
      fc.beginPath();
      fc.moveTo(0.088, 0.098);
      fc.bezierCurveTo(0.048, 0.195, -0.025, 0.258, -0.095, 0.282);
      fc.stroke();
      fc.strokeStyle = rgbaHex(CYAN, 0.74);
      fc.lineWidth = 0.003;
      fc.beginPath();
      fc.moveTo(0.048, 0.098);
      fc.bezierCurveTo(0.022, 0.178, -0.018, 0.228, -0.065, 0.252);
      fc.stroke();
    }, maxAnisotropy, true, 0.001, undefined, (x, y) => smoothstep(evalTop(x) - 0.006, evalTop(x) + 0.016, y)).mesh
  );

  // 2nd Dorsal Sail
  const d2Shape = new THREE.Shape();
  d2Shape.moveTo(-0.172, 0.038);
  d2Shape.bezierCurveTo(-0.182, 0.132, -0.125, 0.186, -0.048, 0.168);
  d2Shape.bezierCurveTo(-0.018, 0.16, 0.004, 0.128, 0.01, 0.092);
  d2Shape.closePath();
  bodyGroup.add(
    makeSpineFinMesh(ctx, d2Shape, 0, 0, 0.0034, 0.0008, (fc) => {
      fc.fillStyle = makeLin(fc, -0.08, 0.185, -0.08, 0.045, [
        [0, "#1d8ae8"],
        [0.42, ORN],
        [0.85, "#1154bd"],
        [1, DK],
      ]);
      fc.fillRect(-0.22, 0.02, 0.26, 0.2);
      fc.strokeStyle = "rgba(255,245,210,0.38)";
      fc.lineWidth = 0.0028;
      for (let i = 0; i < 4; i++) {
        const bx = -0.145 + i * 0.038;
        fc.beginPath();
        fc.moveTo(bx, 0.055);
        fc.quadraticCurveTo(bx - 0.012, 0.115, bx - 0.022, 0.162);
        fc.stroke();
      }
      fc.strokeStyle = rgbaHex(CYAN, 0.92);
      fc.lineWidth = 0.0062;
      fc.beginPath();
      fc.moveTo(-0.168, 0.102);
      fc.bezierCurveTo(-0.142, 0.168, -0.072, 0.174, -0.01, 0.142);
      fc.stroke();
      fc.fillStyle = rgbaHex("#ffe270", 0.88);
      drawBlob(fc, -0.115, 0.118, 0.01, 0.007, 0.2);
      drawBlob(fc, -0.068, 0.122, 0.01, 0.007, 0.15);
      drawBlob(fc, -0.032, 0.116, 0.008, 0.006, 0);
    }, maxAnisotropy, true, 0.001, undefined, (x, y) => smoothstep(evalTop(x) - 0.006, evalTop(x) + 0.016, y)).mesh
  );

  // Anal Fin
  const aShape = new THREE.Shape();
  aShape.moveTo(-0.162, -0.042);
  aShape.bezierCurveTo(-0.188, -0.125, -0.118, -0.17, -0.025, -0.145);
  aShape.quadraticCurveTo(0.002, -0.128, 0.015, -0.092);
  aShape.closePath();
  bodyGroup.add(
    makeSpineFinMesh(ctx, aShape, 0, 0, 0.0032, 0.0008, (fc) => {
      fc.fillStyle = makeLin(fc, -0.1, -0.055, -0.1, -0.168, [
        [0, SAP],
        [0.52, ORN],
        [1, CRMS],
      ]);
      fc.fillRect(-0.22, -0.2, 0.26, 0.18);
      fc.strokeStyle = rgbaHex(CYAN, 0.9);
      fc.lineWidth = 0.0058;
      fc.beginPath();
      fc.moveTo(-0.155, -0.115);
      fc.quadraticCurveTo(-0.1, -0.16, -0.028, -0.136);
      fc.stroke();
    }, maxAnisotropy, true, 0.001, undefined, (x, y) => smoothstep(evalBot(x) + 0.006, evalBot(x) - 0.016, y)).mesh
  );

  // Paired Dragonet Pelvic Fan Fins
  const pelvicFin = new THREE.Group();
  pelvicFin.position.set(0.088, -0.086, 0);
  bodyGroup.add(pelvicFin);
  const pvShape = new THREE.Shape();
  pvShape.moveTo(0, 0);
  pvShape.bezierCurveTo(0.02, -0.072, -0.043, -0.106, -0.086, -0.069);
  pvShape.quadraticCurveTo(-0.063, -0.032, -0.036, -0.002);
  pvShape.closePath();
  const pvObj = makeSpineFinMesh(ctx, pvShape, 0.088, -0.086, 0.0028, 0.0007, (fc) => {
    fc.fillStyle = makeLin(fc, -0.01, -0.004, -0.06, -0.095, [
      [0, SAP],
      [0.5, ORN],
      [1, CYAN],
    ]);
    fc.fillRect(-0.12, -0.13, 0.16, 0.15);
  }, maxAnisotropy, true, 0.0009);
  for (const s of [1, -1]) {
    const m = s === 1 ? pvObj.mesh : pvObj.mesh.clone();
    m.position.z = s * 0.028;
    m.rotation.x = s * 0.22;
    pelvicFin.add(m);
  }

  // Ornate Peacock Tail Fan
  const tailPivot = new THREE.Group();
  tailPivot.position.set(-0.158, 0, 0);
  bodyGroup.add(tailPivot);
  const tShape = new THREE.Shape();
  tShape.moveTo(0.012, 0.032);
  tShape.bezierCurveTo(-0.075, 0.105, -0.168, 0.145, -0.225, 0.088);
  tShape.bezierCurveTo(-0.258, 0.042, -0.258, -0.042, -0.225, -0.088);
  tShape.bezierCurveTo(-0.168, -0.145, -0.075, -0.105, 0.012, -0.032);
  tShape.closePath();
  tailPivot.add(
    makeSpineFinMesh(ctx, tShape, -0.158, 0, 0.0034, 0.0008, (fc) => {
      fc.fillStyle = makeLin(fc, 0.01, 0, -0.255, 0, [
        [0, "#1558cf"],
        [0.36, ORN],
        [0.74, CRMS],
        [1, "#b81845"],
      ]);
      fc.fillRect(-0.28, -0.17, 0.32, 0.34);
      fc.strokeStyle = "rgba(255,240,185,0.45)";
      fc.lineWidth = 0.0032;
      for (let i = -3; i <= 3; i++) {
        fc.beginPath();
        fc.moveTo(-0.005, i * 0.006);
        fc.quadraticCurveTo(-0.115, i * 0.018, -0.225, i * 0.026);
        fc.stroke();
      }
      fc.strokeStyle = rgbaHex(CYAN, 0.92);
      fc.lineWidth = 0.007;
      fc.beginPath();
      fc.moveTo(-0.214, -0.084);
      fc.quadraticCurveTo(-0.25, 0, -0.214, 0.084);
      fc.stroke();
      fc.fillStyle = rgbaHex(CYAN, 0.85);
      for (let i = -2; i <= 2; i++) {
        fc.beginPath();
        fc.arc(-0.184 + Math.abs(i) * 0.008, i * 0.029, 0.0062, 0, Math.PI * 2);
        fc.fill();
      }
    }, maxAnisotropy, false, 0.001).mesh
  );

  // Gossamer Rounded Pectoral Wings
  const pShape = new THREE.Shape();
  pShape.moveTo(0, 0);
  pShape.bezierCurveTo(-0.028, 0.038, -0.102, 0.022, -0.092, -0.032);
  pShape.bezierCurveTo(-0.078, -0.076, -0.018, -0.064, 0, -0.016);
  pShape.closePath();
  const pecObj = makeSpineFinMesh(ctx, pShape, 0, 0, 0.0028, 0.0007, (fc) => {
    fc.fillStyle = makeLin(fc, 0, 0, -0.09, -0.028, [
      [0, rgbaHex(AQUA, 0.9)],
      [0.58, rgbaHex(ORN, 0.85)],
      [1, rgbaHex(CYAN, 0.92)],
    ]);
    fc.fillRect(-0.12, -0.09, 0.14, 0.14);
    drawFinRays(fc, [-0.006, -0.004], [[-0.076, -0.018], [-0.076, 0], [-0.076, 0.018], [-0.076, -0.036]], "rgba(255,255,255,0.52)", 0.0026);
  }, maxAnisotropy, false, 0.0009, { transparent: true, opacity: 0.94 });
  const pecZ = surfaceZAt(
    evalTop,
    evalUnifiedBot,
    (x) => evalZ(x, (x - xTail) / (xSnout - xTail)),
    0.105,
    -0.032,
    0.22,
    1.0
  ) + 0.006;
  const pecLeft = new THREE.Group();
  pecLeft.position.set(0.105, -0.032, pecZ);
  pecLeft.add(pecObj.mesh);
  const pecRight = new THREE.Group();
  pecRight.position.set(0.105, -0.032, -pecZ);
  pecRight.add(pecObj.mesh.clone());
  bodyGroup.add(pecLeft, pecRight);

  // Gold-ringed emerald jewel eye
  const eyeZ = surfaceZAt(evalTop, evalUnifiedBot, (x) => evalZ(x, (x - xTail) / (xSnout - xTail)), 0.228, 0.034);
  const goldRingGeo = track(new THREE.CylinderGeometry(0.041 * 1.18, 0.041 * 1.18, 0.008, 22));
  goldRingGeo.rotateX(Math.PI * 0.5);
  const goldRingMat = track(
    new THREE.MeshPhysicalMaterial({
      color: "#ffae2b",
      emissive: "#ffae2b",
      emissiveIntensity: 0.25,
      roughness: 0.28,
    })
  );
  for (const s of [1, -1]) {
    const gr = new THREE.Mesh(goldRingGeo, goldRingMat);
    gr.position.set(0.228, 0.034, s * (eyeZ - 0.002));
    gr.rotation.y = s * 0.2;
    bodyGroup.add(gr);
  }
  const { eyesNormal, eyesPupil, eyesHappy } = createEyePair(ctx, bodyGroup, {
    ex: 0.228,
    ey: 0.034,
    ez: eyeZ + 0.002,
    er: 0.041,
    irisColor: pal.iris || "#18c98f",
    rimColor: OL,
    happyColor: "#ffe999",
  });

  const { biteRing, biteRingMat } = createBiteRing(ctx, bodyGroup, xSnout + 0.02, -0.015, CYAN, 0.05);

  return {
    speciesKey: sp.id,
    tailPivotX: -0.158,
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
// 2. AURORA (Cupang Surgawi Langka — Rose-Opal Betta + Colossal 180° Halfmoon Veils!)
// =====================================================================================
function createAurora3DRig(sp: Species, maxAnisotropy: number): Fish3DRig {
  const pal = sp.pal;
  const OL = pal.outline || "#2a0b4a";
  const ROSE = pal.body || "#ff85c0";
  const AMET = pal.dark || "#6928a8";
  const OPAL = pal.belly || "#ffe8f7";
  const ORCH = pal.fin || "#9c5cf5";
  const AUR = pal.tail || "#4df5e8";
  const STAR = pal.spot || "#7df9ff";

  const ctx = createRigContext(OL, "#464646");
  const { track, uniforms, makeOutlineMat } = ctx;
  const { root, pitchGroup, yawGroup, bodyGroup } = baseGroups();

  const xTail = -0.085;
  const xHead = 0.242;
  const hy = -0.02;
  const xSnout = 0.355;

  const topProf = sampleBezierChain(
    [
      [[-0.085, 0.044], [0.01, 0.098], [0.155, 0.105], [0.255, 0.068]],
      [[0.255, 0.068], [0.305, 0.048], [0.338, 0.02], [xSnout, -0.004]],
    ],
    22
  );
  const botProf = sampleBezierChain(
    [
      [[-0.085, -0.045], [-0.02, -0.075], [0.07, -0.095], [0.185, -0.084]],
      [[0.185, -0.084], [0.295, -0.072], [0.324, -0.046], [0.345, -0.036]],
    ],
    22
  );
  const evalZ = (x: number, t: number) => {
    const base = 0.018 + 0.064 * Math.sin(Math.pow(clamp(t, 0, 1), 0.76) * Math.PI);
    return x > 0.23 ? base * clamp(1 - (x - 0.23) / 0.15, 0.34, 1) : base;
  };

  const { mapUV, beginCanvas2D } = createWorldMapper(-0.1, 0.37, -0.115, 0.115, 512);
  const bodyCv = document.createElement("canvas");
  bodyCv.width = 512;
  bodyCv.height = 512;
  const bc = bodyCv.getContext("2d")!;
  beginCanvas2D(bc);
  bc.fillStyle = makeLin(bc, 0.08, -0.105, 0.08, 0.095, [
    [0, AMET],
    [0.34, ORCH],
    [0.64, ROSE],
    [1, OPAL],
  ]);
  bc.fillRect(-0.2, -0.2, 0.7, 0.4);
  drawGlow(bc, 0.08, -0.04, 0.19, 0.055, -0.08, "125,249,255", 0.34);
  drawGlow(bc, 0.17, 0.02, 0.12, 0.05, 0, "255,190,235", 0.45);

  bc.strokeStyle = rgbaHex(STAR, 0.45);
  bc.lineWidth = 0.003;
  for (let r = 0; r < 3; r++) {
    for (let col = 0; col < 5; col++) {
      const sx = -0.03 + col * 0.042 + (r % 2) * 0.02;
      const sy = -0.035 + r * 0.035;
      bc.beginPath();
      bc.arc(sx, sy, 0.022, -Math.PI * 0.35, Math.PI * 0.35);
      bc.stroke();
    }
  }
  bc.fillStyle = "rgba(255,110,175,0.44)";
  drawBlob(bc, 0.21, 0.032, 0.024, 0.015, 0.1);
  bc.strokeStyle = rgbaHex(AMET, 0.55);
  bc.lineWidth = 0.004;
  bc.beginPath();
  bc.arc(0.145, 0.005, 0.045, -Math.PI * 0.32, Math.PI * 0.38);
  bc.stroke();
  bc.restore();

  const bodyTex = track(new THREE.CanvasTexture(bodyCv));
  bodyTex.colorSpace = THREE.SRGBColorSpace;
  bodyTex.anisotropy = maxAnisotropy;

  const evalTop = (x: number) => interpCurveY(topProf, x);
  const evalBot = (x: number) => interpCurveY(botProf, x);
  const evalUpperPalate = () => -0.02;
  const evalUnifiedBot = blendBotToPalate(evalBot, evalUpperPalate, xHead);
  const evalMidY = (x: number) => (evalTop(x) + evalUnifiedBot(x)) * 0.5;
  const auroraMask = bodySpineOutlineMask(
    evalMidY,
    [
      { x0: -0.085, x1: 0.115, top: true },
      { x0: -0.085, x1: 0.125, top: false },
    ],
    0.024
  );

  const bodyGeo = track(
    buildLoftedSurface({
      xStart: xTail,
      xEnd: xSnout,
      uSteps: 40,
      vSteps: 22,
      evalTopY: evalTop,
      evalBotY: evalUnifiedBot,
      evalHalfZ: evalZ,
      mapUV,
      rearBulge: 0.004,
      roundFront: true,
    })
  );
  const bodyMat = ctx.makeFishMat(bodyTex, { emissiveIntensity: 0.32, clearcoat: 0.58 });
  injectSpineShader(bodyMat, uniforms, 0, 0);
  bodyGroup.add(
    new THREE.Mesh(bodyGeo, bodyMat),
    new THREE.Mesh(track(buildOutlineGeometry(bodyGeo, 0.0036, auroraMask)), makeOutlineMat(0, 0))
  );

  // Lower Jaw (upper snout unified cleanly into cranium)
  const upperJawGroup = new THREE.Group();
  upperJawGroup.position.set(xHead, hy + 0.008, 0);
  bodyGroup.add(upperJawGroup);

  const lowerJawGroup = new THREE.Group();
  lowerJawGroup.position.set(xHead, hy - 0.006, 0);
  bodyGroup.add(lowerJawGroup);
  const lGeo = track(
    buildLoftedSurface({
      xStart: xHead - 0.018,
      xEnd: xSnout - 0.01,
      uSteps: 16,
      vSteps: 18,
      evalTopY: () => -0.02,
      evalBotY: evalBot,
      evalHalfZ: (x) => evalZ(x, (x - xTail) / (xSnout - xTail)) * 0.9,
      mapUV,
      localOffsetX: xHead,
      localOffsetY: hy - 0.006,
      roundFront: true,
      rearInsetAt: (x) => (x < xHead ? smoothstep(xHead - 0.018, xHead + 0.008, x) * 0.92 + 0.08 : 1),
    })
  );
  lowerJawGroup.add(
    new THREE.Mesh(lGeo, bodyMat),
    new THREE.Mesh(track(buildOutlineGeometry(lGeo, 0.003, jawOutlineMask(0.006, 0.038))), makeOutlineMat(xHead, hy - 0.006))
  );

  const { mouthInterior, tongueMesh } = createOralParts(
    ctx,
    bodyGroup,
    lowerJawGroup,
    xHead + 0.018,
    hy,
    "#591032",
    "#ff78a5",
    [0.03, 0.02, 0.018],
    [0.022, 0.008, 0.012],
    0.032
  );

  // Colossal 180° Halfmoon Silk Veil Tail
  const tailPivot = new THREE.Group();
  tailPivot.position.set(-0.04, 0, 0);
  bodyGroup.add(tailPivot);
  const tShape = new THREE.Shape();
  tShape.moveTo(0.02, 0.048);
  tShape.bezierCurveTo(-0.08, 0.18, -0.22, 0.35, -0.375, 0.305);
  tShape.bezierCurveTo(-0.435, 0.18, -0.455, 0.06, -0.438, 0);
  tShape.bezierCurveTo(-0.455, -0.07, -0.43, -0.2, -0.368, -0.312);
  tShape.bezierCurveTo(-0.21, -0.348, -0.075, -0.178, 0.02, -0.05);
  tShape.closePath();
  tailPivot.add(
    makeSpineFinMesh(
      ctx,
      tShape,
      -0.04,
      0,
      0.0026,
      0.0006,
      (fc) => {
        fc.fillStyle = makeLin(fc, 0.02, 0, -0.44, 0, [
          [0, AMET],
          [0.32, ORCH],
          [0.65, ROSE],
          [0.88, "#ffbde8"],
          [1, AUR],
        ]);
        fc.fillRect(-0.48, -0.38, 0.54, 0.76);
        fc.strokeStyle = rgbaHex(AUR, 0.88);
        fc.lineWidth = 0.015;
        fc.beginPath();
        fc.moveTo(-0.358, 0.29);
        fc.bezierCurveTo(-0.432, 0.12, -0.432, -0.12, -0.352, -0.295);
        fc.stroke();
        fc.strokeStyle = "rgba(255,250,255,0.48)";
        fc.lineWidth = 0.0032;
        for (let i = -5; i <= 5; i++) {
          const ang = i * 0.16;
          const ex = -Math.cos(ang) * 0.39;
          const ey = Math.sin(ang) * 0.305;
          fc.beginPath();
          fc.moveTo(0, i * 0.006);
          fc.quadraticCurveTo(ex * 0.52, ey * 0.52, ex, ey);
          fc.stroke();
        }
        fc.fillStyle = "rgba(255,255,255,0.82)";
        drawBlob(fc, -0.28, 0.14, 0.01, 0.007, -0.3);
        drawBlob(fc, -0.33, -0.05, 0.011, 0.007, 0.2);
        drawBlob(fc, -0.26, -0.17, 0.009, 0.006, -0.1);
      },
      maxAnisotropy,
      false,
      0.0009,
      { transparent: true, opacity: 0.9, emissiveIntensity: 0.36 }
    ).mesh
  );

  // Sweeping Crown Dorsal Silk Veil
  const dShape = new THREE.Shape();
  dShape.moveTo(0.115, 0.075);
  dShape.bezierCurveTo(0.06, 0.19, -0.04, 0.345, -0.185, 0.345);
  dShape.bezierCurveTo(-0.155, 0.245, -0.125, 0.145, -0.065, 0.052);
  dShape.closePath();
  bodyGroup.add(
    makeSpineFinMesh(ctx, dShape, 0, 0, 0.0026, 0.0006, (fc) => {
      fc.fillStyle = makeLin(fc, 0.05, 0.07, -0.17, 0.34, [
        [0, ORCH],
        [0.52, ROSE],
        [1, AUR],
      ]);
      fc.fillRect(-0.22, 0.02, 0.38, 0.36);
      fc.strokeStyle = "rgba(255,255,255,0.5)";
      fc.lineWidth = 0.003;
      for (let i = 0; i < 5; i++) {
        fc.beginPath();
        fc.moveTo(0.08 - i * 0.032, 0.07);
        fc.quadraticCurveTo(0.01 - i * 0.042, 0.2, -0.095 - i * 0.02, 0.295 + i * 0.008);
        fc.stroke();
      }
    }, maxAnisotropy, true, 0.0009, { transparent: true, opacity: 0.9, emissiveIntensity: 0.34 }, (x, y) =>
      smoothstep(evalTop(x) - 0.006, evalTop(x) + 0.016, y)
    ).mesh
  );

  // Long Flowing Ventral / Anal Ribbon Veil
  const aShape = new THREE.Shape();
  aShape.moveTo(0.125, -0.072);
  aShape.bezierCurveTo(0.05, -0.205, -0.055, -0.355, -0.215, -0.345);
  aShape.bezierCurveTo(-0.155, -0.245, -0.12, -0.145, -0.058, -0.048);
  aShape.closePath();
  bodyGroup.add(
    makeSpineFinMesh(ctx, aShape, 0, 0, 0.0026, 0.0006, (fc) => {
      fc.fillStyle = makeLin(fc, 0.06, -0.06, -0.19, -0.34, [
        [0, ORCH],
        [0.55, ROSE],
        [1, AUR],
      ]);
      fc.fillRect(-0.24, -0.38, 0.4, 0.36);
      fc.strokeStyle = "rgba(255,255,255,0.48)";
      fc.lineWidth = 0.003;
      for (let i = 0; i < 5; i++) {
        fc.beginPath();
        fc.moveTo(0.09 - i * 0.034, -0.065);
        fc.quadraticCurveTo(0.01 - i * 0.042, -0.2, -0.1 - i * 0.025, -0.29 - i * 0.01);
        fc.stroke();
      }
    }, maxAnisotropy, true, 0.0009, { transparent: true, opacity: 0.9, emissiveIntensity: 0.34 }, (x, y) =>
      smoothstep(evalBot(x) + 0.006, evalBot(x) - 0.016, y)
    ).mesh
  );

  // Paired Delicate Silk Pelvic Ribbon Streamers
  const pelvicFin = new THREE.Group();
  pelvicFin.position.set(0.155, -0.075, 0);
  bodyGroup.add(pelvicFin);
  const pvShape = new THREE.Shape();
  pvShape.moveTo(0, 0);
  pvShape.bezierCurveTo(-0.025, -0.11, -0.1, -0.21, -0.17, -0.23);
  pvShape.bezierCurveTo(-0.125, -0.15, -0.08, -0.07, -0.04, -0.007);
  pvShape.closePath();
  const pvObj = makeSpineFinMesh(ctx, pvShape, 0.155, -0.075, 0.0022, 0.0006, (fc) => {
    fc.fillStyle = makeLin(fc, -0.01, -0.005, -0.15, -0.22, [
      [0, OPAL],
      [0.6, "#ff99d6"],
      [1, AUR],
    ]);
    fc.fillRect(-0.2, -0.26, 0.24, 0.28);
  }, maxAnisotropy, true, 0.0008, { transparent: true, opacity: 0.92 });
  for (const s of [1, -1]) {
    const m = s === 1 ? pvObj.mesh : pvObj.mesh.clone();
    m.position.z = s * 0.018;
    m.rotation.x = s * 0.14;
    pelvicFin.add(m);
  }

  // Gossamer Opal Pectorals
  const pShape = new THREE.Shape();
  pShape.moveTo(0, 0);
  pShape.bezierCurveTo(-0.04, 0.048, -0.145, 0.018, -0.135, -0.042);
  pShape.bezierCurveTo(-0.11, -0.088, -0.03, -0.068, 0, -0.015);
  pShape.closePath();
  const pecObj = makeSpineFinMesh(ctx, pShape, 0, 0, 0.0024, 0.0006, (fc) => {
    fc.fillStyle = makeLin(fc, 0, 0, -0.13, -0.04, [
      [0, "rgba(255,240,252,0.88)"],
      [0.65, "rgba(185,135,255,0.8)"],
      [1, "rgba(77,245,232,0.9)"],
    ]);
    fc.fillRect(-0.16, -0.1, 0.18, 0.16);
  }, maxAnisotropy, false, 0.0008, { transparent: true, opacity: 0.88 });
  const pecZ = surfaceZAt(
    evalTop,
    evalUnifiedBot,
    (x) => evalZ(x, (x - xTail) / (xSnout - xTail)),
    0.13,
    -0.024,
    0.22,
    1.0
  ) + 0.006;
  const pecLeft = new THREE.Group();
  pecLeft.position.set(0.13, -0.024, pecZ);
  pecLeft.add(pecObj.mesh);
  const pecRight = new THREE.Group();
  pecRight.position.set(0.13, -0.024, -pecZ);
  pecRight.add(pecObj.mesh.clone());
  bodyGroup.add(pecLeft, pecRight);

  const eyeZ = surfaceZAt(evalTop, evalUnifiedBot, (x) => evalZ(x, (x - xTail) / (xSnout - xTail)), 0.242, 0.024);
  const { eyesNormal, eyesPupil, eyesHappy } = createEyePair(ctx, bodyGroup, {
    ex: 0.242,
    ey: 0.024,
    ez: eyeZ,
    er: 0.043,
    irisColor: pal.iris || "#2d68e6",
    rimColor: OL,
    happyColor: "#ffffff",
  });

  const { biteRing, biteRingMat } = createBiteRing(ctx, bodyGroup, xSnout + 0.02, -0.008, AUR, 0.048);

  return {
    speciesKey: sp.id,
    tailPivotX: -0.04,
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
// 3. NARWHAL (Lumina — Moonlit Lavender Whale, Ice-Cyan Spots & Spiraled Ivory Tusk!)
// =====================================================================================
function createNarwhal3DRig(sp: Species, maxAnisotropy: number): Fish3DRig {
  const pal = sp.pal;
  const OL = pal.outline || "#1a1047";
  const LAV = pal.body || "#8e78ff";
  const IND = pal.dark || "#4432a8";
  const PRL = pal.belly || "#f7f4ff";
  const FIN = pal.fin || "#6b54e8";
  const TAIL = pal.tail || "#5746cc";
  const GOLD = pal.stripe || "#ffe58f";
  const STAR = pal.spot || "#b5f4ff";

  const ctx = createRigContext(OL, "#4a4a4a");
  const { track, uniforms, makeOutlineMat } = ctx;
  const { root, pitchGroup, yawGroup, bodyGroup } = baseGroups();

  const xTail = -0.245;
  const xHead = 0.185;
  const hy = -0.058;
  const xSnout = 0.292;

  const topProf = sampleBezierChain(
    [
      [[-0.245, 0.028], [-0.145, 0.108], [0.02, 0.142], [0.175, 0.118]],
      [[0.175, 0.118], [0.238, 0.105], [0.278, 0.072], [xSnout, 0.008]],
    ],
    22
  );
  const botProf = sampleBezierChain(
    [
      [[-0.245, -0.032], [-0.135, -0.09], [0.015, -0.12], [0.135, -0.106]],
      [[0.135, -0.106], [0.225, -0.1], [0.258, -0.076], [0.276, -0.068]],
    ],
    22
  );
  const evalZ = (x: number, t: number) => {
    const base = 0.022 + 0.104 * Math.sin(Math.pow(clamp(t, 0, 1), 0.72) * Math.PI);
    return x > 0.19 ? base * clamp(1 - (x - 0.19) / 0.12, 0.36, 1) : base;
  };

  const { mapUV, beginCanvas2D } = createWorldMapper(-0.26, 0.305, -0.145, 0.155, 512);
  const bodyCv = document.createElement("canvas");
  bodyCv.width = 512;
  bodyCv.height = 512;
  const bc = bodyCv.getContext("2d")!;
  beginCanvas2D(bc);
  bc.fillStyle = makeLin(bc, 0, -0.14, 0, 0.12, [
    [0, IND],
    [0.42, LAV],
    [0.72, "#c6bdff"],
    [1, PRL],
  ]);
  bc.fillRect(-0.35, -0.25, 0.8, 0.5);

  // Pearl underbelly wave
  bc.fillStyle = makeLin(bc, 0, 0.02, 0, 0.12, [
    [0, PRL],
    [0.72, "#eee8ff"],
    [1, "#d2c8f7"],
  ]);
  bc.beginPath();
  bc.moveTo(-0.25, 0.018);
  bc.bezierCurveTo(-0.11, 0.035, 0.06, 0.048, 0.285, 0.045);
  bc.lineTo(0.295, 0.16);
  bc.lineTo(-0.26, 0.15);
  bc.closePath();
  bc.fill();

  drawGlow(bc, 0.08, -0.09, 0.18, 0.04, -0.05, "215,245,255", 0.34);

  const dots: [number, number, number, number, number, number][] = [
    [-0.08, -0.065, 0.022, 0.011, -0.15, 0.58],
    [-0.01, -0.085, 0.026, 0.012, 0.08, 0.58],
    [0.065, -0.078, 0.02, 0.01, -0.1, 0.62],
    [0.125, -0.058, 0.018, 0.009, 0.15, 0.58],
    [-0.145, -0.04, 0.019, 0.01, -0.12, 0.48],
    [-0.045, -0.035, 0.015, 0.008, 0.05, 0.52],
    [0.035, -0.042, 0.016, 0.008, -0.2, 0.48],
  ];
  for (const [dx, dy, rx, ry, rot, a] of dots) {
    bc.fillStyle = rgbaHex(STAR, a);
    drawBlob(bc, dx, dy, rx, ry, rot);
  }
  bc.fillStyle = "rgba(255,130,185,0.52)";
  drawBlob(bc, 0.17, 0.045, 0.025, 0.015, 0.08);
  bc.restore();

  const bodyTex = track(new THREE.CanvasTexture(bodyCv));
  bodyTex.colorSpace = THREE.SRGBColorSpace;
  bodyTex.anisotropy = maxAnisotropy;

  const evalTop = (x: number) => interpCurveY(topProf, x);
  const evalBot = (x: number) => interpCurveY(botProf, x);
  const evalUpperPalate = () => -0.052;
  const evalUnifiedBot = blendBotToPalate(evalBot, evalUpperPalate, xHead);

  const bodyGeo = track(
    buildLoftedSurface({
      xStart: xTail,
      xEnd: xSnout,
      uSteps: 42,
      vSteps: 26,
      evalTopY: evalTop,
      evalBotY: evalUnifiedBot,
      evalHalfZ: evalZ,
      mapUV,
      rearBulge: 0.004,
      roundFront: true,
    })
  );
  const bodyMat = ctx.makeFishMat(bodyTex, { emissiveIntensity: 0.3 });
  injectSpineShader(bodyMat, uniforms, 0, 0);
  bodyGroup.add(
    new THREE.Mesh(bodyGeo, bodyMat),
    new THREE.Mesh(track(buildOutlineGeometry(bodyGeo, 0.0038)), makeOutlineMat(0, 0))
  );

  // Empty upperJawGroup compat anchor; Spiraled Golden-Ivory Tusk attached to cranium
  const upperJawGroup = new THREE.Group();
  upperJawGroup.position.set(xHead, hy + 0.016, 0);
  bodyGroup.add(upperJawGroup);

  const hornCv = document.createElement("canvas");
  hornCv.width = 256;
  hornCv.height = 256;
  const hc = hornCv.getContext("2d")!;
  hc.fillStyle = makeLin(hc, 0, 0, 0, 256, [
    [0, "#fffdf2"],
    [0.45, GOLD],
    [1, "#d99b26"],
  ]);
  hc.fillRect(0, 0, 256, 256);
  hc.strokeStyle = "rgba(175,110,15,0.68)";
  hc.lineWidth = 10;
  for (let i = -2; i < 8; i++) {
    hc.beginPath();
    hc.moveTo(0, i * 42);
    hc.lineTo(256, i * 42 + 64);
    hc.stroke();
  }
  hc.strokeStyle = "rgba(255,255,255,0.82)";
  hc.lineWidth = 4;
  for (let i = -2; i < 8; i++) {
    hc.beginPath();
    hc.moveTo(0, i * 42 - 10);
    hc.lineTo(256, i * 42 + 54);
    hc.stroke();
  }
  const hornTex = track(new THREE.CanvasTexture(hornCv));
  hornTex.colorSpace = THREE.SRGBColorSpace;
  hornTex.anisotropy = maxAnisotropy;
  const tuskLen = 0.235;
  const hornGeo = track(new THREE.ConeGeometry(0.018, tuskLen, 16));
  hornGeo.rotateZ(-Math.PI * 0.5);
  hornGeo.translate(tuskLen * 0.5, 0, 0);
  const hornMat = ctx.makeFishMat(hornTex, { clearcoat: 0.72, emissiveIntensity: 0.3 });
  const hornMesh = new THREE.Mesh(hornGeo, hornMat);
  hornMesh.position.set(0.248, 0.026, 0);
  hornMesh.rotation.z = 0.15;
  hornMesh.add(new THREE.Mesh(track(buildOutlineGeometry(hornGeo, 0.002)), makeOutlineMat(0, 0, false)));
  bodyGroup.add(hornMesh);

  // Lower Jaw
  const lowerJawGroup = new THREE.Group();
  lowerJawGroup.position.set(xHead, hy - 0.008, 0);
  bodyGroup.add(lowerJawGroup);
  const lGeo = track(
    buildLoftedSurface({
      xStart: xHead - 0.018,
      xEnd: xSnout - 0.016,
      uSteps: 16,
      vSteps: 18,
      evalTopY: () => -0.052,
      evalBotY: evalBot,
      evalHalfZ: (x) => evalZ(x, (x - xTail) / (xSnout - xTail)) * 0.9,
      mapUV,
      localOffsetX: xHead,
      localOffsetY: hy - 0.008,
      roundFront: true,
      rearInsetAt: (x) => (x < xHead ? smoothstep(xHead - 0.018, xHead + 0.008, x) * 0.92 + 0.08 : 1),
    })
  );
  lowerJawGroup.add(
    new THREE.Mesh(lGeo, bodyMat),
    new THREE.Mesh(track(buildOutlineGeometry(lGeo, 0.0032, jawOutlineMask(0.006, 0.038))), makeOutlineMat(xHead, hy - 0.008))
  );

  const { mouthInterior, tongueMesh } = createOralParts(
    ctx,
    bodyGroup,
    lowerJawGroup,
    xHead + 0.016,
    hy,
    "#5c1438",
    "#ff7aa8",
    [0.032, 0.024, 0.022],
    [0.022, 0.009, 0.013],
    0.03
  );

  // Horizontal Crescent Whale Fluke
  const tailPivot = new THREE.Group();
  tailPivot.position.set(-0.24, -0.005, 0);
  bodyGroup.add(tailPivot);
  const fShape = new THREE.Shape();
  fShape.moveTo(0.02, 0.028);
  fShape.bezierCurveTo(-0.07, 0.06, -0.155, 0.165, -0.215, 0.18);
  fShape.bezierCurveTo(-0.18, 0.095, -0.145, 0.032, -0.105, 0);
  fShape.bezierCurveTo(-0.145, -0.032, -0.18, -0.095, -0.215, -0.18);
  fShape.bezierCurveTo(-0.155, -0.165, -0.07, -0.06, 0.02, -0.028);
  fShape.closePath();
  const flukeObj = makeSpineFinMesh(ctx, fShape, -0.24, -0.005, 0.004, 0.001, (fc) => {
    fc.fillStyle = makeLin(fc, 0, 0.16, -0.18, -0.16, [
      [0, IND],
      [0.5, LAV],
      [1, TAIL],
    ]);
    fc.fillRect(-0.24, -0.2, 0.28, 0.4);
    fc.strokeStyle = rgbaHex(STAR, 0.65);
    fc.lineWidth = 0.0042;
    fc.beginPath();
    fc.moveTo(-0.02, 0.022);
    fc.quadraticCurveTo(-0.12, 0.08, -0.195, 0.16);
    fc.moveTo(-0.02, -0.022);
    fc.quadraticCurveTo(-0.12, -0.08, -0.195, -0.16);
    fc.stroke();
  }, maxAnisotropy, false, 0.0011);
  flukeObj.mesh.rotation.x = Math.PI * 0.5;
  tailPivot.add(flukeObj.mesh);

  // Rounded Flippers
  const pShape = new THREE.Shape();
  pShape.moveTo(0.01, 0.008);
  pShape.bezierCurveTo(-0.025, -0.055, -0.088, -0.082, -0.112, -0.055);
  pShape.bezierCurveTo(-0.125, -0.03, -0.072, 0.012, -0.008, 0.014);
  pShape.closePath();
  const pecObj = makeSpineFinMesh(ctx, pShape, 0, 0, 0.0034, 0.0008, (fc) => {
    fc.fillStyle = makeLin(fc, 0, 0.01, -0.11, -0.07, [
      [0, LAV],
      [0.65, IND],
      [1, FIN],
    ]);
    fc.fillRect(-0.15, -0.11, 0.18, 0.15);
    fc.strokeStyle = rgbaHex(STAR, 0.58);
    fc.lineWidth = 0.0034;
    fc.beginPath();
    fc.moveTo(-0.015, -0.045);
    fc.quadraticCurveTo(-0.065, -0.068, -0.102, -0.052);
    fc.stroke();
  }, maxAnisotropy, false, 0.001);
  const pecZ = surfaceZAt(
    evalTop,
    evalUnifiedBot,
    (x) => evalZ(x, (x - xTail) / (xSnout - xTail)),
    0.055,
    -0.052,
    0.22,
    1.0
  ) + 0.006;
  const pecLeft = new THREE.Group();
  pecLeft.position.set(0.055, -0.052, pecZ);
  pecLeft.rotation.x = -0.24;
  pecLeft.add(pecObj.mesh);
  const pecRight = new THREE.Group();
  pecRight.position.set(0.055, -0.052, -pecZ);
  pecRight.rotation.x = 0.24;
  pecRight.add(pecObj.mesh.clone());
  bodyGroup.add(pecLeft, pecRight);

  const pelvicFin = new THREE.Group();
  bodyGroup.add(pelvicFin);

  const eyeZ = surfaceZAt(evalTop, evalUnifiedBot, (x) => evalZ(x, (x - xTail) / (xSnout - xTail)), 0.202, -0.002);
  const { eyesNormal, eyesPupil, eyesHappy } = createEyePair(ctx, bodyGroup, {
    ex: 0.202,
    ey: -0.002,
    ez: eyeZ,
    er: 0.041,
    irisColor: pal.iris || "#1f3a8a",
    rimColor: OL,
    happyColor: "#ffffff",
  });

  const { biteRing, biteRingMat } = createBiteRing(ctx, bodyGroup, xSnout + 0.14, 0.025, STAR, 0.052);

  return {
    speciesKey: sp.id,
    tailPivotX: -0.24,
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
    onCustomPose: (p, open, swimAmp) => {
      lowerJawGroup.rotation.z = -open * 0.56;
      mouthInterior.visible = open > 0.03;
      if (open > 0.03) mouthInterior.scale.set(0.85 + open * 0.2, 0.35 + open * 0.9, 0.8 + open * 0.2);
      tongueMesh.visible = open > 0.04;
      tailPivot.rotation.y = 0;
      tailPivot.rotation.z = Math.sin(p.tailPh - 2.3) * (0.34 + p.swimSpeed * 0.22);
      tailPivot.position.y = Math.sin(p.tailPh - 1.6) * 0.018;
      pecLeft.rotation.z = -0.14 + Math.sin(p.wag2 * 2) * (0.14 + swimAmp * 0.6);
      pecRight.rotation.z = -0.14 - Math.sin(p.wag2 * 2) * (0.14 + swimAmp * 0.6);
    },
    dispose: () => {
      for (const d of ctx.disposables) d.dispose();
    },
  };
}

// =====================================================================================
// 4. SEADRAGON (Naga Daun — S-Curved Armored Emerald & Gold + Multi-Branch Kelp Plumes)
// =====================================================================================
function createSeadragon3DRig(sp: Species, maxAnisotropy: number): Fish3DRig {
  const pal = sp.pal;
  const OL = pal.outline || "#07261c";
  const EMR = pal.body || "#22b87a";
  const DK = pal.dark || "#0c4a38";
  const GOLD = pal.belly || "#ffe47a";
  const AMBER = pal.fin || "#e6a825";
  const LEAF = pal.spot || "#9effc6";
  const TEAL = "#17a89a";

  const ctx = createRigContext(OL, "#4e4e4e");
  const { track, uniforms, makeOutlineMat } = ctx;
  const { root, pitchGroup, yawGroup, bodyGroup } = baseGroups();

  const sx = (x2: number) => 0.038 + 0.92 * x2;
  const sy = (y2: number) => -0.01 - 0.92 * y2;

  const xTail = sx(-0.378);
  const xHead = sx(0.285);
  const hy = sy(-0.012);
  const xSnout = sx(0.452);

  const topProf = sampleBezierChain(
    [
      [[sx(-0.378), sy(0.042)], [sx(-0.295), sy(0.006)], [sx(-0.2), sy(-0.042)], [sx(-0.095), sy(-0.104)]],
      [[sx(-0.095), sy(-0.104)], [sx(-0.005), sy(-0.146)], [sx(0.085), sy(-0.132)], [sx(0.148), sy(-0.086)]],
      [[sx(0.148), sy(-0.086)], [sx(0.188), sy(-0.058)], [sx(0.218), sy(-0.098)], [sx(0.272), sy(-0.084)]],
      [[sx(0.272), sy(-0.084)], [sx(0.308), sy(-0.074)], [sx(0.326), sy(-0.042)], [sx(0.358), sy(-0.032)]],
      [[sx(0.358), sy(-0.032)], [sx(0.395), sy(-0.024)], [sx(0.428), sy(-0.03)], [xSnout, sy(-0.03)]],
    ],
    18
  );
  const botProf = sampleBezierChain(
    [
      [[sx(-0.378), sy(0.055)], [sx(-0.255), sy(0.016)], [sx(-0.165), sy(0.034)], [sx(-0.052), sy(0.082)]],
      [[sx(-0.052), sy(0.082)], [sx(0.04), sy(0.094)], [sx(0.095), sy(0.078)], [sx(0.145), sy(0.064)]],
      [[sx(0.145), sy(0.064)], [sx(0.212), sy(0.056)], [sx(0.252), sy(0.032)], [sx(0.292), sy(0.004)]],
      [[sx(0.292), sy(0.004)], [sx(0.345), sy(0.004)], [sx(0.395), sy(0.006)], [sx(0.444), sy(0.009)]],
    ],
    18
  );

  const evalZ = (x: number, t: number) => {
    if (x > sx(0.295)) return 0.015;
    if (x > sx(0.185)) return 0.034 - ((x - sx(0.185)) / (sx(0.295) - sx(0.185))) * 0.019;
    return 0.011 + 0.048 * Math.sin(Math.pow(clamp(t, 0, 1), 0.72) * Math.PI);
  };

  const { mapUV, beginCanvas2D } = createWorldMapper(xTail - 0.02, xSnout + 0.02, -0.145, 0.145, 512);
  const bodyCv = document.createElement("canvas");
  bodyCv.width = 512;
  bodyCv.height = 512;
  const bc = bodyCv.getContext("2d")!;
  beginCanvas2D(bc);
  bc.translate(0.038, 0.01);
  bc.scale(0.92, 0.92);

  bc.fillStyle = makeLin(bc, 0.02, -0.13, 0.02, 0.095, [
    [0, DK],
    [0.32, TEAL],
    [0.58, EMR],
    [0.82, AMBER],
    [1, GOLD],
  ]);
  bc.fillRect(-0.5, -0.25, 1.1, 0.5);
  drawGlow(bc, 0.04, -0.078, 0.25, 0.055, -0.06, "220,255,175", 0.3);

  // Golden-amber belly keel
  bc.fillStyle = makeLin(bc, 0.05, 0.005, 0.05, 0.095, [
    [0, "rgba(255,228,122,0.32)"],
    [0.55, GOLD],
    [1, AMBER],
  ]);
  bc.beginPath();
  bc.moveTo(-0.185, 0.016);
  bc.bezierCurveTo(-0.04, 0.03, 0.11, 0.034, 0.258, 0.004);
  bc.lineTo(0.255, 0.14);
  bc.lineTo(-0.22, 0.12);
  bc.closePath();
  bc.fill();

  // Turquoise vertical tiger stripes
  bc.strokeStyle = rgbaHex("#115e59", 0.45);
  bc.lineWidth = 0.009;
  for (let i = -3; i <= 2; i++) {
    const bx = i * 0.054 + 0.01;
    bc.beginPath();
    bc.moveTo(bx, -0.14);
    bc.quadraticCurveTo(bx - 0.024, 0, bx + 0.004, 0.1);
    bc.stroke();
  }

  // Sculpted golden bony armor rings & dark shadow ridges
  bc.strokeStyle = rgbaHex(GOLD, 0.8);
  bc.lineWidth = 0.0038;
  for (let i = -6; i <= 4; i++) {
    const rx = i * 0.044 - 0.022;
    bc.beginPath();
    bc.moveTo(rx, -0.145);
    bc.quadraticCurveTo(rx - 0.022, 0, rx, 0.1);
    bc.stroke();
  }
  bc.strokeStyle = rgbaHex(DK, 0.45);
  bc.lineWidth = 0.0022;
  for (let i = -6; i <= 4; i++) {
    const rx = i * 0.044 - 0.017;
    bc.beginPath();
    bc.moveTo(rx, -0.145);
    bc.quadraticCurveTo(rx - 0.022, 0, rx, 0.1);
    bc.stroke();
  }

  // Pipe-snout & curled-tail armor rings
  bc.strokeStyle = rgbaHex(GOLD, 0.58);
  bc.lineWidth = 0.0024;
  for (let i = 0; i < 4; i++) {
    const rx = 0.318 + i * 0.028;
    bc.beginPath();
    bc.moveTo(rx, -0.045);
    bc.lineTo(rx - 0.004, 0.01);
    bc.stroke();
  }
  for (let i = 0; i < 4; i++) {
    const tx = -0.24 - i * 0.032;
    bc.beginPath();
    bc.moveTo(tx, -0.045);
    bc.lineTo(tx + 0.004, 0.085);
    bc.stroke();
  }

  // 8 Luminous mint jewel spots along flank armor
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
    bc.fillStyle = rgbaHex(LEAF, 0.94);
    drawBlob(bc, dx, dy, 0.0085, 0.0058, 0.12);
    bc.fillStyle = "#ffffff";
    drawBlob(bc, dx - 0.002, dy - 0.0018, 0.003, 0.002, 0.12);
  }
  bc.restore();

  const bodyTex = track(new THREE.CanvasTexture(bodyCv));
  bodyTex.colorSpace = THREE.SRGBColorSpace;
  bodyTex.anisotropy = maxAnisotropy;

  const evalTop = (x: number) => interpCurveY(topProf, x);
  const evalBot = (x: number) => interpCurveY(botProf, x);
  const evalUpperPalate = (x: number) => (x > sx(0.38) ? sy(-0.008) : sy(0.002));
  const evalUnifiedBot = blendBotToPalate(evalBot, evalUpperPalate, xHead);
  const evalMidY = (x: number) => (evalTop(x) + evalUnifiedBot(x)) * 0.5;
  const seadragonMask = bodySpineOutlineMask(
    evalMidY,
    [{ x0: sx(0.246), x1: sx(0.295), top: true }],
    0.016
  );

  const bodyGeo = track(
    buildLoftedSurface({
      xStart: xTail,
      xEnd: xSnout,
      uSteps: 52,
      vSteps: 22,
      evalTopY: evalTop,
      evalBotY: evalUnifiedBot,
      evalHalfZ: evalZ,
      mapUV,
      rearBulge: 0.003,
      roundFront: true,
    })
  );
  const bodyMat = ctx.makeFishMat(bodyTex, { emissiveIntensity: 0.32 });
  injectSpineShader(bodyMat, uniforms, 0, 0);
  bodyGroup.add(
    new THREE.Mesh(bodyGeo, bodyMat),
    new THREE.Mesh(track(buildOutlineGeometry(bodyGeo, 0.003, seadragonMask)), makeOutlineMat(0, 0))
  );

  // Pipe-snout Lower Jaw (upper snout unified into cranium)
  const upperJawGroup = new THREE.Group();
  upperJawGroup.position.set(xHead, hy + 0.014, 0);
  bodyGroup.add(upperJawGroup);

  const lowerJawGroup = new THREE.Group();
  lowerJawGroup.position.set(xHead, hy - 0.002, 0);
  bodyGroup.add(lowerJawGroup);
  const lGeo = track(
    buildLoftedSurface({
      xStart: xHead - 0.016,
      xEnd: xSnout - 0.008,
      uSteps: 18,
      vSteps: 16,
      evalTopY: () => sy(-0.008),
      evalBotY: evalBot,
      evalHalfZ: (x) => evalZ(x, (x - xTail) / (xSnout - xTail)) * 0.9,
      mapUV,
      localOffsetX: xHead,
      localOffsetY: hy - 0.002,
      roundFront: true,
      rearInsetAt: (x) => (x < xHead ? smoothstep(xHead - 0.016, xHead + 0.008, x) * 0.92 + 0.08 : 1),
    })
  );
  lowerJawGroup.add(
    new THREE.Mesh(lGeo, bodyMat),
    new THREE.Mesh(track(buildOutlineGeometry(lGeo, 0.0022, jawOutlineMask(0.006, 0.042))), makeOutlineMat(xHead, hy - 0.002))
  );

  const { mouthInterior, tongueMesh } = createOralParts(
    ctx,
    bodyGroup,
    lowerJawGroup,
    sx(0.385),
    sy(-0.008),
    "#5c1328",
    "#ff8aa8",
    [0.02, 0.012, 0.011],
    [0.014, 0.006, 0.008],
    0.04
  );

  // Ruffled 4-scallop kelp leaflet factory (warm & cool variants cached)
  const buildKelpLeafletPair = (warm: boolean) => {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.bezierCurveTo(0.16, 0.95, 0.3, 0.45, 0.42, 1.15);
    shape.bezierCurveTo(0.56, 1.0, 0.65, 0.38, 0.78, 0.85);
    shape.bezierCurveTo(0.9, 0.46, 0.96, 0.24, 1.0, 0.14);
    shape.bezierCurveTo(0.95, -0.14, 0.86, -0.64, 0.74, -0.46);
    shape.bezierCurveTo(0.62, -1.02, 0.5, -0.6, 0.38, -0.98);
    shape.bezierCurveTo(0.24, -0.62, 0.14, -0.35, 0, -0.003);
    shape.closePath();

    const { geo, bounds } = createExtrudedFin(shape, 0.016, 0.003, 14);
    track(geo);
    const tex = track(
      makePaintedFinTex(
        maxAnisotropy,
        bounds,
        (fc) => {
          fc.fillStyle = makeLin(
            fc,
            0,
            0.35,
            1,
            -0.25,
            warm
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
                ]
          );
          fc.fillRect(-0.1, -1.25, 1.25, 2.55);
          fc.strokeStyle = rgbaHex(warm ? "#fff6bd" : GOLD, 0.85);
          fc.lineWidth = 0.032;
          fc.beginPath();
          fc.moveTo(0.01, 0);
          fc.quadraticCurveTo(0.52, 0.05, 0.92, 0.13);
          fc.stroke();
          fc.lineWidth = 0.022;
          for (const t of [0.32, 0.54, 0.74]) {
            const vx = t;
            const vy = t * 0.09;
            fc.beginPath();
            fc.moveTo(vx, vy);
            fc.lineTo(vx + 0.1, vy + 0.62);
            fc.moveTo(vx, vy);
            fc.lineTo(vx + 0.09, vy - 0.56);
            fc.stroke();
          }
        },
        192
      )
    );
    const mat = ctx.makeFishMat(tex, { emissiveIntensity: 0.32 });
    const olGeo = track(buildOutlineGeometry(geo, 0.014));
    const olMat = makeOutlineMat(0, 0, false);
    return { geo, mat, olGeo, olMat };
  };

  const warmLeaf = buildKelpLeafletPair(true);
  const coolLeaf = buildKelpLeafletPair(false);
  const stemMat = track(
    new THREE.MeshPhysicalMaterial({ color: EMR, emissive: EMR, emissiveIntensity: 0.2, roughness: 0.4 })
  );
  const amberStemMat = track(
    new THREE.MeshPhysicalMaterial({ color: AMBER, emissive: AMBER, emissiveIntensity: 0.2, roughness: 0.4 })
  );

  const kelpSwayGroups: { g: THREE.Group; baseRot: number; phase: number }[] = [];
  const addKelpBranch = (
    ax2: number,
    ay2: number,
    ang2: number,
    len: number,
    wid: number,
    warm: boolean,
    branches: number,
    zOff: number,
    phase: number
  ) => {
    const g = new THREE.Group();
    g.position.set(sx(ax2), sy(ay2), zOff);
    const baseRot = -ang2;
    g.rotation.z = baseRot;
    const stemLen = len * 0.29;
    const sGeo = track(new THREE.CylinderGeometry(0.0022, 0.0028, stemLen, 6));
    sGeo.rotateZ(-Math.PI * 0.5);
    sGeo.translate(stemLen * 0.5, 0, 0);
    const stem = new THREE.Mesh(sGeo, warm ? amberStemMat : stemMat);
    g.add(stem);

    const tip = new THREE.Group();
    tip.position.set(stemLen, 0, 0);
    g.add(tip);

    const addBlade = (rotZ: number, bLen: number, bWid: number, isWarm: boolean) => {
      const asset = isWarm ? warmLeaf : coolLeaf;
      const m = new THREE.Mesh(asset.geo, asset.mat);
      m.scale.set(bLen, bWid, 0.16);
      m.rotation.z = rotZ;
      m.add(new THREE.Mesh(asset.olGeo, asset.olMat));
      tip.add(m);
    };

    if (branches >= 3) {
      addBlade(-0.46, len * 0.52, wid * 0.72, !warm);
      addBlade(0.44, len * 0.55, wid * 0.76, warm);
    } else if (branches === 2) {
      addBlade(-0.38, len * 0.54, wid * 0.74, !warm);
    }
    addBlade(0, len * 0.78, wid, warm);

    bodyGroup.add(g);
    kelpSwayGroups.push({ g, baseRot, phase });
  };

  // Far-side kelp clusters (z < 0)
  addKelpBranch(-0.14, -0.042, -2.14, 0.165, 0.04, true, 2, -0.022, 0.4);
  addKelpBranch(0.01, -0.092, -1.78, 0.185, 0.044, false, 2, -0.026, 1.1);
  addKelpBranch(-0.02, 0.068, 1.98, 0.165, 0.04, true, 2, -0.024, 2.0);
  addKelpBranch(-0.34, 0.028, 2.75, 0.155, 0.038, false, 2, -0.014, 2.8);

  // Near-side tail, dorsal, belly, chin & crown kelp plumes
  addKelpBranch(-0.355, 0.022, -2.62, 0.17, 0.042, true, 3, 0.008, 0.2);
  addKelpBranch(-0.275, 0.008, -2.35, 0.145, 0.036, false, 2, 0.01, 0.9);
  addKelpBranch(-0.335, 0.048, 2.52, 0.155, 0.038, false, 2, 0.008, 1.7);

  addKelpBranch(-0.155, -0.052, -2.02, 0.175, 0.044, false, 3, 0.018, 0.6);
  addKelpBranch(-0.032, -0.108, -1.72, 0.21, 0.05, true, 3, 0.022, 1.3);
  addKelpBranch(0.088, -0.104, -1.48, 0.175, 0.042, false, 3, 0.018, 2.1);

  addKelpBranch(-0.145, 0.028, 2.15, 0.155, 0.038, true, 2, 0.02, 0.8);
  addKelpBranch(0.0, 0.072, 1.82, 0.18, 0.044, false, 3, 0.022, 1.5);
  addKelpBranch(0.125, 0.058, 1.48, 0.145, 0.036, true, 2, 0.018, 2.4);

  addKelpBranch(0.318, -0.002, 1.48, 0.085, 0.022, false, 2, 0.006, 0.3);
  addKelpBranch(0.225, -0.082, -1.96, 0.145, 0.035, true, 3, 0.008, 1.0);

  // Golden-Jade Brow Spine above eye
  const browShape = new THREE.Shape();
  browShape.moveTo(sx(0.246), sy(-0.078));
  browShape.quadraticCurveTo(sx(0.275), sy(-0.124), sx(0.304), sy(-0.126));
  browShape.quadraticCurveTo(sx(0.288), sy(-0.092), sx(0.28), sy(-0.072));
  browShape.closePath();
  bodyGroup.add(
    makeSpineFinMesh(ctx, browShape, 0, 0, 0.0024, 0.0006, (fc) => {
      fc.fillStyle = makeLin(fc, sx(0.25), sy(-0.075), sx(0.3), sy(-0.125), [
        [0, AMBER],
        [1, "#fff4b3"],
      ]);
      fc.fillRect(sx(0.23), sy(-0.065), 0.1, 0.08);
    }, maxAnisotropy, true, 0.0008, undefined, (x, y) => smoothstep(evalTop(x) - 0.004, evalTop(x) + 0.014, y)).mesh
  );

  // Translucent Golden-Pearl Dorsal Propeller Finlet
  const propShape = new THREE.Shape();
  propShape.moveTo(-0.064, -0.022);
  propShape.bezierCurveTo(-0.06, 0.068, 0.026, 0.084, 0.062, 0.004);
  propShape.closePath();
  const propFin = makeSpineFinMesh(ctx, propShape, sx(-0.125), sy(-0.068), 0.0022, 0.0006, (fc) => {
    fc.fillStyle = makeLin(fc, -0.05, 0.08, 0.06, -0.01, [
      [0, "rgba(255,248,185,0.94)"],
      [0.55, "rgba(230,168,37,0.82)"],
      [1, "rgba(23,168,154,0.88)"],
    ]);
    fc.fillRect(-0.09, -0.04, 0.18, 0.14);
    fc.strokeStyle = "rgba(255,255,225,0.75)";
    fc.lineWidth = 0.0022;
    for (let i = -3; i <= 3; i++) {
      fc.beginPath();
      fc.moveTo(i * 0.013, -0.008);
      fc.lineTo(i * 0.016 - 0.007, 0.062);
      fc.stroke();
    }
  }, maxAnisotropy, true, 0.0008, { transparent: true, opacity: 0.9 });
  propFin.mesh.position.set(sx(-0.125), sy(-0.068), 0);
  bodyGroup.add(propFin.mesh);

  // Tail Pivot + tiny curled tip leaf
  const tailPivot = new THREE.Group();
  tailPivot.position.set(sx(-0.355), sy(0.042), 0);
  bodyGroup.add(tailPivot);
  const tShape = new THREE.Shape();
  tShape.moveTo(0, 0.01);
  tShape.bezierCurveTo(-0.045, 0.035, -0.095, 0.025, -0.105, 0);
  tShape.bezierCurveTo(-0.09, -0.032, -0.04, -0.03, 0, -0.01);
  tShape.closePath();
  tailPivot.add(
    makeSpineFinMesh(ctx, tShape, sx(-0.355), sy(0.042), 0.0022, 0.0006, (fc) => {
      fc.fillStyle = makeLin(fc, 0, 0, -0.1, 0, [
        [0, EMR],
        [0.6, GOLD],
        [1, LEAF],
      ]);
      fc.fillRect(-0.14, -0.06, 0.16, 0.12);
    }, maxAnisotropy, false, 0.0008).mesh
  );

  // Gossamer Neck Pectoral Finlets
  const pShape = new THREE.Shape();
  pShape.moveTo(0, 0);
  pShape.bezierCurveTo(-0.024, 0.044, -0.09, 0.024, -0.085, -0.026);
  pShape.bezierCurveTo(-0.068, -0.066, -0.013, -0.05, 0, -0.013);
  pShape.closePath();
  const pecObj = makeSpineFinMesh(ctx, pShape, 0, 0, 0.0022, 0.0006, (fc) => {
    fc.fillStyle = makeLin(fc, 0, 0, -0.09, -0.02, [
      [0, "rgba(34,184,122,0.88)"],
      [0.52, "rgba(255,228,122,0.92)"],
      [1, "rgba(195,255,225,0.95)"],
    ]);
    fc.fillRect(-0.11, -0.08, 0.13, 0.14);
    drawFinRays(fc, [-0.005, -0.004], [[-0.07, -0.014], [-0.07, 0], [-0.07, 0.014], [-0.07, -0.028]], "rgba(255,255,255,0.7)", 0.0022);
  }, maxAnisotropy, false, 0.0008, { transparent: true, opacity: 0.92 });
  const pecZ = surfaceZAt(
    evalTop,
    evalUnifiedBot,
    (x) => evalZ(x, (x - xTail) / (xSnout - xTail)),
    sx(0.182),
    sy(-0.014),
    0.22,
    1.0
  ) + 0.006;
  const pecLeft = new THREE.Group();
  pecLeft.position.set(sx(0.182), sy(-0.014), pecZ);
  pecLeft.add(pecObj.mesh);
  const pecRight = new THREE.Group();
  pecRight.position.set(sx(0.182), sy(-0.014), -pecZ);
  pecRight.add(pecObj.mesh.clone());
  bodyGroup.add(pecLeft, pecRight);

  const pelvicFin = new THREE.Group();
  bodyGroup.add(pelvicFin);

  // Amber-ringed jewel eye
  const eyeX = sx(0.264);
  const eyeY = sy(-0.046);
  const eyeZ = surfaceZAt(evalTop, evalUnifiedBot, (x) => evalZ(x, (x - xTail) / (xSnout - xTail)), eyeX, eyeY);
  const amberRingGeo = track(new THREE.CylinderGeometry(0.034 * 1.2, 0.034 * 1.2, 0.007, 20));
  amberRingGeo.rotateX(Math.PI * 0.5);
  const amberRingMat = track(
    new THREE.MeshPhysicalMaterial({ color: GOLD, emissive: AMBER, emissiveIntensity: 0.25, roughness: 0.28 })
  );
  for (const s of [1, -1]) {
    const r = new THREE.Mesh(amberRingGeo, amberRingMat);
    r.position.set(eyeX, eyeY, s * (eyeZ - 0.001));
    r.rotation.y = s * 0.18;
    bodyGroup.add(r);
  }
  const { eyesNormal, eyesPupil, eyesHappy } = createEyePair(ctx, bodyGroup, {
    ex: eyeX,
    ey: eyeY,
    ez: eyeZ + 0.002,
    er: 0.034,
    irisColor: pal.iris || "#ff6b35",
    rimColor: OL,
    happyColor: GOLD,
  });

  const { biteRing, biteRingMat } = createBiteRing(ctx, bodyGroup, xSnout + 0.018, sy(-0.012), LEAF, 0.044);

  return {
    speciesKey: sp.id,
    tailPivotX: sx(-0.355),
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
    onCustomPose: (p, open, swimAmp) => {
      lowerJawGroup.rotation.z = -open * 0.52;
      mouthInterior.visible = open > 0.03;
      if (open > 0.03) mouthInterior.scale.set(0.85 + open * 0.2, 0.35 + open * 0.9, 0.8 + open * 0.2);
      tongueMesh.visible = open > 0.04;
      for (const k of kelpSwayGroups) {
        k.g.rotation.z = k.baseRot + Math.sin(p.wag2 * 1.4 + k.phase) * (0.11 + swimAmp * 0.35);
      }
      propFin.mesh.rotation.y = Math.sin(p.wag2 * 3) * 0.22;
    },
    dispose: () => {
      for (const d of ctx.disposables) d.dispose();
    },
  };
}

// =====================================================================================
// 5. AXOLOTL (Mochi — Chibi Sakura Salamander, 3x2 Feathered Gills, 4 3-Toed Feet!)
// =====================================================================================
function createAxolotl3DRig(sp: Species, maxAnisotropy: number): Fish3DRig {
  const pal = sp.pal;
  const OL = pal.outline || "#4d1234";
  const PINK = pal.body || "#ffb6d9";
  const DK = pal.dark || "#db5c98";
  const BELLY = pal.belly || "#fff2f9";
  const GILL = pal.fin || "#ff3f82";
  const CRYS = pal.spot || "#6ef7ff";

  const ctx = createRigContext(OL, "#464646");
  const { track, uniforms, makeOutlineMat } = ctx;
  const { root, pitchGroup, yawGroup, bodyGroup } = baseGroups();

  const xTail = -0.205;
  const xHead = 0.244;
  const hy = -0.040;
  const xSnout = 0.354;
  const tipY = -0.024;

  // Match drawAxolotl broad rounded chibi head & smooth closed mouth converging cleanly to nose tip
  const topProf = sampleBezierChain(
    [
      [[-0.205, 0.022], [-0.105, 0.076], [0.055, 0.096], [0.178, 0.104]],
      [[0.178, 0.104], [0.278, 0.112], [0.342, 0.062], [xSnout, tipY]],
    ],
    24
  );
  const botProf = sampleBezierChain(
    [
      [[-0.205, -0.022], [-0.09, -0.078], [0.052, -0.106], [0.175, -0.098]],
      [[0.175, -0.098], [0.285, -0.088], [0.340, -0.050], [xSnout, tipY]],
    ],
    24
  );
  const evalTop = (x: number) => interpCurveY(topProf, x);
  const evalBot = (x: number) => interpCurveY(botProf, x);
  // Smooth C1 cheek width tapering with ellipsoidal dome rounding at nose tip (zero cliff/crease, zero flat chisel)
  const evalZ = (x: number, t: number) => {
    const base = 0.026 + 0.086 * Math.sin(Math.pow(clamp(t, 0, 1), 0.72) * Math.PI);
    const cheekBoost = 0.032 * smoothstep(0.02, 0.23, x);
    const noseRound =
      x > 0.235 ? Math.sqrt(clamp(1 - Math.pow((x - 0.235) / (xSnout - 0.235), 2) * 0.996, 0.002, 1)) : 1;
    const hH = Math.max(0.002, (evalTop(x) - evalBot(x)) * 0.5);
    const w = (base + cheekBoost) * noseRound;
    return x > 0.235 ? Math.min(w, Math.max(0.002, hH * 1.32)) : w;
  };

  const { mapUV, beginCanvas2D } = createWorldMapper(-0.22, 0.37, -0.125, 0.125, 512);
  const bodyCv = document.createElement("canvas");
  bodyCv.width = 512;
  bodyCv.height = 512;
  const bc = bodyCv.getContext("2d")!;
  beginCanvas2D(bc);
  bc.fillStyle = makeLin(bc, 0.06, -0.108, 0.06, 0.105, [
    [0, DK],
    [0.42, PINK],
    [0.74, mixHex(PINK, BELLY, 0.45)],
    [1, mixHex(PINK, BELLY, 0.74)],
  ]);
  bc.fillRect(-0.32, -0.22, 0.78, 0.44);
  drawGlow(bc, 0.08, -0.058, 0.21, 0.045, 0, "255,255,255", 0.16);

  drawStar4Canvas(bc, 0.06, -0.042, 0.013, CRYS);
  drawStar4Canvas(bc, -0.03, -0.026, 0.015, CRYS);
  drawStar4Canvas(bc, -0.115, -0.012, 0.012, CRYS);
  bc.fillStyle = rgbaHex(CRYS, 0.85);
  drawBlob(bc, 0.015, 0.026, 0.009, 0.0065, 0);

  // Rosy merona cheek blush sits cleanly behind smile corner + twin white shine slashes
  bc.fillStyle = rgbaHex(GILL, 0.42);
  drawBlob(bc, 0.220, 0.026, 0.024, 0.014, 0.06);
  bc.strokeStyle = "rgba(255,255,255,0.68)";
  bc.lineWidth = 0.0024;
  bc.beginPath();
  bc.moveTo(0.212, 0.024);
  bc.lineTo(0.217, 0.018);
  bc.moveTo(0.222, 0.026);
  bc.lineTo(0.227, 0.020);
  bc.stroke();

  // Adorable delicate curved axolotl smile & friendly corner dimple matching evalSeamY
  bc.strokeStyle = rgbaHex(OL, 0.84);
  bc.lineWidth = 0.0046;
  bc.lineCap = "round";
  bc.beginPath();
  bc.moveTo(0.350, 0.024);
  bc.quadraticCurveTo(0.298, 0.044, 0.244, 0.038);
  bc.stroke();
  bc.lineWidth = 0.0038;
  bc.beginPath();
  bc.arc(0.241, 0.036, 0.008, Math.PI * 0.65, Math.PI * 1.45);
  bc.stroke();

  bc.restore();

  const bodyTex = track(new THREE.CanvasTexture(bodyCv));
  bodyTex.colorSpace = THREE.SRGBColorSpace;
  bodyTex.anisotropy = maxAnisotropy;

  const evalSeamY = (x: number) => {
    const u = clamp((x - xHead) / (xSnout - xHead), 0, 1);
    return hy - Math.sin(u * Math.PI) * 0.005 + u * (tipY - hy);
  };
  const evalMidY = (x: number) => (evalTop(x) + evalBot(x)) * 0.5;
  const axoSpineMask = bodySpineOutlineMask(
    evalMidY,
    [{ x0: -0.205, x1: 0.02, top: true }, { x0: -0.205, x1: -0.09, top: false }],
    0.022
  );
  const axoSeamMask = mouthSeamOutlineMask(xHead, xSnout, hy, evalSeamY, false);
  const axoBodyMask = (x: number, y: number, z: number) => axoSpineMask(x, y, z) * axoSeamMask(x, y, z);

  const { bodyGeo, lowerJawGeo: lGeo } = buildSlicedHeadBody({
    xStart: xTail,
    xHinge: xHead,
    xEnd: xSnout,
    xLowerEnd: xSnout - 0.001,
    jawY: hy,
    evalTopY: evalTop,
    evalBotY: evalBot,
    evalSeamY,
    evalHalfZ: evalZ,
    mapUV,
    rearBulge: 0.004,
    uSteps: 60,
    vSteps: 32,
  });
  track(bodyGeo);
  track(lGeo);
  const bodyMat = ctx.makeFishMat(bodyTex, { emissiveIntensity: 0.18 });
  injectSpineShader(bodyMat, uniforms, 0, 0);
  bodyGroup.add(
    new THREE.Mesh(bodyGeo, bodyMat),
    new THREE.Mesh(track(buildOutlineGeometry(bodyGeo, 0.0036, axoBodyMask)), makeOutlineMat(0, 0))
  );

  // Compact Cute Front Mouth Lower Jaw (hinged cleanly below eye & ahead of blush)
  const upperJawGroup = new THREE.Group();
  upperJawGroup.position.set(xHead, hy, 0);
  bodyGroup.add(upperJawGroup);

  const lowerJawGroup = new THREE.Group();
  lowerJawGroup.position.set(xHead, hy, 0);
  bodyGroup.add(lowerJawGroup);
  const lMat = ctx.makeFishMat(bodyTex, { emissiveIntensity: 0.18 });
  injectSpineShader(lMat, uniforms, xHead, hy);
  lowerJawGroup.add(
    new THREE.Mesh(lGeo, lMat),
    new THREE.Mesh(
      track(buildOutlineGeometry(lGeo, 0.0032, mouthSeamOutlineMask(xHead, xSnout, hy, evalSeamY, true))),
      makeOutlineMat(xHead, hy)
    )
  );

  const { mouthInterior, tongueMesh } = createOralParts(
    ctx,
    bodyGroup,
    lowerJawGroup,
    xHead + 0.028,
    hy + 0.004,
    "#7a1440",
    "#ff78aa",
    [0.044, 0.028, 0.042],
    [0.032, 0.011, 0.020],
    0.044
  );

  // 3 PAIRS of Fluffy Curved Feathered Coral-Magenta External Gills! (No spiky outline extrusion!)
  const makeFeatheredGillObj = (len: number) => {
    const gShape = new THREE.Shape();
    gShape.moveTo(0, -0.013);
    const nPinnae = 5;
    for (let i = 1; i <= nPinnae; i++) {
      const t = i / (nPinnae + 0.7);
      const bx = len * t;
      const fl = len * (0.30 + Math.sin(t * Math.PI) * 0.15);
      const tipX = bx - fl * 0.28;
      const tipY = -fl * 0.92;
      gShape.lineTo(bx - 0.006, -0.012);
      gShape.quadraticCurveTo(bx - fl * 0.20, -fl * 0.65, tipX, tipY);
      gShape.quadraticCurveTo(bx + 0.008, -fl * 0.62, bx + 0.009, -0.011);
    }
    gShape.quadraticCurveTo(len * 1.07, 0, len * 0.98, 0.011);
    for (let i = nPinnae; i >= 1; i--) {
      const t = i / (nPinnae + 0.7);
      const bx = len * t;
      const fl = len * (0.30 + Math.sin(t * Math.PI) * 0.15);
      const tipX = bx - fl * 0.28;
      const tipY = fl * 0.92;
      gShape.lineTo(bx + 0.009, 0.011);
      gShape.quadraticCurveTo(bx + 0.008, fl * 0.62, tipX, tipY);
      gShape.quadraticCurveTo(bx - fl * 0.20, fl * 0.65, bx - 0.006, 0.012);
    }
    gShape.lineTo(0, 0.013);
    gShape.closePath();

    return makeSpineFinMesh(ctx, gShape, 0, 0, 0.0055, 0.0022, (fc) => {
      fc.fillStyle = makeLin(fc, 0, 0, len, 0, [
        [0, PINK],
        [0.42, GILL],
        [0.82, "#ff8fc0"],
        [1, "#ffd9ec"],
      ]);
      fc.fillRect(-0.02, -len * 0.65, len * 1.2, len * 1.3);
      // Soft painted pinna shading & contour lines instead of jagged 3D backface spikes
      fc.strokeStyle = rgbaHex(OL, 0.42);
      fc.lineWidth = 0.0032;
      fc.lineCap = "round";
      for (let i = 1; i <= nPinnae; i++) {
        const t = i / (nPinnae + 0.7);
        const bx = len * t;
        const fl = len * (0.30 + Math.sin(t * Math.PI) * 0.15);
        fc.beginPath();
        fc.moveTo(bx, 0);
        fc.quadraticCurveTo(bx - fl * 0.14, -fl * 0.48, bx - fl * 0.26, -fl * 0.82);
        fc.moveTo(bx, 0);
        fc.quadraticCurveTo(bx - fl * 0.14, fl * 0.48, bx - fl * 0.26, fl * 0.82);
        fc.stroke();
      }
      fc.strokeStyle = rgbaHex(CRYS, 0.68);
      fc.lineWidth = 0.0028;
      fc.beginPath();
      fc.moveTo(0.01, 0);
      fc.lineTo(len * 0.86, 0);
      fc.stroke();
    }, maxAnisotropy, false, 0);
  };

  // Crowned halo arrangement flaring softly OUTWARD (-s * angle) so front & side views read lush & feathery!
  const gillConfigs: [number, number, number, number][] = [
    [0.162, 0.072, 1.88, 0.126],
    [0.146, 0.036, 2.28, 0.140],
    [0.140, -0.004, 2.68, 0.122],
  ];
  const evalAxoZ = (x: number) => evalZ(x, (x - xTail) / (xSnout - xTail));
  const gillMeshes: { mesh: THREE.Object3D; baseRotY: number; phase: number }[] = [];
  for (const s of [1, -1]) {
    gillConfigs.forEach(([gx, gy, rotZ, gLen], gi) => {
      const obj = makeFeatheredGillObj(gLen);
      const gz = Math.max(0.01, surfaceZAt(evalTop, evalBot, evalAxoZ, gx, gy, 0.22, 0.94));
      const pivotZ = new THREE.Group();
      pivotZ.position.set(gx, gy, s * gz);
      pivotZ.rotation.z = rotZ;
      const flare = new THREE.Group();
      const baseRotY = -s * (0.48 + gi * 0.07);
      flare.rotation.y = baseRotY;
      flare.rotation.x = s * (0.08 - gi * 0.04);
      flare.add(obj.mesh);
      pivotZ.add(flare);
      bodyGroup.add(pivotZ);
      gillMeshes.push({ mesh: flare, baseRotY, phase: gi * 0.55 });
    });
  }

  // 4 Cute Plump 3-Toed Paddle Feet!
  const footShape = new THREE.Shape();
  footShape.moveTo(-0.015, 0.008);
  footShape.bezierCurveTo(-0.019, -0.032, -0.035, -0.058, -0.022, -0.068);
  footShape.quadraticCurveTo(-0.01, -0.078, -0.002, -0.065);
  footShape.quadraticCurveTo(0.008, -0.076, 0.016, -0.064);
  footShape.quadraticCurveTo(0.027, -0.07, 0.025, -0.052);
  footShape.bezierCurveTo(0.023, -0.03, 0.013, -0.008, 0.011, 0.008);
  footShape.closePath();
  const footAsset = makeSpineFinMesh(ctx, footShape, 0, 0, 0.0075, 0.002, (fc) => {
    fc.fillStyle = makeLin(fc, 0, 0.01, 0, -0.07, [
      [0, PINK],
      [0.75, BELLY],
      [1, "#ffe3f2"],
    ]);
    fc.fillRect(-0.05, -0.1, 0.1, 0.14);
  }, maxAnisotropy, false, 0.0011);

  const feet: { g: THREE.Group; baseRotZ: number; phase: number }[] = [];
  for (const [fx, fy, s, baseRotZ, ph] of [
    [0.092, -0.058, 1, -0.36, 0],
    [0.092, -0.058, -1, -0.36, Math.PI],
    [-0.095, -0.048, 1, -0.72, Math.PI],
    [-0.095, -0.048, -1, -0.72, 0],
  ] as const) {
    const fz = s * (surfaceZAt(evalTop, evalBot, evalAxoZ, fx, fy, 0.22, 1.0) + 0.005);
    const fg = new THREE.Group();
    fg.position.set(fx, fy, fz);
    fg.rotation.z = baseRotZ;
    fg.rotation.x = s > 0 ? -0.44 : 0.44;
    fg.rotation.y = s * 0.24;
    const fm = feesClone(footAsset.mesh);
    fg.add(fm);
    bodyGroup.add(fg);
    feet.push({ g: fg, baseRotZ, phase: ph });
  }
  function feesClone(m: THREE.Mesh) {
    return m === footAsset.mesh && feet.length === 0 ? m : m.clone();
  }

  // ONE Continuous Seamless Spine-Waving Crystal Ribbon Tail (dense regular lofted quad grid = zero facets, zero seam/tear!)
  const tailTopPts = sampleBezierChain(
    [
      [[-0.448, -0.006], [-0.422, 0.088], [-0.305, 0.148], [-0.155, 0.132]],
      [[-0.155, 0.132], [-0.075, 0.118], [-0.025, 0.095], [0.015, 0.068]],
    ],
    26
  );
  const tailBotPts = sampleBezierChain(
    [
      [[-0.448, -0.006], [-0.415, -0.092], [-0.315, -0.128], [-0.205, -0.020]],
      [[-0.205, -0.020], [-0.145, 0.012], [-0.065, 0.044], [0.015, 0.065]],
    ],
    26
  );
  const { geo: tailRibbonGeo, bounds: tailRibbonBounds } = buildSmoothLoftedFin({
    xStart: -0.448,
    xEnd: 0.015,
    uSteps: 40,
    vSteps: 14,
    evalTopY: (x) => interpCurveY(tailTopPts, x),
    evalBotY: (x) => interpCurveY(tailBotPts, x),
    maxHalfZ: 0.0042,
  });
  track(tailRibbonGeo);

  const tailRibbonTex = track(
    makePaintedFinTex(
      maxAnisotropy,
      tailRibbonBounds,
      (fc) => {
        fc.fillStyle = makeLin(fc, 0.02, 0.11, -0.44, -0.08, [
          [0, "rgba(255,182,217,0.88)"],
          [0.42, "rgba(255,110,175,0.74)"],
          [0.78, "rgba(110,247,255,0.82)"],
          [1, "rgba(218,252,255,0.94)"],
        ]);
        fc.fillRect(-0.52, -0.18, 0.60, 0.38);
        // Subtle iridescent crystal facets
        fc.fillStyle = "rgba(255,255,255,0.28)";
        fc.beginPath();
        fc.moveTo(-0.22, 0.115);
        fc.lineTo(-0.31, 0.04);
        fc.lineTo(-0.37, 0.085);
        fc.closePath();
        fc.fill();
        fc.fillStyle = "rgba(110,247,255,0.34)";
        fc.beginPath();
        fc.moveTo(-0.32, -0.015);
        fc.lineTo(-0.41, -0.045);
        fc.lineTo(-0.36, -0.095);
        fc.closePath();
        fc.fill();
        // Continuous iridescent aqua-pearl rim along crest & crystal tail edge
        fc.strokeStyle = rgbaHex(CRYS, 0.88);
        fc.lineWidth = 0.0075;
        fc.lineCap = "round";
        fc.beginPath();
        fc.moveTo(0.0, 0.074);
        fc.bezierCurveTo(-0.14, 0.132, -0.32, 0.138, -0.415, 0.032);
        fc.bezierCurveTo(-0.442, -0.004, -0.430, -0.056, -0.395, -0.084);
        fc.stroke();
        drawStar4Canvas(fc, -0.14, 0.098, 0.014, CRYS);
        drawStar4Canvas(fc, -0.265, 0.068, 0.016, CRYS);
        drawStar4Canvas(fc, -0.365, 0.015, 0.018, "#ffffff");
        drawStar4Canvas(fc, -0.315, -0.058, 0.014, CRYS);
      },
      384
    )
  );
  const tailRibbonMat = ctx.makeFishMat(tailRibbonTex, {
    transparent: true,
    opacity: 0.92,
    emissiveIntensity: 0.28,
  });
  injectSpineShader(tailRibbonMat, uniforms, 0, 0);
  const tailRibbonMesh = new THREE.Mesh(tailRibbonGeo, tailRibbonMat);
  const ribbonTailMask = (x: number, y: number) => {
    if (x >= -0.205) {
      return smoothstep(evalTop(x) - 0.002, evalTop(x) + 0.012, y);
    }
    return 1;
  };
  tailRibbonMesh.add(
    new THREE.Mesh(track(buildOutlineGeometry(tailRibbonGeo, 0.0011, ribbonTailMask)), makeOutlineMat(0, 0, true))
  );
  bodyGroup.add(tailRibbonMesh);

  // Empty tailPivot kept at tail root for pose API compatibility (ribbon waves organically with spine shader)
  const tailPivot = new THREE.Group();
  tailPivot.position.set(-0.205, 0, 0);
  bodyGroup.add(tailPivot);

  const pecLeft = new THREE.Group();
  const pecRight = new THREE.Group();
  const pelvicFin = new THREE.Group();

  const eyeZ = computeEyeZ(
    evalTop,
    evalBot,
    (x) => evalZ(x, clamp((x - xTail) / (xSnout - xTail), 0, 1)),
    0.252,
    0.032,
    0.042
  );
  const { eyesNormal, eyesPupil, eyesHappy } = createEyePair(ctx, bodyGroup, {
    ex: 0.252,
    ey: 0.032,
    ez: eyeZ,
    er: 0.042,
    sx: 0.94,
    yawRot: 0.28,
    irisScale: 0.68,
    pupilScale: 0.44,
    irisColor: pal.iris || "#28143b",
    rimColor: OL,
    happyColor: GILL,
  });

  const { biteRing, biteRingMat } = createBiteRing(ctx, bodyGroup, xSnout + 0.02, -0.02, CRYS, 0.05);

  return {
    speciesKey: sp.id,
    tailPivotX: -0.192,
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
      lowerJawGroup.rotation.z = -open * 0.56;
      mouthInterior.visible = open > 0.03;
      if (open > 0.03) mouthInterior.scale.set(0.85 + open * 0.2, 0.35 + open * 0.9, 0.8 + open * 0.2);
      tongueMesh.visible = open > 0.04;
      for (const f of feet) {
        f.g.rotation.z = f.baseRotZ + Math.sin(p.tailPh + f.phase) * 0.32;
      }
      for (const gm of gillMeshes) {
        gm.mesh.rotation.y = gm.baseRotY + Math.sin(p.wag2 + gm.phase) * 0.12;
      }
    },
    dispose: () => {
      for (const d of ctx.disposables) d.dispose();
    },
  };
}

// =====================================================================================
// 6. WHALESHARK (Astro — Midnight-Navy Gentle Giant, Star Constellations & Fixed Dorsal!)
// =====================================================================================
function createWhaleshark3DRig(sp: Species, maxAnisotropy: number): Fish3DRig {
  const pal = sp.pal;
  const OL = pal.outline || "#050d24";
  const NAVY = pal.body || "#163a7a";
  const DK = pal.dark || "#0a1a42";
  const BELLY = pal.belly || "#e8f6ff";
  const FIN = pal.fin || "#1d4b96";
  const TAIL = pal.tail || "#13346e";
  const CYAN = pal.stripe || "#5ce6ff";
  const STAR = pal.spot || "#fff4b8";

  const ctx = createRigContext(OL, "#4a4a4a");
  const { track, uniforms, makeOutlineMat } = ctx;
  const { root, pitchGroup, yawGroup, bodyGroup } = baseGroups();

  const xTail = -0.232;
  const xHead = 0.242;
  const hy = -0.034;
  const xSnout = 0.392;

  const topProf = sampleBezierChain(
    [
      [[-0.232, 0.022], [-0.122, 0.096], [0.068, 0.125], [0.242, 0.106]],
      [[0.242, 0.106], [0.338, 0.095], [0.388, 0.052], [xSnout, -0.008]],
    ],
    22
  );
  const botProf = sampleBezierChain(
    [
      [[-0.232, -0.022], [-0.108, -0.068], [0.052, -0.108], [0.195, -0.092]],
      [[0.195, -0.092], [0.326, -0.082], [0.358, -0.048], [0.376, -0.042]],
    ],
    22
  );
  const evalZ = (x: number, t: number) => {
    const base = 0.024 + 0.108 * Math.sin(Math.pow(clamp(t, 0, 1), 0.72) * Math.PI);
    return x > 0.24 ? Math.max(0.056, base * 0.88) : base;
  };

  const { mapUV, beginCanvas2D } = createWorldMapper(-0.25, 0.41, -0.135, 0.135, 512);
  const bodyCv = document.createElement("canvas");
  bodyCv.width = 512;
  bodyCv.height = 512;
  const bc = bodyCv.getContext("2d")!;
  beginCanvas2D(bc);
  bc.fillStyle = makeLin(bc, 0.05, -0.118, 0.05, 0.106, [
    [0, DK],
    [0.44, NAVY],
    [0.68, "#2255a6"],
    [0.73, BELLY],
    [1, "#cbe7ff"],
  ]);
  bc.fillRect(-0.35, -0.25, 0.9, 0.5);
  drawGlow(bc, 0.08, -0.07, 0.24, 0.048, -0.04, "125,240,255", 0.26);

  // Faint celestial checkerboard bands
  bc.strokeStyle = rgbaHex(CYAN, 0.28);
  bc.lineWidth = 0.0038;
  for (let i = -3; i <= 3; i++) {
    const bx = i * 0.052 + 0.025;
    bc.beginPath();
    bc.moveTo(bx, -0.125);
    bc.quadraticCurveTo(bx - 0.008, -0.048, bx, 0.015);
    bc.stroke();
  }
  // Longitudinal dermal ridge
  bc.strokeStyle = rgbaHex(CYAN, 0.28);
  bc.lineWidth = 0.003;
  bc.beginPath();
  bc.moveTo(-0.21, -0.008);
  bc.quadraticCurveTo(0, -0.025, 0.19, -0.018);
  bc.stroke();

  // Star Constellation Network
  const nodes: [number, number, number][] = [
    [0.245, -0.066, 0.011],
    [0.185, -0.042, 0.009],
    [0.128, -0.075, 0.013],
    [0.068, -0.036, 0.01],
    [0.012, -0.072, 0.012],
    [-0.048, -0.034, 0.01],
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
  bc.strokeStyle = rgbaHex(CYAN, 0.65);
  bc.lineWidth = 0.0028;
  bc.beginPath();
  for (const [a, b] of edges) {
    bc.moveTo(nodes[a][0], nodes[a][1]);
    bc.lineTo(nodes[b][0], nodes[b][1]);
  }
  bc.stroke();
  for (const [sx, sy, sr] of nodes) {
    drawStar4Canvas(bc, sx, sy, sr, STAR, rgbaHex(CYAN, 0.34));
  }
  bc.fillStyle = rgbaHex(STAR, 0.88);
  for (const [dx, dy, dr] of [
    [0.285, -0.052, 0.0048],
    [0.155, -0.008, 0.0045],
    [0.042, -0.005, 0.0045],
    [-0.075, -0.004, 0.0045],
    [0.095, -0.088, 0.0048],
  ]) {
    bc.beginPath();
    bc.arc(dx, dy, dr, 0, Math.PI * 2);
    bc.fill();
  }

  // 5 distinct whale-shark gill slits
  bc.strokeStyle = rgbaHex(DK, 0.8);
  bc.lineWidth = 0.0042;
  for (let g = 0; g < 5; g++) {
    const gx = 0.142 + g * 0.014;
    bc.beginPath();
    bc.moveTo(gx, -0.024);
    bc.quadraticCurveTo(gx - 0.004, 0.006, gx, 0.036);
    bc.stroke();
  }
  bc.restore();

  const bodyTex = track(new THREE.CanvasTexture(bodyCv));
  bodyTex.colorSpace = THREE.SRGBColorSpace;
  bodyTex.anisotropy = maxAnisotropy;

  const evalTop = (x: number) => interpCurveY(topProf, x);
  const evalBot = (x: number) => interpCurveY(botProf, x);
  const evalUpperPalate = () => -0.028;
  const evalUnifiedBot = blendBotToPalate(evalBot, evalUpperPalate, xHead);
  const evalMidY = (x: number) => (evalTop(x) + evalUnifiedBot(x)) * 0.5;
  const whalesharkMask = bodySpineOutlineMask(
    evalMidY,
    [
      { x0: -0.058, x1: 0.078, top: true },
      { x0: -0.19, x1: -0.126, top: true },
      { x0: -0.18, x1: -0.124, top: false },
    ],
    0.026
  );

  const bodyGeo = track(
    buildLoftedSurface({
      xStart: xTail,
      xEnd: xSnout,
      uSteps: 44,
      vSteps: 26,
      evalTopY: evalTop,
      evalBotY: evalUnifiedBot,
      evalHalfZ: evalZ,
      mapUV,
      rearBulge: 0.004,
      roundFront: true,
    })
  );
  const bodyMat = ctx.makeFishMat(bodyTex, { emissiveIntensity: 0.32 });
  injectSpineShader(bodyMat, uniforms, 0, 0);
  bodyGroup.add(
    new THREE.Mesh(bodyGeo, bodyMat),
    new THREE.Mesh(track(buildOutlineGeometry(bodyGeo, 0.004, whalesharkMask)), makeOutlineMat(0, 0))
  );

  // Broad Flat-Snouted Lower Jaw (upper snout unified into cranium)
  const upperJawGroup = new THREE.Group();
  upperJawGroup.position.set(xHead, hy + 0.014, 0);
  bodyGroup.add(upperJawGroup);

  const lowerJawGroup = new THREE.Group();
  lowerJawGroup.position.set(xHead, hy - 0.01, 0);
  bodyGroup.add(lowerJawGroup);
  const lGeo = track(
    buildLoftedSurface({
      xStart: xHead - 0.018,
      xEnd: xSnout - 0.016,
      uSteps: 18,
      vSteps: 18,
      evalTopY: () => -0.026,
      evalBotY: evalBot,
      evalHalfZ: (x) => evalZ(x, (x - xTail) / (xSnout - xTail)) * 0.92,
      mapUV,
      localOffsetX: xHead,
      localOffsetY: hy - 0.01,
      roundFront: true,
      rearInsetAt: (x) => (x < xHead ? smoothstep(xHead - 0.018, xHead + 0.008, x) * 0.92 + 0.08 : 1),
    })
  );
  lowerJawGroup.add(
    new THREE.Mesh(lGeo, bodyMat),
    new THREE.Mesh(track(buildOutlineGeometry(lGeo, 0.0034, jawOutlineMask(0.006, 0.042))), makeOutlineMat(xHead, hy - 0.01))
  );

  const { mouthInterior, tongueMesh } = createOralParts(
    ctx,
    bodyGroup,
    lowerJawGroup,
    xHead + 0.022,
    hy,
    "#17254a",
    "#4874b8",
    [0.044, 0.032, 0.048],
    [0.028, 0.011, 0.02],
    0.038
  );

  // FIXED BACKWARD-SWEPT Primary Dorsal Fin (leading convex edge on +X snout side, leaning back toward -X!)
  const dShape = new THREE.Shape();
  dShape.moveTo(0.078, 0.094);
  dShape.bezierCurveTo(0.052, 0.188, 0.006, 0.238, -0.046, 0.224);
  dShape.bezierCurveTo(-0.062, 0.175, -0.058, 0.125, -0.048, 0.088);
  dShape.closePath();
  bodyGroup.add(
    makeSpineFinMesh(ctx, dShape, 0, 0, 0.0036, 0.0009, (fc) => {
      fc.fillStyle = makeLin(fc, 0.01, 0.24, 0.01, 0.09, [
        [0, CYAN],
        [0.24, FIN],
        [0.75, NAVY],
        [1, DK],
      ]);
      fc.fillRect(-0.09, 0.06, 0.2, 0.2);
      fc.strokeStyle = rgbaHex(CYAN, 0.68);
      fc.lineWidth = 0.0042;
      fc.beginPath();
      fc.moveTo(0.035, 0.175);
      fc.quadraticCurveTo(0, 0.232, -0.042, 0.214);
      fc.stroke();
      drawStar4Canvas(fc, -0.002, 0.168, 0.011, STAR, rgbaHex(CYAN, 0.32));
      drawStar4Canvas(fc, 0.014, 0.132, 0.0095, STAR, rgbaHex(CYAN, 0.32));
    }, maxAnisotropy, true, 0.0011, undefined, (x, y) => smoothstep(evalTop(x) - 0.006, evalTop(x) + 0.016, y)).mesh
  );

  // 2nd Dorsal & Pale Anal Fin (also leaning backward -X)
  const d2Shape = new THREE.Shape();
  d2Shape.moveTo(-0.126, 0.054);
  d2Shape.bezierCurveTo(-0.146, 0.106, -0.174, 0.106, -0.19, 0.09);
  d2Shape.quadraticCurveTo(-0.186, 0.058, -0.184, 0.036);
  d2Shape.closePath();
  bodyGroup.add(
    makeSpineFinMesh(ctx, d2Shape, 0, 0, 0.003, 0.0008, (fc) => {
      fc.fillStyle = FIN;
      fc.fillRect(-0.22, 0.01, 0.12, 0.12);
    }, maxAnisotropy, true, 0.0009, undefined, (x, y) => smoothstep(evalTop(x) - 0.006, evalTop(x) + 0.014, y)).mesh
  );

  const aShape = new THREE.Shape();
  aShape.moveTo(-0.124, -0.046);
  aShape.bezierCurveTo(-0.142, -0.092, -0.168, -0.09, -0.18, -0.076);
  aShape.quadraticCurveTo(-0.178, -0.05, -0.174, -0.032);
  aShape.closePath();
  bodyGroup.add(
    makeSpineFinMesh(ctx, aShape, 0, 0, 0.0028, 0.0007, (fc) => {
      fc.fillStyle = BELLY;
      fc.fillRect(-0.21, -0.12, 0.12, 0.11);
    }, maxAnisotropy, true, 0.0009, undefined, (x, y) => smoothstep(evalBot(x) + 0.006, evalBot(x) - 0.014, y)).mesh
  );

  // Grand Crescent Whale-Shark Tail
  const tailPivot = new THREE.Group();
  tailPivot.position.set(-0.225, 0, 0);
  bodyGroup.add(tailPivot);
  const tShape = new THREE.Shape();
  tShape.moveTo(0.018, 0.024);
  tShape.bezierCurveTo(-0.075, 0.125, -0.165, 0.22, -0.232, 0.225);
  tShape.bezierCurveTo(-0.182, 0.115, -0.145, 0.032, -0.145, 0);
  tShape.bezierCurveTo(-0.145, -0.03, -0.165, -0.095, -0.195, -0.165);
  tShape.bezierCurveTo(-0.122, -0.135, -0.052, -0.072, 0.018, -0.024);
  tShape.closePath();
  tailPivot.add(
    makeSpineFinMesh(ctx, tShape, -0.225, 0, 0.0036, 0.0009, (fc) => {
      fc.fillStyle = makeLin(fc, 0, 0.21, -0.21, -0.15, [
        [0, DK],
        [0.48, NAVY],
        [1, TAIL],
      ]);
      fc.fillRect(-0.26, -0.2, 0.3, 0.46);
      fc.strokeStyle = rgbaHex(CYAN, 0.56);
      fc.lineWidth = 0.0045;
      fc.beginPath();
      fc.moveTo(-0.218, 0.205);
      fc.quadraticCurveTo(-0.155, 0.08, -0.148, 0);
      fc.stroke();
      drawStar4Canvas(fc, -0.13, 0.105, 0.012, STAR, rgbaHex(CYAN, 0.34));
      drawStar4Canvas(fc, -0.172, 0.152, 0.011, STAR, rgbaHex(CYAN, 0.34));
      fc.fillStyle = rgbaHex(STAR, 0.85);
      drawBlob(fc, -0.14, -0.078, 0.0065, 0.0055, 0);
    }, maxAnisotropy, false, 0.0011).mesh
  );

  // Majestic Sweeping Pectoral Wings
  const pShape = new THREE.Shape();
  pShape.moveTo(0.015, 0.008);
  pShape.bezierCurveTo(-0.005, -0.068, -0.105, -0.165, -0.175, -0.155);
  pShape.bezierCurveTo(-0.155, -0.092, -0.092, -0.025, -0.035, 0.016);
  pShape.closePath();
  const pecObj = makeSpineFinMesh(ctx, pShape, 0, 0, 0.0034, 0.0008, (fc) => {
    fc.fillStyle = makeLin(fc, 0.01, 0.01, -0.16, -0.15, [
      [0, DK],
      [0.4, NAVY],
      [0.75, FIN],
      [1, CYAN],
    ]);
    fc.fillRect(-0.21, -0.19, 0.26, 0.24);
    fc.strokeStyle = rgbaHex(CYAN, 0.7);
    fc.lineWidth = 0.0045;
    fc.beginPath();
    fc.moveTo(0.002, -0.018);
    fc.bezierCurveTo(-0.028, -0.085, -0.108, -0.15, -0.165, -0.145);
    fc.stroke();
    fc.strokeStyle = rgbaHex(CYAN, 0.52);
    fc.lineWidth = 0.0024;
    fc.beginPath();
    fc.moveTo(-0.068, -0.062);
    fc.lineTo(-0.118, -0.105);
    fc.stroke();
    drawStar4Canvas(fc, -0.068, -0.062, 0.011, STAR, rgbaHex(CYAN, 0.34));
    drawStar4Canvas(fc, -0.118, -0.105, 0.01, STAR, rgbaHex(CYAN, 0.34));
  }, maxAnisotropy, false, 0.0011);
  const pecZ = surfaceZAt(
    evalTop,
    evalUnifiedBot,
    (x) => evalZ(x, (x - xTail) / (xSnout - xTail)),
    0.118,
    -0.044,
    0.22,
    1.0
  ) + 0.006;
  const pecLeft = new THREE.Group();
  pecLeft.position.set(0.118, -0.044, pecZ);
  pecLeft.rotation.x = -0.3;
  pecLeft.add(pecObj.mesh);
  const pecRight = new THREE.Group();
  pecRight.position.set(0.118, -0.044, -pecZ);
  pecRight.rotation.x = 0.3;
  pecRight.add(pecObj.mesh.clone());
  bodyGroup.add(pecLeft, pecRight);

  const pelvicFin = new THREE.Group();
  bodyGroup.add(pelvicFin);

  const eyeZ = surfaceZAt(evalTop, evalUnifiedBot, (x) => evalZ(x, (x - xTail) / (xSnout - xTail)), 0.288, 0.026);
  const { eyesNormal, eyesPupil, eyesHappy } = createEyePair(ctx, bodyGroup, {
    ex: 0.288,
    ey: 0.026,
    ez: eyeZ,
    er: 0.034,
    irisColor: pal.iris || "#38bdf8",
    rimColor: OL,
    happyColor: "#ffffff",
  });

  const { biteRing, biteRingMat } = createBiteRing(ctx, bodyGroup, xSnout + 0.025, -0.012, CYAN, 0.056);

  return {
    speciesKey: sp.id,
    tailPivotX: -0.225,
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
// DISPATCHER
// =====================================================================================
export function createRareFish3DRig(sp: Species, maxAnisotropy = 4): Fish3DRig | null {
  switch (sp.style) {
    case "mandarin":
      return createMandarin3DRig(sp, maxAnisotropy);
    case "aurora":
      return createAurora3DRig(sp, maxAnisotropy);
    case "narwhal":
      return createNarwhal3DRig(sp, maxAnisotropy);
    case "seadragon":
      return createSeadragon3DRig(sp, maxAnisotropy);
    case "axolotl":
      return createAxolotl3DRig(sp, maxAnisotropy);
    case "whaleshark":
      return createWhaleshark3DRig(sp, maxAnisotropy);
    default:
      return null;
  }
}

import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { Species } from "./species";
import {
  applyBoris3DPose,
  baseGroups,
  blendBotToPalate,
  bodySpineOutlineMask,
  buildLoftedSurface,
  buildOutlineGeometry,
  buildSlicedHeadBody,
  clamp,
  computeEyeZ,
  createBiteRing,
  createBoris3DRig,
  createEyePair,
  createExtrudedFin,
  createOralParts,
  createRigContext,
  cubicPt,
  drawBlob,
  drawGlow,
  evalSpineZAt,
  finRootMaskY,
  hexRgb,
  injectSpineShader,
  interpCurveY,
  isSoftwareWebGL,
  jawOutlineMask,
  makeLin,
  makePaintedFinTex,
  mixHex,
  mouthSeamOutlineMask,
  rgbaHex,
  smoothstep,
  surfaceZAt,
} from "./fish3dShared";
import type { Fish3DPose, Fish3DRig, Pt } from "./fish3dShared";
import { createReefFish3DRig } from "./fish3dReef";
import { createPelagicFish3DRig } from "./fish3dPelagic";
import { createRareFish3DRig } from "./fish3dRare";

export type { Fish3DPose, Fish3DRig };
export { isSoftwareWebGL };

// =====================================================================================
// 1. ANDY & RYAN (Angelfish — Tall Swept Disc, 6 Glowing Stripes, Beaked Mouth)
// =====================================================================================
function createAndy3DRig(sp: Species, maxAnisotropy: number): Fish3DRig {
  const pal = sp.pal;
  const OL = pal.outline || "#591d04";
  const B = pal.body;
  const D = pal.dark;
  const BEL = pal.belly;
  const FIN = pal.fin;
  const TAIL = pal.tail || "#fff6cc";
  const STR = pal.stripe || "#df22ff";

  const ctx = createRigContext(OL);
  const { track, uniforms, makeOutlineMat, makeFishMat } = ctx;

  // drawAndy applies c.translate(-0.02, 0.0) in +Y down
  const to3D = (x2: number, y2: number): Pt => [x2 - 0.02, -y2];
  const HX = 0.245; // 0.265 - 0.02
  const HY = -0.002;
  const UX = 0.343;
  const UY = 0.022;
  const LX = 0.337;
  const LY = -0.016;

  // Sample exact drawAndy torso curves (from peduncle -0.248 up to arched crown and nose, down around belly)
  const topSegs: [Pt, Pt, Pt, Pt][] = [
    [to3D(-0.228, -0.026), to3D(-0.214, -0.15), to3D(-0.185, -0.26), to3D(-0.155, -0.34)],
    [to3D(-0.155, -0.34), to3D(-0.075, -0.348), to3D(0.055, -0.312), to3D(0.165, -0.205)],
    [to3D(0.165, -0.205), to3D(0.215, -0.155), to3D(0.252, -0.105), to3D(0.278, -0.075)],
    [to3D(0.278, -0.075), to3D(0.305, -0.062), to3D(0.338, -0.052), [UX, UY]],
  ];
  const botSegs: [Pt, Pt, Pt, Pt][] = [
    [[LX, LY], to3D(0.335, 0.038), to3D(0.268, 0.095), to3D(0.186, 0.17)],
    [to3D(0.186, 0.17), to3D(0.104, 0.242), to3D(-0.014, 0.27), to3D(-0.112, 0.234)],
    [to3D(-0.112, 0.234), to3D(-0.18, 0.206), to3D(-0.214, 0.132), to3D(-0.228, 0.03)],
  ];
  const topPts: Pt[] = [];
  topSegs.forEach((s, idx) => {
    for (let i = idx === 0 ? 0 : 1; i <= 32; i++) topPts.push(cubicPt(s[0], s[1], s[2], s[3], i / 32));
  });
  const botPts: Pt[] = [];
  for (let s = botSegs.length - 1; s >= 0; s--) {
    const [p0, p1, p2, p3] = botSegs[s];
    for (let i = s === botSegs.length - 1 ? 0 : 1; i <= 32; i++) botPts.push(cubicPt(p3, p2, p1, p0, i / 32));
  }

  const evalTop = (x: number) => interpCurveY(topPts, x);
  const evalBot = (x: number) => interpCurveY(botPts, x);
  const evalHalfZ = (x: number) => {
    const u = clamp((x - -0.248) / (UX - -0.248), 0, 1);
    const arch = Math.sin(clamp(u, 0.015, 0.985) * Math.PI);
    return 0.014 + 0.082 * Math.pow(arch, 0.62) * (1 - 0.18 * u);
  };
  const mapWorldUV = (x: number, y: number): Pt => [clamp((x - -0.3) / 0.72, 0, 1), clamp((y - -0.34) / 0.72, 0, 1)];

  // Dorsal peak + scalloped ridge (bridges sharp sweeping rear dorsal tip -0.258, +0.344 seamlessly!)
  const dorsalShape = new THREE.Shape();
  dorsalShape.moveTo(-0.246, 0.01);
  dorsalShape.bezierCurveTo(-0.232, 0.115, -0.188, 0.195, -0.258, 0.344);
  dorsalShape.bezierCurveTo(-0.22, 0.346, -0.155, 0.335, -0.125, 0.328);
  dorsalShape.bezierCurveTo(-0.085, 0.345, -0.02, 0.32, 0.045, 0.244);
  dorsalShape.lineTo(-0.1, 0.25);
  dorsalShape.lineTo(-0.22, 0.02);
  dorsalShape.closePath();
  // Add scalloped dark crest extension above (-0.16..0.04)
  const crestShape = new THREE.Shape();
  crestShape.moveTo(0.045, 0.244);
  crestShape.bezierCurveTo(-0.035, 0.326, -0.145, 0.372, -0.225, 0.362);
  crestShape.lineTo(-0.205, 0.335);
  crestShape.lineTo(-0.248, 0.342);
  crestShape.lineTo(-0.1, 0.25);
  crestShape.closePath();

  const { geo: dorsalPeakGeo, bounds: peakBounds } = createExtrudedFin(dorsalShape, 0.012, 0.0025, 16);
  const { geo: crestGeo, bounds: crestBounds } = createExtrudedFin(crestShape, 0.0042, 0.0012, 14);
  track(dorsalPeakGeo);
  track(crestGeo);

  const analShape = new THREE.Shape();
  analShape.moveTo(-0.045, -0.212);
  analShape.bezierCurveTo(-0.08, -0.3, -0.142, -0.366, -0.204, -0.354);
  analShape.bezierCurveTo(-0.248, -0.332, -0.252, -0.205, -0.23, -0.088);
  analShape.lineTo(-0.13, -0.16);
  analShape.closePath();
  const { geo: analGeo, bounds: analBounds } = createExtrudedFin(analShape, 0.004, 0.0012, 16);
  track(analGeo);

  const tailShape = new THREE.Shape();
  tailShape.moveTo(0.006, 0.026);
  tailShape.bezierCurveTo(-0.048, 0.058, -0.106, 0.106, -0.168, 0.124);
  tailShape.quadraticCurveTo(-0.146, 0.002, -0.156, -0.116);
  tailShape.bezierCurveTo(-0.098, -0.098, -0.046, -0.056, 0.006, -0.026);
  tailShape.closePath();
  const { geo: tailGeo, bounds: tailBounds } = createExtrudedFin(tailShape, 0.0038, 0.001, 16);
  track(tailGeo);

  const pecShape = new THREE.Shape();
  pecShape.moveTo(0, 0.01);
  pecShape.bezierCurveTo(-0.036, 0.042, -0.082, 0.018, -0.074, -0.022);
  pecShape.bezierCurveTo(-0.058, -0.052, -0.016, -0.042, 0, -0.014);
  pecShape.closePath();
  const { geo: pecGeo, bounds: pecBounds } = createExtrudedFin(pecShape, 0.0025, 0.0007, 12);
  track(pecGeo);

  // Paint 512x512 Flank Albedo matching drawAndy
  const cv = document.createElement("canvas");
  cv.width = 512;
  cv.height = 512;
  const c = cv.getContext("2d")!;
  const [dr, dg, db] = hexRgb(D);
  const [br, bg, bb] = hexRgb(mixHex(BEL, "#fff066", 0.35));

  c.save();
  c.translate((0.3 / 0.72) * 512, (0.38 / 0.72) * 512);
  c.scale(512 / 0.72, 512 / 0.72);
  c.translate(-0.02, 0.0);

  c.fillStyle = makeLin(c, -0.04, -0.26, 0.28, 0.16, [
    [0, mixHex(B, BEL, 0.5)],
    [0.36, BEL],
    [0.72, B],
    [1, D],
  ]);
  c.fillRect(-0.34, -0.4, 0.8, 0.8);

  drawGlow(c, -0.02, -0.06, 0.18, 0.155, -0.25, `${br},${bg},${bb}`, 0.65);
  drawGlow(c, 0.27, 0.01, 0.145, 0.155, 0.25, `${Math.round(dr * 0.68)},${Math.round(dg * 0.52)},${Math.round(db * 0.45)}`, 0.52);
  drawGlow(c, -0.21, -0.32, 0.08, 0.07, -0.4, `${Math.round(dr * 0.72)},${Math.round(dg * 0.48)},${Math.round(db * 0.42)}`, 0.46);

  const drawStripe = (pts: [number, number, number, number, number, number, number, number], w: number) => {
    c.beginPath();
    c.moveTo(pts[0], pts[1]);
    c.bezierCurveTo(pts[2], pts[3], pts[4], pts[5], pts[6], pts[7]);
    c.lineCap = "round";
    c.strokeStyle = rgbaHex(D, 0.38);
    c.lineWidth = w * 1.62;
    c.stroke();
    c.strokeStyle = rgbaHex(STR, 0.44);
    c.lineWidth = w * 1.28;
    c.stroke();
    c.strokeStyle = STR;
    c.lineWidth = w;
    c.stroke();
    c.strokeStyle = rgbaHex(mixHex(STR, "#ffffff", 0.48), 0.7);
    c.lineWidth = w * 0.34;
    c.stroke();
  };
  drawStripe([0.302, -0.056, 0.228, -0.095, 0.172, -0.092, 0.135, -0.104], 0.013);
  drawStripe([0.138, -0.104, 0.035, -0.118, -0.075, -0.182, -0.205, -0.33], 0.019);
  drawStripe([0.275, -0.018, 0.135, 0.032, -0.055, 0.038, -0.22, -0.326], 0.022);
  drawStripe([0.115, 0.088, -0.015, 0.128, -0.12, 0.028, -0.206, -0.268], 0.022);
  drawStripe([0.045, 0.176, -0.068, 0.192, -0.152, 0.095, -0.216, -0.105], 0.02);
  drawStripe([-0.068, 0.224, -0.125, 0.214, -0.165, 0.168, -0.196, 0.112], 0.015);

  // Brow ocellus ring + eye cheek rim
  c.beginPath();
  c.ellipse(0.164, -0.146, 0.016, 0.021, 0.15, 0, Math.PI * 2);
  c.fillStyle = rgbaHex(D, 0.3);
  c.fill();
  c.strokeStyle = rgbaHex(D, 0.62);
  c.lineWidth = 0.0052;
  c.stroke();

  // Golden gill crease & recessed dark groove
  c.strokeStyle = rgbaHex(mixHex(BEL, "#fff4c8", 0.68), 0.74);
  c.lineWidth = 0.0082;
  c.beginPath();
  c.moveTo(0.158, -0.078);
  c.bezierCurveTo(0.126, -0.002, 0.144, 0.066, 0.198, 0.095);
  c.stroke();
  c.strokeStyle = rgbaHex(D, 0.48);
  c.lineWidth = 0.004;
  c.beginPath();
  c.moveTo(0.152, -0.078);
  c.bezierCurveTo(0.12, -0.002, 0.138, 0.066, 0.192, 0.095);
  c.stroke();

  // Glossy dorsal & beak sheen
  drawGlow(c, UX - 0.018 + 0.02, -UY - 0.006, 0.022, 0.009, -0.2, "255,240,210", 0.45);
  c.fillStyle = makeLin(c, -0.08, -0.32, 0.12, 0.26, [
    [0, "rgba(255,250,220,0.22)"],
    [0.18, "rgba(255,250,220,0)"],
    [0.74, "rgba(45,10,5,0)"],
    [1, "rgba(45,10,5,0.34)"],
  ]);
  c.fillRect(-0.32, -0.38, 0.78, 0.74);
  c.restore();

  const albedo = track(new THREE.CanvasTexture(cv));
  albedo.colorSpace = THREE.SRGBColorSpace;
  albedo.anisotropy = maxAnisotropy;
  albedo.needsUpdate = true;

  const peakTex = track(
    makePaintedFinTex(maxAnisotropy, peakBounds, (fc) => {
      fc.fillStyle = makeLin(fc, -0.2, 0.02, -0.22, 0.35, [
        [0, B],
        [0.6, BEL],
        [1, mixHex(D, OL, 0.3)],
      ]);
      fc.fillRect(peakBounds.minX - 0.04, peakBounds.minY - 0.04, 0.5, 0.5);
      // Extension of flowing glowing stripes into sharp dorsal tip!
      fc.lineCap = "round";
      for (const [x0, y0, x1, y1] of [
        [-0.08, 0.2, -0.225, 0.33],
        [-0.14, 0.13, -0.24, 0.326],
        [-0.18, 0.08, -0.226, 0.268],
      ]) {
        fc.strokeStyle = STR;
        fc.lineWidth = 0.021;
        fc.beginPath();
        fc.moveTo(x0, y0);
        fc.quadraticCurveTo(-0.18, 0.22, x1, y1);
        fc.stroke();
        fc.strokeStyle = rgbaHex(mixHex(STR, "#ffffff", 0.5), 0.7);
        fc.lineWidth = 0.007;
        fc.stroke();
      }
      fc.strokeStyle = OL;
      fc.lineWidth = 0.011;
      fc.beginPath();
      fc.moveTo(-0.246, 0.01);
      fc.bezierCurveTo(-0.232, 0.115, -0.188, 0.195, -0.258, 0.344);
      fc.bezierCurveTo(-0.22, 0.346, -0.155, 0.335, -0.125, 0.328);
      fc.bezierCurveTo(-0.085, 0.345, -0.02, 0.32, 0.045, 0.244);
      fc.stroke();
    })
  );

  const crestTex = track(
    makePaintedFinTex(maxAnisotropy, crestBounds, (fc) => {
      fc.fillStyle = makeLin(fc, -0.06, 0.25, -0.18, 0.37, [
        [0, mixHex(D, B, 0.2)],
        [0.6, D],
        [1, mixHex(D, OL, 0.48)],
      ]);
      fc.fillRect(crestBounds.minX - 0.02, crestBounds.minY - 0.02, 0.4, 0.4);
      fc.strokeStyle = rgbaHex(OL, 0.5);
      fc.lineWidth = 0.004;
      for (const [rx, ry] of [
        [0.0, 0.296],
        [-0.065, 0.336],
        [-0.12, 0.358],
        [-0.18, 0.365],
      ]) {
        fc.beginPath();
        fc.moveTo(-0.07, 0.26);
        fc.lineTo(rx, ry);
        fc.stroke();
      }
    })
  );

  const analTex = track(
    makePaintedFinTex(maxAnisotropy, analBounds, (fc) => {
      fc.fillStyle = makeLin(fc, -0.11, -0.18, -0.2, -0.36, [
        [0, mixHex(BEL, FIN, 0.4)],
        [0.55, mixHex(FIN, BEL, 0.4)],
        [1, mixHex(FIN, D, 0.28)],
      ]);
      fc.fillRect(analBounds.minX - 0.03, analBounds.minY - 0.03, 0.5, 0.5);
      fc.strokeStyle = rgbaHex(D, 0.36);
      fc.lineWidth = 0.0042;
      for (const [rx, ry] of [
        [-0.09, -0.318],
        [-0.138, -0.352],
        [-0.188, -0.356],
        [-0.228, -0.31],
        [-0.244, -0.206],
      ]) {
        fc.beginPath();
        fc.moveTo(-0.09, -0.18);
        fc.lineTo(rx, ry);
        fc.stroke();
      }
      fc.strokeStyle = rgbaHex(STR, 0.46);
      fc.lineWidth = 0.012;
      fc.beginPath();
      fc.moveTo(-0.065, -0.244);
      fc.quadraticCurveTo(-0.152, -0.266, -0.235, -0.194);
      fc.moveTo(-0.102, -0.314);
      fc.quadraticCurveTo(-0.172, -0.324, -0.24, -0.264);
      fc.stroke();
      fc.strokeStyle = OL;
      fc.lineWidth = 0.009;
      fc.beginPath();
      fc.moveTo(-0.045, -0.212);
      fc.bezierCurveTo(-0.08, -0.3, -0.142, -0.366, -0.204, -0.354);
      fc.bezierCurveTo(-0.248, -0.332, -0.252, -0.205, -0.23, -0.088);
      fc.stroke();
    })
  );

  const tailTex = track(
    makePaintedFinTex(maxAnisotropy, tailBounds, (fc) => {
      fc.fillStyle = makeLin(fc, 0, 0, -0.165, 0, [
        [0, mixHex(D, BEL, 0.38)],
        [0.24, mixHex(BEL, TAIL, 0.68)],
        [0.62, TAIL],
        [1, "#ffffff"],
      ]);
      fc.fillRect(tailBounds.minX - 0.03, tailBounds.minY - 0.03, 0.4, 0.4);
      fc.strokeStyle = rgbaHex(BEL, 0.34);
      fc.lineWidth = 0.0036;
      for (let i = 0; i < 7; i++) {
        fc.beginPath();
        fc.moveTo(0.01, 0);
        fc.lineTo(-0.152, -0.102 + i * 0.034);
        fc.stroke();
      }
      fc.strokeStyle = OL;
      fc.lineWidth = 0.0085;
      fc.beginPath();
      fc.moveTo(0, 0.026);
      fc.bezierCurveTo(-0.048, 0.058, -0.106, 0.106, -0.168, 0.124);
      fc.moveTo(0, -0.026);
      fc.bezierCurveTo(-0.046, -0.056, -0.098, -0.098, -0.156, -0.116);
      fc.stroke();
    })
  );

  const pecTex = track(
    makePaintedFinTex(maxAnisotropy, pecBounds, (fc) => {
      fc.fillStyle = makeLin(fc, 0, 0, -0.08, -0.02, [
        [0, rgbaHex(D, 0.85)],
        [1, rgbaHex(FIN, 0.72)],
      ]);
      fc.fillRect(pecBounds.minX - 0.02, pecBounds.minY - 0.02, 0.2, 0.2);
      fc.strokeStyle = OL;
      fc.lineWidth = 0.006;
      fc.beginPath();
      fc.moveTo(0, 0.01);
      fc.bezierCurveTo(-0.036, 0.042, -0.082, 0.018, -0.074, -0.022);
      fc.bezierCurveTo(-0.058, -0.052, -0.016, -0.042, 0, -0.014);
      fc.stroke();
    })
  );

  const { root, pitchGroup, yawGroup, bodyGroup } = baseGroups();

  const evalUpperPalate = (x: number) => HY + 0.005 + (clamp((x - HX) / (UX - HX), 0, 1)) * 0.004;
  const evalUnifiedBot = blendBotToPalate(evalBot, evalUpperPalate, HX, 0.032, 0.014);
  const evalMidY = (x: number) => (evalTop(x) + evalUnifiedBot(x)) * 0.5;

  const bodyGeo = track(
    buildLoftedSurface({
      xStart: -0.248,
      xEnd: UX,
      uSteps: 54,
      vSteps: 30,
      evalTopY: evalTop,
      evalBotY: evalUnifiedBot,
      evalHalfZ,
      mapUV: mapWorldUV,
      roundFront: true,
      rearBulge: 0.005,
    })
  );
  const bodyMat = makeFishMat(albedo);
  injectSpineShader(bodyMat, uniforms);
  bodyGroup.add(new THREE.Mesh(bodyGeo, bodyMat));
  const andyBodyMask = bodySpineOutlineMask(
    evalMidY,
    [
      { x0: -0.246, x1: 0.045, top: true },
      { x0: -0.23, x1: -0.045, top: false },
    ],
    0.026
  );
  bodyGroup.add(new THREE.Mesh(track(buildOutlineGeometry(bodyGeo, 0.0044, andyBodyMask)), makeOutlineMat()));

  const peakMat = makeFishMat(peakTex, { emissiveIntensity: 0.28 });
  injectSpineShader(peakMat, uniforms);
  const peakMesh = new THREE.Mesh(dorsalPeakGeo, peakMat);
  peakMesh.add(
    new THREE.Mesh(track(buildOutlineGeometry(dorsalPeakGeo, 0.0014, finRootMaskY(0.22, 0.045, true))), makeOutlineMat())
  );
  bodyGroup.add(peakMesh);

  const crestMat = makeFishMat(crestTex, { emissiveIntensity: 0.25 });
  injectSpineShader(crestMat, uniforms);
  const crestMesh = new THREE.Mesh(crestGeo, crestMat);
  crestMesh.add(
    new THREE.Mesh(track(buildOutlineGeometry(crestGeo, 0.0012, finRootMaskY(0.244, 0.036, true))), makeOutlineMat())
  );
  bodyGroup.add(crestMesh);

  const analMat = makeFishMat(analTex, { emissiveIntensity: 0.3, transparent: true, opacity: 0.94 });
  injectSpineShader(analMat, uniforms);
  const analMesh = new THREE.Mesh(analGeo, analMat);
  analMesh.add(
    new THREE.Mesh(track(buildOutlineGeometry(analGeo, 0.0012, finRootMaskY(-0.18, 0.045, false))), makeOutlineMat())
  );
  bodyGroup.add(analMesh);

  const tailPivot = new THREE.Group();
  tailPivot.position.set(-0.245, 0, 0);
  bodyGroup.add(tailPivot);
  const tailMesh = new THREE.Mesh(
    tailGeo,
    makeFishMat(tailTex, { emissiveIntensity: 0.34, transparent: true, opacity: 0.96 })
  );
  tailMesh.add(new THREE.Mesh(track(buildOutlineGeometry(tailGeo, 0.0012)), makeOutlineMat(0, 0, false)));
  tailPivot.add(tailMesh);

  // Unified cranium owns upper beak; keep upperJawGroup for shared interface compatibility
  const upperJawGroup = new THREE.Group();
  upperJawGroup.position.set(HX, HY, 0);
  bodyGroup.add(upperJawGroup);

  const lowerJawGroup = new THREE.Group();
  lowerJawGroup.position.set(HX, HY, 0);
  bodyGroup.add(lowerJawGroup);
  const lowerJawGeo = track(
    buildLoftedSurface({
      xStart: HX - 0.022,
      xEnd: LX,
      uSteps: 18,
      vSteps: 22,
      evalTopY: (x) => HY - 0.004 - clamp((x - HX) / (LX - HX), 0, 1) * 0.003,
      evalBotY: evalBot,
      evalHalfZ,
      mapUV: mapWorldUV,
      localOffsetX: HX,
      localOffsetY: HY,
      roundFront: true,
      rearInsetAt: (x) => (x < HX ? 0.78 + 0.2 * clamp((x - (HX - 0.022)) / 0.022, 0, 1) : 1),
    })
  );
  const lMat = makeFishMat(albedo);
  injectSpineShader(lMat, uniforms, HX, HY);
  lowerJawGroup.add(new THREE.Mesh(lowerJawGeo, lMat));
  lowerJawGroup.add(
    new THREE.Mesh(track(buildOutlineGeometry(lowerJawGeo, 0.0045, jawOutlineMask(0.008, 0.044))), makeOutlineMat(HX, HY))
  );

  const { mouthInterior, tongueMesh } = createOralParts(ctx, bodyGroup, lowerJawGroup, HX, HY, "#5c0f1d", "#e65b78");

  const { eyesNormal, eyesPupil, eyesHappy } = createEyePair(ctx, bodyGroup, {
    ex: 0.204,
    ey: 0.068,
    ez: surfaceZAt(evalTop, evalBot, evalHalfZ, 0.204, 0.068),
    er: 0.048,
    sx: 0.86,
    sy: 1.02,
    irisColor: pal.iris || "#2b1608",
    rimColor: OL,
    happyColor: BEL,
  });

  const pecMat = makeFishMat(pecTex, { emissiveIntensity: 0.3, transparent: true, opacity: 0.84 });
  const pecZ = surfaceZAt(evalTop, evalBot, evalHalfZ, 0.094, -0.074, 0.22, 1.0) + 0.006;
  const pecLeft = new THREE.Group();
  pecLeft.position.set(0.094, -0.074, pecZ);
  pecLeft.add(new THREE.Mesh(pecGeo, pecMat));
  const pecRight = new THREE.Group();
  pecRight.position.set(0.094, -0.074, -pecZ);
  pecRight.add(new THREE.Mesh(pecGeo, pecMat));
  bodyGroup.add(pecLeft, pecRight);

  const pelvicFin = new THREE.Group(); // unused for drawAndy, kept for shared interface
  const { biteRing, biteRingMat } = createBiteRing(ctx, bodyGroup, UX + 0.024, HY, mixHex(STR, "#ffffff", 0.55), 0.052);

  return {
    speciesKey: sp.id,
    tailPivotX: -0.245,
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
      const eff = 0.14 + open * 0.86;
      lowerJawGroup.rotation.z = -eff * 0.68 + tightClamp * 0.18;
      mouthInterior.visible = true;
      mouthInterior.scale.set(0.85 + eff * 0.2, 0.38 + eff * 0.85, 0.72 + eff * 0.18);
      tongueMesh.visible = true;
      tongueMesh.position.y = 0.002 + eff * 0.006;
    },
    dispose: () => {
      for (const d of ctx.disposables) d.dispose();
    },
  };
}

// =====================================================================================
// 2. SI OREN (Clownfish — Chubby 0.84x Orange Body, 3 Black-Edged White Bands)
// =====================================================================================
function createClown3DRig(sp: Species, maxAnisotropy: number): Fish3DRig {
  const pal = sp.pal;
  const OR = pal.body;
  const ORD = pal.dark;
  const ORL = mixHex(pal.belly, "#ffffff", 0.14);
  const BLK = "#180b04";
  const WH = "#fffdf8";
  const OL = pal.outline || BLK;

  const ctx = createRigContext(OL);
  const { track, uniforms, makeOutlineMat, makeFishMat } = ctx;

  // drawClown raw coordinates (before scale(0.84, 0.84) + translate(0.01, 0.02))
  const to3D = (x2: number, y2: number): Pt => [x2, -y2];
  const HX = 0.325;
  const HY = -0.056;
  const UX = 0.434;
  const tipY = -0.050;

  const topSegs: [Pt, Pt, Pt, Pt][] = [
    [to3D(-0.215, -0.05), to3D(-0.125, -0.12), to3D(0.0, -0.215), to3D(0.125, -0.225)],
    [to3D(0.125, -0.225), to3D(0.265, -0.232), to3D(0.392, -0.155), [0.427, -0.018]],
    [[0.427, -0.018], [0.430, -0.028], [0.4325, -0.040], [UX, tipY]],
  ];
  const botSegs: [Pt, Pt, Pt, Pt][] = [
    [[UX, tipY], to3D(0.415, 0.102), to3D(0.345, 0.158), to3D(0.215, 0.188)],
    [to3D(0.215, 0.188), to3D(0.1, 0.212), to3D(-0.025, 0.192), to3D(-0.125, 0.125)],
  ];
  const topPts: Pt[] = [];
  topSegs.forEach((s, idx) => {
    for (let i = idx === 0 ? 0 : 1; i <= 32; i++) topPts.push(cubicPt(s[0], s[1], s[2], s[3], i / 32));
  });

  const botPts: Pt[] = [to3D(-0.215, 0.068), to3D(-0.125, 0.125)];
  for (let s = botSegs.length - 1; s >= 0; s--) {
    const [p0, p1, p2, p3] = botSegs[s];
    for (let i = 1; i <= 32; i++) botPts.push(cubicPt(p3, p2, p1, p0, i / 32));
  }

  const evalTop = (x: number) => interpCurveY(topPts, x);
  const evalBot = (x: number) => interpCurveY(botPts, x);
  const evalHalfZ = (x: number) => {
    const u = clamp((x - -0.215) / (UX - -0.215), 0, 1);
    const arch = Math.sin(clamp(u, 0.03, 0.985) * Math.PI);
    const base = 0.022 + 0.106 * Math.pow(arch, 0.48) * (1 - 0.06 * u);
    const noseRound =
      x > 0.34 ? Math.sqrt(clamp(1 - Math.pow((x - 0.34) / (UX - 0.34), 2) * 0.996, 0.002, 1)) : 1;
    const hH = Math.max(0.002, (evalTop(x) - evalBot(x)) * 0.5);
    return x > 0.34 ? Math.min(base * noseRound, Math.max(0.002, hH * 0.98)) : base;
  };
  const mapWorldUV = (x: number, y: number): Pt => [clamp((x - -0.26) / 0.75, 0, 1), clamp((y - -0.25) / 0.52, 0, 1)];

  // 3-scallop front dorsal + rear dorsal lobe + rounded anal + paddle tail + double pelvic + stubby pec
  const d1Shape = new THREE.Shape();
  d1Shape.moveTo(0.225, 0.195);
  d1Shape.bezierCurveTo(0.218, 0.275, 0.178, 0.325, 0.145, 0.305);
  d1Shape.bezierCurveTo(0.125, 0.342, 0.085, 0.352, 0.068, 0.312);
  d1Shape.bezierCurveTo(0.035, 0.352, -0.038, 0.345, -0.052, 0.285);
  d1Shape.quadraticCurveTo(-0.058, 0.23, -0.042, 0.165);
  d1Shape.lineTo(-0.02, 0.1);
  d1Shape.lineTo(0.21, 0.1);
  d1Shape.closePath();

  const d2Shape = new THREE.Shape();
  d2Shape.moveTo(-0.055, 0.175);
  d2Shape.bezierCurveTo(-0.095, 0.228, -0.165, 0.235, -0.195, 0.19);
  d2Shape.bezierCurveTo(-0.215, 0.155, -0.195, 0.1, -0.16, 0.078);
  d2Shape.lineTo(-0.11, 0.03);
  d2Shape.lineTo(-0.05, 0.09);
  d2Shape.closePath();

  const anShape = new THREE.Shape();
  anShape.moveTo(-0.025, -0.175);
  anShape.bezierCurveTo(-0.055, -0.252, -0.135, -0.268, -0.175, -0.225);
  anShape.bezierCurveTo(-0.205, -0.192, -0.19, -0.125, -0.155, -0.088);
  anShape.lineTo(-0.1, -0.06);
  anShape.lineTo(-0.02, -0.11);
  anShape.closePath();

  const tailShape = new THREE.Shape();
  tailShape.moveTo(0.01, 0.052);
  tailShape.bezierCurveTo(-0.055, 0.148, -0.195, 0.172, -0.242, 0.088);
  tailShape.bezierCurveTo(-0.275, 0.03, -0.275, -0.055, -0.242, -0.112);
  tailShape.bezierCurveTo(-0.195, -0.192, -0.055, -0.168, 0.01, -0.056);
  tailShape.closePath();

  const pvShape = new THREE.Shape();
  pvShape.moveTo(0.052, 0);
  pvShape.bezierCurveTo(0.072, -0.052, 0.042, -0.098, 0.012, -0.078);
  pvShape.lineTo(0.006, -0.052);
  pvShape.bezierCurveTo(-0.012, -0.095, -0.068, -0.092, -0.072, -0.052);
  pvShape.bezierCurveTo(-0.072, -0.025, -0.045, -0.004, -0.018, 0.002);
  pvShape.closePath();

  const pecShape = new THREE.Shape();
  pecShape.moveTo(0.01, 0.025);
  pecShape.bezierCurveTo(-0.025, 0.058, -0.082, 0.062, -0.088, 0.015);
  pecShape.bezierCurveTo(-0.092, -0.032, -0.045, -0.056, 0, -0.028);
  pecShape.closePath();

  const { geo: d1Geo, bounds: d1B } = createExtrudedFin(d1Shape, 0.0042, 0.0012, 16);
  const { geo: d2Geo, bounds: d2B } = createExtrudedFin(d2Shape, 0.0038, 0.001, 14);
  const { geo: anGeo, bounds: anB } = createExtrudedFin(anShape, 0.0038, 0.001, 14);
  const { geo: tailGeo, bounds: tB } = createExtrudedFin(tailShape, 0.004, 0.0012, 16);
  const { geo: pvGeo, bounds: pvB } = createExtrudedFin(pvShape, 0.0036, 0.001, 12);
  const { geo: pecGeo, bounds: pecB } = createExtrudedFin(pecShape, 0.0032, 0.001, 12);
  track(d1Geo);
  track(d2Geo);
  track(anGeo);
  track(tailGeo);
  track(pvGeo);
  track(pecGeo);

  // Flank Texture: rich orange gradient + 3 black-edged pure white clownfish bands!
  const cv = document.createElement("canvas");
  cv.width = 512;
  cv.height = 512;
  const c = cv.getContext("2d")!;
  c.save();
  c.translate((0.26 / 0.75) * 512, (0.27 / 0.52) * 512);
  c.scale(512 / 0.75, 512 / 0.52);

  c.fillStyle = makeLin(c, 0, -0.24, 0, 0.22, [
    [0, mixHex(OR, ORL, 0.52)],
    [0.44, OR],
    [0.86, mixHex(OR, ORD, 0.38)],
    [1, mixHex(OR, ORD, 0.7)],
  ]);
  c.fillRect(-0.35, -0.35, 0.9, 0.7);
  drawGlow(c, 0.1, -0.03, 0.3, 0.19, 0, "255,196,92", 0.52);

  const paintBand = (build: () => void) => {
    c.beginPath();
    build();
    c.closePath();
    c.strokeStyle = BLK;
    c.lineWidth = 0.024;
    c.stroke();
    c.fillStyle = makeLin(c, 0, -0.24, 0, 0.22, [
      [0, "#ffffff"],
      [0.6, WH],
      [1, "#dbe0ea"],
    ]);
    c.fill();
  };
  paintBand(() => {
    c.moveTo(0.248, -0.28);
    c.quadraticCurveTo(0.205, -0.02, 0.275, 0.25);
    c.lineTo(0.205, 0.25);
    c.quadraticCurveTo(0.135, -0.02, 0.175, -0.28);
  });
  paintBand(() => {
    c.moveTo(-0.025, -0.28);
    c.bezierCurveTo(0.015, -0.1, 0.052, -0.04, 0.052, 0.018);
    c.bezierCurveTo(0.052, 0.08, 0.015, 0.12, -0.008, 0.26);
    c.lineTo(-0.105, 0.26);
    c.bezierCurveTo(-0.078, 0.08, -0.07, -0.05, -0.115, -0.28);
  });
  paintBand(() => {
    c.moveTo(-0.165, -0.18);
    c.quadraticCurveTo(-0.15, 0.01, -0.165, 0.18);
    c.lineTo(-0.24, 0.18);
    c.quadraticCurveTo(-0.225, 0.01, -0.24, -0.18);
  });

  // 3D top specular highlight & subtle lower belly shadow
  c.fillStyle = makeLin(c, 0, -0.24, 0, 0.22, [
    [0, "rgba(255,255,255,0.22)"],
    [0.22, "rgba(255,255,255,0)"],
    [0.68, "rgba(70,20,0,0)"],
    [1, "rgba(70,20,0,0.3)"],
  ]);
  c.fillRect(-0.35, -0.35, 0.9, 0.7);
  drawGlow(c, 0.08, -0.13, 0.22, 0.045, -0.08, "255,255,255", 0.44);

  // Subtle eye-socket rim behind big eye + cute smiling mouth crease & dimple matching drawClown
  c.strokeStyle = rgbaHex(ORD, 0.42);
  c.lineWidth = 0.007;
  c.beginPath();
  c.ellipse(0.306, -0.052, 0.072, 0.078, 0, Math.PI * 0.55, Math.PI * 1.75);
  c.stroke();

  c.strokeStyle = rgbaHex(OL, 0.78);
  c.lineWidth = 0.0052;
  c.lineCap = "round";
  c.beginPath();
  c.moveTo(0.420, 0.048);
  c.quadraticCurveTo(0.376, 0.060, 0.338, 0.058);
  c.stroke();
  c.beginPath();
  c.arc(0.333, 0.056, 0.010, Math.PI * 0.4, Math.PI * 1.35);
  c.stroke();
  c.restore();

  const albedo = track(new THREE.CanvasTexture(cv));
  albedo.colorSpace = THREE.SRGBColorSpace;
  albedo.anisotropy = maxAnisotropy;
  albedo.needsUpdate = true;

  const paintOrangeRimFin = (
    bounds: { minX: number; maxX: number; minY: number; maxY: number },
    edgePath: (fc: CanvasRenderingContext2D) => void,
    rayFrom: Pt,
    rayTos: Pt[],
    bw = 0.036
  ) =>
    track(
      makePaintedFinTex(maxAnisotropy, bounds, (fc) => {
        fc.fillStyle = makeLin(fc, bounds.minX, bounds.minY, bounds.maxX, bounds.maxY, [
          [0, mixHex(OR, ORD, 0.25)],
          [0.55, OR],
          [1, ORL],
        ]);
        fc.fillRect(bounds.minX - 0.04, bounds.minY - 0.04, 0.5, 0.5);
        fc.strokeStyle = rgbaHex(ORD, 0.42);
        fc.lineWidth = 0.004;
        for (const [rx, ry] of rayTos) {
          fc.beginPath();
          fc.moveTo(rayFrom[0], rayFrom[1]);
          fc.lineTo(rx, ry);
          fc.stroke();
        }
        fc.beginPath();
        edgePath(fc);
        fc.strokeStyle = BLK;
        fc.lineWidth = bw;
        fc.lineCap = "round";
        fc.stroke();
      })
    );

  const d1Tex = paintOrangeRimFin(
    d1B,
    (fc) => {
      fc.moveTo(0.225, 0.195);
      fc.bezierCurveTo(0.218, 0.275, 0.178, 0.325, 0.145, 0.305);
      fc.bezierCurveTo(0.125, 0.342, 0.085, 0.352, 0.068, 0.312);
      fc.bezierCurveTo(0.035, 0.352, -0.038, 0.345, -0.052, 0.285);
      fc.quadraticCurveTo(-0.058, 0.23, -0.042, 0.165);
    },
    [0.08, 0.08],
    [
      [0.2, 0.33],
      [0.14, 0.34],
      [0.08, 0.35],
      [0.02, 0.35],
      [-0.04, 0.32],
    ],
    0.044
  );

  const d2Tex = paintOrangeRimFin(
    d2B,
    (fc) => {
      fc.moveTo(-0.055, 0.175);
      fc.bezierCurveTo(-0.095, 0.228, -0.165, 0.235, -0.195, 0.19);
      fc.bezierCurveTo(-0.215, 0.155, -0.195, 0.1, -0.16, 0.078);
    },
    [-0.1, 0.05],
    [
      [-0.08, 0.22],
      [-0.13, 0.23],
      [-0.18, 0.2],
    ],
    0.036
  );

  const anTex = paintOrangeRimFin(
    anB,
    (fc) => {
      fc.moveTo(-0.025, -0.175);
      fc.bezierCurveTo(-0.055, -0.252, -0.135, -0.268, -0.175, -0.225);
      fc.bezierCurveTo(-0.205, -0.192, -0.19, -0.125, -0.155, -0.088);
    },
    [-0.08, -0.06],
    [
      [-0.05, -0.24],
      [-0.11, -0.26],
      [-0.17, -0.22],
    ],
    0.036
  );

  const tailTex = paintOrangeRimFin(
    tB,
    (fc) => {
      fc.moveTo(0.01, 0.052);
      fc.bezierCurveTo(-0.055, 0.148, -0.195, 0.172, -0.242, 0.088);
      fc.bezierCurveTo(-0.275, 0.03, -0.275, -0.055, -0.242, -0.112);
      fc.bezierCurveTo(-0.195, -0.192, -0.055, -0.168, 0.01, -0.056);
    },
    [0.02, -0.004],
    [
      [-0.24, 0.1],
      [-0.26, 0.03],
      [-0.26, -0.04],
      [-0.24, -0.11],
    ],
    0.044
  );

  const pvTex = paintOrangeRimFin(
    pvB,
    (fc) => {
      fc.moveTo(0.052, 0);
      fc.bezierCurveTo(0.072, -0.052, 0.042, -0.098, 0.012, -0.078);
      fc.lineTo(0.006, -0.052);
      fc.bezierCurveTo(-0.012, -0.095, -0.068, -0.092, -0.072, -0.052);
      fc.bezierCurveTo(-0.072, -0.025, -0.045, -0.004, -0.018, 0.002);
    },
    [0, 0],
    [
      [0.045, -0.08],
      [-0.02, -0.09],
      [-0.06, -0.06],
    ],
    0.032
  );

  const pecTex = paintOrangeRimFin(
    pecB,
    (fc) => {
      fc.moveTo(0.01, 0.025);
      fc.bezierCurveTo(-0.025, 0.058, -0.082, 0.062, -0.088, 0.015);
      fc.bezierCurveTo(-0.092, -0.032, -0.045, -0.056, 0, -0.028);
    },
    [0, 0],
    [
      [-0.08, 0.035],
      [-0.085, 0],
      [-0.07, -0.035],
    ],
    0.03
  );

  const { root, pitchGroup, yawGroup, bodyGroup } = baseGroups();
  const scaleGroup = new THREE.Group();
  scaleGroup.scale.setScalar(0.84);
  scaleGroup.position.set(0.0084, -0.0168, 0);
  bodyGroup.add(scaleGroup);

  const evalSeamY = (x: number) => {
    const u = clamp((x - HX) / (UX - HX), 0, 1);
    return HY - Math.sin(u * Math.PI) * 0.005 + u * (tipY - HY);
  };
  const evalMidY = (x: number) => (evalTop(x) + evalBot(x)) * 0.5;

  const { bodyGeo, lowerJawGeo: lowerGeo } = buildSlicedHeadBody({
    xStart: -0.215,
    xHinge: HX,
    xEnd: UX,
    xLowerEnd: UX - 0.001,
    jawY: HY,
    evalTopY: evalTop,
    evalBotY: evalBot,
    evalSeamY,
    evalHalfZ,
    mapUV: mapWorldUV,
    rearBulge: 0.006,
    uSteps: 60,
    vSteps: 32,
  });
  track(bodyGeo);
  track(lowerGeo);
  const bodyMat = makeFishMat(albedo);
  injectSpineShader(bodyMat, uniforms);
  scaleGroup.add(new THREE.Mesh(bodyGeo, bodyMat));
  const clownSpineMask = bodySpineOutlineMask(
    evalMidY,
    [
      { x0: -0.055, x1: 0.225, top: true },
      { x0: -0.195, x1: -0.055, top: true },
      { x0: -0.175, x1: -0.025, top: false },
    ],
    0.028
  );
  const clownBodySeamMask = mouthSeamOutlineMask(HX, UX, HY, evalSeamY, false);
  const clownBodyMask = (x: number, y: number, z: number) => clownSpineMask(x, y, z) * clownBodySeamMask(x, y, z);
  scaleGroup.add(new THREE.Mesh(track(buildOutlineGeometry(bodyGeo, 0.0044, clownBodyMask)), makeOutlineMat()));

  for (const [g, t, finMask] of [
    [d1Geo, d1Tex, finRootMaskY(0.165, 0.038, true)],
    [d2Geo, d2Tex, finRootMaskY(0.095, 0.032, true)],
    [anGeo, anTex, finRootMaskY(-0.115, 0.035, false)],
  ] as [THREE.BufferGeometry, THREE.Texture, (x: number, y: number, z: number) => number][]) {
    const fm = makeFishMat(t, { emissiveIntensity: 0.28 });
    injectSpineShader(fm, uniforms);
    const fMesh = new THREE.Mesh(g, fm);
    fMesh.add(new THREE.Mesh(track(buildOutlineGeometry(g, 0.0014, finMask)), makeOutlineMat()));
    scaleGroup.add(fMesh);
  }

  const tailPivot = new THREE.Group();
  tailPivot.position.set(-0.215, -0.015, 0);
  scaleGroup.add(tailPivot);
  const clownTailMesh = new THREE.Mesh(tailGeo, makeFishMat(tailTex, { emissiveIntensity: 0.3 }));
  clownTailMesh.add(new THREE.Mesh(track(buildOutlineGeometry(tailGeo, 0.0014)), makeOutlineMat(0, 0, false)));
  tailPivot.add(clownTailMesh);

  // Unified cranium owns upper snout; empty upperJawGroup kept for compatibility
  const upperJawGroup = new THREE.Group();
  upperJawGroup.position.set(HX, HY, 0);
  scaleGroup.add(upperJawGroup);

  const lowerJawGroup = new THREE.Group();
  lowerJawGroup.position.set(HX, HY, 0);
  scaleGroup.add(lowerJawGroup);
  const lMat = makeFishMat(albedo);
  injectSpineShader(lMat, uniforms, HX, HY);
  lowerJawGroup.add(new THREE.Mesh(lowerGeo, lMat));
  lowerJawGroup.add(
    new THREE.Mesh(
      track(buildOutlineGeometry(lowerGeo, 0.0042, mouthSeamOutlineMask(HX, UX, HY, evalSeamY, true))),
      makeOutlineMat(HX, HY)
    )
  );

  const { mouthInterior, tongueMesh } = createOralParts(
    ctx,
    scaleGroup,
    lowerJawGroup,
    HX,
    HY,
    "#4d0f1c",
    "#f0708c",
    [0.036, 0.03, 0.024],
    [0.028, 0.011, 0.016],
    0.032
  );

  const { eyesNormal, eyesPupil, eyesHappy } = createEyePair(ctx, scaleGroup, {
    ex: 0.312,
    ey: 0.052,
    ez: computeEyeZ(evalTop, evalBot, evalHalfZ, 0.312, 0.052, 0.068),
    er: 0.068,
    sx: 0.94,
    sy: 1.0,
    yawRot: 0.28,
    irisScale: 0.56,
    pupilScale: 0.36,
    irisColor: "#7a3b12",
    rimColor: OL,
    happyColor: BLK,
  });

  const pecMat = makeFishMat(pecTex, { emissiveIntensity: 0.28 });
  const pecZ = surfaceZAt(evalTop, evalBot, evalHalfZ, 0.068, -0.058, 0.22, 1.0) + 0.006;
  const pecLeft = new THREE.Group();
  pecLeft.position.set(0.068, -0.058, pecZ);
  pecLeft.add(new THREE.Mesh(pecGeo, pecMat));
  const pecRight = new THREE.Group();
  pecRight.position.set(0.068, -0.058, -pecZ);
  pecRight.add(new THREE.Mesh(pecGeo, pecMat));
  scaleGroup.add(pecLeft, pecRight);

  const pvMat = makeFishMat(pvTex, { emissiveIntensity: 0.28 });
  const pelvicFin = new THREE.Group();
  pelvicFin.position.set(0.165, -0.185, 0);
  for (const s of [1, -1]) {
    const pvM = new THREE.Mesh(pvGeo, pvMat);
    pvM.position.z = s * 0.010;
    pvM.rotation.x = s * 0.18;
    pelvicFin.add(pvM);
  }
  scaleGroup.add(pelvicFin);

  const { biteRing, biteRingMat } = createBiteRing(ctx, scaleGroup, UX + 0.02, HY, "#ffd8a8", 0.052);

  return {
    speciesKey: sp.id,
    tailPivotX: -0.215,
    scaleGroup,
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
// 3. LAYLA (Queen Triggerfish — Tangerine/Gold/Silver-Blue, Ice-Cyan High Fins, Lyre Tail)
// =====================================================================================
function createLayla3DRig(sp: Species, maxAnisotropy: number): Fish3DRig {
  const pal = sp.pal;
  const OL = pal.outline || "#2a3c4e";
  const ctx = createRigContext(OL);
  const { track, uniforms, makeOutlineMat, makeFishMat } = ctx;

  // Match sprites.ts normalized coordinate transform: X(u) = 0.05 + 0.287*u, Y3(v) = -0.0365 - 0.217*v
  const RX = 0.287;
  const RY = 0.217;
  const X = (u: number) => 0.05 + RX * u;
  const Y3 = (v: number) => -0.0365 - RY * v;

  const HX = X(0.8);
  const HY = Y3(0.18);
  const UX = X(1.14);
  const UY = Y3(0.13);
  const LX = X(1.14);
  const LY = Y3(0.15);

  const topPts: Pt[] = [];
  const t1: [Pt, Pt, Pt, Pt] = [[X(-0.96), Y3(-0.14)], [X(-0.72), Y3(-0.48)], [X(-0.44), Y3(-0.92)], [X(0.02), Y3(-0.92)]];
  const t2: [Pt, Pt, Pt, Pt] = [[X(0.02), Y3(-0.92)], [X(0.44), Y3(-0.92)], [X(0.86), Y3(-0.5)], [UX, UY + 0.008]];
  for (let i = 0; i <= 32; i++) topPts.push(cubicPt(t1[0], t1[1], t1[2], t1[3], i / 32));
  for (let i = 1; i <= 32; i++) topPts.push(cubicPt(t2[0], t2[1], t2[2], t2[3], i / 32));

  const botPts: Pt[] = [];
  const b1: [Pt, Pt, Pt, Pt] = [[LX, LY - 0.027], [X(0.88), Y3(0.62)], [X(0.5), Y3(0.98)], [X(0.02), Y3(0.94)]];
  const b2: [Pt, Pt, Pt, Pt] = [[X(0.02), Y3(0.94)], [X(-0.44), Y3(0.94)], [X(-0.72), Y3(0.48)], [X(-0.96), Y3(0.14)]];
  for (let i = 0; i <= 32; i++) botPts.push(cubicPt(b2[3], b2[2], b2[1], b2[0], i / 32));
  for (let i = 1; i <= 32; i++) botPts.push(cubicPt(b1[3], b1[2], b1[1], b1[0], i / 32));

  const evalTop = (x: number) => interpCurveY(topPts, x);
  const evalBot = (x: number) => interpCurveY(botPts, x);
  const evalHalfZ = (x: number) => {
    const u = clamp((x - X(-0.96)) / (UX - X(-0.96)), 0, 1);
    const arch = Math.sin(clamp(u, 0.02, 0.985) * Math.PI);
    return 0.015 + 0.088 * Math.pow(arch, 0.58) * (1 - 0.16 * u);
  };
  const mapWorldUV = (x: number, y: number): Pt => [clamp((x - -0.3) / 0.75, 0, 1), clamp((y - -0.28) / 0.54, 0, 1)];

  // Pointed swept-forward ice-cyan Dorsal & Anal fins + Emerald lunate tail with long lyre filaments
  const dorsalShape = new THREE.Shape();
  dorsalShape.moveTo(X(0.14), Y3(-0.9));
  dorsalShape.quadraticCurveTo(X(0.22), Y3(-1.42), X(0.06), Y3(-1.74));
  dorsalShape.bezierCurveTo(X(-0.22), Y3(-1.44), X(-0.64), Y3(-1.12), X(-0.76), Y3(-0.7));
  dorsalShape.lineTo(X(-0.72), Y3(-0.28));
  dorsalShape.closePath();

  const analShape = new THREE.Shape();
  analShape.moveTo(X(0.02), Y3(0.88));
  analShape.quadraticCurveTo(X(0.04), Y3(1.38), X(-0.14), Y3(1.68));
  analShape.bezierCurveTo(X(-0.34), Y3(1.32), X(-0.66), Y3(1.04), X(-0.74), Y3(0.62));
  analShape.lineTo(X(-0.72), Y3(0.26));
  analShape.closePath();

  const tl = RX * 0.62;
  const th = RY * 0.82;
  const wy = RY * 0.13;
  const tailShape = new THREE.Shape();
  tailShape.moveTo(0, wy * 0.9);
  tailShape.quadraticCurveTo(-tl * 0.5, th * 0.8, -tl * 0.92, th * 0.86);
  tailShape.lineTo(-tl * 1.9, th * 1.0); // upper emerald lyre filament!
  tailShape.lineTo(-tl * 1.06, th * 0.86);
  tailShape.quadraticCurveTo(-tl * 0.62, th * 0.42, -tl * 0.56, 0);
  tailShape.quadraticCurveTo(-tl * 0.62, -th * 0.42, -tl * 1.06, -th * 0.86);
  tailShape.lineTo(-tl * 1.9, -th * 1.0); // lower emerald lyre filament!
  tailShape.lineTo(-tl * 0.92, -th * 0.86);
  tailShape.quadraticCurveTo(-tl * 0.5, -th * 0.8, 0, -wy * 0.9);
  tailShape.closePath();

  const pecShape = new THREE.Shape();
  pecShape.moveTo(0, 0.015);
  pecShape.bezierCurveTo(-0.05, 0.042, -0.115, 0.025, -0.11, -0.016);
  pecShape.bezierCurveTo(-0.1, -0.052, -0.04, -0.045, 0, -0.018);
  pecShape.closePath();

  const { geo: dorsalGeo, bounds: dB } = createExtrudedFin(dorsalShape, 0.004, 0.0012, 16);
  const { geo: analGeo, bounds: aB } = createExtrudedFin(analShape, 0.004, 0.0012, 16);
  const { geo: tailGeo, bounds: tB } = createExtrudedFin(tailShape, 0.0036, 0.0009, 16);
  const { geo: pecGeo, bounds: pB } = createExtrudedFin(pecShape, 0.0024, 0.0007, 12);
  track(dorsalGeo);
  track(analGeo);
  track(tailGeo);
  track(pecGeo);

  // Paint Queen Triggerfish 512x512 Albedo
  const cv = document.createElement("canvas");
  cv.width = 512;
  cv.height = 512;
  const c = cv.getContext("2d")!;
  const Xc = X;
  const Vc = (v: number) => 0.0365 + RY * v;

  c.save();
  c.translate((0.3 / 0.75) * 512, (0.29 / 0.54) * 512);
  c.scale(512 / 0.75, 512 / 0.54);

  c.fillStyle = makeLin(c, Xc(-0.5), Vc(-1.0), Xc(0.5), Vc(1.0), [
    [0, "#ffd43a"],
    [0.55, "#f5be36"],
    [1, "#d99824"],
  ]);
  c.fillRect(-0.4, -0.4, 1.0, 0.8);

  // Warm tangerine face gradient
  const faceG = c.createRadialGradient(Xc(0.74), Vc(-0.08), RY * 0.05, Xc(0.74), Vc(-0.08), RX * 0.86);
  faceG.addColorStop(0, "rgba(255, 134, 20, 0.98)");
  faceG.addColorStop(0.58, "rgba(255, 178, 42, 0.65)");
  faceG.addColorStop(1, "rgba(255, 210, 56, 0)");
  c.fillStyle = faceG;
  c.fillRect(-0.1, -0.35, 0.65, 0.7);

  // Silvery-blue lower belly
  const bellyG = c.createLinearGradient(0, Vc(0.08), 0, Vc(1.0));
  bellyG.addColorStop(0, "rgba(180, 212, 228, 0)");
  bellyG.addColorStop(0.55, "rgba(182, 214, 232, 0.88)");
  bellyG.addColorStop(1, "rgba(110, 148, 176, 0.96)");
  c.fillStyle = bellyG;
  c.fillRect(-0.4, Vc(0.04), 0.9, 0.35);

  // 2 parallel curved teal-blue cheek lines + concentric forehead arcs
  const bl = pal.stripe || "#326480";
  c.strokeStyle = bl;
  c.lineCap = "round";
  c.lineWidth = RY * 0.062;
  c.beginPath();
  c.moveTo(Xc(1.06), Vc(-0.04));
  c.quadraticCurveTo(Xc(0.76), Vc(0.14), Xc(0.38), Vc(0.46));
  c.stroke();
  c.beginPath();
  c.moveTo(Xc(0.96), Vc(0.24));
  c.bezierCurveTo(Xc(0.68), Vc(0.42), Xc(0.46), Vc(0.64), Xc(0.36), Vc(0.98));
  c.stroke();

  c.lineWidth = RY * 0.05;
  for (const rArc of [0.16, 0.28, 0.42]) {
    c.beginPath();
    c.ellipse(Xc(0.04), Vc(-0.76), RX * rArc * 0.92, RY * rArc * 0.52, -0.06, 0, Math.PI * 1.25);
    c.stroke();
  }
  c.beginPath();
  c.moveTo(Xc(0.54), Vc(-0.72));
  c.quadraticCurveTo(Xc(0.36), Vc(-0.34), Xc(0.36), Vc(0.1));
  c.stroke();

  // Slate freckles on lower belly
  c.fillStyle = rgbaHex(pal.spot || "#4e6e84", 0.58);
  for (const [u, v] of [
    [-0.45, 0.42],
    [-0.28, 0.56],
    [-0.1, 0.46],
    [0.06, 0.62],
    [-0.36, 0.7],
    [-0.58, 0.28],
    [0.18, 0.52],
  ]) {
    c.beginPath();
    c.arc(Xc(u), Vc(v), RX * 0.025, 0, Math.PI * 2);
    c.fill();
  }

  // Cute pouting mouth seam
  c.strokeStyle = OL;
  c.lineWidth = 0.0065;
  c.beginPath();
  c.moveTo(UX, -UY);
  c.quadraticCurveTo((UX + HX) * 0.5, -HY + 0.004, HX, -HY);
  c.stroke();
  c.restore();

  const albedo = track(new THREE.CanvasTexture(cv));
  albedo.colorSpace = THREE.SRGBColorSpace;
  albedo.anisotropy = maxAnisotropy;
  albedo.needsUpdate = true;

  const cyanFinTex = (bounds: { minX: number; maxX: number; minY: number; maxY: number }, up: boolean) =>
    track(
      makePaintedFinTex(maxAnisotropy, bounds, (fc) => {
        fc.fillStyle = makeLin(fc, 0, up ? 0.14 : -0.14, 0, up ? 0.36 : -0.36, [
          [0, "#52abc4"],
          [0.65, "#aeeaf7"],
          [1, "#387890"],
        ]);
        fc.fillRect(bounds.minX - 0.04, bounds.minY - 0.04, 0.6, 0.6);
        fc.strokeStyle = "rgba(38, 92, 118, 0.32)";
        fc.lineWidth = 0.004;
        for (let i = 0; i < 8; i++) {
          const f = i / 7;
          fc.beginPath();
          fc.moveTo(X(0.08 - f * 0.76), Y3(up ? -0.8 : 0.8));
          fc.lineTo(X(0.04 - f * 0.74), Y3(up ? -1.6 + f * 0.85 : 1.55 - f * 0.85));
          fc.stroke();
        }
        fc.strokeStyle = OL;
        fc.lineWidth = 0.008;
        fc.beginPath();
        if (up) {
          fc.moveTo(X(0.14), Y3(-0.9));
          fc.quadraticCurveTo(X(0.22), Y3(-1.42), X(0.06), Y3(-1.74));
          fc.bezierCurveTo(X(-0.22), Y3(-1.44), X(-0.64), Y3(-1.12), X(-0.76), Y3(-0.7));
        } else {
          fc.moveTo(X(0.02), Y3(0.88));
          fc.quadraticCurveTo(X(0.04), Y3(1.38), X(-0.14), Y3(1.68));
          fc.bezierCurveTo(X(-0.34), Y3(1.32), X(-0.66), Y3(1.04), X(-0.74), Y3(0.62));
        }
        fc.stroke();
      })
    );

  const dorsalTex = cyanFinTex(dB, true);
  const analTex = cyanFinTex(aB, false);

  const tailTex = track(
    makePaintedFinTex(maxAnisotropy, tB, (fc) => {
      fc.fillStyle = makeLin(fc, 0, 0, -tl * 1.85, 0, [
        [0, "#147a38"],
        [0.45, "#22b858"],
        [0.75, "#5ce68a"],
        [1, "#22b858"],
      ]);
      fc.fillRect(tB.minX - 0.04, tB.minY - 0.04, 0.5, 0.5);
      fc.strokeStyle = "rgba(18, 72, 42, 0.45)";
      fc.lineWidth = 0.0038;
      for (const k of [-0.7, -0.35, 0, 0.35, 0.7]) {
        fc.beginPath();
        fc.moveTo(0, k * wy);
        fc.lineTo(-tl * 0.95, k * th);
        fc.stroke();
      }
      fc.strokeStyle = "#145438";
      fc.lineWidth = 0.007;
      fc.beginPath();
      fc.moveTo(0, wy * 0.9);
      fc.quadraticCurveTo(-tl * 0.5, th * 0.8, -tl * 0.92, th * 0.86);
      fc.lineTo(-tl * 1.9, th * 1.0);
      fc.moveTo(0, -wy * 0.9);
      fc.quadraticCurveTo(-tl * 0.5, -th * 0.8, -tl * 0.92, -th * 0.86);
      fc.lineTo(-tl * 1.9, -th * 1.0);
      fc.stroke();
    })
  );

  const pecTex = track(
    makePaintedFinTex(maxAnisotropy, pB, (fc) => {
      fc.fillStyle = makeLin(fc, 0, 0, -0.1, 0, [
        [0, "#52abc4"],
        [1, "#d8f6ff"],
      ]);
      fc.fillRect(pB.minX - 0.02, pB.minY - 0.02, 0.25, 0.25);
    })
  );

  const { root, pitchGroup, yawGroup, bodyGroup } = baseGroups();
  const evalUnifiedBot = blendBotToPalate(evalBot, () => HY - 0.002, HX, 0.032, 0.014);
  const evalMidY = (x: number) => (evalTop(x) + evalUnifiedBot(x)) * 0.5;

  const bodyGeo = track(
    buildLoftedSurface({
      xStart: X(-0.96),
      xEnd: UX,
      uSteps: 52,
      vSteps: 28,
      evalTopY: evalTop,
      evalBotY: evalUnifiedBot,
      evalHalfZ,
      mapUV: mapWorldUV,
      roundFront: true,
    })
  );
  const bodyMat = makeFishMat(albedo);
  injectSpineShader(bodyMat, uniforms);
  bodyGroup.add(new THREE.Mesh(bodyGeo, bodyMat));
  const laylaBodyMask = bodySpineOutlineMask(
    evalMidY,
    [
      { x0: X(-0.76), x1: X(0.14), top: true },
      { x0: X(-0.74), x1: X(0.02), top: false },
    ],
    0.026
  );
  bodyGroup.add(new THREE.Mesh(track(buildOutlineGeometry(bodyGeo, 0.0046, laylaBodyMask)), makeOutlineMat()));

  const dorsalMat = makeFishMat(dorsalTex, { emissiveIntensity: 0.3 });
  injectSpineShader(dorsalMat, uniforms);
  const dorsalMesh = new THREE.Mesh(dorsalGeo, dorsalMat);
  dorsalMesh.add(
    new THREE.Mesh(track(buildOutlineGeometry(dorsalGeo, 0.0014, finRootMaskY(Y3(-0.75), 0.04, true))), makeOutlineMat())
  );
  bodyGroup.add(dorsalMesh);

  const analMat = makeFishMat(analTex, { emissiveIntensity: 0.3 });
  injectSpineShader(analMat, uniforms);
  const analMesh = new THREE.Mesh(analGeo, analMat);
  analMesh.add(
    new THREE.Mesh(track(buildOutlineGeometry(analGeo, 0.0014, finRootMaskY(Y3(0.75), 0.04, false))), makeOutlineMat())
  );
  bodyGroup.add(analMesh);

  const tailPivot = new THREE.Group();
  tailPivot.position.set(X(-0.9), -0.0365, 0);
  bodyGroup.add(tailPivot);
  tailPivot.add(new THREE.Mesh(tailGeo, makeFishMat(tailTex, { emissiveIntensity: 0.3 })));

  // Unified cranium owns upper snout; empty upperJawGroup kept for compatibility
  const upperJawGroup = new THREE.Group();
  upperJawGroup.position.set(HX, HY, 0);
  bodyGroup.add(upperJawGroup);

  const lowerJawGroup = new THREE.Group();
  lowerJawGroup.position.set(HX, HY, 0);
  bodyGroup.add(lowerJawGroup);
  const lGeo = track(
    buildLoftedSurface({
      xStart: HX - 0.022,
      xEnd: LX,
      uSteps: 16,
      vSteps: 20,
      evalTopY: () => HY - 0.004,
      evalBotY: evalBot,
      evalHalfZ,
      mapUV: mapWorldUV,
      localOffsetX: HX,
      localOffsetY: HY,
      roundFront: true,
      rearInsetAt: (x) => (x < HX ? 0.78 + 0.2 * clamp((x - (HX - 0.022)) / 0.022, 0, 1) : 1),
    })
  );
  const lMat = makeFishMat(albedo);
  injectSpineShader(lMat, uniforms, HX, HY);
  lowerJawGroup.add(new THREE.Mesh(lGeo, lMat));
  lowerJawGroup.add(
    new THREE.Mesh(track(buildOutlineGeometry(lGeo, 0.0044, jawOutlineMask(0.008, 0.042))), makeOutlineMat(HX, HY))
  );

  const { mouthInterior, tongueMesh } = createOralParts(ctx, bodyGroup, lowerJawGroup, HX, HY, "#5c1220", "#eb6b8e", [0.03, 0.025, 0.02], [0.024, 0.01, 0.014], 0.028);

  const { eyesNormal, eyesPupil, eyesHappy } = createEyePair(ctx, bodyGroup, {
    ex: X(0.54),
    ey: Y3(-0.34),
    ez: surfaceZAt(evalTop, evalBot, evalHalfZ, X(0.54), Y3(-0.34)),
    er: 0.044,
    sx: 0.74,
    sy: 1.05,
    irisColor: pal.iris || "#1a5276",
    rimColor: OL,
    happyColor: OL,
  });

  const pecMat = makeFishMat(pecTex, { emissiveIntensity: 0.28, transparent: true, opacity: 0.85 });
  const pecZ = surfaceZAt(evalTop, evalBot, evalHalfZ, X(0.24), Y3(0.34), 0.22, 1.0) + 0.006;
  const pecLeft = new THREE.Group();
  pecLeft.position.set(X(0.24), Y3(0.34), pecZ);
  pecLeft.add(new THREE.Mesh(pecGeo, pecMat));
  const pecRight = new THREE.Group();
  pecRight.position.set(X(0.24), Y3(0.34), -pecZ);
  pecRight.add(new THREE.Mesh(pecGeo, pecMat));
  bodyGroup.add(pecLeft, pecRight);

  const pelvicFin = new THREE.Group();
  const { biteRing, biteRingMat } = createBiteRing(ctx, bodyGroup, UX + 0.02, HY, "#aef4ff", 0.048);

  return {
    speciesKey: sp.id,
    tailPivotX: X(-0.9),
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
// 4. EDDY (Deep-Sea Anglerfish — Glowing Esca Lure, 48-Deg Scoop Jaw, 10 Curved Tusks)
// =====================================================================================
function buildCurvedTuskGeo(len: number, bow: number, rad: number): THREE.BufferGeometry {
  const curve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(bow, len * 0.52, 0),
    new THREE.Vector3(-bow * 0.25, len, 0)
  );
  const segs = 10;
  const rSegs = 8;
  const pts = curve.getPoints(segs);
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const p = pts[i];
    const r = rad * Math.max(0.06, 1 - Math.pow(t, 0.85));
    const tan = curve.getTangent(t);
    const n1 = new THREE.Vector3(-tan.y, tan.x, 0).normalize();
    const n2 = new THREE.Vector3(0, 0, 1);
    for (let j = 0; j <= rSegs; j++) {
      const a = (j / rSegs) * Math.PI * 2;
      const vx = p.x + n1.x * Math.cos(a) * r + n2.x * Math.sin(a) * r;
      const vy = p.y + n1.y * Math.cos(a) * r + n2.y * Math.sin(a) * r;
      const vz = p.z + n1.z * Math.cos(a) * r + n2.z * Math.sin(a) * r;
      pos.push(vx, vy, vz);
    }
  }
  const rc = rSegs + 1;
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < rSegs; j++) {
      const a = i * rc + j;
      const b = (i + 1) * rc + j;
      const c = (i + 1) * rc + j + 1;
      const d = i * rc + j + 1;
      idx.push(a, d, b, b, d, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

function createEddy3DRig(sp: Species, maxAnisotropy: number): Fish3DRig {
  const pal = sp.pal;
  const HI = "#b8ea3a";
  const BODY = pal.body || "#8cc828";
  const DARK = pal.dark || "#548a16";
  const DEEP = "#2d5209";
  const OL = pal.outline || "#132b05";
  const LURE = pal.lure || "#1ce8ff";

  const ctx = createRigContext(OL);
  const { track, uniforms, makeOutlineMat, makeFishMat } = ctx;

  // In drawEddy 2D -> 3D (+Y up): y3 = -y2
  const HX = 0.118;
  const HY = -0.146;

  // Cranium + back + peduncle curves (peduncle -0.278 up to crown 0.08,+0.156 down to snout tip 0.338,-0.008)
  const topSeg1: [Pt, Pt, Pt, Pt] = [[-0.278, -0.012], [-0.2, 0.095], [-0.065, 0.158], [0.08, 0.156]];
  const topSeg2: [Pt, Pt, Pt, Pt] = [[0.08, 0.156], [0.182, 0.154], [0.258, 0.098], [0.338, 0.008]];
  const topPts: Pt[] = [];
  for (let i = 0; i <= 30; i++) topPts.push(cubicPt(topSeg1[0], topSeg1[1], topSeg1[2], topSeg1[3], i / 30));
  for (let i = 1; i <= 30; i++) topPts.push(cubicPt(topSeg2[0], topSeg2[1], topSeg2[2], topSeg2[3], i / 30));

  // Torso rear belly (-0.278 .. +0.118) curves down steeply into plump jowl/chin (0.118, -0.305)
  const torsoBotPts: Pt[] = [];
  const tBotSeg: [Pt, Pt, Pt, Pt] = [[-0.278, -0.048], [-0.045, -0.082], [0.012, -0.295], [0.125, -0.306]];
  for (let i = 0; i <= 34; i++) torsoBotPts.push(cubicPt(tBotSeg[0], tBotSeg[1], tBotSeg[2], tBotSeg[3], i / 34));

  // Mouth seam inside cranium (0.118,-0.146 up to snout tip 0.338,-0.010)
  const mouthSeam = (x: number): number => {
    const u = clamp((x - HX) / (0.338 - HX), 0, 1);
    return HY + (-0.010 - HY) * Math.pow(u, 0.92);
  };

  // Closed lower jaw scoop chin (0.115 .. 0.356): top = slanted lip rim, bot = deep bulbous scoop chin!
  const lowerBotSeg: [Pt, Pt, Pt, Pt] = [[0.105, -0.304], [0.16, -0.316], [0.305, -0.195], [0.354, -0.038]];
  const lowerBotPts: Pt[] = [];
  for (let i = 0; i <= 28; i++) lowerBotPts.push(cubicPt(lowerBotSeg[0], lowerBotSeg[1], lowerBotSeg[2], lowerBotSeg[3], i / 28));

  const evalHalfZ = (x: number) => {
    const u = clamp((x - -0.278) / (0.354 - -0.278), 0, 1);
    const arch = Math.sin(clamp(u, 0.015, 0.98) * Math.PI);
    return 0.016 + 0.135 * Math.pow(arch, 0.56) * (0.88 + 0.12 * u);
  };
  const mapWorldUV = (x: number, y: number): Pt => [clamp((x - -0.31) / 0.72, 0, 1), clamp((y - -0.34) / 0.56, 0, 1)];

  // Body Flank Albedo
  const cv = document.createElement("canvas");
  cv.width = 512;
  cv.height = 512;
  const c = cv.getContext("2d")!;
  c.save();
  c.translate((0.31 / 0.72) * 512, (0.22 / 0.56) * 512);
  c.scale(512 / 0.72, 512 / 0.56);

  c.fillStyle = makeLin(c, 0.06, -0.16, 0.06, 0.32, [
    [0, HI],
    [0.44, BODY],
    [0.84, DARK],
    [1, DEEP],
  ]);
  c.fillRect(-0.36, -0.3, 0.85, 0.7);
  drawGlow(c, 0.12, -0.095, 0.145, 0.068, 0.14, "230,255,145", 0.48);

  // Jowl fold & skin bumps
  c.strokeStyle = rgbaHex(DEEP, 0.56);
  c.lineWidth = 0.0085;
  c.lineCap = "round";
  c.beginPath();
  c.moveTo(0.042, 0.258);
  c.bezierCurveTo(-0.025, 0.145, -0.018, 0.012, 0.078, -0.022);
  c.stroke();
  c.fillStyle = DARK;
  for (const [bx, by, br] of [
    [0.058, 0.082, 0.011],
    [0.085, 0.102, 0.008],
    [0.032, 0.1, 0.008],
  ]) {
    drawBlob(c, bx, by, br * 1.25, br * 0.85, -0.1);
  }
  c.restore();

  const albedo = track(new THREE.CanvasTexture(cv));
  albedo.colorSpace = THREE.SRGBColorSpace;
  albedo.anisotropy = maxAnisotropy;
  albedo.needsUpdate = true;

  const { root, pitchGroup, yawGroup, bodyGroup } = baseGroups();

  // Unified Rear Torso + Cranium (-0.278 .. 0.338)
  const evalTop = (x: number) => interpCurveY(topPts, x);
  const evalBot = blendBotToPalate((x) => interpCurveY(torsoBotPts, x), mouthSeam, HX, 0.032, 0.014);
  const evalMidY = (x: number) => (evalTop(x) + evalBot(x)) * 0.5;

  const torsoGeo = track(
    buildLoftedSurface({
      xStart: -0.278,
      xEnd: 0.338,
      uSteps: 56,
      vSteps: 30,
      evalTopY: evalTop,
      evalBotY: evalBot,
      evalHalfZ,
      mapUV: mapWorldUV,
      roundFront: true,
    })
  );
  const bMat = makeFishMat(albedo);
  injectSpineShader(bMat, uniforms);
  bodyGroup.add(new THREE.Mesh(torsoGeo, bMat));
  const eddyBodyMask = bodySpineOutlineMask(evalMidY, [{ x0: -0.232, x1: -0.01, top: true }], 0.024);
  bodyGroup.add(new THREE.Mesh(track(buildOutlineGeometry(torsoGeo, 0.0046, eddyBodyMask)), makeOutlineMat()));

  // Unified cranium owns upper snout; empty upperJawGroup kept for shared interface
  const upperJawGroup = new THREE.Group();
  upperJawGroup.position.set(HX, HY, 0);
  bodyGroup.add(upperJawGroup);

  // Dramatic Scoop Lower Jaw (HX-0.022 .. 0.354)
  const lowerJawGroup = new THREE.Group();
  lowerJawGroup.position.set(HX, HY, 0);
  bodyGroup.add(lowerJawGroup);
  const lGeo = track(
    buildLoftedSurface({
      xStart: HX - 0.022,
      xEnd: 0.354,
      uSteps: 24,
      vSteps: 24,
      evalTopY: (x) => mouthSeam(Math.min(x, 0.338)) - 0.004,
      evalBotY: (x) => interpCurveY(lowerBotPts, x),
      evalHalfZ,
      mapUV: mapWorldUV,
      localOffsetX: HX,
      localOffsetY: HY,
      roundFront: true,
      rearInsetAt: (x) => (x < HX ? 0.78 + 0.2 * clamp((x - (HX - 0.022)) / 0.022, 0, 1) : 1),
    })
  );
  const lMat = makeFishMat(albedo);
  injectSpineShader(lMat, uniforms, HX, HY);
  lowerJawGroup.add(new THREE.Mesh(lGeo, lMat));
  lowerJawGroup.add(
    new THREE.Mesh(track(buildOutlineGeometry(lGeo, 0.0045, jawOutlineMask(0.008, 0.046))), makeOutlineMat(HX, HY))
  );

  // Abyssal mouth cavern + fleshy terracotta-coral tongue
  const { mouthInterior, tongueMesh } = createOralParts(
    ctx,
    bodyGroup,
    lowerJawGroup,
    HX,
    HY,
    "#260b12",
    "#c85654",
    [0.095, 0.065, 0.072],
    [0.075, 0.024, 0.045],
    0.095
  );
  tongueMesh.rotation.z = 0.42;
  tongueMesh.position.set(0.095, 0.045, 0);

  // Curved Bright White Tusks (~24% wider & crisp white with subtle outline!)
  const ivoryMat = track(
    new THREE.MeshPhysicalMaterial({
      color: "#fffcf2",
      emissive: "#f4f9ff",
      emissiveIntensity: 0.16,
      roughness: 0.45,
      clearcoat: 0.08,
      envMapIntensity: 0.08,
    })
  );
  const tuskOlMat = track(new THREE.MeshBasicMaterial({ color: OL, side: THREE.BackSide }));
  const addTusk = (parent: THREE.Object3D, bx: number, by: number, bz: number, len: number, bow: number, rad: number, tiltZ: number, down = false) => {
    const tGeo = track(buildCurvedTuskGeo(len, bow, rad * 1.24));
    const mesh = new THREE.Mesh(tGeo, ivoryMat);
    mesh.position.set(bx, by, bz);
    mesh.rotation.z = tiltZ;
    if (down) mesh.scale.y = -1;
    const ol = new THREE.Mesh(track(buildOutlineGeometry(tGeo, 0.0009)), tuskOlMat);
    mesh.add(ol);
    parent.add(mesh);
  };

  // Lower jaw curved tusks along left & right jaw rims (in lowerJawGroup local coords relative to HX,HY)
  const lowerFangs: [number, number, number, number][] = [
    [0.342, -0.048, 0.062, 0.011],
    [0.312, -0.072, 0.115, 0.014],
    [0.272, -0.1, 0.132, 0.015],
    [0.224, -0.13, 0.095, 0.013],
    [0.168, -0.162, 0.068, 0.011],
  ];
  for (const [fx, fy, flen, frad] of lowerFangs) {
    const zEdge = evalHalfZ(fx) * 0.74;
    for (const side of [1, -1]) {
      addTusk(lowerJawGroup, fx - HX, fy - HY, side * zEdge, flen, flen * 0.24, frad, 0.18, false);
    }
  }

  // Upper needle tusks mounted directly along unified upper palate on bodyGroup
  const upperTusksGroup = new THREE.Group();
  bodyGroup.add(upperTusksGroup);
  const upperFangs: [number, number, number, number][] = [
    [0.326, -0.006, 0.095, 0.0095],
    [0.294, -0.018, 0.105, 0.011],
    [0.254, -0.036, 0.088, 0.0105],
    [0.214, -0.056, 0.068, 0.009],
    [0.174, -0.076, 0.048, 0.008],
  ];
  for (const [fx, fy, flen, frad] of upperFangs) {
    const zEdge = evalHalfZ(fx) * 0.72;
    for (const side of [1, -1]) {
      addTusk(upperTusksGroup, fx, fy, side * zEdge, flen, flen * 0.22, frad, 0.14, true);
    }
  }

  // Ragged Dorsal Crest (4 spines) + Ragged Caudal Tail + Pelvic + Animated Flared Gill Fins
  const dorsalSpines: [number, number, number, number, number, number][] = [
    [-0.01, 0.148, -0.04, 0.208, -0.068, 0.138],
    [-0.06, 0.14, -0.096, 0.188, -0.126, 0.114],
    [-0.118, 0.116, -0.156, 0.154, -0.18, 0.084],
    [-0.174, 0.088, -0.208, 0.116, -0.232, 0.048],
  ];
  const spineShape = new THREE.Shape();
  dorsalSpines.forEach(([x0, y0, tx, ty, x1, y1], idx) => {
    if (idx === 0) spineShape.moveTo(x0, y0 - 0.018);
    spineShape.lineTo(tx, ty);
    spineShape.lineTo((tx + x1) * 0.5, ty - 0.015);
    spineShape.lineTo(x1, y1 - 0.018);
  });
  spineShape.closePath();
  const { geo: dorsalGeo, bounds: dB } = createExtrudedFin(spineShape, 0.004, 0.001, 8);
  track(dorsalGeo);
  const dTex = track(
    makePaintedFinTex(maxAnisotropy, dB, (fc) => {
      fc.fillStyle = makeLin(fc, 0, 0.06, 0, 0.22, [
        [0, BODY],
        [1, DARK],
      ]);
      fc.fillRect(dB.minX - 0.02, dB.minY - 0.02, 0.4, 0.3);
      fc.strokeStyle = OL;
      fc.lineWidth = 0.007;
      for (const [x0, y0, tx, ty, x1, y1] of dorsalSpines) {
        fc.beginPath();
        fc.moveTo(x0, y0 - 0.018);
        fc.lineTo(tx, ty);
        fc.lineTo(x1, y1 - 0.018);
        fc.stroke();
      }
    })
  );
  const dMat = makeFishMat(dTex, { emissiveIntensity: 0.25 });
  injectSpineShader(dMat, uniforms);
  bodyGroup.add(new THREE.Mesh(dorsalGeo, dMat));

  // Ragged Tail
  const tailShape = new THREE.Shape();
  tailShape.moveTo(0.015, 0.018);
  tailShape.bezierCurveTo(-0.045, 0.068, -0.105, 0.098, -0.156, 0.112);
  tailShape.lineTo(-0.128, 0.056);
  tailShape.lineTo(-0.165, 0.022);
  tailShape.lineTo(-0.132, -0.014);
  tailShape.lineTo(-0.156, -0.062);
  tailShape.lineTo(-0.122, -0.072);
  tailShape.lineTo(-0.136, -0.116);
  tailShape.bezierCurveTo(-0.082, -0.098, -0.032, -0.062, 0.015, -0.022);
  tailShape.closePath();
  const { geo: tailGeo, bounds: tB } = createExtrudedFin(tailShape, 0.0038, 0.001, 12);
  track(tailGeo);
  const tailTex = track(
    makePaintedFinTex(maxAnisotropy, tB, (fc) => {
      fc.fillStyle = makeLin(fc, 0, 0, -0.16, 0, [
        [0, BODY],
        [0.58, DARK],
        [1, DEEP],
      ]);
      fc.fillRect(tB.minX - 0.02, tB.minY - 0.02, 0.3, 0.3);
      fc.strokeStyle = OL;
      fc.lineWidth = 0.007;
      fc.beginPath();
      fc.moveTo(0.015, 0.018);
      fc.bezierCurveTo(-0.045, 0.068, -0.105, 0.098, -0.156, 0.112);
      fc.lineTo(-0.128, 0.056);
      fc.lineTo(-0.165, 0.022);
      fc.lineTo(-0.132, -0.014);
      fc.lineTo(-0.156, -0.062);
      fc.lineTo(-0.136, -0.116);
      fc.bezierCurveTo(-0.082, -0.098, -0.032, -0.062, 0.015, -0.022);
      fc.stroke();
    })
  );
  const tailPivot = new THREE.Group();
  tailPivot.position.set(-0.278, -0.028, 0);
  bodyGroup.add(tailPivot);
  tailPivot.add(new THREE.Mesh(tailGeo, makeFishMat(tailTex, { emissiveIntensity: 0.25 })));

  // Flared 4-peak spotted Gill / Pectoral Fin
  const pecShape = new THREE.Shape();
  pecShape.moveTo(-0.015, -0.016);
  pecShape.bezierCurveTo(-0.042, 0.075, -0.068, 0.148, -0.076, 0.228);
  pecShape.lineTo(-0.038, 0.205);
  pecShape.lineTo(-0.018, 0.244);
  pecShape.lineTo(0.01, 0.212);
  pecShape.lineTo(0.038, 0.238);
  pecShape.bezierCurveTo(0.035, 0.142, 0.026, 0.065, 0.016, -0.016);
  pecShape.closePath();
  const { geo: pecGeo, bounds: pB } = createExtrudedFin(pecShape, 0.0032, 0.0008, 12);
  track(pecGeo);
  const pecTex = track(
    makePaintedFinTex(maxAnisotropy, pB, (fc) => {
      fc.fillStyle = makeLin(fc, 0, -0.01, -0.01, 0.24, [
        [0, DARK],
        [0.48, BODY],
        [1, "#a6dc44"],
      ]);
      fc.fillRect(pB.minX - 0.02, pB.minY - 0.02, 0.2, 0.35);
      fc.fillStyle = "rgba(42, 82, 12, 0.45)";
      drawBlob(fc, -0.032, 0.135, 0.017, 0.013, -0.12);
      drawBlob(fc, 0.008, 0.172, 0.014, 0.011, 0.2);
      drawBlob(fc, -0.018, 0.078, 0.012, 0.009, 0);
      fc.strokeStyle = OL;
      fc.lineWidth = 0.0065;
      fc.beginPath();
      fc.moveTo(-0.015, -0.016);
      fc.bezierCurveTo(-0.042, 0.075, -0.068, 0.148, -0.076, 0.228);
      fc.lineTo(-0.038, 0.205);
      fc.lineTo(-0.018, 0.244);
      fc.lineTo(0.01, 0.212);
      fc.lineTo(0.038, 0.238);
      fc.bezierCurveTo(0.035, 0.142, 0.026, 0.065, 0.016, -0.016);
      fc.stroke();
    })
  );
  const pecMat = makeFishMat(pecTex, { emissiveIntensity: 0.28 });
  const pecZ = surfaceZAt(evalTop, evalBot, evalHalfZ, 0.032, 0.022, 0.22, 1.0) + 0.006;
  const pecLeft = new THREE.Group();
  pecLeft.position.set(0.032, 0.022, pecZ);
  pecLeft.add(new THREE.Mesh(pecGeo, pecMat));
  const pecRight = new THREE.Group();
  pecRight.position.set(0.032, 0.022, -pecZ);
  pecRight.add(new THREE.Mesh(pecGeo, pecMat));
  bodyGroup.add(pecLeft, pecRight);

  // Ragged pelvic fin
  const pelvShape = new THREE.Shape();
  pelvShape.moveTo(-0.022, 0.008);
  pelvShape.lineTo(-0.068, -0.092);
  pelvShape.lineTo(-0.042, -0.076);
  pelvShape.lineTo(-0.036, -0.114);
  pelvShape.lineTo(-0.016, -0.08);
  pelvShape.lineTo(0.006, -0.102);
  pelvShape.lineTo(0.026, 0.004);
  pelvShape.closePath();
  const { geo: pelvGeo } = createExtrudedFin(pelvShape, 0.0032, 0.0008, 8);
  track(pelvGeo);
  const pelvicFin = new THREE.Group();
  pelvicFin.position.set(-0.005, -0.152, 0);
  pelvicFin.add(
    new THREE.Mesh(
      pelvGeo,
      track(
        new THREE.MeshPhysicalMaterial({
          color: DARK,
          emissive: BODY,
          emissiveIntensity: 0.2,
          roughness: 0.4,
        })
      )
    )
  );
  bodyGroup.add(pelvicFin);

  // Glowing Electric Neon-Blue Bioluminescent Esca Stalk & Bulb!
  const lureGroup = new THREE.Group();
  bodyGroup.add(lureGroup);
  const stalkCurve = new THREE.CubicBezierCurve3(
    new THREE.Vector3(0.088, 0.145, 0),
    new THREE.Vector3(0.088, 0.355, 0),
    new THREE.Vector3(0.325, 0.422, 0),
    new THREE.Vector3(0.365, 0.24, 0)
  );
  const stalkGeo = track(new THREE.TubeGeometry(stalkCurve, 20, 0.0085, 10, false));
  const stalkMat = track(
    new THREE.MeshPhysicalMaterial({
      color: "#32c6b8",
      emissive: "#157a6e",
      emissiveIntensity: 0.35,
      roughness: 0.28,
    })
  );
  lureGroup.add(new THREE.Mesh(stalkGeo, stalkMat));
  lureGroup.add(new THREE.Mesh(track(buildOutlineGeometry(stalkGeo, 0.003)), makeOutlineMat(0, 0, false)));

  const bulbGeo = track(new THREE.SphereGeometry(0.036, 16, 12));
  bulbGeo.scale(0.86, 1.18, 0.86);
  const bulbMat = track(
    new THREE.MeshPhysicalMaterial({
      color: "#d8fbff",
      emissive: LURE,
      emissiveIntensity: 1.35,
      roughness: 0.1,
      clearcoat: 1.0,
    })
  );
  const bulbMesh = new THREE.Mesh(bulbGeo, bulbMat);
  bulbMesh.position.set(0.365, 0.202, 0);
  lureGroup.add(bulbMesh);

  const haloGeo = track(new THREE.SphereGeometry(0.082, 16, 12));
  const haloMat = track(
    new THREE.MeshBasicMaterial({
      color: LURE,
      transparent: true,
      opacity: 0.28,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  const haloMesh = new THREE.Mesh(haloGeo, haloMat);
  haloMesh.position.copy(bulbMesh.position);
  lureGroup.add(haloMesh);

  // Down-slanted green-lidded emerald eyes
  const { eyesNormal, eyesPupil, eyesHappy } = createEyePair(ctx, bodyGroup, {
    ex: 0.148,
    ey: 0.068,
    ez: surfaceZAt(evalTop, evalBot, evalHalfZ, 0.148, 0.068, 0.22, 0.94),
    er: 0.068,
    sx: 0.96,
    sy: 1.0,
    irisColor: pal.iris || "#20ad30",
    rimColor: OL,
    happyColor: OL,
    lidColor: "#6eb822",
    lidTilt: -0.26,
  });

  const { biteRing, biteRingMat } = createBiteRing(ctx, bodyGroup, 0.355, -0.04, "#72f5ff", 0.072);

  return {
    speciesKey: sp.id,
    tailPivotX: -0.278,
    isFluke: false,
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
      const tightClamp = p.jaw < 0 ? clamp(-p.jaw, 0, 0.4) : 0;
      lowerJawGroup.rotation.z = -open * 0.84 + tightClamp * 0.14;
      const uTooth = clamp((open - 0.03) / 0.28, 0, 1);
      upperTusksGroup.visible = uTooth > 0.04;
      upperTusksGroup.scale.set(1, Math.max(0.05, uTooth), 1);

      const hasMouthOpen = open > 0.03;
      mouthInterior.visible = hasMouthOpen;
      if (hasMouthOpen) {
        mouthInterior.scale.set(0.85 + open * 0.32, 0.35 + open * 1.15, 0.8 + open * 0.25);
      }
      tongueMesh.visible = open > 0.06;

      // Glowing lure sway & pulse (brighter deeper in the abyss!)
      const pulse = 0.85 + Math.sin(p.wag2 * 1.6) * 0.2 + (p.depthFactor ?? 0) * 0.45;
      bulbMat.emissiveIntensity = 1.15 * pulse;
      haloMat.opacity = 0.22 + Math.sin(p.wag2 * 1.6) * 0.07 + (p.depthFactor ?? 0) * 0.16;
      haloMesh.scale.setScalar(0.95 + Math.sin(p.wag2 * 1.6) * 0.12);
      lureGroup.rotation.z = Math.sin(p.wag2) * 0.06;

      // Extra lively 4-peak gill fin fanning
      const ff = p.wag2 * (p.sucking ? 1.55 : 1.1);
      pecLeft.rotation.x = 0.28 + Math.cos(ff) * 0.12;
      pecLeft.rotation.y = 0.16;
      pecLeft.rotation.z = -0.14 + Math.sin(ff) * 0.28;
      pecRight.rotation.x = -0.28 - Math.cos(ff + 0.6) * 0.12;
      pecRight.rotation.y = -0.16;
      pecRight.rotation.z = -0.14 - Math.sin(ff + 0.6) * 0.28;
    },
    dispose: () => {
      for (const d of ctx.disposables) d.dispose();
    },
  };
}

// =====================================================================================
// 5. GOLIATH (Orca — Glossy Black/White Whale, True Horizontal Fluke, 3D Peg Teeth)
// =====================================================================================
function createOrca3DRig(sp: Species, maxAnisotropy: number): Fish3DRig {
  const pal = sp.pal;
  const BLK = "#10141c";
  const BLK_HI = "#2f3a4a";
  const OL = pal.outline || "#080b10";
  const WH = "#ffffff";

  const ctx = createRigContext(OL, "#424242");
  const { track, uniforms, makeOutlineMat, makeFishMat } = ctx;

  // drawOrca translates (0, 0.02) in +Y down => in 3D +Y up shift is -0.02!
  const to3D = (x2: number, y2: number): Pt => [x2, -(y2 + 0.02)];
  const HX = 0.276;
  const HY = -0.068; // -(0.048 + 0.02)
  const UX = 0.436;
  const UY = -0.052;
  const LX = 0.428;
  const LY = -0.086;

  const topSegs: [Pt, Pt, Pt, Pt][] = [
    [to3D(-0.36, 0.018), to3D(-0.275, -0.018), to3D(-0.19, -0.072), to3D(-0.035, -0.098)],
    [to3D(-0.035, -0.098), to3D(0.115, -0.108), to3D(0.255, -0.095), to3D(0.355, -0.042)],
    [to3D(0.355, -0.042), to3D(0.398, -0.016), to3D(0.428, 0.014), [UX, UY]],
  ];
  const botSegs: [Pt, Pt, Pt, Pt][] = [
    [to3D(-0.36, 0.042), to3D(-0.275, 0.062), to3D(-0.195, 0.075), to3D(0.085, 0.108)],
    [to3D(0.085, 0.108), to3D(0.215, 0.102), to3D(0.335, 0.104), to3D(0.39, 0.086)],
    [to3D(0.39, 0.086), to3D(0.415, 0.078), to3D(0.426, 0.070), [LX, LY]],
  ];
  const topPts: Pt[] = [];
  topSegs.forEach((s, i) => {
    for (let k = i === 0 ? 0 : 1; k <= 28; k++) topPts.push(cubicPt(s[0], s[1], s[2], s[3], k / 28));
  });
  const botPts: Pt[] = [];
  botSegs.forEach((s, i) => {
    for (let k = i === 0 ? 0 : 1; k <= 28; k++) botPts.push(cubicPt(s[0], s[1], s[2], s[3], k / 28));
  });

  const evalTop = (x: number) => interpCurveY(topPts, x);
  const evalBot = (x: number) => interpCurveY(botPts, x);
  const evalHalfZ = (x: number) => {
    const u = clamp((x - -0.36) / (UX - -0.36), 0, 1);
    const arch = Math.sin(clamp(u, 0.02, 0.985) * Math.PI);
    return 0.015 + 0.095 * Math.pow(arch, 0.56) * (0.9 + 0.1 * u);
  };
  const mapWorldUV = (x: number, y: number): Pt => [clamp((x - -0.4) / 0.88, 0, 1), clamp((y - -0.18) / 0.34, 0, 1)];

  // 512x512 Orca Flank Markings: glossy black + pure white chin/throat + smooth rear flank saddle + upward white eye patch!
  const cv = document.createElement("canvas");
  cv.width = 512;
  cv.height = 512;
  const c = cv.getContext("2d")!;
  c.save();
  c.translate((0.4 / 0.88) * 512, (0.16 / 0.34) * 512);
  c.scale(512 / 0.88, 512 / 0.34);
  c.translate(0.0, 0.02);

  c.fillStyle = makeLin(c, 0.02, -0.11, 0.02, 0.11, [
    [0, BLK_HI],
    [0.34, "#161d28"],
    [0.78, BLK],
    [1, "#070a0f"],
  ]);
  c.fillRect(-0.45, -0.25, 0.95, 0.5);

  // Pure white chin & throat sweeping under pectoral flipper
  c.beginPath();
  c.moveTo(0.436, 0.044);
  c.quadraticCurveTo(0.372, 0.056, 0.32, 0.044);
  c.quadraticCurveTo(0.28, 0.044, HX, 0.048);
  c.bezierCurveTo(0.238, 0.046, 0.215, 0.068, 0.185, 0.075);
  c.bezierCurveTo(0.155, 0.088, 0.115, 0.105, 0.06, 0.115);
  c.lineTo(0.48, 0.26);
  c.closePath();
  c.fillStyle = makeLin(c, 0.32, 0.04, 0.32, 0.12, [
    [0, WH],
    [0.8, WH],
    [1, "#e6ecf4"],
  ]);
  c.fill();

  // Broad rear-flank white saddle patch
  c.beginPath();
  c.moveTo(-0.045, 0.14);
  c.bezierCurveTo(-0.065, 0.068, -0.105, 0.018, -0.175, 0.014);
  c.bezierCurveTo(-0.228, 0.01, -0.268, 0.028, -0.278, 0.055);
  c.lineTo(-0.285, 0.14);
  c.closePath();
  c.fillStyle = makeLin(c, -0.16, 0.015, -0.16, 0.095, [
    [0, WH],
    [0.82, "#f4f7fb"],
    [1, "#dde6f0"],
  ]);
  c.fill();

  // Pure-white upward-tilted streamlined eye patch
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

  // Sheen highlight along melon head & muscular back
  drawGlow(c, 0.34, -0.022, 0.085, 0.024, 0.18, "215,235,255", 0.28);
  c.restore();

  const albedo = track(new THREE.CanvasTexture(cv));
  albedo.colorSpace = THREE.SRGBColorSpace;
  albedo.anisotropy = maxAnisotropy;
  albedo.needsUpdate = true;

  const { root, pitchGroup, yawGroup, bodyGroup } = baseGroups();

  // Unified body [-0.36 .. UX]
  const evalUnifiedBot = blendBotToPalate(evalBot, () => HY - 0.002, HX, 0.032, 0.014);
  const evalMidY = (x: number) => (evalTop(x) + evalUnifiedBot(x)) * 0.5;

  const bodyGeo = track(
    buildLoftedSurface({
      xStart: -0.36,
      xEnd: UX,
      uSteps: 56,
      vSteps: 30,
      evalTopY: evalTop,
      evalBotY: evalUnifiedBot,
      evalHalfZ,
      mapUV: mapWorldUV,
      roundFront: true,
      taper: (s) => 1 - 0.14 * s * s,
    })
  );
  const bMat = makeFishMat(albedo, { emissiveIntensity: 0.28, clearcoat: 0.55 });
  injectSpineShader(bMat, uniforms);
  bodyGroup.add(new THREE.Mesh(bodyGeo, bMat));
  const orcaBodyMask = bodySpineOutlineMask(evalMidY, [{ x0: -0.078, x1: 0.072, top: true }], 0.028);
  bodyGroup.add(new THREE.Mesh(track(buildOutlineGeometry(bodyGeo, 0.0042, orcaBodyMask)), makeOutlineMat()));

  const upperJawGroup = new THREE.Group();
  upperJawGroup.position.set(HX, HY, 0);
  bodyGroup.add(upperJawGroup);

  const lowerJawGroup = new THREE.Group();
  lowerJawGroup.position.set(HX, HY, 0);
  bodyGroup.add(lowerJawGroup);
  const lGeo = track(
    buildLoftedSurface({
      xStart: HX - 0.022,
      xEnd: LX,
      uSteps: 18,
      vSteps: 22,
      evalTopY: () => HY - 0.002,
      evalBotY: evalBot,
      evalHalfZ,
      mapUV: mapWorldUV,
      localOffsetX: HX,
      localOffsetY: HY,
      roundFront: true,
      rearInsetAt: (x) => (x < HX ? 0.78 + 0.2 * clamp((x - (HX - 0.022)) / 0.022, 0, 1) : 1),
    })
  );
  const lMat = makeFishMat(albedo, { emissiveIntensity: 0.3, clearcoat: 0.55 });
  injectSpineShader(lMat, uniforms, HX, HY);
  lowerJawGroup.add(new THREE.Mesh(lGeo, lMat));
  lowerJawGroup.add(
    new THREE.Mesh(track(buildOutlineGeometry(lGeo, 0.004, jawOutlineMask(0.008, 0.044))), makeOutlineMat(HX, HY))
  );

  // Rose-pink gums, pink tongue & 3D white peg teeth!
  const { mouthInterior, tongueMesh } = createOralParts(
    ctx,
    bodyGroup,
    lowerJawGroup,
    HX,
    HY,
    "#5c1222",
    "#e67c96",
    [0.068, 0.036, 0.044],
    [0.058, 0.014, 0.032],
    0.072
  );
  const pegMat = track(
    new THREE.MeshPhysicalMaterial({
      color: "#fffdfd",
      emissive: "#ffffff",
      emissiveIntensity: 0.3,
      roughness: 0.15,
    })
  );
  const pegGeo = track(new THREE.ConeGeometry(0.0042, 0.012, 8));
  const upperTeeth = new THREE.Group();
  bodyGroup.add(upperTeeth);
  const lowerTeeth = new THREE.Group();
  lowerJawGroup.add(lowerTeeth);
  for (let i = 1; i <= 7; i++) {
    const f = i / 8;
    const x = 0.02 + f * 0.118;
    const zPos = evalHalfZ(HX + x) * 0.68;
    for (const side of [1, -1]) {
      const ut = new THREE.Mesh(pegGeo, pegMat);
      ut.position.set(HX + x, HY - 0.002, side * zPos);
      ut.rotation.x = Math.PI;
      upperTeeth.add(ut);

      const lt = new THREE.Mesh(pegGeo, pegMat);
      lt.position.set(x, 0.002, side * zPos);
      lowerTeeth.add(lt);
    }
  }

  // Tall swept falcate dorsal fin (base embedded deeper inside back so no horizon gap)
  const dorsalShape = new THREE.Shape();
  dorsalShape.moveTo(0.072, 0.042);
  dorsalShape.bezierCurveTo(0.032, 0.125, -0.015, 0.195, -0.065, 0.232);
  dorsalShape.quadraticCurveTo(-0.084, 0.238, -0.078, 0.216);
  dorsalShape.bezierCurveTo(-0.038, 0.165, -0.038, 0.108, -0.062, 0.042);
  dorsalShape.closePath();
  const { geo: dorsalGeo } = createExtrudedFin(dorsalShape, 0.008, 0.002, 16);
  track(dorsalGeo);
  const blackFinMat = track(
    new THREE.MeshPhysicalMaterial({
      color: "#151a24",
      emissive: BLK_HI,
      emissiveIntensity: 0.12,
      roughness: 0.78,
      clearcoat: 0.05,
      envMapIntensity: 0.08,
    })
  );
  injectSpineShader(blackFinMat, uniforms);
  bodyGroup.add(new THREE.Mesh(dorsalGeo, blackFinMat));
  bodyGroup.add(
    new THREE.Mesh(track(buildOutlineGeometry(dorsalGeo, 0.0032, finRootMaskY(0.068, 0.034, true))), makeOutlineMat())
  );

  // TRUE HORIZONTAL 3D TAIL FLUKE (in XZ plane, pitched up & down!)
  const flukeShape = new THREE.Shape();
  flukeShape.moveTo(0.014, 0.018);
  flukeShape.quadraticCurveTo(-0.04, 0.085, -0.125, 0.138);
  flukeShape.bezierCurveTo(-0.105, 0.072, -0.078, 0.025, -0.068, 0.006);
  flukeShape.lineTo(-0.054, 0);
  flukeShape.lineTo(-0.068, -0.006);
  flukeShape.bezierCurveTo(-0.078, -0.025, -0.105, -0.072, -0.125, -0.138);
  flukeShape.quadraticCurveTo(-0.04, -0.085, 0.014, -0.018);
  flukeShape.closePath();
  const { geo: flukeGeo } = createExtrudedFin(flukeShape, 0.006, 0.0018, 16);
  flukeGeo.rotateX(Math.PI * 0.5); // orient symmetrically horizontal in XZ!
  track(flukeGeo);
  const flukeMat = track(
    new THREE.MeshPhysicalMaterial({
      color: "#161d28",
      emissive: BLK_HI,
      emissiveIntensity: 0.12,
      roughness: 0.78,
      clearcoat: 0.05,
      envMapIntensity: 0.08,
    })
  );
  const tailPivot = new THREE.Group();
  tailPivot.position.set(-0.355, -0.052, 0);
  bodyGroup.add(tailPivot);
  tailPivot.add(new THREE.Mesh(flukeGeo, flukeMat));
  tailPivot.add(new THREE.Mesh(track(buildOutlineGeometry(flukeGeo, 0.0028)), makeOutlineMat(0, 0, false)));

  // Broad Paddle Pectoral Flippers (left & right curving outward & down)
  const flipShape = new THREE.Shape();
  flipShape.moveTo(0.024, 0.016);
  flipShape.bezierCurveTo(-0.012, 0.046, -0.105, 0.036, -0.138, -0.006);
  flipShape.bezierCurveTo(-0.145, -0.038, -0.072, -0.056, 0.02, -0.022);
  flipShape.closePath();
  const { geo: flipGeo } = createExtrudedFin(flipShape, 0.006, 0.0015, 14);
  track(flipGeo);

  const pecZ = surfaceZAt(evalTop, evalBot, evalHalfZ, 0.185, -0.092, 0.22, 1.0) + 0.006;
  const pecLeft = new THREE.Group();
  pecLeft.position.set(0.185, -0.092, pecZ);
  pecLeft.rotation.set(-0.22, 0.34, 0.55);
  pecLeft.add(new THREE.Mesh(flipGeo, flukeMat));

  const pecRight = new THREE.Group();
  pecRight.position.set(0.185, -0.092, -pecZ);
  pecRight.rotation.set(0.22, -0.34, 0.55);
  pecRight.add(new THREE.Mesh(flipGeo, flukeMat));
  bodyGroup.add(pecLeft, pecRight);

  const pelvicFin = new THREE.Group();

  const { eyesNormal, eyesPupil, eyesHappy } = createEyePair(ctx, bodyGroup, {
    ex: 0.326,
    ey: -0.042,
    ez: surfaceZAt(evalTop, evalBot, evalHalfZ, 0.326, -0.042),
    er: 0.016,
    irisColor: pal.iris || "#2b6cb0",
    rimColor: "#030508",
    happyColor: "#ffffff",
    orcaDotOnly: true,
  });

  const { biteRing, biteRingMat } = createBiteRing(ctx, bodyGroup, UX + 0.022, HY, "#e0f2fe", 0.068);

  return {
    speciesKey: sp.id,
    tailPivotX: -0.355,
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
      const tightClamp = p.jaw < 0 ? clamp(-p.jaw, 0, 0.4) : 0;
      lowerJawGroup.rotation.z = -open * 0.46 + tightClamp * 0.1;
      upperTeeth.visible = open > 0.05;
      lowerTeeth.visible = open > 0.05;
      const hasMouth = open > 0.03;
      mouthInterior.visible = hasMouth;
      if (hasMouth) {
        mouthInterior.scale.set(0.85 + open * 0.25, 0.32 + open * 0.95, 0.8 + open * 0.2);
      }
      tongueMesh.visible = open > 0.04;
      // Vertical whale fluke pump!
      tailPivot.rotation.y = 0;
      tailPivot.rotation.z = Math.sin(p.tailPh) * (0.28 + p.swimSpeed * 0.18);
      pecLeft.rotation.y = 0.34 + Math.sin(p.wag2) * 0.12;
      pecLeft.rotation.z = 0.55 + Math.sin(p.wag2) * 0.1;
      pecRight.rotation.y = -0.34 - Math.sin(p.wag2 + 0.4) * 0.12;
      pecRight.rotation.z = 0.55 + Math.sin(p.wag2 + 0.4) * 0.1;
    },
    dispose: () => {
      for (const d of ctx.disposables) d.dispose();
    },
  };
}

// =====================================================================================
// 6. ALLIGATOR SNAP (Gator & Alba — 1.2x Spiked Shell, 4 Ragdoll Clawed Limbs, Hooked Beak)
// =====================================================================================
function buildPyramidalScuteGeo(len: number, wid: number, height: number): THREE.BufferGeometry {
  // Swept-back 3D leaf-pyramid scute pointing along +X with dorsal keel ridge +Y
  const hw = wid * 0.5;
  const verts = new Float32Array([
    0, 0, -hw * 0.82,          // 0: rear-right base
    0, 0, hw * 0.82,           // 1: rear-left base
    len * 0.42, 0, -hw,        // 2: mid-right widest
    len * 0.42, 0, hw,         // 3: mid-left widest
    len * 0.48, height, 0,     // 4: raised keel crest
    len, height * 0.32, 0,     // 5: swept sharp tip
    0, height * 0.45, 0,       // 6: front root crest
  ]);
  const indices = [
    // Right slope
    0, 6, 4,
    0, 4, 2,
    2, 4, 5,
    // Left slope
    6, 1, 4,
    1, 3, 4,
    3, 5, 4,
    // Bottom cap
    0, 2, 1,
    1, 2, 3,
    2, 5, 3,
    // Front root close
    0, 1, 6,
  ];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(verts, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function createSnapturtle3DRig(sp: Species, maxAnisotropy: number): Fish3DRig {
  const pal = sp.pal;
  const SKIN = pal.body || "#727b45";
  const DK = pal.dark || "#3b4222";
  const BELLY = pal.belly || "#a3a168";
  const SHELL = pal.stripe || "#9b984c";
  const HORN = pal.tail || "#2e2920";
  const TONGUE = pal.spot || "#eb6b6b";
  const OL = pal.outline || "#191c0e";
  const isAlbino = sp.id.includes("albino") || SKIN.toLowerCase().startsWith("#fff");

  const ctx = createRigContext(OL, "#646464");
  const { track, uniforms, makeOutlineMat, makeFishMat } = ctx;

  // Compact chunky snapping head tucked closely to carapace front (0.165 .. 0.396)
  // Using +Y up: HY = -0.024
  const HX = 0.275;
  const HY = -0.024;
  const UX = 0.396;

  // Shell Texture & Skin Texture
  const makeShellTex = () => {
    const cv = document.createElement("canvas");
    cv.width = 256;
    cv.height = 256;
    const c = cv.getContext("2d")!;
    c.fillStyle = makeLin(c, 0, 0, 256, 256, [
      [0, mixHex(SHELL, DK, 0.25)],
      [0.5, SHELL],
      [1, mixHex(SHELL, isAlbino ? "#f7aab5" : "#7d4b4a", 0.36)],
    ]);
    c.fillRect(0, 0, 256, 256);
    c.strokeStyle = rgbaHex(DK, 0.45);
    c.lineWidth = 4;
    for (let y = 32; y < 256; y += 44) {
      c.beginPath();
      c.moveTo(0, y);
      c.quadraticCurveTo(128, y - 14, 256, y);
      c.stroke();
    }
    const tex = track(new THREE.CanvasTexture(cv));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = maxAnisotropy;
    return tex;
  };

  const makePlastronTex = () => {
    const cv = document.createElement("canvas");
    cv.width = 256;
    cv.height = 128;
    const c = cv.getContext("2d")!;
    c.fillStyle = makeLin(c, 0, 0, 0, 128, [
      [0, SKIN],
      [0.5, BELLY],
      [1, mixHex(BELLY, DK, 0.25)],
    ]);
    c.fillRect(0, 0, 256, 128);
    c.strokeStyle = rgbaHex(DK, 0.55);
    c.lineWidth = 4;
    for (let x = 36; x < 240; x += 42) {
      c.beginPath();
      c.moveTo(x, 12);
      c.quadraticCurveTo(x - 6, 64, x + 4, 116);
      c.stroke();
    }
    const tex = track(new THREE.CanvasTexture(cv));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = maxAnisotropy;
    return tex;
  };

  const makeHeadTex = () => {
    const cv = document.createElement("canvas");
    cv.width = 256;
    cv.height = 256;
    const c = cv.getContext("2d")!;
    c.fillStyle = makeLin(c, 0, 20, 0, 236, [
      [0, mixHex(SKIN, SHELL, 0.22)],
      [0.56, SKIN],
      [1, mixHex(BELLY, SKIN, 0.42)],
    ]);
    c.fillRect(0, 0, 256, 256);
    // Throat skin rolls & subtle cheek ticks
    c.strokeStyle = rgbaHex(DK, 0.55);
    c.lineWidth = 4.5;
    c.lineCap = "round";
    c.beginPath();
    c.moveTo(48, 175);
    c.quadraticCurveTo(55, 205, 74, 224);
    c.moveTo(82, 185);
    c.quadraticCurveTo(92, 208, 112, 222);
    c.stroke();
    // Nostril
    c.fillStyle = isAlbino ? mixHex(DK, OL, 0.45) : mixHex(DK, "#121509", 0.55);
    drawBlob(c, 220, 102, 7, 5, -0.35);
    const tex = track(new THREE.CanvasTexture(cv));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = maxAnisotropy;
    return tex;
  };

  const shellTex = makeShellTex();
  const plastronTex = makePlastronTex();
  const headTex = makeHeadTex();

  const skinMat = track(
    new THREE.MeshPhysicalMaterial({
      color: SKIN,
      emissive: SKIN,
      emissiveIntensity: isAlbino ? 0.26 : 0.2,
      roughness: 0.42,
      clearcoat: 0.22,
    })
  );
  const darkSkinMat = track(
    new THREE.MeshPhysicalMaterial({
      color: isAlbino ? mixHex(DK, BELLY, 0.28) : DK,
      emissive: isAlbino ? DK : "#000000",
      emissiveIntensity: isAlbino ? 0.2 : 0.08,
      roughness: 0.48,
    })
  );
  const shellMat = makeFishMat(shellTex, { emissiveIntensity: isAlbino ? 0.28 : 0.22, clearcoat: 0.25 });
  const hornMat = track(
    new THREE.MeshPhysicalMaterial({
      color: HORN,
      emissive: isAlbino ? BELLY : "#141008",
      emissiveIntensity: 0.2,
      roughness: 0.35,
      clearcoat: 0.38,
    })
  );
  const clawMat = track(
    new THREE.MeshPhysicalMaterial({
      color: isAlbino ? "#f4b4b0" : "#1c1812",
      emissive: isAlbino ? "#e89896" : "#000000",
      emissiveIntensity: isAlbino ? 0.22 : 0,
      roughness: 0.28,
      clearcoat: 0.5,
    })
  );
  const olStaticMat = makeOutlineMat(0, 0, false);

  const { root, pitchGroup, yawGroup, bodyGroup } = baseGroups();

  // ---- 1. Plastron / Underbelly Base (-0.185 .. +0.20) ----
  const bellyGeo = track(
    buildLoftedSurface({
      xStart: -0.185,
      xEnd: 0.195,
      uSteps: 22,
      vSteps: 20,
      evalTopY: () => 0.008,
      evalBotY: (x) => -0.056 - (1 - Math.pow(x / 0.195, 2)) * 0.022,
      evalHalfZ: (x) => 0.058 + (1 - Math.pow(x / 0.21, 2)) * 0.068,
      mapUV: (x, y) => [clamp((x + 0.19) / 0.39, 0, 1), clamp((y + 0.08) / 0.1, 0, 1)],
    })
  );
  bodyGroup.add(new THREE.Mesh(bellyGeo, makeFishMat(plastronTex, { emissiveIntensity: 0.22 })));
  bodyGroup.add(new THREE.Mesh(track(buildOutlineGeometry(bellyGeo, 0.004)), olStaticMat));

  // ---- 2. 1.2x Domed Carapace + 3D Spiked Scutes + Horn Collar ----
  const shellGroup = new THREE.Group();
  shellGroup.position.set(-0.005, -0.024, 0);
  shellGroup.scale.set(1.2, 1.2, 1.2);
  bodyGroup.add(shellGroup);

  const domeGeo = track(
    buildLoftedSurface({
      xStart: -0.175,
      xEnd: 0.165,
      uSteps: 24,
      vSteps: 22,
      evalTopY: (x) => {
        const u = clamp((x - -0.175) / (0.165 - -0.175), 0, 1);
        return 0.015 + Math.sin(u * Math.PI) * 0.095;
      },
      evalBotY: () => -0.018,
      evalHalfZ: (x) => {
        const u = clamp((x - -0.175) / (0.165 - -0.175), 0, 1);
        return 0.048 + Math.sin(clamp(u, 0.04, 0.96) * Math.PI) * 0.082;
      },
      mapUV: (x, y) => [clamp((x + 0.18) / 0.35, 0, 1), clamp((y + 0.02) / 0.14, 0, 1)],
      taper: (s) => (s > 0 ? 1 - 0.16 * s : 1),
    })
  );
  shellGroup.add(new THREE.Mesh(domeGeo, hornMat));
  shellGroup.add(new THREE.Mesh(track(buildOutlineGeometry(domeGeo, 0.0038)), olStaticMat));

  const scuteBaseGeo = track(buildPyramidalScuteGeo(0.088, 0.054, 0.036));
  const scuteOutlineGeo = track(buildOutlineGeometry(scuteBaseGeo, 0.0028));
  const addScute = (x: number, y: number, z: number, rz: number, rx: number, ry: number, scale: number, mat: THREE.Material) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.set(rx, ry, rz);
    g.scale.setScalar(scale);
    g.add(new THREE.Mesh(scuteBaseGeo, mat));
    g.add(new THREE.Mesh(scuteOutlineGeo, olStaticMat));
    shellGroup.add(g);
  };

  // Dorsal Center Crest (5 prominent swept-back spiked scutes)
  for (const [sx, sy, rz, sc] of [
    [0.125, 0.056, 2.35, 0.92],
    [0.072, 0.086, 2.46, 1.04],
    [0.012, 0.098, 2.58, 1.08],
    [-0.048, 0.092, 2.7, 1.0],
    [-0.105, 0.072, 2.82, 0.85],
  ]) {
    addScute(sx, sy, 0, rz, 0, 0, sc, shellMat);
  }
  // Left (+Z) & Right (-Z) Lateral + Lower Costal Rows (staggered)
  for (const side of [1, -1]) {
    for (const [sx, sy, sz, rz, sc] of [
      [0.125, 0.032, 0.056, 2.42, 0.84],
      [0.068, 0.052, 0.068, 2.52, 0.94],
      [0.005, 0.06, 0.074, 2.62, 0.98],
      [-0.058, 0.054, 0.068, 2.72, 0.9],
      [-0.112, 0.038, 0.054, 2.82, 0.78],
      // Costal row
      [0.082, 0.008, 0.102, 2.62, 0.76],
      [0.018, 0.014, 0.112, 2.7, 0.82],
      [-0.048, 0.012, 0.104, 2.78, 0.78],
      [-0.104, 0.004, 0.086, 2.88, 0.68],
    ]) {
      addScute(sx, sy, side * sz, rz, side * 0.42, -side * 0.22, sc, shellMat);
    }
    // Glossy Marginal Skirt Plates + Front Shoulder Collar Spikes
    for (const [mx, my, mz, rz, sc] of [
      [-0.115, -0.012, 0.095, -2.95, 0.72],
      [-0.062, -0.018, 0.11, -2.88, 0.74],
      [-0.008, -0.02, 0.116, -2.82, 0.74],
      [0.045, -0.018, 0.112, -2.74, 0.72],
      [0.095, -0.014, 0.1, -2.62, 0.7],
      // Collar horns
      [0.155, 0.038, 0.068, 2.38, 0.56],
      [0.156, 0.018, 0.082, 2.72, 0.66],
      [0.148, -0.002, 0.088, -2.58, 0.68],
      [0.14, -0.018, 0.086, -2.36, 0.64],
    ]) {
      addScute(mx, my, side * mz, rz, side * 0.55, -side * 0.18, sc, hornMat);
    }
  }

  // ---- 3. Compact Chunky Snapping Head & Hooked Beak (tucked cleanly at 0.165..0.396!) ----
  const headGroup = new THREE.Group();
  headGroup.position.set(0.168, -0.01, 0);
  bodyGroup.add(headGroup);

  const hxL = HX - 0.168;
  const hyL = HY - -0.01;
  // Upper Skull & Hooked Snapping Beak (world X: 0.162 .. 0.396)
  const skullTopPts: Pt[] = [
    [0.162, 0.042],
    [0.195, 0.062],
    [0.23, 0.068],
    [0.275, 0.064],
    [0.325, 0.056],
    [0.368, 0.044],
    [0.386, 0.024],
    [0.394, 0.006],
    [0.396, -0.008],
  ];
  const skullSeamY = (x: number): number => {
    if (x > 0.355) {
      const k = clamp((x - 0.355) / (UX - 0.355), 0, 1);
      return -0.014 - Math.sin(k * Math.PI * 0.7) * 0.010 - k * 0.010;
    }
    const u = clamp((x - HX) / (0.355 - HX), 0, 1);
    return HY + (-0.014 - HY) * Math.pow(u, 0.8);
  };
  const headHalfZ = (x: number) => {
    const u = clamp((x - 0.16) / (UX - 0.16), 0, 1);
    const arch = Math.sin(clamp(u, 0.04, 0.96) * Math.PI * 0.92 + 0.12);
    return 0.024 + 0.066 * arch * (1 - 0.32 * u);
  };
  const skullGeo = track(
    buildLoftedSurface({
      xStart: 0.162,
      xEnd: UX,
      uSteps: 26,
      vSteps: 24,
      evalTopY: (x) => interpCurveY(skullTopPts, x),
      evalBotY: (x) => (x < HX ? -0.058 : skullSeamY(x)),
      evalHalfZ: headHalfZ,
      mapUV: (x, y) => [clamp((x - 0.16) / 0.24, 0, 1), clamp((y + 0.07) / 0.145, 0, 1)],
      localOffsetX: 0.168,
      localOffsetY: -0.01,
      roundFront: true,
    })
  );
  headGroup.add(new THREE.Mesh(skullGeo, makeFishMat(headTex, { emissiveIntensity: isAlbino ? 0.28 : 0.2 })));
  headGroup.add(new THREE.Mesh(track(buildOutlineGeometry(skullGeo, 0.0042, (x) => smoothstep(0.002, 0.036, x))), olStaticMat));

  // Hinged Lower Jaw + Worm Tongue
  const lowerJawGroup = new THREE.Group();
  lowerJawGroup.position.set(hxL, hyL, 0);
  headGroup.add(lowerJawGroup);

  const lBotPts: Pt[] = [
    [HX - 0.02, -0.064],
    [0.325, -0.056],
    [0.362, -0.048],
    [0.376, -0.038],
  ];
  const lowerGeo = track(
    buildLoftedSurface({
      xStart: HX - 0.02,
      xEnd: 0.376,
      uSteps: 18,
      vSteps: 20,
      evalTopY: () => HY + 0.004,
      evalBotY: (x) => interpCurveY(lBotPts, x),
      evalHalfZ: (x) => headHalfZ(x) * 0.9,
      mapUV: (x, y) => [clamp((x - 0.16) / 0.24, 0, 1), clamp((y + 0.07) / 0.145, 0, 1)],
      localOffsetX: HX,
      localOffsetY: HY,
      roundFront: true,
      rearInsetAt: (x) => (x < HX ? 0.78 + 0.2 * clamp((x - (HX - 0.02)) / 0.02, 0, 1) : 1),
    })
  );
  lowerJawGroup.add(new THREE.Mesh(lowerGeo, makeFishMat(headTex, { emissiveIntensity: isAlbino ? 0.28 : 0.2 })));
  lowerJawGroup.add(
    new THREE.Mesh(track(buildOutlineGeometry(lowerGeo, 0.0038, jawOutlineMask(0.008, 0.04))), olStaticMat)
  );

  // Worm Tongue (wriggling coral-pink snapping turtle bait tongue!)
  const { mouthInterior, tongueMesh } = createOralParts(
    ctx,
    headGroup,
    lowerJawGroup,
    hxL,
    hyL,
    "#4d121e",
    TONGUE,
    [0.044, 0.028, 0.032],
    [0.034, 0.01, 0.013],
    0.046
  );

  // Expressive Eyes on Compact Head
  const { eyesNormal, eyesPupil, eyesHappy } = createEyePair(ctx, headGroup, {
    ex: 0.295 - 0.168,
    ey: 0.024 - -0.01,
    ez: headHalfZ(0.295) * 0.94,
    er: 0.03,
    sx: 0.92,
    sy: 1.0,
    irisColor: pal.iris || "#2085e2",
    rimColor: OL,
    happyColor: OL,
  });

  // Dummy upperJawGroup (headGroup pitches slightly instead on turtle strike!)
  const upperJawGroup = new THREE.Group();

  // ---- 4. Spiky Shingled Alligator Tail ----
  const tailPivot = new THREE.Group();
  tailPivot.position.set(-0.188, -0.018, 0);
  bodyGroup.add(tailPivot);

  const tailBodyGeo = track(
    buildLoftedSurface({
      xStart: -0.275,
      xEnd: 0.02,
      uSteps: 20,
      vSteps: 14,
      evalTopY: (x) => 0.028 * clamp((x - -0.275) / 0.295, 0.1, 1),
      evalBotY: (x) => -0.032 * clamp((x - -0.275) / 0.295, 0.1, 1),
      evalHalfZ: (x) => 0.036 * clamp((x - -0.275) / 0.295, 0.08, 1),
      mapUV: (x, y) => [clamp((x + 0.28) / 0.3, 0, 1), clamp((y + 0.04) / 0.08, 0, 1)],
      capFront: true,
      capBack: true,
    })
  );
  const tMat = makeFishMat(plastronTex, { emissiveIntensity: 0.18 });
  tailPivot.add(new THREE.Mesh(tailBodyGeo, tMat));
  tailPivot.add(new THREE.Mesh(track(buildOutlineGeometry(tailBodyGeo, 0.0032)), olStaticMat));

  // Dorsal & Lateral Tail Spikes
  const tailScuteGeo = track(buildPyramidalScuteGeo(0.045, 0.022, 0.024));
  const tailScuteOl = track(buildOutlineGeometry(tailScuteGeo, 0.002));
  for (let i = 0; i < 5; i++) {
    const f = i / 4;
    const tx = -0.022 - f * 0.185;
    const sc = 1 - f * 0.42;
    // Top dorsal ridge
    const ts = new THREE.Group();
    ts.position.set(tx, 0.022 * (1 - f * 0.5), 0);
    ts.rotation.z = 2.68;
    ts.scale.setScalar(sc);
    ts.add(new THREE.Mesh(tailScuteGeo, shellMat), new THREE.Mesh(tailScuteOl, olStaticMat));
    tailPivot.add(ts);
    // Left & right lateral ridge
    for (const side of [1, -1]) {
      const ls = new THREE.Group();
      ls.position.set(tx, -0.002, side * 0.026 * (1 - f * 0.55));
      ls.rotation.set(side * 0.85, 0, 2.95);
      ls.scale.setScalar(sc * 0.92);
      ls.add(new THREE.Mesh(tailScuteGeo, shellMat), new THREE.Mesh(tailScuteOl, olStaticMat));
      tailPivot.add(ls);
    }
  }

  // ---- 5. 4 Articulated 3D Ragdoll Doggy-Paddle Clawed Limbs (FL, FR, BL, BR) ----
  interface TurtleLimb {
    hip: THREE.Group;
    elbow: THREE.Group;
    wrist: THREE.Group;
    isFront: boolean;
    phaseOffset: number;
  }
  const limbList: TurtleLimb[] = [];

  const upperLimbGeo = track(new THREE.CapsuleGeometry(0.028, 0.032, 6, 12));
  upperLimbGeo.translate(0, -0.018, 0);
  const foreLimbGeo = track(new THREE.CapsuleGeometry(0.023, 0.028, 6, 12));
  foreLimbGeo.translate(0, -0.015, 0);
  const pawGeo = track(new THREE.SphereGeometry(0.027, 12, 10));
  pawGeo.scale(1.15, 0.72, 1.05);
  const clawGeo = track(new THREE.ConeGeometry(0.0055, 0.025, 6));
  clawGeo.rotateZ(-Math.PI * 0.45);
  clawGeo.translate(0.012, -0.004, 0);

  const buildTurtleLimb = (lx: number, ly: number, lz: number, phaseOffset: number, isFront: boolean, farSide: boolean) => {
    const lMat = farSide ? darkSkinMat : skinMat;
    const hip = new THREE.Group();
    hip.position.set(lx, ly, lz);
    bodyGroup.add(hip);

    const upper = new THREE.Mesh(upperLimbGeo, lMat);
    const upperOl = new THREE.Mesh(track(buildOutlineGeometry(upperLimbGeo, 0.003)), olStaticMat);
    hip.add(upper, upperOl);

    const elbow = new THREE.Group();
    elbow.position.set(0, -0.036, 0);
    hip.add(elbow);

    const fore = new THREE.Mesh(foreLimbGeo, lMat);
    const foreOl = new THREE.Mesh(track(buildOutlineGeometry(foreLimbGeo, 0.003)), olStaticMat);
    elbow.add(fore, foreOl);

    const wrist = new THREE.Group();
    wrist.position.set(0, -0.031, 0);
    elbow.add(wrist);

    const paw = new THREE.Mesh(pawGeo, lMat);
    const pawOl = new THREE.Mesh(track(buildOutlineGeometry(pawGeo, 0.0028)), olStaticMat);
    wrist.add(paw, pawOl);

    for (let ci = 0; ci < 4; ci++) {
      const zOff = ((ci - 1.5) / 1.5) * 0.017;
      const cm = new THREE.Mesh(clawGeo, clawMat);
      cm.position.set(0.018, -0.004, zOff);
      cm.rotation.y = -zOff * 6;
      wrist.add(cm);
    }

    limbList.push({ hip, elbow, wrist, isFront, phaseOffset });
  };

  // Near (+Z) and Far (-Z) diagonal doggy-paddle pairs!
  buildTurtleLimb(0.115, -0.032, 0.088, 0, true, false);
  buildTurtleLimb(0.115, -0.032, -0.088, Math.PI, true, true);
  buildTurtleLimb(-0.135, -0.03, 0.088, Math.PI * 0.92, false, false);
  buildTurtleLimb(-0.135, -0.03, -0.088, -Math.PI * 0.08, false, true);

  const pecLeft = new THREE.Group();
  const pecRight = new THREE.Group();
  const pelvicFin = new THREE.Group();

  const { biteRing, biteRingMat } = createBiteRing(ctx, bodyGroup, UX + 0.025, HY, isAlbino ? "#ffd1dc" : "#d8f8ff", 0.056);

  return {
    speciesKey: sp.id,
    tailPivotX: -0.188,
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
      // Snapping turtle skull lunge + recoil when mangap!
      headGroup.position.x = 0.168 + open * 0.022;
      headGroup.rotation.z = open * 0.065;
      lowerJawGroup.rotation.z = -open * 0.72 + tightClamp * 0.12;

      const hasMouth = open > 0.03;
      mouthInterior.visible = hasMouth;
      if (hasMouth) {
        mouthInterior.scale.set(0.85 + open * 0.25, 0.35 + open * 1.0, 0.8 + open * 0.2);
      }
      tongueMesh.visible = open > 0.03;
      if (open > 0.03) {
        tongueMesh.position.y = 0.002 + Math.sin(p.wag2 * 2.2) * 0.005;
        tongueMesh.rotation.z = Math.sin(p.wag2 * 2.2) * 0.18;
      }

      // 4 Ragdoll Doggy-Paddle / Sea-Otter Swim Limbs!
      const ph = p.tailPh;
      for (const limb of limbList) {
        const cyc = ph + limb.phaseOffset;
        const sinC = Math.sin(cyc);
        const cosC = Math.cos(cyc);
        // hip rotation.z = 0 points straight down (-Y); +rotZ = swing forward (+X), -rotZ = push backward (-X)
        if (limb.isFront) {
          const hipZ = 0.18 + 0.62 * cosC - 0.14 * sinC;
          const elbowZ = -0.25 + 0.48 * sinC + 0.18 * cosC;
          const wristZ = -0.22 + 0.2 * sinC;
          limb.hip.rotation.z = hipZ;
          limb.elbow.rotation.z = elbowZ;
          limb.wrist.rotation.z = wristZ;
        } else {
          // Hind legs naturally swept back beside tail & kick fluidly
          const hipZ = -0.56 + 0.48 * cosC - 0.1 * sinC;
          const elbowZ = -0.32 + 0.4 * sinC;
          const wristZ = -0.2 + 0.18 * sinC;
          limb.hip.rotation.z = hipZ;
          limb.elbow.rotation.z = elbowZ;
          limb.wrist.rotation.z = wristZ;
        }
      }
    },
    dispose: () => {
      for (const d of ctx.disposables) d.dispose();
    },
  };
}

// =====================================================================================
// UNIFIED RIG FACTORY & POSE DRIVER
// =====================================================================================
export function fish3DRigKey(sp: Species): string {
  const p = sp.pal;
  return `${sp.style}|${p.body}|${p.dark}|${p.belly}|${p.fin}|${p.tail || ""}|${p.stripe || ""}|${p.spot || ""}|${p.lure || ""}`;
}

export function createFish3DRig(sp: Species, maxAnisotropy = 4): Fish3DRig {
  const st = sp.style;
  if (st === "boris") {
    const borisRig = createBoris3DRig(maxAnisotropy);
    return {
      ...borisRig,
      speciesKey: sp.id,
      tailPivotX: -0.235,
    };
  }
  if (st === "andy") return createAndy3DRig(sp, maxAnisotropy);
  if (st === "clown") return createClown3DRig(sp, maxAnisotropy);
  if (st === "layla") return createLayla3DRig(sp, maxAnisotropy);
  if (st === "eddy") return createEddy3DRig(sp, maxAnisotropy);
  if (st === "orca") return createOrca3DRig(sp, maxAnisotropy);
  if (st === "snapturtle") return createSnapturtle3DRig(sp, maxAnisotropy);

  const reef = createReefFish3DRig(sp, maxAnisotropy);
  if (reef) return reef;
  const pelagic = createPelagicFish3DRig(sp, maxAnisotropy);
  if (pelagic) return pelagic;
  const rare = createRareFish3DRig(sp, maxAnisotropy);
  if (rare) return rare;

  const fallback = createBoris3DRig(maxAnisotropy);
  return { ...fallback, speciesKey: sp.id, tailPivotX: -0.235 };
}

export function applyFish3DPose(rig: Fish3DRig, p: Fish3DPose) {
  if (rig.tailPivotX === -0.235 && !rig.onCustomPose) {
    applyBoris3DPose(rig, p);
    return;
  }

  const open = clamp(p.jaw, 0, 1.15);
  const tightClamp = p.jaw < 0 ? clamp(-p.jaw, 0, 0.4) : 0;

  // 1. Real 3D Yaw Turn + Continuous Pitch inside yawGroup + Banking Roll + Bite Lunge
  const flipClamp = clamp(p.turnFlip, -1, 1);
  const turnAmt = Math.sin(Math.acos(flipClamp));
  const swimYaw = p.inspectYaw !== undefined ? 0 : Math.sin(p.tailPh) * 0.06 * (0.35 + p.swimSpeed * 0.65);
  rig.yawGroup.rotation.y = -Math.acos(flipClamp) + swimYaw + (p.inspectYaw ?? 0);
  rig.yawGroup.rotation.x = turnAmt * (0.16 + Math.sin(p.tilt) * 0.2);

  rig.pitchGroup.rotation.z = 0;
  rig.pitchGroup.rotation.x = p.inspectPitch ?? 0;
  rig.bodyGroup.rotation.z = -p.tilt;
  rig.bodyGroup.position.x = p.biteLunge * 0.011;
  rig.bodyGroup.scale.set(1 - p.sq * 0.24, 1 + p.sq * 0.3, 1);

  // 2. Spine S-Wave & Gulp / Squash Uniforms
  const swimAmp = rig.isFluke ? 0.012 + p.swimSpeed * 0.018 : 0.016 + p.swimSpeed * 0.032 + turnAmt * 0.048;
  rig.uniforms.uTailPh.value = p.tailPh;
  rig.uniforms.uSwimAmp.value = swimAmp;
  rig.uniforms.uBend.value = p.bend + turnAmt * 0.24;
  rig.uniforms.uGulpT.value = p.gulpT;
  rig.uniforms.uGulpK.value = p.gulpK;
  rig.uniforms.uSquash.value = p.sq;
  rig.uniforms.uPuff.value = (p.puff ? 1 : 0) + clamp(p.gulpT, 0, 1) * 0.45;

  // Keep tail rooted to undulating spine (unless horizontal fluke overrides in onCustomPose)
  rig.tailPivot.position.z = rig.isFluke ? 0 : evalSpineZAt(rig.tailPivotX, rig.uniforms);
  if (!rig.isFluke) {
    rig.tailPivot.rotation.y = -Math.sin(p.tailPh - 2.65) * (0.24 + p.swimSpeed * 0.2);
    rig.tailPivot.rotation.x = Math.cos(p.tailPh - 2.2) * 0.04;
  }

  // 3. Default Jaws / Interior + Optional Species-Specific Custom Kinematics
  if (rig.onCustomPose) {
    rig.onCustomPose(p, open, swimAmp);
  } else {
    rig.upperJawGroup.rotation.z = open * 0.25 - tightClamp * 0.1;
    rig.lowerJawGroup.rotation.z = -open * 0.78 + tightClamp * 0.14;
    const hasMouth = open > 0.03;
    rig.mouthInterior.visible = hasMouth;
    if (hasMouth) {
      rig.mouthInterior.scale.set(0.85 + open * 0.22, 0.35 + open * 0.95, 0.78 + open * 0.18);
    }
    rig.tongueMesh.visible = open > 0.045;
    rig.tongueMesh.position.y = 0.001 + open * 0.008;
  }

  // 4. Pectoral & Pelvic Flutter (for standard fin rigs)
  if (!rig.skipDefaultFins && !rig.isFluke) {
    const finFlutter = p.wag2 * (p.sucking ? 1.55 : 1.0);
    rig.pecLeft.rotation.y = 0.32 + Math.sin(finFlutter) * 0.16;
    rig.pecLeft.rotation.z = Math.cos(finFlutter) * 0.14;
    rig.pecRight.rotation.y = -0.32 - Math.sin(finFlutter + 0.7) * 0.16;
    rig.pecRight.rotation.z = Math.cos(finFlutter + 0.7) * 0.14;
    rig.pelvicFin.rotation.z = -Math.sin(finFlutter) * 0.1;
  }

  // 5. Eyes (Normal / Happy Crescent Bite / Panic)
  const isHappy = p.expr === "happy" || p.jaw <= -0.1;
  const isPanic = p.expr === "panic";
  for (let i = 0; i < rig.eyesNormal.length; i++) {
    rig.eyesNormal[i].visible = !isHappy;
    rig.eyesHappy[i].visible = isHappy;
    if (!isHappy) {
      const s = isPanic ? 1.12 : 1 + open * 0.05;
      rig.eyesNormal[i].scale.set(s, s, 1);
      if (rig.eyesPupil[i]) {
        rig.eyesPupil[i].scale.setScalar(isPanic ? 0.62 : 1);
      }
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
// POOLED MULTI-SPECIES OFFSCREEN 3D RENDERER SERVICE (Single WebGL Context + Snapshot Cache!)
// =====================================================================================
class Fish3DService {
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private rigs = new Map<string, Fish3DRig>();
  private activeRig: Fish3DRig | null = null;
  private keyLight: THREE.DirectionalLight | null = null;
  private hemiLight: THREE.HemisphereLight | null = null;
  private rimLight: THREE.DirectionalLight | null = null;
  private envRT: THREE.WebGLRenderTarget | null = null;
  private curW = 0;
  private curH = 0;
  private maxAniso = 1;
  private failed = false;

  // Frame-budgeted 3D sprite snapshot cache for FRY shoals & small/distant fish
  private snapCache = new Map<string, { cv: HTMLCanvasElement; used: number }>();
  private frameSeq = 0;
  private bakeBudget = 3;

  beginFrame(budget = 3) {
    this.frameSeq++;
    this.bakeBudget = budget;
  }

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

      const hemi = new THREE.HemisphereLight(0xebfbff, 0x3b82d6, 1.08);
      const key = new THREE.DirectionalLight(0xffffff, 1.02);
      key.position.set(1.2, 2.2, 3.8);
      const rim = new THREE.DirectionalLight(0x67e8f9, 0.55);
      rim.position.set(-2.0, 0.9, -2.2);
      scene.add(hemi, key, rim);

      const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 10);
      camera.position.set(0, 0, 1.88);
      camera.lookAt(0, 0, 0);

      this.maxAniso = soft ? 1 : Math.min(4, renderer.capabilities.getMaxAnisotropy());
      this.renderer = renderer;
      this.scene = scene;
      this.camera = camera;
      this.keyLight = key;
      this.hemiLight = hemi;
      this.rimLight = rim;
      this.envRT = envRT;
    } catch {
      this.failed = true;
    }
  }

  private getOrCreateRig(sp: Species): Fish3DRig | null {
    if (!this.scene) return null;
    const key = fish3DRigKey(sp);
    let rig = this.rigs.get(key);
    if (!rig) {
      rig = createFish3DRig(sp, this.maxAniso);
      this.rigs.set(key, rig);
    }
    if (this.activeRig !== rig) {
      if (this.activeRig) this.scene.remove(this.activeRig.root);
      this.scene.add(rig.root);
      this.activeRig = rig;
    }
    return rig;
  }

  renderToCanvas(
    sp: Species,
    ctx: CanvasRenderingContext2D,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
    pose: Fish3DPose,
    targetPx = 200
  ): boolean {
    this.ensureInit();
    if (this.failed || !this.renderer || !this.scene || !this.camera) return false;
    const rig = this.getOrCreateRig(sp);
    if (!rig) return false;

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

    applyFish3DPose(rig, pose);
    this.renderer.render(this.scene, this.camera);
    ctx.drawImage(this.renderer.domElement, dx, dy, dw, dh);
    return true;
  }

  private evictSnapCacheIfNeeded() {
    if (this.snapCache.size < 1200) return;
    let oldestKey: string | null = null;
    let oldestUsed = Infinity;
    for (const [k, v] of this.snapCache) {
      if (v.used < oldestUsed) {
        oldestUsed = v.used;
        oldestKey = k;
      }
    }
    if (oldestKey) this.snapCache.delete(oldestKey);
  }

  renderCached3D(
    sp: Species,
    ctx: CanvasRenderingContext2D,
    worldSpan: number,
    pose: Fish3DPose,
    targetPx = 96,
    urgent = false
  ): boolean {
    this.ensureInit();
    if (this.failed || !this.renderer || !this.scene || !this.camera) return false;

    const rKey = fish3DRigKey(sp);
    const tierPx = targetPx <= 72 ? 84 : 132;
    const signFlip = pose.turnFlip < 0 ? -1 : 1;
    const absF = Math.abs(pose.turnFlip);
    const qFlip = absF > 0.87 ? 1.0 : absF > 0.58 ? 0.72 : 0.44;
    const tailNorm = ((pose.tailPh % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const tailBucket = Math.floor((tailNorm / (Math.PI * 2)) * 8) % 8;
    const jawBucket = pose.puff ? -1 : pose.jaw <= 0.04 ? 0 : pose.jaw < 0.45 ? 1 : pose.jaw < 0.82 ? 2 : 3;
    const expr = pose.expr || "normal";

    const fullKey = `${rKey}|${tierPx}|${qFlip}|${tailBucket}|${jawBucket}|${expr}`;
    let entry = this.snapCache.get(fullKey);

    if (!entry) {
      if (this.bakeBudget > 0 || urgent) {
        if (!urgent) this.bakeBudget--;
        this.evictSnapCacheIfNeeded();
        const cv = document.createElement("canvas");
        cv.width = tierPx;
        cv.height = tierPx;
        const c2 = cv.getContext("2d")!;
        const qPh = ((tailBucket + 0.5) / 8) * Math.PI * 2;
        const qJaw = jawBucket === -1 ? -0.18 : jawBucket === 0 ? 0 : jawBucket === 1 ? 0.35 : jawBucket === 2 ? 0.7 : 1.0;
        const ok = this.renderToCanvas(
          sp,
          c2,
          0,
          0,
          tierPx,
          tierPx,
          {
            ...pose,
            jaw: qJaw,
            tailPh: qPh,
            wag2: qPh,
            turnFlip: qFlip,
            tilt: 0,
            chompPhase: 0,
            depthFactor: 0.15,
          },
          tierPx
        );
        if (!ok) return false;
        entry = { cv, used: this.frameSeq };
        this.snapCache.set(fullKey, entry);
      } else {
        // Look up closest cached swim frame for this species & angle so 0 stalls occur
        for (let off = 1; off <= 7 && !entry; off++) {
          const b = (tailBucket + off) % 8;
          entry =
            this.snapCache.get(`${rKey}|${tierPx}|${qFlip}|${b}|${jawBucket}|${expr}`) ||
            this.snapCache.get(`${rKey}|${tierPx}|${qFlip}|${b}|0|normal`) ||
            this.snapCache.get(`${rKey}|${tierPx}|1|${b}|0|normal`);
        }
        if (!entry) {
          // Cold start for this tiny fish: bake neutral frame once so it always appears in 3D immediately
          this.evictSnapCacheIfNeeded();
          const cv = document.createElement("canvas");
          cv.width = tierPx;
          cv.height = tierPx;
          const c2 = cv.getContext("2d")!;
          const qPh = ((tailBucket + 0.5) / 8) * Math.PI * 2;
          const ok = this.renderToCanvas(
            sp,
            c2,
            0,
            0,
            tierPx,
            tierPx,
            {
              ...pose,
              jaw: 0,
              tailPh: qPh,
              wag2: qPh,
              turnFlip: qFlip,
              tilt: 0,
              chompPhase: 0,
              depthFactor: 0.15,
            },
            tierPx
          );
          if (!ok) return false;
          entry = { cv, used: this.frameSeq };
          this.snapCache.set(fullKey, entry);
        }
      }
    }

    entry.used = this.frameSeq;
    ctx.save();
    if (signFlip < 0) ctx.scale(-1, 1);
    if (pose.tilt) ctx.rotate(pose.tilt);
    ctx.drawImage(entry.cv, -worldSpan * 0.5, -worldSpan * 0.5, worldSpan, worldSpan);
    ctx.restore();
    return true;
  }

  private snapshotCamZ(sp: Species): number {
    if (sp.style === "orca" || sp.style === "whaleshark" || sp.style === "narwhal") return 1.56;
    if (sp.style === "eddy" || sp.style === "layla" || sp.style === "snapturtle" || sp.style === "seadragon") return 1.44;
    if (sp.style === "andy" || sp.style === "boris" || sp.style === "butterfly" || sp.style === "leon") return 1.38;
    return 1.32;
  }

  renderSnapshot(sp: Species, pose: Fish3DPose, outW = 160, outH = 96): HTMLCanvasElement {
    const out = document.createElement("canvas");
    out.width = outW;
    out.height = outH;
    const c = out.getContext("2d");
    if (!c) return out;

    this.ensureInit();
    if (this.failed || !this.renderer || !this.scene || !this.camera) return out;
    const rig = this.getOrCreateRig(sp);
    if (!rig) return out;

    const prevAspect = this.camera.aspect;
    const prevZ = this.camera.position.z;
    this.camera.aspect = outW / outH;
    this.camera.position.z = this.snapshotCamZ(sp);
    this.camera.updateProjectionMatrix();

    if (this.curW !== outW || this.curH !== outH) {
      this.curW = outW;
      this.curH = outH;
      this.renderer.setSize(outW, outH, false);
    }

    const d = clamp(pose.depthFactor ?? 0, 0, 1);
    if (this.keyLight && this.hemiLight && this.rimLight) {
      this.keyLight.intensity = 1.02 - d * 0.32;
      this.hemiLight.intensity = 1.08 - d * 0.24;
      this.rimLight.intensity = 0.55 + d * 0.45;
    }

    applyFish3DPose(rig, pose);
    this.renderer.render(this.scene, this.camera);
    c.drawImage(this.renderer.domElement, 0, 0, outW, outH);

    this.camera.aspect = prevAspect;
    this.camera.position.z = prevZ;
    this.camera.updateProjectionMatrix();
    return out;
  }

  dispose() {
    for (const r of this.rigs.values()) r.dispose();
    this.rigs.clear();
    this.snapCache.clear();
    this.activeRig = null;
    this.envRT?.dispose();
    this.renderer?.dispose();
    this.envRT = null;
    this.renderer = null;
    this.scene = null;
    this.camera = null;
  }
}

export const fish3d = new Fish3DService();

export function disposeFish3DShared() {
  fish3d.dispose();
}

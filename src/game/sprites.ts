import type { Species } from "./species";
import { isCustomStyle, customMouthOffset, renderCustomFish } from "./customFish";

export type EyeExpr = "normal" | "happy" | "panic";
// jawState: -1 = puffed chomp/chew! 0 = closed, 1..6 = smooth progressive hinged gape!
export type JawState = -1 | 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface Sprite {
  canvas: HTMLCanvasElement;
  w: number;
  h: number;
}

function hexRgb(h: string): [number, number, number] {
  const s = h.startsWith("#") ? h.slice(1) : h;
  const n = parseInt(s, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mixHex(a: string, b: string, t: number): string {
  const ca = hexRgb(a),
    cb = hexRgb(b);
  const r = Math.round(ca[0] + (cb[0] - ca[0]) * t);
  const g = Math.round(ca[1] + (cb[1] - ca[1]) * t);
  const bl = Math.round(ca[2] + (cb[2] - ca[2]) * t);
  return "#" + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1);
}

function rgbaHex(h: string, alpha: number): string {
  const [r, g, b] = hexRgb(h);
  return `rgba(${r},${g},${b},${alpha})`;
}

const TAIL_FRAMES = 8;
const cache = new Map<string, HTMLCanvasElement>();

const isDisc = (sp: Species) => sp.style === "andy" || sp.style === "boris" || sp.style === "layla" || sp.style === "tang" || sp.style === "idol";
const isLong = (sp: Species) => sp.style === "orca" || sp.style === "shark" || sp.style === "shark_sleek" || sp.style === "leopard" || sp.style === "barracuda" || sp.style === "sailfish";

export function fishMouthOffset(sp: Species, bodyLen: number): [number, number] {
  // hand-modelled fish report their own mouth position (sprite width = bodyLen * 1.4)
  if (isCustomStyle(sp.style)) return customMouthOffset(sp.style, bodyLen * 1.4);
  const rx = bodyLen * 0.41;
  const ry = rx * sp.hRatio * 1.05;
  const bx = bodyLen * 0.05;
  if (sp.style === "idol") return [bx + rx * 1.28, ry * 0.08];
  if (sp.style === "boris") return [bx + rx * 1.18, ry * 0.18];
  if (isDisc(sp)) return [bx + rx * 1.05, ry * 0.16];
  if (sp.style === "parrot") return [bx + rx * 1.15, ry * 0.2];
  if (sp.style === "barracuda") return [bx + rx * 1.08, ry * 0.2];
  if (sp.style === "sailfish") return [bx + rx * 1.04, ry * 0.22];
  if (isLong(sp)) return [bx + rx * 0.96, ry * 0.18];
  return [bx + rx * 0.96, ry * 0.16];
}

const CACHE_MAX = 3600;
let genBudget = 3;
/** number of fish sprites rasterised so far (diagnostics) */
export const spriteStats = { made: 0 };

/**
 * Call once per rendered frame. Caps how many NEW sprites may be rasterised during that frame, so a
 * burst of unseen fish / poses can never cause a hitch (they borrow a neighbouring frame meanwhile).
 */
/** how many new sprites may still be rasterised this frame */
export const spriteBudgetLeft = () => genBudget;

export function beginSpriteFrame(budget = 3) {
  genBudget = budget;
}

export function fishSprite(
  sp: Species,
  worldLen: number,
  jawState: JawState,
  tailPhase: number,
  key: string,
  pixelMode = false,
  expr: EyeExpr = "normal",
  urgent = false
): Sprite {
  const tf = (((Math.floor((tailPhase / (Math.PI * 2)) * TAIL_FRAMES) % TAIL_FRAMES) + TAIL_FRAMES) % TAIL_FRAMES);
  // sprite resolution tiers: school fry are tiny on screen, so they get a small (cheap & crisp) sprite
  const tierPx = pixelMode ? Math.max(26, Math.min(60, Math.round(worldLen * 1.45))) : worldLen < 13.5 ? 112 : worldLen < 26 ? 160 : 280;
  // tiny sprites quantize to 3 open steps while medium/hero fish get full 6-frame smooth momentum
  const qJaw: JawState = tierPx < 120 && jawState > 0 ? (Math.min(6, Math.max(2, Math.round(jawState / 2) * 2)) as JawState) : jawState;
  const base = key + "|" + tierPx + "|" + (pixelMode ? 1 : 0) + "|";
  const pose = qJaw + "|" + expr + "|";
  const ck = base + pose + tf;
  let cv = cache.get(ck);
  if (cv) {
    // least-recently-used bookkeeping: a sprite that is still on screen is never the one evicted
    cache.delete(ck);
    cache.set(ck, cv);
  } else {
    if (genBudget <= 0 && !urgent) {
      // out of budget this frame: borrow the nearest tail frame of the same pose, or else the neutral pose
      for (let d = 1; d < TAIL_FRAMES && !cv; d++) cv = cache.get(base + pose + ((tf + d) % TAIL_FRAMES));
      for (let d = 0; d < TAIL_FRAMES && !cv; d++) cv = cache.get(base + "0|normal|" + ((tf + d) % TAIL_FRAMES));
    }
    if (!cv) {
      genBudget--;
      spriteStats.made++;
      cv = renderFishCanvas(sp, tierPx, qJaw, tf, pixelMode, expr);
      cache.set(ck, cv);
      if (cache.size > CACHE_MAX) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) cache.delete(oldest);
      }
    }
  }
  const aspect = cv.height / cv.width;
  const drawW = worldLen * 1.4;
  return { canvas: cv, w: drawW, h: drawW * aspect };
}

// ============================================================================
// BODY SILHOUETTES — true-to-life profiles per species, same plush cartoon style
//   disc family  : angelfish (andy), butterflyfish (boris), queen triggerfish (layla)
//   fusiform     : anchovy, grouper, lionfish, John Dory, anglerfish, clownfish
//   torpedo      : great barracuda (pike jaw + underbite), orca (blunt melon head)
// ============================================================================
/**
 * True hinged jaw geometry shared by buildBodyPath and mouth interior/details so that
 * upper jaw and lower jaw ALWAYS match in length, arc, and alignment whether closed or wide open!
 */
function getJawGeometry(sp: Species, bx: number, rx: number, ry: number, jawState: JawState) {
  const st = sp.style;
  const disc = isDisc(sp);
  const longBody = isLong(sp);
  const open = jawState > 0 ? Math.min(1, jawState / 6) : 0;
  const puff = jawState === -1 ? 1 : 0;

  // Hinge anchor and closed mouth tip
  const hingeX = bx + rx * (st === "idol" ? 0.68 : st === "boris" ? 0.68 : st === "andy" ? 0.6 : st === "layla" ? 0.8 : disc ? 0.68 : st === "eddy" ? 0.42 : st === "peter" ? 0.48 : st === "clown" ? 0.68 : st === "parrot" ? 0.74 : st === "leon" ? 0.72 : longBody ? 0.48 : 0.56);
  const hingeY = ry * (st === "eddy" ? 0.28 : st === "idol" ? 0.06 : st === "layla" ? 0.18 : st === "peter" ? 0.34 : st === "clown" ? 0.14 : st === "leon" ? 0.34 : st === "parrot" ? 0.16 : st === "boris" ? 0.15 : 0.15);
  const closedTipX = bx + rx * (st === "idol" ? 1.48 : st === "boris" ? 1.24 : st === "andy" ? 1.16 : st === "layla" ? 1.14 : disc ? 1.12 : st === "parrot" ? 1.14 : st === "peter" ? 1.14 : st === "clown" ? 1.06 : st === "barracuda" ? 1.22 : st === "shark" ? 1.14 : st === "sailfish" ? 1.16 : st === "leon" ? 1.28 : st === "eddy" ? 1.04 : 1.08) + puff * rx * 0.03;
  const closedTipY = ry * (st === "eddy" ? -0.06 : st === "shark" ? 0.18 : st === "idol" ? 0.0 : st === "layla" ? 0.14 : st === "peter" ? 0.26 : st === "clown" ? 0.1 : st === "leon" ? 0.36 : st === "parrot" ? 0.14 : 0.12);

  const dx = closedTipX - hingeX;
  const dy = closedTipY - hingeY;
  const baseAng = Math.atan2(dy, dx);
  const jawLen = Math.hypot(dx, dy);

  const smallMouth = st === "layla" || st === "boris" || st === "idol" || st === "leon" || st === "clown";
  // Bruce (shark) always shows a toothy curved grin even at jawState === 0 (effectiveOpen >= 0.44)!
  const effectiveOpen = st === "shark" ? Math.max(open, puff ? 0.15 : 0.44) : open;
  const upAng = baseAng - effectiveOpen * (st === "eddy" ? 0.22 : st === "parrot" ? 0.32 : smallMouth ? 0.28 : st === "shark" ? 0.28 : 0.36);
  const dnAng = baseAng + effectiveOpen * (st === "eddy" ? 0.86 : st === "parrot" ? 0.88 : st === "barracuda" || st === "sailfish" ? 0.68 : st === "shark" ? 0.72 : smallMouth ? 0.68 : 0.78);

  // Andy, Ryan (andy), and Boris have an overhanging upper snout/lip ahead of the lower lip
  const overbite = st === "andy" || st === "boris";
  const upperLen = overbite ? jawLen * 1.1 : jawLen;
  const lowerLen = overbite ? jawLen * 0.7 : jawLen;

  const upperTipX = hingeX + Math.cos(upAng) * upperLen;
  const upperTipY = hingeY + Math.sin(upAng) * upperLen;
  const lowerTipX = hingeX + Math.cos(dnAng) * lowerLen;
  const lowerTipY = hingeY + Math.sin(dnAng) * lowerLen;

  return { open, puff, hingeX, hingeY, closedTipX, closedTipY, upperTipX, upperTipY, lowerTipX, lowerTipY, jawLen };
}

function buildBodyPath(ctx: CanvasRenderingContext2D, sp: Species, bx: number, rx: number, ry: number, jawState: JawState) {
  const st = sp.style;
  const jaw = getJawGeometry(sp, bx, rx, ry, jawState);
  const { open, puff, hingeX, hingeY, upperTipX, upperTipY, lowerTipX, lowerTipY } = jaw;
  ctx.beginPath();

  if (st === "idol") {
    // Image 5: Authentic Moorish Idol (Gill) — tall slender vertical crescent, sweeping forehead, thick rounded protruding white beak!
    const stemX = bx - rx * 0.54;
    const stemH = ry * 0.1;
    const peakX = bx - rx * 0.06;
    const peakY = -ry * 0.94;

    ctx.moveTo(stemX, -stemH);
    ctx.bezierCurveTo(bx - rx * 0.44, -ry * 0.4, peakX - rx * 0.16, peakY, peakX, peakY);
    // Steep forehead dipping smoothly into concave saddle above snout, then smooth rounded upper beak tip
    ctx.bezierCurveTo(bx + rx * 0.16, -ry * 0.68, bx + rx * 0.38, -ry * 0.22, bx + rx * 0.66, -ry * 0.12 - open * ry * 0.05);
    ctx.bezierCurveTo(bx + rx * 1.0, -ry * 0.19 - open * ry * 0.08, bx + rx * 1.36, upperTipY - ry * 0.11, upperTipX, upperTipY - ry * 0.01);

    if (open > 0) {
      ctx.quadraticCurveTo((upperTipX + hingeX) * 0.5, upperTipY + ry * 0.02, hingeX, hingeY);
      ctx.quadraticCurveTo((hingeX + lowerTipX) * 0.5, lowerTipY - ry * 0.02, lowerTipX, lowerTipY + ry * 0.04);
      ctx.bezierCurveTo(bx + rx * 0.98, lowerTipY + ry * 0.18, bx + rx * 0.52, ry * 0.32, bx + rx * 0.36, ry * 0.46);
      ctx.bezierCurveTo(bx + rx * 0.18, ry * 0.68, bx + rx * 0.02, ry * 0.88, peakX, ry * 0.92);
    } else {
      ctx.quadraticCurveTo(upperTipX + rx * 0.01, upperTipY + ry * 0.06, bx + rx * 1.04, ry * 0.14);
      ctx.bezierCurveTo(bx + rx * 0.72, ry * 0.28, bx + rx * 0.48, ry * 0.36, bx + rx * 0.32, ry * 0.48);
      ctx.bezierCurveTo(bx + rx * 0.14, ry * 0.68, bx + rx * 0.0, ry * 0.88, peakX, ry * 0.92);
    }
    ctx.bezierCurveTo(peakX - rx * 0.22, ry * 0.84, bx - rx * 0.44, ry * 0.38, stemX, stemH);
  } else if (st === "layla") {
    // Image 5: Queen Triggerfish — sleek oval-diamond body with sloping forehead & cute thick pouting lips!
    const stemX = bx - rx * 0.96;
    const stemH = ry * 0.14;
    const peakX = bx + rx * 0.02;
    const peakY = -ry * 0.92;
    const snoutLift = upperTipY - jaw.closedTipY;

    ctx.moveTo(stemX, -stemH);
    ctx.bezierCurveTo(bx - rx * 0.72, -ry * 0.48, peakX - rx * 0.46, peakY, peakX, peakY);
    ctx.bezierCurveTo(bx + rx * 0.42, peakY, bx + rx * 0.86, -ry * 0.5 - snoutLift * 0.2, upperTipX, upperTipY - ry * 0.05);

    if (open > 0) {
      ctx.quadraticCurveTo((upperTipX + hingeX) * 0.5, upperTipY + ry * 0.02, hingeX, hingeY);
      ctx.quadraticCurveTo((hingeX + lowerTipX) * 0.5, lowerTipY - ry * 0.02, lowerTipX, lowerTipY + ry * 0.05);
      ctx.bezierCurveTo(lowerTipX - rx * 0.08, lowerTipY + ry * 0.28, bx + rx * 0.46, ry * (0.98 + open * 0.06), peakX, ry * 0.94);
    } else {
      const chinPuff = puff * ry * 0.08;
      ctx.quadraticCurveTo(upperTipX + rx * 0.03, upperTipY + ry * 0.04, lowerTipX, lowerTipY + ry * 0.06 + chinPuff);
      ctx.bezierCurveTo(bx + rx * 0.88, ry * 0.62 + chinPuff, bx + rx * 0.48, ry * 0.98 + chinPuff, peakX, ry * 0.94);
    }
    ctx.bezierCurveTo(peakX - rx * 0.46, ry * 0.94, bx - rx * 0.72, ry * 0.48, stemX, stemH);
  } else if (isDisc(sp)) {
    // Laterally compressed reef-fish disc (Andy, Boris, Tang) — Andy/Ryan/Boris with protruding upper snout/lip
    const stemX = bx - rx * 0.94;
    const stemH = ry * 0.13;
    const peakX = bx + rx * (st === "tang" ? -0.02 : st === "boris" ? -0.08 : -0.14);
    const peakY = -ry * (st === "andy" ? 1.0 : 0.98);
    const snoutLift = upperTipY - jaw.closedTipY;
    const overbite = st === "andy" || st === "boris";

    ctx.moveTo(stemX, -stemH);
    ctx.bezierCurveTo(bx - rx * 0.9, -ry * 0.62, peakX - rx * 0.46, peakY, peakX, peakY);
    if (st === "boris") {
      // Rounded steep butterfly profile pinching forward into an overhanging upper lip
      ctx.bezierCurveTo(peakX + rx * 0.46, peakY, bx + rx * 0.74, -ry * 0.62 - snoutLift * 0.25, bx + rx * 0.96, -ry * 0.16 - snoutLift * 0.55);
      ctx.quadraticCurveTo(upperTipX - rx * 0.06, upperTipY - ry * 0.08, upperTipX, upperTipY - ry * 0.01);
    } else if (st === "andy") {
      ctx.bezierCurveTo(peakX + rx * 0.4, peakY, bx + rx * 0.6, -ry * 0.66 - snoutLift * 0.25, bx + rx * 0.88, -ry * 0.22 - snoutLift * 0.6);
      ctx.quadraticCurveTo(upperTipX - rx * 0.06, upperTipY - ry * 0.07, upperTipX, upperTipY - ry * 0.01);
    } else {
      ctx.bezierCurveTo(peakX + rx * 0.4, peakY, bx + rx * 0.58, -ry * 0.66 - snoutLift * 0.25, bx + rx * 0.82, -ry * 0.24 - snoutLift * 0.6);
      ctx.quadraticCurveTo(bx + rx * 0.96, upperTipY - ry * 0.06, upperTipX, upperTipY - ry * 0.02);
    }

    if (open > 0) {
      ctx.quadraticCurveTo((upperTipX + hingeX) * 0.5, upperTipY + ry * 0.02, hingeX, hingeY);
      ctx.quadraticCurveTo((hingeX + lowerTipX) * 0.5, lowerTipY - ry * 0.02, lowerTipX, lowerTipY + ry * 0.04);
      ctx.bezierCurveTo(lowerTipX - rx * 0.08, lowerTipY + ry * 0.24, peakX + rx * 0.48, Math.max(ry * (1.0 + open * 0.12), lowerTipY + ry * 0.24), peakX, ry * 0.98);
    } else {
      const chinPuff = puff * ry * 0.1;
      if (overbite) {
        // Upper lip curves softly downward & tucks back to the recessed lower lip/chin
        ctx.quadraticCurveTo(upperTipX + rx * 0.015, upperTipY + ry * 0.045, lowerTipX, lowerTipY + ry * 0.05 + chinPuff);
        ctx.quadraticCurveTo(lowerTipX - rx * 0.04, ry * 0.36 + chinPuff, bx + rx * 0.72, ry * 0.58 + chinPuff);
      } else {
        ctx.quadraticCurveTo(upperTipX + rx * 0.03, upperTipY + ry * 0.06, lowerTipX, lowerTipY + ry * 0.08 + chinPuff);
        ctx.quadraticCurveTo(bx + rx * 0.95, ry * 0.36 + chinPuff, bx + rx * 0.8, ry * 0.56 + chinPuff);
      }
      ctx.bezierCurveTo(bx + rx * 0.62, ry * 0.92 + chinPuff, peakX + rx * 0.44, ry * 1.0 + chinPuff, peakX, ry * 0.98);
    }
    ctx.bezierCurveTo(peakX - rx * 0.46, ry * 0.98, bx - rx * 0.9, ry * 0.62, stemX, stemH);
  } else if (st === "eddy") {
    // Image 4: Deep-sea anglerfish — massive bulbous chin & rounded lower head tapering sharply to slender tail stalk!
    const wy = ry * 0.16;
    ctx.moveTo(bx - rx, -wy);
    // Narrow tail stalk rising into rounded hump behind eye, then sloping down to snout
    ctx.bezierCurveTo(bx - rx * 0.56, -ry * 0.34, bx - rx * 0.22, -ry * 0.86, bx + rx * 0.22, -ry * 0.82);
    ctx.bezierCurveTo(bx + rx * 0.52, -ry * 0.78, bx + rx * 0.78, -ry * 0.42, upperTipX, upperTipY - ry * 0.04);

    if (open > 0) {
      ctx.quadraticCurveTo((upperTipX + hingeX) * 0.5, upperTipY + ry * 0.08, hingeX, hingeY);
      ctx.quadraticCurveTo((hingeX + lowerTipX) * 0.5, lowerTipY - ry * 0.06, lowerTipX, lowerTipY + ry * 0.05);
      // Massive rounded chin curving sharply up into slender tail stalk
      ctx.bezierCurveTo(lowerTipX - rx * 0.04, lowerTipY + ry * 0.35, bx + rx * 0.34, ry * (1.06 + open * 0.14), bx - rx * 0.08, ry * 0.72);
      ctx.quadraticCurveTo(bx - rx * 0.48, ry * 0.32, bx - rx, wy);
    } else {
      // Closed underbite jaw sloping steeply down into huge rounded bulbous chin
      ctx.quadraticCurveTo(upperTipX + rx * 0.02, upperTipY + ry * 0.08, lowerTipX + rx * 0.04, lowerTipY + ry * 0.14);
      ctx.bezierCurveTo(bx + rx * 0.88, ry * 0.48, bx + rx * 0.45, ry * 1.06, bx - rx * 0.06, ry * 0.74);
      ctx.quadraticCurveTo(bx - rx * 0.48, ry * 0.34, bx - rx, wy);
    }
  } else {
    const longBody = isLong(sp);
    const blunt = st === "orca";
    const pike = st === "barracuda";
    const slimHead = pike || st === "sailfish";
    const wy = ry * (pike ? 0.3 : st === "sailfish" ? 0.26 : st === "minnow" ? 0.24 : st === "leon" ? 0.22 : st === "parrot" ? 0.28 : longBody ? 0.19 : 0.2);
    const upLift = jaw.closedTipY - upperTipY;

    ctx.moveTo(bx - rx, -wy);
    if (st === "clown") {
      // Image 2: Chubby 3D Nemo clownfish — plump rounded body with cute distinct rounded upper lip protruding slightly!
      ctx.bezierCurveTo(bx - rx * 0.56, -ry * 0.74, bx - rx * 0.04, -ry * 0.88, bx + rx * 0.46, -ry * 0.86);
      ctx.bezierCurveTo(bx + rx * 0.86, -ry * 0.8, bx + rx * 1.04, -ry * 0.32 - upLift * 0.3, bx + rx * 1.02, upperTipY - ry * 0.07);
      ctx.quadraticCurveTo(bx + rx * 1.12, upperTipY - ry * 0.06, upperTipX, upperTipY - ry * 0.02);
    } else if (st === "shark") {
      // Image 7: Bruce Great White Shark — muscular arched back, conical slightly upturned snout overhanging wide toothy grin!
      ctx.bezierCurveTo(bx - rx * 0.5, -ry * 0.64, bx + rx * 0.12, -ry * 1.06, bx + rx * 0.62, -ry * 0.86);
      ctx.bezierCurveTo(bx + rx * 0.94, -ry * 0.74, bx + rx * 1.14, -ry * 0.42 - upLift * 0.4, bx + rx * 1.2, -ry * 0.16 - upLift * 0.5);
      ctx.quadraticCurveTo(bx + rx * 1.12, -ry * 0.02 - upLift * 0.5, upperTipX - rx * 0.08, upperTipY);
    } else if (st === "leopard") {
      // Image 6: Leopard Shark — long sleek streamlined shark profile tapering cleanly to tail
      ctx.bezierCurveTo(bx - rx * 0.5, -ry * 0.56, bx + rx * 0.1, -ry * 0.96, bx + rx * 0.6, -ry * 0.72);
      ctx.bezierCurveTo(bx + rx * 0.88, -ry * 0.56, bx + rx * 1.14, -ry * 0.24 - upLift * 0.4, bx + rx * 1.24, -ry * 0.04 - upLift * 0.4);
      ctx.quadraticCurveTo(bx + rx * 1.14, ry * 0.08, upperTipX - rx * 0.08, upperTipY);
    } else if (st === "peter") {
      // Image 4: John Dory — stout deep oval body with steep snout & thick pouty lower lip
      ctx.bezierCurveTo(bx - rx * 0.5, -ry * 0.84, bx + rx * 0.04, -ry * 0.98, bx + rx * 0.5, -ry * 0.8);
      ctx.bezierCurveTo(bx + rx * 0.8, -ry * 0.64, bx + rx * 1.04, -ry * 0.24 - upLift * 0.4, upperTipX, upperTipY - ry * 0.06);
    } else if (st === "parrot") {
      // Image 1: Napoleon Wrasse — full rounded overhanging jenong dome curving back into concave bridge above eye!
      ctx.bezierCurveTo(bx - rx * 0.46, -ry * 0.74, bx + rx * 0.12, -ry * 1.0, bx + rx * 0.56, -ry * 1.04);
      ctx.bezierCurveTo(bx + rx * 0.9, -ry * 1.05, bx + rx * 0.97, -ry * 0.72, bx + rx * 0.69, -ry * 0.46);
      ctx.bezierCurveTo(bx + rx * 0.78, -ry * 0.26, bx + rx * 0.96, -ry * 0.08 - upLift * 0.4, upperTipX, upperTipY - ry * 0.04);
    } else if (st === "leon") {
      // Image 4: Lionfish — slim tail peduncle rising to high humped back, then concave sloping forehead/snout down to prominent protruding golden lips!
      ctx.bezierCurveTo(bx - rx * 0.56, -ry * 0.32, bx - rx * 0.14, -ry * 0.98, bx + rx * 0.26, -ry * 0.88);
      ctx.bezierCurveTo(bx + rx * 0.56, -ry * 0.78, bx + rx * 0.62, -ry * 0.44 - upLift * 0.25, bx + rx * 0.82, -ry * 0.16 - upLift * 0.4);
      ctx.quadraticCurveTo(bx + rx * 1.06, ry * 0.12 - upLift * 0.5, upperTipX, upperTipY - ry * 0.05);
    } else if (blunt) {
      // rounded melon forehead of a killer whale
      ctx.bezierCurveTo(bx - rx * 0.5, -ry * 0.9, bx + rx * 0.2, -ry * 1.04, bx + rx * 0.62, -ry * 0.86);
      ctx.bezierCurveTo(bx + rx * 0.92, -ry * 0.72, bx + rx * 1.04, -ry * 0.36 - upLift * 0.6, upperTipX, upperTipY - ry * 0.03);
    } else if (slimHead) {
      // long flat pike-like head
      ctx.bezierCurveTo(bx - rx * 0.5, -ry * 0.94, bx + rx * 0.1, -ry * 1.0, bx + rx * 0.5, -ry * 0.82);
      ctx.bezierCurveTo(bx + rx * 0.8, -ry * 0.64, bx + rx * 1.02, -ry * 0.28 - upLift * 0.6, upperTipX, upperTipY - ry * 0.02);
    } else if (longBody) {
      ctx.bezierCurveTo(bx - rx * 0.5, -ry * 0.86, bx + rx * 0.12, -ry * 1.02, bx + rx * 0.56, -ry * 0.76);
      ctx.bezierCurveTo(bx + rx * 0.84, -ry * 0.54, bx + rx * 1.02, -ry * 0.2 - upLift * 0.6, upperTipX, upperTipY - ry * 0.03);
    } else {
      ctx.bezierCurveTo(bx - rx * 0.52, -ry * 0.92, bx + rx * 0.14, -ry * 1.06, bx + rx * 0.58, -ry * 0.78);
      ctx.bezierCurveTo(bx + rx * 0.82, -ry * 0.54, bx + rx * 0.96, -ry * 0.16 - upLift * 0.6, upperTipX, upperTipY - ry * 0.03);
    }

    if (st === "shark") {
      // Image 7: Bruce's big expressive curved jaw grin + full rounded lower chin tapering cleanly to slender tail!
      const sOpen = Math.max(open, puff ? 0.15 : 0.44);
      const shx = bx + rx * 0.52;
      const shy = ry * 0.1;
      const slx = bx + rx * (0.94 - sOpen * 0.04);
      const sly = ry * (0.28 + sOpen * 0.46);
      ctx.quadraticCurveTo(bx + rx * 0.84, upperTipY + ry * 0.04, shx, shy);
      ctx.quadraticCurveTo(bx + rx * 0.78, sly - ry * 0.04, slx, sly);
      ctx.bezierCurveTo(slx - rx * 0.1, sly + ry * 0.32, bx + rx * 0.38, ry * (1.02 + sOpen * 0.1), bx - rx * 0.32, ry * 0.8);
      ctx.quadraticCurveTo(bx - rx * 0.7, ry * 0.56, bx - rx, wy);
    } else if (open > 0) {
      const chinDrop = Math.max(ry * (0.98 + open * 0.18), lowerTipY + ry * 0.2);
      ctx.quadraticCurveTo((upperTipX + hingeX) * 0.5, upperTipY + ry * 0.03, hingeX, hingeY);
      ctx.quadraticCurveTo((hingeX + lowerTipX) * 0.5, lowerTipY - ry * 0.03, lowerTipX, lowerTipY + ry * 0.04);
      ctx.bezierCurveTo(lowerTipX - rx * 0.08, lowerTipY + ry * 0.22, bx + rx * 0.44, chinDrop, bx - rx * 0.38, ry * 0.9);
      ctx.quadraticCurveTo(bx - rx * 0.74, ry * 0.72, bx - rx, wy);
    } else if (pike) {
      ctx.quadraticCurveTo(upperTipX + rx * 0.03, upperTipY + ry * 0.08, lowerTipX + rx * 0.05, lowerTipY + ry * 0.1);
      ctx.quadraticCurveTo(bx + rx * 1.18, ry * 0.62, bx + rx * 0.86, ry * 0.76);
      ctx.bezierCurveTo(bx + rx * 0.5, ry * 1.0, bx - rx * 0.42, ry * 0.94, bx - rx, wy);
    } else if (st === "clown") {
      // Image 2: cute slightly-pouting rounded lower lip curving into plump belly!
      const chinPuff = puff * ry * 0.1;
      ctx.quadraticCurveTo(upperTipX + rx * 0.02, upperTipY + ry * 0.05, lowerTipX - rx * 0.04, lowerTipY + ry * 0.08 + chinPuff);
      ctx.quadraticCurveTo(bx + rx * 1.02, ry * 0.34 + chinPuff, bx + rx * 0.88, ry * 0.6 + chinPuff);
      ctx.bezierCurveTo(bx + rx * 0.54, ry * 0.96 + chinPuff, bx - rx * 0.1, ry * 0.84, bx - rx * 0.56, ry * 0.66);
      ctx.quadraticCurveTo(bx - rx * 0.78, ry * 0.46, bx - rx, wy);
    } else if (st === "peter") {
      // Image 4: boxy protruding snout-chin & stout belly tapering to tail stalk
      const chinPuff = puff * ry * 0.1;
      ctx.quadraticCurveTo(upperTipX + rx * 0.02, upperTipY + ry * 0.08, lowerTipX - rx * 0.02, lowerTipY + ry * 0.22 + chinPuff);
      ctx.quadraticCurveTo(bx + rx * 0.96, ry * 0.62 + chinPuff, bx + rx * 0.68, ry * 0.78 + chinPuff);
      ctx.bezierCurveTo(bx + rx * 0.24, ry * 0.92 + chinPuff, bx - rx * 0.36, ry * 0.76, bx - rx, wy);
    } else if (st === "leon") {
      // Image 4: elongated protruding lip & gently rounded under-chin tapering smoothly to slim tail waist
      const chinPuff = puff * ry * 0.08;
      ctx.quadraticCurveTo(upperTipX + rx * 0.04, upperTipY + ry * 0.06, lowerTipX, lowerTipY + ry * 0.1 + chinPuff);
      ctx.bezierCurveTo(bx + rx * 0.78, ry * 0.66 + chinPuff, bx + rx * 0.16, ry * 0.68 + chinPuff, bx - rx * 0.48, ry * 0.32);
      ctx.quadraticCurveTo(bx - rx * 0.76, ry * 0.22, bx - rx, wy);
    } else if (st === "parrot") {
      // Image 1: Deep smooth rounded royal-blue chin & plump belly tapering cleanly to tail peduncle
      const chinPuff = puff * ry * 0.08;
      ctx.quadraticCurveTo(upperTipX + rx * 0.03, upperTipY + ry * 0.05, lowerTipX, lowerTipY + ry * 0.08 + chinPuff);
      ctx.bezierCurveTo(bx + rx * 0.92, ry * 0.68 + chinPuff, bx + rx * 0.38, ry * 1.02 + chinPuff, bx - rx * 0.24, ry * 0.84);
      ctx.quadraticCurveTo(bx - rx * 0.68, ry * 0.56, bx - rx, wy);
    } else {
      const chinPuff = puff * ry * 0.1;
      ctx.quadraticCurveTo(upperTipX + rx * 0.03, upperTipY + ry * 0.06, lowerTipX, lowerTipY + ry * 0.08 + chinPuff);
      ctx.quadraticCurveTo(bx + rx * 0.94, ry * 0.44 + chinPuff, bx + rx * 0.76, ry * 0.62 + chinPuff);
      ctx.bezierCurveTo(bx + rx * 0.48, ry * 0.98 + chinPuff, bx - rx * 0.42, ry * 0.94, bx - rx, wy);
    }
  }
  ctx.closePath();
}

export function renderFishCanvas(
  sp: Species,
  W: number,
  jawState: JawState,
  tailFrame: number,
  pixelMode: boolean,
  expr: EyeExpr
): HTMLCanvasElement {
  const st = sp.style;
  if (isCustomStyle(st)) {
    // Si Oren, Gill, Bruce & Toto are drawn by the reference-accurate renderer
    const custom = renderCustomFish(sp, W, jawState, tailFrame, TAIL_FRAMES, expr);
    if (!pixelMode) return custom;
    const cpw = Math.max(24, Math.round(custom.width * 0.65));
    const cph = Math.max(16, Math.round(custom.height * 0.65));
    const cpc = document.createElement("canvas");
    cpc.width = cpw;
    cpc.height = cph;
    const cpx = cpc.getContext("2d")!;
    cpx.imageSmoothingEnabled = true;
    cpx.drawImage(custom, 0, 0, cpw, cph);
    return cpc;
  }
  const pal = sp.pal;
  const disc = isDisc(sp);
  const longBody = isLong(sp);
  const tall = !!(sp.lure || sp.spinyCrest || st === "orca" || st === "layla" || st === "barracuda" || st === "minnow" || st === "pierre" || st === "shark" || st === "leopard" || st === "puffer" || st === "tang" || st === "idol" || st === "parrot");
  const extraTop = st === "sailfish" ? 0.56 : st === "leon" ? 0.72 : st === "idol" ? 0.64 : st === "peter" || st === "layla" ? 0.38 : tall ? 0.24 : 0.16;
  const aspect = Math.max(0.62, Math.min(1.9, sp.hRatio * 1.16 + extraTop));
  const H = Math.max(20, Math.round(W * aspect));
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext("2d")!;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  const bodyLen = W * (st === "idol" ? 0.48 : st === "leon" ? 0.56 : 0.7);
  const rx = bodyLen * 0.41;
  const ry = rx * sp.hRatio * 1.05;
  const cy = H * (st === "sailfish" ? 0.63 : st === "idol" ? 0.58 : st === "peter" ? 0.55 : st === "leon" ? 0.5 : sp.lure || sp.spinyCrest ? 0.58 : 0.53);
  const bx = W * 0.5 + bodyLen * (st === "leon" ? 0.03 : 0.05);
  const X = (u: number) => bx + rx * u;
  const V = (v: number) => ry * v;
  const wy = ry * (disc ? 0.13 : st === "barracuda" ? 0.3 : st === "sailfish" ? 0.26 : st === "minnow" ? 0.24 : longBody ? 0.19 : 0.2);
  const rim = Math.max(1.1, W * 0.014);
  const detail = W >= 55;
  const out = (a: number) => rgbaHex(pal.outline, a);

  // swim cycle: tail beat + a lagging ripple that runs through the soft fins
  const wagAng = (tailFrame / TAIL_FRAMES) * Math.PI * 2;
  const wag = Math.sin(wagAng);
  const wag2 = Math.sin(wagAng - 1.0);
  const sw = wag2 * rx * 0.055;
  const open = jawState > 0 ? Math.min(1, jawState / 6) : 0;
  const puff = jawState === -1 ? 1 : 0;

  const finBase = pal.fin;
  const finDark = mixHex(finBase, pal.dark, 0.55);
  const finLight = mixHex(finBase, "#ffffff", 0.35);
  const tailBase = pal.tail || finBase;
  const tailDark = mixHex(tailBase, pal.dark, 0.38);
  const tailLight = mixHex(tailBase, "#ffffff", 0.5);

  ctx.save();
  ctx.translate(0, cy);

  // generic soft rayed fin painter
  const fin = (
    build: () => void,
    c0: string,
    c1: string,
    g: [number, number, number, number],
    o: { rays?: number[][]; margin?: string; marginW?: number; alpha?: number } = {}
  ) => {
    ctx.save();
    if (o.alpha !== undefined) ctx.globalAlpha = o.alpha;
    ctx.beginPath();
    build();
    ctx.closePath();
    const gr = ctx.createLinearGradient(g[0], g[1], g[2], g[3]);
    gr.addColorStop(0, c0);
    gr.addColorStop(1, c1);
    ctx.fillStyle = gr;
    ctx.fill();
    if (detail && (o.rays || o.margin)) {
      ctx.save();
      ctx.clip();
      if (o.rays) {
        ctx.strokeStyle = out(0.28);
        ctx.lineWidth = Math.max(0.9, rim * 0.7);
        ctx.beginPath();
        for (const r of o.rays) {
          ctx.moveTo(r[0], r[1]);
          ctx.lineTo(r[2], r[3]);
        }
        ctx.stroke();
      }
      if (o.margin) {
        ctx.beginPath();
        build();
        ctx.closePath();
        ctx.strokeStyle = o.margin;
        ctx.lineWidth = rim * (o.marginW ?? 2.6);
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.beginPath();
    build();
    ctx.closePath();
    ctx.strokeStyle = out(0.55);
    ctx.lineWidth = rim;
    ctx.stroke();
    ctx.restore();
  };
  // fin rays fanning from a base segment to a tip segment
  const rays = (x0: number, y0: number, x1: number, y1: number, tx0: number, ty0: number, tx1: number, ty1: number, n: number) => {
    const r: number[][] = [];
    for (let i = 0; i < n; i++) {
      const f = (i + 0.5) / n;
      r.push([x0 + (x1 - x0) * f, y0 + (y1 - y0) * f, tx0 + (tx1 - tx0) * f, ty0 + (ty1 - ty0) * f]);
    }
    return r;
  };
  const BLK = "rgba(26, 18, 14, 0.9)";
  // paints a coloured patch (fin tip, band) clipped inside a fin shape
  const dip = (build: () => void, px: number, py: number, r: number, col: string) => {
    ctx.save();
    ctx.beginPath();
    build();
    ctx.closePath();
    ctx.clip();
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  // ---------- 0. ANGLERFISH LURE (Image 4: tall curving stalk arching over snout, glowing neon-green bulb!) ----------
  if (sp.lure) {
    const lx0 = X(0.28),
      ly0 = V(-0.78);
    const bulbX = X(1.26),
      bulbY = V(-0.56) + wag * ry * 0.06;
    ctx.beginPath();
    ctx.moveTo(lx0, ly0);
    ctx.bezierCurveTo(X(0.55), V(-1.62), X(1.24), V(-1.42), bulbX, bulbY);
    ctx.strokeStyle = pal.dark;
    ctx.lineWidth = Math.max(2, W * 0.02);
    ctx.stroke();
    ctx.strokeStyle = mixHex(pal.body, "#a6ff68", 0.35);
    ctx.lineWidth = Math.max(1.1, W * 0.01);
    ctx.stroke();
    const lCol = pal.lure || "#38ff14";
    const lg = ctx.createRadialGradient(bulbX, bulbY, 0.5, bulbX, bulbY, ry * 0.45);
    lg.addColorStop(0, "#ffffff");
    lg.addColorStop(0.26, lCol);
    lg.addColorStop(0.62, rgbaHex(lCol, 0.36));
    lg.addColorStop(1, rgbaHex(lCol, 0));
    ctx.fillStyle = lg;
    ctx.beginPath();
    ctx.arc(bulbX, bulbY, ry * 0.45, 0, Math.PI * 2);
    ctx.fill();
  }

  // ---------- 0.5 FAR-SIDE PECTORAL FIN (3D depth parallax behind body) ----------
  const pFlutterFar = wag2 * 0.16;
  if (st !== "leon") {
    ctx.save();
    const slim = st === "barracuda" || st === "minnow" || st === "sailfish";
    const fx = X(disc ? 0.32 : slim ? 0.37 : st === "orca" ? 0.44 : st === "shark" ? 0.38 : 0.16);
    const fy = ry * (disc ? 0.38 : slim ? 0.44 : st === "orca" ? 0.62 : st === "shark" ? 0.55 : 0.32);
    ctx.translate(fx, fy);
    ctx.rotate((st === "orca" ? 1.95 : st === "shark" ? 2.15 : 0.25) - pFlutterFar * 0.85);
    ctx.scale(0.86, 0.86);
    ctx.globalAlpha = 0.72;
    const pk = slim ? 0.7 : st === "eddy" ? 0.75 : 1;
    const ph = slim ? Math.max(ry, rx * 0.22) : ry;
    ctx.beginPath();
    if (st === "orca" || st === "shark") {
      ctx.moveTo(0, -ry * 0.14);
      ctx.quadraticCurveTo(rx * 0.32, -ry * 0.28, rx * 0.54, ry * 0.05);
      ctx.quadraticCurveTo(rx * 0.26, ry * 0.22, 0, ry * 0.14);
    } else {
      ctx.moveTo(0, -ph * 0.06);
      ctx.bezierCurveTo(-rx * 0.16 * pk, -ph * 0.18, -rx * 0.38 * pk, -ph * 0.1, -rx * 0.36 * pk, ph * 0.08);
      ctx.bezierCurveTo(-rx * 0.32 * pk, ph * 0.24, -rx * 0.12 * pk, ph * 0.2, 0, ph * 0.08);
    }
    ctx.closePath();
    ctx.fillStyle = mixHex(finDark, pal.outline, 0.42);
    ctx.fill();
    ctx.lineWidth = rim * 0.75;
    ctx.strokeStyle = out(0.45);
    ctx.stroke();
    ctx.restore();
  }

  // ---------- 1. CAUDAL FIN — the right tail type for each species, hinged at the peduncle ----------
  const tKind =
    st === "minnow" || st === "barracuda" || st === "idol"
      ? "fork"
      : st === "layla" || st === "sailfish"
        ? "lunate"
        : st === "shark" || st === "leopard"
          ? "hetero"
          : st === "orca"
            ? "fluke"
            : st === "boris" || st === "peter" || st === "tang" || st === "leon" || st === "parrot" || st === "eddy"
              ? "trunc"
              : "round";
  const tl = rx * (st === "idol" ? 0.78 : st === "leon" ? 0.76 : st === "layla" ? 0.62 : st === "peter" ? 0.56 : tKind === "fork" ? 0.68 : tKind === "lunate" ? 0.64 : tKind === "hetero" ? 0.74 : tKind === "fluke" ? 0.62 : st === "parrot" ? 0.58 : st === "eddy" ? 0.42 : tKind === "trunc" ? 0.5 : st === "puffer" ? 0.46 : 0.58);
  const th =
    st === "idol"
      ? ry * 0.44
      : st === "leon"
        ? ry * 0.88
        : st === "peter"
          ? ry * 0.48
          : tKind === "fork"
            ? Math.max(ry * 0.95, rx * 0.34)
            : tKind === "lunate"
              ? st === "sailfish"
                ? rx * 0.52
                : ry * 0.82
              : tKind === "hetero"
                ? ry * 0.95
                : tKind === "fluke"
                  ? ry * 0.66
                  : st === "parrot"
                    ? ry * 0.5
                    : st === "eddy"
                      ? ry * 0.42
                      : tKind === "trunc"
                        ? ry * 0.6
                        : st === "puffer"
                          ? ry * 0.42
                          : ry * 0.64;
  ctx.save();
  ctx.translate(X(st === "idol" ? -0.52 : disc ? -0.9 : -0.95), 0);
  ctx.rotate(wag * (tKind === "fluke" ? 0.36 : 0.2));
  if (tKind !== "fluke") ctx.scale(1 - Math.abs(wag) * 0.1, 1);
  const tailPath = () => {
    if (tKind === "fork") {
      ctx.moveTo(0, -wy * 0.9);
      ctx.quadraticCurveTo(-tl * 0.5, -th * 0.72, -tl, -th);
      ctx.quadraticCurveTo(-tl * 0.66, -th * 0.3, -tl * 0.36, 0);
      ctx.quadraticCurveTo(-tl * 0.66, th * 0.3, -tl, th);
      ctx.quadraticCurveTo(-tl * 0.5, th * 0.72, 0, wy * 0.9);
    } else if (tKind === "lunate") {
      ctx.moveTo(0, -wy * 0.9);
      ctx.quadraticCurveTo(-tl * 0.5, -th * 0.8, -tl * 1.06, -th);
      ctx.quadraticCurveTo(-tl * 0.62, -th * 0.42, -tl * 0.56, 0);
      ctx.quadraticCurveTo(-tl * 0.62, th * 0.42, -tl * 1.06, th);
      ctx.quadraticCurveTo(-tl * 0.5, th * 0.8, 0, wy * 0.9);
    } else if (tKind === "hetero") {
      // Image 7 & 6: Sleek crescent shark tail with sub-terminal notch near upper tip & sweeping lower lobe!
      ctx.moveTo(0, -wy * 0.86);
      ctx.quadraticCurveTo(-tl * 0.48, -th * 0.74, -tl * 1.12, -th * 1.32);
      ctx.lineTo(-tl * 0.92, -th * 0.98);
      ctx.lineTo(-tl * 1.02, -th * 0.9);
      ctx.quadraticCurveTo(-tl * 0.62, -th * 0.28, -tl * 0.56, 0);
      ctx.quadraticCurveTo(-tl * 0.66, th * 0.42, -tl * 0.86, th * 0.92);
      ctx.quadraticCurveTo(-tl * 0.42, th * 0.62, 0, wy * 0.86);
    } else if (tKind === "fluke") {
      // horizontal whale flukes seen in 3/4 view: near fluke large, far fluke foreshortened, median notch
      ctx.moveTo(0, -wy * 0.7);
      ctx.quadraticCurveTo(-tl * 0.5, -th * 0.42, -tl * 0.96, -th * 0.72);
      ctx.quadraticCurveTo(-tl * 0.8, -th * 0.2, -tl * 0.64, th * 0.04);
      ctx.quadraticCurveTo(-tl * 0.86, th * 0.32, -tl * 1.08, th);
      ctx.quadraticCurveTo(-tl * 0.5, th * 0.66, 0, wy * 0.7);
    } else if (st === "eddy") {
      // Ragged deep-sea angler tail fin (Image 4)
      ctx.moveTo(0, -wy * 0.85);
      ctx.lineTo(-tl * 0.95, -th);
      ctx.lineTo(-tl * 0.72, -th * 0.42);
      ctx.lineTo(-tl * 1.05, -th * 0.06);
      ctx.lineTo(-tl * 0.78, th * 0.38);
      ctx.lineTo(-tl * 0.94, th * 0.95);
      ctx.lineTo(0, wy * 0.85);
    } else if (st === "parrot") {
      // Image 1: Broad rounded-corner paddle tail (no sharp corners)
      ctx.moveTo(0, -wy * 0.9);
      ctx.bezierCurveTo(-tl * 0.34, -th * 1.0, -tl * 0.86, -th * 1.02, -tl * 0.98, -th * 0.52);
      ctx.quadraticCurveTo(-tl * 1.08, 0, -tl * 0.98, th * 0.52);
      ctx.bezierCurveTo(-tl * 0.86, th * 1.02, -tl * 0.34, th * 1.0, 0, wy * 0.9);
    } else if (tKind === "trunc") {
      ctx.moveTo(0, -wy * 0.95);
      ctx.quadraticCurveTo(-tl * 0.5, -th * 0.84, -tl, -th * 0.9);
      ctx.quadraticCurveTo(-tl * 1.07, 0, -tl, th * 0.9);
      ctx.quadraticCurveTo(-tl * 0.5, th * 0.84, 0, wy * 0.95);
    } else {
      ctx.moveTo(0, -wy * 0.95);
      ctx.bezierCurveTo(-tl * 0.3, -th * 0.98, -tl * 0.86, -th * 0.98, -tl, -th * 0.36);
      ctx.quadraticCurveTo(-tl * 1.13, 0, -tl, th * 0.36);
      ctx.bezierCurveTo(-tl * 0.86, th * 0.98, -tl * 0.3, th * 0.98, 0, wy * 0.95);
    }
  };
  ctx.beginPath();
  tailPath();
  ctx.closePath();
  const tg = ctx.createLinearGradient(0, 0, -tl * 1.08, 0);
  if (st === "andy") {
    tg.addColorStop(0, mixHex(pal.dark, "#ffae38", 0.5));
    tg.addColorStop(0.28, "#ffe794");
    tg.addColorStop(0.68, "#fffdf2");
    tg.addColorStop(1, "rgba(255, 255, 255, 0.88)");
  } else if (st === "idol") {
    // Image 3: pale warm cream triangular tail base transitioning to deep purple-black forked fin
    tg.addColorStop(0, "#fff7db");
    tg.addColorStop(0.32, "#f6df96");
    tg.addColorStop(0.42, pal.tail || "#1d0c28");
    tg.addColorStop(1, "#0d0514");
  } else if (st === "orca") {
    tg.addColorStop(0, pal.body);
    tg.addColorStop(1, pal.dark);
  } else if (st === "parrot") {
    tg.addColorStop(0, "#0c6e38");
    tg.addColorStop(0.45, "#3ac992");
    tg.addColorStop(0.82, "#5ee0aa");
    tg.addColorStop(1, "#0d3b82");
  } else {
    tg.addColorStop(0, tailDark);
    tg.addColorStop(0.55, tailBase);
    tg.addColorStop(1, tailLight);
  }
  ctx.fillStyle = tg;
  ctx.fill();
  if (detail && st !== "orca" && st !== "idol") {
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = st === "andy" ? "rgba(230, 155, 55, 0.32)" : out(0.25);
    ctx.lineWidth = Math.max(0.9, rim * 0.7);
    ctx.beginPath();
    for (const k of [-0.8, -0.52, -0.26, 0, 0.26, 0.52, 0.8]) {
      ctx.moveTo(0, k * wy);
      ctx.lineTo(-tl * 1.05, k * th);
    }
    ctx.stroke();
    if (st === "leon" || st === "pierre") {
      // rows of spots on the soft tail (lionfish Image 1) / reef-grouper speckles
      ctx.fillStyle = st === "leon" ? pal.spot || "#3c4828" : pal.spot || "#ffffff";
      ctx.globalAlpha = st === "leon" ? 0.65 : 0.85;
      const count = st === "leon" ? 16 : 9;
      for (let i = 0; i < count; i++) {
        const col = i % 4;
        const row = Math.floor(i / 4);
        ctx.beginPath();
        ctx.arc(
          -tl * (st === "leon" ? 0.22 + col * 0.2 : 0.3 + (i % 3) * 0.26),
          th * (st === "leon" ? (-0.65 + row * 0.44) : (-0.5 + Math.floor(i / 3) * 0.5)) * (0.6 + col * 0.14),
          ry * (st === "leon" ? 0.042 : 0.05),
          0,
          Math.PI * 2
        );
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    if (st === "parrot") {
      // Image 1: Horizontal dark navy ray bands & outer navy border along the rounded paddle tail
      ctx.strokeStyle = "rgba(13, 59, 130, 0.82)";
      ctx.lineWidth = Math.max(1.4, ry * 0.085);
      for (const k of [-0.66, -0.33, 0, 0.33, 0.66]) {
        ctx.beginPath();
        ctx.moveTo(-tl * 0.08, k * wy * 0.84);
        ctx.lineTo(-tl * 0.98, k * th * 0.84);
        ctx.stroke();
      }
      ctx.beginPath();
      tailPath();
      ctx.closePath();
      ctx.strokeStyle = "#0d3b82";
      ctx.lineWidth = rim * 2.1;
      ctx.stroke();
    }
    if (st === "boris") {
      // Image 2: rich golden-amber ray stripes on yellow fan tail + dark royal-blue base dot
      ctx.strokeStyle = "rgba(180, 120, 10, 0.45)";
      ctx.lineWidth = Math.max(1, ry * 0.055);
      for (const k of [-0.68, -0.34, 0, 0.34, 0.68]) {
        ctx.beginPath();
        ctx.moveTo(-tl * 0.1, k * wy * 0.9);
        ctx.lineTo(-tl * 0.98, k * th * 0.88);
        ctx.stroke();
      }
    }
    if (st === "leopard") {
      // Image 6: small dark brown leopard spots scattered on tail fin
      ctx.fillStyle = rgbaHex(pal.spot || "#4d2311", 0.85);
      for (const [ux, vy, rr] of [[-0.4, -0.35, 0.06], [-0.72, -0.75, 0.055], [-0.55, 0.2, 0.05], [-0.7, 0.65, 0.045]]) {
        ctx.beginPath();
        ctx.arc(tl * ux, th * vy, ry * rr * 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (st === "clown" || st === "layla" || st === "boris" || st === "tang") {
      if (st === "clown") {
        // Image 7: thin white inner rim + bold black outer margin on tail
        ctx.beginPath();
        tailPath();
        ctx.closePath();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = rim * 3.8;
        ctx.stroke();
      }
      ctx.beginPath();
      tailPath();
      ctx.closePath();
      ctx.strokeStyle = st === "clown" || st === "tang" ? BLK : st === "layla" ? "#1eb852" : "rgba(255,255,255,0.85)";
      ctx.lineWidth = rim * (st === "clown" ? 2.4 : 2.6);
      ctx.stroke();
    }
    ctx.restore();
  }
  ctx.beginPath();
  tailPath();
  ctx.closePath();
  ctx.strokeStyle = out(st === "parrot" ? 0.32 : 0.5);
  ctx.lineWidth = rim * (st === "parrot" ? 0.65 : 0.9);
  ctx.stroke();
  if (st === "layla") {
    // Image 5: Long needle-sharp emerald-green lyre filaments extending straight back from top & bottom tail tips
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(-tl * 0.92, s * th * 0.86);
      ctx.lineTo(-tl * 1.9, s * th * 1.0 + wag * th * 0.08);
      ctx.lineTo(-tl * 1.04, s * th * 1.0);
      ctx.closePath();
      ctx.fillStyle = "#22b858";
      ctx.fill();
      ctx.strokeStyle = "#145438";
      ctx.lineWidth = Math.max(0.8, rim * 0.45);
      ctx.stroke();
    }
  }
  ctx.restore();

  // ---------- 2. DORSAL / ANAL / PELVIC FINS (behind the body) ----------
  const gUp: [number, number, number, number] = [bx, V(-1.5), bx, V(-0.7)];
  const gDn: [number, number, number, number] = [bx, V(1.45), bx, V(0.7)];

  if (st === "andy") {
    // Angelfish: continuous dorsal & anal fins ending in swept-back trailing lobes, electric-blue margins
    const edge = pal.stripe || "#5aa0ff";
    fin(
      () => {
        ctx.moveTo(X(0.44), V(-0.76));
        ctx.bezierCurveTo(X(0.12), V(-1.3), X(-0.52), V(-1.4), X(-1.04) + sw, V(-1.3));
        ctx.quadraticCurveTo(X(-0.9), V(-0.8), X(-0.86), V(-0.1));
        ctx.lineTo(X(-0.2), V(-0.5));
      },
      finLight,
      finBase,
      gUp,
      { rays: rays(X(0.3), V(-0.8), X(-0.8), V(-0.4), X(0.1), V(-1.3), X(-1.0), V(-1.2), 9), margin: edge, marginW: 2.4 }
    );
    fin(
      () => {
        ctx.moveTo(X(0.08), V(0.88));
        ctx.bezierCurveTo(X(-0.18), V(1.3), X(-0.58), V(1.38), X(-1.02) + sw, V(1.24));
        ctx.quadraticCurveTo(X(-0.9), V(0.76), X(-0.86), V(0.1));
        ctx.lineTo(X(-0.2), V(0.5));
      },
      finLight,
      finBase,
      gDn,
      { rays: rays(X(0.0), V(0.85), X(-0.8), V(0.4), X(-0.2), V(1.3), X(-1.0), V(1.15), 8), margin: edge, marginW: 2.4 }
    );
    fin(
      () => {
        ctx.moveTo(X(0.36), V(0.86));
        ctx.quadraticCurveTo(X(0.26), V(1.2), X(0.04) + sw * 0.5, V(1.42));
        ctx.quadraticCurveTo(X(0.1), V(1.08), X(0.14), V(0.92));
      },
      "#ffe37a",
      finBase,
      gDn
    );
  } else if (st === "boris") {
    // Image 2: Smooth continuous bright yellow-lime dorsal & anal fin rim wrapping the rear disc + small pelvic fin
    fin(
      () => {
        ctx.moveTo(X(0.46), V(-0.74));
        ctx.bezierCurveTo(X(0.14), V(-1.24), X(-0.55), V(-1.26), X(-0.94) + sw, V(-0.86));
        ctx.quadraticCurveTo(X(-1.02), V(-0.48), X(-0.88), V(-0.1));
        ctx.lineTo(X(-0.22), V(-0.52));
      },
      finLight,
      finBase,
      gUp,
      { rays: rays(X(0.42), V(-0.78), X(-0.84), V(-0.4), X(0.25), V(-1.18), X(-0.95), V(-0.95), 11), margin: "#a8cf12", marginW: 2.0 }
    );
    fin(
      () => {
        ctx.moveTo(X(0.08), V(0.9));
        ctx.bezierCurveTo(X(-0.24), V(1.22), X(-0.68), V(1.22), X(-0.94) + sw, V(0.84));
        ctx.quadraticCurveTo(X(-1.0), V(0.46), X(-0.88), V(0.1));
        ctx.lineTo(X(-0.22), V(0.52));
      },
      finLight,
      finBase,
      gDn,
      { rays: rays(X(0.02), V(0.86), X(-0.82), V(0.4), X(-0.22), V(1.2), X(-0.95), V(0.92), 9), margin: "#a8cf12", marginW: 2.0 }
    );
    fin(
      () => {
        ctx.moveTo(X(0.36), V(0.88));
        ctx.quadraticCurveTo(X(0.24), V(1.2), X(0.02) + sw * 0.5, V(1.34));
        ctx.quadraticCurveTo(X(0.12), V(1.06), X(0.18), V(0.92));
      },
      "#e8f4b2",
      "#9cb878",
      gDn
    );
  } else if (st === "layla") {
    // Image 5: Queen Triggerfish — high swept-forward ice-cyan pointed dorsal fin & matching pointed anal fin!
    fin(
      () => {
        ctx.moveTo(X(0.14), V(-0.9));
        ctx.quadraticCurveTo(X(0.22), V(-1.42), X(0.06) + sw * 0.6, V(-1.74));
        ctx.bezierCurveTo(X(-0.22), V(-1.44), X(-0.64), V(-1.12), X(-0.76), V(-0.7));
        ctx.lineTo(X(-0.72), V(-0.28));
      },
      "#aeeaf7",
      "#52abc4",
      gUp,
      { rays: rays(X(0.1), V(-0.9), X(-0.72), V(-0.45), X(0.06), V(-1.66), X(-0.74), V(-0.78), 10), margin: "#387890", marginW: 1.8 }
    );
    fin(
      () => {
        ctx.moveTo(X(0.02), V(0.88));
        ctx.quadraticCurveTo(X(0.04), V(1.38), X(-0.14) + sw * 0.6, V(1.68));
        ctx.bezierCurveTo(X(-0.34), V(1.32), X(-0.66), V(1.04), X(-0.74), V(0.62));
        ctx.lineTo(X(-0.72), V(0.26));
      },
      "#aeeaf7",
      "#52abc4",
      gDn,
      { rays: rays(X(-0.02), V(0.88), X(-0.7), V(0.45), X(-0.14), V(1.62), X(-0.74), V(0.68), 9), margin: "#387890", marginW: 1.8 }
    );
  } else if (st === "leon") {
    // Image 4: Lionfish — 10 slender tall curved spines fanning across arched back with dark olive bands & delicate jagged upper membranes
    const n = 10;
    for (let i = 0; i < n; i++) {
      const f = i / (n - 1);
      const x0 = X(0.32 - f * 0.74),
        y0 = V(-0.82 + Math.abs(f - 0.32) * 0.18);
      // Front leans forward (+X), rear fans gently backward (-X) just like Image 4
      const ang = -Math.PI * (0.28 + f * 0.45) + wag2 * 0.04;
      const len = ry * (1.42 - Math.abs(f - 0.38) * 0.46);
      const cxM = x0 + Math.cos(ang - 0.07) * len * 0.56;
      const cyM = y0 + Math.sin(ang - 0.07) * len * 0.56;
      const tx = x0 + Math.cos(ang) * len,
        ty = y0 + Math.sin(ang) * len;
      const nx = -Math.sin(ang),
        ny = Math.cos(ang);
      const hw = rx * 0.028;

      // Slender curved feather tip along outer 45% of each spine
      const mx = x0 + (tx - x0) * 0.54,
        my = y0 + (ty - y0) * 0.54;
      ctx.beginPath();
      ctx.moveTo(x0 - nx * hw * 0.22, y0 - ny * hw * 0.22);
      ctx.lineTo(mx - nx * hw * 0.3, my - ny * hw * 0.3);
      ctx.quadraticCurveTo((mx + tx) * 0.5 - nx * hw * 1.1, (my + ty) * 0.5 - ny * hw * 1.1, tx - nx * hw * 0.9, ty - ny * hw * 0.9);
      ctx.lineTo(tx + Math.cos(ang) * ry * 0.08, ty + Math.sin(ang) * ry * 0.08);
      ctx.lineTo(tx + nx * hw * 0.8, ty + ny * hw * 0.8);
      ctx.quadraticCurveTo((mx + tx) * 0.5 + nx * hw * 0.65, (my + ty) * 0.5 + ny * hw * 0.65, mx + nx * hw * 0.28, my + ny * hw * 0.28);
      ctx.lineTo(x0 + nx * hw * 0.22, y0 + ny * hw * 0.22);
      ctx.closePath();
      ctx.fillStyle = "rgba(196, 218, 194, 0.88)";
      ctx.fill();
      ctx.strokeStyle = out(0.45);
      ctx.lineWidth = rim * 0.55;
      ctx.stroke();

      // Banded quill shaft inside each spine
      ctx.beginPath();
      ctx.moveTo(x0, y0 + ry * 0.03);
      ctx.quadraticCurveTo(cxM, cyM, tx, ty);
      ctx.lineWidth = Math.max(1.2, rx * 0.024);
      ctx.strokeStyle = "#f2f4d2";
      ctx.stroke();
      ctx.setLineDash([len * 0.1, len * 0.1]);
      ctx.strokeStyle = pal.spot || "#3c4828";
      ctx.stroke();
      ctx.setLineDash([]);
    }
    const spotFin = (pts: [number, number][]) => {
      ctx.fillStyle = rgbaHex(pal.spot || "#3c4828", 0.7);
      for (const [u, v] of pts) {
        ctx.beginPath();
        ctx.arc(X(u), V(v), ry * 0.044, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    // Translucent spotted rear soft dorsal fin (Image 2)
    fin(
      () => {
        ctx.moveTo(X(-0.46), V(-0.56));
        ctx.bezierCurveTo(X(-0.54), V(-1.24), X(-0.92), V(-1.18), X(-0.92) + sw, V(-0.52));
        ctx.lineTo(X(-0.82), V(-0.18));
      },
      "#e8f0d8",
      rgbaHex(finBase, 0.85),
      gUp
    );
    spotFin([[-0.6, -0.88], [-0.72, -0.74], [-0.78, -0.94], [-0.68, -0.54]]);
    // Translucent spotted rear anal fin
    fin(
      () => {
        ctx.moveTo(X(-0.44), V(0.58));
        ctx.bezierCurveTo(X(-0.54), V(1.12), X(-0.9), V(1.06), X(-0.9) + sw, V(0.46));
        ctx.lineTo(X(-0.82), V(0.18));
      },
      "#e8f0d8",
      rgbaHex(finBase, 0.85),
      gDn
    );
    spotFin([[-0.58, 0.84], [-0.7, 0.72], [-0.76, 0.9], [-0.66, 0.52]]);
  } else if (st === "peter") {
    // Image 4: 100% Peter Fish — wide fan of 9 curved spiky mohawk spines + translucent scalloped rear dorsal & anal fins + broad downward paddle fin!
    const n = 9;
    const basePts: [number, number][] = [];
    const tipPts: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      const f = i / (n - 1);
      const bx0 = X(0.3 - f * 0.58);
      const by0 = V(-0.72 - Math.sin(f * Math.PI) * 0.1);
      // Front spine curves forward-up (-0.36*PI), rear spines fan backward-up (-0.74*PI)!
      const ang = -Math.PI * (0.36 + f * 0.38) + wag2 * 0.04;
      const len = ry * (1.02 - Math.abs(f - 0.35) * 0.48);
      basePts.push([bx0, by0]);
      tipPts.push([bx0 + Math.cos(ang) * len, by0 + Math.sin(ang) * len]);
    }
    // Webbed pale-green spiky crest with deep V-notches between each spine!
    ctx.beginPath();
    ctx.moveTo(basePts[0][0], basePts[0][1]);
    for (let i = 0; i < n; i++) {
      ctx.lineTo(tipPts[i][0], tipPts[i][1]);
      if (i < n - 1) {
        const vx = (basePts[i][0] + basePts[i + 1][0]) * 0.5 * 0.55 + (tipPts[i][0] + tipPts[i + 1][0]) * 0.5 * 0.45;
        const vy = (basePts[i][1] + basePts[i + 1][1]) * 0.5 * 0.55 + (tipPts[i][1] + tipPts[i + 1][1]) * 0.5 * 0.45;
        ctx.lineTo(vx, vy);
      }
    }
    ctx.lineTo(basePts[n - 1][0], basePts[n - 1][1]);
    ctx.closePath();
    const cg = ctx.createLinearGradient(bx, V(-1.75), bx, V(-0.75));
    cg.addColorStop(0, "#d8f294");
    cg.addColorStop(0.55, "#8ec868");
    cg.addColorStop(1, "#3d7a36");
    ctx.fillStyle = cg;
    ctx.fill();
    ctx.strokeStyle = out(0.6);
    ctx.lineWidth = rim * 0.75;
    ctx.stroke();

    // Translucent scalloped rear soft dorsal & anal fins (Image 4)
    fin(
      () => {
        ctx.moveTo(X(-0.26), V(-0.74));
        ctx.quadraticCurveTo(X(-0.46), V(-1.08), X(-0.62), V(-1.0));
        ctx.quadraticCurveTo(X(-0.84), V(-0.96), X(-0.94) + sw, V(-0.62));
        ctx.quadraticCurveTo(X(-0.96), V(-0.4), X(-0.84), V(-0.2));
      },
      "rgba(148, 196, 130, 0.85)",
      "rgba(88, 132, 78, 0.82)",
      gUp
    );
    fin(
      () => {
        ctx.moveTo(X(-0.18), V(0.76));
        ctx.lineTo(X(-0.28), V(1.06));
        ctx.lineTo(X(-0.4), V(0.92));
        ctx.lineTo(X(-0.56), V(1.14));
        ctx.quadraticCurveTo(X(-0.76), V(1.06), X(-0.9) + sw, V(0.66));
        ctx.lineTo(X(-0.82), V(0.22));
      },
      "rgba(148, 196, 130, 0.85)",
      "rgba(88, 132, 78, 0.82)",
      gDn
    );
    // Broad prominent paddle-like pelvic/ventral fin hanging straight down below chest (Image 4!)
    fin(
      () => {
        ctx.moveTo(X(0.46), V(0.68));
        ctx.bezierCurveTo(X(0.46), V(1.2), X(0.32), V(1.58), X(0.18) + sw * 0.5, V(1.66));
        ctx.quadraticCurveTo(X(0.06), V(1.36), X(0.12), V(0.84));
      },
      "#e8d442",
      "#4f7d46",
      gDn,
      { rays: rays(X(0.42), V(0.72), X(0.16), V(0.82), X(0.22), V(1.6), X(0.1), V(1.42), 5) }
    );
  } else if (st === "orca") {
    // Killer whale: tall dorsal fin, no anal fin (it is a mammal!)
    fin(
      () => {
        ctx.moveTo(X(0.16), V(-0.88));
        ctx.quadraticCurveTo(X(0.0), V(-1.7), X(-0.3) + sw * 0.4, V(-1.8));
        ctx.quadraticCurveTo(X(-0.22), V(-1.2), X(-0.4), V(-0.8));
      },
      mixHex(pal.fin, "#5a6478", 0.35),
      pal.fin,
      gUp
    );
  } else if (st === "barracuda" || st === "minnow") {
    const pike = st === "barracuda";
    // first dorsal
    fin(
      () => {
        ctx.moveTo(X(pike ? 0.1 : 0.04), V(-0.94));
        ctx.lineTo(X(pike ? -0.06 : -0.14), V(pike ? -1.85 : -1.6));
        ctx.quadraticCurveTo(X(pike ? -0.12 : -0.22), V(-1.2), X(pike ? -0.2 : -0.36), V(-0.9));
      },
      finLight,
      finBase,
      gUp
    );
    if (pike) {
      // widely separated second dorsal, mirrored by the anal fin
      fin(
        () => {
          ctx.moveTo(X(-0.5), V(-0.8));
          ctx.lineTo(X(-0.66) + sw * 0.5, V(-1.7));
          ctx.quadraticCurveTo(X(-0.7), V(-1.1), X(-0.78), V(-0.6));
        },
        finLight,
        finBase,
        gUp
      );
    }
    fin(
      () => {
        ctx.moveTo(X(-0.5), V(0.8));
        ctx.lineTo(X(-0.66) + sw * 0.5, V(pike ? 1.66 : 1.34));
        ctx.quadraticCurveTo(X(-0.7), V(1.05), X(-0.78), V(0.6));
      },
      finLight,
      finBase,
      gDn
    );
    fin(
      () => {
        ctx.moveTo(X(0.04), V(0.92));
        ctx.lineTo(X(-0.14), V(pike ? 1.6 : 1.4));
        ctx.lineTo(X(-0.16), V(0.92));
      },
      finLight,
      finBase,
      gDn
    );
  } else if (st === "clown") {
    // Image 7: Tall two-lobed Nemo dorsal, plump anal & pelvic fins — crisp white base sub-rim + bold black outer margins!
    const clownFin = (build: () => void, g: [number, number, number, number], rList?: number[][]) => {
      fin(build, "#ff9c24", "#e8640a", g, { margin: "#ffffff", marginW: 4.3, rays: rList });
      ctx.save();
      ctx.beginPath();
      build();
      ctx.closePath();
      ctx.clip();
      ctx.strokeStyle = BLK;
      ctx.lineWidth = rim * 2.5;
      ctx.stroke();
      ctx.restore();
    };
    clownFin(
      () => {
        ctx.moveTo(X(0.32), V(-0.8));
        ctx.bezierCurveTo(X(0.24), V(-1.46), X(-0.06), V(-1.44), X(-0.16), V(-1.02));
        ctx.bezierCurveTo(X(-0.34), V(-1.32), X(-0.68), V(-1.3), X(-0.78) + sw, V(-0.86));
        ctx.quadraticCurveTo(X(-0.82), V(-0.62), X(-0.76), V(-0.24));
      },
      gUp,
      rays(X(0.26), V(-0.8), X(-0.76), V(-0.4), X(0.08), V(-1.4), X(-0.76), V(-0.94), 9)
    );
    clownFin(
      () => {
        ctx.moveTo(X(-0.2), V(0.78));
        ctx.bezierCurveTo(X(-0.3), V(1.32), X(-0.74), V(1.24), X(-0.82) + sw, V(0.72));
        ctx.lineTo(X(-0.76), V(0.22));
      },
      gDn,
      rays(X(-0.24), V(0.8), X(-0.76), V(0.4), X(-0.45), V(1.22), X(-0.8), V(0.8), 5)
    );
    clownFin(
      () => {
        ctx.moveTo(X(0.16), V(0.84));
        ctx.bezierCurveTo(X(0.18), V(1.36), X(-0.14) + sw * 0.5, V(1.38), X(-0.18), V(1.14));
        ctx.quadraticCurveTo(X(-0.1), V(0.94), X(-0.02), V(0.84));
      },
      gDn
    );
  } else if (st === "shark") {
    // Image 7: Bruce Great White Shark — sleek slate-blue-grey fins with ZERO black tips!
    fin(
      () => {
        ctx.moveTo(X(0.16), V(-0.9));
        ctx.quadraticCurveTo(X(-0.02), V(-1.7), X(-0.34) + sw * 0.4, V(-1.92));
        ctx.quadraticCurveTo(X(-0.24), V(-1.26), X(-0.4), V(-0.76));
      },
      finLight,
      finBase,
      gUp
    );
    fin(
      () => {
        ctx.moveTo(X(-0.56), V(-0.58));
        ctx.quadraticCurveTo(X(-0.64), V(-0.88), X(-0.74) + sw * 0.4, V(-0.96));
        ctx.quadraticCurveTo(X(-0.72), V(-0.68), X(-0.8), V(-0.42));
      },
      finLight,
      finBase,
      gUp
    );
    fin(
      () => {
        ctx.moveTo(X(-0.56), V(0.56));
        ctx.lineTo(X(-0.7) + sw * 0.4, V(0.88));
        ctx.quadraticCurveTo(X(-0.72), V(0.62), X(-0.8), V(0.38));
      },
      "#eef4fa",
      "#b6c4d4",
      gDn
    );
    fin(
      () => {
        ctx.moveTo(X(-0.32), V(0.76));
        ctx.lineTo(X(-0.52), V(1.08));
        ctx.lineTo(X(-0.54), V(0.64));
      },
      "#eef4fa",
      "#b6c4d4",
      gDn
    );
  } else if (st === "leopard") {
    // Image 6: Leopard Shark — spotted dorsal fins + small pelvic & anal fins
    const spotCol = pal.spot || "#4d2311";
    const d1 = () => {
      ctx.moveTo(X(0.16), V(-0.86));
      ctx.quadraticCurveTo(X(0.02), V(-1.62), X(-0.22) + sw * 0.4, V(-1.74));
      ctx.quadraticCurveTo(X(-0.18), V(-1.18), X(-0.34), V(-0.78));
    };
    fin(d1, finLight, finBase, gUp);
    dip(d1, X(-0.08), V(-1.32), ry * 0.22, spotCol);
    dip(d1, X(-0.18), V(-1.02), ry * 0.16, spotCol);
    fin(
      () => {
        ctx.moveTo(X(-0.54), V(-0.62));
        ctx.lineTo(X(-0.68) + sw * 0.4, V(-1.06));
        ctx.quadraticCurveTo(X(-0.7), V(-0.72), X(-0.78), V(-0.46));
      },
      finLight,
      finBase,
      gUp
    );
    fin(
      () => {
        ctx.moveTo(X(-0.54), V(0.6));
        ctx.lineTo(X(-0.68) + sw * 0.4, V(0.96));
        ctx.quadraticCurveTo(X(-0.7), V(0.68), X(-0.78), V(0.44));
      },
      finLight,
      finBase,
      gDn
    );
    fin(
      () => {
        ctx.moveTo(X(-0.2), V(0.84));
        ctx.lineTo(X(-0.42), V(1.24));
        ctx.lineTo(X(-0.46), V(0.76));
      },
      finLight,
      finBase,
      gDn
    );
  } else if (st === "tang") {
    // Blue tang: low continuous dorsal & anal fins edged in black
    const edge = pal.stripe || "#0b1026";
    fin(
      () => {
        ctx.moveTo(X(0.5), V(-0.72));
        ctx.bezierCurveTo(X(0.2), V(-1.2), X(-0.5), V(-1.26), X(-0.93) + sw, V(-0.92));
        ctx.quadraticCurveTo(X(-0.97), V(-0.5), X(-0.86), V(-0.1));
        ctx.lineTo(X(-0.2), V(-0.5));
      },
      finLight,
      finBase,
      gUp,
      { rays: rays(X(0.4), V(-0.75), X(-0.8), V(-0.4), X(0.25), V(-1.18), X(-0.93), V(-1.0), 11), margin: edge, marginW: 2.2 }
    );
    fin(
      () => {
        ctx.moveTo(X(0.06), V(0.9));
        ctx.bezierCurveTo(X(-0.2), V(1.2), X(-0.6), V(1.26), X(-0.93) + sw, V(0.9));
        ctx.quadraticCurveTo(X(-0.97), V(0.5), X(-0.86), V(0.1));
        ctx.lineTo(X(-0.2), V(0.5));
      },
      finLight,
      finBase,
      gDn,
      { rays: rays(X(0.0), V(0.85), X(-0.8), V(0.4), X(-0.2), V(1.2), X(-0.93), V(0.98), 9), margin: edge, marginW: 2.2 }
    );
    fin(
      () => {
        ctx.moveTo(X(0.36), V(0.86));
        ctx.quadraticCurveTo(X(0.28), V(1.16), X(0.08) + sw * 0.5, V(1.34));
        ctx.quadraticCurveTo(X(0.12), V(1.05), X(0.16), V(0.92));
      },
      finLight,
      finBase,
      gDn
    );
  } else if (st === "idol") {
    // Image 5: Dramatic soaring white-and-black sickle dorsal streamer sweeping up & far back + sharp pointed anal fin + twin pelvic blades!
    const blk = pal.stripe || "#1b0b26";
    const dorsal = () => {
      ctx.moveTo(X(0.1), V(-0.82));
      ctx.bezierCurveTo(X(-0.04), V(-1.42), X(-0.36), V(-1.68), X(-0.92) + sw, V(-1.54));
      ctx.bezierCurveTo(X(-1.38) + sw * 1.8, V(-1.42), X(-1.82) + sw * 2.8, V(-1.22) + wag * ry * 0.08, X(-2.12) + sw * 3.4, V(-1.22) + wag * ry * 0.12);
      ctx.bezierCurveTo(X(-1.46) + sw * 1.4, V(-1.3), X(-0.66) + sw * 0.4, V(-1.36), X(-0.28), V(-0.74));
      ctx.lineTo(X(-0.54), V(-0.22));
      ctx.lineTo(X(-0.12), V(-0.5));
    };
    fin(dorsal, "#ffffff", "#f6ecc2", gUp);
    // Purple-black stripe along the inner underside of the sweeping dorsal streamer (Image 5!)
    ctx.save();
    ctx.beginPath();
    dorsal();
    ctx.closePath();
    ctx.clip();
    ctx.beginPath();
    ctx.moveTo(X(-0.28), V(-0.72));
    ctx.bezierCurveTo(X(-0.46), V(-1.34), X(-1.05) + sw, V(-1.44), X(-1.45) + sw * 2, V(-1.34));
    ctx.lineTo(X(-0.62), V(-1.12));
    ctx.lineTo(X(-0.52), V(-0.24));
    ctx.closePath();
    ctx.fillStyle = blk;
    ctx.fill();
    ctx.restore();

    const anal = () => {
      ctx.moveTo(X(0.06), V(0.84));
      ctx.bezierCurveTo(X(-0.04), V(1.16), X(-0.08), V(1.36), X(-0.12) + sw * 0.5, V(1.48));
      ctx.quadraticCurveTo(X(-0.32), V(1.02), X(-0.54), V(0.18));
      ctx.lineTo(X(-0.12), V(0.5));
    };
    fin(anal, "#fffcf2", "#f6ecc2", gDn);
    dip(anal, X(-0.34), V(0.76), ry * 0.46, blk);

    // Twin tapered dark purple-black pelvic blades below chest (Image 5)
    for (const dxP of [0.24, 0.12]) {
      fin(
        () => {
          ctx.moveTo(X(dxP), V(0.66));
          ctx.quadraticCurveTo(X(dxP - 0.04), V(0.98), X(dxP - 0.1) + sw * 0.3, V(1.22));
          ctx.quadraticCurveTo(X(dxP + 0.02), V(0.9), X(dxP - 0.05), V(0.74));
        },
        blk,
        "#0d0614",
        gDn
      );
    }
  } else if (st === "sailfish") {
    // Sailfish: enormous sail-like dorsal, tiny second dorsal, twin anal fins, thread-like pelvic fins
    const sail = () => {
      ctx.moveTo(X(0.56), V(-0.72));
      const n = 10;
      for (let i = 0; i <= n; i++) {
        const f = i / n;
        const tx = X(0.46 - f * 0.92) + sw * (0.6 + f),
          ty = V(-(2.3 + Math.sin(f * Math.PI) * 0.95 - (i === 0 ? 0.5 : 0)));
        if (i === 0) ctx.lineTo(tx, ty);
        else ctx.quadraticCurveTo(X(0.46 - (f - 0.5 / n) * 0.92) + sw * (0.6 + f), ty + ry * 0.34, tx, ty);
      }
      ctx.quadraticCurveTo(X(-0.56), V(-1.6), X(-0.6), V(-0.66));
    };
    fin(sail, finLight, finBase, [bx, V(-3.2), bx, V(-0.7)], { rays: rays(X(0.5), V(-0.75), X(-0.55), V(-0.7), X(0.46), V(-2.6), X(-0.46), V(-2.6), 11) });
    ctx.save();
    ctx.beginPath();
    sail();
    ctx.closePath();
    ctx.clip();
    ctx.fillStyle = rgbaHex(pal.spot || "#0c1a4c", 0.75);
    for (let i = 0; i < 18; i++) {
      const u = 0.4 - ((i * 0.7548776662) % 1) * 0.86,
        v = -(1.1 + ((i * 0.5698402909 + 0.3) % 1) * 1.8);
      ctx.beginPath();
      ctx.arc(X(u), V(v), rx * 0.028, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    fin(
      () => {
        ctx.moveTo(X(-0.64), V(-0.62));
        ctx.lineTo(X(-0.76) + sw * 0.5, V(-1.34));
        ctx.lineTo(X(-0.82), V(-0.5));
      },
      finLight,
      finBase,
      gUp
    );
    fin(
      () => {
        ctx.moveTo(X(-0.3), V(0.84));
        ctx.lineTo(X(-0.48) + sw * 0.4, V(1.7));
        ctx.lineTo(X(-0.54), V(0.8));
      },
      finLight,
      finBase,
      gDn
    );
    fin(
      () => {
        ctx.moveTo(X(-0.64), V(0.62));
        ctx.lineTo(X(-0.76) + sw * 0.5, V(1.3));
        ctx.lineTo(X(-0.82), V(0.5));
      },
      finLight,
      finBase,
      gDn
    );
    ctx.beginPath();
    ctx.moveTo(X(0.22), V(0.88));
    ctx.quadraticCurveTo(X(0.05), V(1.6), X(-0.3) + sw, V(2.05));
    ctx.strokeStyle = out(0.6);
    ctx.lineWidth = Math.max(1.6, rx * 0.045);
    ctx.stroke();
    ctx.strokeStyle = finBase;
    ctx.lineWidth = Math.max(1, rx * 0.025);
    ctx.stroke();
  } else if (st === "puffer") {
    // Porcupine pufferfish: a ring of short spines around the body + small soft fins set far back
    ctx.fillStyle = "#fff6dc";
    ctx.strokeStyle = out(0.6);
    ctx.lineWidth = rim * 0.7;
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2 + 0.14;
      const c = Math.cos(a),
        sn = Math.sin(a);
      if (c > 0.72 || c < -0.9) continue; // keep the face & the tail stalk clear
      const bx0 = X(c * 0.92 - 0.04),
        by0 = V(sn * 0.94);
      const len = ry * (0.2 + (i % 2) * 0.06) * (1 + wag2 * 0.05);
      const px = -sn * rx * 0.05,
        py = c * ry * 0.05;
      ctx.beginPath();
      ctx.moveTo(bx0 + px, by0 + py);
      ctx.lineTo(bx0 + c * len, by0 + sn * len);
      ctx.lineTo(bx0 - px, by0 - py);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    fin(
      () => {
        ctx.moveTo(X(-0.42), V(-0.84));
        ctx.bezierCurveTo(X(-0.46), V(-1.2), X(-0.82), V(-1.14), X(-0.84) + sw, V(-0.62));
        ctx.lineTo(X(-0.74), V(-0.36));
      },
      finLight,
      finBase,
      gUp,
      { rays: rays(X(-0.46), V(-0.8), X(-0.76), V(-0.4), X(-0.52), V(-1.14), X(-0.84), V(-0.72), 5) }
    );
    fin(
      () => {
        ctx.moveTo(X(-0.44), V(0.82));
        ctx.bezierCurveTo(X(-0.48), V(1.16), X(-0.82), V(1.1), X(-0.84) + sw, V(0.6));
        ctx.lineTo(X(-0.74), V(0.36));
      },
      finLight,
      finBase,
      gDn,
      { rays: rays(X(-0.48), V(0.8), X(-0.76), V(0.4), X(-0.54), V(1.1), X(-0.84), V(0.7), 5) }
    );
  } else if (st === "eddy") {
    // Image 4: Deep-sea anglerfish — small tattered dorsal ridges & anal fin along the tapering rear stalk
    fin(
      () => {
        ctx.moveTo(X(-0.18), V(-0.62));
        ctx.lineTo(X(-0.28), V(-0.92));
        ctx.lineTo(X(-0.4), V(-0.7));
        ctx.lineTo(X(-0.52), V(-0.86));
        ctx.lineTo(X(-0.66), V(-0.56));
        ctx.lineTo(X(-0.78), V(-0.24));
      },
      finLight,
      finBase,
      gUp
    );
    fin(
      () => {
        ctx.moveTo(X(-0.26), V(0.58));
        ctx.lineTo(X(-0.38), V(0.88));
        ctx.lineTo(X(-0.54), V(0.62));
        ctx.lineTo(X(-0.66), V(0.8));
        ctx.lineTo(X(-0.78), V(0.28));
      },
      finLight,
      finBase,
      gDn
    );
  } else if (st === "parrot") {
    // Image 1: Long sweeping rounded emerald-teal dorsal & anal fins with deep navy-cobalt outer margin
    fin(
      () => {
        ctx.moveTo(X(0.4), V(-0.88));
        ctx.bezierCurveTo(X(0.02), V(-1.34), X(-0.56), V(-1.36), X(-0.82) + sw, V(-0.9));
        ctx.quadraticCurveTo(X(-0.84), V(-0.52), X(-0.7), V(-0.28));
      },
      "#0d3b82",
      "#149860",
      gUp,
      { rays: rays(X(0.28), V(-0.88), X(-0.66), V(-0.46), X(-0.08), V(-1.3), X(-0.8), V(-0.9), 9), margin: "#0d3b82", marginW: 2.3 }
    );
    fin(
      () => {
        ctx.moveTo(X(0.02), V(0.84));
        ctx.bezierCurveTo(X(-0.22), V(1.24), X(-0.62), V(1.26), X(-0.8) + sw, V(0.82));
        ctx.quadraticCurveTo(X(-0.78), V(0.48), X(-0.72), V(0.26));
      },
      "#0d3b82",
      "#149860",
      gDn,
      { rays: rays(X(-0.04), V(0.82), X(-0.66), V(0.44), X(-0.28), V(1.2), X(-0.78), V(0.8), 6), margin: "#0d3b82", marginW: 2.3 }
    );
  } else {
    // Grouper (and any other perch-like fish): spiny serrated front dorsal + rounded soft rear lobe
    fin(
      () => {
        ctx.moveTo(X(0.34), V(-0.78));
        for (let i = 0; i < 7; i++) {
          ctx.lineTo(X(0.28 - i * 0.1), V(-1.26 + Math.abs(i - 2) * 0.03));
          ctx.lineTo(X(0.22 - i * 0.1), V(-1.04));
        }
        ctx.bezierCurveTo(X(-0.56), V(-1.36), X(-0.88), V(-1.2), X(-0.9) + sw, V(-0.72));
        ctx.quadraticCurveTo(X(-0.9), V(-0.4), X(-0.82), V(-0.18));
        ctx.lineTo(X(-0.2), V(-0.6));
      },
      finLight,
      finBase,
      gUp,
      { rays: rays(X(0.3), V(-0.8), X(-0.82), V(-0.4), X(0.26), V(-1.25), X(-0.9), V(-1.0), 11) }
    );
    fin(
      () => {
        ctx.moveTo(X(-0.24), V(0.82));
        ctx.bezierCurveTo(X(-0.38), V(1.28), X(-0.82), V(1.22), X(-0.86) + sw, V(0.74));
        ctx.lineTo(X(-0.8), V(0.18));
      },
      finLight,
      finBase,
      gDn,
      { rays: rays(X(-0.28), V(0.8), X(-0.8), V(0.4), X(-0.4), V(1.2), X(-0.86), V(0.8), 6) }
    );
    fin(
      () => {
        ctx.moveTo(X(0.3), V(0.86));
        ctx.quadraticCurveTo(X(0.28), V(1.34), X(0.0) + sw * 0.5, V(1.26));
        ctx.quadraticCurveTo(X(0.02), V(1.0), X(0.08), V(0.9));
      },
      finLight,
      finBase,
      gDn
    );
  }

  // ---------- 3. HINGED OPEN MOUTH INTERIOR (exact match to upper & lower jaw geometry!) ----------
  const jaw = getJawGeometry(sp, bx, rx, ry, jawState);
  const mouthOpenAmt = st === "shark" ? Math.max(open, puff ? 0.15 : 0.44) : open;
  if (mouthOpenAmt > 0) {
    const { hingeX: rawHx, hingeY: rawHy, upperTipX: rawUx, upperTipY: rawUy, lowerTipX: rawLx, lowerTipY: rawLy } = jaw;
    const hingeX = st === "shark" ? X(0.52) : rawHx;
    const hingeY = st === "shark" ? ry * 0.1 : rawHy;
    const upperTipX = st === "shark" ? X(1.06) : rawUx;
    const upperTipY = st === "shark" ? ry * 0.02 - mouthOpenAmt * ry * 0.14 : rawUy;
    const lowerTipX = st === "shark" ? X(0.94 - mouthOpenAmt * 0.04) : rawLx;
    const lowerTipY = st === "shark" ? ry * (0.28 + mouthOpenAmt * 0.46) : rawLy;
    const jawDrop = Math.max(ry * 0.1, lowerTipY - upperTipY);

    ctx.beginPath();
    ctx.moveTo(upperTipX, upperTipY);
    ctx.quadraticCurveTo((upperTipX + lowerTipX) * 0.48, (upperTipY + lowerTipY) * 0.5, lowerTipX, lowerTipY);
    ctx.lineTo(hingeX - rx * 0.06, hingeY + ry * 0.12);
    ctx.lineTo(hingeX - rx * 0.06, hingeY - ry * 0.12);
    ctx.closePath();
    const mg = ctx.createRadialGradient(
      hingeX + rx * 0.06,
      hingeY + jawDrop * 0.15,
      ry * 0.04,
      (upperTipX + lowerTipX) * 0.5,
      (upperTipY + lowerTipY) * 0.5,
      Math.max(ry * 0.55, rx * 0.22)
    );
    mg.addColorStop(0, "#2b060f");
    mg.addColorStop(0.65, "#6b1528");
    mg.addColorStop(1, "#9c283e");
    ctx.fillStyle = mg;
    ctx.fill();

    ctx.save();
    ctx.clip();
    ctx.beginPath();
    ctx.ellipse((hingeX + lowerTipX) * 0.52, (hingeY + lowerTipY) * 0.5 + ry * 0.02, rx * (0.18 + mouthOpenAmt * 0.06), ry * (0.1 + mouthOpenAmt * 0.08), 0.14, 0, Math.PI * 2);
    ctx.fillStyle = "#e85d88";
    ctx.fill();
    if (sp.teeth || sp.underbite) {
      ctx.fillStyle = "#fffaf2";
      const nT = st === "eddy" || st === "barracuda" || st === "shark" ? 5 : 3;
      const tw = rx * (nT === 5 ? (st === "shark" ? 0.042 : 0.028) : 0.04),
        tlen = st === "eddy" ? 0.28 : st === "shark" ? 0.24 : 0.14;
      for (let i = 0; i < nT; i++) {
        const t = (i + 0.5) / nT;
        const k = 0.24 + t * 0.7;
        const ux = hingeX + (upperTipX - hingeX) * k,
          uy = hingeY + (upperTipY - hingeY) * k;
        ctx.beginPath();
        ctx.moveTo(ux - tw, uy - ry * 0.02);
        ctx.lineTo(ux, uy + ry * tlen * mouthOpenAmt + ry * 0.04);
        ctx.lineTo(ux + tw, uy - ry * 0.02);
        ctx.closePath();
        ctx.fill();
        const lx = hingeX + (lowerTipX - hingeX) * k,
          ly = hingeY + (lowerTipY - hingeY) * k;
        ctx.beginPath();
        ctx.moveTo(lx - tw, ly + ry * 0.03);
        ctx.lineTo(lx, ly - ry * (tlen + 0.03) * mouthOpenAmt - ry * 0.04);
        ctx.lineTo(lx + tw, ly + ry * 0.03);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.restore();
  }

  // ---------- 4. BODY: soft airbrushed volume + species markings ----------
  buildBodyPath(ctx, sp, bx, rx, ry, jawState);
  const baseGrad = ctx.createLinearGradient(bx, -ry * 1.05, bx, ry * 1.05);
  baseGrad.addColorStop(0, pal.dark);
  baseGrad.addColorStop(0.45, pal.body);
  baseGrad.addColorStop(0.85, mixHex(pal.body, pal.belly, 0.5));
  baseGrad.addColorStop(1, mixHex(pal.dark, pal.belly, 0.35));
  ctx.fillStyle = baseGrad;
  ctx.fill();

  ctx.save();
  ctx.clip();

  if (st !== "orca") {
    const coreGrad = ctx.createRadialGradient(X(-0.05), -ry * 0.05, ry * 0.08, X(-0.05), 0, Math.max(rx, ry) * 0.95);
    coreGrad.addColorStop(0, mixHex(pal.belly, "#ffffff", 0.25));
    coreGrad.addColorStop(0.52, rgbaHex(pal.body, 0.35));
    coreGrad.addColorStop(1, rgbaHex(pal.dark, 0.65));
    ctx.fillStyle = coreGrad;
    ctx.fillRect(X(-1.3), -ry * 1.3, rx * 2.7, ry * 2.6);
  }
  if (st === "minnow" || st === "barracuda" || st === "sailfish") {
    // counter-shading of open-water fish: dark blue-green back, mirror-silver flanks
    const cs = ctx.createLinearGradient(0, -ry, 0, ry * 0.2);
    cs.addColorStop(0, rgbaHex(pal.dark, 0.85));
    cs.addColorStop(1, rgbaHex(pal.dark, 0));
    ctx.fillStyle = cs;
    ctx.fillRect(X(-1.2), -ry * 1.2, rx * 2.6, ry * 1.4);
  }

  // overlapping scales on the flank (large sprites only)
  if (W >= 200 && st !== "orca" && st !== "eddy" && st !== "barracuda" && st !== "minnow" && st !== "shark" && st !== "puffer" && st !== "sailfish" && st !== "leon") {
    ctx.strokeStyle = rgbaHex(pal.dark, 0.2);
    ctx.lineWidth = Math.max(0.8, W * 0.004);
    const sr = rx * 0.085;
    for (let j = -6; j <= 6; j++)
      for (let i = -8; i <= 2; i++) {
        ctx.beginPath();
        ctx.arc(X(i * 0.15 + (j & 1 ? 0.075 : 0)), j * sr * 1.45, sr, Math.PI - 1.05, Math.PI + 1.05);
        ctx.stroke();
      }
  }

  const band = (u: number, w: number, bow: number, col: string, top = -1.2, bot = 1.2) => {
    ctx.beginPath();
    ctx.moveTo(X(u - w / 2 + 0.03), V(top));
    ctx.quadraticCurveTo(X(u - w / 2 - 0.06 + bow), V((top + bot) / 2), X(u - w / 2 + 0.03), V(bot));
    ctx.lineTo(X(u + w / 2 + 0.03), V(bot));
    ctx.quadraticCurveTo(X(u + w / 2 - 0.04 + bow * 1.6), V((top + bot) / 2), X(u + w / 2 + 0.03), V(top));
    ctx.closePath();
    ctx.fillStyle = col;
    ctx.fill();
  };

  if (st === "orca") {
    // white chin/belly with the flank lobe sweeping up behind the dorsal fin
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.moveTo(X(1.15), V(0.2));
    ctx.bezierCurveTo(X(0.55), V(0.24), X(0.1), V(0.5), X(-0.2), V(0.4));
    ctx.bezierCurveTo(X(-0.42), V(0.3), X(-0.56), V(-0.12), X(-0.78), V(0.06));
    ctx.quadraticCurveTo(X(-0.56), V(0.44), X(-1.05), V(0.5));
    ctx.lineTo(X(-1.05), V(1.3));
    ctx.lineTo(X(1.2), V(1.3));
    ctx.closePath();
    ctx.fill();
    // oval white eye patch above & behind the eye
    ctx.save();
    ctx.translate(X(0.47), V(-0.4));
    ctx.rotate(-0.2);
    ctx.beginPath();
    ctx.ellipse(0, 0, rx * 0.2, ry * 0.15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // grey saddle patch behind the dorsal fin
    ctx.fillStyle = "rgba(150, 160, 180, 0.55)";
    ctx.beginPath();
    ctx.moveTo(X(-0.34), V(-0.82));
    ctx.quadraticCurveTo(X(-0.5), V(-0.3), X(-0.24), V(-0.24));
    ctx.quadraticCurveTo(X(-0.56), V(-0.4), X(-0.72), V(-0.62));
    ctx.quadraticCurveTo(X(-0.5), V(-0.84), X(-0.34), V(-0.82));
    ctx.fill();
  } else if (st === "andy") {
    // curved vertical bars with dark edging (regal / flame angelfish pattern)
    const stCol = pal.stripe || "#df22ff";
    const stGlow = mixHex(stCol, "#ffffff", 0.42);
    for (const [u, k] of [[-0.68, 0.8], [-0.42, 1], [-0.15, 1.05], [0.12, 1], [0.38, 0.85]]) {
      const w = rx * 0.085 * k;
      ctx.beginPath();
      ctx.moveTo(X(u + 0.08), V(-1.15));
      ctx.quadraticCurveTo(X(u - 0.13), 0, X(u + 0.08), V(1.15));
      ctx.strokeStyle = rgbaHex(pal.dark, 0.6);
      ctx.lineWidth = w * 1.75;
      ctx.stroke();
      ctx.strokeStyle = stCol;
      ctx.lineWidth = w;
      ctx.stroke();
      ctx.strokeStyle = rgbaHex(stGlow, 0.7);
      ctx.lineWidth = w * 0.36;
      ctx.stroke();
    }
  } else if (st === "boris") {
    // Image 2: Ice-blue flank with subtle pale vertical rib stripes, deep royal-blue eye bar, two wavy royal-blue saddle patches, and blue tail-base dot!
    ctx.strokeStyle = rgbaHex(pal.dark, 0.34);
    ctx.lineWidth = Math.max(1, rx * 0.025);
    for (let i = -7; i <= 5; i++) {
      const u = i * 0.12;
      ctx.beginPath();
      ctx.moveTo(X(u), V(-1.05));
      ctx.quadraticCurveTo(X(u - 0.08), 0, X(u), V(1.05));
      ctx.stroke();
    }
    const patchCol = pal.stripe || "#2e52b2";
    const patchRim = pal.spot || "#16245c";
    // Front wavy royal-blue saddle patch
    ctx.fillStyle = patchCol;
    ctx.strokeStyle = patchRim;
    ctx.lineWidth = Math.max(1.2, rim * 1.1);
    ctx.beginPath();
    ctx.moveTo(X(0.32), V(-0.92));
    ctx.bezierCurveTo(X(0.38), V(-0.35), X(-0.08), V(-0.2), X(0.08), V(0.56));
    ctx.quadraticCurveTo(X(0.2), V(0.84), X(0.32), V(0.58));
    ctx.bezierCurveTo(X(0.28), V(0.05), X(0.48), V(-0.25), X(0.46), V(-0.88));
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Rear wavy royal-blue saddle patch
    ctx.beginPath();
    ctx.moveTo(X(-0.18), V(-0.95));
    ctx.bezierCurveTo(X(-0.12), V(-0.35), X(-0.46), V(-0.1), X(-0.56), V(0.56));
    ctx.quadraticCurveTo(X(-0.62), V(0.82), X(-0.74), V(0.66));
    ctx.bezierCurveTo(X(-0.86), V(0.15), X(-0.78), V(-0.52), X(-0.54), V(-0.9));
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Dark blue eye band & blue snout tip
    ctx.fillStyle = patchRim;
    ctx.beginPath();
    ctx.moveTo(X(0.76), V(-1.1));
    ctx.quadraticCurveTo(X(0.86), V(-0.15), X(0.64), V(1.05));
    ctx.lineTo(X(0.48), V(1.05));
    ctx.quadraticCurveTo(X(0.66), V(-0.15), X(0.58), V(-1.1));
    ctx.closePath();
    ctx.fill();

    // Dark royal-blue spot at tail peduncle
    ctx.fillStyle = "#1032b8";
    ctx.beginPath();
    ctx.arc(X(-0.86), V(0.0), ry * 0.14, 0, Math.PI * 2);
    ctx.fill();
  } else if (st === "parrot") {
    // Image 1: Napoleon Wrasse — 10 dark-green wavy zigzags painted FIRST, then diagonal cyan head + full cyan forehead crown + deep cobalt chin OVER front!
    ctx.strokeStyle = rgbaHex(pal.spot || "#095424", 0.72);
    ctx.lineWidth = Math.max(1.0, rx * 0.025);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (let c = 0; c < 10; c++) {
      const u = 0.4 - c * 0.14;
      ctx.beginPath();
      for (let s = 0; s <= 12; s++) {
        const vv = -0.9 + s * 0.15;
        const xx = X(u + (s % 2 ? 0.028 : -0.028));
        if (s === 0) ctx.moveTo(xx, V(vv));
        else ctx.lineTo(xx, V(vv));
      }
      ctx.stroke();
    }

    // Diagonal turquoise-cyan head transition (paints over front zigzags so forehead & snout stay spotless)
    const headDiag = ctx.createLinearGradient(X(0.1), V(-0.2), X(0.56), V(0.06));
    headDiag.addColorStop(0, "rgba(20, 180, 216, 0)");
    headDiag.addColorStop(0.42, "rgba(20, 180, 216, 0.88)");
    headDiag.addColorStop(0.72, "#14b4d8");
    headDiag.addColorStop(1, "#1cd0ea");
    ctx.fillStyle = headDiag;
    ctx.fillRect(X(-0.02), V(-1.2), rx * 1.45, ry * 2.4);

    // Extra cyan coverage across the entire overhanging bulbous forehead hump
    const crownG = ctx.createRadialGradient(X(0.56), V(-0.78), ry * 0.08, X(0.52), V(-0.68), rx * 0.56);
    crownG.addColorStop(0, "#14b8dc");
    crownG.addColorStop(0.64, "rgba(20, 174, 216, 0.88)");
    crownG.addColorStop(1, "rgba(20, 174, 216, 0)");
    ctx.fillStyle = crownG;
    ctx.fillRect(X(-0.02), V(-1.2), rx * 1.2, ry * 1.15);

    // Deep royal-cobalt lower cheek & chin shading (Image 1)
    const cg = ctx.createRadialGradient(X(0.66), V(0.62), ry * 0.08, X(0.64), V(0.56), rx * 0.6);
    cg.addColorStop(0, "rgba(14, 78, 184, 0.96)");
    cg.addColorStop(0.6, "rgba(14, 78, 184, 0.76)");
    cg.addColorStop(1, "rgba(14, 78, 184, 0)");
    ctx.fillStyle = cg;
    ctx.fillRect(X(0.02), V(-0.05), rx * 1.35, ry * 1.35);

    // Curved cobalt operculum (gill cover) arc behind cheek
    ctx.strokeStyle = "rgba(10, 59, 122, 0.74)";
    ctx.lineWidth = Math.max(1.2, rx * 0.024);
    ctx.beginPath();
    ctx.moveTo(X(0.42), V(-0.24));
    ctx.quadraticCurveTo(X(0.35), V(0.14), X(0.24), V(0.48));
    ctx.stroke();

    // Soft specular glow on the overhanging wen dome + subtle shadow in the concave brow dip
    const wenHi = ctx.createRadialGradient(X(0.76), V(-0.8), ry * 0.02, X(0.76), V(-0.8), rx * 0.22);
    wenHi.addColorStop(0, "rgba(135, 245, 255, 0.32)");
    wenHi.addColorStop(1, "rgba(135, 245, 255, 0)");
    ctx.fillStyle = wenHi;
    ctx.fillRect(X(0.45), V(-1.05), rx * 0.6, ry * 0.5);

    // Two subtle dark-teal nose wrinkle lines right above the thick upper lip (Image 1)
    ctx.strokeStyle = "rgba(7, 60, 88, 0.65)";
    ctx.lineWidth = Math.max(1.0, rx * 0.018);
    for (const d of [0, 0.05]) {
      ctx.beginPath();
      ctx.moveTo(X(0.95 + d), V(-0.15 + d * 0.4));
      ctx.quadraticCurveTo(X(1.0 + d), V(-0.09 + d * 0.3), X(1.03 + d), V(-0.01 + d * 0.2));
      ctx.stroke();
    }
  } else if (st === "layla") {
    // Image 5: 100% Queen Triggerfish — warm tangerine face -> canary-yellow upper back -> silvery-blue belly, 2 clean non-crossing blue cheek stripes & smooth crown waves!
    const faceG = ctx.createRadialGradient(X(0.74), V(-0.08), ry * 0.05, X(0.74), V(-0.08), rx * 0.86);
    faceG.addColorStop(0, "rgba(255, 134, 20, 0.96)");
    faceG.addColorStop(0.58, "rgba(255, 178, 42, 0.62)");
    faceG.addColorStop(1, "rgba(255, 210, 56, 0)");
    ctx.fillStyle = faceG;
    ctx.fillRect(X(-0.1), V(-1.1), rx * 1.4, ry * 2.2);

    const bellyG = ctx.createLinearGradient(0, V(0.08), 0, V(1.0));
    bellyG.addColorStop(0, "rgba(180, 212, 228, 0)");
    bellyG.addColorStop(0.55, "rgba(182, 214, 232, 0.86)");
    bellyG.addColorStop(1, "rgba(110, 148, 176, 0.95)");
    ctx.fillStyle = bellyG;
    ctx.fillRect(X(-1.1), V(0.04), rx * 2.3, ry * 1.1);

    const bl = pal.stripe || "#326480";
    ctx.strokeStyle = bl;
    ctx.lineWidth = Math.max(1.2, ry * 0.062);
    // Two clean parallel teal-blue cheek lines curving smoothly downward & backward (never crossing!)
    ctx.beginPath();
    ctx.moveTo(X(1.06), V(-0.04));
    ctx.quadraticCurveTo(X(0.76), V(0.14), X(0.38), V(0.46));
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(X(0.96), V(0.24));
    ctx.bezierCurveTo(X(0.68), V(0.42), X(0.46), V(0.64), X(0.36), V(0.98));
    ctx.stroke();

    // Clean concentric teal-blue forehead & back swirls (no spiky eye lines!)
    ctx.lineWidth = Math.max(1.1, ry * 0.05);
    for (const rArc of [0.16, 0.28, 0.42]) {
      ctx.beginPath();
      ctx.ellipse(X(0.04), V(-0.76), rx * rArc * 0.92, ry * rArc * 0.52, -0.06, 0, Math.PI * 1.25);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(X(0.54), V(-0.72));
    ctx.quadraticCurveTo(X(0.36), V(-0.34), X(0.36), V(0.1));
    ctx.stroke();
    // Subtle dark slate freckles scattered across silvery lower belly
    ctx.fillStyle = rgbaHex(pal.spot || "#4e6e84", 0.55);
    for (const [u, v] of [[-0.45, 0.42], [-0.28, 0.56], [-0.1, 0.46], [0.06, 0.62], [-0.36, 0.7], [-0.58, 0.28], [0.18, 0.52]]) {
      ctx.beginPath();
      ctx.arc(X(u), V(v), rx * 0.025, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (st === "pierre") {
    // coral grouper: many small pale-blue spots with dark halos over head and body
    for (let i = 0; i < 30; i++) {
      const u = -0.9 + ((i * 0.7548776662 + 0.31) % 1) * 1.75,
        v = -0.85 + ((i * 0.5698402909 + 0.17) % 1) * 1.6,
        r = rx * (0.03 + (i % 3) * 0.008);
      ctx.fillStyle = rgbaHex(pal.dark, 0.45);
      ctx.beginPath();
      ctx.arc(X(u), V(v), r * 1.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = rgbaHex(pal.spot || "#ffffff", 0.92);
      ctx.beginPath();
      ctx.arc(X(u), V(v), r, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (st === "leon") {
    // Image 4: Alternating cream-yellow & golden-olive vertical stripes across body + angled cheek stripes down the sloping snout!
    for (let i = 0; i < 9; i++) {
      const u = -0.82 + i * 0.175;
      band(u, i % 2 ? 0.042 : 0.068, 0.025, i % 2 ? rgbaHex(pal.dark, 0.55) : pal.stripe || "#f5f4c8");
    }
    // Diagonal snout & cheek stripes matching Image 4
    ctx.strokeStyle = rgbaHex(pal.stripe || "#f5f4c8", 0.88);
    ctx.lineWidth = Math.max(1.1, rx * 0.042);
    for (const dxC of [0.68, 0.82, 0.96]) {
      ctx.beginPath();
      ctx.moveTo(X(dxC - 0.1), V(-0.42));
      ctx.quadraticCurveTo(X(dxC + 0.02), V(0.05), X(dxC - 0.12), V(0.52));
      ctx.stroke();
    }
    // Fleshy rounded golden lip cushion at tip of elongated snout (Image 4!)
    ctx.fillStyle = "#e8c828";
    ctx.beginPath();
    ctx.ellipse(jaw.upperTipX - rx * 0.04, (jaw.upperTipY + jaw.lowerTipY) * 0.5, rx * 0.11, ry * 0.085, 0.05, 0, Math.PI * 2);
    ctx.fill();
  } else if (st === "peter") {
    // Image 4: 100% Peter Fish — deep emerald-green body with bold golden-yellow wavy longitudinal bands, thumbprint spot, cheek wedge & black tail bar!
    const gold = pal.stripe || "#ffe61c";
    const ring = "#e8f68c";
    ctx.fillStyle = gold;
    // Top golden sweeping band
    ctx.beginPath();
    ctx.moveTo(X(0.42), V(-0.32));
    ctx.bezierCurveTo(X(0.08), V(-0.58), X(-0.34), V(-0.42), X(-0.84), V(-0.08));
    ctx.bezierCurveTo(X(-0.36), V(-0.18), X(0.06), V(-0.28), X(0.38), V(-0.14));
    ctx.closePath();
    ctx.fill();
    // Middle-lower golden sweeping band
    ctx.beginPath();
    ctx.moveTo(X(0.24), V(0.24));
    ctx.bezierCurveTo(X(-0.12), V(0.06), X(-0.48), V(0.06), X(-0.84), V(-0.02));
    ctx.bezierCurveTo(X(-0.46), V(0.24), X(-0.1), V(0.28), X(0.22), V(0.36));
    ctx.closePath();
    ctx.fill();
    // Bottom golden sweeping band
    ctx.beginPath();
    ctx.moveTo(X(0.48), V(0.66));
    ctx.bezierCurveTo(X(0.06), V(0.44), X(-0.38), V(0.56), X(-0.78), V(0.1));
    ctx.bezierCurveTo(X(-0.38), V(0.76), X(0.06), V(0.72), X(0.48), V(0.78));
    ctx.closePath();
    ctx.fill();
    // Yellow cheek wedge & forehead spots (Image 4)
    ctx.beginPath();
    ctx.moveTo(X(0.84), V(0.1));
    ctx.lineTo(X(0.64), V(0.28));
    ctx.lineTo(X(0.74), V(0.46));
    ctx.closePath();
    ctx.fill();
    for (const [u, v, r] of [[0.32, -0.68, 0.07], [0.06, -0.74, 0.08], [-0.24, -0.66, 0.06], [0.56, 0.14, 0.05], [0.48, 0.36, 0.045]]) {
      ctx.beginPath();
      ctx.ellipse(X(u), V(v), rx * r * 1.2, ry * r, -0.2, 0, Math.PI * 2);
      ctx.fill();
    }
    // Famous dark oval thumbprint spot ringed cleanly in bright pale-yellow!
    ctx.fillStyle = ring;
    ctx.beginPath();
    ctx.ellipse(X(-0.08), V(-0.02), rx * 0.22, ry * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = pal.spot || "#101a10";
    ctx.beginPath();
    ctx.ellipse(X(-0.08), V(-0.02), rx * 0.17, ry * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
    // Crisp black vertical bar right at the tail base (Image 4)
    band(-0.96, 0.12, 0, "#0b140b");
  } else if (st === "eddy") {
    // flabby warty skin + rows of glowing photophores
    for (let i = 0; i < 16; i++) {
      const u = -0.85 + ((i * 0.7548776662 + 0.4) % 1) * 1.5,
        v = -0.8 + ((i * 0.5698402909 + 0.2) % 1) * 1.3;
      ctx.fillStyle = rgbaHex(pal.dark, 0.3);
      ctx.beginPath();
      ctx.ellipse(X(u), V(v), rx * 0.06, ry * 0.045, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    const lc = pal.lure || "#d9ff42";
    for (let i = 0; i < 6; i++) {
      const px = X(-0.7 + i * 0.2),
        py = V(0.42 - Math.sin(i * 0.6) * 0.08);
      ctx.fillStyle = rgbaHex(lc, 0.45);
      ctx.beginPath();
      ctx.arc(px, py, ry * 0.07, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(px, py, ry * 0.03, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (st === "barracuda") {
    // dark chevron bars along the back + inky blotches on the rear flank
    ctx.strokeStyle = rgbaHex(pal.stripe || "#2d5563", 0.55);
    ctx.lineWidth = rx * 0.05;
    for (let i = 0; i < 9; i++) {
      const u = -0.84 + i * 0.15;
      ctx.beginPath();
      ctx.moveTo(X(u + 0.07), V(-1.0));
      ctx.lineTo(X(u - 0.02), V(-0.2));
      ctx.lineTo(X(u + 0.03), V(0.08));
      ctx.stroke();
    }
    ctx.fillStyle = rgbaHex(pal.spot || "#1b3540", 0.8);
    for (const [u, v, r] of [[-0.78, 0.3, 0.035], [-0.6, 0.5, 0.045], [-0.42, 0.32, 0.03], [-0.24, 0.54, 0.04], [-0.02, 0.4, 0.028]]) {
      ctx.beginPath();
      ctx.ellipse(X(u), V(v), rx * r * 1.3, rx * r, 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = Math.max(1, ry * 0.06);
    ctx.beginPath();
    ctx.moveTo(X(-0.9), V(0.02));
    ctx.quadraticCurveTo(X(0), V(-0.06), X(0.5), V(0.0));
    ctx.stroke();
  } else if (st === "minnow") {
    // bright silver lateral band of an anchovy
    ctx.strokeStyle = pal.stripe ? rgbaHex(pal.stripe, 0.92) : "rgba(232, 255, 255, 0.85)";
    ctx.lineWidth = ry * 0.3;
    ctx.beginPath();
    ctx.moveTo(X(-0.9), V(0.04));
    ctx.quadraticCurveTo(X(0), V(-0.08), X(0.48), V(0.0));
    ctx.stroke();
  } else if (st === "shark") {
    // Image 7: Bruce Great White — cool slate-blue-grey upper body meeting pure white belly along jagged flame-serrated border + 5 curved gill slits!
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.moveTo(X(1.24), V(-0.12));
    ctx.lineTo(X(1.04), V(0.06));
    ctx.lineTo(X(0.86), V(0.12));
    ctx.lineTo(X(0.68), V(0.2));
    ctx.lineTo(X(0.54), V(0.42));
    ctx.lineTo(X(0.47), V(0.24));
    ctx.lineTo(X(0.4), V(0.46));
    ctx.lineTo(X(0.32), V(0.28));
    ctx.lineTo(X(0.22), V(0.5));
    ctx.lineTo(X(0.04), V(0.46));
    ctx.lineTo(X(-0.14), V(0.48));
    ctx.lineTo(X(-0.22), V(0.32));
    ctx.lineTo(X(-0.34), V(0.42));
    ctx.lineTo(X(-0.42), V(0.24));
    ctx.lineTo(X(-0.54), V(0.34));
    ctx.lineTo(X(-0.64), V(0.2));
    ctx.lineTo(X(-0.8), V(0.22));
    ctx.lineTo(X(-1.05), V(0.12));
    ctx.lineTo(X(-1.05), V(1.3));
    ctx.lineTo(X(1.25), V(1.3));
    ctx.closePath();
    ctx.fill();

    // 5 prominent curved gill slits right behind the grinning jaw (Image 7)
    ctx.strokeStyle = out(0.68);
    ctx.lineWidth = Math.max(1.2, rim * 1.15);
    for (let i = 0; i < 4; i++) {
      const gx0 = X(0.5 - i * 0.055);
      ctx.beginPath();
      ctx.moveTo(gx0, V(-0.22));
      ctx.quadraticCurveTo(gx0 - rx * 0.03, V(0.04), gx0 + rx * 0.01, V(0.28));
      ctx.stroke();
    }
  } else if (st === "leopard") {
    // Image 6: Leopard Shark — sandy cream body with bold dark chocolate-brown saddle blotches & flank spots + 5 gill slits!
    ctx.fillStyle = "#fff9e4";
    ctx.beginPath();
    ctx.moveTo(X(1.26), V(0.08));
    ctx.quadraticCurveTo(X(0.4), V(0.32), X(-1.05), V(0.22));
    ctx.lineTo(X(-1.05), V(1.2));
    ctx.lineTo(X(1.26), V(1.2));
    ctx.closePath();
    ctx.fill();

    const spCol = pal.spot || "#4d2311";
    ctx.fillStyle = spCol;
    // Bold dark brown dorsal saddle blotches
    for (const [u, v, rrx, rry, ang] of [
      [0.86, -0.45, 0.14, 0.24, 0.25],
      [0.52, -0.78, 0.16, 0.28, 0.1],
      [0.06, -0.84, 0.2, 0.34, -0.05],
      [-0.36, -0.68, 0.16, 0.28, 0.12],
      [-0.72, -0.44, 0.12, 0.22, 0.08],
    ] as [number, number, number, number, number][]) {
      ctx.beginPath();
      ctx.ellipse(X(u), V(v), rx * rrx, ry * rry, ang, 0, Math.PI * 2);
      ctx.fill();
    }
    // Bold dark brown flank spots + dark eye mask
    for (const [u, v, rrx, rry] of [
      [0.24, -0.14, 0.09, 0.16],
      [-0.14, -0.04, 0.12, 0.2],
      [-0.48, 0.02, 0.09, 0.15],
      [-0.84, 0.02, 0.07, 0.12],
      [-0.28, -0.32, 0.04, 0.06],
      [0.32, -0.42, 0.04, 0.06],
      [0.64, -0.22, 0.11, 0.16],
    ] as [number, number, number, number][]) {
      ctx.beginPath();
      ctx.ellipse(X(u), V(v), rx * rrx, ry * rry, 0.15, 0, Math.PI * 2);
      ctx.fill();
    }
    // 5 curved gill slits behind the eye
    ctx.strokeStyle = out(0.65);
    ctx.lineWidth = Math.max(1, rim * 0.9);
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(X(0.46 - i * 0.045), V(-0.2));
      ctx.quadraticCurveTo(X(0.43 - i * 0.045), V(0.02), X(0.46 - i * 0.045), V(0.22));
      ctx.stroke();
    }
  } else if (st === "tang") {
    // the black "painter's palette" of a blue tang with its oval blue window + yellow tail wedge
    ctx.fillStyle = pal.stripe || "#0b1026";
    ctx.beginPath();
    ctx.moveTo(X(0.78), V(-0.2));
    ctx.bezierCurveTo(X(0.5), V(-0.86), X(-0.3), V(-0.9), X(-0.95), V(-0.2));
    ctx.lineTo(X(-0.95), V(0.12));
    ctx.bezierCurveTo(X(-0.6), V(0.22), X(-0.2), V(0.5), X(0.16), V(0.42));
    ctx.bezierCurveTo(X(0.4), V(0.36), X(0.42), V(0.0), X(0.2), V(-0.06));
    ctx.bezierCurveTo(X(0.5), V(-0.3), X(0.6), V(-0.2), X(0.78), V(-0.2));
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = pal.body;
    ctx.beginPath();
    ctx.ellipse(X(-0.22), V(-0.2), rx * 0.36, ry * 0.2, -0.08, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = pal.spot || "#ffd91f";
    ctx.beginPath();
    ctx.moveTo(X(-0.5), V(-0.02));
    ctx.lineTo(X(-1.0), V(-0.26));
    ctx.lineTo(X(-1.0), V(0.26));
    ctx.closePath();
    ctx.fill();
  } else if (st === "idol") {
    // Image 5: Bold deep violet-black vertical bands + clean ivory-white central band & protruding white snout + warm golden nose saddle!
    const blk = pal.stripe || "#1a0d26";
    // Pale warm yellow tint along trailing edge of central white band
    const yg = ctx.createLinearGradient(X(0.24), 0, X(-0.38), 0);
    yg.addColorStop(0, "rgba(255, 240, 180, 0)");
    yg.addColorStop(1, "rgba(245, 226, 130, 0.65)");
    ctx.fillStyle = yg;
    ctx.fillRect(X(-0.9), V(-1.2), rx * 1.2, ry * 2.4);

    // Front broad purple-black mask band (covering forehead, eye, and steep chest — leaving white snout free!)
    band(0.46, 0.44, 0.04, blk);
    // Rear purple-black band
    band(-0.48, 0.36, -0.02, blk);
    // Subtle yellow-orange saddle patch on top of white snout bridge (just in front of eye)
    ctx.fillStyle = pal.spot || "#f0b840";
    ctx.beginPath();
    ctx.ellipse(X(0.84), V(-0.02), rx * 0.14, ry * 0.06, -0.18, 0, Math.PI * 2);
    ctx.fill();
    // Thin crisp pale rim bordering rear band
    ctx.strokeStyle = "rgba(255, 250, 232, 0.9)";
    ctx.lineWidth = Math.max(1, rim * 0.9);
    ctx.beginPath();
    ctx.moveTo(X(-0.26), V(-1.1));
    ctx.quadraticCurveTo(X(-0.32), 0, X(-0.26), V(1.1));
    ctx.stroke();
  } else if (st === "sailfish") {
    // rows of pale-blue dots forming vertical bars on the flank + lateral line
    ctx.fillStyle = rgbaHex(pal.stripe || "#a6d4ff", 0.85);
    ctx.beginPath();
    for (let i = 0; i < 12; i++)
      for (let j = 0; j < 3; j++) {
        const dr = Math.max(1, rx * 0.016);
        ctx.moveTo(X(0.4 - i * 0.11) + dr, V(-0.3 + j * 0.3));
        ctx.arc(X(0.4 - i * 0.11), V(-0.3 + j * 0.3), dr, 0, Math.PI * 2);
      }
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = Math.max(1, ry * 0.07);
    ctx.beginPath();
    ctx.moveTo(X(-0.9), V(0.05));
    ctx.quadraticCurveTo(X(0), V(-0.02), X(0.6), V(0.06));
    ctx.stroke();
  } else if (st === "puffer") {
    // brown saddle blotches + small spots over the back
    ctx.fillStyle = rgbaHex(pal.spot || "#6b4312", 0.55);
    for (const [u, v, r] of [[0.25, -0.62, 0.17], [-0.2, -0.7, 0.2], [-0.6, -0.5, 0.15]]) {
      ctx.beginPath();
      ctx.ellipse(X(u), V(v), rx * r, ry * r * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = rgbaHex(pal.spot || "#6b4312", 0.8);
    for (let i = 0; i < 18; i++) {
      const u = -0.85 + ((i * 0.7548776662 + 0.2) % 1) * 1.5,
        v = -0.8 + ((i * 0.5698402909 + 0.4) % 1) * 1.0;
      ctx.beginPath();
      ctx.arc(X(u), V(v), rx * 0.028, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (st === "clown") {
    // Image 7: Three bold white bands with thick black borders: curved gill band, forward-bulging middle band, and tail-base ring!
    const white = pal.stripe || "#ffffff";
    // Head band curving around the cheek behind the eye
    band(0.46, 0.17, -0.08, white);
    ctx.strokeStyle = BLK;
    ctx.lineWidth = Math.max(1.6, rim * 2.2);
    ctx.stroke();

    // Iconic middle Nemo band with pronounced forward thumb-bulge on mid-flank!
    ctx.beginPath();
    ctx.moveTo(X(-0.14), V(-1.1));
    ctx.bezierCurveTo(X(0.06), V(-0.36), X(0.16), V(-0.04), X(0.08), V(0.28));
    ctx.quadraticCurveTo(X(-0.02), V(0.68), X(-0.12), V(1.1));
    ctx.lineTo(X(-0.36), V(1.1));
    ctx.bezierCurveTo(X(-0.22), V(0.52), X(-0.18), V(0.02), X(-0.34), V(-1.1));
    ctx.closePath();
    ctx.fillStyle = white;
    ctx.fill();
    ctx.strokeStyle = BLK;
    ctx.lineWidth = Math.max(1.6, rim * 2.2);
    ctx.stroke();

    // Tail-peduncle white ring
    band(-0.88, 0.14, 0, white);
    ctx.strokeStyle = BLK;
    ctx.lineWidth = Math.max(1.6, rim * 2.2);
    ctx.stroke();
  }

  if (st !== "clown" && st !== "leon") {
    for (const s of sp.stripes) band(s, 0.19, 0, pal.stripe || "#ffffff");
  }

  // gill cover (operculum) crease — fish only (skipped on sharks, orca, leon, idol & parrot so markings stay spotless!)
  if (W >= 48 && st !== "orca" && st !== "shark" && st !== "leopard" && st !== "leon" && st !== "idol" && st !== "parrot") {
    const gx = X(disc ? 0.5 : st === "barracuda" || st === "sailfish" ? 0.5 : 0.36);
    ctx.beginPath();
    ctx.moveTo(gx + rx * 0.04, -ry * 0.34);
    ctx.quadraticCurveTo(gx - rx * 0.08, ry * 0.12, gx - rx * 0.2, ry * 0.52);
    ctx.strokeStyle = out(0.45);
    ctx.lineWidth = Math.max(1.4, rim * 1.35);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(gx + rx * 0.07, -ry * 0.32);
    ctx.quadraticCurveTo(gx - rx * 0.05, ry * 0.12, gx - rx * 0.17, ry * 0.5);
    ctx.strokeStyle = "rgba(255, 240, 195, 0.32)";
    ctx.lineWidth = Math.max(1, rim * 0.85);
    ctx.stroke();
    if (st === "andy" && detail) {
      // the cheek spine that tells an angelfish from a butterflyfish
      ctx.beginPath();
      ctx.moveTo(gx - rx * 0.1, ry * 0.36);
      ctx.lineTo(gx - rx * 0.3, ry * 0.52);
      ctx.lineTo(gx - rx * 0.12, ry * 0.5);
      ctx.closePath();
      ctx.fillStyle = "#fff3c4";
      ctx.fill();
      ctx.strokeStyle = out(0.5);
      ctx.lineWidth = rim * 0.6;
      ctx.stroke();
    }
  }

  // 3D Sculpted Lighting: lower-belly ambient occlusion + cyan underwater bounce light + top caustic rim + glossy flank highlight
  const volGrad = ctx.createLinearGradient(bx, -ry * 1.05, bx, ry * 1.08);
  volGrad.addColorStop(0, "rgba(210, 252, 255, 0.34)"); // sunlit dorsal rim
  volGrad.addColorStop(0.18, "rgba(255, 255, 255, 0.06)");
  volGrad.addColorStop(0.62, "rgba(0, 0, 0, 0)");
  volGrad.addColorStop(0.84, "rgba(6, 18, 48, 0.32)"); // rounded 3D belly underside shadow
  volGrad.addColorStop(1, "rgba(86, 224, 255, 0.22)"); // subtle aqua ocean bounce light on very bottom edge
  ctx.fillStyle = volGrad;
  ctx.fillRect(X(-1.3), -ry * 1.3, rx * 2.7, ry * 2.6);

  buildBodyPath(ctx, sp, bx, rx, ry, jawState);
  ctx.strokeStyle = rgbaHex(pal.dark, 0.48);
  ctx.lineWidth = rim * 3.0;
  ctx.stroke();

  // Primary 3D satin flank sheen + specular forehead gloss
  // (gradients are squashed with the ellipse so the gloss melts away — no visible oval ring on the flank)
  const softGloss = (gx: number, gy: number, grx: number, gry: number, rot: number, a: number) => {
    ctx.save();
    ctx.translate(gx, gy);
    ctx.rotate(rot);
    ctx.scale(1, gry / grx);
    const gg = ctx.createRadialGradient(0, 0, 0, 0, 0, grx);
    gg.addColorStop(0, `rgba(255, 255, 255, ${a})`);
    gg.addColorStop(0.55, `rgba(230, 252, 255, ${a * 0.36})`);
    gg.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = gg;
    ctx.beginPath();
    ctx.arc(0, 0, grx, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };
  softGloss(X(0.08), -ry * 0.44, rx * 0.6, ry * (st === "leon" ? 0.2 : 0.28), -0.24, st === "leon" ? 0.26 : 0.44);
  softGloss(X(0.55), -ry * 0.45, rx * 0.24, ry * 0.13, -0.38, st === "leon" ? 0.28 : 0.42);
  ctx.restore(); // end body clip

  buildBodyPath(ctx, sp, bx, rx, ry, jawState);
  ctx.lineWidth = st === "parrot" ? rim * 0.65 : rim;
  ctx.strokeStyle = out(st === "parrot" ? 0.36 : 0.68);
  ctx.stroke();

  if (st === "leon" && detail) {
    // Pair of curved fleshy tentacles above the high-set brow (Image 4!)
    ctx.strokeStyle = pal.dark;
    ctx.lineWidth = Math.max(1.4, rx * 0.038);
    for (const d of [0, 0.09]) {
      ctx.beginPath();
      ctx.moveTo(X(0.54 - d), V(-0.68));
      ctx.quadraticCurveTo(X(0.62 - d), V(-1.02), X(0.7 - d) + sw * 0.4, V(-1.14));
      ctx.stroke();
    }
  }

  if (st === "sailfish") {
    // the bill: the upper jaw drawn out into a long spear
    const lift = open * ry * 0.3;
    ctx.beginPath();
    ctx.moveTo(X(0.98), V(-0.3) - lift * 0.7);
    ctx.lineTo(X(1.52), V(-0.02) - lift);
    ctx.lineTo(X(1.06), V(0.1) - lift);
    ctx.closePath();
    ctx.fillStyle = pal.dark;
    ctx.fill();
    ctx.strokeStyle = out(0.68);
    ctx.lineWidth = rim;
    ctx.stroke();
  }
  if (st === "puffer" && detail) {
    // little spines lying flat on the skin
    ctx.fillStyle = "#fff6dc";
    ctx.strokeStyle = out(0.45);
    ctx.lineWidth = rim * 0.5;
    for (let i = 0; i < 14; i++) {
      const u = -0.7 + ((i * 0.7548776662 + 0.1) % 1) * 1.15,
        v = -0.62 + ((i * 0.5698402909 + 0.6) % 1) * 1.2;
      ctx.beginPath();
      ctx.moveTo(X(u), V(v));
      ctx.lineTo(X(u - 0.1), V(v - 0.04));
      ctx.lineTo(X(u - 0.02), V(v + 0.07));
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }
  if ((st === "shark" || st === "leopard") && detail) {
    ctx.fillStyle = out(0.7);
    ctx.beginPath();
    ctx.arc(X(1.08), V(-0.08), Math.max(0.8, ry * 0.045), 0, Math.PI * 2);
    ctx.fill();
  }

  // ---------- 5. MOUTH DETAILS (aligned directly to the shared jaw hinge & tip!) ----------
  if (mouthOpenAmt > 0) {
    ctx.strokeStyle = out(0.65);
    ctx.lineWidth = Math.max(1.2, rim * 1.1);
    ctx.beginPath();
    ctx.arc((st === "shark" ? X(0.52) : jaw.hingeX) - rx * 0.02, st === "shark" ? ry * 0.1 : jaw.hingeY, ry * 0.085, Math.PI * 0.65, Math.PI * 1.38);
    ctx.stroke();
  } else if (puff > 0) {
    const tipX = st === "andy" || st === "boris" ? jaw.lowerTipX + rx * 0.02 : jaw.closedTipX;
    const tipY = st === "andy" || st === "boris" ? jaw.lowerTipY + ry * 0.01 : jaw.closedTipY;
    ctx.strokeStyle = out(0.72);
    ctx.lineWidth = Math.max(1.4, rim * 1.25);
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.quadraticCurveTo((tipX + jaw.hingeX) * 0.5, jaw.hingeY + ry * 0.1, jaw.hingeX, jaw.hingeY);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(jaw.hingeX - rx * 0.02, jaw.hingeY, ry * 0.085, Math.PI * 0.6, Math.PI * 1.42);
    ctx.stroke();
  } else {
    ctx.strokeStyle = out(0.68);
    ctx.lineWidth = Math.max(1.2, rim * 1.1);
    if (st === "barracuda") {
      // long jaw line with needle fangs showing
      ctx.beginPath();
      ctx.moveTo(jaw.closedTipX, jaw.closedTipY);
      ctx.quadraticCurveTo((jaw.closedTipX + jaw.hingeX) * 0.5, jaw.hingeY + ry * 0.08, jaw.hingeX, jaw.hingeY);
      ctx.stroke();
      if (detail) {
        ctx.fillStyle = "#fffaf0";
        for (const k of [0.88, 0.72, 0.56, 0.4]) {
          const fx = jaw.hingeX + (jaw.closedTipX - jaw.hingeX) * k;
          const fy = jaw.hingeY + (jaw.closedTipY - jaw.hingeY) * k + ry * 0.04;
          ctx.beginPath();
          ctx.moveTo(fx - rx * 0.022, fy);
          ctx.lineTo(fx, fy - ry * (k > 0.8 ? 0.24 : 0.18));
          ctx.lineTo(fx + rx * 0.022, fy);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
      }
    } else if (sp.underbite) {
      // Image 4 (Eddy): steep upward-sloping grim underbite mouth with prominent lower lip & sharp upward white fangs!
      ctx.beginPath();
      ctx.moveTo(jaw.closedTipX, jaw.closedTipY);
      ctx.quadraticCurveTo((jaw.closedTipX + jaw.hingeX) * 0.52, jaw.hingeY + ry * 0.12, jaw.hingeX, jaw.hingeY);
      ctx.stroke();
      // Pale lower jaw lip rim matching Image 4
      ctx.strokeStyle = "#b8ee88";
      ctx.lineWidth = Math.max(1.5, rim * 1.6);
      ctx.beginPath();
      ctx.moveTo(jaw.closedTipX - rx * 0.01, jaw.closedTipY + ry * 0.04);
      ctx.quadraticCurveTo((jaw.closedTipX + jaw.hingeX) * 0.52, jaw.hingeY + ry * 0.17, jaw.hingeX, jaw.hingeY + ry * 0.05);
      ctx.stroke();
      if (detail) {
        ctx.fillStyle = "#fffdf2";
        ctx.strokeStyle = out(0.65);
        ctx.lineWidth = Math.max(0.9, rim * 0.7);
        for (const [k, up] of [[0.86, 0.9], [0.68, 1.3], [0.48, 1.15], [0.3, 0.85]]) {
          const fx = jaw.hingeX + (jaw.closedTipX - jaw.hingeX) * k;
          const fy = jaw.hingeY + (jaw.closedTipY - jaw.hingeY) * k + ry * 0.06;
          ctx.beginPath();
          ctx.moveTo(fx - rx * 0.028, fy);
          ctx.lineTo(fx + rx * 0.02, fy - ry * 0.24 * up);
          ctx.lineTo(fx + rx * 0.028, fy);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
      }
    } else if (st === "puffer") {
      // fused beak: two white tooth plates under a little smile
      ctx.beginPath();
      ctx.moveTo(jaw.closedTipX, jaw.closedTipY);
      ctx.quadraticCurveTo((jaw.closedTipX + jaw.hingeX) * 0.5, jaw.hingeY + ry * 0.06, jaw.hingeX, jaw.hingeY);
      ctx.stroke();
      if (detail) {
        ctx.fillStyle = "#fffaf0";
        ctx.beginPath();
        ctx.rect(jaw.closedTipX - rx * 0.12, jaw.closedTipY + ry * 0.01, rx * 0.1, ry * 0.11);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(jaw.closedTipX - rx * 0.07, jaw.closedTipY + ry * 0.01);
        ctx.lineTo(jaw.closedTipX - rx * 0.07, jaw.closedTipY + ry * 0.12);
        ctx.stroke();
      }
    } else if (st === "shark") {
      // underslung crescent mouth set back under the snout
      ctx.beginPath();
      ctx.moveTo(jaw.closedTipX, jaw.closedTipY);
      ctx.quadraticCurveTo((jaw.closedTipX + jaw.hingeX) * 0.5, jaw.hingeY + ry * 0.04, jaw.hingeX, jaw.hingeY + ry * 0.14);
      ctx.stroke();
    } else if (st === "parrot") {
      // Image 1: Thick puckered turquoise-cyan Napoleon lips around a gentle smile
      ctx.beginPath();
      ctx.moveTo(jaw.closedTipX + rx * 0.04, jaw.closedTipY);
      ctx.quadraticCurveTo((jaw.closedTipX + jaw.hingeX) * 0.5, jaw.hingeY + ry * 0.06, jaw.hingeX, jaw.hingeY);
      ctx.stroke();
    } else {
      const overbite = st === "andy" || st === "boris";
      const tipX = overbite ? jaw.lowerTipX + rx * 0.02 : jaw.closedTipX;
      const tipY = overbite ? jaw.lowerTipY : jaw.closedTipY;
      const smileDip = st === "pierre" || st === "peter" ? ry * 0.12 : st === "idol" ? ry * 0.02 : ry * 0.06;
      ctx.beginPath();
      ctx.moveTo(tipX, tipY);
      ctx.quadraticCurveTo((tipX + jaw.hingeX) * 0.5, (tipY + jaw.hingeY) * 0.5 + smileDip, jaw.hingeX, jaw.hingeY);
      ctx.stroke();
    }
  }

  // Thick protruding fleshy puckered Napoleon lips (visible both closed and open!)
  if (st === "parrot") {
    const drawLip = (lx: number, ly: number, rLx: number, rLy: number, ang: number, isUpper: boolean) => {
      ctx.save();
      ctx.translate(lx, ly);
      ctx.rotate(ang);
      const lg = ctx.createRadialGradient(-rLx * 0.15, isUpper ? -rLy * 0.25 : rLy * 0.2, rLy * 0.08, 0, 0, rLx * 1.15);
      lg.addColorStop(0, isUpper ? "#6cf5ff" : "#56ebfc");
      lg.addColorStop(0.55, "#24c6e0");
      lg.addColorStop(1, isUpper ? "#1284b0" : "#0e54b4");
      ctx.fillStyle = lg;
      ctx.beginPath();
      ctx.ellipse(0, 0, rLx, rLy, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(10, 74, 114, 0.28)";
      ctx.lineWidth = Math.max(0.8, rim * 0.45);
      ctx.stroke();
      ctx.restore();
    };
    drawLip(jaw.upperTipX - rx * 0.02, jaw.upperTipY - ry * 0.03, rx * 0.125, ry * 0.115, 0.36 - open * 0.42, true);
    drawLip(jaw.lowerTipX - rx * 0.022, jaw.lowerTipY + ry * 0.048, rx * 0.122, ry * 0.112, -0.26 + open * 0.68, false);
    if (mouthOpenAmt === 0) {
      ctx.strokeStyle = "rgba(8, 56, 88, 0.82)";
      ctx.lineWidth = Math.max(1.3, rim * 0.95);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(jaw.closedTipX + rx * 0.048, jaw.closedTipY);
      ctx.quadraticCurveTo((jaw.closedTipX + jaw.hingeX) * 0.5, jaw.hingeY + ry * 0.05, jaw.hingeX, jaw.hingeY);
      ctx.stroke();
    }
  }

  // ---------- 6. PECTORAL FIN / FLIPPER (in front of the body) ----------
  const pFlutter = wag2 * 0.16;
  if (st === "orca") {
    // broad rounded paddle flipper
    ctx.save();
    ctx.translate(X(0.36), V(0.56));
    ctx.rotate(2.05 + pFlutter * 0.8);
    ctx.beginPath();
    ctx.moveTo(0, -ry * 0.17);
    ctx.bezierCurveTo(rx * 0.3, -ry * 0.34, rx * 0.56, -ry * 0.14, rx * 0.56, ry * 0.06);
    ctx.bezierCurveTo(rx * 0.5, ry * 0.3, rx * 0.16, ry * 0.26, 0, ry * 0.15);
    ctx.closePath();
    const fg = ctx.createLinearGradient(0, -ry * 0.2, rx * 0.5, ry * 0.2);
    fg.addColorStop(0, mixHex(pal.body, "#5a6478", 0.3));
    fg.addColorStop(1, pal.dark);
    ctx.fillStyle = fg;
    ctx.fill();
    ctx.strokeStyle = out(0.6);
    ctx.lineWidth = rim;
    ctx.stroke();
    ctx.restore();
  } else if (st === "shark") {
    // Image 7: Large swept-back sleek slate-blue-grey Bruce pectoral fin with pale underside edge (NO black tip!)
    ctx.save();
    ctx.translate(X(0.32), V(0.44));
    ctx.rotate(2.15 + pFlutter * 0.7);
    const pf = () => {
      ctx.moveTo(0, -ry * 0.2);
      ctx.quadraticCurveTo(rx * 0.4, -ry * 0.34, rx * 0.76, ry * 0.04);
      ctx.quadraticCurveTo(rx * 0.34, ry * 0.22, 0, ry * 0.18);
    };
    ctx.beginPath();
    pf();
    ctx.closePath();
    const fg = ctx.createLinearGradient(0, -ry * 0.2, rx * 0.65, ry * 0.2);
    fg.addColorStop(0, finLight);
    fg.addColorStop(0.55, finBase);
    fg.addColorStop(1, pal.dark);
    ctx.fillStyle = fg;
    ctx.fill();
    ctx.strokeStyle = out(0.65);
    ctx.lineWidth = rim;
    ctx.stroke();
    ctx.restore();
  } else if (st === "leopard") {
    // Image 6: Dark brown-tipped sandy pectoral fin of Leopard Shark
    ctx.save();
    ctx.translate(X(0.28), V(0.42));
    ctx.rotate(2.25 + pFlutter * 0.7);
    ctx.beginPath();
    ctx.moveTo(0, -ry * 0.16);
    ctx.quadraticCurveTo(rx * 0.3, -ry * 0.26, rx * 0.56, ry * 0.04);
    ctx.quadraticCurveTo(rx * 0.24, ry * 0.18, 0, ry * 0.14);
    ctx.closePath();
    const fg = ctx.createLinearGradient(0, 0, rx * 0.5, 0);
    fg.addColorStop(0, finBase);
    fg.addColorStop(1, pal.spot || "#4d2311");
    ctx.fillStyle = fg;
    ctx.fill();
    ctx.strokeStyle = out(0.6);
    ctx.lineWidth = rim * 0.85;
    ctx.stroke();
    ctx.restore();
  } else if (st === "leon") {
    // Image 4: Flowing ragged green-cream curtain pectoral fan originating cleanly behind gill/chest
    const ox = X(0.28),
      oy = V(0.46);
    const lobes: [number, number][] = [
      [X(0.42), V(0.72)],
      [X(0.54), V(1.32)],
      [X(0.28), V(1.48)],
      [X(0.18), V(1.24)],
      [X(-0.08), V(1.56)],
      [X(-0.4), V(1.46)],
      [X(-0.28), V(1.14)],
      [X(-0.56), V(1.2)],
      [X(-0.68), V(0.88)],
      [X(-0.48), V(0.68)],
      [X(-0.6), V(0.5)],
      [X(-0.32), V(0.46)],
    ];
    ctx.save();
    ctx.translate(ox, oy);
    ctx.rotate(pFlutter * 0.25);
    ctx.translate(-ox, -oy);
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    for (const [lx, ly] of lobes) ctx.lineTo(lx, ly);
    ctx.closePath();
    const lfGrad = ctx.createLinearGradient(ox, oy, X(-0.2), V(1.55));
    lfGrad.addColorStop(0, "rgba(182, 166, 62, 0.92)");
    lfGrad.addColorStop(0.5, "rgba(180, 214, 164, 0.86)");
    lfGrad.addColorStop(1, "rgba(218, 236, 218, 0.74)");
    ctx.fillStyle = lfGrad;
    ctx.fill();
    ctx.strokeStyle = out(0.42);
    ctx.lineWidth = rim * 0.65;
    ctx.stroke();
    // Banded flowing rays down into each ragged lobe (no ugly circles!)
    for (const i of [1, 2, 4, 5, 7, 8, 10]) {
      const [tx, ty] = lobes[i];
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.quadraticCurveTo((ox + tx) * 0.52, (oy + ty) * 0.48, tx, ty);
      ctx.lineWidth = Math.max(1.1, rx * 0.022);
      ctx.strokeStyle = "#f2f4d4";
      ctx.stroke();
      ctx.setLineDash([rx * 0.07, rx * 0.1]);
      ctx.strokeStyle = rgbaHex(pal.dark, 0.72);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  } else if (st === "eddy") {
    // Image 4: High-set tattered green pectoral fan right behind the eye & gill
    ctx.save();
    ctx.translate(X(0.08), V(-0.18));
    ctx.rotate(-0.45 + pFlutter * 0.9);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-rx * 0.28, -ry * 0.44);
    ctx.lineTo(-rx * 0.18, -ry * 0.24);
    ctx.lineTo(-rx * 0.08, -ry * 0.46);
    ctx.lineTo(rx * 0.02, -ry * 0.22);
    ctx.lineTo(rx * 0.14, -ry * 0.36);
    ctx.lineTo(rx * 0.1, 0);
    ctx.closePath();
    ctx.fillStyle = rgbaHex(finLight, 0.88);
    ctx.fill();
    ctx.strokeStyle = out(0.55);
    ctx.lineWidth = rim * 0.8;
    ctx.stroke();
    ctx.restore();
  } else if (st === "idol") {
    // Image 3: Long dark purple-black Moorish Idol pectoral fin sweeping upward & backward over the white band!
    ctx.save();
    ctx.translate(X(0.12), V(0.14));
    ctx.rotate(-0.68 + pFlutter * 0.6);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(-rx * 0.3, -ry * 0.22, -rx * 0.64, -ry * 0.06);
    ctx.quadraticCurveTo(-rx * 0.34, ry * 0.1, 0, ry * 0.1);
    ctx.closePath();
    ctx.fillStyle = pal.stripe || "#1b0b26";
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.45)";
    ctx.lineWidth = rim * 0.65;
    ctx.stroke();
    ctx.restore();
  } else if (st === "clown") {
    // Image 7: Big plump rounded orange pectoral fan right on the flank with white sub-rim + crisp black border!
    ctx.save();
    ctx.translate(X(0.06), V(0.2));
    ctx.rotate(0.18 + pFlutter * 1.1);
    ctx.beginPath();
    ctx.moveTo(0, -ry * 0.1);
    ctx.bezierCurveTo(-rx * 0.24, -ry * 0.36, -rx * 0.5, -ry * 0.18, -rx * 0.48, ry * 0.1);
    ctx.bezierCurveTo(-rx * 0.42, ry * 0.38, -rx * 0.16, ry * 0.32, 0, ry * 0.12);
    ctx.closePath();
    const pg = ctx.createLinearGradient(0, 0, -rx * 0.48, 0);
    pg.addColorStop(0, "#ff9624");
    pg.addColorStop(1, "#ff6c08");
    ctx.fillStyle = pg;
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = rim * 3.8;
    ctx.stroke();
    ctx.strokeStyle = BLK;
    ctx.lineWidth = rim * 2.2;
    ctx.stroke();
    ctx.restore();
    ctx.lineWidth = rim * 0.9;
    ctx.strokeStyle = BLK;
    ctx.stroke();
    ctx.restore();
  } else {
    ctx.save();
    const slim = st === "barracuda" || st === "minnow" || st === "sailfish";
    ctx.translate(X(disc ? 0.24 : st === "parrot" ? 0.2 : slim ? 0.3 : 0.08), ry * (disc ? 0.34 : st === "parrot" ? 0.24 : slim ? 0.4 : 0.28));
    ctx.rotate((st === "parrot" ? 0.14 : 0.32) + pFlutter * (st === "puffer" ? 2.4 : 1)); // the puffer sculls with fast-fluttering fins
    const pk = slim ? 0.7 : st === "parrot" ? 1.05 : 1;
    const ph = slim ? Math.max(ry, rx * 0.22) : ry;
    ctx.beginPath();
    if (st === "parrot") {
      // Image 1: Broad rounded fan-paddle pectoral fin behind the cheek/gill
      ctx.moveTo(0, -ph * 0.09);
      ctx.bezierCurveTo(-rx * 0.16 * pk, -ph * 0.28, -rx * 0.38 * pk, -ph * 0.22, -rx * 0.4 * pk, ph * 0.02);
      ctx.bezierCurveTo(-rx * 0.38 * pk, ph * 0.28, -rx * 0.16 * pk, ph * 0.3, 0, ph * 0.1);
    } else {
      ctx.moveTo(0, -ph * 0.07);
      ctx.bezierCurveTo(-rx * 0.18 * pk, -ph * 0.2, -rx * 0.42 * pk, -ph * 0.12, -rx * 0.4 * pk, ph * 0.08);
      ctx.bezierCurveTo(-rx * 0.36 * pk, ph * 0.26, -rx * 0.14 * pk, ph * 0.22, 0, ph * 0.09);
    }
    ctx.closePath();
    const pg = ctx.createLinearGradient(0, 0, -rx * 0.42, ry * 0.1);
    pg.addColorStop(0, rgbaHex(st === "parrot" ? "#62e098" : finDark, 0.94));
    pg.addColorStop(1, st === "tang" ? rgbaHex(pal.spot || "#ffd91f", 0.95) : st === "parrot" ? "#145ea0" : rgbaHex(finLight, 0.52));
    ctx.fillStyle = pg;
    ctx.fill();
    if (detail) {
      ctx.save();
      ctx.clip();
      ctx.strokeStyle = out(0.25);
      ctx.lineWidth = Math.max(0.9, rim * 0.6);
      for (const k of [-0.12, -0.02, 0.08, 0.18]) {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-rx * 0.42 * pk, ph * k);
        ctx.stroke();
      }
      // (clownfish pectoral fin has its own dedicated branch above)
      ctx.restore();
    }
    ctx.lineWidth = rim * 0.85;
    ctx.strokeStyle = out(0.48);
    ctx.stroke();
    ctx.restore();
  }

  // ---------- 7. EYE (kept in the game's signature glossy 3/4 cartoon style) ----------
  const ex = X(st === "layla" ? 0.54 : st === "idol" ? 0.42 : st === "boris" ? 0.66 : st === "leon" ? 0.48 : st === "peter" ? 0.62 : st === "clown" ? 0.68 : st === "eddy" ? 0.36 : st === "parrot" ? 0.53 : st === "andy" ? 0.56 : disc ? 0.75 : st === "orca" ? 0.68 : st === "barracuda" ? 0.72 : st === "shark" ? 0.8 : st === "leopard" ? 0.68 : st === "sailfish" ? 0.78 : longBody ? 0.64 : 0.6);
  const ey =
    -ry *
    (st === "layla"
      ? 0.34 + open * 0.05
      : st === "idol"
        ? 0.22 + open * 0.04
        : st === "peter"
          ? 0.2 + open * 0.05
          : st === "clown"
            ? 0.18 + open * 0.06
            : st === "eddy"
              ? 0.32 + open * 0.08
              : st === "parrot"
                ? 0.38 + open * 0.04
                : st === "leon"
                  ? 0.5 + open * 0.04
                  : st === "andy"
                    ? 0.2 + open * 0.08
                  : disc
                    ? 0.14 + open * 0.1
                    : st === "orca"
                      ? 0.1 + open * 0.08
                      : st === "shark"
                        ? 0.26 + open * 0.06
                        : st === "leopard"
                          ? 0.06 + open * 0.06
                        : st === "puffer"
                          ? 0.24 + open * 0.1
                          : 0.16 + open * 0.1);
  const er = ry * sp.eye * (st === "eddy" ? 0.72 : st === "barracuda" ? 1.25 : st === "sailfish" ? 1.5 : st === "minnow" ? 1.12 : st === "orca" ? 0.82 : 1);
  const eyeRx = er * 0.66;
  const eyeRy = er * 1.04;
  const eyeTilt = disc ? -0.28 : -0.18;

  if (jawState === -1) {
    const cg = ctx.createRadialGradient(ex - er * 0.15, ey + er * 1.15, 0, ex - er * 0.15, ey + er * 1.15, er * 0.95);
    cg.addColorStop(0, "rgba(255, 95, 135, 0.44)");
    cg.addColorStop(1, "rgba(255, 95, 135, 0)");
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.arc(ex - er * 0.15, ey + er * 1.15, er * 0.95, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.save();
  ctx.translate(ex, ey);
  ctx.rotate(eyeTilt);
  if (expr === "happy" && !sp.angry) {
    ctx.strokeStyle = out(0.82);
    ctx.lineWidth = Math.max(1.6, rim * 1.35);
    ctx.beginPath();
    ctx.arc(0, eyeRy * 0.22, eyeRx * 0.95, Math.PI * 1.12, Math.PI * 1.88);
    ctx.stroke();
  } else {
    const browTopCol = st === "andy" ? rgbaHex(pal.stripe || "#df22ff", 0.5) : rgbaHex(pal.dark, 0.45);
    ctx.beginPath();
    ctx.ellipse(-eyeRx * 0.12, -eyeRy * 0.04, eyeRx * 1.18, eyeRy * 1.12, 0, Math.PI * 0.55, Math.PI * 1.72);
    ctx.strokeStyle = browTopCol;
    ctx.lineWidth = Math.max(1.5, rim * 1.6);
    ctx.stroke();

    ctx.beginPath();
    ctx.ellipse(eyeRx * 0.08, 0, eyeRx * (expr === "panic" ? 1.14 : 1), eyeRy * (expr === "panic" ? 1.08 : 1), 0, 0, Math.PI * 2);
    const sclGrad = ctx.createRadialGradient(eyeRx * 0.2, -eyeRy * 0.15, eyeRx * 0.08, 0, 0, eyeRy * 1.05);
    sclGrad.addColorStop(0, "#ffffff");
    sclGrad.addColorStop(0.72, "#f7faff");
    sclGrad.addColorStop(1, "#b6cae0");
    ctx.fillStyle = sclGrad;
    ctx.fill();

    ctx.save();
    ctx.clip();
    const pxOff = expr === "panic" ? eyeRx * 0.36 : eyeRx * 0.52;
    const pyOff = open > 0 ? eyeRy * 0.08 : eyeRy * 0.05;
    const pRx = eyeRx * (expr === "panic" ? 0.3 : 0.38);
    const pRy = eyeRy * (expr === "panic" ? 0.3 : 0.42);
    ctx.beginPath();
    ctx.ellipse(pxOff, pyOff, pRx * 1.18, pRy * 1.18, 0, 0, Math.PI * 2);
    ctx.fillStyle = pal.iris || "#2b1608";
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(pxOff + eyeRx * 0.04, pyOff, pRx, pRy, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#090812";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(pxOff - pRx * 0.28, pyOff - pRy * 0.34, Math.max(0.8, pRx * 0.34), 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255, 255, 255, 0.96)";
    ctx.fill();
    // 3D cornea secondary caustic reflection on lower rim
    ctx.beginPath();
    ctx.arc(pxOff + pRx * 0.25, pyOff + pRy * 0.38, Math.max(0.45, pRx * 0.16), 0, Math.PI * 2);
    ctx.fillStyle = "rgba(180, 248, 255, 0.72)";
    ctx.fill();
    if (sp.angry) {
      ctx.beginPath();
      ctx.moveTo(-eyeRx * 1.3, -eyeRy * 1.05);
      ctx.lineTo(eyeRx * 1.3, -eyeRy * 0.08);
      ctx.lineTo(eyeRx * 1.3, -eyeRy * 1.3);
      ctx.closePath();
      ctx.fillStyle = pal.dark;
      ctx.fill();
    } else if (st === "idol") {
      // Image 5: Gill's cool calm half-lidded top eyelid
      ctx.beginPath();
      ctx.rect(-eyeRx * 1.4, -eyeRy * 1.3, eyeRx * 2.8, eyeRy * 0.96);
      ctx.fillStyle = pal.stripe || "#1b0b26";
      ctx.fill();
    } else if (st === "parrot") {
      // Image 1: Calm turquoise-cyan upper eyelid fold matching the head tone above the Napoleon eye
      ctx.beginPath();
      ctx.moveTo(-eyeRx * 1.2, -eyeRy * 1.1);
      ctx.quadraticCurveTo(0, -eyeRy * 0.58, eyeRx * 1.25, -eyeRy * 0.72);
      ctx.lineTo(eyeRx * 1.25, -eyeRy * 1.3);
      ctx.closePath();
      ctx.fillStyle = "#129ac0";
      ctx.fill();
    } else if (st === "shark") {
      // Image 7: Bruce's charismatic expressive brow shadow over upper-inner eye
      ctx.beginPath();
      ctx.moveTo(-eyeRx * 1.2, -eyeRy * 1.1);
      ctx.quadraticCurveTo(0, -eyeRy * 0.56, eyeRx * 1.25, -eyeRy * 0.72);
      ctx.lineTo(eyeRx * 1.25, -eyeRy * 1.3);
      ctx.closePath();
      ctx.fillStyle = pal.dark;
      ctx.fill();
    }
    ctx.restore();

    ctx.beginPath();
    ctx.ellipse(eyeRx * 0.08, 0, eyeRx, eyeRy, 0, Math.PI * 0.35, Math.PI * 1.85);
    ctx.lineWidth = Math.max(1, rim * 0.9);
    ctx.strokeStyle = out(0.52);
    ctx.stroke();
  }
  ctx.restore(); // eye transform
  ctx.restore(); // translate(0, cy)

  if (!pixelMode) return cv;

  const pw = Math.max(24, Math.round(W * 0.65));
  const ph = Math.max(16, Math.round(H * 0.65));
  const pc = document.createElement("canvas");
  pc.width = pw;
  pc.height = ph;
  const pctx = pc.getContext("2d")!;
  pctx.imageSmoothingEnabled = true;
  pctx.drawImage(cv, 0, 0, pw, ph);
  return pc;
}

// ---------- Soft Glossy Spinning Gold Coin ----------
const coinFrames: HTMLCanvasElement[] = [];
export function coinSprite(frame: number): HTMLCanvasElement {
  if (!coinFrames.length) {
    const scales = [1, 0.82, 0.5, 0.22, 0.5, 0.82];
    for (const sx of scales) {
      const S = 40;
      const c = document.createElement("canvas");
      c.width = S;
      c.height = S;
      const ctx = c.getContext("2d")!;
      const cx = S / 2,
        cy = S / 2,
        r = 15;
      ctx.fillStyle = "#c97408";
      ctx.strokeStyle = "#4a2500";
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.ellipse(cx + (sx < 0.9 ? 1.5 : 0), cy, Math.max(3, r * sx), r, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      const g = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
      g.addColorStop(0, "#fff8b8");
      g.addColorStop(0.45, "#ffd43b");
      g.addColorStop(1, "#f09400");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(cx, cy, Math.max(2.5, r * sx), r, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      if (sx > 0.45) {
        ctx.strokeStyle = "rgba(217, 128, 0, 0.7)";
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.ellipse(cx, cy, r * 0.68 * sx, r * 0.68, 0, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = "#fff9db";
        ctx.beginPath();
        ctx.roundRect(cx - 2 * sx, cy - 5, 4 * sx, 10, 2);
        ctx.fill();
      }
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(cx - r * 0.38 * sx, cy - r * 0.42, 2.3, 0, Math.PI * 2);
      ctx.fill();
      coinFrames.push(c);
    }
  }
  return coinFrames[((frame % coinFrames.length) + coinFrames.length) % coinFrames.length];
}

function measureOpaqueBounds(cv: HTMLCanvasElement): { minX: number; minY: number; maxX: number; maxY: number } {
  const ctx = cv.getContext("2d");
  if (!ctx) return { minX: 0, minY: 0, maxX: cv.width - 1, maxY: cv.height - 1 };
  const { width: w, height: h } = cv;
  const data = ctx.getImageData(0, 0, w, h).data;
  let minX = w,
    minY = h,
    maxX = -1,
    maxY = -1;
  for (let y = 0; y < h; y += 2) {
    const row = y * w * 4;
    for (let x = 0; x < w; x += 2) {
      if (data[row + x * 4 + 3] > 10) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX || maxY < minY) return { minX: 0, minY: 0, maxX: w - 1, maxY: h - 1 };
  return {
    minX: Math.max(0, minX - 1),
    minY: Math.max(0, minY - 1),
    maxX: Math.min(w - 1, maxX + 1),
    maxY: Math.min(h - 1, maxY + 1),
  };
}

function cropCanvas(cv: HTMLCanvasElement, box: { minX: number; minY: number; maxX: number; maxY: number }, pad = 4): HTMLCanvasElement {
  const x0 = Math.max(0, box.minX - pad);
  const y0 = Math.max(0, box.minY - pad);
  const x1 = Math.min(cv.width - 1, box.maxX + pad);
  const y1 = Math.min(cv.height - 1, box.maxY + pad);
  const cw = Math.max(1, x1 - x0 + 1);
  const ch = Math.max(1, y1 - y0 + 1);
  const out = document.createElement("canvas");
  out.width = cw;
  out.height = ch;
  const octx = out.getContext("2d")!;
  octx.drawImage(cv, x0, y0, cw, ch, 0, 0, cw, ch);
  return out;
}

export function spriteDataURL(sp: Species, size = 200, jawState: JawState = 0): string {
  const c = renderFishCanvas(sp, size, jawState, 0, false, jawState === -1 ? "happy" : "normal");
  return cropCanvas(c, measureOpaqueBounds(c), 4).toDataURL();
}

export function spritePreviewFrames(sp: Species, size = 240, states: JawState[]): Record<JawState, string> {
  const rendered = states.map((st) => ({
    st,
    cv: renderFishCanvas(sp, size, st, 0, false, st === -1 ? "happy" : "normal"),
  }));
  const box = { minX: Infinity, minY: Infinity, maxX: -1, maxY: -1 };
  for (const item of rendered) {
    const b = measureOpaqueBounds(item.cv);
    if (b.minX < box.minX) box.minX = b.minX;
    if (b.minY < box.minY) box.minY = b.minY;
    if (b.maxX > box.maxX) box.maxX = b.maxX;
    if (b.maxY > box.maxY) box.maxY = b.maxY;
  }
  const out: Partial<Record<JawState, string>> = {};
  for (const item of rendered) {
    out[item.st] = cropCanvas(item.cv, box, 5).toDataURL();
  }
  return out as Record<JawState, string>;
}

export function spritePreviewFrameSingle(
  sp: Species,
  size: number,
  st: JawState,
  tf: number,
  sharedBox?: { minX: number; minY: number; maxX: number; maxY: number }
): { canvas: HTMLCanvasElement; box: { minX: number; minY: number; maxX: number; maxY: number } } {
  const cv = renderFishCanvas(sp, size, st, tf % TAIL_FRAMES, false, st === -1 ? "happy" : "normal");
  const box = sharedBox || measureOpaqueBounds(cv);
  return { canvas: cropCanvas(cv, box, 10), box };
}

export function spriteAnimPreviewCanvases(sp: Species, size = 240, cycle: JawState[]): HTMLCanvasElement[] {
  const unique = new Map<string, { st: JawState; tf: number; cv: HTMLCanvasElement }>();
  const box = { minX: Infinity, minY: Infinity, maxX: -1, maxY: -1 };
  const keys = cycle.map((st, i) => {
    const tf = i % TAIL_FRAMES;
    const key = `${st}|${tf}`;
    if (!unique.has(key)) {
      const cv = renderFishCanvas(sp, size, st, tf, false, st === -1 ? "happy" : "normal");
      const b = measureOpaqueBounds(cv);
      if (b.minX < box.minX) box.minX = b.minX;
      if (b.minY < box.minY) box.minY = b.minY;
      if (b.maxX > box.maxX) box.maxX = b.maxX;
      if (b.maxY > box.maxY) box.maxY = b.maxY;
      unique.set(key, { st, tf, cv });
    }
    return key;
  });
  const cropped = new Map<string, HTMLCanvasElement>();
  for (const [key, item] of unique) {
    cropped.set(key, cropCanvas(item.cv, box, 5));
  }
  return keys.map((k) => cropped.get(k)!);
}

export function spriteAnimPreviewFrames(sp: Species, size = 240, cycle: JawState[]): string[] {
  const canvases = spriteAnimPreviewCanvases(sp, size, cycle);
  const urls = new Map<HTMLCanvasElement, string>();
  return canvases.map((cv) => {
    let u = urls.get(cv);
    if (!u) {
      u = cv.toDataURL();
      urls.set(cv, u);
    }
    return u;
  });
}


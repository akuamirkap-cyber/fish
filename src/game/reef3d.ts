// ============================================================================
// TRUE 3D (THREE.JS WEBGL) REEF BIOTA, LARGE ROCK FORMATIONS & TERRAIN
// Bakes authentic 3D-lit, normal-shaded Three.js meshes into crisp multi-frame
// sprites & terrain canvases using ONE pooled offscreen WebGLRenderer during
// Ocean.build() (disposed immediately after generation for 0 runtime lag).
// Preserves exact 2D/SDF footprints, cave openings, & colliders for seamless
// live switching between 3D Mode (default) and 2D Mode.
// ============================================================================
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { PAL, NF } from "./reef";
import type { Bio, BioSet } from "./reef";
import { sampleCaveBounds } from "./reef2d";
import type { RockPal2d, CaveSpec2d } from "./reef2d";
import { rng, hash2 } from "./pixel";
import { isSoftwareWebGL } from "./fish3d";

type Pal = number[];
const TAU = Math.PI * 2;
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

function abgrToColor(c: number, bright = 1): THREE.Color {
  const r = clamp01(((c & 255) / 255) * bright);
  const g = clamp01((((c >> 8) & 255) / 255) * bright);
  const b = clamp01((((c >> 16) & 255) / 255) * bright);
  return new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);
}

function hexToColor(hex: string): THREE.Color {
  return new THREE.Color(hex);
}

// ----------------------------------------------------------------------------
// POOLED THREE.JS OFFSCREEN RENDERER (SINGLE CONTEXT, DISPOSED AFTER BUILD)
// ----------------------------------------------------------------------------
interface PooledRenderer {
  renderer: THREE.WebGLRenderer;
  pmrem: THREE.PMREMGenerator;
  envTex: THREE.Texture;
}

let _pool: PooledRenderer | null = null;
let _poolFailed = false;
const _matCache = new Map<string, THREE.MeshStandardMaterial>();

function cachedStdMat(
  key: string,
  params: THREE.MeshStandardMaterialParameters
): THREE.MeshStandardMaterial {
  let m = _matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial(params);
    _matCache.set(key, m);
  }
  return m;
}

function getPool(): PooledRenderer | null {
  if (_pool) return _pool;
  if (_poolFailed || typeof document === "undefined") return null;
  try {
    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: !isSoftwareWebGL(),
      preserveDrawingBuffer: true,
      powerPreference: "high-performance",
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(1);
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    _pool = { renderer, pmrem, envTex };
    return _pool;
  } catch {
    _poolFailed = true;
    return null;
  }
}

export function disposeReef3DRenderer() {
  _matCache.forEach((m) => {
    try {
      m.dispose();
    } catch {
      /* ignore */
    }
  });
  _matCache.clear();
  if (!_pool) return;
  try {
    _pool.envTex.dispose();
    _pool.pmrem.dispose();
    _pool.renderer.dispose();
  } catch {
    /* ignore */
  }
  _pool = null;
}

function copyRendererToCanvas(pxW: number, pxH: number): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = Math.max(2, pxW);
  cv.height = Math.max(2, pxH);
  const pool = getPool();
  if (!pool) return cv;
  const ctx = cv.getContext("2d");
  if (ctx) ctx.drawImage(pool.renderer.domElement, 0, 0, pxW, pxH);
  return cv;
}

function disposeGroup(root: THREE.Object3D) {
  root.traverse((obj) => {
    const m = obj as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
  });
}

function createUnderwaterScene(ambientInt = 1.05, keyInt = 1.85, rimInt = 0.95): THREE.Scene {
  const scene = new THREE.Scene();
  const pool = getPool();
  if (pool) {
    scene.environment = pool.envTex;
    scene.environmentIntensity = 0.42;
  }
  const hemi = new THREE.HemisphereLight(0xb8f6ff, 0x0b254a, ambientInt);
  scene.add(hemi);

  const key = new THREE.DirectionalLight(0xfff6dc, keyInt);
  key.position.set(-0.55, 0.85, 0.95);
  scene.add(key);

  const rim = new THREE.DirectionalLight(0x62e8ff, rimInt);
  rim.position.set(0.75, -0.15, -0.55);
  scene.add(rim);

  const fill = new THREE.DirectionalLight(0x88bfff, 0.55);
  fill.position.set(0.3, 0.35, 0.8);
  scene.add(fill);
  return scene;
}

function renderSceneOrtho(
  scene: THREE.Scene,
  worldW: number,
  worldH: number,
  scale = 2,
  camTiltY = 0
): HTMLCanvasElement {
  const pool = getPool();
  const pxW = Math.max(2, Math.round(worldW * scale));
  const pxH = Math.max(2, Math.round(worldH * scale));
  if (!pool) {
    const cv = document.createElement("canvas");
    cv.width = pxW;
    cv.height = pxH;
    return cv;
  }
  pool.renderer.setSize(pxW, pxH, false);
  const cam = new THREE.OrthographicCamera(-worldW * 0.5, worldW * 0.5, worldH * 0.5, -worldH * 0.5, 1, 1400);
  cam.position.set(0, camTiltY, 500);
  cam.lookAt(0, 0, 0);
  pool.renderer.render(scene, cam);
  return copyRendererToCanvas(pxW, pxH);
}

// ============================================================================
// MATERIAL & MESH HELPERS FOR 3D CORALS & BIOTA
// ============================================================================
function stdMat(
  col: THREE.Color,
  roughness = 0.44,
  metalness = 0.04,
  emissive?: THREE.Color,
  emissiveInt = 0,
  clearcoat = 0.15
): THREE.MeshStandardMaterial {
  const effRough = Math.max(0.1, roughness - clearcoat * 0.25);
  const emHex = emissive ? emissive.getHexString() : "000000";
  const key = `std|${col.getHexString()}|${effRough.toFixed(2)}|${metalness.toFixed(2)}|${emHex}|${emissiveInt.toFixed(2)}`;
  return cachedStdMat(key, {
    color: col,
    roughness: effRough,
    metalness,
    emissive: emissive ?? new THREE.Color(0x000000),
    emissiveIntensity: emissiveInt,
    side: THREE.DoubleSide,
  });
}

function palMat(pal: Pal, idx = 2, roughness = 0.44, glow = false, clearcoat = 0.16): THREE.MeshStandardMaterial {
  const c = abgrToColor(pal[idx], 1.04);
  const em = glow ? abgrToColor(pal[Math.min(4, idx + 1)]) : undefined;
  return stdMat(c, roughness, 0.04, em, glow ? 0.32 : 0, clearcoat);
}

function renderBioGroup(
  w: number,
  h: number,
  build: (root: THREE.Group) => void,
  camTilt = 0.12,
  scale = isSoftwareWebGL() ? 1.5 : 2.0
): HTMLCanvasElement {
  const scene = createUnderwaterScene(1.12, 1.95, 1.0);
  const root = new THREE.Group();
  scene.add(root);
  build(root);
  const cv = renderSceneOrtho(scene, w, h, scale, h * camTilt);
  disposeGroup(root);
  return cv;
}

function tintCv(src: HTMLCanvasElement, col: number, alpha: number): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = src.width;
  cv.height = src.height;
  const c = cv.getContext("2d")!;
  c.drawImage(src, 0, 0);
  c.globalCompositeOperation = "source-atop";
  const r = col & 255;
  const g = (col >> 8) & 255;
  const b = (col >> 16) & 255;
  c.fillStyle = `rgba(${r},${g},${b},${alpha})`;
  c.fillRect(0, 0, cv.width, cv.height);
  return cv;
}

// ============================================================================
// 3D CORAL & BIOTA BUILDERS (TRUE THREE.JS 3D GEOMETRY)
// ============================================================================

function buildBranch3d(root: THREE.Group, seed: number, pal: Pal, _w: number, h: number, len: number, th: number, depth: number, knob = false) {
  const r = rng(seed);
  const by = -h * 0.5 + 1.5;
  const baseMat = palMat(pal, 2, 0.42, knob);
  const tipMat = palMat(pal, 4, 0.28, true, 0.35);
  const darkMat = palMat(pal, 1, 0.55);

  // Holdfast rock-hugging foot
  const footGeo = new THREE.SphereGeometry(th * 1.15, 12, 8);
  footGeo.scale(1.3, 0.45, 1.1);
  const foot = new THREE.Mesh(footGeo, darkMat);
  foot.position.set(0, by + th * 0.15, 0);
  root.add(foot);

  const grow = (x: number, y: number, z: number, ax: number, az: number, l: number, rad: number, d: number) => {
    const dx = Math.cos(ax) * Math.cos(az) * l;
    const dy = Math.sin(ax) * l;
    const dz = Math.sin(az) * l * 0.55;
    const x2 = x + dx;
    const y2 = y + dy;
    const z2 = z + dz;
    const mid = new THREE.Vector3((x + x2) * 0.5 + (r() - 0.5) * 1.5, (y + y2) * 0.5, (z + z2) * 0.5 + (r() - 0.5) * 1.5);
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(x, y, z), mid, new THREE.Vector3(x2, y2, z2)]);
    const tubeGeo = new THREE.TubeGeometry(curve, 6, rad * 0.5, 8, false);
    const mesh = new THREE.Mesh(tubeGeo, d === depth ? darkMat : baseMat);
    root.add(mesh);

    const joint = new THREE.Mesh(new THREE.SphereGeometry(rad * 0.52, 8, 6), d <= 1 ? tipMat : baseMat);
    joint.position.set(x2, y2, z2);
    root.add(joint);

    if (d > 0 && l > 3.5) {
      const n = d >= 2 && r() < 0.42 ? 3 : 2;
      for (let i = 0; i < n; i++) {
        const sp = n === 3 ? (i - 1) * (0.48 + r() * 0.18) : (i ? 1 : -1) * (0.32 + r() * 0.25);
        const na = Math.max(0.28, Math.min(Math.PI - 0.28, ax + sp));
        const nz = az + (r() - 0.5) * 0.85;
        grow(x2, y2, z2, na, nz, l * (0.64 + r() * 0.18), Math.max(1.0, rad * 0.72), d - 1);
      }
    } else {
      const tip = new THREE.Mesh(new THREE.SphereGeometry(knob ? rad * 0.95 : rad * 0.62, 10, 8), tipMat);
      tip.position.set(x2, y2, z2);
      root.add(tip);
    }
  };

  const trunks = 1 + (r() < 0.65 ? 1 : 0);
  for (let i = 0; i < trunks; i++) {
    const o = i - (trunks - 1) / 2;
    grow(o * 4.5, by + 1, (r() - 0.5) * 2, Math.PI * 0.5 + (r() - 0.5) * 0.45 - o * 0.45, (r() - 0.5) * 0.7, len * (0.78 + r() * 0.25), th * 0.95, depth);
  }
}

function buildTable3d(root: THREE.Group, seed: number, pal: Pal, w: number, h: number) {
  const r = rng(seed);
  const by = -h * 0.5 + 1.5;
  const tiers = r() < 0.55 ? 2 : 1;
  const baseMat = palMat(pal, 2, 0.45);
  const topMat = palMat(pal, 3, 0.35, true, 0.25);
  const stalkMat = palMat(pal, 1, 0.55);

  let sy = by;
  let ox = 0;
  let R = Math.min(w * 0.44, h * 0.75);
  for (let t = 0; t < tiers; t++) {
    const stemH = h * (tiers === 2 ? 0.34 : 0.46);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.16, R * 0.24, stemH, 10), stalkMat);
    stem.position.set(ox, sy + stemH * 0.5, 0);
    root.add(stem);

    // Flared saucer disc with organic scalloped wave edge
    const discGeo = new THREE.CylinderGeometry(R, R * 0.32, Math.max(3, R * 0.22), 24, 2);
    const pos = discGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i);
      const vy = pos.getY(i);
      const vz = pos.getZ(i);
      const rad = Math.hypot(vx, vz);
      const ang = Math.atan2(vz, vx);
      if (rad > R * 0.55) {
        const wave = Math.sin(ang * 7 + seed) * 1.1 + Math.cos(ang * 11 - seed) * 0.6;
        pos.setY(i, vy + wave);
        pos.setX(i, vx * (1 + Math.sin(ang * 5 + t) * 0.08));
        pos.setZ(i, vz * (1 + Math.cos(ang * 5 + t) * 0.08));
      }
    }
    discGeo.computeVertexNormals();
    const plate = new THREE.Mesh(discGeo, t === 0 ? topMat : baseMat);
    plate.position.set(ox, sy + stemH, 0);
    plate.rotation.x = 0.22;
    plate.rotation.z = (r() - 0.5) * 0.12;
    root.add(plate);

    // Concentric rim highlight ring
    const rim = new THREE.Mesh(new THREE.TorusGeometry(R * 0.86, Math.max(0.65, R * 0.055), 8, 24), palMat(pal, 4, 0.3, true));
    rim.rotation.x = Math.PI * 0.5 + 0.22;
    rim.position.set(ox, sy + stemH + 1.2, 0);
    root.add(rim);

    sy += stemH * 0.85;
    ox += (r() - 0.5) * R * 0.55;
    R *= 0.68;
  }
}

function buildBrain3d(root: THREE.Group, seed: number, pal: Pal, w: number, h: number) {
  const rx = w * 0.42;
  const ry = Math.min(h * 0.78, w * 0.42);
  const geo = new THREE.SphereGeometry(1, 28, 18, 0, TAU, 0, Math.PI * 0.62);
  const pos = geo.attributes.position;
  const cols = new Float32Array(pos.count * 3);
  const cDark = abgrToColor(pal[1]);
  const cMid = abgrToColor(pal[2]);
  const cLight = abgrToColor(pal[4]);

  for (let i = 0; i < pos.count; i++) {
    const nx = pos.getX(i);
    const ny = pos.getY(i);
    const nz = pos.getZ(i);
    const ridge = Math.sin(nx * 14 + Math.sin(nz * 10 + seed) * 2.1) * Math.cos(nz * 13 + Math.sin(ny * 9) * 2.0);
    const groove = 1 + ridge * 0.085;
    pos.setXYZ(i, nx * rx * groove, ny * ry * groove, nz * rx * groove);
    const k = clamp01((ridge + 1) * 0.5);
    const c = k < 0.45 ? cDark.clone().lerp(cMid, k / 0.45) : cMid.clone().lerp(cLight, (k - 0.45) / 0.55);
    cols[i * 3] = c.r;
    cols[i * 3 + 1] = c.g;
    cols[i * 3 + 2] = c.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(cols, 3));
  geo.computeVertexNormals();
  const emCol = abgrToColor(pal[2]);
  const mat = cachedStdMat(`brain|${emCol.getHexString()}`, {
    vertexColors: true,
    roughness: 0.32,
    metalness: 0.04,
    emissive: emCol,
    emissiveIntensity: 0.12,
  });
  const dome = new THREE.Mesh(geo, mat);
  dome.position.set(0, -h * 0.5 + 1.5, 0);
  root.add(dome);
}

function buildPillar3d(root: THREE.Group, seed: number, pal: Pal, w: number, h: number) {
  const r = rng(seed);
  const by = -h * 0.5 + 1;
  const mat = palMat(pal, 2, 0.42);
  const topMat = palMat(pal, 4, 0.3, true);
  const n = 4 + ((r() * 3) | 0);
  for (let i = 0; i < n; i++) {
    const f = (i / (n - 1) - 0.5) * 2;
    const x = f * w * 0.32 + (r() - 0.5) * 2.5;
    const z = (r() - 0.5) * w * 0.26;
    const ph = h * (0.48 + (1 - Math.abs(f) * 0.55) * 0.42 + r() * 0.08);
    const rad = Math.max(1.8, w * 0.1 + r() * 1.2);
    const col = new THREE.Mesh(new THREE.CapsuleGeometry(rad, Math.max(2, ph - rad * 2), 6, 10), i % 2 ? mat : topMat);
    col.position.set(x, by + ph * 0.5, z);
    col.rotation.z = (r() - 0.5) * 0.14;
    col.rotation.x = (r() - 0.5) * 0.14;
    root.add(col);
  }
}

function buildLettuce3d(root: THREE.Group, seed: number, pal: Pal, w: number, h: number) {
  const r = rng(seed);
  const by = -h * 0.5 + 2;
  const innerMat = palMat(pal, 2, 0.38);
  const rimMat = palMat(pal, 4, 0.28, true, 0.3);
  const rings = 3;
  for (let ring = 0; ring < rings; ring++) {
    const petals = 5 + ring * 2;
    const rad = (ring + 1) * (w * 0.14);
    const ph = h * (0.72 - ring * 0.14);
    for (let i = 0; i < petals; i++) {
      const ang = (i / petals) * TAU + ring * 0.5 + r() * 0.3;
      const geo = new THREE.CylinderGeometry(rad * 0.72, rad * 0.25, ph, 10, 2, true, -0.55, 1.1);
      const pos = geo.attributes.position;
      for (let k = 0; k < pos.count; k++) {
        const y = pos.getY(k);
        if (y > 0) {
          pos.setX(k, pos.getX(k) * 1.28);
          pos.setZ(k, pos.getZ(k) * 1.28);
          pos.setY(k, y + Math.sin(k * 2.1 + seed) * 1.6);
        }
      }
      geo.computeVertexNormals();
      const leaf = new THREE.Mesh(geo, ring === 0 ? rimMat : innerMat);
      leaf.position.set(Math.cos(ang) * rad * 0.35, by + ph * 0.45, Math.sin(ang) * rad * 0.35);
      leaf.rotation.y = -ang + Math.PI * 0.5;
      leaf.rotation.x = 0.18 + ring * 0.14;
      root.add(leaf);
    }
  }
}

function buildFan3d(root: THREE.Group, seed: number, pal: Pal, _w: number, h: number) {
  const r = rng(seed);
  const by = -h * 0.5 + 1.5;
  const mat = palMat(pal, 3, 0.36, true, 0.25);
  const stemMat = palMat(pal, 1, 0.5);

  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.8, h * 0.22, 8), stemMat);
  trunk.position.set(0, by + h * 0.11, 0);
  root.add(trunk);

  const branch = (x: number, y: number, z: number, ang: number, len: number, thick: number, d: number) => {
    const x2 = x + Math.cos(ang) * len;
    const y2 = y + Math.sin(ang) * len;
    const z2 = z + (r() - 0.5) * 3.0;
    const curve = new THREE.LineCurve3(new THREE.Vector3(x, y, z), new THREE.Vector3(x2, y2, z2));
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 3, thick, 6, false), d >= 2 ? stemMat : mat);
    root.add(mesh);
    if (d > 0 && len > 2.5) {
      for (const s of [-1, 1]) {
        branch(x2, y2, z2, ang + s * (0.28 + r() * 0.24), len * 0.72, Math.max(0.35, thick * 0.7), d - 1);
      }
      if (d === 2 && r() < 0.6) branch(x2, y2, z2, ang + (r() - 0.5) * 0.2, len * 0.76, thick * 0.75, d - 1);
    }
  };
  for (const s of [-0.38, 0, 0.38]) {
    branch(0, by + h * 0.18, 0, Math.PI * 0.5 + s, h * 0.24, 0.95, 3);
  }
}

function buildWhip3d(root: THREE.Group, seed: number, pal: Pal, w: number, h: number, bamboo = false) {
  const r = rng(seed);
  const by = -h * 0.5 + 1;
  const mat = palMat(pal, 3, 0.35, bamboo);
  const jointMat = palMat(pal, 4, 0.25, true);
  const n = 2 + ((r() * 3) | 0);
  for (let i = 0; i < n; i++) {
    const ox = (i - (n - 1) / 2) * (w * 0.22);
    const pts: THREE.Vector3[] = [];
    const segs = 9;
    const ht = h * (0.76 + r() * 0.18);
    const ph = r() * TAU;
    for (let k = 0; k <= segs; k++) {
      const f = k / segs;
      const sx = ox + Math.sin(f * Math.PI * 2.2 + ph) * (w * 0.14) * f;
      const sz = Math.cos(f * Math.PI * 2.0 + ph) * (w * 0.12) * f;
      pts.push(new THREE.Vector3(sx, by + f * ht, sz));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const rad = bamboo ? 1.15 : 0.85;
    root.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 18, rad, 8, false), mat));
    if (bamboo) {
      for (let k = 1; k < segs; k++) {
        const pt = curve.getPoint(k / segs);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(rad * 1.15, 0.35, 6, 10), jointMat);
        ring.position.copy(pt);
        ring.rotation.x = Math.PI * 0.5;
        root.add(ring);
      }
    }
  }
}

function buildTubes3d(root: THREE.Group, seed: number, pal: Pal, w: number, h: number, barrel = false) {
  const r = rng(seed);
  const by = -h * 0.5 + 1.5;
  const outerMat = palMat(pal, 2, 0.46, false, 0.12);
  const rimMat = palMat(pal, 4, 0.32, true, 0.25);
  const innerMat = stdMat(abgrToColor(pal[0], 0.45), 0.9);

  if (barrel) {
    const rad = Math.min(w * 0.38, h * 0.44);
    const ht = h * 0.84;
    const pts = [
      new THREE.Vector2(rad * 0.58, 0),
      new THREE.Vector2(rad * 0.98, ht * 0.38),
      new THREE.Vector2(rad * 0.88, ht * 0.85),
      new THREE.Vector2(rad * 0.72, ht),
      new THREE.Vector2(rad * 0.54, ht * 0.88),
      new THREE.Vector2(rad * 0.42, ht * 0.25),
    ];
    const geo = new THREE.LatheGeometry(pts, 20);
    const mesh = new THREE.Mesh(geo, outerMat);
    mesh.position.set(0, by, 0);
    root.add(mesh);

    const lip = new THREE.Mesh(new THREE.TorusGeometry(rad * 0.65, rad * 0.14, 10, 20), rimMat);
    lip.rotation.x = Math.PI * 0.5;
    lip.position.set(0, by + ht * 0.96, 0);
    root.add(lip);

    const hole = new THREE.Mesh(new THREE.CircleGeometry(rad * 0.56, 16), innerMat);
    hole.rotation.x = -Math.PI * 0.5;
    hole.position.set(0, by + ht * 0.86, 0);
    root.add(hole);
    return;
  }

  const n = 4 + ((r() * 3) | 0);
  for (let i = 0; i < n; i++) {
    const f = (i / (n - 1) - 0.5) * 2;
    const x = f * w * 0.28 + (r() - 0.5) * 2;
    const z = (r() - 0.5) * w * 0.24;
    const th = h * (0.48 + (1 - Math.abs(f) * 0.5) * 0.4 + r() * 0.1);
    const rad = Math.max(1.8, w * 0.085 + r() * 1.1);
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad * 0.76, th, 12, 1, true), outerMat);
    cyl.position.set(x, by + th * 0.5, z);
    cyl.rotation.z = -f * 0.18 + (r() - 0.5) * 0.08;
    root.add(cyl);

    const rim = new THREE.Mesh(new THREE.TorusGeometry(rad * 0.92, rad * 0.18, 8, 14), rimMat);
    rim.position.set(x - Math.sin(cyl.rotation.z) * th * 0.5, by + Math.cos(cyl.rotation.z) * th, z);
    rim.rotation.x = Math.PI * 0.5;
    rim.rotation.y = cyl.rotation.z;
    root.add(rim);

    const cav = new THREE.Mesh(new THREE.CircleGeometry(rad * 0.78, 12), innerMat);
    cav.position.copy(rim.position);
    cav.rotation.x = -Math.PI * 0.5;
    root.add(cav);
  }
}

function buildAnemone3d(root: THREE.Group, seed: number, pal: Pal, tipHex: number, w: number, h: number, count: number, plume = false) {
  const r = rng(seed);
  const by = -h * 0.5 + 1.5;
  const stalkMat = palMat(pal, 1, 0.45);
  const tentMat = palMat(pal, 3, 0.34, true, 0.25);
  const tipMat = stdMat(abgrToColor(tipHex, 1.1), 0.22, 0.04, abgrToColor(tipHex), 0.45, 0.4);

  const base = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.2, w * 0.25, h * 0.28, 14), stalkMat);
  base.position.set(0, by + h * 0.14, 0);
  root.add(base);

  for (let i = 0; i < count; i++) {
    const f = i / count;
    const ang = f * TAU + r() * 0.35;
    const spread = 0.28 + (i % 3) * 0.22;
    const tx = Math.cos(ang) * w * 0.36 * spread;
    const tz = Math.sin(ang) * w * 0.32 * spread;
    const ty = by + h * (0.62 + r() * 0.3);
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(Math.cos(ang) * w * 0.1, by + h * 0.24, Math.sin(ang) * w * 0.1),
      new THREE.Vector3(tx * 0.7, by + h * 0.55, tz * 0.7),
      new THREE.Vector3(tx, ty, tz)
    );
    const rad = plume ? 0.55 : 0.85;
    root.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 7, rad, 6, false), tentMat));
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(plume ? 0.9 : 1.35, 8, 6), tipMat);
    bulb.position.set(tx, ty, tz);
    root.add(bulb);
  }
}

function buildClam3d(root: THREE.Group, shellPal: Pal, mantlePal: Pal, ph: number, hide: number, w: number, h: number) {
  const by = -h * 0.5 + 2;
  const openAmt = hide > 0 ? Math.max(0.05, 1 - hide * 0.92) : 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(ph * TAU));
  const shellMat = palMat(shellPal, 3, 0.38, false, 0.28);
  const mantleMat = palMat(mantlePal, 3, 0.25, true, 0.45);
  const pearlMat = cachedStdMat("clamPearl", {
    color: 0xf8fcff,
    roughness: 0.08,
    metalness: 0.05,
    emissive: new THREE.Color(0x9be8ff),
    emissiveIntensity: 0.28,
  });

  const makeValve = () => {
    const geo = new THREE.SphereGeometry(w * 0.36, 18, 12, 0, Math.PI, 0, Math.PI * 0.55);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i);
      const vy = pos.getY(i);
      const vz = pos.getZ(i);
      const ang = Math.atan2(vz, vx);
      const rib = 1 + Math.sin(ang * 9) * 0.09;
      pos.setXYZ(i, vx * 1.15 * rib, vy * 0.55 * rib, vz * rib);
    }
    geo.computeVertexNormals();
    return geo;
  };

  const lower = new THREE.Mesh(makeValve(), shellMat);
  lower.position.set(0, by + h * 0.22, 0);
  lower.rotation.x = Math.PI - 0.16 * openAmt;
  root.add(lower);

  const upper = new THREE.Mesh(makeValve(), shellMat);
  upper.position.set(0, by + h * 0.28, -w * 0.06);
  upper.rotation.x = -0.35 - 0.58 * openAmt;
  root.add(upper);

  if (openAmt > 0.22) {
    const mantle = new THREE.Mesh(new THREE.TorusGeometry(w * 0.24, w * 0.075, 8, 16, Math.PI * 1.1), mantleMat);
    mantle.position.set(0, by + h * 0.26, w * 0.08);
    mantle.rotation.x = Math.PI * 0.42;
    mantle.rotation.z = -Math.PI * 0.05;
    root.add(mantle);

    const pearl = new THREE.Mesh(new THREE.SphereGeometry(Math.max(1.8, w * 0.1), 14, 10), pearlMat);
    pearl.position.set(0, by + h * 0.32, w * 0.05);
    root.add(pearl);
  }
}

function buildWorm3d(root: THREE.Group, seed: number, plumePal: Pal, tubePal: Pal, ph: number, hide: number, w: number, h: number, riftia = false) {
  const r = rng(seed);
  const by = -h * 0.5 + 1.5;
  const tubeMat = palMat(tubePal, 2, 0.5);
  const plumeMat = palMat(plumePal, 3, 0.28, true, 0.3);
  const n = riftia ? 4 : 3;
  const retract = 1 - hide * 0.88;

  for (let i = 0; i < n; i++) {
    const ox = (i - (n - 1) / 2) * (w * 0.22);
    const th = h * (0.45 + r() * 0.2);
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(ox * 0.5, by, 0),
      new THREE.Vector3(ox + (r() - 0.5) * 3, by + th * 0.55, (r() - 0.5) * 3),
      new THREE.Vector3(ox, by + th, 0)
    );
    const rad = riftia ? 1.5 : 1.05;
    root.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 8, rad, 8, false), tubeMat));
    if (retract > 0.18) {
      const swayX = Math.sin(ph * TAU + i * 1.4) * 1.6 * retract;
      const top = curve.getPoint(1);
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * TAU;
        const pEnd = new THREE.Vector3(
          top.x + swayX + Math.cos(a) * 3.8 * retract,
          top.y + (3.8 + (k % 2)) * retract,
          top.z + Math.sin(a) * 3.8 * retract
        );
        const fCurve = new THREE.LineCurve3(top, pEnd);
        root.add(new THREE.Mesh(new THREE.TubeGeometry(fCurve, 2, 0.55, 5, false), plumeMat));
      }
    }
  }
}

function buildKelp3d(root: THREE.Group, seed: number, pal: Pal, w: number, h: number, blades: number) {
  const r = rng(seed);
  const by = -h * 0.5 + 1;
  const leafMat = palMat(pal, 3, 0.35, false, 0.2);
  const bulbMat = palMat(pal, 4, 0.25, true);
  for (let b = 0; b < blades; b++) {
    const ox = (b - (blades - 1) / 2) * (w * 0.2);
    const pts: THREE.Vector3[] = [];
    const ph = r() * TAU;
    const ht = h * (0.72 + r() * 0.22);
    for (let k = 0; k <= 8; k++) {
      const f = k / 8;
      pts.push(new THREE.Vector3(ox + Math.sin(f * 5 + ph) * (w * 0.18), by + f * ht, Math.cos(f * 4 + ph) * 2.5));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 14, 1.35, 6, false), leafMat);
    mesh.scale.set(1.4, 1, 0.55);
    root.add(mesh);

    for (let k = 2; k <= 7; k += 2) {
      const pt = curve.getPoint(k / 8);
      const blade = new THREE.Mesh(new THREE.SphereGeometry(2.1, 8, 6), leafMat);
      blade.scale.set(1.8, 0.55, 0.45);
      blade.position.set(pt.x + (k % 4 === 0 ? 2.4 : -2.4), pt.y, pt.z);
      blade.rotation.z = k % 4 === 0 ? 0.5 : -0.5;
      root.add(blade);
      const bladder = new THREE.Mesh(new THREE.SphereGeometry(0.95, 7, 6), bulbMat);
      bladder.position.copy(pt);
      root.add(bladder);
    }
  }
}

function buildUrchin3d(root: THREE.Group, seed: number, pal: Pal, w: number, h: number) {
  const r = rng(seed);
  const rad = Math.min(w, h) * 0.22;
  const cy = -h * 0.5 + rad * 0.9;
  const body = new THREE.Mesh(new THREE.SphereGeometry(rad, 12, 10), palMat(pal, 1, 0.45));
  body.position.set(0, cy, 0);
  root.add(body);

  const spineMat = palMat(pal, 3, 0.3, true, 0.3);
  const count = 26;
  for (let i = 0; i < count; i++) {
    const phi = Math.acos(1 - ((i + 0.5) / count) * 1.15);
    const theta = i * 2.39996 + r() * 0.2;
    const dir = new THREE.Vector3(Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta));
    const len = rad * (1.25 + r() * 0.55);
    const sp = new THREE.Mesh(new THREE.ConeGeometry(rad * 0.14, len, 6), spineMat);
    sp.position.copy(dir).multiplyScalar(rad * 0.8 + len * 0.42).add(new THREE.Vector3(0, cy, 0));
    sp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    root.add(sp);
  }
}

function buildStar3d(root: THREE.Group, pal: Pal, w: number, h: number) {
  const mat = palMat(pal, 3, 0.38, true, 0.22);
  const bumpMat = palMat(pal, 4, 0.25, true);
  const rad = Math.min(w, h) * 0.42;
  const hub = new THREE.Mesh(new THREE.SphereGeometry(rad * 0.34, 10, 8), mat);
  hub.scale.set(1, 0.9, 0.55);
  root.add(hub);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU - Math.PI * 0.5;
    const arm = new THREE.Mesh(new THREE.ConeGeometry(rad * 0.24, rad * 0.9, 8), mat);
    arm.position.set(Math.cos(a) * rad * 0.48, Math.sin(a) * rad * 0.48, 0);
    arm.rotation.z = a - Math.PI * 0.5;
    arm.scale.set(1, 1, 0.52);
    root.add(arm);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(rad * 0.08, 6, 5), bumpMat);
    dot.position.set(Math.cos(a) * rad * 0.45, Math.sin(a) * rad * 0.45, rad * 0.12);
    root.add(dot);
  }
}

function buildShelf3d(root: THREE.Group, seed: number, pal: Pal, w: number, h: number) {
  const r = rng(seed);
  const mat = palMat(pal, 3, 0.38, true);
  const rimMat = palMat(pal, 4, 0.25, true);
  const tiers = 3;
  for (let t = 0; t < tiers; t++) {
    const rad = Math.min(w * 0.85, (w - 3) * (0.76 - t * 0.14));
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad * 0.52, 2.4, 16, 1, false, 0, Math.PI), t === 0 ? rimMat : mat);
    disc.position.set(-w * 0.48, (t - 1) * (h * 0.24), (r() - 0.5) * 1.5);
    disc.rotation.z = -0.06 + t * 0.04;
    root.add(disc);
  }
}

function buildVine3d(root: THREE.Group, seed: number, pal: Pal, _w: number, h: number, glow = false) {
  const r = rng(seed);
  const topY = h * 0.5 - 1;
  const leafMat = palMat(pal, 3, 0.34, glow, 0.25);
  const tipMat = palMat(pal, 4, 0.24, true);
  const n = 2 + ((r() * 2) | 0);
  for (let i = 0; i < n; i++) {
    const bx = (i - (n - 1) / 2) * 4.2 + (r() - 0.5) * 2;
    const ht = (h - 4) * (0.58 + r() * 0.38);
    const ph = r() * TAU;
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 7; k++) {
      const f = k / 7;
      pts.push(new THREE.Vector3(bx + Math.sin(f * 5 + ph) * 2.1, topY - f * ht, Math.cos(f * 4 + ph) * 1.6));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    root.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 12, 0.72, 6, false), leafMat));
    for (let k = 2; k <= 6; k += 2) {
      const pt = curve.getPoint(k / 7);
      const pod = new THREE.Mesh(new THREE.SphereGeometry(glow ? 1.35 : 1.1, 7, 6), glow ? tipMat : leafMat);
      pod.position.set(pt.x + (k % 4 === 0 ? 1.3 : -1.3), pt.y, pt.z);
      root.add(pod);
    }
  }
}

function buildCrystal3d(root: THREE.Group, seed: number, pal: Pal, w: number, h: number) {
  const r = rng(seed);
  const by = -h * 0.5 + 1.5;
  const col = abgrToColor(pal[3], 1.15);
  const em = abgrToColor(pal[4]);
  const mat = cachedStdMat(`crys|${col.getHexString()}|${em.getHexString()}`, {
    color: col,
    emissive: em,
    emissiveIntensity: 0.48,
    roughness: 0.08,
    metalness: 0.1,
    flatShading: true,
    transparent: true,
    opacity: 0.94,
  });
  const baseMat = palMat(pal, 1, 0.55);
  const base = new THREE.Mesh(new THREE.DodecahedronGeometry(w * 0.22, 0), baseMat);
  base.scale.set(1.2, 0.5, 1.0);
  base.position.set(0, by + 2, 0);
  root.add(base);

  const count = 4 + ((r() * 3) | 0);
  for (let i = 0; i < count; i++) {
    const f = (i / (count - 1) - 0.5) * 2;
    const ch = h * (0.5 + (1 - Math.abs(f) * 0.6) * 0.42);
    const cr = Math.max(2.0, w * (0.1 + r() * 0.05));
    const prism = new THREE.Mesh(new THREE.CylinderGeometry(cr * 0.12, cr, ch, 6), mat);
    prism.position.set(f * w * 0.22, by + ch * 0.46, (r() - 0.5) * w * 0.18);
    prism.rotation.z = -f * 0.38 + (r() - 0.5) * 0.14;
    prism.rotation.x = (r() - 0.5) * 0.22;
    root.add(prism);
  }
}

function buildPen3d(root: THREE.Group, _seed: number, pal: Pal, w: number, h: number) {
  const by = -h * 0.5 + 1.5;
  const stemMat = palMat(pal, 1, 0.45);
  const plumeMat = palMat(pal, 3, 0.28, true, 0.3);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.4, h * 0.9, 8), stemMat);
  stem.position.set(0, by + h * 0.45, 0);
  root.add(stem);
  const pairs = 8;
  for (let i = 0; i < pairs; i++) {
    const f = (i + 1) / (pairs + 1);
    const yy = by + h * (0.28 + f * 0.62);
    const span = Math.sin(f * Math.PI) * (w * 0.36);
    for (const s of [-1, 1]) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(1.4, Math.max(2.5, span), 6), plumeMat);
      leaf.position.set(s * span * 0.48, yy, (i % 2 ? 1 : -1) * 1.1);
      leaf.rotation.z = -s * 1.15;
      root.add(leaf);
    }
  }
}

function buildTunicate3d(root: THREE.Group, seed: number, pal: Pal, w: number, h: number) {
  const r = rng(seed);
  const by = -h * 0.5 + 1.5;
  const bodyMat = palMat(pal, 3, 0.25, true, 0.45);
  const holeMat = palMat(pal, 0, 0.85);
  const n = 3 + ((r() * 3) | 0);
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) * (w * 0.22);
    const z = (r() - 0.5) * 4;
    const rad = Math.max(2.2, w * 0.13);
    const ht = h * (0.58 + r() * 0.28);
    const sac = new THREE.Mesh(new THREE.SphereGeometry(rad, 12, 10), bodyMat);
    sac.scale.set(0.9, ht / (rad * 2), 0.9);
    sac.position.set(x, by + ht * 0.5, z);
    root.add(sac);

    const mouth = new THREE.Mesh(new THREE.TorusGeometry(rad * 0.42, rad * 0.14, 6, 12), holeMat);
    mouth.position.set(x, by + ht * 0.92, z + rad * 0.2);
    mouth.rotation.x = Math.PI * 0.4;
    root.add(mouth);
  }
}

function buildVent3d(root: THREE.Group, _seed: number, ph: number, w: number, h: number) {
  const by = -h * 0.5 + 1;
  const basalt = PAL.basalt;
  const ember = PAL.ember;
  const rockCol = abgrToColor(basalt[2]);
  const rockMat = cachedStdMat(`ventRock|${rockCol.getHexString()}`, { color: rockCol, roughness: 0.78, flatShading: true });
  const rimEmInt = 0.95 + Math.sin(ph * TAU * 2) * 0.35;
  const rimMat = cachedStdMat(`ventRim|${rimEmInt.toFixed(2)}`, {
    color: abgrToColor(ember[3]),
    emissive: abgrToColor(ember[2]),
    emissiveIntensity: rimEmInt,
    roughness: 0.3,
  });

  // Main volcano cone + parasitic side cone
  const mainCone = new THREE.Mesh(new THREE.ConeGeometry(w * 0.36, h * 0.46, 11, 2, true), rockMat);
  mainCone.position.set(2, by + h * 0.23, 0);
  root.add(mainCone);

  const sideCone = new THREE.Mesh(new THREE.ConeGeometry(w * 0.18, h * 0.25, 9), rockMat);
  sideCone.position.set(-w * 0.22, by + h * 0.125, 3);
  root.add(sideCone);

  // Glowing caldera crater disc + magma fissure veins
  const crater = new THREE.Mesh(new THREE.CircleGeometry(w * 0.1, 12), rimMat);
  crater.rotation.x = -Math.PI * 0.5;
  crater.position.set(2, by + h * 0.44, 0);
  root.add(crater);

  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU * 0.5 - 0.6;
    const crack = new THREE.Mesh(new THREE.BoxGeometry(1.1, h * 0.28, 1.2), rimMat);
    crack.position.set(2 + Math.sin(a) * w * 0.14, by + h * 0.22, Math.cos(a) * w * 0.14);
    crack.rotation.z = -Math.sin(a) * 0.45;
    root.add(crack);
  }

  // Rising 3D hydrothermal plume & crisp glowing bubbles
  const plumeMat = cachedStdMat("ventPlume", {
    color: 0xdcfaff,
    emissive: 0x6ce8ff,
    emissiveIntensity: 0.38,
    roughness: 0.2,
    transparent: true,
    opacity: 0.56,
  });
  for (let j = 0; j < 7; j++) {
    const q = (ph + j / 7) % 1;
    const yy = by + h * 0.46 + q * h * 0.48;
    const xx = 2 + Math.sin(q * 6 + j * 1.9) * (2.5 + q * 6.5);
    const rad = 2.0 + q * 5.2;
    const puff = new THREE.Mesh(new THREE.SphereGeometry(rad, 10, 8), plumeMat);
    puff.position.set(xx, yy, Math.cos(j * 2 + q * 4) * 3);
    root.add(puff);
  }
}

function buildChest3d(root: THREE.Group, ph: number, _w: number, h: number) {
  const by = -h * 0.5 + 3;
  const woodMat = palMat(PAL.wood, 2, 0.58);
  const goldMat = cachedStdMat("chestGold", {
    color: abgrToColor(PAL.gold[3], 1.1),
    emissive: abgrToColor(PAL.gold[2]),
    emissiveIntensity: 0.22,
    roughness: 0.14,
    metalness: 0.82,
  });
  const pearlMat = cachedStdMat("chestPearl", {
    color: 0xffffff,
    emissive: 0x99ecff,
    emissiveIntensity: 0.35,
    roughness: 0.08,
  });

  const box = new THREE.Mesh(new THREE.BoxGeometry(22, 11, 14), woodMat);
  box.position.set(0, by + 5.5, 0);
  box.rotation.y = 0.28;
  root.add(box);

  for (const sx of [-7, 7]) {
    const strap = new THREE.Mesh(new THREE.BoxGeometry(2.2, 11.4, 14.5), goldMat);
    strap.position.set(sx * Math.cos(0.28), by + 5.5, -sx * Math.sin(0.28));
    strap.rotation.y = 0.28;
    root.add(strap);
  }

  const lid = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 22, 12, 1, false, 0, Math.PI), woodMat);
  lid.rotation.z = Math.PI * 0.5;
  lid.rotation.y = 0.28;
  lid.rotation.x = -0.75;
  lid.position.set(-2, by + 13.5, -5);
  root.add(lid);

  const pile = new THREE.Mesh(new THREE.SphereGeometry(8.5, 12, 8), goldMat);
  pile.scale.set(1.15, 0.45, 0.72);
  pile.position.set(0, by + 11.2, 0);
  pile.rotation.y = 0.28;
  root.add(pile);

  const pearl = new THREE.Mesh(new THREE.SphereGeometry(2.4, 12, 10), pearlMat);
  pearl.position.set(3 + Math.sin(ph * TAU) * 0.4, by + 13.8, 2);
  root.add(pearl);
}

function buildJelly3d(root: THREE.Group, seed: number, pal: Pal, ph: number, tentCount: number, w: number, h: number) {
  const pulse = Math.sin(ph * TAU);
  const bellR = w * (0.34 - pulse * 0.045);
  const bellH = bellR * (0.72 + pulse * 0.14);
  const bellY = h * 0.22 + pulse * 2.2;
  const bellCol = abgrToColor(pal[3], 1.1);
  const bellEm = abgrToColor(pal[4]);
  const bellMat = cachedStdMat(`jellyBell|${bellCol.getHexString()}|${bellEm.getHexString()}`, {
    color: bellCol,
    emissive: bellEm,
    emissiveIntensity: 0.42,
    roughness: 0.1,
    transparent: true,
    opacity: 0.86,
  });
  const bell = new THREE.Mesh(new THREE.SphereGeometry(bellR, 16, 10, 0, TAU, 0, Math.PI * 0.56), bellMat);
  bell.scale.set(1, bellH / bellR, 1);
  bell.position.set(0, bellY, 0);
  root.add(bell);

  const core = new THREE.Mesh(new THREE.SphereGeometry(bellR * 0.48, 10, 8), palMat(pal, 4, 0.2, true));
  core.position.set(0, bellY + bellH * 0.25, 0);
  root.add(core);

  const tentMat = palMat(pal, 3, 0.3, true);
  for (let i = 0; i < tentCount; i++) {
    const f = i / Math.max(1, tentCount - 1) - 0.5;
    const ox = f * bellR * 1.45;
    const oz = Math.sin(i * 2.1 + seed) * bellR * 0.45;
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 5; k++) {
      const kf = k / 5;
      pts.push(new THREE.Vector3(ox + Math.sin(ph * TAU + kf * 3.5 + i) * 2.2, bellY - kf * (h * 0.58), oz));
    }
    root.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 8, 0.55, 5, false), tentMat));
  }
}

function buildCrab3d(root: THREE.Group, pal: Pal, ph: number, _w: number, h: number) {
  const by = -h * 0.5 + 3;
  const shellMat = palMat(pal, 3, 0.32, false, 0.35);
  const legMat = palMat(pal, 2, 0.45);
  const eyeWhite = cachedStdMat("crabEyeW", { color: 0xffffff, roughness: 0.2 });
  const pupil = cachedStdMat("crabPupil", { color: 0x0b1020, roughness: 0.1 });

  const body = new THREE.Mesh(new THREE.SphereGeometry(4.2, 14, 10), shellMat);
  body.scale.set(1.25, 0.65, 0.95);
  body.position.set(0, by + 2.6, 0);
  root.add(body);

  for (const s of [-1, 1]) {
    for (let l = 0; l < 3; l++) {
      const ang = (l - 1) * 0.35;
      const wag = Math.sin(ph * TAU + l * 1.5 + (s > 0 ? 0 : Math.PI)) * 0.7;
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.3, 4.2, 6), legMat);
      leg.position.set(s * (4.4 + l * 0.6), by + 1.4 + wag * 0.4, ang * 3);
      leg.rotation.z = s * 0.95;
      root.add(leg);
    }
    const claw = new THREE.Mesh(new THREE.SphereGeometry(1.65, 10, 8), shellMat);
    claw.scale.set(1.3, 0.85, 0.85);
    claw.position.set(s * 5.2, by + 4.4 + Math.sin(ph * TAU) * 0.5, 2.5);
    root.add(claw);

    const ey = new THREE.Mesh(new THREE.SphereGeometry(0.95, 8, 8), eyeWhite);
    ey.position.set(s * 1.7, by + 5.6, 2.2);
    root.add(ey);
    const ep = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), pupil);
    ep.position.set(s * 1.75, by + 5.65, 3.0);
    root.add(ep);
  }
}

export function* attach3dBiotaGen(out: BioSet, tint?: [number, number]): Generator<void, void, void> {
  if (!getPool()) return; // fallback cleanly to 2D if WebGL unavailable
  const L = PAL;
  const bioScale = isSoftwareWebGL() ? 1.5 : 2.0;
  const make = (w: number, h: number, tilt: number, fn: (root: THREE.Group) => void): HTMLCanvasElement => {
    const cv = renderBioGroup(w, h, fn, tilt, bioScale);
    return tint ? tintCv(cv, tint[0], tint[1]) : cv;
  };
  const set1 = (list: Bio[] | undefined, anim: Bio["anim"], tilt: number, fn: (root: THREE.Group, b: Bio, idx: number) => void): boolean => {
    if (!list) return false;
    list.forEach((b, i) => {
      b.f3d = [make(b.w, b.h, tilt, (root) => fn(root, b, i))];
      b.anim = anim;
    });
    return true;
  };
  function* setFrames(
    list: Bio[] | undefined,
    nFrames: number,
    tilt: number,
    fn: (root: THREE.Group, b: Bio, idx: number, ph: number) => void,
    shyFn?: (root: THREE.Group, b: Bio, idx: number, hide: number) => void
  ): Generator<void, void, void> {
    if (!list) return;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      const frames: HTMLCanvasElement[] = [];
      for (let f = 0; f < nFrames; f++) {
        frames.push(make(b.w, b.h, tilt, (root) => fn(root, b, i, f / nFrames)));
        if ((f & 3) === 3 && f + 1 < nFrames) yield;
      }
      b.f3d = frames;
      if (shyFn) {
        b.shy3d = [
          make(b.w, b.h, tilt, (root) => shyFn(root, b, i, 0.58)),
          make(b.w, b.h, tilt, (root) => shyFn(root, b, i, 1)),
        ];
      }
      b.anim = "frames";
      yield;
    }
  }

  if (set1(out.staghorn, "shimmer", 0.14, (r, b, i) => buildBranch3d(r, 11 + i * 7, [L.coral, L.orange, L.blue, L.yellow, L.pink][i], b.w, b.h, 14 + (i % 3), 3.6, 3))) yield;
  if (set1(out.table, "pulse", 0.24, (r, b, i) => buildTable3d(r, 31 + i * 5, [L.teal, L.purple, L.yellow, L.pink][i], b.w, b.h))) yield;
  if (set1(out.brain, "shimmer", 0.22, (r, b, i) => buildBrain3d(r, 51 + i * 3, [L.yellow, L.green, L.orange][i], b.w, b.h))) yield;
  if (set1(out.pillar, "shimmer", 0.14, (r, b, i) => buildPillar3d(r, 61 + i * 9, [L.yellow, L.lime, L.pink][i], b.w, b.h))) yield;
  if (set1(out.lettuce, "shimmer", 0.22, (r, b, i) => buildLettuce3d(r, 71 + i * 3, [L.green, L.purple, L.orange][i], b.w, b.h))) yield;
  if (set1(out.fan, "sway", 0.12, (r, b, i) => buildFan3d(r, 81 + i * 11, [L.purple, L.pink, L.red, L.orange][i], b.w, b.h))) yield;
  if (set1(out.whip, "sway", 0.12, (r, b, i) => buildWhip3d(r, 91 + i * 5, [L.orange, L.red, L.yellow][i], b.w, b.h))) yield;
  if (set1(out.tubes, "pulse", 0.24, (r, b, i) => buildTubes3d(r, 101 + i * 7, [L.yellow, L.purple, L.orange, L.blue][i], b.w, b.h))) yield;
  if (set1(out.barrel, "pulse", 0.26, (r, b, i) => buildTubes3d(r, 111 + i, [L.red, L.pink][i], b.w, b.h, true))) yield;
  if (
    set1(out.anemone, "pulse", 0.18, (r, b, i) => {
      const pairs: [Pal, number][] = [[L.pink, L.bone[4]], [L.green, L.pink[3]], [L.orange, L.bone[4]], [L.purple, L.yellow[3]]];
      const [pl, tp] = pairs[i];
      buildAnemone3d(r, 121 + i * 3, pl, tp, b.w, b.h, 15);
    })
  )
    yield;
  yield* setFrames(
    out.clam,
    8,
    0.24,
    (r, b, i, ph) => buildClam3d(r, L.bone, [L.blue, L.purple, L.teal, L.green][i], ph, 0, b.w, b.h),
    (r, b, i, hide) => buildClam3d(r, L.bone, [L.blue, L.purple, L.teal, L.green][i], 0, hide, b.w, b.h)
  );
  yield* setFrames(
    out.worm,
    4,
    0.18,
    (r, b, i, ph) => buildWorm3d(r, 131 + i * 7, [L.red, L.yellow, L.blue, L.pink, L.orange][i], L.bone, ph, 0, b.w, b.h),
    (r, b, i, hide) => buildWorm3d(r, 131 + i * 7, [L.red, L.yellow, L.blue, L.pink, L.orange][i], L.bone, 0, hide, b.w, b.h)
  );
  if (set1(out.grass, "sway", 0.12, (r, b, i) => buildWhip3d(r, 141 + i, [L.green, L.kelp, L.lime][i], b.w, b.h))) yield;
  if (set1(out.kelp, "sway", 0.1, (r, b, i) => buildKelp3d(r, 151 + i * 3, [L.kelp, L.olive, L.kelp][i], b.w, b.h, 3))) yield;
  if (set1(out.kelpBig, "sway", 0.08, (r, b, i) => buildKelp3d(r, 191 + i * 3, [L.kelp, L.olive][i], b.w, b.h, 4))) yield;
  if (set1(out.urchin, "pulse", 0.18, (r, b, i) => buildUrchin3d(r, 161 + i, [L.dark, L.red, L.purple][i], b.w, b.h))) yield;
  if (set1(out.star, "shimmer", 0.1, (r, b, i) => buildStar3d(r, [L.orange, L.red, L.blue][i], b.w, b.h))) yield;
  if (set1(out.shelf, "shimmer", 0.18, (r, b, i) => buildShelf3d(r, 171 + i * 3, [L.pink, L.teal, L.orange][i], b.w, b.h))) yield;
  if (set1(out.vine, "sway", -0.1, (r, b, i) => buildVine3d(r, 181 + i * 3, [L.kelp, L.green][i], b.w, b.h, false))) yield;

  if (set1(out.staghorn2, "shimmer", 0.14, (r, b, i) => buildBranch3d(r, 211 + i * 7, [L.purple, L.indigo, L.teal][i], b.w, b.h, 15, 3.6, 3))) yield;
  if (set1(out.brain2, "shimmer", 0.22, (r, b, i) => buildBrain3d(r, 221 + i * 3, [L.purple, L.indigo][i], b.w, b.h))) yield;
  if (set1(out.lettuce2, "shimmer", 0.22, (r, b, i) => buildLettuce3d(r, 231 + i * 3, [L.indigo, L.teal][i], b.w, b.h))) yield;
  if (set1(out.fan2, "sway", 0.12, (r, b, i) => buildFan3d(r, 241 + i * 11, [L.indigo, L.magenta, L.blue][i], b.w, b.h))) yield;
  if (set1(out.whip2, "sway", 0.12, (r, b, i) => buildWhip3d(r, 251 + i * 5, [L.purple, L.teal][i], b.w, b.h))) yield;
  if (set1(out.barrel2, "pulse", 0.26, (r, b, i) => buildTubes3d(r, 261 + i, [L.indigo, L.purple][i], b.w, b.h, true))) yield;
  if (
    set1(out.anemone2, "pulse", 0.18, (r, b, i) => {
      const pairs: [Pal, number][] = [[L.magenta, L.cyan[3]], [L.cyan, L.bone[4]]];
      const [pl, tp] = pairs[i];
      buildAnemone3d(r, 271 + i * 3, pl, tp, b.w, b.h, 15);
    })
  )
    yield;
  if (
    set1(out.crinoid, "pulse", 0.18, (r, b, i) => {
      const pairs: [Pal, number][] = [[L.yellow, L.orange[4]], [L.red, L.yellow[3]], [L.orange, L.bone[4]]];
      const [pl, tp] = pairs[i];
      buildAnemone3d(r, 281 + i * 3, pl, tp, b.w, b.h, 18, true);
    })
  )
    yield;
  if (set1(out.tunicate, "pulse", 0.18, (r, b, i) => buildTunicate3d(r, 291 + i * 3, [L.blue, L.cyan, L.purple][i], b.w, b.h))) yield;
  if (set1(out.shelf2, "shimmer", 0.18, (r, b, i) => buildShelf3d(r, 301 + i * 3, [L.purple, L.indigo, L.cyan][i], b.w, b.h))) yield;
  if (set1(out.vine2, "sway", -0.1, (r, b, i) => buildVine3d(r, 311 + i * 3, [L.cyan, L.magenta][i], b.w, b.h, true))) yield;
  if (
    set1(out.crinoid2, "pulse", 0.18, (r, b, i) => {
      const pairs: [Pal, number][] = [[L.bone, L.cyan[3]], [L.magenta, L.bone[4]]];
      const [pl, tp] = pairs[i];
      buildAnemone3d(r, 321 + i * 3, pl, tp, b.w, b.h, 18, true);
    })
  )
    yield;
  if (set1(out.pen, "sway", 0.14, (r, b, i) => buildPen3d(r, 331 + i * 3, [L.magenta, L.cyan, L.ember][i], b.w, b.h))) yield;
  if (set1(out.bamboo, "sway", 0.12, (r, b, i) => buildWhip3d(r, 341 + i * 5, [L.cyan, L.bone][i], b.w, b.h, true))) yield;
  if (set1(out.crystal, "shimmer", 0.16, (r, b, i) => buildCrystal3d(r, 351 + i * 3, [L.cyan, L.magenta, L.indigo][i], b.w, b.h))) yield;
  if (set1(out.bubblegum, "shimmer", 0.14, (r, b, i) => buildBranch3d(r, 361 + i * 7, [L.pink, L.red, L.magenta][i], b.w, b.h, 14, 3.6, 3, true))) yield;
  yield* setFrames(
    out.riftia,
    4,
    0.16,
    (r, b, i, ph) => buildWorm3d(r, 371 + i * 3, L.red, L.bone, ph, 0, b.w, b.h, true),
    (r, b, i, hide) => buildWorm3d(r, 371 + i * 3, L.red, L.bone, 0, hide, b.w, b.h, true)
  );
  if (set1(out.urchin2, "pulse", 0.18, (r, b, i) => buildUrchin3d(r, 381 + i, [L.dark, L.indigo][i], b.w, b.h))) yield;
  if (set1(out.star2, "shimmer", 0.1, (r, b, i) => buildStar3d(r, [L.bone, L.pink][i], b.w, b.h))) yield;

  yield* setFrames(out.jelly, NF, 0.12, (r, b, i, ph) => buildJelly3d(r, 401 + i, [L.blue, L.indigo, L.pink][i], ph, 6 + (i % 2) * 3, b.w, b.h));
  yield* setFrames(out.jelly2, NF, 0.12, (r, b, i, ph) => buildJelly3d(r, 411 + i, [L.magenta, L.cyan, L.purple][i], ph, 7 + (i % 2) * 3, b.w, b.h));
  yield* setFrames(out.crab, 4, 0.18, (r, b, i, ph) => buildCrab3d(r, [L.red, L.orange][i], ph, b.w, b.h));
  yield* setFrames(out.vent, 8, 0.16, (r, b, i, ph) => buildVent3d(r, 421 + i * 5, ph, b.w, b.h));
  yield* setFrames(out.chest, 4, 0.24, (r, b, _i, ph) => buildChest3d(r, ph, b.w, b.h));
}

export function copy3dBiotaTint(target: BioSet, src: BioSet, tint: [number, number]) {
  for (const key of Object.keys(target)) {
    const list = target[key];
    const srcList = src[key];
    if (!list || !srcList) continue;
    for (let i = 0; i < list.length && i < srcList.length; i++) {
      const b = list[i];
      const sb = srcList[i];
      if (sb.f3d?.length) b.f3d = sb.f3d.map((cv) => tintCv(cv, tint[0], tint[1]));
      if (sb.shy3d?.length) b.shy3d = sb.shy3d.map((cv) => tintCv(cv, tint[0], tint[1]));
      if (sb.anim) b.anim = sb.anim;
    }
  }
}

// ============================================================================
// 3D LARGE ROCK FORMATIONS, CAVE ARCHES, COLUMNS, SEAFLOOR & FOREGROUND
// ============================================================================

/** Smooth rock surface noise for chiseled 3D crags & geological strata */
function rockNoise(x: number, y: number, seed: number): number {
  const n1 = Math.sin(x * 0.045 + seed * 0.13) * Math.cos(y * 0.068 - seed * 0.21);
  const n2 = Math.sin(x * 0.11 - y * 0.09 + seed * 0.37) * 0.52;
  const n3 = Math.cos(x * 0.21 + y * 0.19 + seed * 0.71) * 0.26;
  return n1 + n2 + n3;
}

/**
 * Renders a massive sculpted 3D coral-reef rock island (`cv3d`) whose silhouette
 * matches `top[x]` / `bot[x]` and `caveBounds` 1:1 with the SDF physics colliders.
 */
export function paintPinnacle3d(
  top: Int16Array,
  bot: Int16Array,
  W: number,
  H: number,
  st: RockPal2d,
  seed: number,
  _rx: number,
  _ry: number,
  _cxl: number,
  _cyl: number,
  zone = 0,
  cave?: CaveSpec2d
): HTMLCanvasElement | undefined {
  if (!getPool()) return undefined;
  let first = -1;
  let last = -1;
  for (let x = 0; x < W; x++) {
    if (top[x] >= 0) {
      if (first < 0) first = x;
      last = x;
    }
  }
  if (first < 0) return undefined;

  const scene = createUnderwaterScene(0.95, 2.05, 1.05);
  const root = new THREE.Group();
  scene.add(root);

  const caveBounds = cave ? sampleCaveBounds(cave, seed, W) : null;
  const stepX = 3;
  const cols = Math.floor((last - first) / stepX) + 1;
  const rows = 34;
  const smooth01 = (t: number) => {
    const c = clamp01(t);
    return c * c * (3 - 2 * c);
  };

  // Palette colors in Three.js space
  const cDeep = abgrToColor(st.ramp[0], 0.85);
  const cShadow = abgrToColor(st.ramp[1]);
  const cMid = abgrToColor(st.ramp[2]);
  const cLit = abgrToColor(st.ramp[3], 1.06);
  const cHi = abgrToColor(st.ramp[4], 1.12);
  const cCrust0 = abgrToColor(st.crust[0]);
  const cCrust1 = abgrToColor(st.crust[1], 1.06);
  const cSandHi = hexToColor("#fff4ce");
  const cSandMid = hexToColor("#e7c372");
  const cSandDark = hexToColor("#9f7b3a");

  // 1. Main Sculpted 3D Reef Island Relief Mesh (exact silhouette top[x]..bot[x])
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  const tmpCol = new THREE.Color();
  for (let ix = 0; ix < cols; ix++) {
    const x = ix === cols - 1 ? last : Math.min(last, first + ix * stepX);
    const ty = top[x];
    const by = bot[x];
    const span = Math.max(4, by - ty);
    const edgeX = Math.min(x - first, last - x);
    const edgeFactorX = smooth01(edgeX / 34);

    for (let iy = 0; iy < rows; iy++) {
      const v = iy / (rows - 1);
      const y = ty + v * span;
      const dTop = y - ty;
      const dBot = by - y;
      const edgeY = Math.min(dTop * 1.15, dBot * 0.9);
      const dEdge = Math.min(edgeX, edgeY);

      // 3D depth relief Z: smoothly zero at edges, sculpted rocky strata + crag volume inside
      const swell = Math.pow(clamp01(dEdge / 26), 0.62) * edgeFactorX;
      const strata = Math.sin(y * 0.11 + Math.sin(x * 0.028 + seed) * 1.8) * 3.2;
      const crag = rockNoise(x, y, seed) * 4.8;
      let z = swell * (34 + strata + crag);

      // Check cave carve-out: smoothly depress Z backward into a shadowed 3D stone grotto!
      let caveDepth = 0;
      if (cave && caveBounds && x >= caveBounds.xMin && x <= caveBounds.xMax) {
        const cy0 = caveBounds.ceil[x];
        const cy1 = caveBounds.floor[x];
        if (cy0 >= 0 && y >= cy0 - 5 && y <= cy1 + 5) {
          const innerY = Math.min(y - (cy0 - 5), cy1 + 5 - y) / Math.max(4, (cy1 - cy0) * 0.45);
          const archK = smooth01(innerY * 1.35);
          let mouthFade = 1;
          if (cave.kind === "alcove") {
            const bx = cave.gx - cave.dir * cave.grx * 0.86;
            const mx = cave.gx + cave.dir * cave.grx * 1.24;
            const f = clamp01((x - bx) / (mx - bx));
            mouthFade = 1 - Math.pow(f, 2.2) * 0.88;
          } else {
            const f = clamp01((x - (cave.gx - cave.grx * 1.12)) / Math.max(1, cave.grx * 2.24));
            mouthFade = Math.sin(f * Math.PI);
          }
          caveDepth = archK * (0.45 + 0.55 * mouthFade);
          z = z * (1 - caveDepth) - caveDepth * 38 + rockNoise(x * 1.3, y * 1.3, seed + 9) * 2.2 * caveDepth;
        }
      }

      positions.push(x - W * 0.5, H * 0.5 - y, z);

      // Compute geological vertex coloring (top sand/crust -> rock strata -> cave shadow)
      if (caveDepth > 0.25) {
        tmpCol.copy(cShadow).lerp(cDeep, smooth01((caveDepth - 0.25) / 0.65));
      } else if (zone === 0 && dTop < 17) {
        const sf = clamp01(dTop / 17);
        tmpCol.copy(cSandHi).lerp(cSandMid, sf * 0.7).lerp(cSandDark, Math.max(0, sf - 0.6) * 1.8);
      } else if (zone > 0 && dTop < 10) {
        tmpCol.copy(cCrust1).lerp(cCrust0, clamp01(dTop / 10));
      } else {
        const band = 0.5 + 0.5 * Math.sin(y * 0.08 + rockNoise(x, y, seed + 4) * 1.2);
        const shade = clamp01(1 - v * 0.65 + (z / 44) * 0.28);
        tmpCol.copy(cShadow).lerp(cMid, shade * 0.7).lerp(cLit, band * shade * 0.82);
        if (shade > 0.72 && band > 0.6) tmpCol.lerp(cHi, (shade - 0.72) * 1.4);
      }
      colors.push(tmpCol.r, tmpCol.g, tmpCol.b);
    }
  }

  for (let ix = 0; ix < cols - 1; ix++) {
    for (let iy = 0; iy < rows - 1; iy++) {
      const a = ix * rows + iy;
      const b = (ix + 1) * rows + iy;
      const c = ix * rows + (iy + 1);
      const d = (ix + 1) * rows + (iy + 1);
      indices.push(a, c, b);
      indices.push(b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  const rockMat = cachedStdMat("pinnacleVtxRockSmooth", {
    vertexColors: true,
    roughness: 0.82,
    metalness: 0.04,
    flatShading: false,
    side: THREE.DoubleSide,
  });
  root.add(new THREE.Mesh(geo, rockMat));

  // 2. Sculpted 3D Protruding Rock Buttresses & Faceted Boulders (strictly outside cave openings!)
  const r = rng(seed + 19);
  for (let i = 0; i < 6; i++) {
    const bx = first + 28 + (i / 5) * (last - first - 56) + (r() - 0.5) * 18;
    const xi = Math.max(first, Math.min(last, Math.round(bx)));
    const ty = top[xi];
    const by = bot[xi];
    if (ty < 0 || by - ty < 26) continue;
    const yy = ty + (by - ty) * (0.35 + r() * 0.35);
    // Avoid blocking cave cavity
    if (cave && caveBounds && xi >= caveBounds.xMin - 8 && xi <= caveBounds.xMax + 8) {
      const cy0 = caveBounds.ceil[Math.min(W - 1, Math.max(0, xi))];
      const cy1 = caveBounds.floor[Math.min(W - 1, Math.max(0, xi))];
      if (cy0 >= 0 && yy > cy0 - 14 && yy < cy1 + 14) continue;
    }
    const rad = Math.min(18, (by - ty) * 0.22) * (0.8 + r() * 0.35);
    const bGeo = new THREE.DodecahedronGeometry(rad, 1);
    const bPos = bGeo.attributes.position;
    for (let k = 0; k < bPos.count; k++) {
      const vx = bPos.getX(k);
      const vy = bPos.getY(k);
      const vz = bPos.getZ(k);
      const n = 1 + rockNoise(vx + i * 17, vy + i * 31, seed) * 0.22;
      bPos.setXYZ(k, vx * 1.3 * n, vy * 0.72 * n, vz * 0.9 * n);
    }
    bGeo.computeVertexNormals();
    const bCol = i % 2 === 0 ? cMid : cLit;
    const boulder = new THREE.Mesh(
      bGeo,
      cachedStdMat(`boulder|${bCol.getHexString()}`, {
        color: bCol,
        roughness: 0.78,
        metalness: 0.05,
        flatShading: true,
      })
    );
    boulder.position.set(xi - W * 0.5, H * 0.5 - yy, 14 + r() * 12);
    root.add(boulder);
  }

  // 3. Zone-2/3 Luminous Mineral Crystal Accents tucked in deep cave alcoves
  if (cave && zone >= 2) {
    const crysMat = cachedStdMat("caveCrystal", {
      color: 0xc4b5fd,
      emissive: 0x8b5cf6,
      emissiveIntensity: 0.65,
      roughness: 0.08,
      flatShading: true,
    });
    const cx = cave.gx - W * 0.5;
    const cy = H * 0.5 - (cave.gy + cave.gry * 0.78);
    for (const dx of [-18, 0, 22]) {
      const sp = new THREE.Mesh(new THREE.ConeGeometry(3.2, 11, 5), crysMat);
      sp.position.set(cx + dx, cy + 4, -8);
      sp.rotation.z = dx * 0.015;
      root.add(sp);
    }
  }

  // Render at crisp HiDPI (1.5x on software WebGL, 2x on hardware GPU)
  const cv = renderSceneOrtho(scene, W, H, isSoftwareWebGL() ? 1.5 : 2, 0);
  disposeGroup(root);
  return cv;
}

/**
 * 3D Foreground Overhanging Cave Arch Brow & Stalactites (`caveRim3d`) rendered in front of hiding fish.
 */
export function paintCaveRim3d(
  top: Int16Array,
  bot: Int16Array,
  W: number,
  H: number,
  st: RockPal2d,
  seed: number,
  cave: CaveSpec2d
): HTMLCanvasElement | undefined {
  if (!getPool()) return undefined;
  const caveBounds = sampleCaveBounds(cave, seed, W);
  if (caveBounds.xMax < caveBounds.xMin) return undefined;

  const scene = createUnderwaterScene(0.95, 1.85, 0.9);
  const root = new THREE.Group();
  scene.add(root);

  const cDeep = abgrToColor(st.ramp[0], 0.9);
  const cShadow = abgrToColor(st.ramp[1]);
  const cMid = abgrToColor(st.ramp[2]);
  const cLit = abgrToColor(st.ramp[3], 1.02);

  // Build sculpted, tapered rocky brow ridge strictly inside rock silhouette (never a floating straight tube!)
  const spanW = caveBounds.xMax - caveBounds.xMin;
  const xStart = cave.kind === "alcove"
    ? Math.round(caveBounds.xMin + spanW * (cave.dir >= 0 ? 0.28 : 0.1))
    : Math.round(caveBounds.xMin + spanW * 0.1);
  const xEnd = cave.kind === "alcove"
    ? Math.round(caveBounds.xMin + spanW * (cave.dir >= 0 ? 0.9 : 0.72))
    : Math.round(caveBounds.xMax - spanW * 0.1);

  const browSamples: { x: number; cy: number }[] = [];
  for (let x = xStart; x <= xEnd; x += 6) {
    const cy = caveBounds.ceil[x];
    if (cy < 0 || top[x] < 0 || bot[x] < 0) continue;
    if (cy < top[x] + 7 || cy > bot[x] - 8) continue;
    browSamples.push({ x, cy });
  }

  if (browSamples.length >= 4) {
    const positions: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];
    const tmp = new THREE.Color();
    const nCols = browSamples.length;
    const nRows = 4;

    for (let i = 0; i < nCols; i++) {
      const t = i / (nCols - 1);
      const taper = Math.sin(t * Math.PI);
      const crag = Math.sin(t * 17 + seed) * 1.1;
      const thick = (1.6 + taper * 5.2 + crag * taper) * taper;
      const { x, cy } = browSamples[i];
      const yTop = cy - 2.2 - thick;
      const yBot = cy + 0.6 + taper * 1.4;
      const zPeak = (10 + crag * 1.5) * taper;

      for (let r = 0; r < nRows; r++) {
        const v = r / (nRows - 1);
        const y = yTop + (yBot - yTop) * v;
        const z = Math.sin(v * Math.PI) * zPeak;
        positions.push(x - W * 0.5, H * 0.5 - y, z);

        if (v < 0.35) tmp.copy(cMid).lerp(cLit, taper * 0.55);
        else if (v < 0.75) tmp.copy(cShadow).lerp(cMid, taper * 0.65);
        else tmp.copy(cDeep).lerp(cShadow, 0.5);
        colors.push(tmp.r, tmp.g, tmp.b);
      }
    }

    for (let i = 0; i < nCols - 1; i++) {
      for (let r = 0; r < nRows - 1; r++) {
        const a = i * nRows + r;
        const b = (i + 1) * nRows + r;
        const c = i * nRows + (r + 1);
        const d = (i + 1) * nRows + (r + 1);
        indices.push(a, c, b);
        indices.push(b, c, d);
      }
    }

    const browGeo = new THREE.BufferGeometry();
    browGeo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    browGeo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    browGeo.setIndex(indices);
    browGeo.computeVertexNormals();
    root.add(
      new THREE.Mesh(
        browGeo,
        cachedStdMat("caveBrowVtx", {
          vertexColors: true,
          roughness: 0.85,
          flatShading: false,
          side: THREE.DoubleSide,
        })
      )
    );

    // Subtle, rounded organic limestone stalactite nubs tucked gently under the brow
    const stalMat = cachedStdMat(`caveStal|${cShadow.getHexString()}`, {
      color: cShadow,
      roughness: 0.84,
      flatShading: false,
    });
    const nStal = cave.kind === "tunnel" ? 4 : 3;
    for (let i = 0; i < nStal; i++) {
      const f = 0.24 + (i / Math.max(1, nStal - 1)) * 0.52;
      const idx = Math.min(nCols - 2, Math.max(1, Math.round(f * (nCols - 1))));
      const { x, cy } = browSamples[idx];
      const sh = 4.2 + hash2(i, seed, 41) * 4.5;
      const sr = 2.2 + hash2(i, seed, 53) * 1.4;
      const stal = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), stalMat);
      stal.scale.set(sr, sh * 0.68, sr * 0.8);
      stal.position.set(x - W * 0.5, H * 0.5 - (cy + sh * 0.28), 6);
      stal.rotation.z = (hash2(i, seed, 59) - 0.5) * 0.16;
      root.add(stal);
    }
  }

  const cv = renderSceneOrtho(scene, W, H, isSoftwareWebGL() ? 1.5 : 2, 0);
  disposeGroup(root);
  return cv;
}

/**
 * 3D Rooted Pinnacle Support Column (`col3d`) with sculpted vertical rock ribs and depth haze.
 */
export function paintColumn3d(
  W: number,
  H: number,
  yTop: number,
  hw0: number,
  rooted: boolean,
  st: RockPal2d,
  seed: number,
  waterRgbFn: (y: number) => [number, number, number]
): HTMLCanvasElement | undefined {
  if (!getPool()) return undefined;
  const scene = createUnderwaterScene(0.92, 1.8, 0.9);
  const root = new THREE.Group();
  scene.add(root);

  const r = rng(seed);
  const s1 = r() * 9;
  const s2 = r() * 9;
  const s4 = r() * 9;
  const lean = (r() - 0.5) * 30;

  const segY = Math.max(12, Math.floor(H / 16));
  const segR = 14;
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  const cShadow = abgrToColor(st.ramp[1]);
  const cMid = abgrToColor(st.ramp[2]);
  const cLit = abgrToColor(st.ramp[3]);
  const tmpCol = new THREE.Color();

  for (let iy = 0; iy <= segY; iy++) {
    const t = iy / segY;
    const yy = t * H;
    let hw = hw0 * (0.92 + 0.5 * Math.pow(t, 1.4)) + Math.sin(yy * 0.043 + s1) * 5 + Math.sin(yy * 0.13 + s2) * 2.2;
    if (rooted) hw += Math.pow(Math.max(0, (t - 0.7) / 0.3), 2) * 38;
    const cx = Math.sin(yy * 0.017 + s4) * 7 + lean * t;
    const [wr, wg, wb] = waterRgbFn(yTop + yy);
    const waterC = new THREE.Color().setRGB(wr / 255, wg / 255, wb / 255, THREE.SRGBColorSpace);
    const hazeA = rooted ? 0.34 : Math.min(0.95, 0.32 + Math.pow(t, 0.75) * 0.65);

    for (let ir = 0; ir <= segR; ir++) {
      const ang = (ir / segR) * Math.PI; // front hemisphere (0..PI)
      const flute = 1 + Math.sin(ang * 5 + yy * 0.05 + seed) * 0.1;
      const px = cx + Math.cos(ang + Math.PI) * hw * flute;
      const pz = Math.sin(ang) * hw * 0.75 * flute;
      positions.push(px, H * 0.5 - yy, pz);

      const shade = 0.5 + 0.5 * Math.cos(ang + Math.PI * 0.75);
      tmpCol.copy(cShadow).lerp(cMid, shade).lerp(cLit, Math.max(0, shade - 0.45));
      tmpCol.lerp(waterC, hazeA);
      colors.push(tmpCol.r, tmpCol.g, tmpCol.b);
    }
  }

  for (let iy = 0; iy < segY; iy++) {
    for (let ir = 0; ir < segR; ir++) {
      const a = iy * (segR + 1) + ir;
      const b = a + 1;
      const c = a + (segR + 1);
      const d = c + 1;
      indices.push(a, c, b);
      indices.push(b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  root.add(
    new THREE.Mesh(
      geo,
      cachedStdMat("colVtxRock", {
        vertexColors: true,
        roughness: 0.8,
        flatShading: true,
        side: THREE.DoubleSide,
      })
    )
  );

  const cv = renderSceneOrtho(scene, W, H, 1, 0);
  disposeGroup(root);

  if (!rooted) {
    const ctx = cv.getContext("2d")!;
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

/**
 * 3D Abyssal Floor Terrain (`floor3d`): sculpted 3D boulders, rippled sand dunes, & mineral glints.
 * Rendered in two <=1800px WebGL chunks and stitched onto a full WORLD_W x H canvas for WebGL safety.
 */
export function paintFloor3d(top: Int16Array, W: number, H: number, st: RockPal2d): HTMLCanvasElement | undefined {
  if (!getPool()) return undefined;
  const out = document.createElement("canvas");
  out.width = W;
  out.height = H;
  const octx = out.getContext("2d")!;
  const chunkW = Math.ceil(W / 2);
  const pad = 40;

  const cDark = abgrToColor(st.ramp[0], 0.8);
  const cShadow = abgrToColor(st.ramp[1]);
  const cMid = abgrToColor(st.ramp[2]);
  const cSandTop = hexToColor("#ead7a6");
  const cSandMid = hexToColor("#a89468");

  for (let cIdx = 0; cIdx < 2; cIdx++) {
    const x0 = cIdx * chunkW;
    const x1 = Math.min(W, (cIdx + 1) * chunkW);
    const cw = x1 - x0;
    const rw = cw + pad * 2;
    const scene = createUnderwaterScene(0.95, 1.85, 0.9);
    const root = new THREE.Group();
    scene.add(root);

    const stepX = 8;
    const cols = Math.ceil(rw / stepX) + 1;
    const rows = 14;
    const positions: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];
    const tmp = new THREE.Color();

    for (let ix = 0; ix < cols; ix++) {
      const lx = Math.min(rw, ix * stepX);
      const gx = x0 - pad + lx;
      const cx = Math.max(0, Math.min(W - 1, Math.round(gx)));
      const ty = top[cx];
      const span = Math.max(8, H - ty);
      for (let iy = 0; iy < rows; iy++) {
        const v = iy / (rows - 1);
        const y = ty + v * span;
        const dune = Math.sin(gx * 0.025 + v * 2.5) * 6 + Math.cos(gx * 0.07 - y * 0.05) * 3;
        const z = (1 - Math.abs(v - 0.25)) * 28 + dune;
        positions.push(lx - rw * 0.5, H * 0.5 - y, z);

        if (v < 0.35) {
          tmp.copy(cSandTop).lerp(cSandMid, v / 0.35);
        } else {
          tmp.copy(cMid).lerp(cShadow, (v - 0.35) / 0.45).lerp(cDark, Math.max(0, v - 0.72) / 0.28);
        }
        colors.push(tmp.r, tmp.g, tmp.b);
      }
    }

    for (let ix = 0; ix < cols - 1; ix++) {
      for (let iy = 0; iy < rows - 1; iy++) {
        const a = ix * rows + iy;
        const b = (ix + 1) * rows + iy;
        const c = ix * rows + (iy + 1);
        const d = (ix + 1) * rows + (iy + 1);
        indices.push(a, c, b);
        indices.push(b, c, d);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    root.add(new THREE.Mesh(geo, cachedStdMat("floorVtxRockSmooth", { vertexColors: true, roughness: 0.84, flatShading: false })));

    // 3D scattered basalt boulders resting cleanly on the seabed crest (including overlap across chunk boundary)
    const r = rng(901);
    for (let b = 0; b < 28; b++) {
      const gx = 35 + (b / 27) * (W - 70) + (r() - 0.5) * 24;
      const rad = 8 + r() * 14;
      const rr = r();
      if (gx < x0 - pad - rad * 2 || gx > x1 + pad + rad * 2) continue;
      const ty = top[Math.max(0, Math.min(W - 1, Math.round(gx)))];
      const bGeo = new THREE.DodecahedronGeometry(rad, 1);
      const bCol = b % 2 ? cMid : cShadow;
      const bMesh = new THREE.Mesh(
        bGeo,
        cachedStdMat(`floorBoulder|${bCol.getHexString()}`, { color: bCol, roughness: 0.8, flatShading: true })
      );
      bMesh.scale.set(1.35, 0.55, 0.9);
      bMesh.position.set(gx - (x0 - pad) - rw * 0.5, H * 0.5 - (ty + 3), 24 + rr * 10);
      root.add(bMesh);
    }

    const chunkCv = renderSceneOrtho(scene, rw, H, 1, 0);
    disposeGroup(root);
    octx.drawImage(chunkCv, pad, 0, cw, H, x0, 0, cw, H);
  }
  return out;
}

/**
 * 3D Foreground Framing Boulders & Vibrant Orange/Gold/Violet Corals (`fgDioramas3d`).
 */
export function genForegroundOutcrops3d(): HTMLCanvasElement[] {
  if (!getPool()) return [];
  const list: HTMLCanvasElement[] = [];
  const W = 280;
  const H = 128;

  for (let v = 0; v < 4; v++) {
    const r = rng(5555 + v * 419);
    const cv = renderBioGroup(
      W,
      H,
      (root) => {
        const by = -H * 0.5 + 2;
        const rockMat = cachedStdMat("fgRock", {
          color: 0x18254a,
          roughness: 0.76,
          metalness: 0.08,
          flatShading: true,
        });
        // 3D sculpted basalt foreground boulder clusters
        for (let b = 0; b < 5; b++) {
          const bx = (b - 2) * 46 + (r() - 0.5) * 14;
          const rad = 26 + r() * 18 + (v === 0 && b < 2 ? 12 : v === 1 && b > 2 ? 12 : 0);
          const geo = new THREE.DodecahedronGeometry(rad, 1);
          const pos = geo.attributes.position;
          for (let k = 0; k < pos.count; k++) {
            const vx = pos.getX(k);
            const vy = pos.getY(k);
            const vz = pos.getZ(k);
            const n = 1 + rockNoise(vx + b * 29, vy, 5555 + v) * 0.2;
            pos.setXYZ(k, vx * 1.45 * n, vy * 0.68 * n, vz * 0.8 * n);
          }
          geo.computeVertexNormals();
          const mound = new THREE.Mesh(geo, rockMat);
          mound.position.set(bx, by + rad * 0.34, 8 - b * 2);
          root.add(mound);
        }

        // Crowning 3D vibrant orange/gold/violet corals rooted into the boulders
        const specs: { x: number; type: "branch" | "table" | "tubes" | "fan" | "anemone"; pal: Pal; s: number }[] =
          v % 2 === 0
            ? [
                { x: -82, type: "branch", pal: PAL.fireOrange, s: 1.0 },
                { x: -34, type: "table", pal: PAL.sunGold, s: 0.9 },
                { x: 14, type: "tubes", pal: PAL.fireOrange, s: 0.95 },
                { x: 64, type: "fan", pal: PAL.royalViolet, s: 0.95 },
              ]
            : [
                { x: -78, type: "fan", pal: PAL.royalViolet, s: 0.95 },
                { x: -24, type: "tubes", pal: PAL.sunGold, s: 0.95 },
                { x: 32, type: "branch", pal: PAL.fireOrange, s: 1.0 },
                { x: 82, type: "table", pal: PAL.fireOrange, s: 0.9 },
              ];
        for (const c of specs) {
          const cg = new THREE.Group();
          const sd = (r() * 999) | 0;
          if (c.type === "branch") buildBranch3d(cg, sd, c.pal, 54, 56, 15, 3.6, 3);
          else if (c.type === "table") buildTable3d(cg, sd, c.pal, 54, 34);
          else if (c.type === "tubes") buildTubes3d(cg, sd, c.pal, 38, 46);
          else if (c.type === "fan") buildFan3d(cg, sd, c.pal, 52, 50);
          cg.scale.setScalar(c.s);
          cg.position.set(c.x, by + 36, -6);
          root.add(cg);
        }
      },
      0.1,
      2.0
    );
    list.push(cv);
  }
  return list;
}

/**
 * 3D Midground Oceanic Ridge (`far3_3d`) and Deep Pinnacle Ridge (`deep2_3d`)
 */
export function makeFar3_3d(st: RockPal2d): HTMLCanvasElement | undefined {
  if (!getPool()) return undefined;
  const w = 2100;
  const h = 540;
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const octx = out.getContext("2d")!;
  const chunkW = 1050;
  const pad = 40;
  const ridge = (x: number) => {
    const t = (x / w) * TAU;
    return 256 - Math.sin(t * 3 + 0.4) * 58 - Math.cos(t * 6 + 2) * 30 + Math.sin(t * 23) * 6;
  };
  const cTop = abgrToColor(st.crust[1]);
  const cMid = abgrToColor(st.ramp[2]);
  const cBot = abgrToColor(st.ramp[1]);

  for (let cIdx = 0; cIdx < 2; cIdx++) {
    const x0 = cIdx * chunkW;
    const rw = chunkW + pad * 2;
    const scene = createUnderwaterScene(1.0, 1.7, 0.85);
    const root = new THREE.Group();
    scene.add(root);

    const stepX = 8;
    const cols = Math.ceil(rw / stepX) + 1;
    const rows = 14;
    const positions: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];
    const tmp = new THREE.Color();

    for (let ix = 0; ix < cols; ix++) {
      const lx = Math.min(rw, ix * stepX);
      const gx = x0 - pad + lx;
      const ry = ridge(gx);
      const span = Math.max(20, h - ry);
      for (let iy = 0; iy < rows; iy++) {
        const v = iy / (rows - 1);
        const y = ry + v * span;
        const z = Math.sin((gx / w) * TAU * 5 + v * 2) * 14 + (1 - v) * 22;
        positions.push(lx - rw * 0.5, h * 0.5 - y, z);
        if (v < 0.14) {
          tmp.copy(cTop).lerp(cMid, v / 0.14);
        } else {
          tmp.copy(cMid).lerp(cBot, (v - 0.14) / 0.86);
        }
        colors.push(tmp.r, tmp.g, tmp.b);
      }
    }
    for (let ix = 0; ix < cols - 1; ix++) {
      for (let iy = 0; iy < rows - 1; iy++) {
        const a = ix * rows + iy;
        const b = (ix + 1) * rows + iy;
        const c = ix * rows + (iy + 1);
        const d = (ix + 1) * rows + (iy + 1);
        indices.push(a, c, b);
        indices.push(b, c, d);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    root.add(new THREE.Mesh(geo, cachedStdMat("far3VtxRockSmooth", { vertexColors: true, roughness: 0.84, flatShading: false })));

    const chunkCv = renderSceneOrtho(scene, rw, h, 1, 0);
    disposeGroup(root);
    octx.drawImage(chunkCv, pad, 0, chunkW, h, x0, 0, chunkW, h);
  }

  // Soft water fade at bottom so ridge melts cleanly into abyssal depth
  octx.save();
  octx.globalCompositeOperation = "destination-out";
  const fg = octx.createLinearGradient(0, h - 160, 0, h);
  fg.addColorStop(0, "rgba(0,0,0,0)");
  fg.addColorStop(1, "rgba(0,0,0,1)");
  octx.fillStyle = fg;
  octx.fillRect(0, h - 160, w, 160);
  octx.restore();
  return out;
}

export function makeDeep2_3d(st: RockPal2d): HTMLCanvasElement | undefined {
  if (!getPool()) return undefined;
  const w = 2000;
  const h = 1420;
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const octx = out.getContext("2d")!;
  const chunkW = 1000;
  const pad = 40;
  const r = rng(1414);

  const caps: [number, number, number, number, number, number][] = [];
  for (let i = 0; i < 7; i++) {
    const cx = ((i + 0.3 + r() * 0.4) * w) / 7;
    const ty = 90 + r() * 680;
    const R = 46 + r() * 50;
    const ch = R * (0.3 + r() * 0.14);
    const neck = R * (0.3 + r() * 0.1);
    const lean = (r() - 0.5) * 40;
    caps.push([cx, ty, R, ch, neck, lean]);
  }

  const cCap = abgrToColor(st.ramp[3]);
  const cStem = abgrToColor(st.ramp[2]);
  const veins = [0x52e6ff, 0xf07af6, 0x9c8cff];

  for (let cIdx = 0; cIdx < 2; cIdx++) {
    const x0 = cIdx * chunkW;
    const rw = chunkW + pad * 2;
    const scene = createUnderwaterScene(0.85, 1.6, 0.9);
    const root = new THREE.Group();
    scene.add(root);

    const spireMat = cachedStdMat(`deepSpire|${cStem.getHexString()}`, { color: cStem, roughness: 0.76, flatShading: true });
    const capMat = cachedStdMat(`deepCap|${cCap.getHexString()}`, { color: cCap, roughness: 0.68, flatShading: true });

    for (let i = 0; i < caps.length; i++) {
      const [cx, ty, R, ch, neck, lean] = caps[i];
      for (const dx of [-w, 0, w]) {
        const lx = cx + dx - (x0 - pad) - rw * 0.5;
        if (lx < -rw * 0.8 || lx > rw * 0.8) continue;
        const stemH = h - ty;
        const cyl = new THREE.Mesh(new THREE.CylinderGeometry(neck, neck * 1.9, stemH, 10), spireMat);
        cyl.position.set(lx + lean * 0.5, h * 0.5 - (ty + stemH * 0.5), 0);
        cyl.rotation.z = Math.atan2(-lean, stemH);
        root.add(cyl);

        const cap = new THREE.Mesh(new THREE.DodecahedronGeometry(R, 1), capMat);
        cap.scale.set(1.1, ch / R, 0.85);
        cap.position.set(lx, h * 0.5 - ty, 6);
        root.add(cap);

        const veinCol = veins[i % veins.length];
        const vMat = cachedStdMat(`deepVein|${veinCol}`, { color: veinCol, emissive: veinCol, emissiveIntensity: 0.85, roughness: 0.3 });
        const vein = new THREE.Mesh(new THREE.BoxGeometry(2.5, 52, 6), vMat);
        vein.position.set(lx + (i % 2 ? 8 : -8), h * 0.5 - (ty + 42), neck * 0.8);
        vein.rotation.z = (i % 2 ? -1 : 1) * 0.14;
        root.add(vein);
      }
    }

    // Natural 3D arch bridges wrapped seamlessly across chunk boundaries
    for (const i of [1, 4]) {
      const a = caps[i];
      const b = caps[i + 1];
      for (const dx of [-w, 0, w]) {
        const ax = a[0] + a[2] * 0.4 + dx - (x0 - pad) - rw * 0.5;
        const bx = b[0] - b[2] * 0.4 + dx - (x0 - pad) - rw * 0.5;
        if (bx < -rw * 0.6 || ax > rw * 0.6) continue;
        const curve = new THREE.QuadraticBezierCurve3(
          new THREE.Vector3(ax, h * 0.5 - (a[1] + 8), 0),
          new THREE.Vector3((ax + bx) * 0.5, h * 0.5 - (Math.min(a[1], b[1]) - 42), 0),
          new THREE.Vector3(bx, h * 0.5 - (b[1] + 8), 0)
        );
        root.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 14, 11, 8, false), spireMat));
      }
    }

    const chunkCv = renderSceneOrtho(scene, rw, h, 1, 0);
    disposeGroup(root);
    octx.drawImage(chunkCv, pad, 0, chunkW, h, x0, 0, chunkW, h);
  }

  // Atmospheric deep water tint strictly inside silhouette
  octx.save();
  octx.globalCompositeOperation = "source-atop";
  octx.fillStyle = "rgba(23, 27, 92, 0.36)";
  octx.fillRect(0, 0, w, h);
  octx.restore();
  return out;
}

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { Species } from "../game/species";
import { applyFish3DPose, createFish3DRig, fish3DRigKey, isSoftwareWebGL } from "../game/fish3d";
import type { Fish3DRig } from "../game/fish3d";

interface Props {
  species: Species;
  onBiteCount?: number;
  paused?: boolean;
  interactive?: boolean;
}

function heroCameraZ(sp: Species): number {
  if (sp.style === "orca") return 1.46;
  if (sp.style === "eddy") return 1.38;
  if (sp.style === "layla") return 1.36;
  if (sp.style === "snapturtle") return 1.35;
  if (sp.style === "andy") return 1.3;
  return 1.24;
}

export default function Fish3DViewport({ species, onBiteCount = 0, paused = false, interactive = true }: Props) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const manualChompRef = useRef(0);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const maxAnisoRef = useRef(1);
  const rigRef = useRef<Fish3DRig | null>(null);
  const rigKeyRef = useRef<string>("");
  const speciesRef = useRef(species);
  speciesRef.current = species;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  const [webglError, setWebglError] = useState(false);

  // Trigger immediate eat animation whenever parent button clicks or increments onBiteCount
  useEffect(() => {
    if (onBiteCount > 0) {
      manualChompRef.current = 1.05;
    }
  }, [onBiteCount]);

  // Swap only the 3D rig inside the pooled WebGL scene when switching characters
  useEffect(() => {
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    if (!scene || !camera) return;

    const nextKey = fish3DRigKey(species);
    camera.position.set(0, 0.015, heroCameraZ(species));
    camera.lookAt(0, 0.015, 0);

    if (rigKeyRef.current !== nextKey) {
      if (rigRef.current) {
        scene.remove(rigRef.current.root);
        rigRef.current.dispose();
        rigRef.current = null;
      }
      const nextRig = createFish3DRig(species, maxAnisoRef.current);
      scene.add(nextRig.root);
      rigRef.current = nextRig;
      rigKeyRef.current = nextKey;
    }
  }, [species]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const soft = isSoftwareWebGL();
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: !soft,
        powerPreference: "high-performance",
      });
    } catch {
      setWebglError(true);
      return;
    }

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(soft ? 1 : Math.min(window.devicePixelRatio || 1, 1.5));

    const canvas = renderer.domElement;
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.display = "block";
    canvas.style.touchAction = "none";
    container.innerHTML = "";
    container.appendChild(canvas);

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envRT.texture;
    scene.environmentIntensity = 0.24;
    pmrem.dispose();

    const hemi = new THREE.HemisphereLight(0xe4f9ff, 0x2d6bb8, 1.08);
    const key = new THREE.DirectionalLight(0xffffff, 1.02);
    key.position.set(1.5, 2.5, 3.6);
    const rim = new THREE.DirectionalLight(0x52d6ff, 0.55);
    rim.position.set(-2.0, 0.9, -2.2);
    scene.add(hemi, key, rim);

    const initSp = speciesRef.current;
    const camera = new THREE.PerspectiveCamera(31, 224 / 124, 0.1, 20);
    camera.position.set(0, 0.015, heroCameraZ(initSp));
    camera.lookAt(0, 0.015, 0);

    const maxAniso = soft ? 1 : Math.min(4, renderer.capabilities.getMaxAnisotropy());
    maxAnisoRef.current = maxAniso;
    sceneRef.current = scene;
    cameraRef.current = camera;

    const initRig = createFish3DRig(initSp, maxAniso);
    scene.add(initRig.root);
    rigRef.current = initRig;
    rigKeyRef.current = fish3DRigKey(initSp);

    if (!soft) {
      renderer.compile(scene, camera);
    }

    const syncSize = () => {
      const w = Math.max(120, container.clientWidth || 224);
      const h = Math.max(80, container.clientHeight || 124);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    };
    syncSize();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(syncSize) : null;
    ro?.observe(container);

    // Interactive drag-to-orbit + click-to-chomp state
    let dragging = false;
    let dragDist = 0;
    let lastX = 0;
    let lastY = 0;
    let targetYaw = -0.22;
    let targetPitch = 0.05;
    let curYaw = -0.22;
    let curPitch = 0.05;

    const onPointerDown = (e: PointerEvent) => {
      dragging = true;
      dragDist = 0;
      lastX = e.clientX;
      lastY = e.clientY;
      canvas.setPointerCapture?.(e.pointerId);
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      dragDist += Math.hypot(dx, dy);
      lastX = e.clientX;
      lastY = e.clientY;
      targetYaw += dx * 0.014;
      targetPitch = THREE.MathUtils.clamp(targetPitch + dy * 0.012, -0.75, 0.75);
    };
    const onPointerUp = (e: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      canvas.releasePointerCapture?.(e.pointerId);
      if (dragDist < 7) {
        manualChompRef.current = 1.05;
      }
    };

    let contextLost = false;
    const onContextLost = (e: Event) => {
      e.preventDefault();
      contextLost = true;
    };
    const onContextRestored = () => {
      contextLost = false;
    };

    if (interactive) {
      canvas.addEventListener("pointerdown", onPointerDown);
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
    }
    canvas.addEventListener("webglcontextlost", onContextLost);
    canvas.addEventListener("webglcontextrestored", onContextRestored);

    let disposed = false;
    let frameId = 0;
    let lastNow = performance.now();
    let elapsed = 0;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync ? gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0) : null;
      gl.flush();
      const poll = () => {
        if (disposed) {
          if (sync) gl.deleteSync(sync);
          return;
        }
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function tick(now = performance.now()) {
      if (disposed) return;
      if (pausedRef.current || document.hidden) {
        lastNow = now;
        if (soft) {
          frameId = window.setTimeout(() => tick(), 120);
        } else {
          frameId = requestAnimationFrame(tick);
        }
        return;
      }
      const dt = Math.min(0.05, Math.max(0.001, (now - lastNow) / 1000));
      lastNow = now;
      elapsed += dt;

      if (!dragging) {
        targetYaw = THREE.MathUtils.damp(targetYaw, -0.22 + Math.sin(elapsed * 0.9) * 0.14, 2.2, dt);
        targetPitch = THREE.MathUtils.damp(targetPitch, 0.05 + Math.cos(elapsed * 1.1) * 0.04, 2.2, dt);
      }
      curYaw = THREE.MathUtils.damp(curYaw, targetYaw, 10, dt);
      curPitch = THREE.MathUtils.damp(curPitch, targetPitch, 10, dt);

      let jaw = 0;
      let biteLunge = 0;
      let sq = 0;
      let chompPhase = 0;
      let chompBitFired = false;
      let gulpT = 0;
      let gulpK = 0;
      let expr: "normal" | "happy" | "panic" = "normal";

      if (manualChompRef.current > 0) {
        manualChompRef.current = Math.max(0, manualChompRef.current - dt);
        const u = 1 - manualChompRef.current / 1.05;
        if (u < 0.28) {
          const k = u / 0.28;
          jaw = Math.sin(k * Math.PI * 0.5) * 1.05 + Math.sin(elapsed * 26) * 0.04;
          biteLunge = -k * 0.9;
        } else if (u < 0.44) {
          const k = (u - 0.28) / 0.16;
          jaw = (1 - k * 1.25) * 1.05;
          biteLunge = -0.9 + k * 2.8;
          sq = Math.sin(k * Math.PI) * 0.24;
          chompPhase = (1 - k) * 0.13;
          chompBitFired = k > 0.45;
          if (chompBitFired) expr = "happy";
        } else if (u < 0.62) {
          const k = (u - 0.44) / 0.18;
          jaw = k < 0.4 ? (k / 0.4) * 0.62 : (1 - (k - 0.4) / 0.6) * 0.72 - 0.14;
          biteLunge = (1 - k) * 1.8;
          sq = Math.sin(k * Math.PI) * 0.16;
          expr = k > 0.45 ? "happy" : "normal";
        } else {
          const k = (u - 0.62) / 0.38;
          gulpT = 1 - k;
          gulpK = 0.95;
          jaw = -0.12 * (1 - k);
          expr = k < 0.45 ? "happy" : "normal";
        }
      } else {
        const cyc = (elapsed % 3.2) / 3.2;
        if (cyc > 0.42 && cyc < 0.58) {
          const k = (cyc - 0.42) / 0.16;
          jaw = Math.sin(k * Math.PI * 0.5) * 0.96;
          biteLunge = -k * 0.6;
        } else if (cyc >= 0.58 && cyc < 0.68) {
          const k = (cyc - 0.58) / 0.1;
          jaw = 0.96 * (1 - k * 1.18);
          biteLunge = -0.6 + k * 2.2;
          sq = Math.sin(k * Math.PI) * 0.2;
          chompPhase = (1 - k) * 0.13;
          chompBitFired = k > 0.45;
          if (chompBitFired) expr = "happy";
        } else if (cyc >= 0.68 && cyc < 0.92) {
          const k = (cyc - 0.68) / 0.24;
          gulpT = 1 - k;
          gulpK = 0.78;
          jaw = k < 0.35 ? -0.14 : 0;
          expr = k < 0.4 ? "happy" : "normal";
        }
      }

      const activeRig = rigRef.current;
      if (activeRig) {
        activeRig.root.position.y = Math.sin(elapsed * 2.5) * 0.032;
        applyFish3DPose(activeRig, {
          jaw,
          chompPhase,
          chompDur: 0.13,
          chompBitFired,
          biteLunge,
          tailPh: elapsed * 6.4,
          wag2: elapsed * 5.6,
          bend: Math.sin(elapsed * 1.4) * 0.06,
          turnFlip: 1,
          tilt: Math.sin(elapsed * 2.5 - 0.7) * 0.045,
          gulpT,
          gulpK,
          sq,
          expr,
          puff: gulpT > 0.5,
          sucking: false,
          swimSpeed: jaw > 0.2 ? 0.75 : 0.42,
          inspectYaw: curYaw,
          inspectPitch: curPitch,
        });
      }

      if (!contextLost) {
        renderer.render(scene, camera);
      }

      if (soft) {
        afterDraw(() => tick());
      } else {
        frameId = requestAnimationFrame(tick);
      }
    }

    if (soft) {
      frameId = window.setTimeout(() => tick(), 0);
    } else {
      frameId = requestAnimationFrame(tick);
    }

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      ro?.disconnect();
      if (interactive) {
        canvas.removeEventListener("pointerdown", onPointerDown);
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
      }
      canvas.removeEventListener("webglcontextlost", onContextLost);
      canvas.removeEventListener("webglcontextrestored", onContextRestored);
      if (rigRef.current) {
        rigRef.current.dispose();
        rigRef.current = null;
      }
      sceneRef.current = null;
      cameraRef.current = null;
      rigKeyRef.current = "";
      envRT.dispose();
      renderer.dispose();
    };
  }, [interactive]);

  if (webglError) {
    return (
      <div className="w-full h-full flex items-center justify-center text-xs font-bold text-cyan-100">
        Pratinjau 3D aktif saat bermain
      </div>
    );
  }

  return (
    <div
      ref={mountRef}
      aria-label={`${species.name} 3D Interaktif`}
      title={interactive ? "Seret untuk putar 3D · Klik untuk tes animasi makan" : undefined}
      className={`w-full h-full select-none ${interactive ? "cursor-grab active:cursor-grabbing" : "pointer-events-none"}`}
    />
  );
}

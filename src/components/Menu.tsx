import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SKINS, skinToSpecies } from "../game/species";
import { spritePreviewFrameSingle, coinSprite } from "../game/sprites";
import type { JawState } from "../game/sprites";
import { fish3d, isSoftwareWebGL } from "../game/fish3d";
import Fish3DViewport from "./Fish3DViewport";
import type { SaveData } from "../save";
import { UPGRADE_COSTS, MAX_UPGRADE } from "../save";
import type { Upgrades } from "../game/engine";
import { TROPHIES, isTrophyMet } from "../trophies";

interface Props {
  save: SaveData;
  setSave: (s: SaveData) => void;
  onPlay: (skinIdOverride?: string) => void;
  onOpenTrophies: () => void;
  loading?: boolean;
  loadPct?: number;
  paused?: boolean;
}

const UPGRADES: { id: keyof Upgrades; name: string; desc: string; icon: string }[] = [
  { id: "suck", name: "Sedotan Super", desc: "Jangkauan & tarikan arus sedot lebih luas.", icon: "🌀" },
  { id: "speed", name: "Sirip Turbo", desc: "Berenang & bermanuver jauh lebih lincah.", icon: "💨" },
  { id: "size", name: "Ikan Bongsor", desc: "Masuk lautan dengan ukuran awal lebih besar.", icon: "🍔" },
];

export function coinURL() {
  return coinSprite(0).toDataURL();
}

type OpaqueBox = { minX: number; minY: number; maxX: number; maxY: number };

const TILE_CANVASES_2D: Record<string, (HTMLCanvasElement | undefined)[]> = {};
const TILE_BOX_2D: Record<string, OpaqueBox> = {};
const TILE_CANVASES_3D: Record<string, (HTMLCanvasElement | undefined)[]> = {};
const CTX_CACHE = new WeakMap<HTMLCanvasElement, CanvasRenderingContext2D>();

// 4-frame swim + chomp/smile cycle for tile cards & 2D hero preview (2x faster baking, drawn at ~8.3fps)
const TILE_CYCLE: JawState[] = [0, 3, 6, -1];

const TILE_SCALE: Record<string, number> = {
  orange: 0.78,
  buntal: 0.86,
  dori: 0.92,
  pierre: 0.92,
  layla: 0.94,
  andy: 0.95,
  andy_blue: 0.95,
  boris: 0.95,
  kakatua: 0.96,
  peter: 0.96,
  eddy: 0.98,
  leon: 1.02,
  idol: 1.0,
  layaran: 1.04,
  pari: 1.06,
  hiu: 1.06,
  hiu_elegan: 1.06,
  hiu_totol: 1.06,
  orca: 1.06,
  mandarin: 1.02,
  aurora: 1.04,
  narwhal: 1.06,
  seadragon: 1.06,
  axolotl: 1.02,
  whaleshark: 1.06,
  tuna: 1.04,
  hammerhead: 1.04,
  butterfly: 0.96,
  snapper: 1.0,
  lumba: 1.04,
  lumba_pink: 1.04,
  snapturtle: 1.06,
  snapturtle_albino: 1.06,
};

function drawFishCanvas(
  cv: HTMLCanvasElement | null,
  frame: HTMLCanvasElement | undefined,
  cssW: number,
  cssH: number,
  scaleMult: number,
  maxDpr = 1.4
) {
  if (!cv || !frame) return;
  const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
  const pw = Math.round(cssW * dpr);
  const ph = Math.round(cssH * dpr);
  if (cv.width !== pw || cv.height !== ph) {
    cv.width = pw;
    cv.height = ph;
  }
  let ctx = CTX_CACHE.get(cv);
  if (!ctx) {
    const got = cv.getContext("2d");
    if (!got) return;
    CTX_CACHE.set(cv, got);
    ctx = got;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  const pad = 6;
  const fit = Math.min((cssW - pad * 2) / frame.width, (cssH - pad * 2) / frame.height) * scaleMult;
  const dw = frame.width * fit;
  const dh = frame.height * fit;

  ctx.drawImage(frame, cssW * 0.5 - dw * 0.5, cssH * 0.5 - dh * 0.5, dw, dh);
}

function CornerRivets() {
  return (
    <>
      <div className="pointer-events-none absolute top-2 left-2 w-2.5 h-2.5 rounded-full bg-[#e3ab4b] border border-[#3b1d06] shadow-sm flex items-center justify-center text-[6px] text-[#4d2808] z-20">
        ✕
      </div>
      <div className="pointer-events-none absolute top-2 right-2 w-2.5 h-2.5 rounded-full bg-[#e3ab4b] border border-[#3b1d06] shadow-sm flex items-center justify-center text-[6px] text-[#4d2808] z-20">
        ✕
      </div>
      <div className="pointer-events-none absolute bottom-2 left-2 w-2.5 h-2.5 rounded-full bg-[#e3ab4b] border border-[#3b1d06] shadow-sm flex items-center justify-center text-[6px] text-[#4d2808] z-20">
        ✕
      </div>
      <div className="pointer-events-none absolute bottom-2 right-2 w-2.5 h-2.5 rounded-full bg-[#e3ab4b] border border-[#3b1d06] shadow-sm flex items-center justify-center text-[6px] text-[#4d2808] z-20">
        ✕
      </div>
    </>
  );
}

export default function Menu({ save, setSave, onPlay, onOpenTrophies, loading = false, loadPct = 0, paused = false }: Props) {
  const softWebGL = useMemo(() => isSoftwareWebGL(), []);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [biteTrig, setBiteTrig] = useState(0);
  const [toast, setToast] = useState<{ icon: string; msg: string } | null>(null);

  const cur = useMemo(() => SKINS.find((s) => s.id === save.skin) || SKINS[0], [save.skin]);
  const activeIdx = useMemo(() => Math.max(0, SKINS.findIndex((s) => s.id === cur.id)), [cur.id]);

  const activeIdxRef = useRef(activeIdx);
  activeIdxRef.current = activeIdx;
  const mode3DRef = useRef(save.mode3D);
  mode3DRef.current = save.mode3D;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const showUpgradeRef = useRef(showUpgrade);
  showUpgradeRef.current = showUpgrade;
  const loadingRef = useRef(loading);
  loadingRef.current = loading;
  const softWebGLRef = useRef(softWebGL);
  softWebGLRef.current = softWebGL;

  const gridScrollRef = useRef<HTMLDivElement | null>(null);
  const tileRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const tileCanvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  const drawnKeysRef = useRef<(string | undefined)[]>([]);
  const heroCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastHeroCanvasElRef = useRef<HTMLCanvasElement | null>(null);
  const heroDrawnKeyRef = useRef<string | undefined>(undefined);
  const softBiteUntilRef = useRef(0);
  const toastTimerRef = useRef<number | undefined>(undefined);
  const isScrollingRef = useRef(false);
  const scrollIdleTimerRef = useRef<number | undefined>(undefined);
  const scrollTopRef = useRef(0);
  const scrollerHRef = useRef(520);
  const tileBoundsRef = useRef<{ top: number; bottom: number }[]>([]);
  const lastDrawStepRef = useRef(-1);

  const unlockedTrophyCount = useMemo(
    () => TROPHIES.filter((t) => !!save.unlockedTrophies[t.id] || isTrophyMet(t, save)).length,
    [
      save.unlockedTrophies,
      save.best,
      save.rank1Count,
      save.peakLevelCount,
      save.bestPeakTimeSec,
      save.bestCombo,
      save.bestDepth,
      save.totalRuns,
    ]
  );

  const coin = useMemo(() => coinURL(), []);
  const heroIs3D = !!(save.mode3D && cur.supports3D);
  const heroSpecies = useMemo(() => skinToSpecies(cur, heroIs3D), [cur, heroIs3D]);
  const showLiveHero3D = !loading && !softWebGL && heroIs3D && !paused;

  const showToastMsg = useCallback((icon: string, msg: string) => {
    setToast({ icon, msg });
    clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2000);
  }, []);

  const triggerTestBite = useCallback(() => {
    const activeSkin = SKINS[activeIdxRef.current];
    const usesLive3D = !loadingRef.current && !softWebGLRef.current && !!(mode3DRef.current && activeSkin?.supports3D);
    if (!usesLive3D) {
      softBiteUntilRef.current = performance.now() + 900;
    } else {
      setBiteTrig((c) => c + 1);
    }
  }, []);

  const selectSkin = useCallback(
    (skinId: string) => {
      if (save.skin === skinId) {
        triggerTestBite();
        return;
      }
      setSave({ ...save, skin: skinId });
    },
    [save, setSave, triggerTestBite]
  );

  const pickRandomSkin = useCallback(() => {
    const total = SKINS.length;
    if (total <= 1) return;
    let nextIdx = activeIdx;
    while (nextIdx === activeIdx) {
      nextIdx = Math.floor(Math.random() * total);
    }
    const chosen = SKINS[nextIdx];
    setShowUpgrade(false);
    setSave({ ...save, skin: chosen.id });
    showToastMsg("🎲", `Ikan acak: ${chosen.name}!`);
    requestAnimationFrame(() => {
      tileRefs.current[nextIdx]?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }, [activeIdx, save, setSave, showToastMsg]);

  const buyUp = (id: keyof Upgrades) => {
    const lv = save.upgrades[id];
    if (lv >= MAX_UPGRADE) return;
    const cost = UPGRADE_COSTS[lv];
    if (save.coins < cost) {
      showToastMsg("⚠️", "Koin belum cukup untuk upgrade ini!");
      return;
    }
    setSave({ ...save, coins: save.coins - cost, upgrades: { ...save.upgrades, [id]: lv + 1 } });
    const upg = UPGRADES.find((u) => u.id === id);
    showToastMsg("⚡", `${upg?.name || "Upgrade"} naik ke Lv ${lv + 1}!`);
  };

  const measureTileBounds = useCallback(() => {
    const scroller = gridScrollRef.current;
    if (!scroller) return;
    scrollTopRef.current = scroller.scrollTop;
    scrollerHRef.current = scroller.clientHeight || 520;
    const bounds: { top: number; bottom: number }[] = new Array(SKINS.length);
    for (let i = 0; i < SKINS.length; i++) {
      const btn = tileRefs.current[i];
      if (btn) {
        const top = btn.offsetTop;
        bounds[i] = { top, bottom: top + btn.offsetHeight };
      }
    }
    tileBoundsRef.current = bounds;
    lastDrawStepRef.current = -1;
  }, []);

  // Re-measure cached tile bounds when returning from Upgrade tab or resizing
  useEffect(() => {
    if (showUpgrade) return;
    const scroller = gridScrollRef.current;
    if (!scroller) return;
    measureTileBounds();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measureTileBounds) : null;
    ro?.observe(scroller);
    drawnKeysRef.current = [];
    return () => ro?.disconnect();
  }, [showUpgrade, measureTileBounds]);

  useEffect(() => {
    lastDrawStepRef.current = -1;
  }, [save.mode3D, save.skin]);

  // Incremental 1-frame budgeted baking & zero-layout-thrash viewport-culled tile animation loop
  useEffect(() => {
    let alive = true;
    let raf = 0;

    const buildOne2DFrame = (s: (typeof SKINS)[number], fi: number) => {
      let arr = TILE_CANVASES_2D[s.id];
      if (!arr) {
        arr = new Array<HTMLCanvasElement | undefined>(TILE_CYCLE.length);
        TILE_CANVASES_2D[s.id] = arr;
      }
      if (arr[fi]) return false;
      const box = TILE_BOX_2D[s.id];
      const res = spritePreviewFrameSingle(skinToSpecies(s, false), 144, TILE_CYCLE[fi], fi, box);
      if (!TILE_BOX_2D[s.id]) TILE_BOX_2D[s.id] = res.box;
      arr[fi] = res.canvas;
      return true;
    };

    const buildOne3DFrame = (s: (typeof SKINS)[number], fi: number) => {
      let arr = TILE_CANVASES_3D[s.id];
      if (!arr) {
        arr = new Array<HTMLCanvasElement | undefined>(TILE_CYCLE.length);
        TILE_CANVASES_3D[s.id] = arr;
      }
      if (arr[fi]) return false;
      const j = TILE_CYCLE[fi];
      const ph = (fi / TILE_CYCLE.length) * Math.PI * 2;
      const jawVal = j > 0 ? j / 6 : j < 0 ? -0.18 : 0;
      arr[fi] = fish3d.renderSnapshot(
        skinToSpecies(s, true),
        {
          jaw: jawVal,
          chompPhase: j === -1 ? 0.08 : 0,
          chompDur: 0.13,
          chompBitFired: j === -1,
          biteLunge: j === -1 ? 1.6 : j >= 5 ? -0.5 : 0,
          tailPh: ph * 2,
          wag2: ph * 2,
          bend: Math.sin(ph) * 0.05,
          turnFlip: 1,
          tilt: Math.sin(ph) * 0.04,
          gulpT: j === -1 ? 0.65 : 0,
          gulpK: 0.65,
          sq: j === -1 ? 0.14 : 0,
          expr: j === -1 ? "happy" : "normal",
          puff: j === -1,
          sucking: false,
          swimSpeed: 0.55,
          inspectYaw: -0.16,
          inspectPitch: 0.04,
        },
        160,
        96
      );
      return true;
    };

    const tick = (now: number) => {
      if (!alive) return;
      if (document.hidden || pausedRef.current) {
        raf = requestAnimationFrame(tick);
        return;
      }

      // Never fight active scroll inertia with baking or canvas redraws
      if (isScrollingRef.current) {
        raf = requestAnimationFrame(tick);
        return;
      }

      const useMode3D = mode3DRef.current;
      const useSoft = softWebGLRef.current;
      const inUpgrade = showUpgradeRef.current;
      const activeIndex = activeIdxRef.current;

      // Pure numeric viewport visibility check (zero DOM offsetTop/offsetHeight queries inside rAF!)
      const visibleIndices: number[] = [];
      if (!inUpgrade) {
        const viewTop = scrollTopRef.current - 150;
        const viewBottom = scrollTopRef.current + scrollerHRef.current + 150;
        const bounds = tileBoundsRef.current;
        for (let i = 0; i < SKINS.length; i++) {
          const b = bounds[i];
          if (!b) continue;
          if (b.bottom >= viewTop && b.top <= viewBottom) {
            visibleIndices.push(i);
          }
        }
      }

      const bakeOrder = visibleIndices.includes(activeIndex)
        ? visibleIndices
        : [activeIndex, ...visibleIndices];

      let bakedAny = false;
      const isLoading = loadingRef.current;

      // Strict budget: while the ocean is generating, skip 3D WebGL tile bakes so the reef builder
      // gets full WebGL/CPU bandwidth; bake crisp 2D preview tiles (up to 2/frame) as fast placeholders.
      let bakedCount = 0;
      const max2DBakes = 2;
      for (const idx of bakeOrder) {
        const s = SKINS[idx];
        const want3D = !isLoading && !!(useMode3D && s.supports3D);
        if (want3D) {
          if (!TILE_CANVASES_3D[s.id]?.[0]) {
            buildOne3DFrame(s, 0);
            bakedAny = true;
            bakedCount = 99;
            break;
          }
        } else if (!TILE_CANVASES_2D[s.id]?.[0]) {
          buildOne2DFrame(s, 0);
          bakedAny = true;
          bakedCount++;
          if (bakedCount >= max2DBakes) break;
        }
      }

      // Pass 2: Remaining swim frames (1..3) baked strictly 1 at a time after loading completes
      if (!bakedAny && !isLoading) {
        outer: for (const idx of bakeOrder) {
          const s = SKINS[idx];
          const want3D = !!(useMode3D && s.supports3D);
          if (want3D) {
            const arr = TILE_CANVASES_3D[s.id];
            for (let fi = 1; fi < TILE_CYCLE.length; fi++) {
              if (!arr || !arr[fi]) {
                buildOne3DFrame(s, fi);
                bakedAny = true;
                break outer;
              }
            }
          } else {
            const arr = TILE_CANVASES_2D[s.id];
            for (let fi = 1; fi < TILE_CYCLE.length; fi++) {
              if (!arr || !arr[fi]) {
                buildOne2DFrame(s, fi);
                bakedAny = true;
                break outer;
              }
            }
          }
        }
      }

      const baseStep = Math.floor(now / 135);
      const isBiting = now < softBiteUntilRef.current;
      const shouldDraw = bakedAny || isBiting || baseStep !== lastDrawStepRef.current;

      if (shouldDraw) {
        lastDrawStepRef.current = baseStep;

        // Left Panel Hero Porthole 2D / softWebGL / loading-fallback canvas
        const heroSkin = SKINS[activeIndex];
        const heroUses3D = !!(useMode3D && heroSkin.supports3D);
        if (isLoading || useSoft || !heroUses3D) {
          const hcv = heroCanvasRef.current;
          if (hcv !== lastHeroCanvasElRef.current) {
            lastHeroCanvasElRef.current = hcv;
            heroDrawnKeyRef.current = undefined;
          }
          const hHas3D = heroUses3D && !!TILE_CANVASES_3D[heroSkin.id]?.[0];
          const hFrames = hHas3D ? TILE_CANVASES_3D[heroSkin.id] : TILE_CANVASES_2D[heroSkin.id];
          if (hcv && hFrames) {
            let hfIdx = 0;
            if (isBiting) {
              const biteSeq = [1, 2, 3, 0];
              hfIdx = biteSeq[Math.floor(now / 95) % biteSeq.length];
            } else {
              hfIdx = baseStep % hFrames.length;
            }
            const hFrame = hFrames[hfIdx] || hFrames[0];
            if (hFrame) {
              const actualHf = hFrame === hFrames[0] && !hFrames[hfIdx] ? 0 : hfIdx;
              const hKey = `${heroSkin.id}|${hHas3D ? 1 : 0}|${actualHf}`;
              if (heroDrawnKeyRef.current !== hKey) {
                heroDrawnKeyRef.current = hKey;
                drawFishCanvas(hcv, hFrame, 240, 150, (TILE_SCALE[heroSkin.id] ?? 1) * (hHas3D ? 0.96 : 1), 1.5);
              }
            }
          }
        }

        // Draw ONLY visible tiles in Right Panel Grid
        if (!inUpgrade) {
          for (const idx of visibleIndices) {
            const s = SKINS[idx];
            const cv = tileCanvasRefs.current[idx];
            if (!cv) continue;
            const use3DTile = !!(useMode3D && s.supports3D);
            const has3D = use3DTile && !!TILE_CANVASES_3D[s.id]?.[0];
            const frames = has3D ? TILE_CANVASES_3D[s.id] : TILE_CANVASES_2D[s.id];
            if (!frames) continue;

            let fIdx = 0;
            if (isBiting && idx === activeIndex) {
              const biteSeq = [1, 2, 3, 0];
              fIdx = biteSeq[Math.floor(now / 95) % biteSeq.length];
            } else {
              fIdx = (baseStep + idx) % frames.length;
            }
            const frame = frames[fIdx] || frames[0];
            if (!frame) continue;

            const actualIdx = frame === frames[0] && !frames[fIdx] ? 0 : fIdx;
            const drawKey = `${s.id}|${has3D ? 1 : 0}|${actualIdx}`;
            if (drawnKeysRef.current[idx] !== drawKey) {
              drawnKeysRef.current[idx] = drawKey;
              drawFishCanvas(cv, frame, 132, 74, (TILE_SCALE[s.id] ?? 1) * (has3D ? 0.94 : 1), 1.3);
            }
          }
        }
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      clearTimeout(toastTimerRef.current);
      clearTimeout(scrollIdleTimerRef.current);
    };
  }, []);

  const handleGridScroll = () => {
    const scroller = gridScrollRef.current;
    if (scroller) scrollTopRef.current = scroller.scrollTop;
    isScrollingRef.current = true;
    clearTimeout(scrollIdleTimerRef.current);
    scrollIdleTimerRef.current = window.setTimeout(() => {
      isScrollingRef.current = false;
      lastDrawStepRef.current = -1;
    }, 100);
  };

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center p-2 sm:p-3.5 overflow-hidden select-none pointer-events-none">
      {/* Dual Carved Wooden Arcade Shell (Original 2-Panel Layout, Zero Bottom Cropping) */}
      <div className="pointer-events-auto w-full max-w-[1220px] h-full max-h-[705px] grid grid-cols-1 lg:grid-cols-[380px_1fr] xl:grid-cols-[412px_1fr] gap-2.5 sm:gap-3.5 min-h-0 overflow-y-auto lg:overflow-hidden">
        {/* ================= LEFT WOODEN PANEL: LOGO, HERO PORTHOLE & PLAY ================= */}
        <section
          aria-label="Panel Pemain & Pratinjau Ikan"
          className="artistic-wood-board relative p-3.5 sm:p-4 flex flex-col justify-between gap-2 min-h-0 lg:h-full overflow-hidden"
        >
          <CornerRivets />

          {/* 1. Classic Animated Feeding Frenzy Wordmark */}
          <header className="relative z-10 flex flex-col items-center text-center pt-0.5 shrink-0">
            <div className="flex items-center justify-center gap-1.5">
              {/* Mascot Clownfish */}
              <svg className="mascot-wiggle w-8 h-8 sm:w-9 sm:h-9 shrink-0 drop-shadow-[0_3px_4px_rgba(0,0,0,0.65)]" viewBox="0 0 64 64" fill="none" aria-hidden="true">
                <path d="M14 32C14 21 25 14 38 16C46 17 52 24 54 32C52 40 46 47 38 48C25 50 14 43 14 32Z" fill="#FF6B1A" stroke="#231004" strokeWidth="2.5" />
                <path d="M27 15.5C29 22 29 42 27 48.5C30 48.8 33 48.5 35 48C37 41 37 23 35 16C33 15.5 30 15.2 27 15.5Z" fill="#FFFFFF" />
                <path d="M41 17.5C42.5 23 42.5 41 41 46.5C43 45.8 45 44.5 46.5 43C47.5 37 47.5 27 46.5 21C45 19.5 43 18.2 41 17.5Z" fill="#FFFFFF" />
                <path d="M15 32L5 22V42L15 32Z" fill="#FF6B1A" stroke="#231004" strokeWidth="2.5" strokeLinejoin="round" />
                <circle cx="46" cy="28" r="3.2" fill="#0F172A" />
                <circle cx="47" cy="27" r="1.1" fill="#FFFFFF" />
              </svg>

              <h1 className="font-display text-[36px] sm:text-[42px] font-extrabold leading-none tracking-tight flex items-baseline">
                <span className="fish-word-gold">
                  {["F", "i", "s", "h"].map((ch, i) => (
                    <span key={i} className="fish-letter" style={{ animationDelay: `${i * 0.14}s` }}>
                      {ch}
                    </span>
                  ))}
                </span>
                <span className="fish-word-io">
                  {[".", "i", "o"].map((ch, i) => (
                    <span key={i} className="fish-letter" style={{ animationDelay: `${(i + 4) * 0.14}s` }}>
                      {ch}
                    </span>
                  ))}
                </span>
              </h1>
            </div>

            <div className="text-[10px] font-extrabold tracking-[0.2em] uppercase text-amber-200/90 text-outline mt-0.5">
              ⚓ LAUTAN BERLAPIS · FEEDING FRENZY
            </div>

            {save.equippedTitle && (
              <div className="mt-1 px-2.5 py-0.5 rounded-md ff-carved-slot text-[11px] font-extrabold text-yellow-300 truncate max-w-full">
                👑 Julukan: « {save.equippedTitle} »
              </div>
            )}
          </header>

          {/* 2. Deep Lagoon Porthole showcasing Active Fish */}
          <div
            onClick={() => {
              if (!showLiveHero3D) triggerTestBite();
            }}
            className="wood-lagoon-porthole relative w-full flex-1 min-h-[140px] max-h-[205px] overflow-hidden flex items-center justify-center"
          >
            {/* Sunburst halo */}
            <div
              className="sun-halo-spin pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-56 h-56 rounded-full opacity-40"
              style={{
                background: "repeating-conic-gradient(from 0deg, rgba(186, 230, 253, 0.24) 0deg 10deg, transparent 10deg 26deg)",
                WebkitMaskImage: "radial-gradient(circle, black 16%, transparent 68%)",
                maskImage: "radial-gradient(circle, black 16%, transparent 68%)",
              }}
              aria-hidden="true"
            />

            {/* Swaying corner kelp silhouettes inside porthole */}
            <svg viewBox="0 0 60 80" className="coral-sway pointer-events-none absolute -bottom-1 left-2 w-10 h-14 opacity-50" aria-hidden="true">
              <path d="M18,80 C14,60 28,48 20,26 C26,38 30,52 25,80 Z" fill="#0d9488" />
              <path d="M32,80 C34,62 44,52 40,34 C46,48 44,64 38,80 Z" fill="#14b8a6" />
            </svg>
            <svg viewBox="0 0 60 80" className="coral-sway-r pointer-events-none absolute -bottom-1 right-2 w-10 h-14 opacity-50" aria-hidden="true">
              <path d="M40,80 C44,60 30,48 38,26 C32,38 28,52 33,80 Z" fill="#f97316" />
              <path d="M26,80 C24,62 14,52 18,34 C12,48 14,64 20,80 Z" fill="#fb923c" />
            </svg>

            {/* Floating subtle bubbles */}
            <span className="float-bubble-a pointer-events-none absolute left-7 bottom-6 w-2.5 h-2.5 rounded-full border border-cyan-100/70 bg-cyan-200/20" aria-hidden="true" />
            <span className="float-bubble-b pointer-events-none absolute right-8 bottom-8 w-2 h-2 rounded-full border border-cyan-100/65 bg-cyan-200/20" aria-hidden="true" />

            {/* Top Badges */}
            <div className="pointer-events-none absolute top-2 left-2.5 right-2.5 z-20 flex items-center justify-between gap-1.5">
              {cur.rare ? (
                <span className="badge-langka px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wider text-white border border-amber-200/40">
                  ★ LANGKA
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-md bg-slate-950/55 border border-cyan-300/30 text-[10px] font-bold uppercase tracking-wider text-cyan-100">
                  UMUM
                </span>
              )}

              {cur.supports3D && (
                <span
                  className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wider border ${
                    save.mode3D
                      ? "bg-cyan-400 text-[#052038] border-white/60 shadow-sm"
                      : "bg-slate-950/60 text-cyan-200 border-cyan-300/35"
                  }`}
                >
                  {save.mode3D ? "3D LIVE" : "2D KLASIK"}
                </span>
              )}
            </div>

            {/* Single Persistent 3D Hero Viewport OR Animated 2D Canvas */}
            {showLiveHero3D ? (
              <div className="relative z-10 w-full h-full">
                <Fish3DViewport species={heroSpecies} onBiteCount={biteTrig} paused={paused} interactive={true} />
              </div>
            ) : (
              <div className="relative z-10 bob w-[240px] h-[150px] flex items-center justify-center cursor-pointer">
                <canvas
                  ref={heroCanvasRef}
                  aria-label={cur.name}
                  className="w-[240px] h-[150px] block drop-shadow-[0_10px_14px_rgba(0,0,0,0.6)]"
                />
              </div>
            )}

            {/* Subtle interaction hint inside porthole bottom */}
            <div className="pointer-events-none absolute bottom-1.5 inset-x-0 text-center z-20">
              <span className="text-[9.5px] font-bold text-cyan-100/75 text-outline">
                {showLiveHero3D ? "Seret untuk putar 3D · Klik untuk tes gigit" : "Klik ikan untuk tes animasi makan"}
              </span>
            </div>
          </div>

          {/* 3. Active Fish Nameplate + Quick Mode Toggles */}
          <div className="relative z-10 flex flex-col gap-1.5 shrink-0">
            <div className="artistic-inset px-3 py-1.5 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[17px] sm:text-[19px] font-extrabold text-amber-100 text-outline leading-tight truncate">
                  {cur.name}
                </div>
                <div className="text-[11px] font-semibold text-cyan-200/95 truncate">{cur.subtitle}</div>
              </div>
              <button
                type="button"
                onClick={triggerTestBite}
                className="ui-btn px-2.5 py-1 text-[11px] text-white shrink-0 whitespace-nowrap"
                style={{ background: "linear-gradient(180deg, #06b6d4 0%, #0369a1 100%)" }}
                title="Lihat animasi gigitan ikan"
              >
                🍖 Tes Makan
              </button>
            </div>

            {/* Compact 2D/3D Fish + Reef 3D/2D Toggles */}
            <div className="flex items-center justify-between gap-1.5 flex-wrap">
              {cur.supports3D && (
                <div className="ff-carved-slot p-0.5 flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => setSave({ ...save, mode3D: false })}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-extrabold cursor-pointer transition-colors whitespace-nowrap ${
                      !save.mode3D ? "bg-amber-400 text-[#231004] shadow-sm" : "text-amber-100/75 hover:text-white"
                    }`}
                  >
                    Ikan 2D
                  </button>
                  <button
                    type="button"
                    onClick={() => setSave({ ...save, mode3D: true })}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-extrabold cursor-pointer transition-colors whitespace-nowrap ${
                      save.mode3D ? "bg-cyan-300 text-[#052038] shadow-sm" : "text-amber-100/75 hover:text-white"
                    }`}
                  >
                    Ikan 3D
                  </button>
                </div>
              )}

              <div className="ff-carved-slot p-0.5 flex items-center gap-0.5 ml-auto">
                <span className="text-[10.5px] font-bold text-amber-200/80 pl-1.5 pr-1">🪸 Karang:</span>
                <button
                  type="button"
                  onClick={() => setSave({ ...save, reef3D: true })}
                  className={`px-2 py-1 rounded-md text-[11px] font-extrabold cursor-pointer transition-colors ${
                    save.reef3D ? "bg-cyan-300 text-[#052038] shadow-sm" : "text-amber-100/75 hover:text-white"
                  }`}
                >
                  3D
                </button>
                <button
                  type="button"
                  onClick={() => setSave({ ...save, reef3D: false })}
                  className={`px-2 py-1 rounded-md text-[11px] font-extrabold cursor-pointer transition-colors ${
                    !save.reef3D ? "bg-amber-400 text-[#231004] shadow-sm" : "text-amber-100/75 hover:text-white"
                  }`}
                >
                  2D
                </button>
              </div>
            </div>
          </div>

          {/* 4. Name Input + Speed Selector */}
          <div className="relative z-10 flex flex-col gap-1.5 shrink-0">
            <div className="ff-carved-slot px-3 py-1.5 flex items-center gap-2 focus-within:border-amber-300/70">
              <span className="text-xs" aria-hidden="true">
                🏷️
              </span>
              <input
                type="text"
                value={save.name}
                maxLength={14}
                onChange={(e) => setSave({ ...save, name: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onPlay(cur.id);
                }}
                placeholder="Nama ikanmu..."
                aria-label="Nama ikan"
                className="bg-transparent border-none outline-none text-amber-50 font-extrabold text-[13.5px] w-full placeholder-amber-200/45"
              />
            </div>

            <div className="ff-carved-slot px-2.5 py-1 flex items-center justify-between gap-1.5">
              <span className="text-[11px] font-extrabold text-amber-200/90 flex items-center gap-1 shrink-0">
                <span aria-hidden="true">⚡</span>
                <span>Kecepatan</span>
              </span>
              <div className="flex items-center gap-1">
                {[0.8, 1.0, 1.3, 1.6].map((val) => {
                  const active = Math.abs(save.speedPref - val) < 0.05;
                  return (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setSave({ ...save, speedPref: val })}
                      className={`px-2 py-0.5 rounded-md text-[11px] font-extrabold cursor-pointer transition-colors tabular-nums ${
                        active ? "bg-amber-400 text-[#231004] shadow-sm" : "text-amber-100/75 hover:text-white"
                      }`}
                    >
                      {val.toFixed(1)}x
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 5. Primary Carved Emerald Play Button */}
          <button
            type="button"
            onClick={() => onPlay(cur.id)}
            className={`ui-btn ui-sheen ${loading ? "" : "play-btn-pulse"} relative overflow-hidden w-full py-2.5 sm:py-3 text-[17px] sm:text-[18.5px] text-white tracking-wide flex items-center justify-center gap-2 shrink-0`}
            style={{
              background: loading
                ? "linear-gradient(180deg, #3c785c 0%, #244f3c 100%)"
                : "linear-gradient(180deg, #4be880 0%, #1ba248 100%)",
            }}
          >
            {loading && (
              <span
                className="absolute inset-y-0 left-0 bg-emerald-400/55 transition-all duration-150"
                style={{ width: `${Math.round(loadPct * 100)}%` }}
              />
            )}
            <svg className="relative w-5 h-5 fill-current shrink-0 drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M8 5v14l11-7z" />
            </svg>
            <span className="relative drop-shadow-[0_2px_2px_rgba(0,0,0,0.65)]">
              {loading
                ? `${
                    loadPct < 0.22
                      ? "MENUMBUHKAN KARANG…"
                      : loadPct < 0.49
                        ? "MEMAHAT DUNIA LAUT…"
                        : loadPct < 0.88
                          ? "MENATA TERUMBU & GUA…"
                          : loadPct < 0.99
                            ? "MENYIAPKAN DASAR LAUT…"
                            : "MELEPAS IKAN…"
                  } ${Math.round(loadPct * 100)}%`
                : "MAIN SEKARANG!"}
            </span>
          </button>

          {/* 6. Compact Footer Legend & Highscore */}
          <div className="relative z-10 flex items-center justify-between gap-2 text-[10.5px] font-bold text-amber-100/85 pt-0.5 shrink-0">
            <span className="truncate">🖱️ Kursor · Kiri: Sedot · Kanan: Boost</span>
            <span className="shrink-0 tabular-nums text-yellow-300">
              🏆 {save.best > 0 ? save.best.toLocaleString("en-US") : "Rekor: 0"}
            </span>
          </div>
        </section>

        {/* ================= RIGHT WOODEN PANEL: TABS, 4-COLUMN WOODEN FISH ETALASE & UPGRADES ================= */}
        <section
          aria-label="Etalase Pilihan Ikan & Upgrade"
          className="artistic-wood-board relative p-3.5 sm:p-4 flex flex-col gap-2.5 min-h-[420px] lg:min-h-0 lg:h-full overflow-hidden"
        >
          <CornerRivets />

          {/* 1. Classic Top Wooden Tab Bar + Acak Ikan + Coin Counter */}
          <header className="relative z-10 flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-amber-200/15 shrink-0">
            <nav className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => setShowUpgrade(false)}
                className="ui-btn px-3 py-1.5 min-h-[36px] text-[12px] sm:text-[13px] text-white flex items-center gap-1.5 whitespace-nowrap"
                style={{
                  background: !showUpgrade ? "linear-gradient(180deg, #ff9938 0%, #d95b12 100%)" : "#4d2c14",
                }}
              >
                <span aria-hidden="true">🐠</span>
                <span>IKAN FRENZY ({SKINS.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setShowUpgrade(true)}
                className="ui-btn px-3 py-1.5 min-h-[36px] text-[12px] sm:text-[13px] text-white flex items-center gap-1.5 whitespace-nowrap"
                style={{
                  background: showUpgrade ? "linear-gradient(180deg, #ff9938 0%, #d95b12 100%)" : "#4d2c14",
                }}
              >
                <span aria-hidden="true">⚡</span>
                <span>UPGRADE</span>
              </button>

              <button
                type="button"
                onClick={onOpenTrophies}
                className="ui-btn px-3 py-1.5 min-h-[36px] text-[12px] sm:text-[13px] text-amber-100 flex items-center gap-1.5 whitespace-nowrap"
                style={{ background: "linear-gradient(180deg, #6d3d19 0%, #48270e 100%)" }}
              >
                <span aria-hidden="true">🏅</span>
                <span>
                  PIAGAM{" "}
                  <span className="text-yellow-300 tabular-nums">
                    ({unlockedTrophyCount}/{TROPHIES.length})
                  </span>
                </span>
              </button>
            </nav>

            <div className="flex items-center gap-2 ml-auto">
              <button
                type="button"
                onClick={pickRandomSkin}
                title="Pilih Ikan Acak"
                className="ui-btn px-3 py-1.5 min-h-[36px] text-[12px] sm:text-[13px] text-white flex items-center gap-1.5 whitespace-nowrap"
                style={{ background: "linear-gradient(180deg, #3292bc 0%, #1a587a 100%)" }}
              >
                <span aria-hidden="true">🎲</span>
                <span>Acak ikan</span>
              </button>

              <div className="ff-carved-slot px-3 h-[36px] flex items-center gap-1.5 shrink-0" title="Koin Milikmu">
                <img src={coin} className="w-5 h-5 shrink-0" alt="Koin" />
                <span className="font-extrabold text-[15px] text-yellow-300 tabular-nums leading-none">
                  {save.coins.toLocaleString("en-US")}
                </span>
              </div>
            </div>
          </header>

          {/* 2. Original 4-Column Scrollable Wooden Etalase Grid (Full Height, Zero Bottom Crop!) */}
          {!showUpgrade ? (
            <div
              ref={gridScrollRef}
              onScroll={handleGridScroll}
              className="relative z-10 flex-1 min-h-0 overflow-y-auto wood-scroll pr-1.5 pb-1"
            >
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
                {SKINS.map((s, idx) => {
                  const isActive = s.id === cur.id;
                  const tileClass = isActive
                    ? "wood-fish-tile-active"
                    : s.rare
                      ? "wood-fish-tile wood-fish-tile-rare"
                      : "wood-fish-tile";
                  const windowClass = s.rare
                    ? "etalase-lagoon-window etalase-lagoon-window-rare"
                    : "etalase-lagoon-window";

                  return (
                    <button
                      key={s.id}
                      type="button"
                      ref={(el) => {
                        tileRefs.current[idx] = el;
                      }}
                      onClick={() => selectSkin(s.id)}
                      className={`${tileClass} p-2 flex flex-col justify-between gap-1.5 text-center`}
                    >
                      <div className={`${windowClass} relative w-full h-[78px] overflow-hidden flex items-center justify-center`}>
                        {s.rare && (
                          <span className="badge-langka absolute top-1 left-1 z-10 px-1.5 py-0.5 rounded text-[8.5px] font-extrabold uppercase tracking-wider text-white">
                            ★ LANGKA
                          </span>
                        )}
                        {s.supports3D && (
                          <span
                            className={`absolute top-1 right-1 z-10 px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase ${
                              save.mode3D
                                ? "bg-cyan-400 text-[#052038]"
                                : "bg-slate-950/65 text-cyan-200 border border-cyan-300/35"
                            }`}
                          >
                            3D
                          </span>
                        )}
                        <canvas
                          ref={(el) => {
                            tileCanvasRefs.current[idx] = el;
                          }}
                          aria-label={s.name}
                          className="w-[132px] h-[74px] object-contain block pointer-events-none"
                        />
                      </div>

                      <div className="px-0.5">
                        <div
                          className={`text-[13.5px] font-extrabold leading-tight truncate ${
                            isActive ? "text-[#2b1405]" : "text-amber-50"
                          }`}
                        >
                          {s.name}
                        </div>
                        <div
                          className={`text-[10.5px] font-bold truncate mt-0.5 ${
                            isActive ? "text-[#5c2c0a]" : "text-cyan-200/90"
                          }`}
                        >
                          {s.subtitle}
                        </div>
                      </div>

                      <div
                        className={`h-[24px] rounded-lg flex items-center justify-center text-[10.5px] font-extrabold tracking-wide ${
                          isActive
                            ? "bg-[#241105] text-yellow-300 border border-[#613412]"
                            : "bg-black/40 text-amber-300 border border-amber-200/15"
                        }`}
                      >
                        {isActive ? "✓ DIPAKAI" : "PAKAI"}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            /* TAB 2: CARVED WOODEN UPGRADE WORKSHOP */
            <div className="relative z-10 flex-1 min-h-0 flex flex-col gap-2.5 overflow-y-auto wood-scroll pr-1">
              <div className="artistic-inset px-3.5 py-2 flex items-center justify-between gap-2 shrink-0">
                <div>
                  <div className="text-[14px] font-extrabold text-amber-100">Bengkel Kemampuan Ikan</div>
                  <div className="text-[11px] font-medium text-amber-200/75">
                    Tingkatkan kekuatan sedotan, kecepatan sirip & ukuran awal permanen!
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowUpgrade(false)}
                  className="ui-btn px-3 py-1 text-[11.5px] text-amber-100 shrink-0"
                  style={{ background: "linear-gradient(180deg, #8c5b2f 0%, #5c3614 100%)" }}
                >
                  ← Ke Etalase
                </button>
              </div>

              <div className="flex flex-col gap-2.5">
                {UPGRADES.map((u) => {
                  const lv = save.upgrades[u.id];
                  const max = lv >= MAX_UPGRADE;
                  const cost = max ? 0 : UPGRADE_COSTS[lv];
                  const canBuy = !max && save.coins >= cost;
                  const pct = Math.round((lv / MAX_UPGRADE) * 100);
                  return (
                    <div
                      key={u.id}
                      className="artistic-inset p-3 sm:p-3.5 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="ff-carved-slot w-12 h-12 flex items-center justify-center text-2xl shrink-0">
                          {u.icon}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[15px] font-extrabold text-white">{u.name}</span>
                            <span className="px-2 py-0.5 rounded-md bg-cyan-950/90 border border-cyan-400/40 text-[11px] font-extrabold text-cyan-200 tabular-nums">
                              Lv {lv}/{MAX_UPGRADE}
                            </span>
                          </div>
                          <p className="text-[11.5px] text-amber-100/80 mt-0.5">{u.desc}</p>
                          <div className="ff-bar-slot h-3 mt-2 overflow-hidden relative">
                            <div
                              className="ff-yellow-fill h-full transition-all duration-200"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => buyUp(u.id)}
                        disabled={!canBuy}
                        className="ui-btn px-3.5 py-2 min-w-[104px] text-[12.5px] text-white shrink-0 flex items-center justify-center gap-1.5 disabled:opacity-45 disabled:cursor-not-allowed tabular-nums"
                        style={{
                          background: max
                            ? "linear-gradient(180deg, #10b981 0%, #047857 100%)"
                            : canBuy
                              ? "linear-gradient(180deg, #ffb422 0%, #d97706 100%)"
                              : "#3f240f",
                        }}
                      >
                        {max ? (
                          <span>✓ MAKSIMAL</span>
                        ) : (
                          <>
                            <img src={coin} className="w-4 h-4 shrink-0" alt="" />
                            <span className="text-[#231004] font-black">{cost}</span>
                          </>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      </div>

      {/* TOAST NOTIFICATION */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
          <div className="artistic-wood-board px-4 py-2 flex items-center gap-2 text-xs sm:text-sm font-extrabold text-amber-50 shadow-2xl">
            <span aria-hidden="true">{toast.icon}</span>
            <span>{toast.msg}</span>
          </div>
        </div>
      )}
    </div>
  );
}
